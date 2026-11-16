import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip,
  CartesianGrid, ResponsiveContainer,
} from 'recharts';
import {
  ArrowLeft, User, BookOpen, Clock, Target, Award, TrendingUp,
  CheckCircle, XCircle, SkipForward, AlertCircle, ExternalLink,
  Calendar, ChevronDown, ChevronUp, RefreshCw, Activity,
} from 'lucide-react';
import { adminService } from '../../services';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt    = (n) => (n ?? 0).toLocaleString();
const fmtPct = (n) => `${Math.round(n ?? 0)}%`;
const fmtTime = (sec) => {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtDate = (d, opts) =>
  d ? new Date(d).toLocaleDateString('en-IN', opts || { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const fmtDateTime = (d) =>
  d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

const EDU_LABELS = {
  school_student:       'School Student',
  undergraduate:        'Undergraduate',
  postgraduate:         'Postgraduate',
  working_professional: 'Working Professional',
  graduate_job_seeker:  'Graduate / Job Seeker',
  other:                'Other',
  '':                   '—',
};

const CHART_COLORS = {
  primary: '#4f46e5',
  success: '#16a34a',
  danger:  '#dc2626',
  warning: '#d97706',
};

// ── Section wrapper ───────────────────────────────────────────────────────────
function Section({ title, children, action }) {
  return (
    <div className="card flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-surface-700 font-semibold text-sm uppercase tracking-wider">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

// ── Stat Row ─────────────────────────────────────────────────────────────────
function StatRow({ label, value, sub, icon: Icon, color = 'text-primary-600' }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-surface-100 last:border-0">
      <div className="flex items-center gap-2 text-surface-600 text-sm">
        {Icon && <Icon size={14} className={color} />}
        {label}
      </div>
      <div className="text-right">
        <div className="font-semibold text-surface-800 text-sm">{value}</div>
        {sub && <div className="text-xs text-surface-400">{sub}</div>}
      </div>
    </div>
  );
}

// ── Accuracy Badge ────────────────────────────────────────────────────────────
function AccBadge({ pct }) {
  const n = Math.round(pct || 0);
  const cls = n >= 70 ? 'badge-success' : n >= 50 ? 'badge-warning' : 'badge-danger';
  return <span className={`badge ${cls}`}>{n}%</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function AdminUserDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [profile, setProfile]     = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [topics, setTopics]       = useState([]);
  const [sessions, setSessions]   = useState([]);
  const [sessPage, setSessPage]   = useState(1);
  const [sessPag, setSessPag]     = useState(null);

  const [loading, setLoading]     = useState(true);
  const [topicLoading, setTopicLoading] = useState(true);
  const [sessLoading, setSessLoading]   = useState(true);
  const [error, setError]         = useState('');

  // Topic filter
  const [showWeakOnly, setShowWeakOnly] = useState(false);
  const [topicSearch, setTopicSearch]   = useState('');

  // Session review expansion
  const [expandedSession, setExpandedSession] = useState(null);
  const [reviewData, setReviewData]   = useState({});
  const [reviewLoading, setReviewLoading] = useState('');

  // Load profile + analytics
  const loadProfile = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.getUser(id);
      setProfile(res.data.data.user);
      setAnalytics(res.data.data.analytics);
    } catch {
      setError('Failed to load user profile.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Load topics
  const loadTopics = useCallback(async () => {
    setTopicLoading(true);
    try {
      const res = await adminService.getUserTopics(id);
      setTopics(res.data.data.topics || []);
    } catch {
      setTopics([]);
    } finally {
      setTopicLoading(false);
    }
  }, [id]);

  // Load sessions
  const loadSessions = useCallback(async () => {
    setSessLoading(true);
    try {
      const res = await adminService.getUserSessions(id, { page: sessPage, limit: 10 });
      setSessions(res.data.data.sessions || []);
      setSessPag(res.data.data.pagination);
    } catch {
      setSessions([]);
    } finally {
      setSessLoading(false);
    }
  }, [id, sessPage]);

  useEffect(() => { loadProfile(); loadTopics(); }, [loadProfile, loadTopics]);
  useEffect(() => { loadSessions(); }, [loadSessions]);

  const handleSessionExpand = async (sess) => {
    if (expandedSession === sess._id) {
      setExpandedSession(null);
      return;
    }
    setExpandedSession(sess._id);
    if (!reviewData[sess._id]) {
      setReviewLoading(sess._id);
      try {
        const res = await adminService.getUserSessionReview(id, sess._id);
        setReviewData(prev => ({ ...prev, [sess._id]: res.data.data.session }));
      } catch {
        setReviewData(prev => ({ ...prev, [sess._id]: null }));
      } finally {
        setReviewLoading('');
      }
    }
  };

  // ── Filtered topics ─────────────────────────────────────────────────────────
  const filteredTopics = topics.filter(t => {
    if (showWeakOnly && !t.isWeak) return false;
    if (topicSearch && !t.topicName?.toLowerCase().includes(topicSearch.toLowerCase())) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-40 rounded-xl" />)}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-16">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-surface-600">{error || 'User not found.'}</p>
        <button onClick={() => navigate(-1)} className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} /> Back
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 max-w-5xl">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="btn btn-ghost btn-sm">
          <ArrowLeft size={15} />
        </button>
        <div className="w-10 h-10 rounded-full bg-primary-100 border-2 border-primary-200 flex items-center justify-center text-primary-700 text-lg font-bold flex-shrink-0">
          {profile.name?.charAt(0).toUpperCase()}
        </div>
        <div>
          <h1 className="text-xl font-bold text-surface-900">{profile.name}</h1>
          <p className="text-surface-400 text-sm">{profile.email}</p>
        </div>
        <div className="ml-auto flex gap-2 items-center">
          {profile.isActive
            ? <span className="badge badge-success">Active</span>
            : <span className="badge badge-danger">Inactive</span>}
          <button onClick={() => { loadProfile(); loadTopics(); loadSessions(); }} className="btn btn-secondary btn-sm">
            <RefreshCw size={13} />
          </button>
        </div>
      </div>

      {/* ── A: Profile ─────────────────────────────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <Section title="A. Profile">
          <StatRow label="Full Name"    value={profile.name} />
          <StatRow label="Email"        value={profile.email} />
          <StatRow label="Role"         value={<span className="badge badge-gray capitalize">{profile.role}</span>} />
          <StatRow label="Joined"       value={fmtDate(profile.createdAt)} />
          <StatRow label="Last Login"   value={fmtDateTime(profile.lastLoginAt)} />
          <StatRow label="Last Study"   value={analytics?.lastStudyDate ? fmtDate(analytics.lastStudyDate) : '—'} />
          <StatRow label="Preparation"  value={<span className="badge badge-gray capitalize">{profile.preparationLevel || '—'}</span>} />
          <StatRow label="Language"     value={<span className="capitalize">{profile.preferredLanguage || '—'}</span>} />
        </Section>

        <Section title="Education & Exams">
          <StatRow label="Status"       value={EDU_LABELS[profile.educationStatus] || '—'} />
          <StatRow label="Institution"  value={profile.institution || '—'} />
          <StatRow label="Degree/Course" value={profile.degree || '—'} />
          {['undergraduate', 'postgraduate', 'school_student'].includes(profile.educationStatus) && (
            <StatRow label="Year of Study" value={profile.yearOfStudy ? `Year ${profile.yearOfStudy}` : '—'} />
          )}
          {profile.educationStatus === 'working_professional' && (
            <>
              <StatRow label="Company"  value={profile.company || '—'} />
              <StatRow label="Job Role" value={profile.jobRole || '—'} />
            </>
          )}
          <StatRow label="Primary Exam" value={
            profile.targetExam
              ? <span className="badge badge-primary">{profile.targetExam.shortName}</span>
              : <span className="text-surface-400 text-xs">Not selected</span>
          } />
          {(profile.additionalExams || []).length > 0 && (
            <StatRow label="Additional Exams" value={
              <div className="flex gap-1 flex-wrap justify-end">
                {profile.additionalExams.map(e => (
                  <span key={e._id} className="badge badge-gray">{e.shortName}</span>
                ))}
              </div>
            } />
          )}
          <StatRow label="Target Score" value={profile.targetScore || '—'} />
          <StatRow label="Daily Goal"   value={profile.dailyStudyHours ? `${profile.dailyStudyHours}h/day` : '—'} />
        </Section>
      </div>

      {/* ── B: Performance Summary ─────────────────────────────────────── */}
      <Section title="B. Performance Summary">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Questions', value: fmt(analytics?.totalQuestionsAttempted), icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
            { label: 'Accuracy',  value: fmtPct(analytics?.overallAccuracy),      icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { label: 'Study Time', value: fmtTime(analytics?.totalStudyTime),     icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
            { label: 'Sessions',  value: fmt(analytics?.totalPracticeSessions),   icon: Activity, color: 'text-violet-600', bg: 'bg-violet-50' },
          ].map(({ label, value, icon: Icon, color, bg }) => (
            <div key={label} className="stat-card">
              <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center mb-1`}>
                <Icon size={15} className={color} />
              </div>
              <div className="stat-label">{label}</div>
              <div className="stat-value text-lg">{value}</div>
            </div>
          ))}
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <StatRow label="Total Correct"  value={fmt(analytics?.totalCorrect)}  icon={CheckCircle} color="text-emerald-600" />
            <StatRow label="Total Wrong"    value={fmt(analytics?.totalWrong)}    icon={XCircle}     color="text-red-500" />
            <StatRow label="Total Skipped"  value={fmt(analytics?.totalSkipped)}  icon={SkipForward} color="text-amber-600" />
          </div>
          <div>
            <StatRow label="Current Streak" value={`${analytics?.currentStreak || 0} days`}  icon={Award} color="text-orange-500" />
            <StatRow label="Longest Streak" value={`${analytics?.longestStreak || 0} days`}  icon={TrendingUp} color="text-primary-600" />
            <StatRow label="Mock Tests"     value={fmt(analytics?.totalMockTests)} icon={Target} color="text-violet-600" />
          </div>
        </div>

        <div className="text-xs text-surface-400 bg-surface-50 rounded-lg p-2">
          <strong>Accuracy definition:</strong> correct ÷ (correct + wrong) × 100 — skipped questions excluded from the denominator.
        </div>
      </Section>

      {/* ── C: Topic Performance ───────────────────────────────────────── */}
      <Section
        title="C. Topic-Level Performance"
        action={
          <div className="flex items-center gap-2">
            <input
              className="form-input text-xs py-1 px-2 w-36"
              placeholder="Search topic…"
              value={topicSearch}
              onChange={e => setTopicSearch(e.target.value)}
            />
            <button
              onClick={() => setShowWeakOnly(p => !p)}
              className={`btn btn-sm ${showWeakOnly ? 'btn-danger' : 'btn-secondary'}`}
            >
              {showWeakOnly ? 'Weak only' : 'All topics'}
            </button>
          </div>
        }
      >
        {topicLoading ? (
          <div className="skeleton h-32 rounded-xl" />
        ) : filteredTopics.length === 0 ? (
          <div className="empty-state py-8 text-sm">
            {showWeakOnly ? 'No weak topics found.' : 'No topic data yet.'}
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-surface-200 bg-surface-50">
                    <th className="text-left py-2 px-3 text-surface-500 font-medium">Topic</th>
                    <th className="text-left py-2 px-3 text-surface-500 font-medium hidden sm:table-cell">Subject</th>
                    <th className="text-center py-2 px-3 text-surface-500 font-medium">Attempted</th>
                    <th className="text-center py-2 px-3 text-surface-500 font-medium hidden md:table-cell">Correct</th>
                    <th className="text-center py-2 px-3 text-surface-500 font-medium hidden md:table-cell">Wrong</th>
                    <th className="text-center py-2 px-3 text-surface-500 font-medium">Accuracy</th>
                    <th className="text-center py-2 px-3 text-surface-500 font-medium hidden lg:table-cell">Last Practiced</th>
                    <th className="text-center py-2 px-3 text-surface-500 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTopics.map((t, i) => (
                    <tr key={t.topicId || i} className="border-b border-surface-100 hover:bg-surface-50">
                      <td className="py-2 px-3 font-medium text-surface-700">{t.topicName}</td>
                      <td className="py-2 px-3 text-surface-500 hidden sm:table-cell">{t.subjectName || '—'}</td>
                      <td className="py-2 px-3 text-center">{t.totalAttempted}</td>
                      <td className="py-2 px-3 text-center text-emerald-600 hidden md:table-cell">{t.totalCorrect}</td>
                      <td className="py-2 px-3 text-center text-red-500 hidden md:table-cell">{t.totalWrong}</td>
                      <td className="py-2 px-3 text-center"><AccBadge pct={t.accuracy} /></td>
                      <td className="py-2 px-3 text-center text-surface-400 text-xs hidden lg:table-cell">{fmtDate(t.lastPracticed)}</td>
                      <td className="py-2 px-3 text-center">
                        {t.isWeak
                          ? <span className="badge badge-danger text-xs">Weak</span>
                          : t.totalAttempted < 5
                            ? <span className="badge badge-gray text-xs">New</span>
                            : <span className="badge badge-success text-xs">OK</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-surface-400 bg-surface-50 rounded-lg p-2">
              <strong>Weak topic threshold:</strong> ≥5 attempts AND accuracy &lt;60%.
            </div>
          </>
        )}
      </Section>

      {/* ── D: Practice History ────────────────────────────────────────── */}
      <Section title="D. Practice History">
        {sessLoading ? (
          <div className="skeleton h-32 rounded-xl" />
        ) : sessions.length === 0 ? (
          <div className="empty-state py-8 text-sm">No completed practice sessions.</div>
        ) : (
          <>
            <div className="flex flex-col gap-2">
              {sessions.map(sess => {
                const expanded = expandedSession === sess._id;
                const review   = reviewData[sess._id];
                const isReviewLoading = reviewLoading === sess._id;
                return (
                  <div key={sess._id} className="border border-surface-200 rounded-xl overflow-hidden">
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-surface-50 transition-colors"
                      onClick={() => handleSessionExpand(sess)}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-surface-800">
                            {sess.exam?.shortName || '—'} / {sess.subject?.name || '—'}
                            {sess.topic ? ` / ${sess.topic.name}` : ''}
                          </span>
                          <span className={`badge text-xs diff-${sess.difficulty || 'medium'}`}>{sess.difficulty}</span>
                        </div>
                        <div className="text-xs text-surface-400 mt-0.5">
                          {fmtDateTime(sess.completedAt)} · {fmtTime(sess.result?.timeTaken)}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0 mr-2">
                        <div className="text-sm font-semibold text-surface-700">
                          {sess.result?.correct}/{sess.result?.totalQuestions}
                        </div>
                        <AccBadge pct={sess.result?.accuracy} />
                      </div>
                      {expanded ? <ChevronUp size={16} className="text-surface-400 flex-shrink-0" /> : <ChevronDown size={16} className="text-surface-400 flex-shrink-0" />}
                    </button>

                    {expanded && (
                      <div className="border-t border-surface-200 p-3 bg-surface-50/50">
                        {isReviewLoading ? (
                          <div className="skeleton h-12 rounded-lg" />
                        ) : !review ? (
                          <p className="text-surface-500 text-sm">Review data unavailable.</p>
                        ) : (
                          <>
                            <div className="grid grid-cols-4 gap-3 mb-3">
                              {[
                                { label: 'Attempted', value: review.result?.attempted },
                                { label: 'Correct',   value: review.result?.correct,   color: 'text-emerald-600' },
                                { label: 'Wrong',     value: review.result?.wrong,      color: 'text-red-500' },
                                { label: 'Skipped',   value: review.result?.skipped,    color: 'text-amber-600' },
                              ].map(({ label, value, color }) => (
                                <div key={label} className="text-center">
                                  <div className={`text-lg font-bold ${color || 'text-surface-800'}`}>{value ?? 0}</div>
                                  <div className="text-xs text-surface-400">{label}</div>
                                </div>
                              ))}
                            </div>
                            <div className="flex flex-col gap-1.5 max-h-64 overflow-y-auto">
                              {(review.attempts || []).map((att, qi) => (
                                <div key={qi} className={`p-2 rounded-lg text-xs border ${att.isSkipped ? 'bg-amber-50 border-amber-200' : att.isCorrect ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}>
                                  <div className="font-medium text-surface-700 mb-0.5">
                                    Q{qi + 1}: {att.questionSnapshot?.text || att.text || '(unavailable)'}
                                  </div>
                                  <div className="flex gap-3 text-surface-500">
                                    <span>Selected: <strong>{att.selectedAnswer || '—'}</strong></span>
                                    <span>Correct: <strong className="text-emerald-700">{att.correctAnswer}</strong></span>
                                    {att.isSkipped && <span className="text-amber-600">Skipped</span>}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {sessPag && sessPag.totalPages > 1 && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-surface-500">Page {sessPage} of {sessPag.totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setSessPage(p => p - 1)} disabled={sessPage === 1} className="btn btn-secondary btn-sm">Prev</button>
                  <button onClick={() => setSessPage(p => p + 1)} disabled={sessPage === sessPag.totalPages} className="btn btn-secondary btn-sm">Next</button>
                </div>
              </div>
            )}
          </>
        )}
      </Section>

      {/* ── E: Study Activity ──────────────────────────────────────────── */}
      <Section title="E. Study Activity">
        <div className="grid sm:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="stat-label">Current Streak</div>
            <div className="stat-value">{analytics?.currentStreak || 0} <span className="text-sm font-normal text-surface-400">days</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Longest Streak</div>
            <div className="stat-value">{analytics?.longestStreak || 0} <span className="text-sm font-normal text-surface-400">days</span></div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total Study Time</div>
            <div className="stat-value text-xl">{fmtTime(analytics?.totalStudyTime)}</div>
          </div>
        </div>

        <div className="text-xs text-surface-400 bg-surface-50 rounded-lg p-2">
          <strong>Streak definition:</strong> consecutive calendar days (UTC) with at least one completed practice session.
          Study time is the sum of <code>timeTaken</code> from all completed sessions.
          Signup alone does not count as study activity.
        </div>

        {analytics?.lastStudyDate && (
          <div className="flex items-center gap-2 text-sm text-surface-600">
            <Calendar size={14} />
            Last meaningful activity: <strong>{fmtDate(analytics.lastStudyDate)}</strong>
          </div>
        )}
      </Section>
    </div>
  );
}
