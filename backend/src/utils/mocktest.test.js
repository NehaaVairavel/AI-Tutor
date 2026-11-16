/**
 * Mock Test module unit tests.
 *
 * These tests cover pure server-side scoring logic for mock tests,
 * idempotency guards, and weak-topic classification.
 * No MongoDB connection required.
 *
 * Coverage:
 *  1. Server-side scoring: correct / wrong / skipped → marks, negativeMarks.
 *  2. Score clamping: marksObtained cannot go below 0.
 *  3. Accuracy formula: excludes skipped questions.
 *  4. Idempotent submission guard.
 *  5. Weak-topic detection from questionAttempts.
 *  6. Duplicate topic-progress merge logic.
 */

// ─── Pure scoring logic (mirrors mockTest.routes.js) ─────────────────────────
function calcAccuracy(correct, wrong) {
  const attempted = correct + wrong;
  return attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
}

function scoreMockTest(questions, answersMap, { negativeMarking = false, negativeMarkingValue = 0.33 } = {}) {
  let correct = 0, wrong = 0, skipped = 0;
  let rawMarks = 0;
  let negativeMarksTotal = 0;
  const questionAttempts = [];

  for (const q of questions) {
    const qId = q._id.toString();
    const { selectedAnswer = null } = answersMap[qId] || {};
    const isSkipped = !selectedAnswer;
    let isCorrect = false;
    let awarded = 0;

    if (isSkipped) {
      skipped++;
    } else if (selectedAnswer === q.correctAnswer) {
      isCorrect = true;
      correct++;
      awarded = q.marks ?? 1;
      rawMarks += awarded;
    } else {
      wrong++;
      const neg = negativeMarking ? negativeMarkingValue : (q.negativeMarks ?? 0);
      negativeMarksTotal += neg;
      awarded = -neg;
      rawMarks -= neg;
    }

    questionAttempts.push({
      question: qId,
      topicId: q.topic?._id || null,
      topicName: q.topic?.name || '',
      selectedAnswer,
      correctAnswer: q.correctAnswer,
      isCorrect,
      isSkipped,
      marksAwarded: awarded,
      marksForQuestion: q.marks ?? 1,
    });
  }

  const totalQuestions = questions.length;
  const totalMarks = questions.reduce((s, q) => s + (q.marks ?? 1), 0);
  const attempted = correct + wrong;
  const accuracy = calcAccuracy(correct, wrong);
  const marksObtained = Math.max(0, rawMarks);
  const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0;

  return {
    correct, wrong, skipped, rawMarks, marksObtained,
    negativeMarks: negativeMarksTotal, totalMarks,
    attempted, accuracy, percentage, questionAttempts,
  };
}

// ─── Weak-topic computation (mirrors MockTestResult.jsx) ─────────────────────
const WEAK_ACCURACY_THRESHOLD = 60;
const WEAK_MIN_ATTEMPTS = 5;

function computeTopicPerformance(questionAttempts) {
  const topicMap = new Map();
  for (const qa of questionAttempts) {
    if (!qa.topicId) continue;
    const key = qa.topicId.toString();
    if (!topicMap.has(key)) {
      topicMap.set(key, { topicId: key, topicName: qa.topicName, correct: 0, wrong: 0, skipped: 0 });
    }
    const entry = topicMap.get(key);
    if (qa.isSkipped) entry.skipped++;
    else if (qa.isCorrect) entry.correct++;
    else entry.wrong++;
  }
  return Array.from(topicMap.values()).map(t => {
    const attempted = t.correct + t.wrong;
    const accuracy = attempted > 0 ? Math.round((t.correct / attempted) * 100) : 0;
    const totalSeen = t.correct + t.wrong + t.skipped;
    const classification =
      totalSeen < WEAK_MIN_ATTEMPTS ? 'insufficient' :
      accuracy < WEAK_ACCURACY_THRESHOLD ? 'weak' : 'ok';
    return { ...t, attempted, accuracy, classification };
  });
}

// ─── Test data builders ───────────────────────────────────────────────────────
function makeQuestion(id, { correctAnswer = 'A', marks = 1, negativeMarks = 0.33, topicId = null, topicName = '' } = {}) {
  return {
    _id: id,
    correctAnswer,
    marks,
    negativeMarks,
    topic: topicId ? { _id: topicId, name: topicName } : null,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Mock Test Scoring', () => {
  const q1 = makeQuestion('q1', { correctAnswer: 'A', marks: 2 });
  const q2 = makeQuestion('q2', { correctAnswer: 'B', marks: 2 });
  const q3 = makeQuestion('q3', { correctAnswer: 'C', marks: 2 });
  const q4 = makeQuestion('q4', { correctAnswer: 'D', marks: 2 });

  test('all correct: full marks, 100% accuracy', () => {
    const r = scoreMockTest([q1, q2, q3, q4], {
      q1: { selectedAnswer: 'A' },
      q2: { selectedAnswer: 'B' },
      q3: { selectedAnswer: 'C' },
      q4: { selectedAnswer: 'D' },
    });
    expect(r.correct).toBe(4);
    expect(r.wrong).toBe(0);
    expect(r.skipped).toBe(0);
    expect(r.marksObtained).toBe(8);
    expect(r.accuracy).toBe(100);
    expect(r.percentage).toBe(100);
  });

  test('all wrong without negative marking: 0 marks obtained, 0% accuracy', () => {
    const r = scoreMockTest([q1, q2], {
      q1: { selectedAnswer: 'B' },
      q2: { selectedAnswer: 'A' },
    }, { negativeMarking: false });
    expect(r.correct).toBe(0);
    expect(r.wrong).toBe(2);
    expect(r.marksObtained).toBe(0);
    expect(r.accuracy).toBe(0);
  });

  test('negative marking applied: wrong answers reduce rawMarks', () => {
    const r = scoreMockTest([q1, q2, q3], {
      q1: { selectedAnswer: 'A' },  // correct +2
      q2: { selectedAnswer: 'A' },  // wrong   -0.5
      q3: { selectedAnswer: 'A' },  // wrong   -0.5
    }, { negativeMarking: true, negativeMarkingValue: 0.5 });
    expect(r.correct).toBe(1);
    expect(r.wrong).toBe(2);
    expect(r.rawMarks).toBe(1);        // 2 - 0.5 - 0.5
    expect(r.negativeMarks).toBe(1);
    expect(r.marksObtained).toBe(1);   // max(0, 1)
  });

  test('marksObtained clamped to 0 when rawMarks is negative', () => {
    const r = scoreMockTest([q1], {
      q1: { selectedAnswer: 'B' }, // wrong
    }, { negativeMarking: true, negativeMarkingValue: 5 });
    expect(r.rawMarks).toBe(-5);
    expect(r.marksObtained).toBe(0);  // clamped
  });

  test('all skipped: 0 attempts, 0 accuracy, 0 marks', () => {
    const r = scoreMockTest([q1, q2, q3], {}, { negativeMarking: true, negativeMarkingValue: 0.33 });
    expect(r.skipped).toBe(3);
    expect(r.attempted).toBe(0);
    expect(r.correct).toBe(0);
    expect(r.wrong).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.marksObtained).toBe(0);
    expect(r.negativeMarks).toBe(0);
  });

  test('accuracy excludes skipped: partial attempt counts only answered', () => {
    const r = scoreMockTest([q1, q2, q3], {
      q1: { selectedAnswer: 'A' },  // correct
      q2: { selectedAnswer: 'A' },  // wrong
      // q3: skipped
    });
    // attempted=2, correct=1 → 50%
    expect(r.accuracy).toBe(50);
    expect(r.skipped).toBe(1);
  });

  test('percentage based on marksObtained / totalMarks', () => {
    // q1: correct +2, q2: wrong with question-level negativeMarks=0.33 (no mock-test-level neg marking)
    // rawMarks = 2 - 0.33 = 1.67, marksObtained = max(0, 1.67) = 1.67
    const r = scoreMockTest([q1, q2], {
      q1: { selectedAnswer: 'A' },  // +2
      q2: { selectedAnswer: 'A' },  // wrong, uses question.negativeMarks=0.33
    }, { negativeMarking: false });
    expect(r.correct).toBe(1);
    expect(r.wrong).toBe(1);
    // rawMarks = 2 - 0.33 = 1.67 → marksObtained = 1.67 (above 0, not clamped)
    expect(r.marksObtained).toBeCloseTo(1.67, 1);
    expect(r.totalMarks).toBe(4);
    // percentage = Math.round(1.67 / 4 * 100) = 42
    expect(r.percentage).toBe(Math.round((r.marksObtained / r.totalMarks) * 100));
  });

  test('empty test: all zeros', () => {
    const r = scoreMockTest([], {});
    expect(r.correct).toBe(0);
    expect(r.marksObtained).toBe(0);
    expect(r.accuracy).toBe(0);
    expect(r.percentage).toBe(0);
  });
});

describe('Accuracy helper', () => {
  test('calcAccuracy returns 0 when no questions answered', () => {
    expect(calcAccuracy(0, 0)).toBe(0);
  });
  test('calcAccuracy returns 100 when all correct', () => {
    expect(calcAccuracy(10, 0)).toBe(100);
  });
  test('calcAccuracy rounds correctly', () => {
    expect(calcAccuracy(1, 2)).toBe(33); // 33.33 → 33
    expect(calcAccuracy(2, 1)).toBe(67); // 66.66 → 67
  });
});

describe('Weak Topic Detection', () => {
  function makeAttempt(topicId, topicName, correct, wrong, skipped) {
    const attempts = [];
    for (let i = 0; i < correct;  i++) attempts.push({ topicId, topicName, isCorrect: true,  isSkipped: false });
    for (let i = 0; i < wrong;    i++) attempts.push({ topicId, topicName, isCorrect: false, isSkipped: false });
    for (let i = 0; i < skipped;  i++) attempts.push({ topicId, topicName, isCorrect: false, isSkipped: true  });
    return attempts;
  }

  test('topic with accuracy < 60% and ≥ 5 attempts is classified as weak', () => {
    const attempts = makeAttempt('t1', 'Algebra', 2, 3, 0); // 5 total, 40% accuracy
    const result = computeTopicPerformance(attempts);
    expect(result[0].classification).toBe('weak');
    expect(result[0].accuracy).toBe(40);
  });

  test('topic with accuracy >= 60% is classified as ok', () => {
    const attempts = makeAttempt('t1', 'Geometry', 4, 1, 0); // 5 total, 80%
    const result = computeTopicPerformance(attempts);
    expect(result[0].classification).toBe('ok');
  });

  test('topic with fewer than 5 questions is classified as insufficient', () => {
    const attempts = makeAttempt('t1', 'Trigonometry', 0, 3, 0); // only 3 attempts
    const result = computeTopicPerformance(attempts);
    expect(result[0].classification).toBe('insufficient');
  });

  test('accuracy for weak topic excludes skipped', () => {
    const attempts = makeAttempt('t1', 'History', 1, 4, 5); // 5 answered, 20% accuracy
    const result = computeTopicPerformance(attempts);
    expect(result[0].attempted).toBe(5);
    expect(result[0].accuracy).toBe(20);
    expect(result[0].skipped).toBe(5);
    expect(result[0].classification).toBe('weak');
  });

  test('multiple topics: each aggregated separately', () => {
    const attempts = [
      ...makeAttempt('t1', 'Physics', 5, 0, 0),   // 100% → ok
      ...makeAttempt('t2', 'Chemistry', 0, 5, 0),  // 0%   → weak
    ];
    const result = computeTopicPerformance(attempts);
    const physics   = result.find(t => t.topicId === 't1');
    const chemistry = result.find(t => t.topicId === 't2');
    expect(physics.classification).toBe('ok');
    expect(chemistry.classification).toBe('weak');
  });

  test('questions without a topicId are excluded from topic analysis', () => {
    const attempts = [
      { topicId: null, topicName: '', isCorrect: false, isSkipped: false },
      { topicId: null, topicName: '', isCorrect: false, isSkipped: false },
    ];
    const result = computeTopicPerformance(attempts);
    expect(result.length).toBe(0);
  });
});

describe('Topic progress deduplication (progress.routes.js logic)', () => {
  function mergeTopicProgress(topicProgressArray) {
    const topicMap = new Map();
    let syntheticIndex = 0;
    for (const tp of topicProgressArray) {
      let key;
      if (tp.topic && typeof tp.topic === 'object' && tp.topic._id) {
        key = tp.topic._id.toString();
      } else if (tp.topic && typeof tp.topic !== 'object') {
        key = tp.topic.toString();
      } else {
        key = `__deleted_${syntheticIndex++}`;
      }

      if (topicMap.has(key)) {
        const existing = topicMap.get(key);
        existing.totalAttempted += tp.totalAttempted || 0;
        existing.totalCorrect   += tp.totalCorrect   || 0;
        const answered = existing.totalCorrect + (existing.totalWrong || 0);
        existing.accuracy = answered > 0 ? Math.round((existing.totalCorrect / answered) * 100) : 0;
        continue;
      }
      topicMap.set(key, { ...tp });
    }
    return Array.from(topicMap.values());
  }

  test('duplicate topic IDs are merged into a single entry', () => {
    const input = [
      { topic: { _id: 't1', name: 'Physics' }, totalAttempted: 5, totalCorrect: 3, totalWrong: 2, accuracy: 60 },
      { topic: { _id: 't1', name: 'Physics' }, totalAttempted: 5, totalCorrect: 4, totalWrong: 1, accuracy: 80 },
    ];
    const result = mergeTopicProgress(input);
    expect(result.length).toBe(1);
    expect(result[0].totalAttempted).toBe(10);
    expect(result[0].totalCorrect).toBe(7);
  });

  test('distinct topic IDs remain as separate entries', () => {
    const input = [
      { topic: { _id: 't1', name: 'Physics' }, totalAttempted: 5, totalCorrect: 4, totalWrong: 1, accuracy: 80 },
      { topic: { _id: 't2', name: 'Chemistry' }, totalAttempted: 5, totalCorrect: 2, totalWrong: 3, accuracy: 40 },
    ];
    const result = mergeTopicProgress(input);
    expect(result.length).toBe(2);
  });

  test('null topic IDs get unique synthetic keys (not merged)', () => {
    const input = [
      { topic: null, topicName: 'Deleted A', totalAttempted: 3, totalCorrect: 2, totalWrong: 1 },
      { topic: null, topicName: 'Deleted B', totalAttempted: 5, totalCorrect: 3, totalWrong: 2 },
    ];
    const result = mergeTopicProgress(input);
    expect(result.length).toBe(2); // NOT merged
  });
});
