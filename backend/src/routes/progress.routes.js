const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/auth');
const UserProgress = require('../models/UserProgress');

router.get('/me', protect, async (req, res, next) => {
  try {
    const { examId } = req.query;
    const filter = { user: req.user._id };
    if (examId) filter.exam = examId;

    const progress = await UserProgress.findOne(filter)
      .populate('exam', 'name shortName')
      .populate('weakTopics', 'name')
      .populate('strongTopics', 'name')
      .populate('topicProgress.topic', 'name')
      .populate('topicProgress.subject', 'name')
      .populate('subjectProgress.subject', 'name')
      .lean();

    if (progress) {
      // ── Normalise topicProgress ──────────────────────────────────────────────
      // Strategy:
      //   1. If the topic document still exists (populate returned an object), use it.
      //   2. If the topic document was deleted (populate returned null), fall back to
      //      the stored topicName snapshot.
      //   3. Merge any duplicate entries that share the same topicId (stable identity).
      //   4. Filter out entries that have BOTH a null topicId AND no topicName snapshot,
      //      as they carry zero identifying information.
      //
      // We group by the raw stored topic ObjectId (tp._id from the raw doc) because
      // populate may set tp.topic = null for deleted refs.

      const topicMap = new Map(); // key = topicId string or synthetic key
      let syntheticIndex = 0;

      for (const tp of (progress.topicProgress || [])) {
        // Determine the stable identity key
        let key;
        if (tp.topic && typeof tp.topic === 'object' && tp.topic._id) {
          // Populate succeeded — use the live ObjectId
          key = tp.topic._id.toString();
        } else if (tp.topic && typeof tp.topic !== 'object') {
          // Raw ObjectId (populate silently failed but the ref is stored)
          key = tp.topic.toString();
        } else {
          // Completely null — no stable ID; assign a unique key to avoid merging
          key = `__deleted_${syntheticIndex++}`;
        }

        if (topicMap.has(key)) {
          // Merge into existing entry (deduplicate)
          const existing = topicMap.get(key);
          existing.totalAttempted += tp.totalAttempted || 0;
          existing.totalCorrect   += tp.totalCorrect   || 0;
          existing.totalWrong     += tp.totalWrong     || 0;
          existing.totalSkipped   += tp.totalSkipped   || 0;
          // Recalculate accuracy on merged data
          const answered = existing.totalCorrect + existing.totalWrong;
          existing.accuracy = answered > 0
            ? Math.round((existing.totalCorrect / answered) * 100)
            : 0;
          // Keep freshest lastPracticed
          if (tp.lastPracticed && tp.lastPracticed > (existing.lastPracticed || 0)) {
            existing.lastPracticed = tp.lastPracticed;
          }
          // Update masteryLevel based on merged accuracy
          existing.masteryLevel =
            existing.accuracy >= 80 ? 'strong' :
            existing.accuracy >= 60 ? 'average' :
            existing.totalAttempted > 0 ? 'weak' : 'not_started';
          continue;
        }

        // Build the normalised entry
        const topicName =
          (tp.topic && typeof tp.topic === 'object' && tp.topic.name)
            ? tp.topic.name                           // live name from populate
            : (tp.topicName || null);                 // stored snapshot

        const subjectName =
          (tp.subject && typeof tp.subject === 'object' && tp.subject.name)
            ? tp.subject.name
            : (tp.subjectName || null);

        // Skip entirely if we have no name and no useful data
        if (!topicName && tp.totalAttempted === 0) continue;

        topicMap.set(key, {
          ...tp,
          topic: {
            _id: (tp.topic && typeof tp.topic === 'object') ? tp.topic._id : tp.topic,
            name: topicName || 'Topic unavailable',
          },
          subject: tp.subject && typeof tp.subject === 'object'
            ? tp.subject
            : { _id: tp.subject || null, name: subjectName || 'Subject unavailable' },
          topicName: topicName || 'Topic unavailable',
          subjectName: subjectName || null,
        });
      }

      progress.topicProgress = Array.from(topicMap.values());

      // ── Normalise subjectProgress ────────────────────────────────────────────
      progress.subjectProgress = (progress.subjectProgress || []).map(sp => {
        if (!sp.subject || typeof sp.subject !== 'object') {
          return {
            ...sp,
            subject: { _id: sp.subject || null, name: '(Deleted subject)' },
          };
        }
        return sp;
      });
    }

    res.json({ success: true, message: 'Progress retrieved.', data: { progress } });
  } catch (err) { next(err); }
});

module.exports = router;
