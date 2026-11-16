const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const ChatSession = require('../models/ChatSession');

// ─── Config validation (logged once at startup, never returned to client) ──────
const AI_PROVIDER    = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
const AI_API_KEY     = process.env.AI_API_KEY || '';
const AI_MAX_TOKENS  = parseInt(process.env.AI_MAX_TOKENS  || '8192', 10);
const AI_TEMPERATURE = parseFloat(process.env.AI_TEMPERATURE || '0.7');
// Upgrade deprecated model names; default to gemini-2.5-flash
const DEPRECATED_MODELS = ['gemini-1.5-flash', 'gemini-1.5-pro', 'gemini-pro', 'gemini-1.0-pro'];
const AI_MODEL = DEPRECATED_MODELS.includes(process.env.AI_MODEL)
  ? 'gemini-2.5-flash'
  : (process.env.AI_MODEL || 'gemini-2.5-flash');
const MESSAGE_MAX_LENGTH = 4000;

/**
 * Returns true if the key looks like a real API key (non-empty, non-placeholder,
 * reasonable length). Format checking is intentionally lenient — the provider's
 * own API will return a clear error if the key is actually invalid, which is
 * surfaced to the user as a proper error message rather than silent demo mode.
 */
function isValidKeyFormat(provider, key) {
  if (!key || typeof key !== 'string' || key.trim() === '') return false;
  const k = key.trim();
  // Reject known placeholder strings
  const placeholders = [
    'your_ai_api_key_here', 'your_openai_key_here', 'your_gemini_key_here',
    'your_anthropic_key_here', 'YOUR_API_KEY', 'API_KEY_HERE',
  ];
  if (placeholders.some(p => k.toLowerCase() === p.toLowerCase())) return false;
  // Accept any key that is at least 20 characters
  return k.length >= 20;
}

const DEMO_PLACEHOLDER_KEYS = ['', 'your_ai_api_key_here', 'your_openai_key_here', 'your_gemini_key_here'];
const _isPlaceholder = DEMO_PLACEHOLDER_KEYS.includes(AI_API_KEY.trim());
const _isKeyValid    = isValidKeyFormat(AI_PROVIDER, AI_API_KEY);
const isDemoMode     = _isPlaceholder || !_isKeyValid;

// ─── Startup diagnostics (no credentials emitted) ────────────────────────────
if (_isPlaceholder) {
  console.log('[AI Tutor] No API key configured — running in DEMO mode.');
  console.log('[AI Tutor] Add a valid AI_API_KEY to backend/.env to enable real AI responses.');
} else if (!_isKeyValid) {
  console.warn('[AI Tutor] AI_API_KEY appears to be a placeholder — running in DEMO mode.');
} else {
  console.log(`[AI Tutor] Provider: ${AI_PROVIDER} | Model: ${AI_MODEL} | Mode: LIVE (key loaded)`);
}

// ─── System prompt builder (regular chat) ────────────────────────────────────
function buildSystemPrompt(session) {
  const examName = session?.context?.exam?.name;
  const examLine = examName
    ? `The student is preparing for **${examName}**. Prioritise topics, formats, and difficulty relevant to that exam.`
    : 'The student has not specified a target exam. Tutor broadly for competitive exams in India (SSC, Banking, UPSC, etc.).';

  return `You are an expert AI tutor for competitive exam preparation in India.
${examLine}

## How to respond
- Answer the actual question asked. Do NOT turn every request into a multiple-choice question.
- For **conceptual / formula questions**: give the direct answer, state the formula clearly, show one worked example, add an exam tip if useful.
- For **"why was I wrong" questions**: use any context in the conversation; explain the mistake precisely.
- For **ambiguous questions** (e.g. "What is the formula?" with no prior context): ask a one-line clarification.
- For **programming / technical questions**: give the concept, correct syntax, a well-indented code example in a fenced code block, and common mistakes.
- If the student asks for a "practice question" or "MCQ", reply with ONLY this exact sentence: "Generating your practice question…" — the question will be shown automatically.

## Strict formatting rules (ALWAYS follow these)
- Use ONLY standard Markdown: # headings, **bold**, *italic*, - bullet lists, 1. numbered lists, fenced code blocks with a language tag (e.g. \`\`\`java ... \`\`\`), and inline code.
- NEVER output HTML tags of any kind — no <details>, <summary>, <div>, <span>, <br>, or any other HTML element.
- NEVER use LaTeX math notation. Write formulas in plain readable text: SI = (P x R x T) / 100.
- Keep every code block complete inside ONE fenced block. Never split a code example across multiple fences.
- Do NOT add a lengthy introduction like "Sure! Let me explain..." or a closing like "I hope this helps!"
- Do NOT repeat the student's question back to them verbatim.
- If you are uncertain about a fact, say so clearly. Do not fabricate exam rules, cut-offs, or official answer keys.`;
}

// ─── Question-generation system prompt ───────────────────────────────────────
function buildQuestionSystemPrompt(session) {
  const examName = session?.context?.exam?.name;
  const examLine = examName
    ? `Generate questions suitable for the **${examName}** exam.`
    : 'Generate questions suitable for competitive exams in India (SSC, Banking, UPSC, etc.).';

  return `You are a question-bank generator for competitive exam preparation.
${examLine}

Return ONLY a valid JSON object — no markdown fences, no explanation, no text before or after.
The JSON must have exactly these fields:
{
  "type": "mcq",
  "topic": "<short topic name>",
  "difficulty": "easy" | "medium" | "hard",
  "question": "<question text — plain text, no HTML>",
  "options": { "A": "<text>", "B": "<text>", "C": "<text>", "D": "<text>" },
  "correctAnswer": "A" | "B" | "C" | "D",
  "explanation": "<step-by-step explanation of why the correct answer is right>",
  "steps": ["<step 1>", "<step 2>", "..."],
  "formula": "<relevant formula in plain text, or empty string>"
}

Rules:
- options must have exactly 4 keys: A, B, C, D.
- correctAnswer must be exactly one of: A, B, C, D.
- question and options must be plain text — no Markdown, no HTML.
- explanation and steps use plain text. Do not reveal the answer in the question text.
- Do not invent unsupported facts. For quantitative questions verify arithmetic.`;
}

// ─── Build Gemini request body (shared) ──────────────────────────────────────
function buildGeminiBody(systemPrompt, chatHistory) {
  const contents = chatHistory
    .filter(m => m.role !== 'system')
    .map(m => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
  return {
    contents,
    systemInstruction: { parts: [{ text: systemPrompt }] },
    generationConfig: { maxOutputTokens: AI_MAX_TOKENS, temperature: AI_TEMPERATURE },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
    ],
  };
}

// ─── Response sanitiser ───────────────────────────────────────────────────────
// Converts HTML that Gemini occasionally emits into readable Markdown.
// Safety net — system prompt already bans HTML output.
function sanitizeAIResponse(text) {
  if (!text || typeof text !== 'string') return text;
  return text
    // <details>/<summary> → Markdown heading + body
    .replace(/<details[^>]*>([\s\S]*?)<\/details>/gi, (_, inner) => {
      const sumMatch = inner.match(/<summary[^>]*>([\s\S]*?)<\/summary>/i);
      const sumText  = sumMatch ? sumMatch[1].trim() : '';
      const body = inner
        .replace(/<summary[^>]*>[\s\S]*?<\/summary>/gi, '')
        .replace(/<[^>]+>/g, '').trim();
      return sumText ? `\n**${sumText}**\n\n${body}\n` : `\n${body}\n`;
    })
    // Strip any remaining HTML tags (keep text content)
    .replace(/<[^>]+>/g, '')
    // Collapse 3+ blank lines → 2
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ─── Gemini non-streaming call ────────────────────────────────────────────────
async function callGemini(apiKey, model, systemPrompt, chatHistory) {
  const modelName = model.startsWith('models/') ? model.slice(7) : model;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiBody(systemPrompt, chatHistory)),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const data = await resp.json();
    if (!resp.ok) {
      console.error(`[AI Tutor] Gemini API error ${resp.status}:`, JSON.stringify(data?.error || data).substring(0, 300));
      throw new Error(data?.error?.message || `API error ${resp.status}`);
    }
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      const finishReason = data?.candidates?.[0]?.finishReason;
      if (finishReason === 'SAFETY') throw new Error('Response blocked by safety filters.');
      throw new Error('Empty response from Gemini API.');
    }
    return sanitizeAIResponse(text);
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('AI request timed out (30s). Please try again.');
    throw err;
  }
}

// ─── Gemini SSE streaming call ────────────────────────────────────────────────
// Streams chunks via server-sent events to the Express response object.
// Calls onChunk(text) for each incremental token; resolves with full text.
async function streamGemini(apiKey, model, systemPrompt, chatHistory, onChunk) {
  const modelName = model.startsWith('models/') ? model.slice(7) : model;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:streamGenerateContent?alt=sse&key=${apiKey}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000); // longer for streaming
  let fullText = '';
  let finishReason = null;
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(buildGeminiBody(systemPrompt, chatHistory)),
      signal: controller.signal,
    });
    if (!resp.ok) {
      const errData = await resp.json().catch(() => ({}));
      console.error(`[AI Tutor] Gemini stream error ${resp.status}:`, JSON.stringify(errData?.error || errData).substring(0, 300));
      throw new Error(errData?.error?.message || `API error ${resp.status}`);
    }
    // Parse SSE line by line
    const decoder = new TextDecoder();
    const reader = resp.body.getReader();
    let buf = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop(); // keep last incomplete line
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const jsonStr = line.slice(6).trim();
        if (jsonStr === '[DONE]') break;
        try {
          const chunk = JSON.parse(jsonStr);
          const part = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (part) {
            fullText += part;
            onChunk(part);
          }
          // Capture finish reason from whichever chunk carries it
          const reason = chunk?.candidates?.[0]?.finishReason;
          if (reason) finishReason = reason;
        } catch (_) { /* skip malformed JSON */ }
      }
    }
    clearTimeout(timeout);
    if (!fullText) throw new Error('Empty streaming response from Gemini API.');
    return { text: sanitizeAIResponse(fullText), finishReason };
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('AI request timed out. Please try again.');
    throw err;
  }
}

// ─── OpenAI API call ─────────────────────────────────────────────────────────
async function callOpenAI(apiKey, model, systemPrompt, chatHistory) {
  const messages = [
    { role: 'system', content: systemPrompt },
    ...chatHistory.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: m.content })),
  ];

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, messages, max_tokens: AI_MAX_TOKENS, temperature: AI_TEMPERATURE }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[AI Tutor] OpenAI error:', data?.error?.message);
      throw new Error(data?.error?.message || `OpenAI API error ${resp.status}`);
    }
    const text = data?.choices?.[0]?.message?.content;
    if (!text) throw new Error('Empty response from OpenAI.');
    return text;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('AI request timed out (30s). Please try again.');
    throw err;
  }
}

// ─── Anthropic API call ──────────────────────────────────────────────────────
async function callAnthropic(apiKey, model, systemPrompt, chatHistory) {
  const messages = chatHistory
    .filter(m => m.role !== 'system')
    .map(m => ({ role: m.role, content: m.content }));

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: model || 'claude-3-haiku-20240307',
        max_tokens: AI_MAX_TOKENS,
        system: systemPrompt,
        messages,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    const data = await resp.json();
    if (!resp.ok) {
      console.error('[AI Tutor] Anthropic error:', data?.error?.message);
      throw new Error(data?.error?.message || `Anthropic API error ${resp.status}`);
    }
    const text = data?.content?.[0]?.text;
    if (!text) throw new Error('Empty response from Anthropic.');
    return text;
  } catch (err) {
    clearTimeout(timeout);
    if (err.name === 'AbortError') throw new Error('AI request timed out (30s). Please try again.');
    throw err;
  }
}

// ─── Main AI dispatcher ──────────────────────────────────────────────────────
async function callAI(systemPrompt, chatHistory) {
  const provider = AI_PROVIDER;
  const model    = AI_MODEL;
  const apiKey   = AI_API_KEY;

  if (provider === 'gemini' || provider === 'google') {
    return callGemini(apiKey, model, systemPrompt, chatHistory);
  } else if (provider === 'openai') {
    return callOpenAI(apiKey, model, systemPrompt, chatHistory);
  } else if (provider === 'anthropic') {
    return callAnthropic(apiKey, model, systemPrompt, chatHistory);
  } else {
    throw new Error(`Unsupported AI provider: "${provider}". Set AI_PROVIDER to gemini, openai, or anthropic.`);
  }
}

// ─── Title generator (deterministic, from first user message) ────────────────
function generateTitle(firstMessage) {
  if (!firstMessage) return 'AI Tutor Chat';
  const cleaned = firstMessage.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(' ');
  return words.length > 3 ? words : 'AI Tutor Chat';
}

// ─── Demo response generator (when no API key or key format invalid) ─────────
function generateDemoResponse(userMessage) {
  const msg = userMessage.toLowerCase();

  // ── Greetings ────────────────────────────────────────────────────────────
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('start')) {
    return `Hello! 👋 I'm your AI Tutor for competitive exam preparation.

I can help you with:
• **Quantitative Aptitude** — Percentages, Ratios, Time & Work, Profit & Loss
• **Reasoning** — Syllogisms, Coding-Decoding, Blood Relations, Series
• **English** — Grammar, Vocabulary, Reading Comprehension, Error Detection
• **General Awareness** — History, Geography, Polity, Economics, Science

What topic would you like to study today? Just ask me anything!

⚙️ *DEMO MODE — Configure a valid AI_API_KEY in backend/.env to enable real AI responses.*`;
  }

  // ── Concept explanation ────────────────────────────────────────────────────
  if (msg.includes('explain') || msg.includes('concept') || msg.includes('basics') || msg.includes('what is')) {
    return `**Concept Explanation — Profit & Loss (Example)**

**Concept:** Profit & Loss is a core topic in Quantitative Aptitude.

**Key Definitions:**
- **Cost Price (CP):** The price at which an article is bought.
- **Selling Price (SP):** The price at which it is sold.
- **Profit:** SP > CP → Profit = SP − CP
- **Loss:** SP < CP → Loss = CP − SP

**Formulas:**
| Situation | Formula |
|---|---|
| Profit % | (Profit / CP) × 100 |
| Loss % | (Loss / CP) × 100 |
| SP given profit % | CP × (100 + Profit%) / 100 |
| CP given SP & profit % | SP × 100 / (100 + Profit%) |

**Example:**
A shopkeeper buys an article for ₹500 and sells it for ₹625.
Profit = 625 − 500 = ₹125
Profit% = (125/500) × 100 = **25%**

💡 *For real AI explanations on any topic, add a valid Gemini key to backend/.env.*`;
  }

  // ── Formula questions ─────────────────────────────────────────────────────
  if (msg.includes('formula') || msg.includes('shortcut') || msg.includes('trick')) {
    return `**Quick Formulas — Quantitative Aptitude**

**Percentage**
- X% of Y = XY/100
- Increase by X%: New = Original × (1 + X/100)
- Decrease by X%: New = Original × (1 − X/100)

**Profit & Loss**
- Profit% = (SP − CP) / CP × 100
- SP = CP × (100 + P%) / 100
- Marked Price Discount: SP = MP × (1 − D%/100)

**Time & Work**
- If A does a job in 'a' days, A's 1-day work = 1/a
- Combined rate (A+B) = 1/a + 1/b → Time together = ab/(a+b) days

**Speed, Distance, Time**
- Distance = Speed × Time
- Average Speed (equal distances) = 2xy/(x+y)

**Simple & Compound Interest**
- SI = (P × R × T) / 100
- CI = P(1 + R/100)^T − P

💡 *Configure AI_API_KEY in backend/.env for a live Gemini tutor.*`;
  }

  // ── Practice questions ────────────────────────────────────────────────────
  if (msg.includes('practice') || msg.includes('question') || msg.includes('quiz') || msg.includes('mcq')) {
    return `**Practice Question — Time & Work**

A can complete a work in 12 days and B can complete the same work in 18 days. In how many days can they complete the work together?

**A)** 6 days &nbsp;&nbsp; **B)** 7 days &nbsp;&nbsp; **C)** 7.2 days &nbsp;&nbsp; **D)** 8 days

---
**Answer: C) 7.2 days**

**Solution (Step-by-step):**
1. A's 1-day work = 1/12
2. B's 1-day work = 1/18
3. Combined 1-day work = 1/12 + 1/18 = 3/36 + 2/36 = **5/36**
4. Total days = 36/5 = **7.2 days**

*Try: "Give me a practice question on percentages" or "Give me a reasoning question"*

💡 *Real AI-generated questions from your exam syllabus require a valid AI_API_KEY.*`;
  }

  // ── Examples ──────────────────────────────────────────────────────────────
  if (msg.includes('example') || msg.includes('easier') || msg.includes('simpler')) {
    return `**Easier Example — Ratio & Proportion**

Think of a ratio as a recipe: 2 cups flour for every 1 cup sugar = ratio 2:1.

**Example Question:**
If the ratio of boys to girls in a class is 3:2 and there are 30 students total, how many boys are there?

**Step 1:** Total parts = 3 + 2 = 5
**Step 2:** Value of 1 part = 30 ÷ 5 = 6
**Step 3:** Boys = 3 × 6 = **18** ✓

**Memory Tip:** Always find "1 part" first, then multiply!

*Ask me for an example on any topic — I'll break it down step by step.*`;
  }

  // ── Wrong answer explanation ──────────────────────────────────────────────
  if (msg.includes('wrong') || msg.includes('mistake') || msg.includes('why') || msg.includes('incorrect')) {
    return `**Why Answers Go Wrong — Common Mistakes**

Here are the top reasons students pick the wrong option:

**1. Misreading the question**
→ "Find the *loss* percentage" ≠ "Find the *selling price*". Re-read carefully.

**2. Unit mismatch**
→ Speed in km/h but time in minutes? Always convert to matching units first.
→ 1 hour = 60 min; 1 km = 1000 m

**3. Rounding too early**
→ Keep full precision through intermediate steps; round only the final answer.

**4. Formula confusion**
→ Profit% = Profit/CP × 100 — based on Cost Price, NOT Selling Price.
→ Discount% = Discount/Marked Price × 100 — based on Marked Price, NOT SP.

**5. Trap options**
→ Examiners place the "obvious-looking" wrong answer first.
→ Always calculate rather than guess from patterns.

*Share your specific question and the answer you chose — I'll explain exactly where the reasoning went wrong.*`;
  }

  // ── Summarize topic ───────────────────────────────────────────────────────
  if (msg.includes('summarize') || msg.includes('summary') || msg.includes('revise') || msg.includes('revision')) {
    return `**Topic Summary — Quantitative Aptitude Essentials**

**Most-tested topics in SSC CGL / Banking / TNPSC:**

| Topic | Weight | Key Formula |
|---|---|---|
| Percentage | ★★★★ | Part/Whole × 100 |
| Profit & Loss | ★★★★ | (SP−CP)/CP × 100 |
| Ratio & Proportion | ★★★ | a:b, cross-multiply |
| Time & Work | ★★★ | 1/a + 1/b |
| Speed & Distance | ★★★ | D = S × T |
| Simple Interest | ★★★ | PRT/100 |
| Compound Interest | ★★ | P(1+r)^t − P |
| Averages | ★★★ | Sum/Count |

**Exam Strategy:**
1. Solve easy questions first — don't lose sure marks
2. Skip and return to time-consuming calculations
3. Eliminate obviously wrong options to improve odds
4. For 0.25 negative marking: attempt when ≥2 options are eliminated

*Ask me to go deeper into any topic!*`;
  }

  // ── Percentage specifically ───────────────────────────────────────────────
  if (msg.includes('percentage') || msg.includes('%')) {
    return `**Percentage — Complete Guide**

Percentage means "per hundred" (Latin: per centum).

**Core Formula:** Percentage = (Part / Whole) × 100

**Type 1 — Find X% of a number:**
What is 15% of 400? = (15/100) × 400 = **60**

**Type 2 — What percent is A of B?**
120 is what % of 400? = (120/400) × 100 = **30%**

**Type 3 — % Increase / Decrease:**
Price rises from ₹200 to ₹250.
% increase = (50/200) × 100 = **25%**

**Type 4 — Find original after % change:**
After 20% increase, price = ₹360. Original?
= 360 × (100/120) = **₹300**

**Shortcut — Successive changes of a% and b%:**
Net change = a + b + ab/100

💡 *Configure AI_API_KEY in backend/.env for a live Gemini tutor.*`;
  }

  // ── Default ───────────────────────────────────────────────────────────────
  const _preview = userMessage.length > 60
    ? `"${userMessage.substring(0, 60).trim()}…"`
    : `"${userMessage.trim()}"`;
  return `I'm in **demo mode** and received your message: ${_preview}

In demo mode I can answer common topics. Try asking:
- *"Explain this concept from basics"*
- *"Give me a practice question"*
- *"What is the formula?"*
- *"Give me an easier example"*
- *"Why was my answer wrong?"*
- *"Summarize this topic"*

**To enable a real AI tutor (Google Gemini):**
1. Visit https://aistudio.google.com/app/apikey
2. Create a free API key — it will start with \`AIza\`
3. Add it to \`backend/.env\`: \`AI_API_KEY=AIzaYourKeyHere\`
4. Restart the backend server

I'll then answer any question about your exam syllabus with full explanations!`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

// GET /api/tutor/sessions — list user's sessions (titles only for sidebar)
router.get('/sessions', protect, async (req, res, next) => {
  try {
    const sessions = await ChatSession.find({ user: req.user._id, isActive: true })
      .sort({ updatedAt: -1 })
      .limit(30)
      .select('title createdAt updatedAt');
    res.json({ success: true, data: { sessions } });
  } catch (err) { next(err); }
});

// GET /api/tutor/sessions/:id — load a specific session with full message history
router.get('/sessions/:id', protect, async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id, isActive: true });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    res.json({ success: true, data: { session } });
  } catch (err) { next(err); }
});

// POST /api/tutor/sessions — create a new chat session
router.post('/sessions', protect, async (req, res, next) => {
  try {
    const { context } = req.body;
    const session = await ChatSession.create({
      user: req.user._id,
      context: {
        exam:              context?.exam    || null,
        subject:           context?.subject || null,
        topic:             context?.topic   || null,
        questionId:        context?.questionId || null,
        practiceSessionId: context?.practiceSessionId || null,
      },
      title: 'New Chat',
      messages: [],
    });
    res.status(201).json({ success: true, data: { session } });
  } catch (err) { next(err); }
});

// POST /api/tutor/sessions/:id/message — send message, stream AI response via SSE
// The client sends Accept: text/event-stream to request streaming;
// otherwise falls back to standard JSON (used by demo mode).
router.post('/sessions/:id/message', protect, async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || typeof content !== 'string' || !content.trim()) {
      return res.status(400).json({ success: false, message: 'Message content is required.' });
    }
    if (content.trim().length > MESSAGE_MAX_LENGTH) {
      return res.status(400).json({ success: false, message: `Message too long (max ${MESSAGE_MAX_LENGTH} characters).` });
    }

    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id, isActive: true });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    // Add user message
    session.messages.push({ role: 'user', content: content.trim() });

    // Auto-generate session title from first user message
    if (session.title === 'New Chat' || session.title === 'AI Tutor Chat') {
      session.title = generateTitle(content.trim());
    }

    // Keep last 12 turns (6 exchanges) — enough for follow-ups, avoids token bloat
    const chatHistory = session.messages.slice(-12).map(m => ({ role: m.role, content: m.content }));

    const wantsStream = !isDemoMode
      && (AI_PROVIDER === 'gemini' || AI_PROVIDER === 'google')
      && req.headers.accept === 'text/event-stream';

    // ── STREAMING PATH (Gemini SSE) ──────────────────────────────────────────
    if (wantsStream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no'); // disable Nginx buffering
      res.flushHeaders();

      const sendEvent = (event, data) =>
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

      let streamResult = null;
      let streamError = null;
      try {
        const systemPrompt = buildSystemPrompt(session);
        streamResult = await streamGemini(AI_API_KEY, AI_MODEL, systemPrompt, chatHistory, (chunk) => {
          sendEvent('chunk', { text: chunk });
        });
      } catch (err) {
        streamError = err;
        console.error('[AI Tutor] Streaming failed:', err.message);
        sendEvent('error', { message: err.message?.includes('timed out')
          ? 'AI request timed out. Please try again.'
          : 'AI service error. Please try again.' });
        res.end();
        await session.save();
        return;
      }

      const { text: fullText, finishReason } = streamResult;
      if (finishReason === 'MAX_TOKENS') {
        console.warn('[AI Tutor] Response truncated by MAX_TOKENS — consider raising AI_MAX_TOKENS in .env');
      }

      // Persist completed response
      session.messages.push({ role: 'assistant', content: fullText });
      session.updatedAt = new Date();
      await session.save();
      const savedMsg = session.messages[session.messages.length - 1];

      sendEvent('done', {
        message: savedMsg,
        sessionTitle: session.title,
        demoMode: false,
        finishReason: finishReason || 'STOP',
      });
      res.end();
      return;
    }

    // ── NON-STREAMING PATH (demo mode + OpenAI/Anthropic) ───────────────────
    let aiResponse = null;
    let aiError = null;

    if (!isDemoMode) {
      try {
        const systemPrompt = buildSystemPrompt(session);
        aiResponse = await callAI(systemPrompt, chatHistory);
      } catch (err) {
        aiError = err;
        console.error('[AI Tutor] Provider call failed:', err.message);
      }
    } else {
      aiResponse = generateDemoResponse(content.trim());
    }

    if (aiResponse === null) {
      await session.save(); // persist user message
      return res.status(502).json({
        success: false,
        message: aiError?.message?.includes('timed out')
          ? 'AI request timed out. Please try again.'
          : `AI service error: ${aiError?.message || 'Unknown error'}. Please try again.`,
        _devHint: 'Check AI_API_KEY and AI_MODEL in backend/.env',
      });
    }

    session.messages.push({ role: 'assistant', content: aiResponse });
    session.updatedAt = new Date();
    await session.save();
    const savedAiMsg = session.messages[session.messages.length - 1];

    res.json({
      success: true,
      data: { message: savedAiMsg, sessionTitle: session.title, demoMode: isDemoMode },
    });
  } catch (err) { next(err); }
});

// DELETE /api/tutor/sessions/:id — soft-delete a session
router.delete('/sessions/:id', protect, async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    session.isActive = false;
    await session.save();
    res.json({ success: true, message: 'Session deleted.' });
  } catch (err) { next(err); }
});

// ─── Question JSON parser / validator ────────────────────────────────────────
const VALID_OPTIONS = new Set(['A', 'B', 'C', 'D']);

function parseQuestionJSON(raw) {
  // Strip markdown fences if the model wrapped the JSON
  let cleaned = raw.trim();
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    // Try to find a JSON object substring
    const m = cleaned.match(/\{[\s\S]+\}/);
    if (!m) throw new Error('AI did not return valid JSON for the question.');
    parsed = JSON.parse(m[0]);
  }
  // Validate required fields
  const { type, question, options, correctAnswer, explanation, steps, topic, difficulty, formula } = parsed;
  if (!question || typeof question !== 'string') throw new Error('Question field missing or invalid.');
  if (!options || typeof options !== 'object') throw new Error('Options field missing or invalid.');
  if (!VALID_OPTIONS.has(correctAnswer)) throw new Error(`correctAnswer must be A, B, C or D — got "${correctAnswer}".`);
  if (!['A','B','C','D'].every(k => options[k])) throw new Error('options must have A, B, C, D keys.');
  return {
    type: type || 'mcq',
    topic: topic || 'General',
    difficulty: difficulty || 'medium',
    question: question.trim(),
    options: { A: String(options.A), B: String(options.B), C: String(options.C), D: String(options.D) },
    correctAnswer,
    explanation: explanation || '',
    steps: Array.isArray(steps) ? steps : [],
    formula: formula || '',
  };
}

// Demo question returned when AI key is not configured
const DEMO_QUESTION = {
  type: 'mcq', topic: 'Time & Work', difficulty: 'medium',
  question: 'A can complete a piece of work in 12 days and B can complete the same work in 18 days. In how many days can they complete the work together?',
  options: { A: '6 days', B: '7 days', C: '7.2 days', D: '8 days' },
  correctAnswer: 'C',
  explanation: 'A\'s 1-day work = 1/12; B\'s 1-day work = 1/18. Together = 1/12 + 1/18 = 3/36 + 2/36 = 5/36. Total days = 36/5 = 7.2.',
  steps: ['A\'s 1-day work = 1/12', 'B\'s 1-day work = 1/18', 'Combined = 1/12 + 1/18 = 5/36', 'Total days = 36/5 = 7.2 days'],
  formula: 'Combined rate = 1/a + 1/b; Total time = 1 / combined rate',
};

// POST /api/tutor/sessions/:id/question
// Generates a structured MCQ. Returns question+options only — answer is in metadata.
router.post('/sessions/:id/question', protect, async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id, isActive: true });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const { topic } = req.body; // optional topic hint
    const topicHint = topic ? `Topic: ${topic}.` : '';

    // Add user message showing they requested a question
    const userContent = topic ? `Give me a practice question on ${topic}` : 'Give me a practice question';
    session.messages.push({ role: 'user', content: userContent });

    let questionData;
    if (isDemoMode) {
      questionData = DEMO_QUESTION;
    } else {
      const systemPrompt = buildQuestionSystemPrompt(session);
      const history = [{ role: 'user', content: `Generate one MCQ question. ${topicHint} Return ONLY the JSON object.` }];
      const raw = await callGemini(AI_API_KEY, AI_MODEL, systemPrompt, history);
      try {
        questionData = parseQuestionJSON(raw);
      } catch (parseErr) {
        console.error('[AI Tutor] Question JSON parse failed:', parseErr.message, '| Raw:', raw.substring(0, 200));
        return res.status(502).json({ success: false, message: 'Failed to generate a valid question. Please try again.' });
      }
    }

    // Store PUBLIC data (question+options) as the assistant message content
    // Store PRIVATE data (correctAnswer+explanation) in metadata — never returned in session listing
    const publicContent = `**${questionData.topic}** — ${questionData.difficulty}\n\n${questionData.question}\n\nA) ${questionData.options.A}\nB) ${questionData.options.B}\nC) ${questionData.options.C}\nD) ${questionData.options.D}`;
    const privateMetadata = {
      type: 'question',
      questionData: {
        type: questionData.type,
        topic: questionData.topic,
        difficulty: questionData.difficulty,
        question: questionData.question,
        options: questionData.options,
        correctAnswer: questionData.correctAnswer,
        explanation: questionData.explanation,
        steps: questionData.steps,
        formula: questionData.formula,
      },
      submittedAnswer: null,
      revealed: false,
    };

    session.messages.push({
      role: 'assistant',
      content: publicContent,
      metadata: privateMetadata,
    });

    if (session.title === 'New Chat' || session.title === 'AI Tutor Chat') {
      session.title = `Practice: ${questionData.topic}`;
    }
    session.updatedAt = new Date();
    await session.save();

    const savedMsg = session.messages[session.messages.length - 1];

    // Return PUBLIC fields only — correctAnswer and explanation are excluded
    res.status(201).json({
      success: true,
      data: {
        message: {
          _id: savedMsg._id,
          role: savedMsg.role,
          content: savedMsg.content,
          createdAt: savedMsg.createdAt,
          question: {
            type: questionData.type,
            topic: questionData.topic,
            difficulty: questionData.difficulty,
            question: questionData.question,
            options: questionData.options,
            // correctAnswer intentionally omitted
          },
        },
        sessionTitle: session.title,
        demoMode: isDemoMode,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/tutor/sessions/:id/question/:msgId/submit
// Validates a student's selected option against server-side correct answer.
// Returns: isCorrect, correctAnswer, explanation, steps, formula.
router.post('/sessions/:id/question/:msgId/submit', protect, async (req, res, next) => {
  try {
    const { selectedOption } = req.body;
    if (!selectedOption || !VALID_OPTIONS.has(selectedOption)) {
      return res.status(400).json({ success: false, message: 'selectedOption must be A, B, C, or D.' });
    }

    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id, isActive: true });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const msg = session.messages.id(req.params.msgId);
    if (!msg || msg.role !== 'assistant') {
      return res.status(404).json({ success: false, message: 'Question message not found.' });
    }

    const meta = msg.metadata instanceof Map ? Object.fromEntries(msg.metadata) : msg.metadata;
    if (!meta || meta.type !== 'question' || !meta.questionData) {
      return res.status(400).json({ success: false, message: 'This message is not a practice question.' });
    }

    // Prevent re-submission after already answered (preserves analytics accuracy)
    if (meta.submittedAnswer !== null && meta.submittedAnswer !== undefined) {
      const qd = meta.questionData;
      return res.json({
        success: true,
        data: {
          alreadySubmitted: true,
          selectedOption: meta.submittedAnswer,
          isCorrect: meta.submittedAnswer === qd.correctAnswer,
          correctAnswer: qd.correctAnswer,
          correctAnswerText: qd.options[qd.correctAnswer],
          explanation: qd.explanation,
          steps: qd.steps,
          formula: qd.formula,
        },
      });
    }

    // Record the answer server-side
    const qd = meta.questionData;
    msg.metadata.set('submittedAnswer', selectedOption);
    session.updatedAt = new Date();
    await session.save();

    const isCorrect = selectedOption === qd.correctAnswer;
    res.json({
      success: true,
      data: {
        alreadySubmitted: false,
        selectedOption,
        isCorrect,
        correctAnswer: qd.correctAnswer,
        correctAnswerText: qd.options[qd.correctAnswer],
        explanation: qd.explanation,
        steps: qd.steps,
        formula: qd.formula,
      },
    });
  } catch (err) { next(err); }
});

// POST /api/tutor/sessions/:id/question/:msgId/reveal
// Reveals the answer without submission (explicit reveal, not counted as attempt).
router.post('/sessions/:id/question/:msgId/reveal', protect, async (req, res, next) => {
  try {
    const session = await ChatSession.findOne({ _id: req.params.id, user: req.user._id, isActive: true });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const msg = session.messages.id(req.params.msgId);
    if (!msg || msg.role !== 'assistant') {
      return res.status(404).json({ success: false, message: 'Question message not found.' });
    }

    const meta = msg.metadata instanceof Map ? Object.fromEntries(msg.metadata) : msg.metadata;
    if (!meta || meta.type !== 'question' || !meta.questionData) {
      return res.status(400).json({ success: false, message: 'This message is not a practice question.' });
    }

    const qd = meta.questionData;
    // Mark as revealed if not already submitted
    if (!meta.submittedAnswer) {
      msg.metadata.set('revealed', true);
      await session.save();
    }

    res.json({
      success: true,
      data: {
        correctAnswer: qd.correctAnswer,
        correctAnswerText: qd.options[qd.correctAnswer],
        explanation: qd.explanation,
        steps: qd.steps,
        formula: qd.formula,
        revealed: true,
      },
    });
  } catch (err) { next(err); }
});

module.exports = router;
