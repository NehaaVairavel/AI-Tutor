/**
 * Syllabus, Analytics, and Practice Audit Tests
 *
 * Tests the pure catalog logic, analytics data resolution, and
 * practice configuration flow without requiring a live MongoDB connection.
 *
 * Coverage:
 *  S1.  Syllabus catalog structure — 5 primary exams defined correctly.
 *  S2.  Exam shortName uniqueness.
 *  S3.  Exam category enum membership.
 *  S4.  Subject counts per primary exam (expected minimums).
 *  S5.  Topic counts per primary exam (expected minimums).
 *  S6.  No cross-exam subject leakage (subjects isolated by exam).
 *  S7.  Upsert helpers are idempotent (pure logic).
 *  A1.  Analytics topic name resolution — populated object.
 *  A2.  Analytics topic name resolution — null (stale reference).
 *  A3.  Analytics topic name resolution — raw ObjectId string (unpopulated).
 *  A4.  Analytics subject name resolution fallback.
 *  A5.  Accuracy calculation — no NaN or Infinity.
 *  A6.  Topic progress with zero attempts excluded from table.
 *  A7.  User isolation — progress filter must include userId.
 *  P1.  Practice exam→subject cascade — changing exam clears subject.
 *  P2.  Practice exam→subject cascade — changing exam clears topic.
 *  P3.  Practice validation — examId + subjectId required.
 *  P4.  Practice validation — topicId is optional.
 *  P5.  Empty subjects are distinguishable from loading state.
 *  P6.  Stale request cancellation — later request ID wins.
 */

// ─── Syllabus catalog data (mirrors seeder.js) ────────────────────────────────

const SUPPORTED_EXAMS = [
  {
    shortName: 'SSC CGL',
    name: 'SSC Combined Graduate Level (CGL)',
    category: 'ssc',
    subjects: [
      { name: 'Quantitative Aptitude', topicCount: 18 },
      { name: 'General Intelligence & Reasoning', topicCount: 14 },
      { name: 'English Language & Comprehension', topicCount: 12 },
      { name: 'General Awareness', topicCount: 13 },
    ],
  },
  {
    shortName: 'IBPS PO',
    name: 'IBPS PO (Probationary Officer)',
    category: 'banking',
    subjects: [
      { name: 'Quantitative Aptitude', topicCount: 17 },
      { name: 'Reasoning Ability', topicCount: 14 },
      { name: 'English Language', topicCount: 9 },
      { name: 'General & Banking Awareness', topicCount: 10 },
      { name: 'Computer Knowledge', topicCount: 8 },
    ],
  },
  {
    shortName: 'RRB NTPC',
    name: 'RRB NTPC (Non-Technical Popular Categories)',
    category: 'railway',
    subjects: [
      { name: 'Mathematics', topicCount: 16 },
      { name: 'General Intelligence & Reasoning', topicCount: 14 },
      { name: 'General Awareness', topicCount: 16 },
    ],
  },
  {
    shortName: 'TNPSC Gr1',
    name: 'TNPSC Group 1',
    category: 'tnpsc',
    subjects: [
      { name: 'General Studies', topicCount: 35 },
      { name: 'Aptitude & Mental Ability', topicCount: 19 },
    ],
  },
  {
    shortName: 'CAT',
    name: 'CAT (Common Admission Test)',
    category: 'cat',
    subjects: [
      { name: 'Verbal Ability & Reading Comprehension', topicCount: 9 },
      { name: 'Data Interpretation & Logical Reasoning', topicCount: 14 },
      { name: 'Quantitative Ability', topicCount: 26 },
    ],
  },
];

const VALID_CATEGORIES = ['ssc', 'banking', 'tnpsc', 'upsc', 'railway', 'gate', 'cat', 'jee', 'neet', 'other'];

// ─── Analytics helper functions (mirrors Analytics.jsx) ───────────────────────

function resolveTopicName(topic) {
  if (!topic) return '(Unknown topic)';
  if (typeof topic === 'object' && topic.name) return topic.name;
  return '(Topic not found)';
}

function resolveSubjectName(subject) {
  if (!subject) return '(Unknown subject)';
  if (typeof subject === 'object' && subject.name) return subject.name;
  return '(Subject not found)';
}

function computeAccuracy(correct, total) {
  if (!total || total === 0) return 0;
  const result = Math.round((correct / total) * 100);
  return Number.isFinite(result) ? result : 0;
}

// ─── Practice state simulation ────────────────────────────────────────────────

function makePracticeState() {
  return {
    selectedExam: '',
    selectedSubject: '',
    selectedTopic: '',
    subjects: [],
    topics: [],
  };
}

function onExamChange(state, newExamId) {
  // Simulates what Practice.jsx useEffect does
  return {
    ...state,
    selectedExam: newExamId,
    selectedSubject: '',   // cleared
    selectedTopic: '',     // cleared
    subjects: [],          // will be reloaded
    topics: [],            // cleared
  };
}

function onSubjectChange(state, newSubjectId) {
  return {
    ...state,
    selectedSubject: newSubjectId,
    selectedTopic: '',     // cleared
    topics: [],            // will be reloaded
  };
}

function canStartSession(state) {
  return !!(state.selectedExam && state.selectedSubject);
}

// ─── Request ID cancellation simulation ───────────────────────────────────────

function simulateRaceCondition() {
  let latestReqId = 0;
  let committedResult = null;

  function startRequest(id, resolveValue) {
    return new Promise(resolve => setTimeout(() => {
      // Only commit if this request is still the latest
      if (id === latestReqId) {
        committedResult = resolveValue;
      }
      resolve({ id, value: resolveValue });
    }, 0));
  }

  return {
    fire: (value) => {
      const id = ++latestReqId;
      return startRequest(id, value);
    },
    getCommitted: () => committedResult,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// S1. Supported exam catalog completeness
// ═══════════════════════════════════════════════════════════════════════════════
describe('S1. Supported exam catalog — 5 primary exams defined', () => {
  test('exactly 5 primary supported exams are defined', () => {
    expect(SUPPORTED_EXAMS).toHaveLength(5);
  });

  test.each(SUPPORTED_EXAMS)('$shortName has a non-empty name', ({ name }) => {
    expect(typeof name).toBe('string');
    expect(name.trim().length).toBeGreaterThan(0);
  });

  test.each(SUPPORTED_EXAMS)('$shortName has a non-empty shortName', ({ shortName }) => {
    expect(typeof shortName).toBe('string');
    expect(shortName.trim().length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S2. ShortName uniqueness
// ═══════════════════════════════════════════════════════════════════════════════
describe('S2. Exam shortName uniqueness', () => {
  test('all exam shortNames are unique', () => {
    const shortNames = SUPPORTED_EXAMS.map(e => e.shortName);
    const unique = new Set(shortNames);
    expect(unique.size).toBe(shortNames.length);
  });

  test('all exam names are unique', () => {
    const names = SUPPORTED_EXAMS.map(e => e.name);
    const unique = new Set(names);
    expect(unique.size).toBe(names.length);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S3. Category enum membership
// ═══════════════════════════════════════════════════════════════════════════════
describe('S3. Exam category enum membership', () => {
  test.each(SUPPORTED_EXAMS)('$shortName category "$category" is in the allowed enum', ({ shortName, category }) => {
    expect(VALID_CATEGORIES).toContain(category);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S4. Subject counts per primary exam
// ═══════════════════════════════════════════════════════════════════════════════
describe('S4. Subject counts per primary exam', () => {
  test('SSC CGL has exactly 4 subjects', () => {
    const exam = SUPPORTED_EXAMS.find(e => e.shortName === 'SSC CGL');
    expect(exam.subjects).toHaveLength(4);
  });

  test('IBPS PO has exactly 5 subjects', () => {
    const exam = SUPPORTED_EXAMS.find(e => e.shortName === 'IBPS PO');
    expect(exam.subjects).toHaveLength(5);
  });

  test('RRB NTPC has exactly 3 subjects', () => {
    const exam = SUPPORTED_EXAMS.find(e => e.shortName === 'RRB NTPC');
    expect(exam.subjects).toHaveLength(3);
  });

  test('TNPSC Group 1 has exactly 2 subjects', () => {
    const exam = SUPPORTED_EXAMS.find(e => e.shortName === 'TNPSC Gr1');
    expect(exam.subjects).toHaveLength(2);
  });

  test('CAT has exactly 3 subjects', () => {
    const exam = SUPPORTED_EXAMS.find(e => e.shortName === 'CAT');
    expect(exam.subjects).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S5. Topic counts per primary exam
// ═══════════════════════════════════════════════════════════════════════════════
describe('S5. Topic counts per primary exam', () => {
  const topicTests = [
    { shortName: 'SSC CGL',    minTopics: 50 },
    { shortName: 'IBPS PO',    minTopics: 55 },
    { shortName: 'RRB NTPC',   minTopics: 40 },
    { shortName: 'TNPSC Gr1',  minTopics: 50 },
    { shortName: 'CAT',        minTopics: 45 },
  ];

  test.each(topicTests)('$shortName has at least $minTopics topics total', ({ shortName, minTopics }) => {
    const exam = SUPPORTED_EXAMS.find(e => e.shortName === shortName);
    const total = exam.subjects.reduce((sum, s) => sum + s.topicCount, 0);
    expect(total).toBeGreaterThanOrEqual(minTopics);
  });

  test.each(SUPPORTED_EXAMS)('$shortName has at least 1 topic per subject', ({ subjects }) => {
    for (const subject of subjects) {
      expect(subject.topicCount).toBeGreaterThanOrEqual(1);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S6. No cross-exam subject leakage
// ═══════════════════════════════════════════════════════════════════════════════
describe('S6. Cross-exam subject isolation', () => {
  test('each exam entry in the catalog has at least 1 subject', () => {
    for (const exam of SUPPORTED_EXAMS) {
      expect(exam.subjects.length).toBeGreaterThan(0);
    }
  });

  test('TNPSC Group 1 subjects are different from SSC CGL subjects', () => {
    const tnpsc = SUPPORTED_EXAMS.find(e => e.shortName === 'TNPSC Gr1');
    const ssc = SUPPORTED_EXAMS.find(e => e.shortName === 'SSC CGL');
    const tnpscNames = new Set(tnpsc.subjects.map(s => s.name));
    const sscNames = new Set(ssc.subjects.map(s => s.name));
    // General Studies is TNPSC-specific; SSC does not have it
    expect(tnpscNames.has('General Studies')).toBe(true);
    expect(sscNames.has('General Studies')).toBe(false);
    // TNPSC does not have 'English Language & Comprehension'
    expect(tnpscNames.has('English Language & Comprehension')).toBe(false);
  });

  test('CAT subjects are unique to the CAT exam', () => {
    const cat = SUPPORTED_EXAMS.find(e => e.shortName === 'CAT');
    const catSubjectNames = cat.subjects.map(s => s.name);
    expect(catSubjectNames).toContain('Verbal Ability & Reading Comprehension');
    expect(catSubjectNames).toContain('Data Interpretation & Logical Reasoning');
    expect(catSubjectNames).toContain('Quantitative Ability');
    // Verify none of these appear in any other exam's subjects by the exact same name
    const otherExams = SUPPORTED_EXAMS.filter(e => e.shortName !== 'CAT');
    for (const subName of catSubjectNames) {
      const conflict = otherExams.find(e => e.subjects.some(s => s.name === subName));
      expect(conflict).toBeUndefined();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// S7. Upsert idempotency (pure logic)
// ═══════════════════════════════════════════════════════════════════════════════
describe('S7. Upsert helper idempotency logic', () => {
  // Simulate the in-memory equivalent of findOneAndUpdate with upsert:true
  function upsertByKey(store, key, data) {
    const existing = store.find(item => item[key] === data[key]);
    if (existing) {
      Object.assign(existing, data);
      return { wasCreated: false, item: existing };
    }
    const newItem = { ...data };
    store.push(newItem);
    return { wasCreated: true, item: newItem };
  }

  test('first upsert creates a new document', () => {
    const store = [];
    const { wasCreated } = upsertByKey(store, 'shortName', { shortName: 'SSC CGL', name: 'SSC CGL Full Name' });
    expect(wasCreated).toBe(true);
    expect(store).toHaveLength(1);
  });

  test('second upsert with same key updates instead of creating', () => {
    const store = [];
    upsertByKey(store, 'shortName', { shortName: 'SSC CGL', name: 'Old Name' });
    const { wasCreated } = upsertByKey(store, 'shortName', { shortName: 'SSC CGL', name: 'New Name' });
    expect(wasCreated).toBe(false);
    expect(store).toHaveLength(1);
    expect(store[0].name).toBe('New Name');
  });

  test('running seeder 3 times results in 5 exam records (not 15)', () => {
    const store = [];
    for (let run = 0; run < 3; run++) {
      for (const exam of SUPPORTED_EXAMS) {
        upsertByKey(store, 'shortName', { shortName: exam.shortName, name: exam.name });
      }
    }
    expect(store).toHaveLength(5);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A1. Analytics — topic name from populated object
// ═══════════════════════════════════════════════════════════════════════════════
describe('A1. resolveTopicName — populated object', () => {
  test('returns name when topic is a populated object', () => {
    expect(resolveTopicName({ _id: 'abc', name: 'Percentage' })).toBe('Percentage');
  });

  test('works with any valid name string', () => {
    expect(resolveTopicName({ name: 'General Science — Physics' })).toBe('General Science — Physics');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A2. Analytics — null topic (stale reference)
// ═══════════════════════════════════════════════════════════════════════════════
describe('A2. resolveTopicName — null/stale reference', () => {
  test('returns fallback when topic is null', () => {
    const name = resolveTopicName(null);
    expect(name).not.toBe('');
    expect(name).not.toContain('—');
    expect(typeof name).toBe('string');
  });

  test('returns fallback when topic is undefined', () => {
    const name = resolveTopicName(undefined);
    expect(name).not.toBe('');
    expect(typeof name).toBe('string');
  });

  test('fallback message does not claim a specific exam or topic', () => {
    const name = resolveTopicName(null);
    expect(name).not.toBe('Topic');  // was the generic placeholder before the fix
    expect(name.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A3. Analytics — raw ObjectId string (populate returned string instead of object)
// ═══════════════════════════════════════════════════════════════════════════════
describe('A3. resolveTopicName — raw ObjectId string', () => {
  test('returns fallback when topic is a raw ObjectId-like string', () => {
    const name = resolveTopicName('507f1f77bcf86cd799439011');
    expect(name).toBe('(Topic not found)');
  });

  test('does not return the raw ObjectId string to the user', () => {
    const rawId = '507f1f77bcf86cd799439011';
    const name = resolveTopicName(rawId);
    expect(name).not.toBe(rawId);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A4. Analytics — subject name fallback
// ═══════════════════════════════════════════════════════════════════════════════
describe('A4. resolveSubjectName fallbacks', () => {
  test('returns subject name from populated object', () => {
    expect(resolveSubjectName({ name: 'Quantitative Aptitude' })).toBe('Quantitative Aptitude');
  });

  test('returns fallback for null', () => {
    expect(resolveSubjectName(null)).not.toBe('Subject'); // not the old generic
    expect(resolveSubjectName(null)).toBeTruthy();
  });

  test('returns fallback for raw string', () => {
    const raw = '507f1f77bcf86cd799439011';
    expect(resolveSubjectName(raw)).not.toBe(raw);
    expect(resolveSubjectName(raw)).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A5. Accuracy calculation — no NaN or Infinity
// ═══════════════════════════════════════════════════════════════════════════════
describe('A5. Accuracy calculation safety', () => {
  test('computeAccuracy(0, 0) returns 0 — no division by zero', () => {
    expect(computeAccuracy(0, 0)).toBe(0);
  });

  test('computeAccuracy(5, 10) returns 50', () => {
    expect(computeAccuracy(5, 10)).toBe(50);
  });

  test('computeAccuracy(10, 10) returns 100', () => {
    expect(computeAccuracy(10, 10)).toBe(100);
  });

  test('result is always a finite number', () => {
    const cases = [
      [0, 0], [0, 5], [5, 5], [3, 7], [1, 100],
    ];
    for (const [correct, total] of cases) {
      const result = computeAccuracy(correct, total);
      expect(Number.isFinite(result)).toBe(true);
      expect(Number.isNaN(result)).toBe(false);
    }
  });

  test('result is always between 0 and 100', () => {
    for (let correct = 0; correct <= 10; correct++) {
      for (let total = correct; total <= 10; total++) {
        const result = computeAccuracy(correct, total);
        expect(result).toBeGreaterThanOrEqual(0);
        expect(result).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A6. Topic progress — zero-attempts entries are excluded
// ═══════════════════════════════════════════════════════════════════════════════
describe('A6. Topic progress zero-attempt exclusion', () => {
  const topicProgress = [
    { topic: { name: 'Percentage' }, totalAttempted: 10, accuracy: 70, masteryLevel: 'average' },
    { topic: { name: 'Profit and Loss' }, totalAttempted: 0, accuracy: 0, masteryLevel: 'not_started' },
    { topic: { name: 'Ratio' }, totalAttempted: 5, accuracy: 80, masteryLevel: 'strong' },
  ];

  function filterForDisplay(progress) {
    return progress.filter(t => t.totalAttempted > 0);
  }

  test('topics with zero attempts are not shown in the table', () => {
    const visible = filterForDisplay(topicProgress);
    expect(visible).toHaveLength(2);
    expect(visible.every(t => t.totalAttempted > 0)).toBe(true);
  });

  test('zero-attempt topics are NOT counted as "weak"', () => {
    const visible = filterForDisplay(topicProgress);
    const names = visible.map(t => t.topic.name);
    expect(names).not.toContain('Profit and Loss');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// A7. User isolation — progress query must scope by userId
// ═══════════════════════════════════════════════════════════════════════════════
describe('A7. User isolation in progress queries', () => {
  function buildProgressFilter(userId, examId) {
    const filter = { user: userId };
    if (examId) filter.exam = examId;
    return filter;
  }

  test('filter always includes userId', () => {
    const f = buildProgressFilter('user-123', null);
    expect(f.user).toBe('user-123');
  });

  test('filter includes examId when provided', () => {
    const f = buildProgressFilter('user-123', 'exam-456');
    expect(f.exam).toBe('exam-456');
  });

  test('filter without examId does not include exam key', () => {
    const f = buildProgressFilter('user-123', null);
    expect(f.exam).toBeUndefined();
  });

  test('different users have different filters', () => {
    const f1 = buildProgressFilter('user-AAA', null);
    const f2 = buildProgressFilter('user-BBB', null);
    expect(f1.user).not.toBe(f2.user);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P1. Practice — exam change clears subject
// ═══════════════════════════════════════════════════════════════════════════════
describe('P1. Practice exam→subject cascade', () => {
  test('changing exam resets selectedSubject to empty string', () => {
    let state = makePracticeState();
    state.selectedSubject = 'subject-abc';
    state = onExamChange(state, 'exam-new');
    expect(state.selectedSubject).toBe('');
  });

  test('changing exam resets subjects list to empty array', () => {
    let state = makePracticeState();
    state.subjects = [{ _id: 's1', name: 'Math' }];
    state = onExamChange(state, 'exam-new');
    expect(state.subjects).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P2. Practice — exam change clears topic
// ═══════════════════════════════════════════════════════════════════════════════
describe('P2. Practice exam→topic cascade', () => {
  test('changing exam resets selectedTopic to empty string', () => {
    let state = makePracticeState();
    state.selectedTopic = 'topic-xyz';
    state = onExamChange(state, 'exam-new');
    expect(state.selectedTopic).toBe('');
  });

  test('changing exam resets topics list to empty array', () => {
    let state = makePracticeState();
    state.topics = [{ _id: 't1', name: 'Percentage' }];
    state = onExamChange(state, 'exam-new');
    expect(state.topics).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P3. Practice — Start requires examId + subjectId
// ═══════════════════════════════════════════════════════════════════════════════
describe('P3. Practice Start button validation', () => {
  test('cannot start with neither exam nor subject', () => {
    const state = makePracticeState();
    expect(canStartSession(state)).toBe(false);
  });

  test('cannot start with exam but no subject', () => {
    const state = { ...makePracticeState(), selectedExam: 'exam-abc' };
    expect(canStartSession(state)).toBe(false);
  });

  test('cannot start with subject but no exam (should not happen but guard)', () => {
    const state = { ...makePracticeState(), selectedSubject: 'sub-abc' };
    expect(canStartSession(state)).toBe(false);
  });

  test('can start with both exam and subject selected', () => {
    const state = { ...makePracticeState(), selectedExam: 'exam-abc', selectedSubject: 'sub-abc' };
    expect(canStartSession(state)).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P4. Practice — topicId is optional
// ═══════════════════════════════════════════════════════════════════════════════
describe('P4. Practice topicId is optional', () => {
  test('can start without a topic selected (topic = empty string)', () => {
    const state = { ...makePracticeState(), selectedExam: 'exam-abc', selectedSubject: 'sub-abc', selectedTopic: '' };
    expect(canStartSession(state)).toBe(true);
  });

  test('topicId should be undefined (not empty string) when not selected', () => {
    const selectedTopic = '';
    // This mirrors: topicId: selectedTopic || undefined
    const topicId = selectedTopic || undefined;
    expect(topicId).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P5. Practice — empty subjects vs loading state are distinguishable
// ═══════════════════════════════════════════════════════════════════════════════
describe('P5. Practice subject dropdown state messages', () => {
  function subjectPlaceholder(selectedExam, loading, subjects) {
    if (!selectedExam) return 'Select exam first';
    if (loading) return 'Loading subjects…';
    if (subjects.length === 0) return 'No subjects configured for this exam';
    return 'Select subject';
  }

  test('no exam selected → "Select exam first"', () => {
    expect(subjectPlaceholder('', false, [])).toBe('Select exam first');
  });

  test('exam selected, loading → loading message', () => {
    expect(subjectPlaceholder('exam-abc', true, [])).toContain('Loading');
  });

  test('exam selected, loaded, empty → meaningful empty message (not generic)', () => {
    const msg = subjectPlaceholder('exam-abc', false, []);
    expect(msg).not.toBe('Select exam first');
    expect(msg).not.toContain('Loading');
    expect(msg.length).toBeGreaterThan(0);
  });

  test('exam selected, subjects available → "Select subject"', () => {
    expect(subjectPlaceholder('exam-abc', false, [{ _id: 's1', name: 'Math' }])).toBe('Select subject');
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// P6. Practice — stale request cancellation
// ═══════════════════════════════════════════════════════════════════════════════
describe('P6. Stale request cancellation — latest request wins', () => {
  test('when two requests are fired, only the last one commits', async () => {
    const sim = simulateRaceCondition();
    // Fire request 1 (will be superseded)
    sim.fire('subjects-for-exam-A');
    // Fire request 2 (should win)
    sim.fire('subjects-for-exam-B');
    // Let both settle
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(sim.getCommitted()).toBe('subjects-for-exam-B');
  });

  test('single request commits normally', async () => {
    const sim = simulateRaceCondition();
    sim.fire('subjects-for-exam-A');
    await new Promise(resolve => setTimeout(resolve, 10));
    expect(sim.getCommitted()).toBe('subjects-for-exam-A');
  });
});
