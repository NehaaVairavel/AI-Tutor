const mongoose = require('mongoose');

// Stores per-topic mastery for a user per exam
const topicProgressSchema = new mongoose.Schema(
  {
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      required: true,
    },
    // Snapshot: preserved for analytics when topic/subject records are renamed or deleted
    topicName:  { type: String, default: '' },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      default: null,
    },
    subjectName: { type: String, default: '' },
    totalAttempted: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
    totalWrong: { type: Number, default: 0 },
    totalSkipped: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    masteryLevel: {
      type: String,
      enum: ['not_started', 'weak', 'average', 'strong'],
      default: 'not_started',
    },
    lastPracticed: { type: Date, default: null },
  },
  { _id: false }
);

const subjectProgressSchema = new mongoose.Schema(
  {
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    totalAttempted: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
    accuracy: { type: Number, default: 0 },
    lastPracticed: { type: Date, default: null },
  },
  { _id: false }
);

const userProgressSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
    },
    // Overall stats
    totalQuestionsAttempted: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
    totalWrong: { type: Number, default: 0 },
    totalSkipped: { type: Number, default: 0 },
    overallAccuracy: { type: Number, default: 0 },
    totalStudyTime: { type: Number, default: 0 }, // seconds
    totalPracticeSessions: { type: Number, default: 0 },
    totalMockTests: { type: Number, default: 0 },
    // Streak
    currentStreak: { type: Number, default: 0 },
    longestStreak: { type: Number, default: 0 },
    lastStudyDate: { type: Date, default: null },
    // Per-subject and per-topic
    subjectProgress: [subjectProgressSchema],
    topicProgress: [topicProgressSchema],
    // Weak and strong topics (cached lists)
    weakTopics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
    strongTopics: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Topic' }],
  },
  { timestamps: true }
);

userProgressSchema.index({ user: 1, exam: 1 }, { unique: true });
userProgressSchema.index({ user: 1 });

module.exports = mongoose.model('UserProgress', userProgressSchema);
