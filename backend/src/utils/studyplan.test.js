/**
 * Study Plan session completion unit tests.
 *
 * These tests cover the pure logic of the study plan session completion handler
 * without requiring a live MongoDB connection. They mirror the route handler logic.
 *
 * Test coverage:
 *  A.  Session reference parsing (dayNum-topicIdx format).
 *  B.  Completing one topic does not complete other topics in the same day.
 *  C.  Day-level status becomes "completed" only when ALL topics are done.
 *  D.  completedDays count reflects only fully-completed days.
 *  E.  Idempotent: completing an already-completed topic does not change timestamps.
 *  F.  Completing a topic on day 1 does not affect day 2 sessions.
 *  G.  Invalid session references return correct errors.
 *  H.  Progress count (X/N done) matches individual topic states.
 */

// ─── Pure session-completion logic (mirrors studyPlan.routes.js PATCH handler) ─
function parseSessionRef(sessionRef) {
  const parts = sessionRef.split('-');
  if (parts.length < 2) return { valid: false, reason: 'Invalid format' };
  const dayNum = Number(parts[0]);
  const topicIdx = Number(parts[1]);
  if (isNaN(dayNum) || isNaN(topicIdx)) return { valid: false, reason: 'Not a number' };
  return { valid: true, dayNum, topicIdx };
}

function applyCompletion(plan, sessionRef) {
  const { valid, reason, dayNum, topicIdx } = parseSessionRef(sessionRef);
  if (!valid) return { error: reason };

  const daySession = plan.sessions.find(s => s.dayNumber === dayNum);
  if (!daySession) return { error: `Day ${dayNum} not found` };
  if (!daySession.topics[topicIdx]) return { error: `Topic ${topicIdx} not found in day ${dayNum}` };

  const topic = daySession.topics[topicIdx];

  // Idempotent: only update if not already completed
  const wasAlreadyCompleted = topic.status === 'completed';
  if (!wasAlreadyCompleted) {
    topic.status = 'completed';
    topic.completedAt = new Date('2026-01-01T10:00:00Z');
  }

  // Day-level status
  const allDone = daySession.topics.every(t => t.status === 'completed');
  daySession.status = allDone ? 'completed' : 'in_progress';

  // Recount fully-completed days
  plan.completedDays = plan.sessions.filter(s => s.status === 'completed').length;

  return { success: true, wasAlreadyCompleted };
}

function makePlan() {
  return {
    _id: 'plan-1',
    completedDays: 0,
    sessions: [
      {
        dayNumber: 1,
        status: 'pending',
        topics: [
          { topicName: 'Profit and Loss', type: 'learn', status: 'pending', completedAt: null },
          { topicName: 'Mixed Practice', type: 'practice', status: 'pending', completedAt: null },
        ],
      },
      {
        dayNumber: 2,
        status: 'pending',
        topics: [
          { topicName: 'Algebra', type: 'learn', status: 'pending', completedAt: null },
          { topicName: 'Mixed Practice', type: 'practice', status: 'pending', completedAt: null },
        ],
      },
    ],
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// A. Session reference parsing
// ═══════════════════════════════════════════════════════════════════════════════
describe('A. parseSessionRef()', () => {
  test('parses valid "dayNum-topicIdx" format', () => {
    const r = parseSessionRef('1-0');
    expect(r.valid).toBe(true);
    expect(r.dayNum).toBe(1);
    expect(r.topicIdx).toBe(0);
  });

  test('parses "2-1"', () => {
    const r = parseSessionRef('2-1');
    expect(r.valid).toBe(true);
    expect(r.dayNum).toBe(2);
    expect(r.topicIdx).toBe(1);
  });

  test('rejects refs with no dash (old format: dayNum-topicName)', () => {
    // "1" has no dash → invalid
    const r = parseSessionRef('1');
    expect(r.valid).toBe(false);
  });

  test('rejects non-numeric day or index', () => {
    const r = parseSessionRef('abc-xyz');
    expect(r.valid).toBe(false);
  });

  test('correctly parses high indices', () => {
    const r = parseSessionRef('30-5');
    expect(r.valid).toBe(true);
    expect(r.dayNum).toBe(30);
    expect(r.topicIdx).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// B. Completing one topic does NOT complete others in same day
// ═══════════════════════════════════════════════════════════════════════════════
describe('B. Individual topic completion', () => {
  test('completing session "1-0" marks only topic[0] on day 1', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    const day1 = plan.sessions.find(s => s.dayNumber === 1);
    expect(day1.topics[0].status).toBe('completed');
    expect(day1.topics[1].status).toBe('pending');  // NOT completed
  });

  test('completing session "1-1" marks only topic[1] on day 1', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-1');
    const day1 = plan.sessions.find(s => s.dayNumber === 1);
    expect(day1.topics[0].status).toBe('pending');  // NOT completed
    expect(day1.topics[1].status).toBe('completed');
  });

  test('completing "1-0" then "1-1" marks both topics', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    const day1 = plan.sessions.find(s => s.dayNumber === 1);
    expect(day1.topics[0].status).toBe('completed');
    expect(day1.topics[1].status).toBe('completed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C. Day-level status reflects ALL topics done
// ═══════════════════════════════════════════════════════════════════════════════
describe('C. Day-level status', () => {
  test('day status is "in_progress" after only first topic completes', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    const day1 = plan.sessions.find(s => s.dayNumber === 1);
    expect(day1.status).toBe('in_progress');
  });

  test('day status is "completed" after all topics complete', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    const day1 = plan.sessions.find(s => s.dayNumber === 1);
    expect(day1.status).toBe('completed');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// D. completedDays count
// ═══════════════════════════════════════════════════════════════════════════════
describe('D. completedDays count', () => {
  test('starts at 0', () => {
    const plan = makePlan();
    expect(plan.completedDays).toBe(0);
  });

  test('is 0/2 after completing only 1 of 2 topics in day 1', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    expect(plan.completedDays).toBe(0);  // day not fully done
  });

  test('is 1/2 after completing all topics in day 1', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    expect(plan.completedDays).toBe(1);
  });

  test('is 2/2 after completing all topics in both days', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    applyCompletion(plan, '2-0');
    applyCompletion(plan, '2-1');
    expect(plan.completedDays).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// E. Idempotent completion
// ═══════════════════════════════════════════════════════════════════════════════
describe('E. Idempotent completion', () => {
  test('completing same topic twice does not change its completedAt', () => {
    const plan = makePlan();
    const r1 = applyCompletion(plan, '1-0');
    const ts1 = plan.sessions[0].topics[0].completedAt;
    const r2 = applyCompletion(plan, '1-0');
    const ts2 = plan.sessions[0].topics[0].completedAt;
    expect(r1.wasAlreadyCompleted).toBe(false);
    expect(r2.wasAlreadyCompleted).toBe(true);
    expect(ts2).toEqual(ts1);  // timestamp unchanged
  });

  test('completing same topic twice does not double-count completedDays', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    expect(plan.completedDays).toBe(1);
    // Repeat both
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    expect(plan.completedDays).toBe(1);  // still 1, not 2
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// F. Cross-day isolation — completing day 1 does not affect day 2
// ═══════════════════════════════════════════════════════════════════════════════
describe('F. Cross-day isolation', () => {
  test('completing all topics on day 1 leaves day 2 untouched', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    const day2 = plan.sessions.find(s => s.dayNumber === 2);
    expect(day2.topics[0].status).toBe('pending');
    expect(day2.topics[1].status).toBe('pending');
    expect(day2.status).toBe('pending');
  });

  test('completing day 2 topics does not affect day 1 topics', () => {
    const plan = makePlan();
    applyCompletion(plan, '2-0');
    const day1 = plan.sessions.find(s => s.dayNumber === 1);
    expect(day1.topics[0].status).toBe('pending');
    expect(day1.topics[1].status).toBe('pending');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// G. Invalid session references
// ═══════════════════════════════════════════════════════════════════════════════
describe('G. Invalid session references', () => {
  test('returns error for non-existent dayNumber', () => {
    const plan = makePlan();
    const result = applyCompletion(plan, '99-0');
    expect(result.error).toMatch(/Day 99 not found/);
  });

  test('returns error for out-of-bounds topicIdx', () => {
    const plan = makePlan();
    const result = applyCompletion(plan, '1-99');
    expect(result.error).toMatch(/Topic 99 not found/);
  });

  test('returns error for non-numeric ref', () => {
    const plan = makePlan();
    const result = applyCompletion(plan, 'abc-xyz');
    expect(result.error).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// H. Progress count display (X/N done) matches individual topic states
// ═══════════════════════════════════════════════════════════════════════════════
describe('H. Progress count accuracy', () => {
  function countCompleted(dayData) {
    return dayData.topics.filter(t => t.status === 'completed').length;
  }

  test('0/2 when no topics done', () => {
    const plan = makePlan();
    const day1 = plan.sessions[0];
    expect(countCompleted(day1)).toBe(0);
    expect(day1.topics.length).toBe(2);
  });

  test('1/2 after first topic completes', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    const day1 = plan.sessions[0];
    expect(countCompleted(day1)).toBe(1);
    expect(day1.topics.length).toBe(2);
  });

  test('2/2 after both topics complete', () => {
    const plan = makePlan();
    applyCompletion(plan, '1-0');
    applyCompletion(plan, '1-1');
    const day1 = plan.sessions[0];
    expect(countCompleted(day1)).toBe(2);
    expect(day1.topics.length).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// I. Practice count — requested count preserved through deduplication
// ═══════════════════════════════════════════════════════════════════════════════
describe('I. Practice question count preservation', () => {
  // Simulate the deduplication step from startSession
  function simulateSessionQuestions(poolSize, requestedCount, attemptedCount = 0) {
    // Build a fake pool of unique questions
    const pool = Array.from({ length: poolSize }, (_, i) => ({ _id: `q${i}` }));
    const attempted = new Set(
      Array.from({ length: attemptedCount }, (_, i) => `q${i}`)
    );
    const fresh = pool.filter(q => !attempted.has(q._id));
    const totalAvailable = pool.length;

    if (totalAvailable === 0) return { delivered: 0, error: 'No questions available' };

    let chosen = [];
    if (fresh.length >= requestedCount) {
      // Enough fresh — pick requestedCount from fresh
      chosen = fresh.slice(0, requestedCount);
    } else if (fresh.length > 0) {
      // Mix fresh + repeat
      const fromRepeat = pool.filter(q => !fresh.includes(q));
      const needed = requestedCount - fresh.length;
      chosen = [...fresh, ...fromRepeat.slice(0, Math.min(needed, fromRepeat.length))];
    } else {
      // All attempted — pick from full pool
      chosen = pool.slice(0, Math.min(requestedCount, pool.length));
    }

    // Dedup (simulate $sample edge case)
    const seen = new Set();
    const unique = chosen.filter(q => {
      if (seen.has(q._id)) return false;
      seen.add(q._id);
      return true;
    });

    return {
      delivered: unique.length,
      requested: requestedCount,
      total: totalAvailable,
      fresh: fresh.length,
    };
  }

  test('requesting 5 from pool of 20 (no previously attempted) returns 5', () => {
    const result = simulateSessionQuestions(20, 5, 0);
    expect(result.delivered).toBe(5);
  });

  test('requesting 10 from pool of 20 (no previously attempted) returns 10', () => {
    const result = simulateSessionQuestions(20, 10, 0);
    expect(result.delivered).toBe(10);
  });

  test('requesting 5 from pool of 20 (10 previously attempted) returns 5 from fresh', () => {
    const result = simulateSessionQuestions(20, 5, 10);
    expect(result.delivered).toBe(5);
    expect(result.fresh).toBe(10); // 10 fresh remain
  });

  test('requesting 5 when only 3 unique eligible — delivers 3 (not silently padded)', () => {
    const result = simulateSessionQuestions(3, 5, 0);
    expect(result.delivered).toBe(3);
    expect(result.delivered).toBeLessThan(result.requested);
  });

  test('requesting 5 from pool of 85 (the seeded DB size) always returns 5', () => {
    const result = simulateSessionQuestions(85, 5, 0);
    expect(result.delivered).toBe(5);
  });

  test('requesting 10 from pool of 85 returns 10', () => {
    const result = simulateSessionQuestions(85, 10, 0);
    expect(result.delivered).toBe(10);
  });

  test('requested count reaches backend unchanged (payload round-trip sim)', () => {
    // Simulates: frontend sends count=5, backend receives count=5
    const payload = { examId: 'e1', subjectId: 's1', count: 5, difficulty: 'mixed' };
    const { count = 10 } = payload; // same default logic as controller
    const requestedCount = Math.min(Math.max(1, Number(count)), 50);
    expect(requestedCount).toBe(5);
  });

  test('count=30 is clamped to 30 (not 50)', () => {
    const payload = { count: 30 };
    const { count = 10 } = payload;
    const requestedCount = Math.min(Math.max(1, Number(count)), 50);
    expect(requestedCount).toBe(30);
  });

  test('count above max (100) is clamped to 50', () => {
    const payload = { count: 100 };
    const { count = 10 } = payload;
    const requestedCount = Math.min(Math.max(1, Number(count)), 50);
    expect(requestedCount).toBe(50);
  });

  test('count=0 is clamped to 1', () => {
    const payload = { count: 0 };
    const { count = 10 } = payload;
    const requestedCount = Math.min(Math.max(1, Number(count)), 50);
    expect(requestedCount).toBe(1);
  });

  test('missing count defaults to 10', () => {
    const payload = {};
    const { count = 10 } = payload;
    const requestedCount = Math.min(Math.max(1, Number(count)), 50);
    expect(requestedCount).toBe(10);
  });
});
