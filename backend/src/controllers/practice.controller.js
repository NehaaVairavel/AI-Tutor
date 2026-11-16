const Question = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const UserProgress = require('../models/UserProgress');
const { createError } = require('../utils/helpers');
const mongoose = require('mongoose');
const { Types: { ObjectId } } = mongoose;
const { evaluateAnswer } = require('../utils/answerEvaluator');

// ─── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Normalize question text for exact-duplicate detection:
 * lower-case, collapse whitespace, strip punctuation differences.
 */
function normalizeText(text) {
  return (text || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Build a lightweight content fingerprint from the question text + options.
 * Used to detect exact (normalized) duplicates before inserting a new question.
 */
function buildFingerprint(text, options = []) {
  const normText = normalizeText(text);
  const normOpts = options
    .map(o => `${o.key}:${normalizeText(o.text)}`)
    .sort()
    .join('|');
  return `${normText}::${normOpts}`;
}

/**
 * Deduplicate an array of MongoDB ObjectIds, returning a new array of unique ids.
 * Preserves original order.
 */
function deduplicateIds(ids) {
  const seen = new Set();
  return ids.filter(id => {
    const key = id.toString();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Validate a question object returned from AI or any source.
 * Returns { valid: boolean, reason: string }.
 * Does NOT modify the question — callers decide how to handle failures.
 */
function validateQuestion(q) {
  if (!q || typeof q !== 'object') return { valid: false, reason: 'Not an object' };
  if (!q.text || typeof q.text !== 'string' || q.text.trim().length < 5)
    return { valid: false, reason: 'Missing or too-short question text' };
  if (!Array.isArray(q.options) || q.options.length < 2)
    return { valid: false, reason: 'Options must be an array with at least 2 items' };
  if (q.type === 'mcq' && q.options.length !== 4)
    return { valid: false, reason: 'Single-choice MCQ must have exactly 4 options' };
  const qt = q.questionType || q.type || 'single_choice';
  if (['single_choice', 'mcq', 'true_false', 'assertion_reason', 'statement_based'].includes(qt)) {
    if (!q.correctAnswer)
      return { valid: false, reason: 'Missing correctAnswer' };
    const keys = q.options.map(o => o.key);
    if (!keys.includes(q.correctAnswer))
      return { valid: false, reason: `correctAnswer "${q.correctAnswer}" not found among option keys: ${keys.join(',')}` };
  }
  if (['multiple_select', 'matching', 'fill_blank'].includes(qt)) {
    if (!q.correctAnswerData)
      return { valid: false, reason: 'Missing correctAnswerData for ' + qt };
  }
  const validDifficulties = ['easy', 'medium', 'hard'];
  if (!validDifficulties.includes(q.difficulty))
    return { valid: false, reason: `Invalid difficulty: ${q.difficulty}` };
  for (const opt of q.options) {
    if (!opt.key || !opt.text || typeof opt.text !== 'string' || opt.text.trim().length === 0)
      return { valid: false, reason: `Option ${opt.key} is missing text` };
  }
  return { valid: true, reason: null };
}

// ─── Start Practice Session ─────────────────────────────────────────────────────
const VALID_COUNTS = new Set([5, 10, 15, 20, 30]);

const startSession = async (req, res, next) => {
  try {
    const { examId, subjectId, topicId, difficulty = 'mixed', count } = req.body;

    if (!examId || !subjectId) {
      return next(createError('examId and subjectId are required.', 400));
    }

    // Strict whitelist: only supported values are accepted
    const parsedCount = Number(count);
    if (!VALID_COUNTS.has(parsedCount)) {
      return next(createError(
        `count must be one of: ${[...VALID_COUNTS].join(', ')}. Received: ${count}.`,
        400
      ));
    }
    const requestedCount = parsedCount;

    // ── Build base filter ────────────────────────────────────────────────────
    const baseFilter = {
      exam: new ObjectId(examId),
      subject: new ObjectId(subjectId),
      isActive: true,
      isApproved: true,
    };
    if (topicId) baseFilter.topic = new ObjectId(topicId);
    if (difficulty !== 'mixed') baseFilter.difficulty = difficulty;

    // ── Find questions this user has already attempted (all time) ────────────
    const previousSessions = await PracticeSession.find(
      { user: req.user._id, status: 'completed' },
      { questions: 1 }
    ).lean();

    const attemptedIds = new Set(
      previousSessions.flatMap(s => s.questions.map(id => id.toString()))
    );

    // ── Count eligible fresh questions ───────────────────────────────────────
    const freshFilter = { ...baseFilter };
    if (attemptedIds.size > 0) {
      freshFilter._id = { $nin: [...attemptedIds].map(id => new ObjectId(id)) };
    }

    const freshCount = await Question.countDocuments(freshFilter);
    const totalAvailable = await Question.countDocuments(baseFilter);

    if (totalAvailable === 0) {
      return next(createError('No questions available for the selected criteria.', 404));
    }

    let questions;
    let usedFreshOnly = true;

    if (freshCount >= requestedCount) {
      // Enough fresh (unattempted) questions — use only fresh ones
      questions = await Question.aggregate([
        { $match: freshFilter },
        { $sample: { size: requestedCount } },
        {
          $project: {
            text: 1, type: 1, questionType: 1, options: 1, difficulty: 1,
            marks: 1, negativeMarks: 1, timeLimit: 1, topic: 1, subject: 1,
            matchingPairs: 1, blanks: 1, statements: 1,
            assertionText: 1, reasonText: 1, passageText: 1,
          },
        },
      ]);
    } else if (freshCount > 0) {
      // Some fresh questions exist but not enough — use all fresh + fill with random previously-seen
      const freshQuestions = await Question.aggregate([
        { $match: freshFilter },
        { $sample: { size: freshCount } },
        {
          $project: {
            text: 1, type: 1, questionType: 1, options: 1, difficulty: 1,
            marks: 1, negativeMarks: 1, timeLimit: 1, topic: 1, subject: 1,
            matchingPairs: 1, blanks: 1, statements: 1,
            assertionText: 1, reasonText: 1, passageText: 1,
          },
        },
      ]);

      const neededFromPool = requestedCount - freshCount;
      const usedIds = new Set(freshQuestions.map(q => q._id.toString()));
      const repeatFilter = {
        ...baseFilter,
        _id: { $nin: [...usedIds].map(id => new ObjectId(id)) },
      };
      const repeatCount = await Question.countDocuments(repeatFilter);

      if (repeatCount > 0) {
        const repeatQuestions = await Question.aggregate([
          { $match: repeatFilter },
          { $sample: { size: Math.min(neededFromPool, repeatCount) } },
          {
            $project: {
              text: 1, type: 1, questionType: 1, options: 1, difficulty: 1,
              marks: 1, negativeMarks: 1, timeLimit: 1, topic: 1, subject: 1,
              matchingPairs: 1, blanks: 1, statements: 1,
              assertionText: 1, reasonText: 1, passageText: 1,
            },
          },
        ]);
        questions = [...freshQuestions, ...repeatQuestions];
        usedFreshOnly = false;
      } else {
        questions = freshQuestions;
        usedFreshOnly = false;
      }
    } else {
      // No fresh questions at all — fall back to random from full pool
      questions = await Question.aggregate([
        { $match: baseFilter },
        { $sample: { size: requestedCount } },
        {
          $project: {
            text: 1, type: 1, questionType: 1, options: 1, difficulty: 1,
            marks: 1, negativeMarks: 1, timeLimit: 1, topic: 1, subject: 1,
            matchingPairs: 1, blanks: 1, statements: 1,
            assertionText: 1, reasonText: 1, passageText: 1,
          },
        },
      ]);
      usedFreshOnly = false;
    }

    // ── Guarantee no duplicate IDs within this session ───────────────────────
    // $sample can theoretically return the same doc twice in edge cases.
    const seenIds = new Set();
    questions = questions.filter(q => {
      const key = q._id.toString();
      if (seenIds.has(key)) return false;
      seenIds.add(key);
      return true;
    });

    if (questions.length === 0) {
      return next(createError('No questions available for the selected criteria.', 404));
    }

    // ── Shortfall check — reject before creating session ─────────────────────
    // We only proceed to create the session when the full requested count is met.
    // If fewer questions are available than requested, return 422 with a clear
    // message so the frontend can offer the user a choice instead of silently
    // starting an undersized session.
    const shortfall = questions.length < requestedCount;
    if (shortfall) {
      return res.status(422).json({
        success: false,
        shortfall: true,
        data: {
          meta: {
            requestedCount,
            available: questions.length,
            totalAvailable,
            difficulty,
            shortfallMessage: `Only ${questions.length} question${questions.length !== 1 ? 's are' : ' is'} available for the selected ${difficulty !== 'mixed' ? `"${difficulty}" difficulty ` : ''}criteria — fewer than the ${requestedCount} you requested. You can change the difficulty, select a different topic, or proceed with ${questions.length} question${questions.length !== 1 ? 's' : ''}.`,
          },
        },
        message: `Only ${questions.length} of ${requestedCount} requested questions are available.`,
      });
    }

    const questionIds = questions.map(q => q._id);

    const session = await PracticeSession.create({
      user: req.user._id,
      exam: examId,
      subject: subjectId,
      topic: topicId || null,
      difficulty,
      questions: questionIds,
      status: 'in_progress',
    });

    // Tell the client how many questions are fresh vs. repeated
    const freshInSession = questions.filter(
      q => !attemptedIds.has(q._id.toString())
    ).length;

    return res.status(201).json({
      success: true,
      message: 'Practice session started.',
      data: {
        session: { _id: session._id, difficulty, status: session.status },
        questions,
        meta: {
          requestedCount,
          delivered: questions.length,
          freshQuestions: freshInSession,
          repeatedQuestions: questions.length - freshInSession,
          totalAvailable,
          allFresh: usedFreshOnly,
          shortfall: false,
          shortfallMessage: null,
        },
      },
    });
  } catch (err) { next(err); }
};

// ─── Submit Practice Session ────────────────────────────────────────────────────
const submitSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const { answers, timeTaken = 0 } = req.body;
    // answers: [{ questionId, selectedAnswer, timeTaken }]

    const session = await PracticeSession.findOne({ _id: sessionId, user: req.user._id });
    if (!session) return next(createError('Practice session not found.', 404));

    // ── Prevent duplicate submission ─────────────────────────────────────────
    if (session.status === 'completed') {
      // Return the already-computed result instead of an error so the results
      // page still works on hard-refresh after submission.
      return res.json({
        success: true,
        message: 'Session already submitted.',
        data: { result: session.result, sessionId: session._id },
      });
    }

    // Fetch full question data from DB — includes text, options, explanation, topic, subject
    const questions = await Question.find({ _id: { $in: session.questions } })
      .select('correctAnswer correctAnswerData marks negativeMarks text type questionType options explanation difficulty topic subject matchingPairs blanks statements assertionText reasonText passageText')
      .populate('topic', 'name')
      .populate('subject', 'name');
    const questionMap = {};
    questions.forEach(q => { questionMap[q._id.toString()] = q; });

    let correct = 0, wrong = 0, skipped = 0;
    let rawMarks = 0; // before clamping
    let negativeMarksTotal = 0;
    const attempts = [];

    // Build map: { questionId: { selectedAnswer, timeTaken } }
    const answersMap = {};
    (answers || []).forEach(a => {
      answersMap[a.questionId] = {
        selectedAnswer: a.selectedAnswer || null,
        timeTaken: Number(a.timeTaken) || 0,
      };
    });

    for (const qId of session.questions.map(String)) {
      const q = questionMap[qId];
      if (!q) continue;

      const { selectedAnswer = null, timeTaken: qTime = 0 } = answersMap[qId] || {};
      // isSkipped: null/undefined/""/[]/{} all count as skipped
      const isSkipped = !selectedAnswer
        || (Array.isArray(selectedAnswer) && selectedAnswer.length === 0)
        || (typeof selectedAnswer === 'object' && !Array.isArray(selectedAnswer) && Object.keys(selectedAnswer).length === 0);
      let isCorrect = false;
      let awarded = 0;

      if (isSkipped) {
        skipped++;
        awarded = 0;
      } else {
        const evalResult = evaluateAnswer(q, selectedAnswer);
        isCorrect = evalResult.isCorrect;
        if (isCorrect) {
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
      }

      attempts.push({
        question: qId,
        selectedAnswer,
        correctAnswer: q.correctAnswerData ?? q.correctAnswer,
        isCorrect,
        isSkipped,
        marksAwarded: awarded,
        timeTaken: qTime,
        markedForReview: false,
        // Freeze the full question data at submission time
        questionSnapshot: {
          text:          q.text         || '',
          questionType:  q.questionType || 'single_choice',
          type:          q.type         || 'mcq',
          options:       (q.options || []).map(o => ({ key: o.key, text: o.text })),
          explanation:   q.explanation  || '',
          difficulty:    q.difficulty   || '',
          marks:         q.marks        ?? 1,
          negativeMarks: q.negativeMarks ?? 0,
          topicName:     (q.topic   && typeof q.topic   === 'object') ? (q.topic.name   || '') : '',
          subjectName:   (q.subject && typeof q.subject === 'object') ? (q.subject.name || '') : '',
          // Extended fields for new question types
          matchingPairs: q.matchingPairs  || null,
          blanks:        q.blanks         || null,
          statements:    q.statements     || null,
          assertionText: q.assertionText  || '',
          reasonText:    q.reasonText     || '',
          passageText:   q.passageText    || '',
        },
      });

      // Update question usage stats (non-blocking, best-effort)
      Question.findByIdAndUpdate(qId, {
        $inc: {
          timesUsed: 1,
          timesCorrect: isCorrect ? 1 : 0,
          timesWrong: !isCorrect && !isSkipped ? 1 : 0,
        },
      }).catch(() => {}); // fire-and-forget
    }

    const totalQuestions = session.questions.length;
    const totalMarks = questions.reduce((sum, q) => sum + (q.marks ?? 1), 0);
    const attempted = correct + wrong;

    // Accuracy = correct / attempted (not total) — excludes skipped
    const accuracy = attempted > 0 ? Math.round((correct / attempted) * 100) : 0;

    // marksObtained shown to user is clamped at 0 (cannot go below 0)
    const marksObtained = Math.max(0, rawMarks);

    // Percentage is derived from clamped marksObtained (so it cannot be negative)
    const percentage = totalMarks > 0
      ? Math.round((marksObtained / totalMarks) * 100)
      : 0;

    session.attempts = attempts;
    session.status = 'completed';
    session.completedAt = new Date();
    session.result = {
      totalQuestions,
      attempted,
      correct,
      wrong,
      skipped,
      marksObtained,       // clamped ≥ 0
      rawMarks,            // actual signed score (may be negative — stored for analytics)
      negativeMarks: negativeMarksTotal,
      totalMarks,
      accuracy,
      timeTaken,
      percentage,          // based on clamped marksObtained → always ≥ 0
    };
    await session.save();

    // ── Emit real-time analytics update to admin dashboard ────────────────────
    // Fire-and-forget; never blocks the response or causes DB rollback.
    try {
      const { getIO } = require('../socketio');
      const io = getIO();
      if (io) {
        io.to('admin-room').emit('admin:analytics-updated', {
          userId:          req.user._id,
          sessionId:       session._id,
          exam:            session.exam,
          attempted:       attempted,
          correct,
          wrong,
          skipped,
          accuracy,
          studyTimeSec:    timeTaken,
          completedAt:     session.completedAt,
        });
      }
    } catch (_) {
      // Socket.IO not initialised (e.g. tests) — safe to ignore
    }

    // Update user progress asynchronously (fire-and-forget)
    updateUserProgress(req.user._id, session).catch(console.error);

    return res.json({
      success: true,
      message: 'Practice session submitted.',
      data: { result: session.result, sessionId: session._id },
    });
  } catch (err) { next(err); }
};

// ─── Get Session Result ─────────────────────────────────────────────────────────
const getSessionResult = async (req, res, next) => {
  try {
    const session = await PracticeSession.findOne({ _id: req.params.sessionId, user: req.user._id })
      .populate({
        path: 'questions',
        populate: [{ path: 'topic', select: 'name' }, { path: 'subject', select: 'name' }],
      })
      .populate('subject', 'name')
      .populate('topic', 'name');

    if (!session) return next(createError('Session not found.', 404));

    return res.json({ success: true, message: 'Session result retrieved.', data: { session } });
  } catch (err) { next(err); }
};

// ─── Get Session Review (full Q&A with snapshots + legacy fallback) ──────────────
const getSessionReview = async (req, res, next) => {
  try {
    const { sessionId } = req.params;

    // Validate ObjectId format before hitting MongoDB
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return next(createError('Invalid session ID.', 400));
    }

    const session = await PracticeSession.findOne({
      _id: sessionId,
      user: req.user._id,
      status: 'completed',
    })
      .populate('subject', 'name')
      .populate('topic',   'name')
      .populate('exam',    'name shortName')
      .lean();

    if (!session) {
      return next(createError(
        'Practice session not found, or it does not belong to you, or it has not been completed yet.',
        404
      ));
    }

    // ── Collect all question IDs we may need from live DB ─────────────────────
    // Sources: snapshot attempts (.question) + legacy sessions (.questions list)
    const attemptQuestionIds = (session.attempts || [])
      .map(a => a.question)
      .filter(Boolean);
    const legacyQuestionIds  = (session.questions || []).filter(Boolean);
    const allIds = [...new Set([
      ...attemptQuestionIds.map(String),
      ...legacyQuestionIds.map(String),
    ])];

    // Fetch live question docs — used as fallback when snapshot is missing
    const liveQuestions = allIds.length
      ? await Question.find({ _id: { $in: allIds } })
          .select('text type options explanation difficulty topic subject correctAnswer marks negativeMarks')
          .populate('topic',   'name')
          .populate('subject', 'name')
          .lean()
      : [];
    const liveMap = {};
    liveQuestions.forEach(q => { liveMap[q._id.toString()] = q; });

    // ── Case 1: session has attempts array (modern sessions) ──────────────────
    if (session.attempts && session.attempts.length > 0) {
      const reviewItems = session.attempts.map((attempt, idx) => {
        const snap = attempt.questionSnapshot || {};
        const live = liveMap[attempt.question?.toString()] || null;

        // Snapshot is ground-truth for display text/options (frozen at submission)
        // Live explanation is preferred (admins may have improved it)
        const hasSnapshot = !!(snap.text);
        const explanation = live?.explanation || snap.explanation || '';

        return {
          index:          idx,
          questionId:     attempt.question,
          // Question display — snapshot primary, live fallback
          text:           snap.text         || live?.text         || '(Question text unavailable)',
          type:           snap.type         || live?.type         || 'mcq',
          questionType:   snap.questionType || live?.questionType || 'single_choice',
          options:        (snap.options && snap.options.length)
                            ? snap.options
                            : (live?.options || []),
          explanation,
          difficulty:     snap.difficulty   || live?.difficulty   || '',
          topicName:      snap.topicName
                            || (live?.topic   && typeof live.topic   === 'object' ? live.topic.name   : '')
                            || '',
          subjectName:    snap.subjectName
                            || (live?.subject && typeof live.subject === 'object' ? live.subject.name : '')
                            || '',
          marks:          snap.marks         ?? live?.marks         ?? 1,
          negativeMarks:  snap.negativeMarks ?? live?.negativeMarks ?? 0,
          // Extended type-specific fields (snapshot primary, live fallback)
          matchingPairs:  snap.matchingPairs || live?.matchingPairs || null,
          blanks:         snap.blanks        || live?.blanks        || null,
          statements:     snap.statements    || live?.statements    || null,
          assertionText:  snap.assertionText || live?.assertionText || '',
          reasonText:     snap.reasonText    || live?.reasonText    || '',
          passageText:    snap.passageText   || live?.passageText   || '',
          // Attempt data — always from the stored attempt record
          selectedAnswer: attempt.selectedAnswer ?? null,
          correctAnswer:  attempt.correctAnswer,
          isCorrect:      attempt.isCorrect,
          isSkipped:      attempt.isSkipped,
          marksAwarded:   attempt.marksAwarded,
          timeTaken:      attempt.timeTaken,
          // Let the UI know if we had to fall back to live data
          snapshotAvailable: hasSnapshot,
        };
      });

      return res.json({
        success: true,
        message: 'Session review retrieved.',
        data: {
          session: {
            _id:         session._id,
            exam:        session.exam,
            subject:     session.subject,
            topic:       session.topic,
            difficulty:  session.difficulty,
            result:      session.result,
            startedAt:   session.startedAt,
            completedAt: session.completedAt,
          },
          reviewItems,
          totalQuestions: reviewItems.length,
          isLegacy: false,
        },
      });
    }

    // ── Case 2: legacy session — only has .questions list, no .attempts ────────
    // We can show live question data but cannot show what the user answered.
    // Return a clear limitation flag; the frontend should show an appropriate notice.
    const legacyItems = legacyQuestionIds.map((qId, idx) => {
      const live = liveMap[qId.toString()] || null;
      return {
        index:          idx,
        questionId:     qId,
        text:           live?.text       || '(Question no longer available)',
        type:           live?.type       || 'mcq',
        options:        live?.options    || [],
        explanation:    live?.explanation || '',
        difficulty:     live?.difficulty || '',
        topicName:      (live?.topic    && typeof live.topic    === 'object') ? live.topic.name    : '',
        subjectName:    (live?.subject  && typeof live.subject  === 'object') ? live.subject.name  : '',
        marks:          live?.marks         ?? 1,
        negativeMarks:  live?.negativeMarks ?? 0,
        selectedAnswer: null,  // not stored in legacy sessions
        correctAnswer:  live?.correctAnswer || null,
        isCorrect:      null,
        isSkipped:      null,
        marksAwarded:   null,
        timeTaken:      null,
        snapshotAvailable: false,
      };
    });

    return res.json({
      success: true,
      message: 'Legacy session review — per-question answer data was not saved for this attempt.',
      data: {
        session: {
          _id:         session._id,
          exam:        session.exam,
          subject:     session.subject,
          topic:       session.topic,
          difficulty:  session.difficulty,
          result:      session.result,
          startedAt:   session.startedAt,
          completedAt: session.completedAt,
        },
        reviewItems: legacyItems,
        totalQuestions: legacyItems.length,
        isLegacy: true,
        legacyNote: 'This is an older practice session. Per-question answer choices were not recorded. New sessions will include full review data.',
      },
    });
  } catch (err) { next(err); }
};

// ─── Generate Explanation for a Question via AI ──────────────────────────────────
const explainQuestion = async (req, res, next) => {
  try {
    const { sessionId, questionIndex } = req.params;
    const idx = parseInt(questionIndex, 10);
    if (isNaN(idx) || idx < 0) return next(createError('Invalid question index.', 400));

    const session = await PracticeSession.findOne({
      _id: sessionId, user: req.user._id, status: 'completed',
    }).lean();

    if (!session) return next(createError('Completed session not found.', 404));

    const attempt = session.attempts?.[idx];
    if (!attempt) return next(createError('Question not found in this session.', 404));

    const snap = attempt.questionSnapshot || {};
    if (!snap.text) return next(createError('Question snapshot unavailable for AI explanation.', 422));

    // Check AI config server-side only — never expose API key to client
    const AI_PROVIDER = (process.env.AI_PROVIDER || 'gemini').toLowerCase();
    const AI_API_KEY  = process.env.AI_API_KEY  || '';
    const AI_MODEL    = process.env.AI_MODEL    || 'gemini-1.5-flash';
    const knownPlaceholders = [
      '', 'your_ai_api_key_here', 'your_openai_key_here',
      'your_gemini_key_here', 'your_anthropic_key_here',
    ];
    const isDemoMode = knownPlaceholders.includes(AI_API_KEY.trim()) || AI_API_KEY.trim().length < 20;

    if (isDemoMode) {
      return res.json({
        success: true,
        message: 'AI explanation unavailable in demo mode.',
        data: {
          explanation: null,
          demoMode: true,
          hint: 'Add a valid AI_API_KEY in backend/.env to enable AI-generated explanations.',
        },
      });
    }

    const optionsText = (snap.options || []).map(o => `${o.key}. ${o.text}`).join('\n');
    const resultLine  = attempt.isSkipped
      ? 'The student skipped this question.'
      : attempt.isCorrect
      ? `The student answered correctly (${attempt.selectedAnswer}).`
      : `The student answered ${attempt.selectedAnswer} but the correct answer is ${attempt.correctAnswer}.`;

    const prompt = `You are an expert tutor for competitive exams. Explain the following question.\n\nQuestion: ${snap.text}\n\nOptions:\n${optionsText}\n\nCorrect Answer: ${attempt.correctAnswer}\n${resultLine}\n\nProvide:\n1. Why the correct answer is right (with clear reasoning)\n2. Step-by-step solution if numeric or logical\n3. Why the other options are incorrect\n4. A memory tip or shortcut if applicable\n\nBe concise (under 300 words) and beginner-friendly.`;

    let explanation;

    if (AI_PROVIDER === 'gemini' || AI_PROVIDER === 'google') {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${AI_MODEL}:generateContent?key=${AI_API_KEY}`;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const resp = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            generationConfig: { maxOutputTokens: 600, temperature: 0.3 },
          }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error?.message || `Gemini API error ${resp.status}`);
        explanation = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!explanation) throw new Error('Empty response from Gemini.');
      } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') throw new Error('AI request timed out (25s). Please try again.');
        throw e;
      }
    } else if (AI_PROVIDER === 'openai') {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 25000);
      try {
        const resp = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${AI_API_KEY}` },
          body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }], max_tokens: 600, temperature: 0.3 }),
          signal: controller.signal,
        });
        clearTimeout(timeout);
        const data = await resp.json();
        if (!resp.ok) throw new Error(data?.error?.message || `OpenAI error ${resp.status}`);
        explanation = data?.choices?.[0]?.message?.content;
        if (!explanation) throw new Error('Empty response from OpenAI.');
      } catch (e) {
        clearTimeout(timeout);
        if (e.name === 'AbortError') throw new Error('AI request timed out (25s). Please try again.');
        throw e;
      }
    } else {
      return next(createError(`AI provider "${AI_PROVIDER}" not supported for explanation generation.`, 501));
    }

    return res.json({
      success: true,
      message: 'Explanation generated.',
      data: { explanation, demoMode: false },
    });
  } catch (err) { next(err); }
};

// ─── Get Session Questions (for page refresh recovery) ──────────────────────────
const getSessionQuestions = async (req, res, next) => {
  try {
    const session = await PracticeSession.findOne({
      _id: req.params.sessionId,
      user: req.user._id,
      status: 'in_progress',
    });
    if (!session) return next(createError('Active session not found. It may have already been submitted.', 404));

    const questions = await Question.find({ _id: { $in: session.questions } })
      .select('text type questionType options difficulty marks negativeMarks timeLimit topic subject matchingPairs blanks statements assertionText reasonText passageText')
      .populate('topic', 'name')
      .populate('subject', 'name');

    // Return in original order (preserving the stored session order)
    const ordered = session.questions
      .map(id => questions.find(q => q._id.toString() === id.toString()))
      .filter(Boolean);

    return res.json({ success: true, message: 'Session questions retrieved.', data: { questions: ordered } });
  } catch (err) { next(err); }
};

// ─── Get User's Practice Sessions ──────────────────────────────────────────────
const getMySessions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [sessions, total] = await Promise.all([
      PracticeSession.find({ user: req.user._id, status: 'completed' })
        .populate('subject', 'name')
        .populate('topic', 'name')
        .populate('exam', 'name shortName')
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .select('-attempts -questions'),
      PracticeSession.countDocuments({ user: req.user._id, status: 'completed' }),
    ]);

    res.json({
      success: true,
      message: 'Sessions retrieved.',
      data: {
        sessions,
        pagination: {
          total,
          page:       Number(page),
          limit:      Number(limit),
          pages:      Math.ceil(total / Number(limit)), // used by Practice.jsx
          totalPages: Math.ceil(total / Number(limit)), // alias for compatibility
        },
      },
    });
  } catch (err) { next(err); }
};

// ─── Get Wrong Questions (Mistakes) ────────────────────────────────────────────
const getMyMistakes = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, subjectId, topicId } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const matchFilter = { user: req.user._id, status: 'completed' };

    const sessions = await PracticeSession.find(matchFilter)
      .populate({
        path: 'questions',
        match: subjectId ? { subject: subjectId } : topicId ? { topic: topicId } : {},
        populate: [{ path: 'subject', select: 'name' }, { path: 'topic', select: 'name' }],
      })
      .select('attempts questions subject topic exam')
      .lean();

    // Extract wrong attempts — deduplicate by (questionId, sessionId) to prevent
    // double-counting if a session was somehow processed twice.
    const seen = new Set();
    const mistakes = [];
    for (const session of sessions) {
      const wrongAttempts = session.attempts.filter(a => !a.isCorrect && !a.isSkipped);
      for (const attempt of wrongAttempts) {
        const key = `${session._id}:${attempt.question}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const q = (session.questions || []).find(
          q => q && q._id && q._id.toString() === attempt.question.toString()
        );
        if (q) {
          mistakes.push({
            question: q,
            selectedAnswer: attempt.selectedAnswer,
            correctAnswer: attempt.correctAnswer,
            sessionId: session._id,
          });
        }
      }
    }

    const total = mistakes.length;
    const paginated = mistakes.slice(skip, skip + Number(limit));

    res.json({
      success: true,
      message: 'Mistakes retrieved.',
      data: {
        mistakes: paginated,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) { next(err); }
};

// ─── Internal: Update UserProgress ─────────────────────────────────────────────
async function updateUserProgress(userId, session) {
  const { result, exam, subject, topic, attempts } = session;

  let progress = await UserProgress.findOne({ user: userId, exam });
  if (!progress) {
    progress = new UserProgress({ user: userId, exam });
  }

  progress.totalQuestionsAttempted += result.totalQuestions;
  progress.totalCorrect += result.correct;
  progress.totalWrong += result.wrong;
  progress.totalSkipped += result.skipped;
  progress.totalStudyTime += result.timeTaken || 0;
  progress.totalPracticeSessions += 1;

  const totalAnswered = progress.totalCorrect + progress.totalWrong;
  progress.overallAccuracy = totalAnswered > 0
    ? Math.round((progress.totalCorrect / totalAnswered) * 100)
    : 0;

  // ─── Streak ──────────────────────────────────────────────────────────────────
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const last = progress.lastStudyDate ? new Date(progress.lastStudyDate) : null;
  if (last) {
    last.setHours(0, 0, 0, 0);
    const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
    if (diffDays === 1) progress.currentStreak += 1;
    else if (diffDays > 1) progress.currentStreak = 1;
    // Same day: streak unchanged
  } else {
    progress.currentStreak = 1;
  }
  progress.longestStreak = Math.max(progress.longestStreak, progress.currentStreak);
  progress.lastStudyDate = new Date();

  // ─── Subject Progress ────────────────────────────────────────────────────────
  if (subject) {
    const subjectStr = subject.toString();
    let sp = progress.subjectProgress.find(s => s.subject && s.subject.toString() === subjectStr);
    if (!sp) {
      progress.subjectProgress.push({
        subject,
        totalAttempted: 0,
        totalCorrect: 0,
        accuracy: 0,
        lastPracticed: null,
      });
      sp = progress.subjectProgress[progress.subjectProgress.length - 1];
    }
    sp.totalAttempted += result.totalQuestions;
    sp.totalCorrect += result.correct;
    sp.accuracy = sp.totalAttempted > 0
      ? Math.round((sp.totalCorrect / sp.totalAttempted) * 100)
      : 0;
    sp.lastPracticed = new Date();
  }

  // ─── Topic Progress ──────────────────────────────────────────────────────────
  if (topic) {
    const topicStr = topic.toString();
    let tp = progress.topicProgress.find(t => t.topic && t.topic.toString() === topicStr);
    if (!tp) {
      progress.topicProgress.push({
        topic,
        topicName: '',
        subject: subject || null,
        subjectName: '',
        totalAttempted: 0,
        totalCorrect: 0,
        totalWrong: 0,
        totalSkipped: 0,
        accuracy: 0,
        masteryLevel: 'not_started',
        lastPracticed: null,
      });
      tp = progress.topicProgress[progress.topicProgress.length - 1];
    }
    // Refresh name snapshot from the populated session (if available)
    if (session.topic && typeof session.topic === 'object' && session.topic.name) {
      tp.topicName = session.topic.name;
    }
    if (session.subject && typeof session.subject === 'object' && session.subject.name) {
      tp.subjectName = session.subject.name;
    }
    tp.totalAttempted += result.totalQuestions;
    tp.totalCorrect += result.correct;
    tp.totalWrong += result.wrong;
    tp.totalSkipped += result.skipped;
    const tAnswered = tp.totalCorrect + tp.totalWrong;
    tp.accuracy = tAnswered > 0 ? Math.round((tp.totalCorrect / tAnswered) * 100) : 0;
    tp.masteryLevel =
      tp.accuracy >= 80 ? 'strong' :
      tp.accuracy >= 60 ? 'average' :
      tp.totalAttempted > 0 ? 'weak' : 'not_started';
    tp.lastPracticed = new Date();
  } else if (subject && attempts && attempts.length > 0) {
    // No specific topic selected — update all topics touched in this session
    const QuestionModel = require('../models/Question');
    const questionIds = attempts.map(a => a.question);
    const qs = await QuestionModel.find({ _id: { $in: questionIds } })
      .select('topic subject')
      .populate('topic', 'name')
      .populate('subject', 'name');

    for (const attempt of attempts) {
      const q = qs.find(q => q._id.toString() === attempt.question.toString());
      if (!q || !q.topic) continue;
      const topicStr = q.topic._id ? q.topic._id.toString() : q.topic.toString();
      let tp = progress.topicProgress.find(t => t.topic && t.topic.toString() === topicStr);
      if (!tp) {
        progress.topicProgress.push({
          topic: q.topic._id || q.topic,
          topicName: q.topic.name || '',
          subject: q.subject?._id || q.subject || subject,
          subjectName: q.subject?.name || '',
          totalAttempted: 0, totalCorrect: 0, totalWrong: 0, totalSkipped: 0,
          accuracy: 0, masteryLevel: 'not_started', lastPracticed: null,
        });
        tp = progress.topicProgress[progress.topicProgress.length - 1];
      }
      // Refresh name snapshot
      if (q.topic?.name) tp.topicName = q.topic.name;
      if (q.subject?.name) tp.subjectName = q.subject.name;

      tp.totalAttempted += 1;
      if (attempt.isSkipped) tp.totalSkipped += 1;
      else if (attempt.isCorrect) tp.totalCorrect += 1;
      else tp.totalWrong += 1;
      const tAnswered = tp.totalCorrect + tp.totalWrong;
      tp.accuracy = tAnswered > 0 ? Math.round((tp.totalCorrect / tAnswered) * 100) : 0;
      tp.masteryLevel =
        tp.accuracy >= 80 ? 'strong' :
        tp.accuracy >= 60 ? 'average' :
        tp.totalAttempted > 0 ? 'weak' : 'not_started';
      tp.lastPracticed = new Date();
    }
  }

  // ─── Rebuild weak/strong topic lists ────────────────────────────────────────
  progress.weakTopics = progress.topicProgress
    .filter(t => t.masteryLevel === 'weak')
    .map(t => t.topic);
  progress.strongTopics = progress.topicProgress
    .filter(t => t.masteryLevel === 'strong')
    .map(t => t.topic);

  await progress.save();

  // ── Emit per-user analytics update to admin user table ─────────────────────
  // Aggregate ALL UserProgress records for this user so the admin user-table
  // row shows the same totals that GET /api/admin/users/:id would return.
  // Fire-and-forget — never block or throw.
  try {
    const { getIO } = require('../socketio');
    const io = getIO();
    if (io) {
      // Sum across all exams for this user
      const allProgress = await UserProgress.find({ user: userId })
        .select('totalQuestionsAttempted totalCorrect totalWrong totalStudyTime totalPracticeSessions currentStreak longestStreak lastStudyDate')
        .lean();

      const agg = {
        totalQuestionsAttempted: 0, totalCorrect: 0, totalWrong: 0,
        totalStudyTime: 0, totalPracticeSessions: 0,
        currentStreak: 0, longestStreak: 0, lastStudyDate: null,
        overallAccuracy: 0,
      };
      for (const p of allProgress) {
        agg.totalQuestionsAttempted += p.totalQuestionsAttempted || 0;
        agg.totalCorrect            += p.totalCorrect            || 0;
        agg.totalWrong              += p.totalWrong              || 0;
        agg.totalStudyTime          += p.totalStudyTime          || 0;
        agg.totalPracticeSessions   += p.totalPracticeSessions   || 0;
        agg.currentStreak  = Math.max(agg.currentStreak,  p.currentStreak  || 0);
        agg.longestStreak  = Math.max(agg.longestStreak,  p.longestStreak  || 0);
        if (!agg.lastStudyDate || (p.lastStudyDate && p.lastStudyDate > agg.lastStudyDate)) {
          agg.lastStudyDate = p.lastStudyDate;
        }
      }
      const answered = agg.totalCorrect + agg.totalWrong;
      agg.overallAccuracy = answered > 0 ? Math.round((agg.totalCorrect / answered) * 100) : 0;

      io.to('admin-room').emit('admin:user-analytics-updated', {
        userId: userId.toString(),
        analytics: agg,
      });
    }
  } catch (_) {
    // Socket.IO not initialised (tests) — safe to ignore
  }
}

module.exports = {
  startSession,
  submitSession,
  getSessionResult,
  getSessionReview,
  explainQuestion,
  getMySessions,
  getMyMistakes,
  getSessionQuestions,
  // Export validation helpers for use by question generation services
  validateQuestion,
  buildFingerprint,
  normalizeText,
};
