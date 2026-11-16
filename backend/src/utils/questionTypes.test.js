'use strict';
/**
 * questionTypes.test.js
 * ---------------------
 * Tests for multi-type answer evaluation (answerEvaluator.js).
 * No live DB required — uses plain objects matching the question schema shape.
 *
 * Covers:
 *  1-4.   single_choice — correct, wrong, null, legacy mcq type
 *  5-6.   true_false
 *  7-12.  multiple_select — exact, partial, extra, empty, JSON string, single-item
 *  13-16. matching — all correct, one wrong, empty, JSON string
 *  17-21. fill_blank — all correct, alternatives, wrong, case-sensitive, one blank wrong
 *  22-23. assertion_reason
 *  24.    statement_based
 *  25.    legacy question without questionType (fallback)
 *  26-29. null / empty answer is never correct
 *  30.    normalizedAnswer returned correctly for each type
 */

const { evaluateAnswer } = require('./answerEvaluator');

// ── Helper to build a minimal question object ─────────────────────────────────
function q(overrides) {
  return {
    questionType: 'single_choice',
    type: 'mcq',
    correctAnswer: 'A',
    correctAnswerData: null,
    options: [
      { key: 'A', text: 'Opt A' },
      { key: 'B', text: 'Opt B' },
      { key: 'C', text: 'Opt C' },
      { key: 'D', text: 'Opt D' },
    ],
    blanks: [],
    matchingPairs: [],
    ...overrides,
  };
}

describe('answerEvaluator — single_choice', () => {
  test('1. correct answer → isCorrect=true', () => {
    expect(evaluateAnswer(q({ correctAnswer: 'B' }), 'B').isCorrect).toBe(true);
  });
  test('2. wrong answer → isCorrect=false', () => {
    expect(evaluateAnswer(q({ correctAnswer: 'A' }), 'C').isCorrect).toBe(false);
  });
  test('3. null answer → isCorrect=false', () => {
    expect(evaluateAnswer(q({ correctAnswer: 'A' }), null).isCorrect).toBe(false);
  });
  test('4. legacy type=mcq works identically', () => {
    expect(evaluateAnswer(q({ questionType: 'mcq', correctAnswer: 'D' }), 'D').isCorrect).toBe(true);
  });
});

describe('answerEvaluator — true_false', () => {
  test('5. correct "true"', () => {
    expect(evaluateAnswer(q({ questionType: 'true_false', correctAnswer: 'true' }), 'true').isCorrect).toBe(true);
  });
  test('6. wrong "false" when correct is "true"', () => {
    expect(evaluateAnswer(q({ questionType: 'true_false', correctAnswer: 'true' }), 'false').isCorrect).toBe(false);
  });
});

describe('answerEvaluator — multiple_select', () => {
  test('7. exact set (different order) → correct', () => {
    expect(
      evaluateAnswer(q({ questionType: 'multiple_select', correctAnswerData: ['A', 'C'] }), ['C', 'A']).isCorrect
    ).toBe(true);
  });
  test('8. partial selection → wrong', () => {
    expect(
      evaluateAnswer(q({ questionType: 'multiple_select', correctAnswerData: ['A', 'C'] }), ['A']).isCorrect
    ).toBe(false);
  });
  test('9. extra selection → wrong', () => {
    expect(
      evaluateAnswer(q({ questionType: 'multiple_select', correctAnswerData: ['A', 'C'] }), ['A', 'B', 'C']).isCorrect
    ).toBe(false);
  });
  test('10. empty array → wrong', () => {
    expect(
      evaluateAnswer(q({ questionType: 'multiple_select', correctAnswerData: ['A', 'C'] }), []).isCorrect
    ).toBe(false);
  });
  test('11. JSON-encoded string array → correct', () => {
    expect(
      evaluateAnswer(q({ questionType: 'multiple_select', correctAnswerData: ['B', 'D'] }), '["D","B"]').isCorrect
    ).toBe(true);
  });
  test('12. single correct item', () => {
    expect(
      evaluateAnswer(q({ questionType: 'multiple_select', correctAnswerData: ['C'] }), ['C']).isCorrect
    ).toBe(true);
  });
});

describe('answerEvaluator — matching', () => {
  test('13. all pairs correct → isCorrect=true', () => {
    expect(
      evaluateAnswer(
        q({ questionType: 'matching', correctAnswerData: { '1': 'a', '2': 'b', '3': 'c' } }),
        { '1': 'a', '2': 'b', '3': 'c' }
      ).isCorrect
    ).toBe(true);
  });
  test('14. one wrong pair → isCorrect=false', () => {
    expect(
      evaluateAnswer(
        q({ questionType: 'matching', correctAnswerData: { '1': 'a', '2': 'b' } }),
        { '1': 'a', '2': 'c' }
      ).isCorrect
    ).toBe(false);
  });
  test('15. empty object → wrong', () => {
    expect(
      evaluateAnswer(q({ questionType: 'matching', correctAnswerData: { '1': 'a' } }), {}).isCorrect
    ).toBe(false);
  });
  test('16. JSON-encoded string object → correct', () => {
    expect(
      evaluateAnswer(q({ questionType: 'matching', correctAnswerData: { '1': 'x' } }), '{"1":"x"}').isCorrect
    ).toBe(true);
  });
});

describe('answerEvaluator — fill_blank', () => {
  test('17. all blanks correct (case-insensitive)', () => {
    expect(
      evaluateAnswer(
        q({
          questionType: 'fill_blank',
          correctAnswerData: [['photosynthesis'], ['chlorophyll']],
          blanks: [{ blankIndex: 0, caseSensitive: false }, { blankIndex: 1, caseSensitive: false }],
        }),
        ['Photosynthesis', 'CHLOROPHYLL']
      ).isCorrect
    ).toBe(true);
  });
  test('18. accepted alternative answers work', () => {
    expect(
      evaluateAnswer(
        q({
          questionType: 'fill_blank',
          correctAnswerData: [['New Delhi', 'Delhi']],
          blanks: [{ blankIndex: 0, caseSensitive: false }],
        }),
        ['delhi']
      ).isCorrect
    ).toBe(true);
  });
  test('19. wrong blank answer → false', () => {
    expect(
      evaluateAnswer(
        q({
          questionType: 'fill_blank',
          correctAnswerData: [['photosynthesis']],
          blanks: [{ blankIndex: 0, caseSensitive: false }],
        }),
        ['respiration']
      ).isCorrect
    ).toBe(false);
  });
  test('20. case-sensitive blank rejects wrong case', () => {
    expect(
      evaluateAnswer(
        q({
          questionType: 'fill_blank',
          correctAnswerData: [['DNA']],
          blanks: [{ blankIndex: 0, caseSensitive: true }],
        }),
        ['dna']
      ).isCorrect
    ).toBe(false);
  });
  test('21. one blank wrong makes whole answer wrong', () => {
    expect(
      evaluateAnswer(
        q({
          questionType: 'fill_blank',
          correctAnswerData: [['apple'], ['banana']],
          blanks: [{ blankIndex: 0 }, { blankIndex: 1 }],
        }),
        ['apple', 'orange']
      ).isCorrect
    ).toBe(false);
  });
});

describe('answerEvaluator — assertion_reason', () => {
  test('22. correct option A', () => {
    expect(evaluateAnswer(q({ questionType: 'assertion_reason', correctAnswer: 'A' }), 'A').isCorrect).toBe(true);
  });
  test('23. wrong option returns false', () => {
    expect(evaluateAnswer(q({ questionType: 'assertion_reason', correctAnswer: 'C' }), 'B').isCorrect).toBe(false);
  });
});

describe('answerEvaluator — statement_based', () => {
  test('24. correct option returns true', () => {
    expect(evaluateAnswer(q({ questionType: 'statement_based', correctAnswer: 'B' }), 'B').isCorrect).toBe(true);
  });
});

describe('answerEvaluator — legacy MCQ compatibility', () => {
  test('25. question without questionType defaults to string comparison', () => {
    const legacyQ = { type: 'mcq', correctAnswer: 'C', options: [{ key: 'A' }, { key: 'B' }, { key: 'C' }, { key: 'D' }] };
    expect(evaluateAnswer(legacyQ, 'C').isCorrect).toBe(true);
  });
});

describe('answerEvaluator — null/empty always fails', () => {
  test('26. null is wrong for single_choice', () => {
    expect(evaluateAnswer(q({ questionType: 'single_choice', correctAnswer: 'A' }), null).isCorrect).toBe(false);
  });
  test('27. null is wrong for multiple_select', () => {
    expect(evaluateAnswer(q({ questionType: 'multiple_select', correctAnswerData: ['A'] }), null).isCorrect).toBe(false);
  });
  test('28. null is wrong for matching', () => {
    expect(evaluateAnswer(q({ questionType: 'matching', correctAnswerData: { '1': 'a' } }), null).isCorrect).toBe(false);
  });
  test('29. null is wrong for fill_blank', () => {
    expect(evaluateAnswer(q({ questionType: 'fill_blank', correctAnswerData: [['x']], blanks: [{}] }), null).isCorrect).toBe(false);
  });
});

describe('answerEvaluator — normalizedAnswer shape', () => {
  test('30. normalizedAnswer is array for multiple_select', () => {
    const result = evaluateAnswer(
      q({ questionType: 'multiple_select', correctAnswerData: ['A', 'B'] }),
      ['A', 'B']
    );
    expect(Array.isArray(result.normalizedAnswer)).toBe(true);
    expect(result.normalizedAnswer.sort()).toEqual(['A', 'B']);
  });
  test('31. normalizedAnswer is object for matching', () => {
    const result = evaluateAnswer(
      q({ questionType: 'matching', correctAnswerData: { '1': 'a' } }),
      { '1': 'a' }
    );
    expect(typeof result.normalizedAnswer).toBe('object');
    expect(result.normalizedAnswer['1']).toBe('a');
  });
  test('32. normalizedAnswer is array for fill_blank', () => {
    const result = evaluateAnswer(
      q({ questionType: 'fill_blank', correctAnswerData: [['x']], blanks: [{}] }),
      ['x']
    );
    expect(Array.isArray(result.normalizedAnswer)).toBe(true);
  });
});

