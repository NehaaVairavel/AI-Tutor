'use strict';
/**
 * answerEvaluator.js
 * ------------------
 * Centralized backend answer evaluation for all question types.
 * Never trusts client-calculated correctness or marks.
 *
 * evaluateAnswer(question, submittedAnswer)
 *   @param  {Object} question       - Mongoose question doc (or lean object)
 *   @param  {*}      submittedAnswer - Raw value from client submission
 *   @returns {{ isCorrect: boolean, normalizedAnswer: *, reason: string }}
 */

function normalizeString(s) {
  return (s || '').toString().trim().toLowerCase().replace(/\s+/g, ' ');
}

function evaluateAnswer(question, submittedAnswer) {
  const qt = question.questionType || question.type || 'single_choice';

  // ── single_choice, true_false, assertion_reason, statement_based ──────────
  if (['single_choice', 'mcq', 'true_false', 'assertion_reason', 'statement_based'].includes(qt)) {
    const submitted = (submittedAnswer || '').toString().trim();
    const correct   = (question.correctAnswer || '').toString().trim();
    const isCorrect = submitted !== '' && submitted === correct;
    return { isCorrect, normalizedAnswer: submitted || null, reason: 'exact_string' };
  }

  // ── multiple_select ────────────────────────────────────────────────────────
  if (qt === 'multiple_select') {
    let submitted;
    if (typeof submittedAnswer === 'string') {
      // Support JSON-encoded array from older clients
      try { submitted = JSON.parse(submittedAnswer); }
      catch { submitted = [submittedAnswer]; }
    } else {
      submitted = Array.isArray(submittedAnswer) ? submittedAnswer : [];
    }
    submitted = submitted.map(s => s.toString().trim()).sort();

    let correct;
    const correctData = question.correctAnswerData;
    if (Array.isArray(correctData)) {
      correct = correctData.map(s => s.toString().trim()).sort();
    } else if (typeof question.correctAnswer === 'string') {
      try { correct = JSON.parse(question.correctAnswer); }
      catch { correct = [question.correctAnswer]; }
      correct = correct.map(s => s.toString().trim()).sort();
    } else {
      correct = [];
    }

    const isCorrect = submitted.length > 0
      && submitted.length === correct.length
      && submitted.every((v, i) => v === correct[i]);
    return { isCorrect, normalizedAnswer: submitted, reason: 'exact_set' };
  }

  // ── matching ───────────────────────────────────────────────────────────────
  if (qt === 'matching') {
    let submitted;
    if (typeof submittedAnswer === 'string') {
      try { submitted = JSON.parse(submittedAnswer); }
      catch { submitted = {}; }
    } else {
      submitted = (submittedAnswer && typeof submittedAnswer === 'object') ? submittedAnswer : {};
    }

    const correctData = question.correctAnswerData;
    let correct = {};
    if (correctData && typeof correctData === 'object' && !Array.isArray(correctData)) {
      correct = correctData;
    }

    const correctKeys = Object.keys(correct);
    if (correctKeys.length === 0) return { isCorrect: false, normalizedAnswer: submitted, reason: 'no_correct_data' };

    const isCorrect = correctKeys.every(k => {
      const c = (correct[k] || '').toString().trim();
      const s = (submitted[k] || '').toString().trim();
      return s !== '' && s === c;
    });
    return { isCorrect, normalizedAnswer: submitted, reason: 'all_pairs' };
  }

  // ── fill_blank ─────────────────────────────────────────────────────────────
  if (qt === 'fill_blank') {
    let submitted;
    if (typeof submittedAnswer === 'string') {
      try { submitted = JSON.parse(submittedAnswer); }
      catch { submitted = [submittedAnswer]; }
    } else {
      submitted = Array.isArray(submittedAnswer) ? submittedAnswer : [];
    }

    const correctData = question.correctAnswerData; // [[accepted1, alt1], [accepted2], ...]
    const blanks      = question.blanks || [];

    if (!Array.isArray(correctData) || correctData.length === 0) {
      return { isCorrect: false, normalizedAnswer: submitted, reason: 'no_correct_data' };
    }

    let allCorrect = true;
    for (let i = 0; i < correctData.length; i++) {
      const accepted      = (correctData[i] || []).map(a => a.toString());
      const blankConfig   = blanks[i] || {};
      const caseSensitive = blankConfig.caseSensitive === true;
      const raw           = (submitted[i] || '').toString().trim();
      const normalized    = caseSensitive ? raw : raw.toLowerCase();
      const matches       = accepted.some(a => {
        const acc = caseSensitive ? a.trim() : a.trim().toLowerCase();
        return normalized === acc;
      });
      if (!matches) { allCorrect = false; break; }
    }
    return { isCorrect: allCorrect, normalizedAnswer: submitted, reason: 'all_blanks' };
  }

  // ── passage_based — evaluated per sub-question (parent has no direct answer) ─
  if (qt === 'passage_based') {
    // Parent passage question itself is never submitted — always skipped
    return { isCorrect: false, normalizedAnswer: null, reason: 'passage_parent_skipped' };
  }

  // ── Fallback ───────────────────────────────────────────────────────────────
  const submitted = (submittedAnswer || '').toString().trim();
  const correct   = (question.correctAnswer || '').toString().trim();
  return { isCorrect: submitted !== '' && submitted === correct, normalizedAnswer: submitted || null, reason: 'fallback_string' };
}

module.exports = { evaluateAnswer };
