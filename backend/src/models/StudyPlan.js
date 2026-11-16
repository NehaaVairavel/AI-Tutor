const mongoose = require('mongoose');

const studySessionSchema = new mongoose.Schema(
  {
    dayNumber: { type: Number, required: true },
    date: { type: Date, required: true },
    topics: [
      {
        topic: { type: mongoose.Schema.Types.ObjectId, ref: 'Topic' },
        subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
        topicName: { type: String },
        subjectName: { type: String },
        estimatedMinutes: { type: Number, default: 30 },
        type: {
          type: String,
          enum: ['learn', 'practice', 'revise', 'mock'],
          default: 'learn',
        },
        status: {
          type: String,
          enum: ['pending', 'in_progress', 'completed', 'skipped'],
          default: 'pending',
        },
        completedAt: { type: Date, default: null },
      },
    ],
    status: {
      type: String,
      enum: ['pending', 'in_progress', 'completed', 'skipped'],
      default: 'pending',
    },
  },
  { _id: false }
);

const studyPlanSchema = new mongoose.Schema(
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
    title: { type: String, default: 'My Study Plan' },
    targetDate: { type: Date, required: true },
    targetScore: { type: Number, default: null },
    dailyStudyHours: { type: Number, default: 2 },
    preferredDays: {
      type: [String],
      default: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'],
    },
    sessions: [studySessionSchema],
    totalDays: { type: Number, default: 0 },
    completedDays: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    generatedBy: {
      type: String,
      enum: ['ai', 'manual'],
      default: 'ai',
    },
  },
  { timestamps: true }
);

studyPlanSchema.index({ user: 1, exam: 1 });
studyPlanSchema.index({ user: 1, isActive: 1 });

module.exports = mongoose.model('StudyPlan', studyPlanSchema);
