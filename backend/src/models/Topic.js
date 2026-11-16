const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Topic name is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    subject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subject',
      required: [true, 'Subject reference is required'],
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: [true, 'Exam reference is required'],
    },
    // Subtopics can be stored as an array for flat access
    subtopics: [
      {
        name: { type: String, trim: true },
        description: { type: String, trim: true },
      },
    ],
    difficulty: {
      type: String,
      enum: ['easy', 'medium', 'hard', 'mixed'],
      default: 'mixed',
    },
    estimatedStudyTime: {
      type: Number, // in minutes
      default: 60,
    },
    order: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

topicSchema.index({ subject: 1 });
topicSchema.index({ exam: 1 });
topicSchema.index({ subject: 1, isActive: 1 });
topicSchema.index({ exam: 1, subject: 1 }, { unique: false });

module.exports = mongoose.model('Topic', topicSchema);
