const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Name is required'],
      trim: true,
      minlength: [2, 'Name must be at least 2 characters'],
      maxlength: [50, 'Name cannot exceed 50 characters'],
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password: {
      type: String,
      required: [true, 'Password is required'],
      minlength: [8, 'Password must be at least 8 characters'],
      select: false, // Never return password by default
    },
    role: {
      type: String,
      enum: ['student', 'admin'],
      default: 'student',
    },
    profileImage: {
      type: String,
      default: null,
    },
    // Exam preferences
    targetExam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Exam',
      default: null,
    },
    targetExamDate: {
      type: Date,
      default: null,
    },
    targetScore: {
      type: Number,
      default: null,
    },
    // Study preferences
    dailyStudyHours: {
      type: Number,
      default: 2,
      min: 0.5,
      max: 16,
    },
    preferredLanguage: {
      type: String,
      enum: ['english', 'tamil', 'hindi'],
      default: 'english',
    },
    preparationLevel: {
      type: String,
      enum: ['beginner', 'intermediate', 'advanced'],
      default: 'beginner',
    },
    // Password reset
    passwordResetToken: String,
    passwordResetExpires: Date,
    // ── Education & Employment profile (all optional; backward-compatible) ────
    educationStatus: {
      type: String,
      enum: [
        'school_student',
        'undergraduate',
        'postgraduate',
        'working_professional',
        'graduate_job_seeker',
        'other',
        '',
      ],
      default: '',
    },
    // Institution / school / college / university / company name
    institution: {
      type: String,
      trim: true,
      maxlength: [120, 'Institution name cannot exceed 120 characters'],
      default: '',
    },
    // Degree or course name
    degree: {
      type: String,
      trim: true,
      maxlength: [100, 'Degree/course cannot exceed 100 characters'],
      default: '',
    },
    // Current year of study (college: 1-6) or class/grade (school: 1-12)
    yearOfStudy: {
      type: Number,
      min: [1, 'Year / class must be 1 or more'],
      max: [12, 'Year / class cannot exceed 12'],
      default: null,
    },
    // For working professionals
    company: {
      type: String,
      trim: true,
      maxlength: [100, 'Company name cannot exceed 100 characters'],
      default: '',
    },
    jobRole: {
      type: String,
      trim: true,
      maxlength: [100, 'Job role cannot exceed 100 characters'],
      default: '',
    },
    // Additional target exams beyond the primary targetExam
    additionalExams: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Exam',
      },
    ],
    // Account status
    isActive: {
      type: Boolean,
      default: true,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Indexes (email already indexed via unique:true in schema)
userSchema.index({ role: 1 });
userSchema.index({ targetExam: 1 });
userSchema.index({ educationStatus: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastLoginAt: -1 });

// Hash password before save (promise-based — no next() for Mongoose 7+)
userSchema.pre('save', async function () {
  if (!this.isModified('password')) return;
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

// Remove sensitive fields when serializing
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  return obj;
};

module.exports = mongoose.model('User', userSchema);
