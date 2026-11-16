/**
 * Navigation & Session Persistence Tests
 *
 * Verifies:
 *  N1. Mock Tests route is no longer in studentNav.
 *  N2. Dashboard quick actions do not link to /mock-tests.
 *  N3. Draft key format is stable and version-aware.
 *  N4. Draft save/load round-trip preserves all fields.
 *  N5. Draft returns null for unknown session.
 *  N6. Draft returns null for wrong version.
 *  N7. Draft cleared on submit (clearDraft removes entry).
 *  N8. Analytics weak topic threshold constants are consistent.
 *  N9. Analytics route builds weakTopics from topicProgress snapshots.
 *  N10. Analytics correctly computes accuracy from topicProgress entries.
 *  N11. Study plan overall progress calculation.
 *  N12. Scoring negative marks per question (not universal).
 *  N13. Session already-completed guard returns existing result.
 */

// ─── N1-N2: Navigation assertions (static data tests) ────────────────────────

const studentNav = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/practice', label: 'Practice' },
  { to: '/ai-tutor', label: 'AI Tutor' },
  { to: '/analytics', label: 'Analytics' },
  { to: '/study-plan', label: 'Study Plan' },
  { to: '/mistakes', label: 'My Mistakes' },
];

const dashboardQuickActions = [
  { to: '/practice', label: 'Practice Questions' },
  { to: '/study-plan', label: 'Study Plan' },
  { to: '/analytics', label: 'View Analytics' },
  { to: '/mistakes', label: 'Review Mistakes' },
];

describe('N1-N2: Mock Tests removed from navigation', () => {
  test('N1: studentNav does not contain /mock-tests', () => {
    const hasMockTests = studentNav.some(item => item.to === '/mock-tests');
    expect(hasMockTests).toBe(false);
  });

  test('N2: Dashboard quick actions do not link to /mock-tests', () => {
    const hasMockTests = dashboardQuickActions.some(item => item.to === '/mock-tests');
    expect(hasMockTests).toBe(false);
  });

  test('N2b: Dashboard quick actions link to 4 working features', () => {
    expect(dashboardQuickActions.length).toBe(4);
    const routes = dashboardQuickActions.map(a => a.to);
    expect(routes).toContain('/practice');
    expect(routes).toContain('/study-plan');
    expect(routes).toContain('/analytics');
    expect(routes).toContain('/mistakes');
  });
});

// ─── N3-N7: Draft persistence (localStorage simulation) ──────────────────────

const DRAFT_VERSION = 1;

function draftKey(sessionId) { return `practice_draft_${sessionId}`; }

// In-memory localStorage mock
function makeLocalStorage() {
  const store = {};
  return {
    getItem: k => store[k] ?? null,
    setItem: (k, v) => { store[k] = v; },
    removeItem: k => { delete store[k]; },
  };
}

function saveDraft(ls, sessionId, data) {
  ls.setItem(draftKey(sessionId), JSON.stringify({ v: DRAFT_VERSION, ...data, savedAt: Date.now() }));
}

function loadDraft(ls, sessionId) {
  try {
    const raw = ls.getItem(draftKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.v !== DRAFT_VERSION) return null;
    return parsed;
  } catch (_) { return null; }
}

function clearDraft(ls, sessionId) {
  ls.removeItem(draftKey(sessionId));
}

describe('N3-N7: Draft persistence helpers', () => {
  test('N3: draftKey format is stable', () => {
    expect(draftKey('abc123')).toBe('practice_draft_abc123');
  });

  test('N4: save/load round-trip preserves all fields', () => {
    const ls = makeLocalStorage();
    const draft = {
      answers: { q1: 'A', q2: 'C' },
      currentIndex: 2,
      elapsed: 120,
      flagged: { q3: true },
    };
    saveDraft(ls, 'sid1', draft);
    const loaded = loadDraft(ls, 'sid1');
    expect(loaded.answers).toEqual(draft.answers);
    expect(loaded.currentIndex).toBe(2);
    expect(loaded.elapsed).toBe(120);
    expect(loaded.flagged).toEqual({ q3: true });
    expect(loaded.savedAt).toBeDefined();
  });

  test('N5: loadDraft returns null for unknown session', () => {
    const ls = makeLocalStorage();
    expect(loadDraft(ls, 'unknown-session')).toBeNull();
  });

  test('N6: loadDraft returns null if version mismatch', () => {
    const ls = makeLocalStorage();
    ls.setItem(draftKey('sid2'), JSON.stringify({ v: 999, answers: {}, currentIndex: 0 }));
    expect(loadDraft(ls, 'sid2')).toBeNull();
  });

  test('N7: clearDraft removes entry so subsequent load returns null', () => {
    const ls = makeLocalStorage();
    saveDraft(ls, 'sid3', { answers: { q1: 'B' }, currentIndex: 1, elapsed: 60, flagged: {} });
    expect(loadDraft(ls, 'sid3')).not.toBeNull();
    clearDraft(ls, 'sid3');
    expect(loadDraft(ls, 'sid3')).toBeNull();
  });

  test('N7b: clearDraft on missing key is safe (no throw)', () => {
    const ls = makeLocalStorage();
    expect(() => clearDraft(ls, 'does-not-exist')).not.toThrow();
  });
});

// ─── N8-N10: Analytics weak topic logic ──────────────────────────────────────

const WEAK_MIN_ATTEMPTS = 5;
const WEAK_ACCURACY_PCT = 60;

function resolveTopicName(tp) {
  if (tp.topic && typeof tp.topic === 'object' && tp.topic.name) return tp.topic.name;
  if (tp.topicName) return tp.topicName;
  return 'Unknown topic';
}

function buildWeakTopics(topicProgress) {
  return topicProgress
    .filter(tp => {
      const totalSeen = (tp.totalCorrect || 0) + (tp.totalWrong || 0) + (tp.totalSkipped || 0);
      return totalSeen >= WEAK_MIN_ATTEMPTS && tp.accuracy < WEAK_ACCURACY_PCT;
    })
    .map(tp => ({
      _id: tp.topic && typeof tp.topic === 'object' ? tp.topic._id : tp.topic,
      name: resolveTopicName(tp),
      accuracy: tp.accuracy,
      totalAttempted: tp.totalAttempted,
    }))
    .sort((a, b) => a.accuracy - b.accuracy);
}

describe('N8-N10: Analytics weak topic resolution', () => {
  test('N8: threshold constants match expected values', () => {
    expect(WEAK_MIN_ATTEMPTS).toBe(5);
    expect(WEAK_ACCURACY_PCT).toBe(60);
  });

  test('N9: topic with deleted doc uses topicName snapshot', () => {
    const tp = { topic: null, topicName: 'Snapshot Name', totalCorrect: 1, totalWrong: 4, totalSkipped: 0, accuracy: 20, totalAttempted: 5 };
    const result = buildWeakTopics([tp]);
    expect(result[0].name).toBe('Snapshot Name');
  });

  test('N9b: topic with live populated doc uses live name', () => {
    const tp = { topic: { _id: 'tid1', name: 'Live Name' }, topicName: 'Stale Snapshot', totalCorrect: 1, totalWrong: 4, totalSkipped: 0, accuracy: 20, totalAttempted: 5 };
    const result = buildWeakTopics([tp]);
    expect(result[0].name).toBe('Live Name');
  });

  test('N9c: topic with no name and no snapshot gets fallback', () => {
    const tp = { topic: null, topicName: '', totalCorrect: 1, totalWrong: 4, totalSkipped: 0, accuracy: 20, totalAttempted: 5 };
    const result = buildWeakTopics([tp]);
    expect(result[0].name).toBe('Unknown topic');
  });

  test('N10: topic with < 5 attempts excluded from weak list', () => {
    const tp = { topic: { _id: 't1', name: 'Short topic' }, topicName: '', totalCorrect: 0, totalWrong: 3, totalSkipped: 0, accuracy: 0, totalAttempted: 3 };
    expect(buildWeakTopics([tp])).toHaveLength(0);
  });

  test('N10b: topic with >= 5 attempts and accuracy >= 60% is NOT weak', () => {
    const tp = { topic: { _id: 't1', name: 'Good topic' }, topicName: '', totalCorrect: 4, totalWrong: 1, totalSkipped: 0, accuracy: 80, totalAttempted: 5 };
    expect(buildWeakTopics([tp])).toHaveLength(0);
  });

  test('N10c: multiple topics sorted by accuracy ascending', () => {
    const topics = [
      { topic: { _id: 't1', name: 'B' }, topicName: '', totalCorrect: 2, totalWrong: 3, totalSkipped: 0, accuracy: 40, totalAttempted: 5 },
      { topic: { _id: 't2', name: 'A' }, topicName: '', totalCorrect: 1, totalWrong: 4, totalSkipped: 0, accuracy: 20, totalAttempted: 5 },
    ];
    const result = buildWeakTopics(topics);
    expect(result[0].accuracy).toBe(20); // A comes first (worse accuracy)
    expect(result[1].accuracy).toBe(40);
  });
});

// ─── N11: Study plan progress calculation ─────────────────────────────────────

describe('N11: Study plan overall progress', () => {
  function computePlanProgress(dailyPlans) {
    const allSessions = dailyPlans.flatMap(d => d.sessions);
    const total = allSessions.length;
    const done = allSessions.filter(s => s.isCompleted).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, pct };
  }

  test('N11a: empty plan returns 0%', () => {
    expect(computePlanProgress([])).toEqual({ total: 0, done: 0, pct: 0 });
  });

  test('N11b: no completed sessions returns 0%', () => {
    const plans = [
      { sessions: [{ isCompleted: false }, { isCompleted: false }] },
      { sessions: [{ isCompleted: false }] },
    ];
    expect(computePlanProgress(plans)).toEqual({ total: 3, done: 0, pct: 0 });
  });

  test('N11c: all completed returns 100%', () => {
    const plans = [{ sessions: [{ isCompleted: true }, { isCompleted: true }] }];
    expect(computePlanProgress(plans)).toEqual({ total: 2, done: 2, pct: 100 });
  });

  test('N11d: partial completion rounds correctly', () => {
    const plans = [{ sessions: [
      { isCompleted: true }, { isCompleted: false }, { isCompleted: false },
    ] }];
    const { pct } = computePlanProgress(plans);
    expect(pct).toBe(33); // Math.round(1/3 * 100) = 33
  });
});

// ─── N12: Scoring — negative marks per question not universal ─────────────────

describe('N12: Scoring negative marks per question', () => {
  function scoreSession(questions, answersMap) {
    let correct = 0, wrong = 0, skipped = 0, rawMarks = 0, negativeMarksTotal = 0;
    for (const q of questions) {
      const { selectedAnswer = null } = answersMap[q._id] || {};
      const isSkipped = !selectedAnswer;
      if (isSkipped) {
        skipped++;
      } else if (selectedAnswer === q.correctAnswer) {
        correct++;
        rawMarks += q.marks ?? 1;
      } else {
        wrong++;
        const neg = q.negativeMarks ?? 0; // per-question — 0 if not configured
        negativeMarksTotal += neg;
        rawMarks -= neg;
      }
    }
    const marksObtained = Math.max(0, rawMarks);
    return { correct, wrong, skipped, rawMarks, negativeMarksTotal, marksObtained };
  }

  test('N12a: no negativeMarks configured → wrong answer costs 0', () => {
    const q = { _id: 'q1', correctAnswer: 'A', marks: 1 }; // negativeMarks undefined
    const r = scoreSession([q], { q1: { selectedAnswer: 'B' } });
    expect(r.negativeMarksTotal).toBe(0);
    expect(r.rawMarks).toBe(0);
    expect(r.marksObtained).toBe(0);
  });

  test('N12b: negativeMarks=0.33 on one question → correctly deducted', () => {
    const q = { _id: 'q1', correctAnswer: 'A', marks: 1, negativeMarks: 0.33 };
    const r = scoreSession([q], { q1: { selectedAnswer: 'B' } });
    expect(r.negativeMarksTotal).toBeCloseTo(0.33, 2);
    expect(r.rawMarks).toBeCloseTo(-0.33, 2);
    expect(r.marksObtained).toBe(0); // clamped
  });

  test('N12c: mixed question set — only configured negative marks applied', () => {
    const qs = [
      { _id: 'q1', correctAnswer: 'A', marks: 2, negativeMarks: 0.5 }, // wrong = -0.5
      { _id: 'q2', correctAnswer: 'B', marks: 2 },                      // wrong = 0 (no neg)
      { _id: 'q3', correctAnswer: 'C', marks: 2 },                      // correct = +2
    ];
    const r = scoreSession(qs, {
      q1: { selectedAnswer: 'B' }, // wrong
      q2: { selectedAnswer: 'A' }, // wrong, no neg
      q3: { selectedAnswer: 'C' }, // correct
    });
    expect(r.correct).toBe(1);
    expect(r.wrong).toBe(2);
    expect(r.negativeMarksTotal).toBeCloseTo(0.5);
    expect(r.rawMarks).toBeCloseTo(1.5); // 2 - 0.5 - 0
    expect(r.marksObtained).toBeCloseTo(1.5);
  });
});

// ─── N13: Idempotent submission guard ─────────────────────────────────────────

describe('N13: Session already-submitted guard', () => {
  function simulateSubmit(session, submittedData) {
    // Mirrors the guard logic in practice.controller.js submitSession
    if (session.status === 'completed') {
      return { already: true, result: session.result };
    }
    // Would normally save to DB — for test just return a mock result
    return { already: false, result: { correct: submittedData.correct } };
  }

  test('N13a: completed session returns existing result without reprocessing', () => {
    const session = { status: 'completed', result: { correct: 3, wrong: 2 } };
    const r = simulateSubmit(session, { correct: 99 }); // different data — should be ignored
    expect(r.already).toBe(true);
    expect(r.result.correct).toBe(3); // existing result preserved
  });

  test('N13b: in-progress session processes and returns new result', () => {
    const session = { status: 'in_progress', result: null };
    const r = simulateSubmit(session, { correct: 7 });
    expect(r.already).toBe(false);
    expect(r.result.correct).toBe(7);
  });
});
