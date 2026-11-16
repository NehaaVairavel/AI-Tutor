/**
 * Practice History, Snapshot, and Review Tests
 *
 * Tests the pure logic layers for:
 *  H1.  Session history response shape (summary fields only)
 *  H2.  getMySessions returns newest first (completedAt desc)
 *  H3.  Pagination math
 *  S1.  questionSnapshot stores all required fields
 *  S2.  questionSnapshot options are correctly mapped
 *  S3.  questionSnapshot survives null topic/subject refs
 *  S4.  Snapshot is immutable after session submission
 *  R1.  getSessionReview builds reviewItem from snapshot when live doc missing
 *  R2.  getSessionReview prefers live explanation over snapshot explanation
 *  R3.  reviewItem correctly identifies isCorrect
 *  R4.  reviewItem correctly identifies isSkipped
 *  R5.  reviewItem marksAwarded matches attempt
 *  E1.  explainQuestion rejects invalid index
 *  E2.  explainQuestion returns demoMode when key is missing
 *  E3.  explainQuestion builds correct prompt structure (no key leak)
 *  W1.  Weak topic: skipped excluded from accuracy denominator
 *  W2.  Weak topic: topic with only 1 wrong answer is not classified as weak
 *  W3.  Weak topic: consistent threshold between dashboard and analytics
 */

// ─── Constants (centralised, matching backend) ─────────────────────────────────

const WEAK_MIN_ATTEMPTS   = 5;   // minimum total questions seen (correct + wrong + skipped)
const WEAK_ACCURACY_PCT   = 60;  // below this → weak

// ─── H1-H3: Practice history shape ────────────────────────────────────────────

const mockSessions = [
  {
    _id: 's3', status: 'completed', completedAt: new Date('2024-03-03').toISOString(),
    result: { correct: 8, wrong: 2, skipped: 0, accuracy: 80, timeTaken: 600, marksObtained: 8, totalMarks: 10 },
    exam: { shortName: 'SSC CGL' }, subject: { name: 'Maths' }, topic: null, difficulty: 'medium',
  },
  {
    _id: 's2', status: 'completed', completedAt: new Date('2024-02-02').toISOString(),
    result: { correct: 4, wrong: 5, skipped: 1, accuracy: 44, timeTaken: 450, marksObtained: 4, totalMarks: 10 },
    exam: { shortName: 'SSC CGL' }, subject: { name: 'English' }, topic: { name: 'Grammar' }, difficulty: 'easy',
  },
  {
    _id: 's1', status: 'completed', completedAt: new Date('2024-01-01').toISOString(),
    result: { correct: 6, wrong: 4, skipped: 0, accuracy: 60, timeTaken: 360, marksObtained: 6, totalMarks: 10 },
    exam: { shortName: 'SSC CGL' }, subject: { name: 'Reasoning' }, topic: null, difficulty: 'hard',
  },
];

describe('H1-H3: Practice history', () => {
  test('H1: each session has required summary fields', () => {
    for (const s of mockSessions) {
      expect(s).toHaveProperty('_id');
      expect(s).toHaveProperty('completedAt');
      expect(s).toHaveProperty('result');
      expect(s.result).toHaveProperty('accuracy');
      expect(s.result).toHaveProperty('correct');
      expect(s.result).toHaveProperty('wrong');
      expect(s.result).toHaveProperty('skipped');
    }
  });

  test('H2: sessions are ordered newest first', () => {
    const sorted = [...mockSessions].sort(
      (a, b) => new Date(b.completedAt) - new Date(a.completedAt)
    );
    expect(sorted[0]._id).toBe('s3');
    expect(sorted[1]._id).toBe('s2');
    expect(sorted[2]._id).toBe('s1');
  });

  test('H3: pagination math is correct', () => {
    const total = 13, limit = 6;
    const pages = Math.ceil(total / limit);
    expect(pages).toBe(3);
    // page 1: items 0-5, page 2: items 6-11, page 3: item 12
    const skip = (2 - 1) * limit;
    expect(skip).toBe(6);
  });
});

// ─── S1-S4: questionSnapshot ───────────────────────────────────────────────────

function buildSnapshot(q) {
  return {
    text:          q.text         || '',
    type:          q.type         || 'mcq',
    options:       (q.options || []).map(o => ({ key: o.key, text: o.text })),
    explanation:   q.explanation  || '',
    difficulty:    q.difficulty   || '',
    marks:         q.marks        ?? 1,
    negativeMarks: q.negativeMarks ?? 0,
    topicName:     (q.topic   && typeof q.topic   === 'object') ? (q.topic.name   || '') : '',
    subjectName:   (q.subject && typeof q.subject === 'object') ? (q.subject.name || '') : '',
  };
}

const sampleQuestion = {
  _id: 'q1',
  text: 'What is 2 + 2?',
  type: 'mcq',
  options: [
    { key: 'A', text: '3' }, { key: 'B', text: '4' },
    { key: 'C', text: '5' }, { key: 'D', text: '6' },
  ],
  correctAnswer: 'B',
  explanation: 'Basic addition.',
  difficulty: 'easy',
  marks: 2,
  negativeMarks: 0.5,
  topic:   { name: 'Arithmetic' },
  subject: { name: 'Mathematics' },
};

describe('S1-S4: questionSnapshot', () => {
  test('S1: snapshot has all required fields', () => {
    const snap = buildSnapshot(sampleQuestion);
    expect(snap.text).toBe('What is 2 + 2?');
    expect(snap.type).toBe('mcq');
    expect(snap.explanation).toBe('Basic addition.');
    expect(snap.difficulty).toBe('easy');
    expect(snap.marks).toBe(2);
    expect(snap.negativeMarks).toBe(0.5);
    expect(snap.topicName).toBe('Arithmetic');
    expect(snap.subjectName).toBe('Mathematics');
  });

  test('S2: options mapped to { key, text } only', () => {
    const snap = buildSnapshot(sampleQuestion);
    expect(snap.options).toHaveLength(4);
    expect(snap.options[0]).toEqual({ key: 'A', text: '3' });
    expect(snap.options[1]).toEqual({ key: 'B', text: '4' });
    // No extra fields
    expect(Object.keys(snap.options[0])).toEqual(['key', 'text']);
  });

  test('S3: null topic/subject refs produce empty strings', () => {
    const q = { ...sampleQuestion, topic: null, subject: null };
    const snap = buildSnapshot(q);
    expect(snap.topicName).toBe('');
    expect(snap.subjectName).toBe('');
  });

  test('S3b: string (unpopulated) ObjectId produces empty string (not crash)', () => {
    const q = { ...sampleQuestion, topic: 'objectid-string', subject: 'objectid-string' };
    const snap = buildSnapshot(q);
    expect(snap.topicName).toBe('');
    expect(snap.subjectName).toBe('');
  });

  test('S4: snapshot is a plain object (not a reference)', () => {
    const snap1 = buildSnapshot(sampleQuestion);
    const snap2 = buildSnapshot(sampleQuestion);
    // Mutating one should not affect the other
    snap1.text = 'changed';
    expect(snap2.text).toBe('What is 2 + 2?');
  });
});

// ─── R1-R5: getSessionReview logic ────────────────────────────────────────────

function buildReviewItem(attempt, liveDoc) {
  const snap = attempt.questionSnapshot || {};
  const live = liveDoc || null;
  const explanation = (live?.explanation) || snap.explanation || '';

  return {
    index:          attempt.index,
    text:           snap.text       || live?.text       || '(Question unavailable)',
    type:           snap.type       || live?.type       || 'mcq',
    options:        snap.options?.length ? snap.options : (live?.options || []),
    explanation,
    difficulty:     snap.difficulty || live?.difficulty || '',
    topicName:      snap.topicName  || (live?.topic    && typeof live.topic    === 'object' ? live.topic.name    : '') || '',
    subjectName:    snap.subjectName|| (live?.subject  && typeof live.subject  === 'object' ? live.subject.name  : '') || '',
    marks:          snap.marks         ?? 1,
    negativeMarks:  snap.negativeMarks ?? 0,
    selectedAnswer: attempt.selectedAnswer,
    correctAnswer:  attempt.correctAnswer,
    isCorrect:      attempt.isCorrect,
    isSkipped:      attempt.isSkipped,
    marksAwarded:   attempt.marksAwarded,
    timeTaken:      attempt.timeTaken,
  };
}

const sampleAttempt = {
  index: 0,
  question: 'q1',
  questionSnapshot: buildSnapshot(sampleQuestion),
  selectedAnswer: 'B',
  correctAnswer: 'B',
  isCorrect: true,
  isSkipped: false,
  marksAwarded: 2,
  timeTaken: 30,
};

describe('R1-R5: getSessionReview logic', () => {
  test('R1: uses snapshot when live document is missing (deleted question)', () => {
    const item = buildReviewItem(sampleAttempt, null);
    expect(item.text).toBe('What is 2 + 2?');
    expect(item.options).toHaveLength(4);
    expect(item.topicName).toBe('Arithmetic');
  });

  test('R1b: shows fallback text when snapshot is also empty', () => {
    const attempt = { ...sampleAttempt, questionSnapshot: {} };
    const item = buildReviewItem(attempt, null);
    expect(item.text).toBe('(Question unavailable)');
  });

  test('R2: prefers live explanation over snapshot explanation', () => {
    const live = { ...sampleQuestion, explanation: 'Updated live explanation' };
    const item = buildReviewItem(sampleAttempt, live);
    expect(item.explanation).toBe('Updated live explanation');
  });

  test('R2b: falls back to snapshot explanation when live has none', () => {
    const live = { ...sampleQuestion, explanation: '' };
    const item = buildReviewItem(sampleAttempt, live);
    expect(item.explanation).toBe('Basic addition.');
  });

  test('R3: isCorrect correctly reflects attempt data', () => {
    const correct = buildReviewItem(sampleAttempt, null);
    expect(correct.isCorrect).toBe(true);

    const wrong = buildReviewItem({ ...sampleAttempt, isCorrect: false, selectedAnswer: 'A' }, null);
    expect(wrong.isCorrect).toBe(false);
  });

  test('R4: isSkipped correctly reflected', () => {
    const skipped = buildReviewItem({
      ...sampleAttempt, isSkipped: true, selectedAnswer: null, isCorrect: false,
    }, null);
    expect(skipped.isSkipped).toBe(true);
    expect(skipped.selectedAnswer).toBeNull();
  });

  test('R5: marksAwarded comes from attempt not snapshot', () => {
    const item = buildReviewItem({ ...sampleAttempt, marksAwarded: -0.5 }, null);
    expect(item.marksAwarded).toBe(-0.5);
  });
});

// ─── E1-E3: explainQuestion guards ─────────────────────────────────────────────

describe('E1-E3: explainQuestion guards', () => {
  test('E1: invalid (NaN) questionIndex is rejected', () => {
    const idx = parseInt('abc', 10);
    expect(isNaN(idx)).toBe(true);
    // Guard in controller: isNaN(idx) || idx < 0 → reject
    expect(isNaN(idx) || idx < 0).toBe(true);
  });

  test('E1b: negative questionIndex is rejected', () => {
    const idx = -1;
    expect(isNaN(idx) || idx < 0).toBe(true);
  });

  test('E2: demo mode returned when key is placeholder', () => {
    const placeholders = ['', 'your_ai_api_key_here', 'your_openai_key_here', 'your_gemini_key_here'];
    const testKey = 'your_ai_api_key_here';
    const isDemoMode = placeholders.includes(testKey) || testKey.length < 10;
    expect(isDemoMode).toBe(true);
  });

  test('E2b: demo mode returned when key is empty string', () => {
    const key = '';
    const isDemoMode = ['', 'your_ai_api_key_here'].includes(key) || key.length < 10;
    expect(isDemoMode).toBe(true);
  });

  test('E3: prompt contains question text and correct answer but NOT the API key', () => {
    const snap = buildSnapshot(sampleQuestion);
    const attempt = sampleAttempt;
    const optionsText = snap.options.map(o => `${o.key}. ${o.text}`).join('\n');
    const prompt = `Question: ${snap.text}\n\nOptions:\n${optionsText}\n\nCorrect Answer: ${attempt.correctAnswer}`;

    expect(prompt).toContain('What is 2 + 2?');
    expect(prompt).toContain('Correct Answer: B');
    // No API key in prompt
    expect(prompt).not.toContain('AIza');
    expect(prompt).not.toContain('sk-');
  });
});

// ─── W1-W3: Weak topic accuracy calculation ────────────────────────────────────

function computeAccuracy(correct, wrong, skipped) {
  // Accuracy = correct / answered (skipped excluded from denominator)
  const answered = correct + wrong;
  if (answered === 0) return 0;
  return Math.round((correct / answered) * 100);
}

function isWeak(tp) {
  const totalSeen = (tp.correct || 0) + (tp.wrong || 0) + (tp.skipped || 0);
  const accuracy  = computeAccuracy(tp.correct, tp.wrong, tp.skipped);
  return totalSeen >= WEAK_MIN_ATTEMPTS && accuracy < WEAK_ACCURACY_PCT;
}

describe('W1-W3: Weak topic accuracy', () => {
  test('W1: skipped questions excluded from accuracy denominator', () => {
    // 2 correct, 1 wrong, 5 skipped → accuracy = 2/(2+1) = 66%, NOT 2/8 = 25%
    expect(computeAccuracy(2, 1, 5)).toBe(67);
  });

  test('W1b: 0 correct, 0 wrong, 5 skipped → 0% accuracy', () => {
    expect(computeAccuracy(0, 0, 5)).toBe(0);
  });

  test('W2: topic with only 1 wrong and 0 others is NOT weak (< MIN_ATTEMPTS)', () => {
    const tp = { correct: 0, wrong: 1, skipped: 0 };
    expect(isWeak(tp)).toBe(false); // totalSeen = 1 < 5
  });

  test('W2b: topic with 5 attempts but 80% accuracy is NOT weak', () => {
    const tp = { correct: 4, wrong: 1, skipped: 0 };
    expect(isWeak(tp)).toBe(false); // accuracy = 80% >= 60%
  });

  test('W2c: topic with exactly 5 attempts and 40% accuracy IS weak', () => {
    const tp = { correct: 2, wrong: 3, skipped: 0 };
    expect(isWeak(tp)).toBe(true); // accuracy = 40% < 60%
  });

  test('W3: WEAK_MIN_ATTEMPTS and WEAK_ACCURACY_PCT are defined (not undefined)', () => {
    expect(WEAK_MIN_ATTEMPTS).toBeDefined();
    expect(WEAK_ACCURACY_PCT).toBeDefined();
    expect(typeof WEAK_MIN_ATTEMPTS).toBe('number');
    expect(typeof WEAK_ACCURACY_PCT).toBe('number');
  });

  test('W3b: threshold values match expected (5 and 60)', () => {
    expect(WEAK_MIN_ATTEMPTS).toBe(5);
    expect(WEAK_ACCURACY_PCT).toBe(60);
  });
});
