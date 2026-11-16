const User = require('../models/User');
const UserProgress = require('../models/UserProgress');
const { generateToken, createError } = require('../utils/helpers');

// Education fields collected at registration (now mandatory via route validators).
// sanitizeEducation() sanitizes and coerces types but does NOT enforce presence —
// that is handled upstream by express-validator in auth.routes.js.
const EDUCATION_FIELDS = [
  'educationStatus',
  'institution',
  'degree',
  'yearOfStudy',
  'company',
  'jobRole',
];

// Sanitize education payload — strip unknown keys, coerce types
function sanitizeEducation(body) {
  const out = {};
  if (body.educationStatus !== undefined) {
    const valid = ['school_student','undergraduate','postgraduate','working_professional','graduate_job_seeker','other',''];
    out.educationStatus = valid.includes(body.educationStatus) ? body.educationStatus : '';
  }
  if (typeof body.institution === 'string') out.institution = body.institution.trim().slice(0, 120);
  if (typeof body.degree === 'string')      out.degree      = body.degree.trim().slice(0, 100);
  if (typeof body.company === 'string')     out.company     = body.company.trim().slice(0, 100);
  if (typeof body.jobRole === 'string')     out.jobRole     = body.jobRole.trim().slice(0, 100);
  if (body.yearOfStudy !== undefined && body.yearOfStudy !== '' && body.yearOfStudy !== null) {
    const yr = parseInt(body.yearOfStudy, 10);
    if (!isNaN(yr) && yr >= 1 && yr <= 10) out.yearOfStudy = yr;
  } else if (body.yearOfStudy === null || body.yearOfStudy === '') {
    out.yearOfStudy = null;
  }
  return out;
}

// ─── Register ──────────────────────────────────────────────────────────────────
const register = async (req, res, next) => {
  try {
    const { name, email, password, preparationLevel, targetExam } = req.body;

    const existing = await User.findOne({ email });
    if (existing) {
      return next(createError('An account with this email already exists.', 409));
    }

    // Sanitize and coerce education fields (presence already validated by route middleware)
    const educationData = sanitizeEducation(req.body);

    const user = await User.create({
      name,
      email,
      password,
      preparationLevel: preparationLevel || 'beginner',
      // targetExam is required — validated upstream; store the ObjectId directly
      targetExam: targetExam || null,
      ...educationData,
    });

    const token = generateToken(user._id);

    // Populate targetExam (null for new users, but keeps response structure consistent)
    const populatedUser = await User.findById(user._id).populate('targetExam', 'name shortName category');
    const safeUser = populatedUser.toSafeObject();

    // ── Emit real-time event to admin dashboard (after DB write succeeds) ────
    try {
      const { getIO } = require('../socketio');
      const io = getIO();
      if (io) {
        io.to('admin-room').emit('admin:user-created', {
          _id:             safeUser._id,
          name:            safeUser.name,
          email:           safeUser.email,
          educationStatus: safeUser.educationStatus || '',
          institution:     safeUser.institution || '',
          targetExam:      safeUser.targetExam || null,
          createdAt:       safeUser.createdAt,
          isActive:        safeUser.isActive,
        });
      }
    } catch (_) {
      // Socket.IO not yet initialized (e.g. during tests) — safe to ignore
    }

    return res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      data: { token, user: safeUser },
    });
  } catch (err) {
    // MongoDB duplicate key — race condition between findOne check and create()
    if (err.code === 11000 || err.name === 'MongoServerError' && err.code === 11000) {
      return next(createError('An account with this email already exists.', 409));
    }
    next(err);
  }
};

// ─── Login ─────────────────────────────────────────────────────────────────────
const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      return next(createError('Invalid email or password.', 401));
    }

    if (!user.isActive) {
      return next(createError('Your account has been deactivated. Please contact support.', 401));
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return next(createError('Invalid email or password.', 401));
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save({ validateBeforeSave: false });

    const token = generateToken(user._id);

    // Populate targetExam so the sidebar shows the exam name immediately
    const populatedUser = await User.findById(user._id).populate('targetExam', 'name shortName category');

    return res.json({
      success: true,
      message: 'Login successful.',
      data: {
        token,
        user: populatedUser.toSafeObject(),
      },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Current User ──────────────────────────────────────────────────────────
const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id).populate('targetExam', 'name shortName category');

    return res.json({
      success: true,
      message: 'User data retrieved.',
      data: { user: user.toSafeObject() },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Update Profile ────────────────────────────────────────────────────────────
const updateProfile = async (req, res, next) => {
  try {
    const allowedFields = [
      'name',
      'profileImage',
      'targetExam',
      'targetExamDate',
      'targetScore',
      'dailyStudyHours',
      'preferredLanguage',
      'preparationLevel',
      // Education fields
      'additionalExams',
    ];

    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });

    // Merge sanitized education fields
    const educationData = sanitizeEducation(req.body);
    Object.assign(updates, educationData);

    // Prevent role escalation via profile update
    delete updates.role;
    delete updates.password;
    delete updates.passwordResetToken;
    delete updates.passwordResetExpires;

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new: true,
      runValidators: true,
    }).populate('targetExam', 'name shortName category');

    return res.json({
      success: true,
      message: 'Profile updated successfully.',
      data: { user: user.toSafeObject() },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Change Password ───────────────────────────────────────────────────────────
const changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return next(createError('Current password is incorrect.', 400));
    }

    user.password = newPassword;
    await user.save();

    const token = generateToken(user._id);

    return res.json({
      success: true,
      message: 'Password changed successfully.',
      data: { token },
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { register, login, getMe, updateProfile, changePassword };
