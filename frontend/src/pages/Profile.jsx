import { useState, useEffect } from 'react';
import { Save, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { authService, examService } from '../services';

const LEVELS    = ['beginner', 'intermediate', 'advanced'];
const LANGUAGES = [
  { value: 'english', label: 'English' },
  { value: 'tamil',   label: 'Tamil' },
  { value: 'hindi',   label: 'Hindi' },
];

const EDU_OPTIONS = [
  { value: '',                     label: 'Prefer not to say' },
  { value: 'school_student',       label: 'School Student' },
  { value: 'undergraduate',        label: 'Undergraduate / College Student' },
  { value: 'postgraduate',         label: 'Postgraduate Student' },
  { value: 'working_professional', label: 'Working Professional' },
  { value: 'graduate_job_seeker',  label: 'Graduate / Job Seeker' },
  { value: 'other',                label: 'Other' },
];

const STUDENT_STATUSES     = new Set(['school_student', 'undergraduate', 'postgraduate']);
const PROFESSIONAL_STATUSES = new Set(['working_professional']);

export default function Profile() {
  const { user, updateUser } = useAuth();

  const [form, setForm] = useState({
    name:             user?.name || '',
    targetExam:       user?.targetExam?._id || user?.targetExam || '',
    targetExamDate:   user?.targetExamDate ? user.targetExamDate.split('T')[0] : '',
    targetScore:      user?.targetScore || '',
    dailyStudyHours:  user?.dailyStudyHours || 2,
    preferredLanguage: user?.preferredLanguage || 'english',
    preparationLevel: user?.preparationLevel || 'beginner',
    // Education fields
    educationStatus:  user?.educationStatus || '',
    institution:      user?.institution || '',
    degree:           user?.degree || '',
    yearOfStudy:      user?.yearOfStudy || '',
    company:          user?.company || '',
    jobRole:          user?.jobRole || '',
  });

  const [exams, setExams]           = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState('');

  const [saving, setSaving]   = useState(false);
  const [success, setSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    examService.getAll({ isActive: true })
      .then(r => setExams(r.data.data.exams))
      .catch(err => setExamsError(err.response?.data?.message || 'Could not load exams.'))
      .finally(() => setExamsLoading(false));
  }, []);

  const handleChange = (e) => {
    setForm(p => ({ ...p, [e.target.name]: e.target.value }));
    setSuccess(false);
    setSaveError('');
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!form.name.trim()) { setSaveError('Name is required.'); return; }

    setSaving(true);
    setSaveError('');
    try {
      const payload = {
        ...form,
        targetScore:     form.targetScore ? Number(form.targetScore) : null,
        dailyStudyHours: Number(form.dailyStudyHours),
        targetExam:      form.targetExam || null,
        targetExamDate:  form.targetExamDate || null,
        yearOfStudy:     form.yearOfStudy ? Number(form.yearOfStudy) : null,
      };
      const res = await authService.updateProfile(payload);
      updateUser(res.data.data.user);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setSaveError(err.response?.data?.message || 'Failed to update profile.');
    } finally {
      setSaving(false);
    }
  };

  const showInstitution = !!form.educationStatus;
  const showDegreeYear  = STUDENT_STATUSES.has(form.educationStatus);
  const showCompany     = PROFESSIONAL_STATUSES.has(form.educationStatus);

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">My Profile</h1>
        <p className="text-surface-500 text-sm mt-1">Manage your account and exam preparation settings.</p>
      </div>

      {saveError && (
        <div className="alert alert-error">
          <AlertCircle size={15} className="flex-shrink-0" />
          <span>{saveError}</span>
        </div>
      )}
      {success && (
        <div className="alert alert-success">
          <CheckCircle size={15} className="flex-shrink-0" />
          <span>Profile updated successfully!</span>
        </div>
      )}

      <form onSubmit={handleSave} className="flex flex-col gap-4">
        {/* ── Avatar ─────────────────────────────────────────────────────── */}
        <div className="card card-sm flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-primary-100 border-2 border-primary-300 flex items-center justify-center text-primary-700 text-2xl font-bold flex-shrink-0">
            {user?.name?.charAt(0)?.toUpperCase() || 'U'}
          </div>
          <div>
            <div className="text-surface-800 font-semibold">{user?.name}</div>
            <div className="text-surface-500 text-sm">{user?.email}</div>
            <div className="badge badge-gray mt-1 capitalize">{user?.role}</div>
          </div>
        </div>

        {/* ── Personal Information ────────────────────────────────────────── */}
        <div className="card flex flex-col gap-4">
          <div className="text-surface-600 font-semibold text-sm uppercase tracking-wider">Personal Information</div>

          <div className="form-group">
            <label className="form-label">Full Name <span className="text-red-500">*</span></label>
            <input type="text" name="name" value={form.name} onChange={handleChange}
              className="form-input" placeholder="Your full name" />
          </div>

          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input type="email" value={user?.email || ''} className="form-input"
              disabled style={{ opacity: 0.5, cursor: 'not-allowed' }} />
            <span className="text-xs text-surface-500">Email cannot be changed</span>
          </div>
        </div>

        {/* ── Education & Employment ──────────────────────────────────────── */}
        <div className="card flex flex-col gap-4">
          <div className="text-surface-600 font-semibold text-sm uppercase tracking-wider">
            Education &amp; Employment <span className="text-surface-400 font-normal normal-case">(optional)</span>
          </div>

          <div className="form-group">
            <label htmlFor="profile-edu" className="form-label">Education / Employment Status</label>
            <select id="profile-edu" name="educationStatus" value={form.educationStatus}
              onChange={handleChange} className="form-input form-select">
              {EDU_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {showInstitution && (
            <div className="form-group">
              <label htmlFor="profile-institution" className="form-label">
                {showCompany ? 'Company / Organisation' : 'School / College / University'}
              </label>
              <input id="profile-institution" type="text" name="institution" value={form.institution}
                onChange={handleChange}
                placeholder={showCompany ? 'Company name' : 'Institution name'}
                className="form-input" maxLength={120} />
            </div>
          )}

          {showDegreeYear && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label htmlFor="profile-degree" className="form-label">Degree / Course</label>
                <input id="profile-degree" type="text" name="degree" value={form.degree}
                  onChange={handleChange} placeholder="e.g. B.Tech, BA, MBA"
                  className="form-input" maxLength={100} />
              </div>
              <div className="form-group">
                <label htmlFor="profile-year" className="form-label">Year of Study</label>
                <input id="profile-year" type="number" name="yearOfStudy" value={form.yearOfStudy}
                  onChange={handleChange} min="1" max="10" placeholder="e.g. 2"
                  className="form-input" />
              </div>
            </div>
          )}

          {showCompany && (
            <div className="form-group">
              <label htmlFor="profile-jobrole" className="form-label">Job Role</label>
              <input id="profile-jobrole" type="text" name="jobRole" value={form.jobRole}
                onChange={handleChange} placeholder="e.g. Software Engineer"
                className="form-input" maxLength={100} />
            </div>
          )}
        </div>

        {/* ── Exam Preparation ────────────────────────────────────────────── */}
        <div className="card flex flex-col gap-4">
          <div className="text-surface-600 font-semibold text-sm uppercase tracking-wider">Exam Preparation</div>

          <div className="form-group">
            <label className="form-label">
              Target Exam
              {examsLoading && <Loader2 size={13} className="inline ml-2 animate-spin text-surface-400" />}
            </label>
            <select name="targetExam" value={form.targetExam} onChange={handleChange}
              className="form-input form-select" disabled={examsLoading}>
              <option value="">{examsLoading ? 'Loading exams…' : 'Select your target exam'}</option>
              {!examsLoading && exams.map(e => <option key={e._id} value={e._id}>{e.name}</option>)}
            </select>
            {examsError && (
              <span className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle size={11} /> {examsError}
              </span>
            )}
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Exam Date</label>
              <input type="date" name="targetExamDate" value={form.targetExamDate}
                onChange={handleChange} className="form-input" />
            </div>
            <div className="form-group">
              <label className="form-label">Target Score</label>
              <input type="number" name="targetScore" value={form.targetScore}
                onChange={handleChange} className="form-input" placeholder="e.g. 160"
                min="0" max="9999" />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Preparation Level</label>
            <div className="grid grid-cols-3 gap-2">
              {LEVELS.map(l => (
                <button key={l} type="button"
                  onClick={() => setForm(p => ({ ...p, preparationLevel: l }))}
                  className={`p-2.5 rounded-lg border text-sm font-medium capitalize transition-all ${
                    form.preparationLevel === l
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : 'border-surface-200 bg-surface-50 text-surface-600 hover:border-surface-300'
                  }`}>
                  {l}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Study Preferences ───────────────────────────────────────────── */}
        <div className="card flex flex-col gap-4">
          <div className="text-surface-600 font-semibold text-sm uppercase tracking-wider">Study Preferences</div>

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="form-label">Daily Study Hours</label>
              <select name="dailyStudyHours" value={form.dailyStudyHours}
                onChange={handleChange} className="form-input form-select">
                {[0.5, 1, 1.5, 2, 3, 4, 5, 6, 8].map(h => (
                  <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Preferred Language</label>
              <select name="preferredLanguage" value={form.preferredLanguage}
                onChange={handleChange} className="form-input form-select">
                {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
              </select>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn btn-primary w-full">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
          {saving ? 'Saving…' : 'Save Changes'}
        </button>
      </form>
    </div>
  );
}
