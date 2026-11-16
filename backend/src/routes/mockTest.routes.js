const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { protect, adminOnly } = require('../middleware/auth');
const MockTest = require('../models/MockTest');
const MockTestAttempt = require('../models/MockTestAttempt');
const Question = require('../models/Question');
const UserProgress = require('../models/UserProgress');
const { createError } = require('../utils/helpers');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isValidId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

/**
 * Accuracy = correct / (correct + wrong) × 100
 * Excludes skipped questions (consistent with practice sessions).
 */
function calcAccuracy(correct, wrong) {
  const attempted = correct + wrong;
  return attempted > 0 ? Math.round((correct / attempted) * 100) : 0;
}

/**
 * After a mock test is completed, update UserProgress topic-level stats
 * using the same logic as practice sessions, but scoped to this attempt.
 */
async function updateProgressFromAttempt(attempt) {
  try {
    const { user: userId, examId, attempts: questionAttempts } = attempt;
    if (!examId || !questionAttempts || questionAttempts.length === 0) return;

    let progress = await UserProgress.findOne({ user: userId, exam: examId });
    if (!progress) {
      progress = new UserProgress({ user: userId, exam: examId });
    }

    // ── Overall stats ────────────────────────────────────────────────────────
    const r = attempt.result;
    progress.totalQuestionsAttempted += r.totalQuestions;
    progress.totalCorrect  += r.correct;
    progress.totalWrong    += r.wrong;
    progress.totalSkipped  += r.skipped;
    progress.totalStudyTime += attempt.timeTaken || 0;
    progress.totalMockTests += 1;

    const totalAnswered = progress.totalCorrect + progress.totalWrong;
    progress.overallAccuracy = totalAnswered > 0
      ? Math.round((progress.totalCorrect / totalAnswered) * 100)
      : 0;

    // ── Streak ───────────────────────────────────────────────────────────────
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const last = progress.lastStudyDate ? new Date(progress.lastStudyDate) : null;
    if (last) {
      last.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today - last) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) progress.currentStreak += 1;
      else if (diffDays > 1) progress.currentStreak = 1;
    } else {
      progress.currentStreak = 1;
    }
    progress.longestStreak = Math.max(progress.longestStreak, progress.currentStreak);
    progress.lastStudyDate = new Date();

    // ── Per-topic stats (using snapshots stored on the attempt) ───────────────
    for (const qa of questionAttempts) {
      if (!qa.topicId) continue;
      const topicStr = qa.topicId.toString();

      let tp = progress.topicProgress.find(t => t.topic && t.topic.toString() === topicStr);
      if (!tp) {
        progress.topicProgress.push({
          topic: qa.topicId,
          topicName: qa.topicName || '',
          subject: qa.subjectId || null,
          subjectName: qa.subjectName || '',
          totalAttempted: 0, totalCorrect: 0, totalWrong: 0, totalSkipped: 0,
          accuracy: 0, masteryLevel: 'not_started', lastPracticed: null,
        });
        tp = progress.topicProgress[progress.topicProgress.length - 1];
      }

      // Always refresh the name snapshot (topic may have been renamed)
      if (qa.topicName) tp.topicName = qa.topicName;
      if (qa.subjectName) tp.subjectName = qa.subjectName;

      tp.totalAttempted += 1;
      if (qa.isSkipped)       tp.totalSkipped += 1;
      else if (qa.isCorrect)  tp.totalCorrect += 1;
      else                    tp.totalWrong   += 1;

      const tAnswered = tp.totalCorrect + tp.totalWrong;
      tp.accuracy = tAnswered > 0 ? Math.round((tp.totalCorrect / tAnswered) * 100) : 0;
      tp.masteryLevel =
        tp.accuracy >= 80 ? 'strong' :
        tp.accuracy >= 60 ? 'average' :
        tp.totalAttempted > 0 ? 'weak' : 'not_started';
      tp.lastPracticed = new Date();
    }

    // ── Rebuild weak/strong lists ────────────────────────────────────────────
    progress.weakTopics   = progress.topicProgress.filter(t => t.masteryLevel === 'weak').map(t => t.topic);
    progress.strongTopics = progress.topicProgress.filter(t => t.masteryLevel === 'strong').map(t => t.topic);

    await progress.save();
  } catch (err) {
    console.error('[MockTest] updateProgressFromAttempt error:', err.message);
  }
}

// ─── GET all published mock tests ─────────────────────────────────────────────
router.get('/', protect, async (req, res, next) => {
  try {
    const { examId } = req.query;
    const filter = { isActive: true };
    if (examId && isValidId(examId)) filter.exam = examId;

    const mockTests = await MockTest.find(filter)
      .sort({ order: 1, createdAt: -1 })
      .populate('exam', 'name shortName');

    res.json({ success: true, data: { mockTests } });
  } catch (err) { next(err); }
});

// ─── GET user's past mock-test attempts ───────────────────────────────────────
// IMPORTANT: This route MUST be declared before /:id to avoid being swallowed.
router.get('/attempts/me', protect, async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (Number(page) - 1) * Number(limit);

    const [attempts, total] = await Promise.all([
      MockTestAttempt.find({ user: req.user._id, status: 'completed' })
        .sort({ submittedAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .populate('mockTest', 'title exam')
        .populate('examId', 'name shortName')
        .select('-attempts -questions'), // omit per-question detail for list view
      MockTestAttempt.countDocuments({ user: req.user._id, status: 'completed' }),
    ]);

    res.json({
      success: true,
      data: {
        attempts,
        pagination: {
          total,
          page: Number(page),
          limit: Number(limit),
          totalPages: Math.ceil(total / Number(limit)),
        },
      },
    });
  } catch (err) { next(err); }
});

// ─── GET a specific attempt (result view) ─────────────────────────────────────
router.get('/attempts/:attemptId', protect, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    if (!isValidId(attemptId)) return next(createError('Invalid attempt ID.', 400));

    const attempt = await MockTestAttempt.findOne({ _id: attemptId, user: req.user._id })
      .populate('mockTest', 'title exam duration negativeMarking negativeMarkingValue instructions')
      .populate('examId', 'name shortName');

    if (!attempt) return next(createError('Attempt not found.', 404));

    res.json({ success: true, data: { attempt } });
  } catch (err) { next(err); }
});

// ─── GET single mock test (with questions for session) ────────────────────────
router.get('/:id', protect, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return next(createError('Invalid mock test ID.', 400));

    const mockTest = await MockTest.findById(req.params.id)
      .populate('exam', 'name shortName')
      .populate({
        path: 'questions',
        select: 'text type options difficulty marks negativeMarks timeLimit topic subject',
        populate: [
          { path: 'topic', select: 'name' },
          { path: 'subject', select: 'name' },
        ],
      });

    if (!mockTest) return next(createError('Mock test not found.', 404));
    if (!mockTest.isActive) return next(createError('This mock test is not currently available.', 403));

    // Sanitize: do NOT send correctAnswer during an active test
    const questions = (mockTest.questions || []).map(q => {
      const obj = q.toObject ? q.toObject() : q;
      delete obj.correctAnswer;
      return obj;
    });

    res.json({ success: true, data: { mockTest: { ...mockTest.toObject(), questions } } });
  } catch (err) { next(err); }
});

// ─── POST start a mock-test attempt ──────────────────────────────────────────
router.post('/:id/start', protect, async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidId(id)) return next(createError('Invalid mock test ID.', 400));

    const mockTest = await MockTest.findById(id)
      .populate('exam', 'name shortName')
      .populate({
        path: 'questions',
        select: 'text type options difficulty marks negativeMarks timeLimit topic subject explanation',
        populate: [
          { path: 'topic', select: 'name' },
          { path: 'subject', select: 'name' },
        ],
      });

    if (!mockTest) return next(createError('Mock test not found.', 404));
    if (!mockTest.isActive) return next(createError('This mock test is not currently available.', 403));
    if (!mockTest.questions || mockTest.questions.length === 0) {
      return next(createError('This mock test has no questions configured.', 400));
    }

    // Check for an in-progress attempt to resume (prevents double-start)
    const existingInProgress = await MockTestAttempt.findOne({
      user: req.user._id,
      mockTest: id,
      status: 'in_progress',
    });

    if (existingInProgress) {
      // Resume: return the existing attempt and the questions (without answers)
      const questions = (mockTest.questions || []).map(q => {
        const obj = q.toObject ? q.toObject() : q;
        delete obj.correctAnswer;
        return obj;
      });
      return res.json({
        success: true,
        message: 'Resuming existing attempt.',
        data: {
          attempt: { _id: existingInProgress._id, status: existingInProgress.status, startedAt: existingInProgress.startedAt },
          questions,
          mockTest: {
            _id: mockTest._id,
            title: mockTest.title,
            duration: mockTest.duration,
            totalMarks: mockTest.totalMarks,
            negativeMarking: mockTest.negativeMarking,
            negativeMarkingValue: mockTest.negativeMarkingValue,
            instructions: mockTest.instructions,
          },
        },
      });
    }

    // Create new attempt
    const attempt = await MockTestAttempt.create({
      user: req.user._id,
      mockTest: id,
      mockTestTitle: mockTest.title,
      examId: mockTest.exam?._id || null,
      examName: mockTest.exam?.name || '',
      questions: mockTest.questions.map(q => q._id),
      durationAllowed: mockTest.duration * 60, // store in seconds
      status: 'in_progress',
    });

    // Return questions WITHOUT correctAnswer
    const questions = (mockTest.questions || []).map(q => {
      const obj = q.toObject ? q.toObject() : q;
      delete obj.correctAnswer;
      return obj;
    });

    res.status(201).json({
      success: true,
      message: 'Mock test started.',
      data: {
        attempt: { _id: attempt._id, status: attempt.status, startedAt: attempt.startedAt },
        questions,
        mockTest: {
          _id: mockTest._id,
          title: mockTest.title,
          duration: mockTest.duration,
          totalMarks: mockTest.totalMarks,
          negativeMarking: mockTest.negativeMarking,
          negativeMarkingValue: mockTest.negativeMarkingValue,
          instructions: mockTest.instructions,
        },
      },
    });
  } catch (err) { next(err); }
});

// ─── POST submit a mock-test attempt ─────────────────────────────────────────
router.post('/attempts/:attemptId/submit', protect, async (req, res, next) => {
  try {
    const { attemptId } = req.params;
    if (!isValidId(attemptId)) return next(createError('Invalid attempt ID.', 400));

    const { answers = [], timeTaken = 0 } = req.body;

    // Find the attempt — must belong to this user
    const attempt = await MockTestAttempt.findOne({ _id: attemptId, user: req.user._id });
    if (!attempt) return next(createError('Attempt not found.', 404));

    // Idempotent: if already completed, return existing result
    if (attempt.status === 'completed') {
      return res.json({
        success: true,
        message: 'Attempt already submitted.',
        data: { result: attempt.result, attemptId: attempt._id },
      });
    }

    // Lock against race-condition duplicate submissions
    if (attempt.submissionLock) {
      return res.status(409).json({
        success: false,
        message: 'Submission already in progress. Please wait.',
      });
    }
    attempt.submissionLock = true;
    await attempt.save();

    // Load the mock test for marking configuration
    const mockTest = await MockTest.findById(attempt.mockTest)
      .populate('exam', 'name shortName');

    // Load questions from DB — NEVER trust client-supplied correct answers
    const questionDocs = await Question.find({ _id: { $in: attempt.questions } })
      .select('correctAnswer marks negativeMarks topic subject text options difficulty explanation')
      .populate('topic', 'name')
      .populate('subject', 'name');

    const questionMap = {};
    questionDocs.forEach(q => { questionMap[q._id.toString()] = q; });

    // Build answer lookup
    const answersMap = {};
    (answers || []).forEach(a => {
      answersMap[a.questionId] = {
        selectedAnswer: a.selectedAnswer || null,
        timeTaken: Number(a.timeTaken) || 0,
        markedForReview: Boolean(a.markedForReview),
      };
    });

    let correct = 0, wrong = 0, skipped = 0;
    let rawMarks = 0, negativeMarksTotal = 0;
    const questionAttempts = [];

    for (const qId of attempt.questions.map(String)) {
      const q = questionMap[qId];
      if (!q) continue;

      const { selectedAnswer = null, timeTaken: qTime = 0, markedForReview = false } = answersMap[qId] || {};
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
        // Use mock-test level negative marking if set, else question-level
        const neg = mockTest?.negativeMarking
          ? (mockTest.negativeMarkingValue ?? q.negativeMarks ?? 0)
          : (q.negativeMarks ?? 0);
        negativeMarksTotal += neg;
        awarded = -neg;
        rawMarks -= neg;
      }

      // Fire-and-forget question usage stats
      Question.findByIdAndUpdate(qId, {
        $inc: {
          timesUsed: 1,
          timesCorrect: isCorrect ? 1 : 0,
          timesWrong: !isCorrect && !isSkipped ? 1 : 0,
        },
      }).catch(() => {});

      questionAttempts.push({
        question: qId,
        questionText: q.text || '',
        options: q.options || [],
        topicId: q.topic?._id || null,
        topicName: q.topic?.name || '',
        subjectId: q.subject?._id || null,
        subjectName: q.subject?.name || '',
        difficulty: q.difficulty || '',
        explanation: q.explanation || '',
        selectedAnswer,
        correctAnswer: q.correctAnswer,
        isCorrect,
        isSkipped,
        marksAwarded: awarded,
        marksForQuestion: q.marks ?? 1,
        timeTaken: qTime,
        markedForReview,
      });
    }

    const totalQuestions = attempt.questions.length;
    const totalMarks = questionDocs.reduce((s, q) => s + (q.marks ?? 1), 0);
    const attempted = correct + wrong;
    const accuracy = calcAccuracy(correct, wrong);
    const marksObtained = Math.max(0, rawMarks);
    const percentage = totalMarks > 0 ? Math.round((marksObtained / totalMarks) * 100) : 0;

    attempt.attempts = questionAttempts;
    attempt.status = 'completed';
    attempt.submittedAt = new Date();
    attempt.timeTaken = Number(timeTaken) || 0;
    attempt.mockTestTitle = mockTest?.title || attempt.mockTestTitle;
    attempt.examId = mockTest?.exam?._id || attempt.examId;
    attempt.examName = mockTest?.exam?.name || attempt.examName;
    attempt.submissionLock = false;
    attempt.result = {
      totalQuestions,
      attempted,
      correct,
      wrong,
      skipped,
      marksObtained,
      rawMarks,
      negativeMarks: negativeMarksTotal,
      totalMarks,
      accuracy,
      percentage,
    };

    await attempt.save();

    // Update UserProgress asynchronously (fire-and-forget)
    updateProgressFromAttempt(attempt).catch(console.error);

    res.json({
      success: true,
      message: 'Mock test submitted successfully.',
      data: { result: attempt.result, attemptId: attempt._id },
    });
  } catch (err) {
    // Release the lock on error so the user can retry
    try {
      if (req.params.attemptId && isValidId(req.params.attemptId)) {
        await MockTestAttempt.findByIdAndUpdate(req.params.attemptId, { submissionLock: false });
      }
    } catch (_) {}
    next(err);
  }
});

// ─── POST create mock test (admin) ───────────────────────────────────────────
router.post('/', protect, adminOnly, async (req, res, next) => {
  try {
    const mockTest = await MockTest.create({ ...req.body, createdBy: req.user._id });
    res.status(201).json({ success: true, message: 'Mock test created.', data: { mockTest } });
  } catch (err) { next(err); }
});

// ─── PUT update mock test (admin) ────────────────────────────────────────────
router.put('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return next(createError('Invalid ID.', 400));
    const mockTest = await MockTest.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!mockTest) return next(createError('Mock test not found.', 404));
    res.json({ success: true, message: 'Mock test updated.', data: { mockTest } });
  } catch (err) { next(err); }
});

// ─── DELETE mock test (admin) ─────────────────────────────────────────────────
router.delete('/:id', protect, adminOnly, async (req, res, next) => {
  try {
    if (!isValidId(req.params.id)) return next(createError('Invalid ID.', 400));
    const mockTest = await MockTest.findByIdAndDelete(req.params.id);
    if (!mockTest) return next(createError('Mock test not found.', 404));
    res.json({ success: true, message: 'Mock test deleted.' });
  } catch (err) { next(err); }
});

module.exports = router;
