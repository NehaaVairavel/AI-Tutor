/**
 * Register.jsx
 * ------------
 * All education / employment and exam fields are now mandatory.
 * Fields are shown / hidden dynamically based on the selected status.
 * Validation runs both here (client) and again in Express (server).
 *
 * Required-field matrix:
 *   ALL statuses          → educationStatus, targetExam
 *   school_student        → institution (school name), yearOfStudy (class 1–12)
 *   undergraduate         → institution, degree, yearOfStudy (1–6)
 *   postgraduate          → institution, degree, yearOfStudy (1–4)
 *   working_professional  → institution (company), jobRole
 *   graduate_job_seeker   → degree (completed qualification)
 *   other                 → no conditional fields
 *
 * Existing users: login is unchanged. Users without education data are
 * prompted to complete their profile on the Profile page (soft prompt).
 */

import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Brain, Eye, EyeOff, Loader2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { examService } from '../../services';

// ── Preparation levels ────────────────────────────────────────────────────────
const LEVELS = [
  { value: 'beginner',     label: 'Beginner',     desc: 'Just starting out' },
  { value: 'intermediate', label: 'Intermediate', desc: '3–6 months prep' },
  { value: 'advanced',     label: 'Advanced',     desc: '6+ months prep' },
];

// ── Education status options (no blank / "prefer not to say") ─────────────────
const EDU_OPTIONS = [
  { value: 'school_student',       label: 'School Student' },
  { value: 'undergraduate',        label: 'Undergraduate / College Student' },
  { value: 'postgraduate',         label: 'Postgraduate Student' },
  { value: 'working_professional', label: 'Working Professional' },
  { value: 'graduate_job_seeker',  label: 'Graduate / Job Seeker' },
  { value: 'other',                label: 'Other' },
];

// ── Conditional field logic ────────────────────────────────────────────────────
// institution label per status
const INSTITUTION_LABELS = {
  school_student:       'School Name',
  undergraduate:        'College / University',
  postgraduate:         'University / Institute',
  working_professional: 'Company / Organisation',
};
const INSTITUTION_PLACEHOLDERS = {
  school_student:       'e.g. Delhi Public School',
  undergraduate:        'e.g. IIT Madras, Anna University',
  postgraduate:         'e.g. IIM Ahmedabad, BITS Pilani',
  working_professional: 'e.g. Infosys, TCS',
};
// Year / class label per status
const YEAR_LABELS = {
  school_student: 'Class / Grade',
  undergraduate:  'Year of Study',
  postgraduate:   'Year of Study',
};
const YEAR_PLACEHOLDERS = {
  school_student: 'e.g. 10 (for Class 10)',
  undergraduate:  'e.g. 2 (2nd year)',
  postgraduate:   'e.g. 1 (1st year)',
};
const YEAR_MAX = {
  school_student: 12,
  undergraduate:  6,
  postgraduate:   4,
};

// Which statuses need which fields
const NEEDS_INSTITUTION = new Set(['school_student', 'undergraduate', 'postgraduate', 'working_professional']);
const NEEDS_DEGREE      = new Set(['undergraduate', 'postgraduate', 'graduate_job_seeker']);
const NEEDS_YEAR        = new Set(['school_student', 'undergraduate', 'postgraduate']);
const NEEDS_JOBROLE     = new Set(['working_professional']);

// ── Req-asterisk helper ───────────────────────────────────────────────────────
const Req = () => <span className="text-red-500 ml-0.5">*</span>;

// ── Field-error display ───────────────────────────────────────────────────────
const FieldError = ({ msg }) =>
  msg ? <span className="form-error">{msg}</span> : null;

// ── Main component ────────────────────────────────────────────────────────────
export default function Register() {
  const { register } = useAuth();
  const navigate     = useNavigate();

  const [form, setForm] = useState({
    name:             '',
    email:            '',
    password:         '',
    confirmPassword:  '',
    preparationLevel: 'beginner',
    educationStatus:  '',
    institution:      '',
    degree:           '',
    yearOfStudy:      '',
    jobRole:          '',
    targetExam:       '',
  });
  const [showPwd, setShowPwd]   = useState(false);
  const [errors, setErrors]     = useState({});
  const [loading, setLoading]   = useState(false);
  const [apiError, setApiError] = useState('');
  const [exams, setExams]       = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError]     = useState('');

  // Load exam catalogue on mount (not gated behind section toggle)
  useEffect(() => {
    examService.getAll({ isActive: true })
      .then(r => setExams(r.data.data.exams || []))
      .catch(() => setExamsError('Could not load exams. Please refresh.'))
      .finally(() => setExamsLoading(false));
  }, []);

  // ── Computed visibility flags ────────────────────────────────────────────────
  const status          = form.educationStatus;
  const showInstitution = NEEDS_INSTITUTION.has(status);
  const showDegree      = NEEDS_DEGREE.has(status);
  const showYear        = NEEDS_YEAR.has(status);
  const showJobRole     = NEEDS_JOBROLE.has(status);

  // ── handleChange clears per-field error and global API error ────────────────
  const handleChange = useCallback((e) => {
    const { name, value } = e.target;
    setForm(prev => {
      const next = { ...prev, [name]: value };
      // When status changes, clear fields that are no longer relevant
      if (name === 'educationStatus') {
        next.institution = '';
        next.degree      = '';
        next.yearOfStudy = '';
        next.jobRole     = '';
      }
      return next;
    });
    setErrors(prev => ({ ...prev, [name]: '' }));
    setApiError('');
  }, []);

  // ── Client-side validation ───────────────────────────────────────────────────
  const validate = useCallback(() => {
    const errs = {};

    // Basic fields
    if (!form.name.trim() || form.name.trim().length < 2)
      errs.name = 'Full name must be at least 2 characters';
    if (!/^\S+@\S+\.\S+$/.test(form.email))
      errs.email = 'Enter a valid email address';
    if (form.password.length < 8)
      errs.password = 'Password must be at least 8 characters';
    else if (!/[A-Z]/.test(form.password) || !/[a-z]/.test(form.password) || !/\d/.test(form.password))
      errs.password = 'Password must include uppercase, lowercase, and a number';
    if (form.password !== form.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';

    // Education status — required
    if (!form.educationStatus)
      errs.educationStatus = 'Please select your education / employment status';

    // Target exam — required
    if (!form.targetExam)
      errs.targetExam = 'Please select your primary target exam';

    // Conditional fields
    if (showInstitution && !form.institution.trim())
      errs.institution = `${INSTITUTION_LABELS[status] || 'Institution name'} is required`;
    if (form.institution.trim().length > 120)
      errs.institution = 'Name cannot exceed 120 characters';

    if (showDegree && !form.degree.trim())
      errs.degree = 'Degree / course name is required';
    if (form.degree.trim().length > 100)
      errs.degree = 'Degree name cannot exceed 100 characters';

    if (showYear) {
      if (!form.yearOfStudy)
        errs.yearOfStudy = `${YEAR_LABELS[status] || 'Year'} is required`;
      else {
        const yr  = parseInt(form.yearOfStudy, 10);
        const max = YEAR_MAX[status] || 12;
        if (isNaN(yr) || yr < 1 || yr > max)
          errs.yearOfStudy = `${YEAR_LABELS[status]} must be between 1 and ${max}`;
      }
    }

    if (showJobRole && !form.jobRole.trim())
      errs.jobRole = 'Job role is required';
    if (form.jobRole.trim().length > 100)
      errs.jobRole = 'Job role cannot exceed 100 characters';

    return errs;
  }, [form, showInstitution, showDegree, showYear, showJobRole, status]);

  // ── Submit ───────────────────────────────────────────────────────────────────
  const handleSubmit = async (e) => {
    e.preventDefault();
    const errs = validate();
    if (Object.keys(errs).length) {
      setErrors(errs);
      // Scroll to first error
      const first = document.querySelector('.form-error');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setLoading(true);
    setApiError('');
    try {
      const payload = {
        name:             form.name.trim(),
        email:            form.email.trim(),
        password:         form.password,
        preparationLevel: form.preparationLevel,
        educationStatus:  form.educationStatus,
        targetExam:       form.targetExam,
      };
      // Only include fields that are relevant to the chosen status
      if (showInstitution && form.institution.trim()) payload.institution = form.institution.trim();
      if (showDegree      && form.degree.trim())      payload.degree      = form.degree.trim();
      if (showYear        && form.yearOfStudy)         payload.yearOfStudy = Number(form.yearOfStudy);
      if (showJobRole     && form.jobRole.trim())      payload.jobRole     = form.jobRole.trim();

      await register(payload);
      navigate('/dashboard', { replace: true });
    } catch (err) {
      // Express-validator errors come back as an array in err.response.data.errors
      const data = err.response?.data;
      if (data?.errors && Array.isArray(data.errors)) {
        // Map server field errors back to form fields
        const serverErrs = {};
        data.errors.forEach(({ field, message }) => {
          if (field) serverErrs[field] = message;
        });
        if (Object.keys(serverErrs).length) {
          setErrors(serverErrs);
        } else {
          setApiError(data.message || 'Registration failed. Please check your details.');
        }
      } else {
        setApiError(data?.message || 'Registration failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Password strength indicator ──────────────────────────────────────────────
  const strength = (() => {
    if (!form.password) return null;
    const ok = {
      upper: /[A-Z]/.test(form.password),
      lower: /[a-z]/.test(form.password),
      num:   /\d/.test(form.password),
      len:   form.password.length >= 8,
    };
    const score = Object.values(ok).filter(Boolean).length;
    if (score <= 2) return { label: 'Weak',   color: 'bg-red-500',     width: '33%' };
    if (score === 3) return { label: 'Fair',   color: 'bg-amber-500',   width: '66%' };
    return              { label: 'Strong', color: 'bg-emerald-500', width: '100%' };
  })();

  // ── Disable submit while loading or while exams haven't loaded yet ────────────
  const submitDisabled = loading || examsLoading;

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-surface-50 flex items-center justify-center px-4 py-10">
      {/* Decorative blur */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[400px] bg-primary-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-lg relative animate-fade-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2.5 mb-4">
            <div className="w-10 h-10 rounded-xl bg-primary-600 flex items-center justify-center">
              <Brain size={22} className="text-white" />
            </div>
            <span className="text-xl font-bold text-surface-900">AI Tutor</span>
          </Link>
          <h1 className="text-2xl font-bold text-surface-900 mb-1">Create your account</h1>
          <p className="text-surface-500 text-sm">
            Start your smart exam preparation — takes under 2 minutes
          </p>
        </div>

        <div className="card">
          {/* Global API error */}
          {apiError && (
            <div className="alert alert-error mb-5">
              <AlertCircle size={15} className="flex-shrink-0" />
              <span>{apiError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate>
            <div className="flex flex-col gap-5">

              {/* ════════════════════════════════════════════════════════════
                  SECTION 1 — Account details
              ════════════════════════════════════════════════════════════ */}
              <div>
                <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider mb-3">
                  Account Details
                </p>
                <div className="flex flex-col gap-4">

                  {/* Name */}
                  <div className="form-group">
                    <label htmlFor="reg-name" className="form-label">
                      Full Name<Req />
                    </label>
                    <input
                      id="reg-name" type="text" name="name"
                      value={form.name} onChange={handleChange}
                      placeholder="Your full name"
                      className={`form-input ${errors.name ? 'error' : ''}`}
                      autoComplete="name"
                    />
                    <FieldError msg={errors.name} />
                  </div>

                  {/* Email */}
                  <div className="form-group">
                    <label htmlFor="reg-email" className="form-label">
                      Email Address<Req />
                    </label>
                    <input
                      id="reg-email" type="email" name="email"
                      value={form.email} onChange={handleChange}
                      placeholder="you@example.com"
                      className={`form-input ${errors.email ? 'error' : ''}`}
                      autoComplete="email"
                    />
                    <FieldError msg={errors.email} />
                  </div>

                  {/* Password */}
                  <div className="form-group">
                    <label htmlFor="reg-password" className="form-label">
                      Password<Req />
                    </label>
                    <div className="relative">
                      <input
                        id="reg-password"
                        type={showPwd ? 'text' : 'password'}
                        name="password"
                        value={form.password} onChange={handleChange}
                        placeholder="Create a strong password"
                        className={`form-input pr-10 ${errors.password ? 'error' : ''}`}
                        autoComplete="new-password"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPwd(p => !p)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-surface-400 hover:text-surface-600"
                      >
                        {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    {strength && (
                      <div className="mt-1.5">
                        <div className="h-1.5 rounded-full bg-surface-200 overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${strength.color}`}
                            style={{ width: strength.width }}
                          />
                        </div>
                        <span className="text-xs text-surface-500 mt-0.5 block">
                          {strength.label} password
                        </span>
                      </div>
                    )}
                    <FieldError msg={errors.password} />
                  </div>

                  {/* Confirm password */}
                  <div className="form-group">
                    <label htmlFor="reg-confirm" className="form-label">
                      Confirm Password<Req />
                    </label>
                    <input
                      id="reg-confirm"
                      type={showPwd ? 'text' : 'password'}
                      name="confirmPassword"
                      value={form.confirmPassword} onChange={handleChange}
                      placeholder="Repeat your password"
                      className={`form-input ${errors.confirmPassword ? 'error' : ''}`}
                      autoComplete="new-password"
                    />
                    <FieldError msg={errors.confirmPassword} />
                  </div>

                  {/* Preparation level */}
                  <div className="form-group">
                    <label className="form-label">Preparation Level<Req /></label>
                    <div className="grid grid-cols-3 gap-2">
                      {LEVELS.map(({ value, label, desc }) => (
                        <button
                          key={value} type="button"
                          onClick={() => setForm(p => ({ ...p, preparationLevel: value }))}
                          className={`p-3 rounded-lg border text-left transition-all text-sm ${
                            form.preparationLevel === value
                              ? 'border-primary-600 bg-primary-50 text-primary-700'
                              : 'border-surface-200 bg-surface-50 text-surface-600 hover:border-surface-300'
                          }`}
                        >
                          <div className="font-semibold">{label}</div>
                          <div className="text-xs opacity-70 mt-0.5">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-surface-200" />

              {/* ════════════════════════════════════════════════════════════
                  SECTION 2 — Education & Exam (mandatory)
              ════════════════════════════════════════════════════════════ */}
              <div>
                <div className="mb-3">
                  <p className="text-xs font-semibold text-surface-400 uppercase tracking-wider">
                    Education &amp; Exam Preparation
                  </p>
                  <p className="text-xs text-surface-400 mt-0.5">
                    Required — helps us personalise your questions and study plan
                  </p>
                </div>
                <div className="flex flex-col gap-4">

                  {/* Education / Employment Status */}
                  <div className="form-group">
                    <label htmlFor="reg-edu-status" className="form-label">
                      Education / Employment Status<Req />
                    </label>
                    <select
                      id="reg-edu-status" name="educationStatus"
                      value={form.educationStatus} onChange={handleChange}
                      className={`form-input form-select ${errors.educationStatus ? 'error' : ''}`}
                    >
                      <option value="">— Select your status —</option>
                      {EDU_OPTIONS.map(o => (
                        <option key={o.value} value={o.value}>{o.label}</option>
                      ))}
                    </select>
                    <FieldError msg={errors.educationStatus} />
                  </div>

                  {/* Institution / Company — conditional */}
                  {showInstitution && (
                    <div className="form-group">
                      <label htmlFor="reg-institution" className="form-label">
                        {INSTITUTION_LABELS[status] || 'Institution'}<Req />
                      </label>
                      <input
                        id="reg-institution" type="text" name="institution"
                        value={form.institution} onChange={handleChange}
                        placeholder={INSTITUTION_PLACEHOLDERS[status] || 'Enter name'}
                        className={`form-input ${errors.institution ? 'error' : ''}`}
                        maxLength={120}
                      />
                      <FieldError msg={errors.institution} />
                    </div>
                  )}

                  {/* Degree / Course — conditional */}
                  {showDegree && (
                    <div className="form-group">
                      <label htmlFor="reg-degree" className="form-label">
                        {status === 'graduate_job_seeker'
                          ? 'Completed Degree / Qualification'
                          : 'Degree / Course'}
                        <Req />
                      </label>
                      <input
                        id="reg-degree" type="text" name="degree"
                        value={form.degree} onChange={handleChange}
                        placeholder={
                          status === 'graduate_job_seeker'
                            ? 'e.g. B.E. Mechanical Engineering'
                            : 'e.g. B.Tech Computer Science, MBA'
                        }
                        className={`form-input ${errors.degree ? 'error' : ''}`}
                        maxLength={100}
                      />
                      <FieldError msg={errors.degree} />
                    </div>
                  )}

                  {/* Year of Study / Class — conditional, shown side-by-side with degree for UG/PG */}
                  {showYear && (
                    <div className="form-group">
                      <label htmlFor="reg-year" className="form-label">
                        {YEAR_LABELS[status] || 'Year'}<Req />
                      </label>
                      <input
                        id="reg-year" type="number" name="yearOfStudy"
                        value={form.yearOfStudy} onChange={handleChange}
                        min="1" max={YEAR_MAX[status] || 12}
                        placeholder={YEAR_PLACEHOLDERS[status]}
                        className={`form-input ${errors.yearOfStudy ? 'error' : ''}`}
                      />
                      <FieldError msg={errors.yearOfStudy} />
                    </div>
                  )}

                  {/* Job Role — working professionals */}
                  {showJobRole && (
                    <div className="form-group">
                      <label htmlFor="reg-jobrole" className="form-label">
                        Job Role<Req />
                      </label>
                      <input
                        id="reg-jobrole" type="text" name="jobRole"
                        value={form.jobRole} onChange={handleChange}
                        placeholder="e.g. Software Engineer, Bank PO, Teacher"
                        className={`form-input ${errors.jobRole ? 'error' : ''}`}
                        maxLength={100}
                      />
                      <FieldError msg={errors.jobRole} />
                    </div>
                  )}

                  {/* Primary Target Exam — required for all */}
                  <div className="form-group">
                    <label htmlFor="reg-exam" className="form-label">
                      Primary Target Exam<Req />
                    </label>
                    {examsError ? (
                      <div className="alert alert-error text-xs">
                        <AlertCircle size={13} className="flex-shrink-0" />
                        <span>{examsError}</span>
                      </div>
                    ) : (
                      <select
                        id="reg-exam" name="targetExam"
                        value={form.targetExam} onChange={handleChange}
                        className={`form-input form-select ${errors.targetExam ? 'error' : ''}`}
                        disabled={examsLoading}
                      >
                        <option value="">
                          {examsLoading ? 'Loading exams…' : '— Select your target exam —'}
                        </option>
                        {exams.map(e => (
                          <option key={e._id} value={e._id}>{e.name}</option>
                        ))}
                      </select>
                    )}
                    <FieldError msg={errors.targetExam} />
                  </div>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={submitDisabled}
                className="btn btn-primary w-full"
              >
                {loading
                  ? <><Loader2 size={18} className="animate-spin" /> Creating account…</>
                  : 'Create Account'}
              </button>

              <p className="text-xs text-surface-400 text-center -mt-1">
                Fields marked <span className="text-red-500">*</span> are required
              </p>
            </div>
          </form>

          <p className="text-center text-surface-500 text-sm mt-5">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-primary-600 font-medium hover:text-primary-700 transition-colors"
            >
              Sign in
            </Link>
          </p>
        </div>

        <p className="text-center text-surface-400 text-xs mt-4">
          By creating an account, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}
