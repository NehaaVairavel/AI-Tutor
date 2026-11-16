const mongoose = require('mongoose');

const mockTestSectionSchema = new mongoose.Schema(
  {
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
    name: { type: String, required: true },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    totalMarks: { type: Number, default: 0 },
    duration: { type: Number, default: null }, // section-level timer (optional)
  },
  { _id: false }
);

const mockTestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Mock test title is required'],
      trim: true,
    },
    description: { type: String, trim: true },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: true,
    },
    sections: [mockTestSectionSchema],
    // Flat question list for simple tests
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Question' }],
    totalQuestions: { type: Number, default: 0 },
    totalMarks: { type: Number, default: 0 },
    duration: { type: Number, required: true }, // minutes
    negativeMarking: { type: Boolean, default: false },
    negativeMarkingValue: { type: Number, default: 0 },
    instructions: { type: String, default: '' },
    isActive: { type: Boolean, default: true },
    isFree: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true }
);

mockTestSchema.index({ exam: 1, isActive: 1 });

module.exports = mongoose.model('MockTest', mockTestSchema);
