const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema(
  {
    key: { type: String, required: true }, // 'A', 'B', 'C', 'D'
    text: { type: String, required: true, trim: true },
  },
  { _id: false }
);

const questionSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: [true, 'Question text is required'],
      trim: true,
    },
    type: {
      type: String,
      enum: ['mcq', 'true_false', 'multi_select', 'numerical'],
      default: 'mcq',
    },
    questionType: {
      type: String,
      enum: ['single_choice', 'multiple_select', 'matching', 'true_false', 'fill_blank', 'assertion_reason', 'statement_based', 'passage_based'],
      default: 'single_choice',
    },
    options: {
      type: [optionSchema],
      validate: {
        validator: function (v) {
          const qt = this.questionType || 'single_choice';
          if (qt === 'matching' || qt === 'fill_blank' || qt === 'passage_based') return true;
          if (qt === 'single_choice') return v.length === 4;
          if (qt === 'true_false') return v.length === 2;
          return v.length >= 2;
        },
        message: 'Options must have the correct count for the question type',
      },
    },
    correctAnswer: {
      type: String,
      required: false,
      // For single_choice/MCQ: 'A', 'B', 'C', or 'D'
      // For numerical: the numeric value as string
    },
    // Extended fields for new question types
    correctAnswerData: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    matchingPairs: {
      type: [
        {
          itemId: String,
          itemText: String,
          matchId: String,
          matchText: String,
          _id: false,
        },
      ],
      default: [],
    },
    blanks: {
      type: [
        {
          blankIndex: Number,
          acceptedAnswers: [String],
          caseSensitive: { type: Boolean, default: false },
          _id: false,
        },
      ],
      default: [],
    },
    statements: {
      type: [
        {
          number: Number,
          text: String,
          _id: false,
        },
      ],
      default: [],
    },
    assertionText: {
      type: String,
      default: null,
    },
    reasonText: {
      type: String,
      default: null,
    },
    passageText: {
      type: String,
      default: null,
    },
    parentQuestion: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question',
      default: null,
    },
    explanation: {
      type: String,
      trim: true,
      default: '',
    },
    // Hierarchy
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
      required: true,
    },
    // Metadata
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard'],
      required: [true, 'Difficulty is required'],
    },
    marks: {
      type: Number,
      default: 1,
      min: 0,
    },
    negativeMarks: {
      type: Number,
      default: 0,
      min: 0,
    },
    timeLimit: {
      type: Number, // seconds per question
      default: 60,
    },
    source: {
      type: String,
      enum: ['admin', 'previous_year', 'ai_generated'],
      default: 'admin',
    },
    year: {
      type: Number, // for previous year questions
      default: null,
    },
    tags: [{ type: String, trim: true, lowercase: true }],
    // AI content management
    isAiGenerated: {
      type: Boolean,
      default: false,
    },
    isApproved: {
      type: Boolean,
      default: true, // Admin-added questions are auto-approved
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Usage stats (denormalized for performance)
    timesUsed: { type: Number, default: 0 },
    timesCorrect: { type: Number, default: 0 },
    timesWrong: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ── Pre-validate hook for answer field requirements ──────────────────────────
questionSchema.pre('validate', function(next) {
  const qt = this.questionType || 'single_choice';
  // Types that use correctAnswer string
  if (['single_choice', 'true_false', 'assertion_reason', 'statement_based'].includes(qt)) {
    if (!this.correctAnswer) {
      this.invalidate('correctAnswer', 'correctAnswer is required for ' + qt);
    }
  }
  // Types that use correctAnswerData
  if (['multiple_select', 'matching', 'fill_blank'].includes(qt)) {
    if (!this.correctAnswerData) {
      this.invalidate('correctAnswerData', 'correctAnswerData is required for ' + qt);
    }
  }
  next();
});

// Indexes for efficient querying
questionSchema.index({ exam: 1, subject: 1, topic: 1 });
questionSchema.index({ exam: 1, difficulty: 1 });
questionSchema.index({ topic: 1, difficulty: 1 });
questionSchema.index({ isActive: 1, isApproved: 1 });
questionSchema.index({ source: 1 });
questionSchema.index({ tags: 1 });

// Virtual: accuracy rate
questionSchema.virtual('accuracyRate').get(function () {
  const total = this.timesCorrect + this.timesWrong;
  if (total === 0) return null;
  return Math.round((this.timesCorrect / total) * 100);
});

module.exports = mongoose.model('Question', questionSchema);
