const mongoose = require('mongoose');

const examSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Exam name is required'],
      unique: true,
      trim: true,
    },
    shortName: {
      type: String,
      required: [true, 'Short name is required'],
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    category: {
      type: String,
      enum: ['ssc', 'banking', 'tnpsc', 'upsc', 'railway', 'gate', 'cat', 'jee', 'neet', 'other'],
      required: [true, 'Exam category is required'],
    },
    totalMarks: {
      type: Number,
      default: null,
    },
    duration: {
      type: Number, // in minutes
      default: null,
    },
    negativeMarking: {
      type: Boolean,
      default: false,
    },
    negativeMarkingValue: {
      type: Number,
      default: 0,
    },
    passingMarks: {
      type: Number,
      default: null,
    },
    syllabus: {
      type: String,
      default: null,
    },
    officialWebsite: {
      type: String,
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

examSchema.index({ category: 1 });
examSchema.index({ isActive: 1 });
// Note: shortName already indexed via unique:true in schema field

module.exports = mongoose.model('Exam', examSchema);
