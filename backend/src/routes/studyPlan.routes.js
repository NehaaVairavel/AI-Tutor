const express = require('express');
const router = express.Router();
const { protect, adminOnly } = require('../middleware/auth');
const StudyPlan = require('../models/StudyPlan');
const Topic = require('../models/Topic');
const Subject = require('../models/Subject');

// ─── GET current active plan ────────────────────────────────────────────────
router.get('/current', protect, async (req, res, next) => {
  try {
    const plan = await StudyPlan.findOne({ user: req.user._id, isActive: true })
      .sort({ createdAt: -1 })
      .populate('exam', 'name shortName');

    if (!plan) return res.json({ success: true, data: { plan: null } });

    // Shape sessions into dailyPlans format for frontend.
    // _id format: "dayNumber-topicIndex" — stable, unique per topic entry.
    const dailyPlans = plan.sessions.map((s) => ({
      date: s.date,
      dayNumber: s.dayNumber,
      sessions: (s.topics || []).map((t, topicIdx) => ({
        _id: `${s.dayNumber}-${topicIdx}`,
        type: t.type === 'learn' ? 'study' : t.type === 'revise' ? 'revision' : t.type === 'mock' ? 'mock_test' : 'practice',
        topic: t.topic ? { _id: t.topic, name: t.topicName } : null,
        subject: t.subject ? { _id: t.subject, name: t.subjectName } : null,
        duration: t.estimatedMinutes,
        isCompleted: t.status === 'completed',
      })),
    }));

    res.json({ success: true, data: { plan: { ...plan.toObject(), dailyPlans } } });
  } catch (err) { next(err); }
});

// ─── POST generate plan ──────────────────────────────────────────────────────
router.post('/generate', protect, async (req, res, next) => {
  try {
    const { examId, examDate, targetScore, dailyHours = 2 } = req.body;

    if (!examId) return res.status(400).json({ success: false, message: 'examId is required.' });

    const targetDate = examDate ? new Date(examDate) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    const today = new Date();
    const totalDays = Math.max(7, Math.ceil((targetDate - today) / (1000 * 60 * 60 * 24)));

    // Fetch topics for this exam
    const topics = await Topic.find({ exam: examId, isActive: true }).populate('subject', 'name').lean();
    const subjects = await Subject.find({ exam: examId, isActive: true }).lean();

    // Deactivate old plan
    await StudyPlan.updateMany({ user: req.user._id, exam: examId }, { isActive: false });

    // Generate simple day-by-day sessions
    const sessions = [];
    const minutesPerDay = dailyHours * 60;
    let topicIdx = 0;

    for (let day = 0; day < Math.min(totalDays, 60); day++) {
      const date = new Date(today);
      date.setDate(today.getDate() + day);
      const dayTopics = [];
      let remainingMinutes = minutesPerDay;

      // Rotate through topics
      if (topics.length > 0) {
        const topic = topics[topicIdx % topics.length];
        const minutes = Math.min(remainingMinutes, 45);
        dayTopics.push({
          topic: topic._id,
          subject: topic.subject?._id,
          topicName: topic.name,
          subjectName: topic.subject?.name,
          estimatedMinutes: minutes,
          type: 'learn',
          status: 'pending',
        });
        remainingMinutes -= minutes;
        topicIdx++;
      }

      // Add practice block
      if (remainingMinutes >= 30) {
        dayTopics.push({
          topicName: 'Mixed Practice',
          subjectName: 'All Subjects',
          estimatedMinutes: 30,
          type: 'practice',
          status: 'pending',
        });
        remainingMinutes -= 30;
      }

      // Every 7 days: add revision
      if (day > 0 && day % 7 === 0 && topics.length > 0) {
        const revTopic = topics[(topicIdx - 5 + topics.length) % topics.length];
        dayTopics.push({
          topic: revTopic._id,
          subject: revTopic.subject?._id,
          topicName: revTopic.name,
          subjectName: revTopic.subject?.name,
          estimatedMinutes: 30,
          type: 'revise',
          status: 'pending',
        });
      }

      sessions.push({
        dayNumber: day + 1,
        date,
        topics: dayTopics,
        status: 'pending',
      });
    }

    const plan = await StudyPlan.create({
      user: req.user._id,
      exam: examId,
      title: `Study Plan — ${new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}`,
      targetDate,
      targetScore: targetScore || null,
      dailyStudyHours: dailyHours,
      sessions,
      totalDays: sessions.length,
      isActive: true,
      generatedBy: 'ai',
    });

    // Shape response — use same stable topicIndex-based _id format
    const dailyPlans = plan.sessions.map((s) => ({
      date: s.date,
      dayNumber: s.dayNumber,
      sessions: (s.topics || []).map((t, topicIdx) => ({
        _id: `${s.dayNumber}-${topicIdx}`,
        type: t.type === 'learn' ? 'study' : t.type === 'revise' ? 'revision' : t.type === 'mock' ? 'mock_test' : 'practice',
        topic: t.topic ? { _id: t.topic, name: t.topicName } : null,
        subject: t.subject ? { _id: t.subject, name: t.subjectName } : null,
        duration: t.estimatedMinutes,
        isCompleted: false,
      })),
    }));

    res.status(201).json({ success: true, message: 'Study plan generated.', data: { plan: { ...plan.toObject(), dailyPlans } } });
  } catch (err) { next(err); }
});

// ─── PATCH mark individual session/topic complete ────────────────────────────
// sessionRef format: "dayNumber-topicIndex"  (e.g. "2-0", "2-1")
router.patch('/:planId/sessions/:sessionRef/complete', protect, async (req, res, next) => {
  try {
    // ── Parse and validate the session reference ────────────────────────────
    const parts = req.params.sessionRef.split('-');
    if (parts.length < 2) {
      return res.status(400).json({ success: false, message: 'Invalid session reference format.' });
    }
    const dayNum   = Number(parts[0]);
    const topicIdx = Number(parts[1]);

    if (isNaN(dayNum) || isNaN(topicIdx)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid session reference — day or topic index is not a number.',
      });
    }

    // ── Verify the plan belongs to this user and the indices are in-bounds ──
    const plan = await StudyPlan.findOne({ _id: req.params.planId, user: req.user._id });
    if (!plan) return res.status(404).json({ success: false, message: 'Plan not found.' });

    const daySession = plan.sessions.find((s) => s.dayNumber === dayNum);
    if (!daySession) {
      return res.status(404).json({ success: false, message: `Day ${dayNum} not found in plan.` });
    }
    if (!daySession.topics[topicIdx]) {
      return res.status(404).json({
        success: false,
        message: `Topic index ${topicIdx} not found in day ${dayNum}.`,
      });
    }

    // ── Idempotent guard: already done → return success without re-saving ───
    if (daySession.topics[topicIdx].status === 'completed') {
      return res.json({ success: true, message: 'Session already marked complete.' });
    }

    // ── Atomic targeted update — avoids Mongoose _id:false tracking issues ──
    // We use arrayFilters so MongoDB updates exactly this day's topic and
    // no other element in the nested arrays.
    const sessionArrayIndex = plan.sessions.indexOf(daySession);
    const topicPath         = `sessions.${sessionArrayIndex}.topics.${topicIdx}`;

    await StudyPlan.updateOne(
      { _id: plan._id, user: req.user._id },
      {
        $set: {
          [`${topicPath}.status`]:      'completed',
          [`${topicPath}.completedAt`]: new Date(),
        },
      }
    );

    // ── Re-fetch the updated plan to compute accurate day/plan-level status ─
    const updatedPlan = await StudyPlan.findById(plan._id);

    const updatedDay = updatedPlan.sessions.find((s) => s.dayNumber === dayNum);
    const allDone    = updatedDay.topics.every((t) => t.status === 'completed');
    const newDayStatus = allDone ? 'completed' : 'in_progress';

    // Update day-level status
    const dayIdx = updatedPlan.sessions.indexOf(updatedDay);
    await StudyPlan.updateOne(
      { _id: plan._id, user: req.user._id },
      { $set: { [`sessions.${dayIdx}.status`]: newDayStatus } }
    );

    // Recount fully-completed days and persist
    const finalPlan = await StudyPlan.findById(plan._id);
    const completedDays = finalPlan.sessions.filter(
      (s) => s.topics.every((t) => t.status === 'completed') && s.topics.length > 0
    ).length;
    await StudyPlan.updateOne(
      { _id: plan._id, user: req.user._id },
      { $set: { completedDays } }
    );

    res.json({ success: true, message: 'Session marked complete.' });
  } catch (err) { next(err); }
});

// ─── GET all plans (user) ────────────────────────────────────────────────────
router.get('/', protect, async (req, res, next) => {
  try {
    const plans = await StudyPlan.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .populate('exam', 'name shortName')
      .select('-sessions');
    res.json({ success: true, data: { studyPlans: plans } });
  } catch (err) { next(err); }
});

module.exports = router;
