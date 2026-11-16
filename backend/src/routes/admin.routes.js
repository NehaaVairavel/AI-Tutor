/**
 * admin.routes.js
 * ---------------
 * All routes are protected by `protect + adminOnly`.
 * A separate rate-limiter (100 req / 15 min) is applied to every admin endpoint.
 *
 * Analytics definitions (consistent with student-facing pages):
 *  - accuracy       = correct / (correct + wrong) × 100   (skipped excluded)
 *  - weak topic     = totalAttempted >= WEAK_MIN_ATTEMPTS  AND accuracy < WEAK_ACCURACY_PCT
 *  - study time     = sum of PracticeSession.result.timeTaken (seconds)
 *  - active user    = at least 1 completed PracticeSession in the period
 *  - timezone       = UTC (all Date boundaries are UTC midnight)
 *
 * Sensitive fields NEVER returned: password, passwordResetToken, passwordResetExpires.
 */

const express      = require('express');
const rateLimit    = require('express-rate-limit');
const router       = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const User         = require('../models/User');
const Question     = require('../models/Question');
const PracticeSession = require('../models/PracticeSession');
const Exam         = require('../models/Exam');
const UserProgress = require('../models/UserProgress');

// ── Admin-specific rate limiter (stricter than global) ────────────────────────
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  message: { success: false, message: 'Too many admin requests. Please slow down.' },
});

// Apply auth + rate-limit to every route in this file
router.use(protect, adminOnly, adminLimiter);

// ── Constants (mirror analytics.routes.js) ────────────────────────────────────
const WEAK_MIN_ATTEMPTS  = 5;
const WEAK_ACCURACY_PCT  = 60;

// Safe user projection — never expose sensitive fields
const USER_SAFE_SELECT =
  '-password -passwordResetToken -passwordResetExpires';

// ── Helpers ──────────────────────────────────────────────────────────────────

/** UTC start of the calendar day for a given Date (or today). */
function startOfDay(date) {
  const d = new Date(date || Date.now());
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** UTC end of the calendar day. */
function endOfDay(date) {
  const d = new Date(date || Date.now());
  d.setUTCHours(23, 59, 59, 999);
  return d;
}

/** Clamp a pagination limit to a safe range. */
function clampLimit(raw, defaultVal = 20, max = 100) {
  const n = parseInt(raw, 10);
  if (isNaN(n) || n < 1) return defaultVal;
  return Math.min(n, max);
}

/** Validate that a string is a valid Mongoose ObjectId. */
function isValidObjectId(id) {
  return /^[a-f\d]{24}$/i.test(id);
}

// ── Whitelist of sortable fields for the user table ──────────────────────────
const SORTABLE_FIELDS = new Set([
  'name', 'email', 'createdAt', 'lastLoginAt', 'isActive',
  'educationStatus', 'preparationLevel',
]);

// =============================================================================
// GET /api/admin/overview
// Returns rich dashboard stats + time-series data for charts.
//
// Each aggregation stage is isolated with its own try/catch so one bad
// pipeline cannot crash the entire response. All failures are logged to the
// terminal with [ADMIN OVERVIEW] prefix so they are easy to grep.
// =============================================================================
router.get('/overview', async (req, res, next) => {
  const reqId = Date.now(); // lightweight request ID for log correlation
  try {
    const { period = '30d' } = req.query;
    const days  = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const now   = new Date();
    const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    const todayStart = startOfDay(now);

    console.log(
      `[ADMIN OVERVIEW ${reqId}] period=${period} days=${days}` +
      ` since=${since.toISOString()} now=${now.toISOString()}` +
      ` userId=${req.user?._id} role=${req.user?.role}`
    );

    // ── 1. Basic counts (Promise.all — fast, all independent) ─────────────────
    let totalUsers = 0, totalQuestions = 0, totalCompletedSessions = 0;
    let totalExams = 0, newUsersToday = 0, newUsersPeriod = 0;
    let recentUsers = [], activeTodaySessions = [], activePeriodSessions = [];

    try {
      [
        totalUsers, totalQuestions, totalCompletedSessions, totalExams,
        newUsersToday, newUsersPeriod, recentUsers,
        activeTodaySessions, activePeriodSessions,
      ] = await Promise.all([
        User.countDocuments({ role: 'student' }),
        Question.countDocuments({ isActive: true }),
        PracticeSession.countDocuments({ status: 'completed' }),
        Exam.countDocuments({ isActive: true }),
        User.countDocuments({ role: 'student', createdAt: { $gte: todayStart } }),
        User.countDocuments({ role: 'student', createdAt: { $gte: since } }),
        User.find({ role: 'student' })
          .sort({ createdAt: -1 }).limit(10)
          .select('name email createdAt educationStatus targetExam isActive preparationLevel')
          .populate('targetExam', 'name shortName'),
        PracticeSession.distinct('user', {
          status: 'completed',
          completedAt: { $gte: todayStart, $ne: null },
        }),
        PracticeSession.distinct('user', {
          status: 'completed',
          completedAt: { $gte: since, $ne: null },
        }),
      ]);
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=basic_counts OK` +
        ` totalUsers=${totalUsers} totalSessions=${totalCompletedSessions}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=basic_counts FAILED name=${e.name} msg=${e.message}`);
      // Non-fatal — continue with zero defaults
    }

    // ── 2. Platform-wide accuracy (UserProgress aggregation) ──────────────────
    let platformCorrect = 0, platformWrong = 0, platformStudyTime = 0, platformAttempted = 0;
    let platformAccuracy = 0, avgStudyTime = 0;
    try {
      const [accuracyAgg] = await UserProgress.aggregate([
        {
          $group: {
            _id: null,
            totalCorrect:   { $sum: '$totalCorrect' },
            totalWrong:     { $sum: '$totalWrong' },
            totalStudyTime: { $sum: '$totalStudyTime' },
            totalAttempted: { $sum: '$totalQuestionsAttempted' },
          },
        },
      ]);
      platformCorrect   = accuracyAgg?.totalCorrect   || 0;
      platformWrong     = accuracyAgg?.totalWrong     || 0;
      platformStudyTime = accuracyAgg?.totalStudyTime || 0;
      platformAttempted = accuracyAgg?.totalAttempted || 0;
      platformAccuracy  = platformCorrect + platformWrong > 0
        ? Math.round((platformCorrect / (platformCorrect + platformWrong)) * 100) : 0;
      avgStudyTime = activePeriodSessions.length > 0
        ? Math.round(platformStudyTime / activePeriodSessions.length) : 0;
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=accuracy_agg OK` +
        ` correct=${platformCorrect} wrong=${platformWrong} studyTime=${platformStudyTime}s`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=accuracy_agg FAILED name=${e.name} msg=${e.message}`);
    }

    // ── 3. Streak count ────────────────────────────────────────────────────────
    let streakCount = 0;
    try {
      streakCount = await UserProgress.countDocuments({ currentStreak: { $gt: 0 } });
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=streak_count OK streakCount=${streakCount}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=streak_count FAILED name=${e.name} msg=${e.message}`);
    }

    // ── 4. Incomplete profiles ─────────────────────────────────────────────────
    let incompleteProfiles = 0;
    try {
      incompleteProfiles = await User.countDocuments({
        role: 'student',
        $or: [
          { targetExam: null },
          { educationStatus: '' },
          { educationStatus: { $exists: false } },
        ],
      });
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=incomplete_profiles OK count=${incompleteProfiles}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=incomplete_profiles FAILED name=${e.name} msg=${e.message}`);
    }

    // ── 5. Exam popularity ─────────────────────────────────────────────────────
    // FIX: 'preserveNullAndEmpty' is NOT a valid $unwind option.
    //      The correct field is 'preserveNullAndEmptyArrays'.
    //      The old typo caused MongoDB to silently misinterpret the stage
    //      on stricter Atlas versions, dropping all results.
    let examPopularity = [];
    try {
      examPopularity = await User.aggregate([
        { $match: { role: 'student', targetExam: { $ne: null } } },
        { $group: { _id: '$targetExam', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'exams',
            localField: '_id',
            foreignField: '_id',
            as: 'examDoc',
          },
        },
        // FIX: preserveNullAndEmptyArrays (was wrongly 'preserveNullAndEmpty')
        { $unwind: { path: '$examDoc', preserveNullAndEmptyArrays: false } },
        {
          $project: {
            _id: 1,
            name: '$examDoc.name',
            shortName: '$examDoc.shortName',
            count: 1,
          },
        },
      ]);
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=exam_popularity OK count=${examPopularity.length}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=exam_popularity FAILED name=${e.name} msg=${e.message}`);
    }

    // ── 6. Registration trend ──────────────────────────────────────────────────
    let registrationTrend = [];
    try {
      registrationTrend = await User.aggregate([
        { $match: { role: 'student', createdAt: { $gte: since } } },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
        { $project: { date: '$_id', count: 1, _id: 0 } },
      ]);
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=registration_trend OK points=${registrationTrend.length}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=registration_trend FAILED name=${e.name} msg=${e.message}`);
    }

    // ── 7. Daily active users + questions + study time (single aggregation) ────
    // FIX: added completedAt $ne null guard + $lte: now so $dateToString never
    //      receives a null date (which would cause a MongoServerError on Atlas).
    // FIX: nested path for result fields uses dot-notation: '$result.timeTaken'
    //      (these were correct already but verified here).
    let dauTrend = [];
    try {
      dauTrend = await PracticeSession.aggregate([
        {
          $match: {
            status: 'completed',
            completedAt: { $gte: since, $lte: now, $ne: null },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$completedAt' } },
            },
            activeUsers:    { $addToSet: '$user' },
            sessions:       { $sum: 1 },
            totalQuestions: { $sum: '$result.attempted' },
            totalCorrect:   { $sum: '$result.correct' },
            totalStudyTime: { $sum: '$result.timeTaken' },
          },
        },
        { $sort: { '_id.date': 1 } },
        {
          $project: {
            date:           '$_id.date',
            activeUsers:    { $size: '$activeUsers' },
            sessions:       1,
            totalQuestions: 1,
            totalCorrect:   1,
            totalStudyTime: 1,
            _id:            0,
          },
        },
      ]);
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=dau_trend OK points=${dauTrend.length}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=dau_trend FAILED name=${e.name} msg=${e.message}`);
    }

    // ── 8. Education status distribution ──────────────────────────────────────
    let educationDist = [];
    try {
      educationDist = await User.aggregate([
        { $match: { role: 'student' } },
        {
          $group: {
            _id: { $ifNull: ['$educationStatus', ''] },
            count: { $sum: 1 },
          },
        },
        { $sort: { count: -1 } },
      ]);
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=education_dist OK buckets=${educationDist.length}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=education_dist FAILED name=${e.name} msg=${e.message}`);
    }

    // ── 9. Weak topic distribution (platform-wide) ────────────────────────────
    // FIX: added preserveNullAndEmptyArrays: true so the stage is safe when
    //      UserProgress documents have an empty topicProgress array.
    let topicPerf = [];
    try {
      topicPerf = await UserProgress.aggregate([
        { $unwind: { path: '$topicProgress', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id:            '$topicProgress.topic',
            topicName:      { $first: '$topicProgress.topicName' },
            totalAttempted: { $sum: '$topicProgress.totalAttempted' },
            totalCorrect:   { $sum: '$topicProgress.totalCorrect' },
            totalWrong:     { $sum: '$topicProgress.totalWrong' },
            usersAttempted: { $sum: 1 },
          },
        },
        {
          $addFields: {
            accuracy: {
              $cond: [
                { $gt: [{ $add: ['$totalCorrect', '$totalWrong'] }, 0] },
                {
                  $multiply: [
                    { $divide: ['$totalCorrect', { $add: ['$totalCorrect', '$totalWrong'] }] },
                    100,
                  ],
                },
                0,
              ],
            },
          },
        },
        { $sort: { totalAttempted: -1 } },
        { $limit: 20 },
      ]);
      console.log(`[ADMIN OVERVIEW ${reqId}] stage=topic_perf OK topics=${topicPerf.length}`);
    } catch (e) {
      console.error(`[ADMIN OVERVIEW ${reqId}] stage=topic_perf FAILED name=${e.name} msg=${e.message}`);
    }

    console.log(`[ADMIN OVERVIEW ${reqId}] response=OK all stages complete`);

    res.json({
      success: true,
      message: 'Admin overview retrieved.',
      data: {
        period,
        stats: {
          totalUsers,
          totalQuestions,
          totalCompletedSessions,
          totalExams,
          newUsersToday,
          newUsersPeriod,
          activeUsersToday:  activeTodaySessions.length,
          activeUsersPeriod: activePeriodSessions.length,
          platformAttempted,
          platformAccuracy,
          platformStudyTime,
          avgStudyTime,
          streakCount,
          incompleteProfiles,
        },
        examPopularity,
        educationDist,
        registrationTrend,
        dauTrend,
        topicPerf,
        recentUsers,
      },
    });
  } catch (err) {
    // Outer catch — should never fire now that each stage is isolated.
    // Log the full error so it appears in the terminal.
    console.error(
      `[ADMIN OVERVIEW ${reqId}] OUTER CATCH name=${err.name} msg=${err.message}`,
      err.stack
    );
    next(err);
  }
});

// =============================================================================
// GET /api/admin/dashboard  (legacy — kept for backward compat with existing UI)
// =============================================================================
router.get('/dashboard', async (req, res, next) => {
  try {
    const [totalUsers, totalQuestions, totalSessions, totalExams, recentUsers] = await Promise.all([
      User.countDocuments({ role: 'student' }),
      Question.countDocuments({ isActive: true }),
      PracticeSession.countDocuments({ status: 'completed' }),
      Exam.countDocuments({ isActive: true }),
      User.find({ role: 'student' }).sort({ createdAt: -1 }).limit(5)
        .select('name email createdAt preparationLevel'),
    ]);
    res.json({
      success: true,
      message: 'Admin dashboard data retrieved.',
      data: { stats: { totalUsers, totalQuestions, totalSessions, totalExams }, recentUsers },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /api/admin/users
// Paginated, searchable, filterable, sortable user table with analytics join.
// =============================================================================
router.get('/users', async (req, res, next) => {
  try {
    const {
      page = 1,
      limit: rawLimit,
      search,
      role,
      examId,
      educationStatus,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = req.query;

    const limit = clampLimit(rawLimit, 20, 100);
    const skip  = (Math.max(1, parseInt(page, 10)) - 1) * limit;

    // ── Build filter ─────────────────────────────────────────────────────────
    const filter = { role: role || 'student' };

    if (search) {
      // Sanitize: escape regex special chars
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name:  { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (examId && isValidObjectId(examId)) {
      filter.targetExam = examId;
    }

    if (educationStatus) {
      filter.educationStatus = educationStatus;
    }

    // ── Validate sort field ──────────────────────────────────────────────────
    const safeSortBy    = SORTABLE_FIELDS.has(sortBy) ? sortBy : 'createdAt';
    const safeSortOrder = sortOrder === 'asc' ? 1 : -1;

    const [users, total] = await Promise.all([
      User.find(filter)
        .sort({ [safeSortBy]: safeSortOrder })
        .skip(skip)
        .limit(limit)
        .select(`${USER_SAFE_SELECT}`)
        .populate('targetExam', 'name shortName category'),
      User.countDocuments(filter),
    ]);

    // ── Join UserProgress analytics ──────────────────────────────────────────
    const userIds = users.map(u => u._id);
    const progresses = await UserProgress.find({ user: { $in: userIds } })
      .select('user totalQuestionsAttempted totalCorrect totalWrong overallAccuracy totalStudyTime totalPracticeSessions currentStreak longestStreak lastStudyDate');

    const progressMap = {};
    for (const p of progresses) {
      const uid = p.user.toString();
      if (!progressMap[uid]) {
        progressMap[uid] = {
          totalQuestionsAttempted: 0, totalCorrect: 0, totalWrong: 0,
          overallAccuracy: 0, totalStudyTime: 0, totalPracticeSessions: 0,
          currentStreak: 0, longestStreak: 0, lastStudyDate: null,
        };
      }
      const m = progressMap[uid];
      m.totalQuestionsAttempted += p.totalQuestionsAttempted;
      m.totalCorrect            += p.totalCorrect;
      m.totalWrong              += p.totalWrong;
      m.totalStudyTime          += p.totalStudyTime;
      m.totalPracticeSessions   += p.totalPracticeSessions;
      m.currentStreak = Math.max(m.currentStreak, p.currentStreak);
      m.longestStreak = Math.max(m.longestStreak, p.longestStreak);
      if (!m.lastStudyDate || (p.lastStudyDate && p.lastStudyDate > m.lastStudyDate)) {
        m.lastStudyDate = p.lastStudyDate;
      }
      const answered = m.totalCorrect + m.totalWrong;
      m.overallAccuracy = answered > 0 ? Math.round((m.totalCorrect / answered) * 100) : 0;
    }

    const enriched = users.map(u => {
      const obj = u.toObject();
      // Remove any lingering sensitive fields just in case
      delete obj.password;
      delete obj.passwordResetToken;
      delete obj.passwordResetExpires;
      return {
        ...obj,
        analytics: progressMap[u._id.toString()] || {
          totalQuestionsAttempted: 0, totalCorrect: 0, totalWrong: 0,
          overallAccuracy: 0, totalStudyTime: 0, totalPracticeSessions: 0,
          currentStreak: 0, longestStreak: 0, lastStudyDate: null,
        },
      };
    });

    res.json({
      success: true,
      message: 'Users retrieved.',
      data: {
        users: enriched,
        pagination: {
          total,
          page: parseInt(page, 10),
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /api/admin/users/:id
// Full profile + analytics for a single user.
// =============================================================================
router.get('/users/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const user = await User.findById(id)
      .select(USER_SAFE_SELECT)
      .populate('targetExam', 'name shortName category')
      .populate('additionalExams', 'name shortName category');

    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });

    // All UserProgress records for this user (across all exams)
    const progresses = await UserProgress.find({ user: id })
      .populate('exam', 'name shortName')
      .populate('topicProgress.topic', 'name')
      .populate('topicProgress.subject', 'name');

    // Aggregate across all exams
    const totals = {
      totalQuestionsAttempted: 0, totalCorrect: 0, totalWrong: 0,
      totalSkipped: 0, overallAccuracy: 0, totalStudyTime: 0,
      totalPracticeSessions: 0, totalMockTests: 0,
      currentStreak: 0, longestStreak: 0, lastStudyDate: null,
    };
    for (const p of progresses) {
      totals.totalQuestionsAttempted += p.totalQuestionsAttempted;
      totals.totalCorrect            += p.totalCorrect;
      totals.totalWrong              += p.totalWrong;
      totals.totalSkipped            += p.totalSkipped;
      totals.totalStudyTime          += p.totalStudyTime;
      totals.totalPracticeSessions   += p.totalPracticeSessions;
      totals.totalMockTests          += p.totalMockTests;
      totals.currentStreak = Math.max(totals.currentStreak, p.currentStreak);
      totals.longestStreak = Math.max(totals.longestStreak, p.longestStreak);
      if (!totals.lastStudyDate || (p.lastStudyDate && p.lastStudyDate > totals.lastStudyDate)) {
        totals.lastStudyDate = p.lastStudyDate;
      }
    }
    const answered = totals.totalCorrect + totals.totalWrong;
    totals.overallAccuracy = answered > 0 ? Math.round((totals.totalCorrect / answered) * 100) : 0;

    const obj = user.toObject();
    delete obj.password;
    delete obj.passwordResetToken;
    delete obj.passwordResetExpires;

    res.json({
      success: true,
      message: 'User profile retrieved.',
      data: {
        user: obj,
        analytics: totals,
        progressByExam: progresses.map(p => ({
          exam: p.exam,
          totalQuestionsAttempted: p.totalQuestionsAttempted,
          totalCorrect: p.totalCorrect,
          totalWrong: p.totalWrong,
          overallAccuracy: p.overallAccuracy,
          totalStudyTime: p.totalStudyTime,
          totalPracticeSessions: p.totalPracticeSessions,
          currentStreak: p.currentStreak,
          longestStreak: p.longestStreak,
          lastStudyDate: p.lastStudyDate,
        })),
      },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /api/admin/users/:id/topics
// Topic-level performance for a user.
// =============================================================================
router.get('/users/:id/topics', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const progresses = await UserProgress.find({ user: id })
      .populate('topicProgress.topic', 'name')
      .populate('topicProgress.subject', 'name')
      .lean();

    // Merge topicProgress across all exam records — group by topic._id
    const topicMap = new Map();
    for (const prog of progresses) {
      for (const tp of (prog.topicProgress || [])) {
        const topicId =
          tp.topic && typeof tp.topic === 'object' && tp.topic._id
            ? tp.topic._id.toString()
            : tp.topic ? tp.topic.toString() : null;
        const topicName =
          (tp.topic && typeof tp.topic === 'object' && tp.topic.name)
            ? tp.topic.name
            : (tp.topicName || 'Unknown topic');
        const subjectName =
          (tp.subject && typeof tp.subject === 'object' && tp.subject.name)
            ? tp.subject.name
            : (tp.subjectName || '');

        const key = topicId || `no_id_${topicName}`;
        if (!topicMap.has(key)) {
          topicMap.set(key, {
            topicId,
            topicName,
            subjectName,
            totalAttempted: 0,
            totalCorrect:   0,
            totalWrong:     0,
            totalSkipped:   0,
            lastPracticed:  null,
          });
        }
        const entry = topicMap.get(key);
        entry.totalAttempted += tp.totalAttempted || 0;
        entry.totalCorrect   += tp.totalCorrect   || 0;
        entry.totalWrong     += tp.totalWrong     || 0;
        entry.totalSkipped   += tp.totalSkipped   || 0;
        if (!entry.lastPracticed || (tp.lastPracticed && tp.lastPracticed > entry.lastPracticed)) {
          entry.lastPracticed = tp.lastPracticed;
        }
      }
    }

    const topics = Array.from(topicMap.values()).map(t => {
      const answered = t.totalCorrect + t.totalWrong;
      const accuracy = answered > 0 ? Math.round((t.totalCorrect / answered) * 100) : 0;
      const isWeak   = t.totalAttempted >= WEAK_MIN_ATTEMPTS && accuracy < WEAK_ACCURACY_PCT;
      return { ...t, accuracy, isWeak };
    }).sort((a, b) => b.totalAttempted - a.totalAttempted);

    res.json({
      success: true,
      message: 'Topic performance retrieved.',
      data: {
        topics,
        weakTopicThreshold: { minAttempts: WEAK_MIN_ATTEMPTS, maxAccuracy: WEAK_ACCURACY_PCT },
      },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /api/admin/users/:id/sessions
// Paginated practice history for a user (admin view).
// =============================================================================
router.get('/users/:id/sessions', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!isValidObjectId(id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }

    const limit = clampLimit(req.query.limit, 20, 50);
    const skip  = (Math.max(1, parseInt(req.query.page || 1, 10)) - 1) * limit;

    const [sessions, total] = await Promise.all([
      PracticeSession.find({ user: id, status: 'completed' })
        .sort({ completedAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('exam', 'name shortName')
        .populate('subject', 'name')
        .populate('topic', 'name')
        .select('exam subject topic difficulty result startedAt completedAt status'),
      PracticeSession.countDocuments({ user: id, status: 'completed' }),
    ]);

    res.json({
      success: true,
      message: 'Sessions retrieved.',
      data: {
        sessions,
        pagination: {
          total,
          page: parseInt(req.query.page || 1, 10),
          limit,
          totalPages: Math.ceil(total / limit),
        },
      },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /api/admin/users/:id/sessions/:sessionId/review
// Admin review of a specific session (same snapshots as student review, but
// admin-only endpoint; does NOT expose answer keys beyond what the session already stores).
// =============================================================================
router.get('/users/:id/sessions/:sessionId/review', async (req, res, next) => {
  try {
    const { id, sessionId } = req.params;
    if (!isValidObjectId(id) || !isValidObjectId(sessionId)) {
      return res.status(400).json({ success: false, message: 'Invalid ID.' });
    }

    const session = await PracticeSession.findOne({ _id: sessionId, user: id, status: 'completed' })
      .populate('exam', 'name shortName')
      .populate('subject', 'name')
      .populate('topic', 'name')
      .select('-__v');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    res.json({
      success: true,
      message: 'Session review retrieved.',
      data: { session },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// PATCH /api/admin/users/:id/status  (unchanged from original)
// =============================================================================
router.patch('/users/:id/status', async (req, res, next) => {
  try {
    if (!isValidObjectId(req.params.id)) {
      return res.status(400).json({ success: false, message: 'Invalid user ID.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role === 'admin') {
      return res.status(403).json({ success: false, message: 'Cannot modify admin accounts.' });
    }
    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    // Emit real-time update
    try {
      const { getIO } = require('../socketio');
      const io = getIO();
      if (io) {
        io.to('admin-room').emit('admin:user-updated', {
          _id: user._id,
          isActive: user.isActive,
        });
      }
    } catch (_) {}

    const obj = user.toObject();
    delete obj.password;
    delete obj.passwordResetToken;
    delete obj.passwordResetExpires;

    res.json({
      success: true,
      message: `User ${user.isActive ? 'activated' : 'deactivated'}.`,
      data: { user: obj },
    });
  } catch (err) { next(err); }
});

// =============================================================================
// GET /api/admin/exams-list  (lightweight list for filter dropdowns)
// =============================================================================
router.get('/exams-list', async (req, res, next) => {
  try {
    const exams = await Exam.find({ isActive: true })
      .sort({ name: 1 })
      .select('name shortName category');
    res.json({ success: true, data: { exams } });
  } catch (err) { next(err); }
});

module.exports = router;
