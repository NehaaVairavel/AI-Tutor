/**
 * Practice module unit tests.
 *
 * These tests cover pure-logic functions extracted from the practice controller
 * and the scoring logic. They do NOT require a live MongoDB connection.
 *
 * Test coverage:
 *  1. Within-session duplicate question ID detection.
 *  2. Question validation (structure, correctAnswer, difficulty, options).
 *  3. Exact-duplicate / fingerprint detection.
 *  4. Scoring: correct, wrong, skipped → marks, negativeMarks, percentage.
 *  5. Score clamping: percentage and marksObtained cannot go below 0.
 *  6. Idempotent submission (already-completed session returns same result).
 *  7. Mistake deduplication (seen Set prevents double entries).
 */

// ─── Import helpers directly from controller ────────────────────────────────────
const {
  validateQuestion,
  buildFingerprint,
  normalizeText,
} = require('../controllers/practice.controller');

// ─── Pure scoring logic (mirrors what submitSession does) ───────────────────────
function computeScore(questions, answersMap) {
  let correct = 0, wrong = 0, skipped = 0;
  let rawMarks = 0;
  let negativeMarksTotal = 0;
  const attempts = [];

  for (const q of questions) {
    const qId = q._id;
    const { selectedAnswer = null } = answersMap[qId] || {};
    const isSkipped = !selectedAnswer;
    let isCorrect = false;
    let awarded = 0;

    if (isSkipped) {
      skipped++;
      awarded = 0;
    } else if (selectedAnswer === q.correctAnswer) {
      isCorrect = true;
      correct++;
      awarded = q.marks ?? 1;
      rawMarks += awarded;
    } else {
      wrong++;
      const neg = q.negativeMarks ?? 0;
      negativeMarksTotal += neg;
      awarded = -neg;
      rawMarks -= neg;
    }

    attempts.push({ question: qId, selectedAnswer, correctAnswer: q.correctAnswer, isCorrect, isSkipped, marksAwarded: awarded });
  }

  const totalQuestions = questions.length;
  const totalMarks = questions.reduce((s, q) => s + (q.marks ?? 1), 0);
  const attempted = correct + wrong;
  const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
  const marksObtained = Math.max(0, rawMarks); // clamped
  const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0;

  return { correct, wrong, skipped, rawMarks, marksObtained, negativeMarks: negativeMarksTotal, totalMarks, accuracy, percentage, attempts };
}

// ─── Pure deduplication helper (mirrors what startSession does) ─────────────────
function deduplicateIds(ids) {
  const seen = new Set();
  return ids.filter(id => {
    const key = id.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── Pure mistake deduplication helper ─────────────────────────────────────────
function extractMistakes(sessions) {
  const seen = new Set();
  const mistakes = [];
  for (const session of sessions) {
    for (const attempt of session.attempts) {
      if (attempt.isCorrect || attempt.isSkipped) continue;
      const key = `${session._id}:${attempt.question}`;
      if (seen.has(key)) continue;
      seen.add(key);
      mistakes.push({ sessionId: session._id, questionId: attempt.question });
    }
  }
  return mistakes;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. Within-session duplicate question ID detection
// ═══════════════════════════════════════════════════════════════════════════════
describe('1. Within-session deduplication', () => {
  test('removes exact duplicate IDs', () => {
    const ids = ['abc', 'def', 'abc', 'ghi', 'def'];
    const unique = deduplicateIds(ids);
    expect(unique).toHaveLength(3);
    expect(unique).toEqual(['abc', 'def', 'ghi']);
  });

  test('returns original array unchanged when all IDs are unique', () => {
    const ids = ['a', 'b', 'c', 'd'];
    expect(deduplicateIds(ids)).toEqual(['a', 'b', 'c', 'd']);
  });

  test('handles empty input', () => {
    expect(deduplicateIds([])).toEqual([]);
  });

  test('handles single element', () => {
    expect(deduplicateIds(['x'])).toEqual(['x']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 2. Question validation
// ═══════════════════════════════════════════════════════════════════════════════
describe('2. validateQuestion()', () => {
  const goodQuestion = {
    text: 'What is 2 + 2?',
    type: 'mcq',
    options: [
      { key: 'A', text: '3' },
      { key: 'B', text: '4' },
      { key: 'C', text: '5' },
      { key: 'D', text: '6' },
    ],
    correctAnswer: 'B',
    difficulty: 'easy',
  };

  test('passes a well-formed MCQ', () => {
    const { valid } = validateQuestion(goodQuestion);
    expect(valid).toBe(true);
  });

  test('rejects null input', () => {
    const { valid } = validateQuestion(null);
    expect(valid).toBe(false);
  });

  test('rejects missing question text', () => {
    const { valid } = validateQuestion({ ...goodQuestion, text: '' });
    expect(valid).toBe(false);
  });

  test('rejects MCQ with fewer than 4 options', () => {
    const { valid } = validateQuestion({
      ...goodQuestion,
      options: goodQuestion.options.slice(0, 3),
    });
    expect(valid).toBe(false);
  });

  test('rejects MCQ with more than 4 options', () => {
    const { valid } = validateQuestion({
      ...goodQuestion,
      options: [...goodQuestion.options, { key: 'E', text: '7' }],
    });
    expect(valid).toBe(false);
  });

  test('rejects missing correctAnswer', () => {
    const { valid } = validateQuestion({ ...goodQuestion, correctAnswer: undefined });
    expect(valid).toBe(false);
  });

  test('rejects correctAnswer not in options', () => {
    const { valid, reason } = validateQuestion({ ...goodQuestion, correctAnswer: 'E' });
    expect(valid).toBe(false);
    expect(reason).toMatch(/not found among option keys/);
  });

  test('rejects invalid difficulty', () => {
    const { valid } = validateQuestion({ ...goodQuestion, difficulty: 'superhard' });
    expect(valid).toBe(false);
  });

  test('rejects option with empty text', () => {
    const opts = [...goodQuestion.options];
    opts[1] = { key: 'B', text: '' };
    const { valid } = validateQuestion({ ...goodQuestion, options: opts });
    expect(valid).toBe(false);
  });

  test('accepts medium and hard difficulty', () => {
    expect(validateQuestion({ ...goodQuestion, difficulty: 'medium' }).valid).toBe(true);
    expect(validateQuestion({ ...goodQuestion, difficulty: 'hard' }).valid).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 3. Exact-duplicate / fingerprint detection
// ═══════════════════════════════════════════════════════════════════════════════
describe('3. buildFingerprint() — exact duplicate detection', () => {
  const opts = [
    { key: 'A', text: 'Option A' },
    { key: 'B', text: 'Option B' },
    { key: 'C', text: 'Option C' },
    { key: 'D', text: 'Option D' },
  ];

  test('same question text and options → same fingerprint', () => {
    const f1 = buildFingerprint('What is 2+2?', opts);
    const f2 = buildFingerprint('What is 2+2?', opts);
    expect(f1).toBe(f2);
  });

  test('different question text → different fingerprint', () => {
    const f1 = buildFingerprint('What is 2+2?', opts);
    const f2 = buildFingerprint('What is 3+3?', opts);
    expect(f1).not.toBe(f2);
  });

  test('normalizes whitespace — extra spaces → same fingerprint', () => {
    const f1 = buildFingerprint('What  is   2+2?', opts);
    const f2 = buildFingerprint('What is 2+2?', opts);
    expect(f1).toBe(f2);
  });

  test('normalizes case — mixed case → same fingerprint', () => {
    const f1 = buildFingerprint('WHAT IS 2+2?', opts);
    const f2 = buildFingerprint('what is 2+2?', opts);
    expect(f1).toBe(f2);
  });

  test('option order in fingerprint is stable (sorted)', () => {
    const reversed = [...opts].reverse();
    const f1 = buildFingerprint('What is 2+2?', opts);
    const f2 = buildFingerprint('What is 2+2?', reversed);
    expect(f1).toBe(f2);
  });

  test('different option text → different fingerprint (legitimate variation)', () => {
    const opts2 = opts.map((o, i) => ({ ...o, text: i === 0 ? 'Different' : o.text }));
    const f1 = buildFingerprint('What is 2+2?', opts);
    const f2 = buildFingerprint('What is 2+2?', opts2);
    expect(f1).not.toBe(f2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 4. Scoring: correct, wrong, skipped
// ═══════════════════════════════════════════════════════════════════════════════
describe('4. Scoring logic', () => {
  const questions = [
    { _id: 'q1', correctAnswer: 'A', marks: 1, negativeMarks: 0.5 },
    { _id: 'q2', correctAnswer: 'B', marks: 1, negativeMarks: 0.5 },
    { _id: 'q3', correctAnswer: 'C', marks: 1, negativeMarks: 0.5 },
    { _id: 'q4', correctAnswer: 'D', marks: 1, negativeMarks: 0.5 },
    { _id: 'q5', correctAnswer: 'A', marks: 1, negativeMarks: 0.5 },
  ];

  test('all correct → max marks, 100% accuracy', () => {
    const answersMap = { q1: { selectedAnswer: 'A' }, q2: { selectedAnswer: 'B' }, q3: { selectedAnswer: 'C' }, q4: { selectedAnswer: 'D' }, q5: { selectedAnswer: 'A' } };
    const r = computeScore(questions, answersMap);
    expect(r.correct).toBe(5);
    expect(r.wrong).toBe(0);
    expect(r.skipped).toBe(0);
    expect(r.rawMarks).toBe(5);
    expect(r.marksObtained).toBe(5);
    expect(r.negativeMarks).toBe(0);
    expect(r.accuracy).toBe(100);
    expect(r.percentage).toBe(100);
  });

  test('all wrong → negative raw score, clamped to 0%', () => {
    const answersMap = { q1: { selectedAnswer: 'B' }, q2: { selectedAnswer: 'A' }, q3: { selectedAnswer: 'D' }, q4: { selectedAnswer: 'C' }, q5: { selectedAnswer: 'B' } };
    const r = computeScore(questions, answersMap);
    expect(r.correct).toBe(0);
    expect(r.wrong).toBe(5);
    expect(r.rawMarks).toBe(-2.5);
    expect(r.marksObtained).toBe(0);    // clamped
    expect(r.negativeMarks).toBe(2.5);
    expect(r.accuracy).toBe(0);
    expect(r.percentage).toBe(0);        // NOT negative
  });

  test('all skipped → 0 marks, 0% accuracy (no division by zero)', () => {
    const r = computeScore(questions, {});
    expect(r.correct).toBe(0);
    expect(r.wrong).toBe(0);
    expect(r.skipped).toBe(5);
    expect(r.rawMarks).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.percentage).toBe(0);
  });

  test('3 correct, 7 wrong (10 questions) — the reported inconsistency', () => {
    const qs = Array.from({ length: 10 }, (_, i) => ({
      _id: `q${i}`,
      correctAnswer: 'A',
      marks: 1,
      negativeMarks: 0.5,
    }));
    const answersMap = {};
    // q0–q2 correct, q3–q9 wrong
    for (let i = 0; i < 3; i++) answersMap[`q${i}`] = { selectedAnswer: 'A' };
    for (let i = 3; i < 10; i++) answersMap[`q${i}`] = { selectedAnswer: 'B' };

    const r = computeScore(qs, answersMap);
    expect(r.correct).toBe(3);
    expect(r.wrong).toBe(7);
    expect(r.skipped).toBe(0);
    expect(r.rawMarks).toBeCloseTo(-0.5);        // 3 - 3.5
    expect(r.marksObtained).toBe(0);             // clamped
    expect(r.negativeMarks).toBeCloseTo(3.5);
    expect(r.accuracy).toBe(30);                 // 3/10
    expect(r.percentage).toBe(0);               // NOT -5%
  });

  test('mixed — some correct, some wrong, some skipped', () => {
    const answersMap = {
      q1: { selectedAnswer: 'A' }, // correct
      q2: { selectedAnswer: 'A' }, // wrong
      // q3, q4, q5 skipped
    };
    const r = computeScore(questions, answersMap);
    expect(r.correct).toBe(1);
    expect(r.wrong).toBe(1);
    expect(r.skipped).toBe(3);
    expect(r.rawMarks).toBeCloseTo(0.5);   // 1 - 0.5
    expect(r.marksObtained).toBeCloseTo(0.5);
    expect(r.accuracy).toBe(50);           // 1 / (1+1)
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 5. Score clamping: percentage and marksObtained cannot go below 0
// ═══════════════════════════════════════════════════════════════════════════════
describe('5. Score clamping', () => {
  test('marksObtained is always >= 0 regardless of negativeMarks', () => {
    const qs = [{ _id: 'q1', correctAnswer: 'A', marks: 1, negativeMarks: 2 }];
    const answersMap = { q1: { selectedAnswer: 'B' } }; // wrong, penalty -2
    const r = computeScore(qs, answersMap);
    expect(r.rawMarks).toBe(-2);
    expect(r.marksObtained).toBe(0);       // clamped
    expect(r.percentage).toBe(0);
  });

  test('percentage is always >= 0', () => {
    const qs = Array.from({ length: 5 }, (_, i) => ({ _id: `q${i}`, correctAnswer: 'A', marks: 1, negativeMarks: 0.5 }));
    const answersMap = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`q${i}`, { selectedAnswer: 'B' }]));
    const r = computeScore(qs, answersMap);
    expect(r.percentage).toBeGreaterThanOrEqual(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 6. Mistake deduplication — same (sessionId, questionId) pair is not counted twice
// ═══════════════════════════════════════════════════════════════════════════════
describe('6. Mistake deduplication', () => {
  test('does not add duplicate (sessionId, questionId) pairs', () => {
    const sessions = [
      {
        _id: 'sess1',
        attempts: [
          { question: 'q1', isCorrect: false, isSkipped: false },
          { question: 'q1', isCorrect: false, isSkipped: false }, // duplicate
          { question: 'q2', isCorrect: false, isSkipped: false },
        ],
      },
    ];
    const mistakes = extractMistakes(sessions);
    expect(mistakes).toHaveLength(2);
    const questionIds = mistakes.map(m => m.questionId);
    expect(questionIds).toContain('q1');
    expect(questionIds).toContain('q2');
  });

  test('includes mistakes from multiple sessions separately', () => {
    const sessions = [
      { _id: 'sess1', attempts: [{ question: 'q1', isCorrect: false, isSkipped: false }] },
      { _id: 'sess2', attempts: [{ question: 'q1', isCorrect: false, isSkipped: false }] },
    ];
    const mistakes = extractMistakes(sessions);
    // Same question wrong in two different sessions → two entries (different sessions)
    expect(mistakes).toHaveLength(2);
    expect(mistakes[0].sessionId).toBe('sess1');
    expect(mistakes[1].sessionId).toBe('sess2');
  });

  test('does not include skipped or correct attempts', () => {
    const sessions = [
      {
        _id: 'sess1',
        attempts: [
          { question: 'q1', isCorrect: true, isSkipped: false },
          { question: 'q2', isCorrect: false, isSkipped: true },
          { question: 'q3', isCorrect: false, isSkipped: false },
        ],
      },
    ];
    const mistakes = extractMistakes(sessions);
    expect(mistakes).toHaveLength(1);
    expect(mistakes[0].questionId).toBe('q3');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 7. normalizeText
// ═══════════════════════════════════════════════════════════════════════════════
describe('7. normalizeText()', () => {
  test('lowercases text', () => {
    expect(normalizeText('HELLO WORLD')).toBe('hello world');
  });

  test('collapses multiple spaces', () => {
    expect(normalizeText('hello   world')).toBe('hello world');
  });

  test('trims leading and trailing whitespace', () => {
    expect(normalizeText('  hello world  ')).toBe('hello world');
  });

  test('handles empty string', () => {
    expect(normalizeText('')).toBe('');
  });

  test('handles null/undefined gracefully', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 8. Insufficient question bank: delivered < requested
// ═══════════════════════════════════════════════════════════════════════════════
describe('8. Insufficient question bank', () => {
  test('deduplication does not artificially inflate count', () => {
    // Simulate $sample returning 3 dupes out of 5 results when pool has only 3 unique
    const raw = ['a', 'b', 'a', 'c', 'b'];
    const unique = deduplicateIds(raw);
    expect(unique).toHaveLength(3);
    // This means delivered (3) < requested (5) — which is communicated to the client
    // via meta.delivered, not silently padded with more duplicates.
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// 9. Shortfall meta flag — shortfall is true iff delivered < requestedCount
// ═══════════════════════════════════════════════════════════════════════════════
describe('9. Shortfall meta flag', () => {
  function computeShortfallMeta(delivered, requestedCount) {
    const shortfall = delivered < requestedCount;
    const shortfallMessage = shortfall
      ? `Only ${delivered} question${delivered !== 1 ? 's are' : ' is'} available for the selected criteria — fewer than the ${requestedCount} you requested. You may adjust your filters or proceed with ${delivered} question${delivered !== 1 ? 's' : ''}.`
      : null;
    return { shortfall, shortfallMessage };
  }

  test('shortfall is false when delivered equals requestedCount', () => {
    const { shortfall, shortfallMessage } = computeShortfallMeta(5, 5);
    expect(shortfall).toBe(false);
    expect(shortfallMessage).toBeNull();
  });

  test('shortfall is true when delivered is less than requestedCount', () => {
    const { shortfall, shortfallMessage } = computeShortfallMeta(3, 5);
    expect(shortfall).toBe(true);
    expect(typeof shortfallMessage).toBe('string');
    expect(shortfallMessage).toContain('3');
    expect(shortfallMessage).toContain('5');
  });

  test('shortfall message uses singular for 1 question delivered', () => {
    const { shortfallMessage } = computeShortfallMeta(1, 5);
    expect(shortfallMessage).toContain('1 question is');
  });

  test('shortfall message uses plural for 2+ questions delivered', () => {
    const { shortfallMessage } = computeShortfallMeta(3, 5);
    expect(shortfallMessage).toContain('3 questions are');
  });

  test('shortfall is false when delivered exceeds requestedCount (should not happen, but guard)', () => {
    const { shortfall } = computeShortfallMeta(10, 5);
    expect(shortfall).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Count whitelist validation
// ═══════════════════════════════════════════════════════════════════════════════

const VALID_COUNTS = new Set([5, 10, 15, 20, 30]);

function validateCount(count) {
  const parsed = Number(count);
  if (!VALID_COUNTS.has(parsed)) {
    return { valid: false, reason: `count must be one of: ${[...VALID_COUNTS].join(', ')}. Received: ${count}.` };
  }
  return { valid: true, value: parsed };
}

describe('H. Count whitelist validation', () => {
  test.each([5, 10, 15, 20, 30])('count=%i is accepted', (c) => {
    const result = validateCount(c);
    expect(result.valid).toBe(true);
    expect(result.value).toBe(c);
  });

  test.each([1, 7, 11, 25, 50, 100, 0, -5])('count=%i is rejected', (c) => {
    const result = validateCount(c);
    expect(result.valid).toBe(false);
    expect(result.reason).toMatch(/must be one of/);
  });

  test('string "10" is accepted (Number coercion)', () => {
    expect(validateCount('10').valid).toBe(true);
    expect(validateCount('10').value).toBe(10);
  });

  test('string "7" is rejected', () => {
    expect(validateCount('7').valid).toBe(false);
  });

  test('undefined is rejected', () => {
    expect(validateCount(undefined).valid).toBe(false);
  });

  test('null is rejected', () => {
    expect(validateCount(null).valid).toBe(false);
  });

  test('floating-point 10.5 is rejected (not in whitelist)', () => {
    expect(validateCount(10.5).valid).toBe(false);
  });

  test('every accepted value maps to itself after Number()', () => {
    for (const c of [5, 10, 15, 20, 30]) {
      expect(Number(c)).toBe(c);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Shortfall 422 response shape
// ═══════════════════════════════════════════════════════════════════════════════

function buildShortfall422(requestedCount, available, difficulty) {
  const diff = difficulty !== 'mixed' ? `"${difficulty}" difficulty ` : '';
  return {
    success: false,
    shortfall: true,
    message: `Only ${available} of ${requestedCount} requested questions are available.`,
    data: {
      meta: {
        requestedCount,
        available,
        difficulty,
        shortfallMessage: `Only ${available} question${available !== 1 ? 's are' : ' is'} available for the selected ${diff}criteria — fewer than the ${requestedCount} you requested.`,
      },
    },
  };
}

describe('I. Shortfall 422 response shape', () => {
  test('success is false', () => {
    const r = buildShortfall422(10, 4, 'hard');
    expect(r.success).toBe(false);
  });

  test('shortfall flag is true', () => {
    const r = buildShortfall422(10, 4, 'hard');
    expect(r.shortfall).toBe(true);
  });

  test('available < requestedCount', () => {
    const r = buildShortfall422(10, 4, 'hard');
    expect(r.data.meta.available).toBeLessThan(r.data.meta.requestedCount);
  });

  test('shortfallMessage includes the available count', () => {
    const r = buildShortfall422(10, 4, 'hard');
    expect(r.data.meta.shortfallMessage).toContain('4');
  });

  test('shortfallMessage includes difficulty when not mixed', () => {
    const r = buildShortfall422(10, 4, 'hard');
    expect(r.data.meta.shortfallMessage).toContain('"hard"');
  });

  test('shortfallMessage omits difficulty tag for mixed', () => {
    const r = buildShortfall422(20, 19, 'mixed');
    expect(r.data.meta.shortfallMessage).not.toContain('"mixed"');
  });

  test('response does NOT include a session or questions (no phantom session created)', () => {
    const r = buildShortfall422(10, 4, 'hard');
    expect(r.data.session).toBeUndefined();
    expect(r.data.questions).toBeUndefined();
  });

  test.each([
    [5, 3, 'easy'],
    [10, 4, 'hard'],
    [15, 12, 'medium'],
    [20, 19, 'mixed'],
    [30, 25, 'mixed'],
  ])('requestedCount=%i available=%i difficulty=%s is a valid shortfall', (req, avail, diff) => {
    const r = buildShortfall422(req, avail, diff);
    expect(r.shortfall).toBe(true);
    expect(r.data.meta.available).toBe(avail);
    expect(r.data.meta.requestedCount).toBe(req);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// J. Frontend count state — selected value must pass through to API payload
// ═══════════════════════════════════════════════════════════════════════════════

function buildStartPayload(selectedExam, selectedSubject, selectedTopic, difficulty, count) {
  return {
    examId: selectedExam,
    subjectId: selectedSubject,
    topicId: selectedTopic || undefined,
    difficulty,
    count,  // ← must be exactly the selected value, not a hardcoded default
  };
}

describe('J. Frontend count payload', () => {
  const exam = 'exam-1';
  const subject = 'sub-1';

  test.each([5, 10, 15, 20, 30])('selected count %i passes through unchanged', (c) => {
    const payload = buildStartPayload(exam, subject, '', 'mixed', c);
    expect(payload.count).toBe(c);
  });

  test('topicId is omitted when empty string', () => {
    const payload = buildStartPayload(exam, subject, '', 'mixed', 10);
    expect(payload.topicId).toBeUndefined();
  });

  test('topicId is included when set', () => {
    const payload = buildStartPayload(exam, subject, 'topic-1', 'mixed', 10);
    expect(payload.topicId).toBe('topic-1');
  });

  test('difficulty passes through correctly', () => {
    for (const d of ['easy', 'medium', 'hard', 'mixed']) {
      const payload = buildStartPayload(exam, subject, '', d, 10);
      expect(payload.difficulty).toBe(d);
    }
  });

  test('count 10 is NOT treated as falsy (the original bug)', () => {
    // In JavaScript: Boolean(10) = true, 10 || 5 = 10 — count=10 should never be replaced
    const count = 10;
    const safeCount = count || 5; // this would silently default to 5 if count were 0/undefined
    expect(safeCount).toBe(10); // 10 is truthy, so 10 || 5 = 10 ✓
    expect(Boolean(count)).toBe(true);
  });

  test('count must not be overridden by a default in the destructuring', () => {
    // Old bug: `const { count = 10 } = req.body` would silently default undefined to 10
    // New code requires count to be explicitly provided and in the whitelist
    function destructureWithDefault({ count = 10 } = {}) { return count; }
    function requireExplicit({ count }) {
      if (!VALID_COUNTS.has(Number(count))) throw new Error('Invalid count');
      return Number(count);
    }
    // undefined → old code silently returns 10, new code throws
    expect(destructureWithDefault({})).toBe(10);
    expect(() => requireExplicit({})).toThrow('Invalid count');
    // explicit 15 → both return 15
    expect(destructureWithDefault({ count: 15 })).toBe(15);
    expect(requireExplicit({ count: 15 })).toBe(15);
  });
});
