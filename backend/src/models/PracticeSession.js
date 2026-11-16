const mongoose = require('mongoose');

const questionAttemptSchema = new mongoose.Schema(
  {
    question: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      required: true,
    },
    selectedAnswer: {
      type: mongoose.Schema.Types.Mixed,
      default: null, // null = skipped
    },
    correctAnswer: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    isCorrect: {
      type: Boolean,
      required: true,
    },
    isSkipped: {
      type: Boolean,
      default: false,
    },
    marksAwarded: {
      type: Number,
      default: 0,
    },
    timeTaken: {
      type: Number, // seconds
      default: 0,
    },
    markedForReview: {
      type: Boolean,
      default: false,
    },
    // ── Snapshot: full question data frozen at submission time ──────────────
    // Allows review even if the source Question document is later edited or deleted.
    questionSnapshot: {
      text:           { type: String, default: '' },
      questionType:   { type: String, default: 'single_choice' },
      type:           { type: String, default: 'mcq' },           // keep for backward compat
      options:        [{ key: String, text: String }],
      explanation:    { type: String, default: '' },
      difficulty:     { type: String, default: '' },
      marks:          { type: Number, default: 1 },
      negativeMarks:  { type: Number, default: 0 },
      topicName:      { type: String, default: '' },
      subjectName:    { type: String, default: '' },
      // Extended for new types (all optional):
      matchingPairs:  { type: mongoose.Schema.Types.Mixed, default: null },
      blanks:         { type: mongoose.Schema.Types.Mixed, default: null },
      statements:     { type: mongoose.Schema.Types.Mixed, default: null },
      assertionText:  { type: String, default: '' },
      reasonText:     { type: String, default: '' },
      passageText:    { type: String, default: '' },
    },
  },
  { _id: false }
);

const practiceSessionSchema = new mongoose.Schema(
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
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: true,
    },
    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Topic',
      default: null,
    },
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'mixed'],
      default: 'mixed',
    },
    // Session state
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned'],
      default: 'in_progress',
    },
    questions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
      },
    ],
    attempts: [questionAttemptSchema],
    // Result (populated on submit)
    result: {
      totalQuestions: { type: Number, default: 0 },
      attempted: { type: Number, default: 0 },
      correct: { type: Number, default: 0 },
      wrong: { type: Number, default: 0 },
      skipped: { type: Number, default: 0 },
      marksObtained: { type: Number, default: 0 },
      rawMarks: { type: Number, default: 0 },        // signed score (may be negative)
      negativeMarks: { type: Number, default: 0 },
      totalMarks: { type: Number, default: 0 },
      accuracy: { type: Number, default: 0 },
      timeTaken: { type: Number, default: 0 }, // seconds
      percentage: { type: Number, default: 0 },
    },
    startedAt: { type: Date, default: Date.now },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

practiceSessionSchema.index({ user: 1, status: 1 });
practiceSessionSchema.index({ user: 1, exam: 1 });
practiceSessionSchema.index({ user: 1, subject: 1 });
practiceSessionSchema.index({ user: 1, topic: 1 });
practiceSessionSchema.index({ user: 1, createdAt: -1 });
// Compound index for admin dashboard aggregations (status + completedAt range scan)
practiceSessionSchema.index({ status: 1, completedAt: -1 });

module.exports = mongoose.model('PracticeSession', practiceSessionSchema);
