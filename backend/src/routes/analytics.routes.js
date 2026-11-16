const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const UserProgress = require('../models/UserProgress');
const PracticeSession = require('../models/PracticeSession');

// ─── Constants (centralized, adjust here to recalibrate) ─────────────────────
const WEAK_MIN_ATTEMPTS = 5;    // minimum questions attempted to classify a topic
const WEAK_ACCURACY_PCT = 60;   // accuracy below this → weak

/**
 * Resolve a human-readable name for a topic entry in UserProgress.
 * Priority: live populated name → topicName snapshot → fallback string.
 */
function resolveTopicNameFromEntry(tp) {
  if (tp.topic && typeof tp.topic === 'object' && tp.topic.name) return tp.topic.name;
  if (tp.topicName) return tp.topicName;
  return 'Unknown topic';
}

router.get('/dashboard', protect, async (req, res, next) => {
  try {
    const userId = req.user._id;
    const examId = req.user.targetExam;

    // ── Load all UserProgress records for this user across all exams ──────────
    // This ensures the dashboard totals are consistent with what the admin sees.
    // The primary exam's record is used for streaks and weak-topic analysis
    // (since those are per-exam). Overall stats are aggregated across all exams.
    const [allProgress, recentSessions] = await Promise.all([
      UserProgress.find({ user: userId })
        .populate('topicProgress.topic', 'name')
        .populate('topicProgress.subject', 'name'),
      PracticeSession.find({ user: userId, status: 'completed' })
        .sort({ completedAt: -1 })
        .limit(5)
        .populate('subject', 'name')
        .populate('topic', 'name')
        .populate('exam', 'shortName')
        .select('result subject topic exam completedAt difficulty'),
    ]);

    // Primary progress record (for target exam) — used for streaks & weak topics
    const primaryProgress = examId
      ? (allProgress.find(p => p.exam && p.exam.toString() === examId.toString()) || allProgress[0] || null)
      : (allProgress[0] || null);

    // Aggregate totals across ALL exam records (matches admin user-table logic)
    const totals = {
      totalQuestionsAttempted: 0,
      totalCorrect: 0,
      totalWrong: 0,
      totalSkipped: 0,
      totalStudyTime: 0,
      totalPracticeSessions: 0,
      currentStreak: 0,
      longestStreak: 0,
      lastStudyDate: null,
    };
    for (const p of allProgress) {
      totals.totalQuestionsAttempted += p.totalQuestionsAttempted || 0;
      totals.totalCorrect            += p.totalCorrect            || 0;
      totals.totalWrong              += p.totalWrong              || 0;
      totals.totalSkipped            += p.totalSkipped            || 0;
      totals.totalStudyTime          += p.totalStudyTime          || 0;
      totals.totalPracticeSessions   += p.totalPracticeSessions   || 0;
      totals.currentStreak  = Math.max(totals.currentStreak, p.currentStreak || 0);
      totals.longestStreak  = Math.max(totals.longestStreak, p.longestStreak || 0);
      if (!totals.lastStudyDate || (p.lastStudyDate && p.lastStudyDate > totals.lastStudyDate)) {
        totals.lastStudyDate = p.lastStudyDate;
      }
    }
    const answered = totals.totalCorrect + totals.totalWrong;
    const overallAccuracy = answered > 0 ? Math.round((totals.totalCorrect / answered) * 100) : 0;

    // ── Build weak topics from primaryProgress topicProgress ─────────────────
    // Use the primary exam's progress for weak-topic analysis (per-exam).
    // Snapshot topicName survives topic deletion/rename.
    const allTopicProgress = (primaryProgress?.topicProgress || []);
    const weakTopics = allTopicProgress
      .filter(tp => {
        const attempted = (tp.totalCorrect || 0) + (tp.totalWrong || 0);
        const accuracy  = attempted > 0
          ? Math.round((tp.totalCorrect / attempted) * 100)
          : 0;
        return (
          (tp.totalCorrect + tp.totalWrong + tp.totalSkipped) >= WEAK_MIN_ATTEMPTS &&
          accuracy < WEAK_ACCURACY_PCT
        );
      })
      .map(tp => {
        const topicId = tp.topic && typeof tp.topic === 'object'
          ? tp.topic._id
          : tp.topic;
        return {
          _id: topicId,
          name: resolveTopicNameFromEntry(tp),
          accuracy: tp.accuracy,
          totalAttempted: tp.totalAttempted,
        };
      })
      .sort((a, b) => a.accuracy - b.accuracy)
      .slice(0, 5);

    const analytics = {
      // Use cross-exam aggregated totals — matches what admin sees
      totalQuestions:        totals.totalQuestionsAttempted,
      overallAccuracy,
      currentStreak:         totals.currentStreak,
      longestStreak:         totals.longestStreak,
      totalStudyTime:        totals.totalStudyTime,
      totalPracticeSessions: totals.totalPracticeSessions,
      weakTopics,
      recentSessions,
    };

    res.json({ success: true, message: 'Analytics retrieved.', data: { analytics } });
  } catch (err) { next(err); }
});

module.exports = router;
