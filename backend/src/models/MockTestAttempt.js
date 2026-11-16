const mongoose = require('mongoose');

/**
 * Per-question attempt record stored inside a MockTestAttempt.
 * Preserves a snapshot of the question text, topic name, and subject name
 * so results remain meaningful even after the source records are renamed/deleted.
 */
const questionAttemptSchema = new mongoose.Schema(
  {
    // Reference to Question document (may become stale if question is deleted)
    question: { type: mongoose.Schema.Types.ObjectId, ref: 'Question' },

    // ── Snapshots (preserved for historical review) ──────────────────────────
    questionText:    { type: String, default: '' },      // snapshot of question text
    options:         { type: mongoose.Schema.Types.Mixed }, // snapshot of options array
    topicId:         { type: mongoose.Schema.Types.ObjectId, ref: 'Topic', default: null },
    topicName:       { type: String, default: '' },       // snapshot at time of attempt
    subjectId:       { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', default: null },
    subjectName:     { type: String, default: '' },
    difficulty:      { type: String, default: '' },
    explanation:     { type: String, default: '' },

    // ── Grading ──────────────────────────────────────────────────────────────
    selectedAnswer:  { type: String, default: null },    // null = skipped
    correctAnswer:   { type: String, required: true },
    isCorrect:       { type: Boolean, required: true },
    isSkipped:       { type: Boolean, default: false },
    marksAwarded:    { type: Number, default: 0 },        // can be negative
    marksForQuestion:{ type: Number, default: 1 },        // max marks for this question
    timeTaken:       { type: Number, default: 0 },        // seconds
    markedForReview: { type: Boolean, default: false },
  },
  { _id: false }
);

const mockTestAttemptSchema = new mongoose.Schema(
  {
    // ── Identity ─────────────────────────────────────────────────────────────
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    mockTest: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MockTest',
      required: true,
    },

    // ── Historical snapshots (preserved if mock test is later deleted) ────────
    mockTestTitle:   { type: String, default: '' },
    examId:          { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', default: null },
    examName:        { type: String, default: '' },

    // ── Attempt state ─────────────────────────────────────────────────────────
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'abandoned', 'timed_out'],
      default: 'in_progress',
    },

    // ── Questions delivered in this attempt ───────────────────────────────────
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],

    // ── Per-question answers (populated on submit) ────────────────────────────
    attempts: [questionAttemptSchema],

    // ── Timing ────────────────────────────────────────────────────────────────
    startedAt:    { type: Date, default: Date.now },
    submittedAt:  { type: Date, default: null },
    timeTaken:    { type: Number, default: 0 },           // seconds, set on submit
    durationAllowed: { type: Number, default: 0 },        // seconds (from mockTest.duration)

    // ── Computed result (set on submit, never trust client values) ─────────────
    result: {
      totalQuestions:  { type: Number, default: 0 },
      attempted:       { type: Number, default: 0 },
      correct:         { type: Number, default: 0 },
      wrong:           { type: Number, default: 0 },
      skipped:         { type: Number, default: 0 },
      marksObtained:   { type: Number, default: 0 },      // clamped ≥ 0
      rawMarks:        { type: Number, default: 0 },      // signed (may be negative)
      negativeMarks:   { type: Number, default: 0 },
      totalMarks:      { type: Number, default: 0 },
      accuracy:        { type: Number, default: 0 },      // correct / attempted × 100
      percentage:      { type: Number, default: 0 },      // marksObtained / totalMarks × 100
    },

    // ── Idempotency guard ─────────────────────────────────────────────────────
    // Prevents duplicate completed attempts if submit is called more than once
    submissionLock: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// ── Indexes ───────────────────────────────────────────────────────────────────
mockTestAttemptSchema.index({ user: 1, status: 1 });
mockTestAttemptSchema.index({ user: 1, mockTest: 1 });
mockTestAttemptSchema.index({ user: 1, submittedAt: -1 });
mockTestAttemptSchema.index({ mockTest: 1, status: 1 });

module.exports = mongoose.model('MockTestAttempt', mockTestAttemptSchema);
