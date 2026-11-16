import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  BarChart2, TrendingUp, Target, BookOpen, Clock,
  CheckCircle, XCircle, AlertTriangle, Flame, Calendar, Eye
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';
import { progressService, practiceService } from '../services';
import { useAuth } from '../context/AuthContext';

// ── Configurable thresholds (must match analytics.routes.js) ─────────────────
const WEAK_MIN_ATTEMPTS = 5;
const WEAK_ACCURACY_PCT = 60;

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white border border-surface-200 rounded-lg p-3 text-sm shadow-md">
        <div className="text-surface-700 font-medium mb-1">{label}</div>
        {payload.map(p => (
          <div key={p.dataKey} style={{ color: p.color }}>
            {p.name}: {p.value}{p.dataKey.includes('accuracy') || p.dataKey === 'accuracy' ? '%' : ''}
          </div>
        ))}
      </div>
    );
  }
  return null;
};

function MasteryBadge({ level }) {
  const config = {
    strong:      { class: 'badge-success', label: 'Strong' },
    average:     { class: 'badge-warning', label: 'Average' },
    weak:        { class: 'badge-danger',  label: 'Weak' },
    not_started: { class: 'badge-gray',    label: 'Not Started' },
  };
  const c = config[level] || config.not_started;
  return <span className={`badge ${c.class}`}>{c.label}</span>;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(secs) {
  if (!secs) return '0 min';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

export default function Analytics() {
  const { user } = useAuth();
  const [progress, setProgress]         = useState(null);
  const [recentSessions, setRecentSessions] = useState([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  useEffect(() => {
    const examId = user?.targetExam?._id || user?.targetExam;
    Promise.all([
      progressService.getMyProgress(examId ? { examId } : {}),
      practiceService.getMySessions({ limit: 8 }),
    ])
      .then(([progressRes, sessionsRes]) => {
        setProgress(progressRes.data.data.progress);
        setRecentSessions(sessionsRes.data.data.sessions || []);
      })
      .catch(err => setError(err.response?.data?.message || 'Failed to load analytics.'))
      .finally(() => setLoading(false));
  }, [user]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-surface-900">Analytics</h1>
        <div className="alert alert-error"><AlertTriangle size={15} /><span>{error}</span></div>
      </div>
    );
  }

  if (!progress) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-bold text-surface-900">Analytics</h1>
        <div className="card">
          <div className="empty-state">
            <BarChart2 size={36} className="opacity-30" />
            <div>
              <div className="text-surface-700 font-semibold">No analytics yet</div>
              <div className="text-surface-500 text-sm">Complete practice sessions to see your performance data.</div>
            </div>
            <Link to="/practice" className="btn btn-primary btn-sm">Start Practicing</Link>
          </div>
        </div>
      </div>
    );
  }

  // ── Safe name resolvers ───────────────────────────────────────────────────
  function resolveTopicName(tp) {
    if (!tp) return 'Topic unavailable';
    const liveObj = tp.topic;
    if (liveObj && typeof liveObj === 'object' && liveObj.name) return liveObj.name;
    if (tp.topicName) return tp.topicName;
    return 'Unknown topic';
  }
  function resolveSubjectName(sp) {
    if (!sp) return 'Subject unavailable';
    const liveObj = sp.subject;
    if (liveObj && typeof liveObj === 'object' && liveObj.name) return liveObj.name;
    if (sp.subjectName) return sp.subjectName;
    return 'Unknown subject';
  }
  function topicKey(tp) {
    if (tp.topic && typeof tp.topic === 'object' && tp.topic._id) return tp.topic._id.toString();
    if (tp.topic && typeof tp.topic !== 'object') return tp.topic.toString();
    return `no-id-${resolveTopicName(tp)}`;
  }

  // Compute weak topics from topicProgress (consistent with backend thresholds)
  const weakTopics = (progress.topicProgress || []).filter(tp => {
    const answered = (tp.totalCorrect || 0) + (tp.totalWrong || 0);
    return (
      (tp.totalCorrect + tp.totalWrong + tp.totalSkipped) >= WEAK_MIN_ATTEMPTS &&
      tp.accuracy < WEAK_ACCURACY_PCT
    );
  });

  const topicChartData = (progress.topicProgress || [])
    .filter(t => t.totalAttempted > 0)
    .sort((a, b) => a.accuracy - b.accuracy)
    .slice(0, 10)
    .map(t => ({
      name: resolveTopicName(t),
      accuracy: t.accuracy,
      attempts: t.totalAttempted,
    }));

  const subjectChartData = (progress.subjectProgress || [])
    .filter(s => s.totalAttempted > 0)
    .map(s => ({
      name: resolveSubjectName(s),
      accuracy: s.accuracy,
      attempts: s.totalAttempted,
    }));

  const totalAnswered = (progress.totalCorrect || 0) + (progress.totalWrong || 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-surface-900">Performance Analytics</h1>
        <p className="text-surface-500 text-sm mt-1">Track your preparation progress and identify areas for improvement.</p>
      </div>

      {/* ─── Overview Stats ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { icon: BookOpen,   label: 'Questions Solved',  value: progress.totalQuestionsAttempted || 0, color: 'text-blue-600',   bg: 'bg-blue-50' },
          { icon: Target,     label: 'Overall Accuracy',  value: `${progress.overallAccuracy || 0}%`,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { icon: TrendingUp, label: 'Correct Answers',   value: progress.totalCorrect || 0,            color: 'text-violet-600', bg: 'bg-violet-50' },
          { icon: Clock,      label: 'Study Time',        value: formatTime(progress.totalStudyTime),   color: 'text-amber-600',  bg: 'bg-amber-50' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className="stat-card">
            <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-2`}>
              <Icon size={17} className={color} />
            </div>
            <div className="stat-label">{label}</div>
            <div className="stat-value">{value}</div>
          </div>
        ))}
      </div>

      {/* ─── Streak + Sessions ──────────────────────────────────────────────── */}
      <div className="grid sm:grid-cols-3 gap-4">
        <div className="stat-card flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
            <Flame size={18} className="text-amber-500" />
          </div>
          <div>
            <div className="stat-label">Current Streak</div>
            <div className="stat-value">{progress.currentStreak || 0} days</div>
            {progress.longestStreak > 0 && (
              <div className="text-xs text-surface-400 mt-0.5">Best: {progress.longestStreak} days</div>
            )}
          </div>
        </div>
        <div className="stat-card flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
            <Calendar size={18} className="text-blue-500" />
          </div>
          <div>
            <div className="stat-label">Sessions Completed</div>
            <div className="stat-value">{progress.totalPracticeSessions || 0}</div>
          </div>
        </div>
        <div className="stat-card flex-row items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
            <AlertTriangle size={18} className="text-red-500" />
          </div>
          <div>
            <div className="stat-label">Weak Topics</div>
            <div className="stat-value">{weakTopics.length}</div>
            {weakTopics.length > 0 && (
              <div className="text-xs text-surface-400 mt-0.5">Need attention</div>
            )}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        {/* ─── Topic Accuracy Chart ──────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4">Topic Accuracy (Bottom 10)</h2>
          {topicChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={Math.max(180, topicChartData.length * 28)}>
              <BarChart data={topicChartData} layout="vertical" margin={{ left: 0, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                <XAxis type="number" domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#475569', fontSize: 10 }} width={100} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="accuracy" name="Accuracy" fill="#4f46e5" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="empty-state h-40">
              <BarChart2 size={24} className="opacity-30" />
              <span className="text-surface-500 text-sm">No topic data yet — start practicing!</span>
            </div>
          )}
        </div>

        {/* ─── Overall Breakdown ─────────────────────────────────────────────── */}
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4">Overall Breakdown</h2>
          {totalAnswered === 0 ? (
            <div className="empty-state h-40">
              <Target size={24} className="opacity-30" />
              <span className="text-surface-500 text-sm">No attempts yet</span>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {[
                { label: 'Correct',  value: progress.totalCorrect,  color: 'bg-emerald-500', icon: CheckCircle,  iconColor: 'text-emerald-600' },
                { label: 'Wrong',    value: progress.totalWrong,    color: 'bg-red-500',     icon: XCircle,      iconColor: 'text-red-600' },
                { label: 'Skipped',  value: progress.totalSkipped,  color: 'bg-surface-400', icon: AlertTriangle, iconColor: 'text-surface-500' },
              ].map(({ label, value, color, icon: Icon, iconColor }) => {
                const denominator = progress.totalQuestionsAttempted || 1;
                const pct = Math.round(((value || 0) / denominator) * 100);
                return (
                  <div key={label}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <Icon size={13} className={iconColor} />
                        <span className="text-sm text-surface-700">{label}</span>
                      </div>
                      <div className="text-sm font-semibold text-surface-800">
                        {value || 0} <span className="text-surface-400 font-normal">({pct}%)</span>
                      </div>
                    </div>
                    <div className="progress-bar">
                      <div className={`progress-fill ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ─── Subject Performance ────────────────────────────────────────────── */}
      {subjectChartData.length > 0 && (
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4">Subject Performance</h2>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={subjectChartData} margin={{ left: 0, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" tick={{ fill: '#475569', fontSize: 11 }} />
              <YAxis domain={[0, 100]} tick={{ fill: '#64748b', fontSize: 11 }} tickFormatter={v => `${v}%`} />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="accuracy" name="Accuracy" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ─── Weak Topics ────────────────────────────────────────────────────── */}
      {weakTopics.length > 0 && (
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-surface-800 font-semibold">Weak Topics</h2>
            <span className="text-xs text-surface-500">
              Below {WEAK_ACCURACY_PCT}% accuracy with ≥{WEAK_MIN_ATTEMPTS} attempts
            </span>
          </div>
          <div className="flex flex-col gap-2">
            {weakTopics.map(tp => (
              <div key={topicKey(tp)} className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                <div>
                  <div className="text-sm font-medium text-surface-700">{resolveTopicName(tp)}</div>
                  <div className="text-xs text-red-500 mt-0.5">
                    {tp.accuracy}% accuracy · {tp.totalCorrect}/{tp.totalCorrect + tp.totalWrong} correct · {tp.totalAttempted} total
                  </div>
                </div>
                <Link
                  to="/practice"
                  state={{ topicId: topicKey(tp), topicName: resolveTopicName(tp) }}
                  className="btn btn-secondary btn-sm text-xs flex-shrink-0 ml-3"
                >
                  <BookOpen size={12} /> Practice
                </Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ─── Topic Progress Table ────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-surface-800 font-semibold mb-4">Topic-Level Progress</h2>
        {(progress.topicProgress || []).filter(t => t.totalAttempted > 0).length === 0 ? (
          <div className="empty-state py-8">
            <BookOpen size={28} className="opacity-30" />
            <span className="text-surface-500 text-sm">No topic data yet. Start practicing!</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-surface-200">
                  <th className="text-left py-2 px-3 text-surface-500 font-medium">Topic</th>
                  <th className="text-right py-2 px-3 text-surface-500 font-medium">Attempted</th>
                  <th className="text-right py-2 px-3 text-surface-500 font-medium">Correct</th>
                  <th className="text-right py-2 px-3 text-surface-500 font-medium">Accuracy</th>
                  <th className="text-right py-2 px-3 text-surface-500 font-medium">Mastery</th>
                </tr>
              </thead>
              <tbody>
                {(progress.topicProgress || [])
                  .filter(t => t.totalAttempted > 0)
                  .sort((a, b) => a.accuracy - b.accuracy)
                  .map((tp) => (
                    <tr key={topicKey(tp)} className="border-b border-surface-200/70 hover:bg-surface-50 transition-colors">
                      <td className="py-2.5 px-3 text-surface-700">{resolveTopicName(tp)}</td>
                      <td className="py-2.5 px-3 text-right text-surface-500">{tp.totalAttempted}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-600">{tp.totalCorrect}</td>
                      <td className="py-2.5 px-3 text-right">
                        <span className={`font-semibold ${
                          tp.accuracy >= 70 ? 'text-emerald-400' :
                          tp.accuracy >= 50 ? 'text-amber-400' : 'text-red-400'
                        }`}>{tp.accuracy}%</span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <MasteryBadge level={tp.masteryLevel} />
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─── Recent Sessions ────────────────────────────────────────────────── */}
      {recentSessions.length > 0 && (
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4">Recent Sessions</h2>
          <div className="flex flex-col gap-2">
            {recentSessions.map(s => (
              <div key={s._id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 border border-surface-200 hover:border-surface-300 transition-colors">
                <div className="w-10 h-10 rounded-lg bg-primary-50 border border-primary-100 flex items-center justify-center flex-shrink-0">
                  <BookOpen size={15} className="text-primary-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-surface-700 truncate">
                    {s.subject?.name || 'Practice'}{s.topic?.name ? ` — ${s.topic.name}` : ''}
                  </div>
                  <div className="text-xs text-surface-400">
                    {s.exam?.shortName} · {formatDate(s.completedAt)} · {s.result?.totalQuestions} Q
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`badge text-xs ${
                    (s.result?.accuracy || 0) >= 70 ? 'badge-success' :
                    (s.result?.accuracy || 0) >= 50 ? 'badge-warning' : 'badge-danger'
                  }`}>
                    {s.result?.accuracy || 0}%
                  </span>
                  <Link to={`/practice/result/${s._id}`} className="text-surface-400 hover:text-surface-600" title="View result">
                    <Eye size={14} />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
