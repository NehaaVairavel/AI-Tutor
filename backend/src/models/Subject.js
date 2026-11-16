const mongoose = require('mongoose');

const subjectSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Subject name is required'],
      trim: true,
    },
    shortName: {
      type: String,
      trim: true,
    },
    description: {
      type: String,
      trim: true,
    },
    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      required: [true, 'Exam reference is required'],
    },
    icon: {
      type: String,
      default: null,
    },
    color: {
      type: String,
      default: '#4F46E5',
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

subjectSchema.index({ exam: 1 });
subjectSchema.index({ exam: 1, isActive: 1 });
// Unique subject name per exam
subjectSchema.index({ exam: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Subject', subjectSchema);
