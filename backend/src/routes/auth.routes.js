/**
 * auth.routes.js
 * --------------
 * Registration includes mandatory education + exam validation.
 * Conditional rules use express-validator's .if() so student-only fields
 * are never required from professionals and vice versa.
 *
 * Validation matrix:
 *  ALL statuses      → educationStatus (required), targetExam (required)
 *  school_student    → institution (school name), yearOfStudy (class 1–12)
 *  undergraduate     → institution, degree, yearOfStudy (1–6)
 *  postgraduate      → institution, degree, yearOfStudy (1–4)
 *  working_professional → institution (company name), jobRole
 *  graduate_job_seeker  → degree (qualification already completed)
 *  other             → no conditional fields
 *
 * Existing users are NOT affected — login and profile-update routes unchanged.
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const router  = express.Router();

const { register, login, getMe, updateProfile, changePassword } = require('../controllers/auth.controller');
const { protect }  = require('../middleware/auth');
const validate     = require('../middleware/validate');

// ── Statuses that require institution ────────────────────────────────────────
const NEEDS_INSTITUTION = [
  'school_student', 'undergraduate', 'postgraduate', 'working_professional',
];
// ── Statuses that require degree ─────────────────────────────────────────────
const NEEDS_DEGREE = [
  'undergraduate', 'postgraduate', 'graduate_job_seeker',
];
// ── Statuses that require yearOfStudy ────────────────────────────────────────
const NEEDS_YEAR = ['school_student', 'undergraduate', 'postgraduate'];
// ── Year range per status ─────────────────────────────────────────────────────
const YEAR_RANGES = {
  school_student: { min: 1, max: 12, label: 'Class must be between 1 and 12' },
  undergraduate:  { min: 1, max: 6,  label: 'Year of study must be between 1 and 6' },
  postgraduate:   { min: 1, max: 4,  label: 'Year of study must be between 1 and 4' },
};

// ── Registration validation rules ────────────────────────────────────────────
const registerRules = [
  // Basic fields
  body('name')
    .trim()
    .isLength({ min: 2, max: 50 })
    .withMessage('Name must be 2–50 characters'),

  body('email')
    .isEmail()
    .normalizeEmail()
    .withMessage('Valid email required'),

  body('password')
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('Password must contain at least one uppercase letter, one lowercase letter, and one number'),

  // ── Education status — required for new registrations ────────────────────
  body('educationStatus')
    .notEmpty()
    .withMessage('Education / employment status is required')
    .isIn(['school_student', 'undergraduate', 'postgraduate', 'working_professional', 'graduate_job_seeker', 'other'])
    .withMessage('Invalid education status'),

  // ── Target exam — required for all new users ──────────────────────────────
  body('targetExam')
    .notEmpty()
    .withMessage('Primary target exam is required')
    .isMongoId()
    .withMessage('Invalid exam selection'),

  // ── Institution — required for school, college, and professional statuses ─
  body('institution')
    .if(body('educationStatus').isIn(NEEDS_INSTITUTION))
    .trim()
    .notEmpty()
    .withMessage('Institution / school / company name is required')
    .isLength({ max: 120 })
    .withMessage('Name cannot exceed 120 characters'),

  // ── Degree / Course — required for college and grad-seeker statuses ───────
  body('degree')
    .if(body('educationStatus').isIn(NEEDS_DEGREE))
    .trim()
    .notEmpty()
    .withMessage('Degree / course name is required')
    .isLength({ max: 100 })
    .withMessage('Degree name cannot exceed 100 characters'),

  // ── Year of study / class — required for school + college statuses ────────
  body('yearOfStudy')
    .if(body('educationStatus').isIn(NEEDS_YEAR))
    .notEmpty()
    .withMessage('Year of study / class is required')
    .isInt({ min: 1, max: 12 })
    .withMessage('Year / class must be a number between 1 and 12')
    // Per-status tighter range validation
    .custom((value, { req }) => {
      const status = req.body.educationStatus;
      const range  = YEAR_RANGES[status];
      if (!range) return true;
      const yr = parseInt(value, 10);
      if (yr < range.min || yr > range.max) {
        throw new Error(range.label);
      }
      return true;
    }),

  // ── Job role — required for working professionals ─────────────────────────
  body('jobRole')
    .if(body('educationStatus').equals('working_professional'))
    .trim()
    .notEmpty()
    .withMessage('Job role is required for working professionals')
    .isLength({ max: 100 })
    .withMessage('Job role cannot exceed 100 characters'),
];

// ── Login validation rules ───────────────────────────────────────────────────
const loginRules = [
  body('email').isEmail().normalizeEmail().withMessage('Valid email required'),
  body('password').notEmpty().withMessage('Password is required'),
];

// ── Change password rules ────────────────────────────────────────────────────
const changePasswordRules = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword')
    .isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters')
    .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
    .withMessage('New password must contain uppercase, lowercase, and number'),
];

// ── Routes ───────────────────────────────────────────────────────────────────
router.post('/register', registerRules, validate, register);
router.post('/login',    loginRules,    validate, login);

router.get('/me',              protect, getMe);
router.put('/profile',         protect, updateProfile);
router.put('/change-password', protect, changePasswordRules, validate, changePassword);

module.exports = router;
