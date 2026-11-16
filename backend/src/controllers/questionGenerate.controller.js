/**
 * questionGenerate.controller.js
 * ------------------------------
 * AI-assisted question generation for the Admin Question Bank.
 *
 * POST /api/questions/generate
 *   Body: { examId, subjectId, topicId, count, difficulty, typeDistribution }
 *   Calls the configured AI provider (Gemini / OpenAI) to generate questions
 *   matching the specified type distribution, validates each one, deduplicates
 *   against the existing question bank, and saves approved questions to MongoDB.
 *
 * GET /api/questions/stats
 *   Returns question counts by type, exam, subject, and topic.
 *   Used by the admin dashboard to show type distribution.
 */

'use strict';

const mongoose = require('mongoose');
const Question = require('../models/Question');
const Exam     = require('../models/Exam');
const Subject  = require('../models/Subject');
const Topic    = require('../models/Topic');
const { createError } = require('../utils/helpers');

// ─── Default type distribution (percentages, must sum to 100) ────────────────
const DEFAULT_DISTRIBUTION = {
  single_choice:    35,
  multiple_select:  15,
  matching:         15,
  statement_based:  10,
  assertion_reason: 10,
  true_false:        5,
  fill_blank:        5,
  passage_based:     5,
};

// ─── Type → human label ───────────────────────────────────────────────────────
const TYPE_LABELS = {
  single_choice:    'Single Choice MCQ',
  multiple_select:  'Multiple Select',
  matching:         'Match the Following',
  statement_based:  'Statement Based',
  assertion_reason: 'Assertion and Reason',
  true_false:       'True / False',
  fill_blank:       'Fill in the Blank',
  passage_based:    'Passage Based',
};

// ─── Build the type count plan from a distribution + total count ──────────────
function buildTypePlan(count, distribution) {
  const dist = { ...DEFAULT_DISTRIBUTION, ...distribution };
  const total = Object.values(dist).reduce((s, v) => s + v, 0);

  // Normalise so percentages sum to 100
  const norm = {};
  Object.entries(dist).forEach(([k, v]) => { norm[k] = v / total; });

  // Assign integer counts, then fix rounding so they sum to `count`
  const plan = {};
  let assigned = 0;
  const keys = Object.keys(norm).sort((a, b) => norm[b] - norm[a]);
  keys.forEach(k => {
    const n = Math.floor(norm[k] * count);
    plan[k] = n;
    assigned += n;
  });
  // Distribute remainder to the types with the highest fractional parts
  let remainder = count - assigned;
  const fracts = keys.map(k => ({ k, f: (norm[k] * count) - Math.floor(norm[k] * count) }))
    .sort((a, b) => b.f - a.f);
  for (let i = 0; i < remainder; i++) {
    plan[fracts[i % fracts.length].k]++;
  }
  // Remove zero-count types
  return Object.fromEntries(Object.entries(plan).filter(([, v]) => v > 0));
}

// ─── Build per-type prompt fragment ──────────────────────────────────────────
function typePromptFragment(questionType, examName, subjectName, topicName, difficulty, count) {
  const diffDesc = { easy: 'basic recall and understanding', medium: 'application and analysis', hard: 'evaluation, synthesis, and complex reasoning' }[difficulty] || 'mixed';

  const baseCtx = `Exam: ${examName}. Subject: ${subjectName}. Topic: ${topicName}. Difficulty: ${difficulty} (${diffDesc}).`;

  switch (questionType) {
    case 'single_choice':
      return `Generate ${count} Single Choice MCQ question(s). ${baseCtx}
Each must have exactly 4 options (keys A, B, C, D), one correct answer (string key), and a clear explanation.
JSON schema per question:
{"questionType":"single_choice","text":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctAnswer":"A","explanation":"...","difficulty":"${difficulty}"}`;

    case 'multiple_select':
      return `Generate ${count} Multiple Select question(s) where 2 or more options are correct. ${baseCtx}
Use 4 options (keys A, B, C, D). correctAnswerData is an array of correct keys (2–3 items).
JSON schema per question:
{"questionType":"multiple_select","text":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctAnswerData":["A","C"],"explanation":"...","difficulty":"${difficulty}"}`;

    case 'true_false':
      return `Generate ${count} True/False question(s). ${baseCtx}
The statement must be unambiguously true or false. correctAnswer is "true" or "false".
JSON schema per question:
{"questionType":"true_false","text":"...","correctAnswer":"true","explanation":"...","difficulty":"${difficulty}"}`;

    case 'assertion_reason':
      return `Generate ${count} Assertion and Reason question(s). ${baseCtx}
assertionText and reasonText are separate declarative statements.
Options are always the standard 4: A=Both true, Reason explains; B=Both true, Reason does NOT explain; C=Assertion true, Reason false; D=Assertion false, Reason true.
JSON schema per question:
{"questionType":"assertion_reason","assertionText":"...","reasonText":"...","options":[{"key":"A","text":"Both Assertion and Reason are true, and Reason is the correct explanation of Assertion."},{"key":"B","text":"Both Assertion and Reason are true, but Reason is not the correct explanation of Assertion."},{"key":"C","text":"Assertion is true, but Reason is false."},{"key":"D","text":"Assertion is false, but Reason is true."}],"correctAnswer":"A","text":"Directions: Read the Assertion and Reason carefully and select the correct answer.","explanation":"...","difficulty":"${difficulty}"}`;

    case 'statement_based':
      return `Generate ${count} Statement Based question(s) with 2–3 numbered statements. ${baseCtx}
Options describe which statements are correct (e.g. "Only 1", "Only 2", "Both 1 and 2", "Neither").
JSON schema per question:
{"questionType":"statement_based","text":"Consider the following statements:","statements":[{"number":1,"text":"..."},{"number":2,"text":"..."}],"options":[{"key":"A","text":"Only 1"},{"key":"B","text":"Only 2"},{"key":"C","text":"Both 1 and 2"},{"key":"D","text":"Neither 1 nor 2"}],"correctAnswer":"C","explanation":"...","difficulty":"${difficulty}"}`;

    case 'matching':
      return `Generate ${count} Match the Following question(s) with exactly 4 pairs. ${baseCtx}
itemId is "1","2","3","4"; matchId is "a","b","c","d". correctAnswerData maps each itemId to its matchId.
JSON schema per question:
{"questionType":"matching","text":"Match the following:","matchingPairs":[{"itemId":"1","itemText":"...","matchId":"a","matchText":"..."},{"itemId":"2","itemText":"...","matchId":"b","matchText":"..."},{"itemId":"3","itemText":"...","matchId":"c","matchText":"..."},{"itemId":"4","itemText":"...","matchId":"d","matchText":"..."}],"correctAnswerData":{"1":"a","2":"b","3":"c","4":"d"},"explanation":"...","difficulty":"${difficulty}","text":"Match the following items in Column A with Column B:"}`;

    case 'fill_blank':
      return `Generate ${count} Fill in the Blank question(s). ${baseCtx}
Use __1__ to mark the blank in the text. blanks contains acceptedAnswers (primary + alternatives if any).
correctAnswerData is an array of arrays — one inner array per blank — containing all accepted strings.
JSON schema per question:
{"questionType":"fill_blank","text":"The process by which plants make food using sunlight is called __1__.","blanks":[{"blankIndex":0,"acceptedAnswers":["photosynthesis"],"caseSensitive":false}],"correctAnswerData":[["photosynthesis","Photosynthesis"]],"explanation":"...","difficulty":"${difficulty}"}`;

    case 'passage_based':
      return `Generate ${count} Passage Based question(s). ${baseCtx}
Include a short factual passage (3–6 sentences) and one question based strictly on it.
The question has 4 options (A–D) and one correct answer.
JSON schema per question:
{"questionType":"passage_based","passageText":"...","text":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctAnswer":"A","explanation":"...","difficulty":"${difficulty}"}`;

    default:
      return `Generate ${count} Multiple Choice question(s). ${baseCtx}
{"questionType":"single_choice","text":"...","options":[{"key":"A","text":"..."},{"key":"B","text":"..."},{"key":"C","text":"..."},{"key":"D","text":"..."}],"correctAnswer":"A","explanation":"...","difficulty":"${difficulty}"}`;
  }
}

// ─── Call AI and get raw text ─────────────────────────────────────────────────
async function callAI(prompt, AI_PROVIDER, AI_API_KEY, AI_MODEL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 40000);

  try {
    if (AI_PROVIDER === 'gemini' || AI_PROVIDER === 'google') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${AI_API_KEY}`;
      const resp = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 4096, temperature: 0.5, responseMimeType: 'application/json' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message || `Gemini API error ${resp.status}`);
      return data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    }

    if (AI_PROVIDER === 'openai') {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
        body: JSON.stringify({
          model: AI_MODEL,
          messages: [
            { role: 'system', content: 'You are an expert competitive exam question writer. Always respond with valid JSON only — no markdown, no explanation text outside JSON.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096,
          temperature: 0.5,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const data = await resp.json();
      if (!resp.ok) throw new Error(data?.error?.message || `OpenAI error ${resp.status}`);
      return data?.choices?.[0]?.message?.content || '';
    }

    throw new Error(`AI provider "${AI_PROVIDER}" not supported.`);
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === 'AbortError') throw new Error('AI request timed out (40s). Try a smaller count.');
    throw e;
  }
}

// ─── Extract JSON array from AI text ──────────────────────────────────────────
function extractQuestionsFromText(text) {
  if (!text) return [];
  // Try direct parse first
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed;
    // OpenAI json_object wraps in { questions: [...] } or similar
    if (parsed && typeof parsed === 'object') {
      const arr = parsed.questions || parsed.data || parsed.items || Object.values(parsed).find(v => Array.isArray(v));
      if (Array.isArray(arr)) return arr;
      // Single question object
      if (parsed.text) return [parsed];
    }
  } catch {}

  // Extract first JSON array from markdown-wrapped response
  const match = text.match(/\[[\s\S]*\]/);
  if (match) {
    try { return JSON.parse(match[0]); } catch {}
  }
  // Extract first JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try {
      const obj = JSON.parse(objMatch[0]);
      if (obj.text) return [obj]; // single question
    } catch {}
  }
  return [];
}

// ─── Validate a single generated question ────────────────────────────────────
function validateGeneratedQuestion(q, questionType) {
  if (!q || typeof q !== 'object') return { valid: false, reason: 'Not an object' };
  if (!q.text || typeof q.text !== 'string' || q.text.trim().length < 5)
    return { valid: false, reason: 'Missing or too-short question text' };
  if (!['easy', 'medium', 'hard'].includes(q.difficulty))
    return { valid: false, reason: `Invalid difficulty: ${q.difficulty}` };

  const qt = questionType; // use the requested type, not AI-returned (may be missing)

  if (qt === 'single_choice' || qt === 'passage_based') {
    if (!Array.isArray(q.options) || q.options.length !== 4)
      return { valid: false, reason: 'Must have exactly 4 options' };
    if (!q.correctAnswer || !q.options.find(o => o.key === q.correctAnswer))
      return { valid: false, reason: 'correctAnswer must match an option key' };
    for (const o of q.options) {
      if (!o.key || !o.text || !o.text.trim())
        return { valid: false, reason: `Option ${o.key} has no text` };
    }
    if (qt === 'passage_based' && (!q.passageText || q.passageText.trim().length < 20))
      return { valid: false, reason: 'passageText is too short or missing' };
  }

  if (qt === 'multiple_select') {
    if (!Array.isArray(q.options) || q.options.length < 2)
      return { valid: false, reason: 'At least 2 options required' };
    if (!Array.isArray(q.correctAnswerData) || q.correctAnswerData.length < 1)
      return { valid: false, reason: 'correctAnswerData must be a non-empty array' };
    const keys = q.options.map(o => o.key);
    if (!q.correctAnswerData.every(k => keys.includes(k)))
      return { valid: false, reason: 'correctAnswerData contains keys not in options' };
  }

  if (qt === 'true_false') {
    if (!['true', 'false'].includes(q.correctAnswer))
      return { valid: false, reason: 'correctAnswer must be "true" or "false"' };
  }

  if (qt === 'assertion_reason') {
    if (!q.assertionText || q.assertionText.trim().length < 5)
      return { valid: false, reason: 'assertionText is missing or too short' };
    if (!q.reasonText || q.reasonText.trim().length < 5)
      return { valid: false, reason: 'reasonText is missing or too short' };
    if (!['A', 'B', 'C', 'D'].includes(q.correctAnswer))
      return { valid: false, reason: 'correctAnswer must be A, B, C, or D' };
  }

  if (qt === 'statement_based') {
    if (!Array.isArray(q.statements) || q.statements.length < 2)
      return { valid: false, reason: 'At least 2 statements required' };
    if (!Array.isArray(q.options) || q.options.length < 2)
      return { valid: false, reason: 'At least 2 options required' };
    if (!q.correctAnswer) return { valid: false, reason: 'correctAnswer is required' };
  }

  if (qt === 'matching') {
    if (!Array.isArray(q.matchingPairs) || q.matchingPairs.length < 2)
      return { valid: false, reason: 'At least 2 matching pairs required' };
    if (!q.correctAnswerData || typeof q.correctAnswerData !== 'object')
      return { valid: false, reason: 'correctAnswerData must be an object mapping itemId→matchId' };
    for (const p of q.matchingPairs) {
      if (!p.itemId || !p.itemText || !p.matchId || !p.matchText)
        return { valid: false, reason: `Matching pair missing required fields` };
    }
  }

  if (qt === 'fill_blank') {
    if (!Array.isArray(q.blanks) || q.blanks.length === 0)
      return { valid: false, reason: 'blanks array is required' };
    if (!Array.isArray(q.correctAnswerData) || q.correctAnswerData.length === 0)
      return { valid: false, reason: 'correctAnswerData (array of accepted answers) is required' };
    if (!q.text.includes('__'))
      return { valid: false, reason: 'Question text must contain __1__ blank marker(s)' };
  }

  return { valid: true, reason: null };
}

// ─── Normalize a generated question into the DB shape ────────────────────────
function normalizeQuestion(q, questionType, examId, subjectId, topicId, difficulty) {
  const base = {
    text:         (q.text || '').trim(),
    questionType,
    type:         questionType === 'single_choice' ? 'mcq' : questionType,
    difficulty:   q.difficulty || difficulty,
    exam:         examId,
    subject:      subjectId,
    topic:        topicId,
    explanation:  (q.explanation || '').trim(),
    source:       'ai_generated',
    isAiGenerated: true,
    isApproved:   false, // AI questions start as pending — admin must approve
    marks:        1,
    negativeMarks: 0.25,
  };

  switch (questionType) {
    case 'single_choice':
    case 'passage_based':
      base.options       = q.options;
      base.correctAnswer = q.correctAnswer;
      if (questionType === 'passage_based') base.passageText = (q.passageText || '').trim();
      break;

    case 'multiple_select':
      base.options           = q.options;
      base.correctAnswerData = q.correctAnswerData;
      break;

    case 'true_false':
      base.options       = [{ key: 'true', text: 'True' }, { key: 'false', text: 'False' }];
      base.correctAnswer = q.correctAnswer;
      break;

    case 'assertion_reason':
      base.assertionText = (q.assertionText || '').trim();
      base.reasonText    = (q.reasonText    || '').trim();
      base.options       = q.options && q.options.length === 4 ? q.options : [
        { key: 'A', text: 'Both Assertion and Reason are true, and Reason is the correct explanation of Assertion.' },
        { key: 'B', text: 'Both Assertion and Reason are true, but Reason is not the correct explanation of Assertion.' },
        { key: 'C', text: 'Assertion is true, but Reason is false.' },
        { key: 'D', text: 'Assertion is false, but Reason is true.' },
      ];
      base.correctAnswer = q.correctAnswer;
      break;

    case 'statement_based':
      base.statements    = q.statements;
      base.options       = q.options;
      base.correctAnswer = q.correctAnswer;
      break;

    case 'matching':
      base.matchingPairs     = q.matchingPairs;
      base.correctAnswerData = q.correctAnswerData;
      break;

    case 'fill_blank':
      base.blanks            = q.blanks;
      base.correctAnswerData = q.correctAnswerData;
      break;
  }

  return base;
}

// ─── Simple text normalizer for duplicate detection ───────────────────────────
function normText(s) {
  return (s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// ─── POST /api/questions/generate ────────────────────────────────────────────
const generateQuestions = async (req, res, next) => {
  try {
    const {
      examId, subjectId, topicId,
      count = 10,
      difficulty = 'mixed',
      typeDistribution = {},  // { single_choice: 40, multiple_select: 20, ... }
    } = req.body;

    if (!examId || !subjectId || !topicId)
      return next(createError('examId, subjectId, and topicId are required.', 400));

    const parsedCount = Math.min(Math.max(parseInt(count, 10) || 10, 1), 50);

    // ── Check AI config (never expose key to client) ──────────────────────────
    const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const AI_API_KEY  = process.env.AI_API_KEY  || '';
    const AI_MODEL    = process.env.AI_MODEL    || 'gemini-1.5-flash';
    const knownPlaceholders = ['', 'your_ai_api_key_here', 'your_openai_key_here', 'your_gemini_key_here'];
    const isDemoMode = knownPlaceholders.includes(AI_API_KEY.trim()) || AI_API_KEY.trim().length < 20;

    if (isDemoMode) {
      return res.status(503).json({
        success: false,
        demoMode: true,
        message: 'AI generation is unavailable. Add a valid AI_API_KEY to backend/.env.',
        hint: 'Set AI_PROVIDER=gemini, AI_API_KEY=your_key, AI_MODEL=gemini-1.5-flash in backend/.env',
      });
    }

    // ── Resolve exam/subject/topic names for the prompt ───────────────────────
    const [exam, subject, topic] = await Promise.all([
      Exam.findById(examId).select('name shortName').lean(),
      Subject.findById(subjectId).select('name').lean(),
      Topic.findById(topicId).select('name').lean(),
    ]);
    if (!exam || !subject || !topic)
      return next(createError('Exam, subject, or topic not found.', 404));

    const examName    = exam.name;
    const subjectName = subject.name;
    const topicName   = topic.name;

    // ── Build the type plan ───────────────────────────────────────────────────
    const typePlan = buildTypePlan(parsedCount, typeDistribution);

    // ── Fetch existing question texts for duplicate detection ─────────────────
    const existingQuestions = await Question.find(
      { exam: examId, subject: subjectId, topic: topicId, isActive: true },
      { text: 1 }
    ).lean();
    const existingTexts = new Set(existingQuestions.map(q => normText(q.text)));

    // ── Generate questions per type (sequential to avoid rate limits) ─────────
    const saved   = [];
    const failed  = [];
    const pending = []; // generated but needs approval

    const difficultyForPrompt = difficulty === 'mixed' ? 'medium' : difficulty;

    for (const [questionType, typeCount] of Object.entries(typePlan)) {
      if (typeCount === 0) continue;

      const prompt = `You are an expert ${examName} exam question writer.
Generate EXACTLY ${typeCount} ${TYPE_LABELS[questionType] || questionType} question(s) for:
- Subject: ${subjectName}
- Topic: ${topicName}
- Difficulty: ${difficultyForPrompt}

IMPORTANT RULES:
1. Return ONLY a JSON array — no markdown, no explanation text outside the JSON.
2. Each question must follow this exact schema:
${typePromptFragment(questionType, examName, subjectName, topicName, difficultyForPrompt, typeCount)}
3. Ensure each question is unique — do not repeat similar questions.
4. The explanation must clearly justify the correct answer.
5. All content must be factually accurate and appropriate for ${examName}.

Return an array of ${typeCount} question object(s).`;

      let rawText = '';
      try {
        rawText = await callAI(prompt, AI_PROVIDER, AI_API_KEY, AI_MODEL);
      } catch (aiErr) {
        failed.push({ questionType, count: typeCount, error: aiErr.message });
        continue;
      }

      const generatedRaw = extractQuestionsFromText(rawText);

      for (const rawQ of generatedRaw) {
        // Force questionType to the requested type (AI sometimes gets it wrong)
        rawQ.questionType = questionType;
        rawQ.difficulty   = rawQ.difficulty || difficultyForPrompt;

        const { valid, reason } = validateGeneratedQuestion(rawQ, questionType);
        if (!valid) {
          failed.push({ questionType, question: (rawQ.text || '').slice(0, 60), error: reason });
          continue;
        }

        // Duplicate check
        if (existingTexts.has(normText(rawQ.text))) {
          failed.push({ questionType, question: (rawQ.text || '').slice(0, 60), error: 'Duplicate of existing question' });
          continue;
        }
        existingTexts.add(normText(rawQ.text));

        const normalized = normalizeQuestion(rawQ, questionType, examId, subjectId, topicId, difficultyForPrompt);
        try {
          const doc = await Question.create(normalized);
          pending.push({
            _id:          doc._id,
            questionType: doc.questionType,
            text:         doc.text,
            difficulty:   doc.difficulty,
            isApproved:   doc.isApproved,
          });
        } catch (dbErr) {
          failed.push({ questionType, question: (rawQ.text || '').slice(0, 60), error: dbErr.message });
        }
      }

      // Brief pause between type batches to be kind to rate limits
      await new Promise(r => setTimeout(r, 500));
    }

    // ── Summary ───────────────────────────────────────────────────────────────
    const byType = {};
    pending.forEach(q => { byType[q.questionType] = (byType[q.questionType] || 0) + 1; });

    return res.status(201).json({
      success: true,
      message: `${pending.length} question(s) generated and saved (pending approval).`,
      data: {
        requested:  parsedCount,
        generated:  pending.length,
        failed:     failed.length,
        byType,
        questions:  pending,
        failedItems: failed,
        typePlan,
        note: pending.length > 0
          ? 'Generated questions are marked as "Pending" — approve them in the Question Bank.'
          : 'No questions were saved. Check failedItems for details.',
      },
    });
  } catch (err) { next(err); }
};

// ─── GET /api/questions/stats ─────────────────────────────────────────────────
const getQuestionStats = async (req, res, next) => {
  try {
    const { examId, subjectId, topicId } = req.query;
    const match = { isActive: true };
    if (examId)   match.exam    = new mongoose.Types.ObjectId(examId);
    if (subjectId) match.subject = new mongoose.Types.ObjectId(subjectId);
    if (topicId)   match.topic   = new mongoose.Types.ObjectId(topicId);

    // Run aggregations in parallel
    const [byType, byDifficulty, bySource, byApproval, total] = await Promise.all([
      // Count by questionType (use $ifNull to handle legacy docs without questionType)
      Question.aggregate([
        { $match: match },
        { $group: { _id: { $ifNull: ['$questionType', 'single_choice'] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Count by difficulty
      Question.aggregate([
        { $match: match },
        { $group: { _id: '$difficulty', count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]),
      // Count by source
      Question.aggregate([
        { $match: match },
        { $group: { _id: '$source', count: { $sum: 1 } } },
      ]),
      // Approved vs pending
      Question.aggregate([
        { $match: match },
        { $group: { _id: '$isApproved', count: { $sum: 1 } } },
      ]),
      // Total
      Question.countDocuments(match),
    ]);

    // Normalise byType into a map
    const typeMap = {};
    byType.forEach(r => { typeMap[r._id] = r.count; });

    // Build deficit report vs default distribution
    const gaps = [];
    const targetTotal = total || 100; // avoid /0
    Object.entries(DEFAULT_DISTRIBUTION).forEach(([qt, pct]) => {
      const current = typeMap[qt] || 0;
      const target  = Math.round((pct / 100) * targetTotal);
      if (current < target) {
        gaps.push({ questionType: qt, label: TYPE_LABELS[qt], current, target, deficit: target - current });
      }
    });
    gaps.sort((a, b) => b.deficit - a.deficit);

    return res.json({
      success: true,
      message: 'Question statistics retrieved.',
      data: {
        total,
        byType: byType.map(r => ({ questionType: r._id, label: TYPE_LABELS[r._id] || r._id, count: r.count })),
        byDifficulty: byDifficulty.map(r => ({ difficulty: r._id, count: r.count })),
        bySource: bySource.map(r => ({ source: r._id, count: r.count })),
        approved:  (byApproval.find(r => r._id === true)  || {}).count || 0,
        pending:   (byApproval.find(r => r._id === false) || {}).count || 0,
        gaps,
        defaultDistribution: DEFAULT_DISTRIBUTION,
      },
    });
  } catch (err) { next(err); }
};

module.exports = { generateQuestions, getQuestionStats };

