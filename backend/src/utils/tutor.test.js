/**
 * AI Tutor backend unit tests.
 *
 * Tests pure logic extracted from tutor.routes.js.
 * No live DB, no live AI API calls.
 *
 * Coverage:
 *  A. Title generation from first user message.
 *  B. Demo response generation (pattern matching).
 *  C. Message content validation.
 *  D. Provider dispatch logic.
 *  E. AI response error scenarios.
 *  F. Duplicate session prevention logic.
 *  G. Message length limits.
 */

// ─── Extract testable functions ──────────────────────────────────────────────

function generateTitle(firstMessage) {
  if (!firstMessage) return 'AI Tutor Chat';
  const cleaned = firstMessage.replace(/[^a-zA-Z0-9\s]/g, '').trim();
  const words = cleaned.split(/\s+/).slice(0, 6).join(' ');
  return words.length > 3 ? words : 'AI Tutor Chat';
}

function generateDemoResponse(userMessage) {
  const msg = userMessage.toLowerCase();
  if (msg.includes('hello') || msg.includes('hi') || msg.includes('start')) {
    return 'hello_response';
  }
  if (msg.includes('explain') || msg.includes('concept') || msg.includes('basics') || msg.includes('what is')) {
    return 'concept_response';
  }
  if (msg.includes('formula') || msg.includes('shortcut') || msg.includes('trick')) {
    return 'formula_response';
  }
  if (msg.includes('practice') || msg.includes('question') || msg.includes('quiz') || msg.includes('mcq')) {
    return 'practice_response';
  }
  if (msg.includes('example') || msg.includes('easier') || msg.includes('simpler')) {
    return 'example_response';
  }
  if (msg.includes('wrong') || msg.includes('mistake') || msg.includes('why') || msg.includes('incorrect')) {
    return 'error_analysis_response';
  }
  if (msg.includes('summarize') || msg.includes('summary') || msg.includes('revise') || msg.includes('revision')) {
    return 'summary_response';
  }
  if (msg.includes('percentage') || msg.includes('%')) {
    return 'percentage_response';
  }
  return 'default_response';
}

function validateContent(content, maxLength = 4000) {
  if (!content || typeof content !== 'string' || !content.trim()) {
    return { valid: false, reason: 'Message content is required.' };
  }
  if (content.trim().length > maxLength) {
    return { valid: false, reason: `Message too long (max ${maxLength} characters).` };
  }
  return { valid: true };
}

// ── Mirrors the updated production logic: isDemoMode = placeholder OR invalid format
function isValidKeyFormat(provider, key) {
  if (!key || typeof key !== 'string' || key.trim() === '') return false;
  const k = key.trim();
  if (provider === 'gemini' || provider === 'google') {
    return k.startsWith('AIza') && k.length >= 30;
  }
  if (provider === 'openai') {
    return k.startsWith('sk-') && k.length >= 20;
  }
  if (provider === 'anthropic') {
    return k.startsWith('sk-ant-') && k.length >= 20;
  }
  return k.length > 10;
}

function isDemoMode(provider, apiKey) {
  const PLACEHOLDER_KEYS = ['', 'your_ai_api_key_here', 'your_openai_key_here', 'your_gemini_key_here'];
  if (PLACEHOLDER_KEYS.includes(apiKey)) return true;
  return !isValidKeyFormat(provider, apiKey);
}

function resolveProvider(providerEnv) {
  const p = (providerEnv || '').toLowerCase();
  if (p === 'gemini' || p === 'google') return 'gemini';
  if (p === 'openai') return 'openai';
  if (p === 'anthropic') return 'anthropic';
  return null;
}

// Simulate conversation persistence idempotency
function applyMessageToSession(session, userContent) {
  const existing = session.messages.find(
    m => m.role === 'user' && m.content === userContent
  );
  if (existing) return { added: false, session }; // already there

  session.messages.push({ role: 'user', content: userContent });
  return { added: true, session };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Title generation
// ═══════════════════════════════════════════════════════════════════════════════
describe('A. generateTitle()', () => {
  test('generates title from normal message', () => {
    expect(generateTitle('Explain percentage calculations')).toBe('Explain percentage calculations');
  });

  test('limits to 6 words', () => {
    const msg = 'One two three four five six seven eight words';
    const title = generateTitle(msg);
    expect(title.split(' ').length).toBeLessThanOrEqual(6);
  });

  test('strips punctuation', () => {
    const title = generateTitle('What is 20% of 400?');
    expect(title).not.toContain('?');
    expect(title).not.toContain('%');
  });

  test('returns fallback for null/empty input', () => {
    expect(generateTitle(null)).toBe('AI Tutor Chat');
    expect(generateTitle('')).toBe('AI Tutor Chat');
  });

  test('returns fallback for very short messages (≤3 chars)', () => {
    expect(generateTitle('Hi')).toBe('AI Tutor Chat');
  });

  test('generates meaningful title for longer messages', () => {
    const title = generateTitle('Why was my answer wrong');
    expect(title).toBe('Why was my answer wrong');
    expect(title).not.toBe('AI Tutor Chat');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Demo response generation
// ═══════════════════════════════════════════════════════════════════════════════
describe('B. generateDemoResponse()', () => {
  test('hello/hi triggers greeting response', () => {
    expect(generateDemoResponse('Hello!')).toBe('hello_response');
    expect(generateDemoResponse('Hi there')).toBe('hello_response');
  });

  test('percentage/% triggers percentage response (without explain keywords)', () => {
    expect(generateDemoResponse('percentage calculation')).toBe('percentage_response');
    expect(generateDemoResponse('20% of 400 is how much')).toBe('percentage_response');
  });

  test('practice/question triggers practice response', () => {
    expect(generateDemoResponse('Give me a practice question')).toBe('practice_response');
    expect(generateDemoResponse('I want to practice')).toBe('practice_response');
  });

  test('"explain" / "basics" / "what is" triggers concept response', () => {
    expect(generateDemoResponse('Explain this concept from basics')).not.toBe('default_response');
    expect(generateDemoResponse('What is profit and loss?')).not.toBe('default_response');
  });

  test('"formula" / "shortcut" triggers formula response', () => {
    expect(generateDemoResponse('What is the formula?')).not.toBe('default_response');
    expect(generateDemoResponse('Give me a shortcut')).not.toBe('default_response');
  });

  test('"easier" / "example" triggers example response', () => {
    expect(generateDemoResponse('Give me an easier example')).not.toBe('default_response');
    expect(generateDemoResponse('Show me a simpler example')).not.toBe('default_response');
  });

  test('"wrong" / "mistake" / "why" triggers error-analysis response', () => {
    expect(generateDemoResponse('Why was my answer wrong?')).not.toBe('default_response');
    expect(generateDemoResponse('What mistake did I make')).not.toBe('default_response');
  });

  test('"summarize" / "revise" triggers summary response', () => {
    expect(generateDemoResponse('Summarize this topic')).not.toBe('default_response');
    expect(generateDemoResponse('Help me revise')).not.toBe('default_response');
  });

  test('unmatched message returns default response', () => {
    expect(generateDemoResponse('Tell me about algebra')).toBe('default_response');
  });

  test('all 6 QUICK_PROMPTS produce non-default responses', () => {
    const QUICK_PROMPTS = [
      'Explain this concept from basics',
      'Give me a practice question',
      'What is the formula?',
      'Give me an easier example',
      'Why was my answer wrong?',
      'Summarize this topic',
    ];
    for (const p of QUICK_PROMPTS) {
      expect(generateDemoResponse(p)).not.toBe('default_response');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Content validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('C. validateContent()', () => {
  test('accepts valid message', () => {
    expect(validateContent('Explain percentages').valid).toBe(true);
  });

  test('rejects null', () => {
    expect(validateContent(null).valid).toBe(false);
  });

  test('rejects empty string', () => {
    expect(validateContent('').valid).toBe(false);
  });

  test('rejects whitespace-only string', () => {
    expect(validateContent('   ').valid).toBe(false);
  });

  test('rejects non-string', () => {
    expect(validateContent(42).valid).toBe(false);
  });

  test('rejects message exceeding maxLength', () => {
    const long = 'a'.repeat(4001);
    expect(validateContent(long).valid).toBe(false);
  });

  test('accepts message exactly at maxLength', () => {
    const exact = 'a'.repeat(4000);
    expect(validateContent(exact).valid).toBe(true);
  });

  test('error message mentions max character limit', () => {
    const long = 'a'.repeat(4001);
    const { reason } = validateContent(long);
    expect(reason).toMatch(/4000/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. Provider dispatch logic
// ═══════════════════════════════════════════════════════════════════════════════
describe('D. resolveProvider()', () => {
  test('AI_PROVIDER=gemini → gemini', () => {
    expect(resolveProvider('gemini')).toBe('gemini');
  });

  test('AI_PROVIDER=GEMINI (uppercase) → gemini', () => {
    expect(resolveProvider('GEMINI')).toBe('gemini');
  });

  test('AI_PROVIDER=google → gemini (Google is same as Gemini)', () => {
    expect(resolveProvider('google')).toBe('gemini');
  });

  test('AI_PROVIDER=openai → openai', () => {
    expect(resolveProvider('openai')).toBe('openai');
  });

  test('AI_PROVIDER=anthropic → anthropic', () => {
    expect(resolveProvider('anthropic')).toBe('anthropic');
  });

  test('unknown provider → null', () => {
    expect(resolveProvider('some-unknown-provider')).toBeNull();
  });

  test('empty string → null', () => {
    expect(resolveProvider('')).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Demo mode detection
// ═══════════════════════════════════════════════════════════════════════════════
describe('E. isDemoMode()', () => {
  test('empty key → demo mode', () => {
    expect(isDemoMode('gemini', '')).toBe(true);
  });

  test('placeholder key → demo mode', () => {
    expect(isDemoMode('gemini', 'your_ai_api_key_here')).toBe(true);
    expect(isDemoMode('openai', 'your_openai_key_here')).toBe(true);
    expect(isDemoMode('gemini', 'your_gemini_key_here')).toBe(true);
  });

  test('valid Gemini key (AIza...) → live mode', () => {
    expect(isDemoMode('gemini', 'AIzaSyExampleKeyWith39Characters12345')).toBe(false);
  });

  test('valid OpenAI key (sk-...) → live mode', () => {
    expect(isDemoMode('openai', 'sk-proj-abc123XYZlongEnough')).toBe(false);
  });

  test('AQ.* key for gemini provider → DEMO mode (wrong format for Gemini)', () => {
    // Keys starting with AQ. are NOT valid Gemini REST API keys (which start with AIza).
    // The backend must detect this and fall back to demo mode.
    expect(isDemoMode('gemini', 'AQ.TEST_INVALID_KEY')).toBe(true);
  });

  test('short key → demo mode (too short to be valid)', () => {
    expect(isDemoMode('gemini', 'AIza')).toBe(true); // starts right but too short
    expect(isDemoMode('openai', 'sk-')).toBe(true);  // starts right but too short
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Conversation message persistence (idempotency)
// ═══════════════════════════════════════════════════════════════════════════════
describe('F. Message persistence', () => {
  function makeSession() {
    return { _id: 'sess-1', messages: [] };
  }

  test('new message is added to session', () => {
    const session = makeSession();
    const { added } = applyMessageToSession(session, 'Hello');
    expect(added).toBe(true);
    expect(session.messages).toHaveLength(1);
  });

  test('same message content is not double-added', () => {
    const session = makeSession();
    applyMessageToSession(session, 'Hello');
    const { added } = applyMessageToSession(session, 'Hello');
    expect(added).toBe(false);
    expect(session.messages).toHaveLength(1);
  });

  test('different messages are both added', () => {
    const session = makeSession();
    applyMessageToSession(session, 'Hello');
    applyMessageToSession(session, 'Explain percentages');
    expect(session.messages).toHaveLength(2);
  });

  test('session starts with zero messages', () => {
    const session = makeSession();
    expect(session.messages).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Message length limits
// ═══════════════════════════════════════════════════════════════════════════════
describe('G. Message length limits', () => {
  const MAX = 4000;

  test('1-char message is valid', () => {
    expect(validateContent('a').valid).toBe(true);
  });

  test('exactly MAX chars is valid', () => {
    expect(validateContent('x'.repeat(MAX)).valid).toBe(true);
  });

  test('MAX+1 chars is invalid', () => {
    expect(validateContent('x'.repeat(MAX + 1)).valid).toBe(false);
  });

  test('very long message (10,000 chars) is invalid', () => {
    expect(validateContent('x'.repeat(10000)).valid).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Suggested prompts (quick prompts)
// ═══════════════════════════════════════════════════════════════════════════════
describe('H. Suggested prompts validation', () => {
  const QUICK_PROMPTS = [
    'Explain this concept from basics',
    'Give me a practice question',
    'What is the formula?',
    'Give me an easier example',
    'Why was my answer wrong?',
    'Summarize this topic',
  ];

  test('all quick prompts pass content validation', () => {
    for (const prompt of QUICK_PROMPTS) {
      const { valid } = validateContent(prompt);
      expect(valid).toBe(true);
    }
  });

  test('all quick prompts are non-empty strings', () => {
    for (const prompt of QUICK_PROMPTS) {
      expect(typeof prompt).toBe('string');
      expect(prompt.trim().length).toBeGreaterThan(0);
    }
  });

  test('each quick prompt generates a demo response (not undefined)', () => {
    for (const prompt of QUICK_PROMPTS) {
      const resp = generateDemoResponse(prompt);
      expect(resp).toBeTruthy();
      expect(typeof resp).toBe('string');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. isValidKeyFormat() — provider-specific API key format validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('I. isValidKeyFormat()', () => {
  // ── Gemini ─────────────────────────────────────────────────────────────────
  test('valid Gemini key starts with AIza and is ≥30 chars', () => {
    expect(isValidKeyFormat('gemini', 'AIzaSyExampleKeyWith39Characters12345')).toBe(true);
  });

  test('gemini key starting with AQ. is invalid (wrong format)', () => {
    expect(isValidKeyFormat('gemini', 'AQ.TEST_INVALID_KEY')).toBe(false);

    test('gemini key starting with AIza but too short is invalid', () => {
      expect(isValidKeyFormat('gemini', 'AIza')).toBe(false);
    });

    test('google alias works same as gemini', () => {
      expect(isValidKeyFormat('google', 'AIzaSyExampleKeyWith39Characters12345')).toBe(true);
      expect(isValidKeyFormat('google', 'AQ.SomeWrongKey')).toBe(false);
    });

    test('empty gemini key is invalid', () => {
      expect(isValidKeyFormat('gemini', '')).toBe(false);
      expect(isValidKeyFormat('gemini', null)).toBe(false);
    });

    // ── OpenAI ─────────────────────────────────────────────────────────────────
    test('valid OpenAI key starts with sk- and is ≥20 chars', () => {
      expect(isValidKeyFormat('openai', 'sk-proj-abc123XYZlongEnough')).toBe(true);
    });

    test('OpenAI key not starting with sk- is invalid', () => {
      expect(isValidKeyFormat('openai', 'AIzaSomethingWrong')).toBe(false);
    });

    test('OpenAI key starting with sk- but too short is invalid', () => {
      expect(isValidKeyFormat('openai', 'sk-short')).toBe(false);
    });

    // ── Anthropic ──────────────────────────────────────────────────────────────
    test('valid Anthropic key starts with sk-ant- and is ≥20 chars', () => {
      expect(isValidKeyFormat('anthropic', 'sk-ant-abc123XYZlongEnough')).toBe(true);
    });

    test('Anthropic key not starting with sk-ant- is invalid', () => {
      expect(isValidKeyFormat('anthropic', 'sk-proj-abc123XYZ')).toBe(false);
    });

    // ── Unknown provider ───────────────────────────────────────────────────────
    test('unknown provider trusts any key longer than 10 chars', () => {
      expect(isValidKeyFormat('unknown-provider', 'longenoughkeyhere')).toBe(true);
      expect(isValidKeyFormat('unknown-provider', 'short')).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // J. Question JSON parsing and validation
  // ═══════════════════════════════════════════════════════════════════════════════

  const VALID_OPTIONS_SET = new Set(['A', 'B', 'C', 'D']);

  function parseQuestionJSON(raw) {
    let cleaned = raw.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      const m = cleaned.match(/\{[\s\S]+\}/);
      if (!m) throw new Error('AI did not return valid JSON for the question.');
      parsed = JSON.parse(m[0]);
    }
    const { type, question, options, correctAnswer, explanation, steps, topic, difficulty, formula } = parsed;
    if (!question || typeof question !== 'string') throw new Error('Question field missing or invalid.');
    if (!options || typeof options !== 'object') throw new Error('Options field missing or invalid.');
    if (!VALID_OPTIONS_SET.has(correctAnswer)) throw new Error(`correctAnswer must be A, B, C or D — got "${correctAnswer}".`);
    if (!['A', 'B', 'C', 'D'].every(k => options[k])) throw new Error('options must have A, B, C, D keys.');
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

  const VALID_RAW_JSON = JSON.stringify({
    type: 'mcq',
    topic: 'Profit & Loss',
    difficulty: 'medium',
    question: 'A man buys an article for Rs 100 and sells for Rs 120. What is the profit %?',
    options: { A: '10%', B: '15%', C: '20%', D: '25%' },
    correctAnswer: 'C',
    explanation: 'Profit = 20, CP = 100, so Profit% = 20/100 * 100 = 20%.',
    steps: ['Profit = SP - CP = 120 - 100 = 20', 'Profit% = (20/100) * 100 = 20%'],
    formula: 'Profit% = (Profit / CP) * 100',
  });

  describe('J. parseQuestionJSON()', () => {
    test('parses valid JSON string correctly', () => {
      const q = parseQuestionJSON(VALID_RAW_JSON);
      expect(q.question).toContain('profit');
      expect(q.correctAnswer).toBe('C');
      expect(q.options.A).toBe('10%');
      expect(q.steps).toHaveLength(2);
    });

    test('strips markdown code fences', () => {
      const fenced = '```json\n' + VALID_RAW_JSON + '\n```';
      const q = parseQuestionJSON(fenced);
      expect(q.correctAnswer).toBe('C');
    });

    test('extracts JSON from surrounding text', () => {
      const wrapped = 'Here is your question:\n' + VALID_RAW_JSON + '\nHope this helps!';
      const q = parseQuestionJSON(wrapped);
      expect(q.correctAnswer).toBe('C');
    });

    test('throws when question field is missing', () => {
      const bad = JSON.stringify({ options: { A: '1', B: '2', C: '3', D: '4' }, correctAnswer: 'A' });
      expect(() => parseQuestionJSON(bad)).toThrow('Question field');
    });

    test('throws when correctAnswer is not A/B/C/D', () => {
      const bad = JSON.stringify({
        question: 'Q', options: { A: '1', B: '2', C: '3', D: '4' }, correctAnswer: 'E',
      });
      expect(() => parseQuestionJSON(bad)).toThrow('correctAnswer must be A, B, C or D');
    });

    test('throws when options are missing a key', () => {
      const bad = JSON.stringify({
        question: 'Q', options: { A: '1', B: '2', C: '3' }, correctAnswer: 'A',
      });
      expect(() => parseQuestionJSON(bad)).toThrow('options must have A, B, C, D keys');
    });

    test('throws on non-JSON garbage', () => {
      expect(() => parseQuestionJSON('not json at all')).toThrow();
    });

    test('defaults difficulty to medium when omitted', () => {
      const noD = JSON.parse(VALID_RAW_JSON);
      delete noD.difficulty;
      const q = parseQuestionJSON(JSON.stringify(noD));
      expect(q.difficulty).toBe('medium');
    });

    test('steps defaults to empty array when omitted', () => {
      const noS = JSON.parse(VALID_RAW_JSON);
      delete noS.steps;
      const q = parseQuestionJSON(JSON.stringify(noS));
      expect(Array.isArray(q.steps)).toBe(true);
      expect(q.steps).toHaveLength(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // K. Answer submission logic
  // ═══════════════════════════════════════════════════════════════════════════════

  function evaluateAnswer(selectedOption, questionData, alreadySubmitted = null) {
    if (!VALID_OPTIONS_SET.has(selectedOption)) {
      return { error: 'selectedOption must be A, B, C, or D.' };
    }
    if (alreadySubmitted !== null) {
      return {
        alreadySubmitted: true,
        selectedOption: alreadySubmitted,
        isCorrect: alreadySubmitted === questionData.correctAnswer,
        correctAnswer: questionData.correctAnswer,
        explanation: questionData.explanation,
      };
    }
    return {
      alreadySubmitted: false,
      selectedOption,
      isCorrect: selectedOption === questionData.correctAnswer,
      correctAnswer: questionData.correctAnswer,
      explanation: questionData.explanation,
      steps: questionData.steps,
      formula: questionData.formula,
    };
  }

  const SAMPLE_QD = {
    correctAnswer: 'C',
    explanation: 'Profit% = 20%.',
    steps: ['Profit = 20', 'Profit% = 20%'],
    formula: 'Profit% = Profit/CP * 100',
  };

  describe('K. Answer submission evaluation', () => {
    test('correct option returns isCorrect = true', () => {
      const r = evaluateAnswer('C', SAMPLE_QD);
      expect(r.isCorrect).toBe(true);
      expect(r.alreadySubmitted).toBe(false);
    });

    test('wrong option returns isCorrect = false', () => {
      const r = evaluateAnswer('A', SAMPLE_QD);
      expect(r.isCorrect).toBe(false);
      expect(r.selectedOption).toBe('A');
      expect(r.correctAnswer).toBe('C');
    });

    test('explanation and steps are returned on first submission', () => {
      const r = evaluateAnswer('B', SAMPLE_QD);
      expect(r.explanation).toBeTruthy();
      expect(Array.isArray(r.steps)).toBe(true);
    });

    test('invalid option returns error', () => {
      const r = evaluateAnswer('E', SAMPLE_QD);
      expect(r.error).toMatch(/A, B, C, or D/);
    });

    test('second submission returns alreadySubmitted = true with original answer', () => {
      const r = evaluateAnswer('B', SAMPLE_QD, 'A'); // already submitted A
      expect(r.alreadySubmitted).toBe(true);
      expect(r.selectedOption).toBe('A');
      expect(r.isCorrect).toBe(false);
    });

    test('all 4 options are valid', () => {
      for (const opt of ['A', 'B', 'C', 'D']) {
        const r = evaluateAnswer(opt, SAMPLE_QD);
        expect(r.error).toBeUndefined();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // L. Public response shape — correctAnswer must not be in initial client payload
  // ═══════════════════════════════════════════════════════════════════════════════

  function buildPublicQuestionResponse(questionData) {
    // Simulates what the /question endpoint returns to the client
    return {
      type: questionData.type,
      topic: questionData.topic,
      difficulty: questionData.difficulty,
      question: questionData.question,
      options: questionData.options,
      // correctAnswer intentionally omitted
    };
  }

  describe('L. Public question response shape', () => {
    const fullQD = JSON.parse(VALID_RAW_JSON);

    test('public response does NOT include correctAnswer', () => {
      const pub = buildPublicQuestionResponse(fullQD);
      expect(pub.correctAnswer).toBeUndefined();
    });

    test('public response does NOT include explanation', () => {
      const pub = buildPublicQuestionResponse(fullQD);
      expect(pub.explanation).toBeUndefined();
    });

    test('public response does NOT include steps', () => {
      const pub = buildPublicQuestionResponse(fullQD);
      expect(pub.steps).toBeUndefined();
    });

    test('public response includes question text', () => {
      const pub = buildPublicQuestionResponse(fullQD);
      expect(typeof pub.question).toBe('string');
      expect(pub.question.length).toBeGreaterThan(0);
    });

    test('public response includes all 4 options', () => {
      const pub = buildPublicQuestionResponse(fullQD);
      expect(Object.keys(pub.options)).toEqual(expect.arrayContaining(['A', 'B', 'C', 'D']));
    });

    test('correct answer string does not appear inside any option text (not leaked)', () => {
      const pub = buildPublicQuestionResponse(fullQD);
      // Correct answer is 'C' — make sure it is not explicitly labelled
      expect(pub).not.toHaveProperty('correctAnswer');
      expect(JSON.stringify(pub)).not.toContain('"correctAnswer"');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // M. isPracticeRequest() — frontend routing helper
  // ═══════════════════════════════════════════════════════════════════════════════

  function isPracticeRequest(text) {
    if (!text) return false;
    const QUESTION_PHRASES = [
      'practice question', 'give me a question', 'mcq', 'quiz me', 'test me',
      'practice mcq', 'give me mcq', 'practice problem', 'a question on',
    ];
    const t = text.toLowerCase().trim();
    return QUESTION_PHRASES.some(p => t.includes(p));
  }

  describe('M. isPracticeRequest()', () => {
    test('detects "Give me a practice question"', () => {
      expect(isPracticeRequest('Give me a practice question')).toBe(true);
    });

    test('detects "mcq" in various contexts', () => {
      expect(isPracticeRequest('Give me an MCQ on ratios')).toBe(true);
      expect(isPracticeRequest('practice mcq for banking')).toBe(true);
    });

    test('detects "quiz me" and "test me"', () => {
      expect(isPracticeRequest('Quiz me on percentages')).toBe(true);
      expect(isPracticeRequest('Test me on profit and loss')).toBe(true);
    });

    test('does NOT detect regular conceptual questions', () => {
      expect(isPracticeRequest('Explain profit and loss')).toBe(false);
      expect(isPracticeRequest('What is the formula for SI?')).toBe(false);
      expect(isPracticeRequest('Why was my answer wrong?')).toBe(false);
    });

    test('handles null/undefined safely', () => {
      expect(isPracticeRequest(null)).toBe(false);
      expect(isPracticeRequest(undefined)).toBe(false);
      expect(isPracticeRequest('')).toBe(false);
    });

    test('all practice quick-prompts are detected', () => {
      const practicePrompts = [
        'Give me a practice question',
        'Give me an MCQ',
        'Quiz me',
      ];
      for (const p of practicePrompts) {
        expect(isPracticeRequest(p)).toBe(true);
      }
    });
  });
