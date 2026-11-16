import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts';
import {
  Users, BookOpen, Zap, BarChart2, ChevronRight, Shield,
  TrendingUp, Clock, Target, CheckCircle, Wifi, WifiOff,
  Activity, Award, AlertCircle, RefreshCw,
} from 'lucide-react';
import { adminService } from '../../services';
import { useAdminSocket } from '../../hooks/useAdminSocket';

// ── Helpers ──────────────────────────────────────────────────────────────────
const fmt = (n) => (n ?? 0).toLocaleString();
const fmtTime = (sec) => {
  if (!sec) return '0m';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};
const fmtPct = (n) => `${Math.round(n ?? 0)}%`;

const CHART_COLORS = {
  primary: '#4f46e5',
  success: '#16a34a',
  warning: '#d97706',
  danger:  '#dc2626',
  muted:   '#94a3b8',
};

const EDU_LABELS = {
  school_student:       'School Student',
  undergraduate:        'Undergraduate',
  postgraduate:         'Postgraduate',
  working_professional: 'Working Professional',
  graduate_job_seeker:  'Job Seeker',
  other:                'Other',
  '':                   'Not specified',
};

const PIE_COLORS = ['#4f46e5','#7c3aed','#2563eb','#0891b2','#059669','#d97706','#94a3b8'];

// ── Summary Card ─────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, icon: Icon, color = 'text-primary-600', bg = 'bg-primary-50', highlight }) {
  return (
    <div className={`stat-card transition-all ${highlight ? 'ring-2 ring-primary-400 ring-offset-2' : ''}`}>
      <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-2 flex-shrink-0`}>
        <Icon size={17} className={color} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

// ── Period Selector ──────────────────────────────────────────────────────────
function PeriodSelector({ value, onChange }) {
  return (
    <div className="flex gap-1 bg-surface-100 rounded-lg p-0.5">
      {['7d', '30d', '90d'].map(p => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
            value === p
              ? 'bg-white text-surface-900 shadow-sm'
              : 'text-surface-500 hover:text-surface-700'
          }`}
        >
          {p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : '90 Days'}
        </button>
      ))}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function AdminDashboard() {
  const [data, setData]         = useState(null);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState('');
  const [period, setPeriod]     = useState('30d');
  const [connected, setConnected] = useState(false);
  // Counter for new live registrations this session (reset on full refresh)
  const [liveNew, setLiveNew]   = useState(0);

  // Use a ref to track the current period inside socket callbacks
  // (avoids stale closure without re-creating the socket)
  const periodRef = useRef(period);
  periodRef.current = period;

  // fetchData accepts explicit period to avoid stale closure
  const fetchData = useCallback(async (p) => {
    setLoading(true);
    setError('');
    try {
      const res = await adminService.getOverview({ period: p });
      setData(res.data.data);
      setLiveNew(0); // reset live counter on full refresh
    } catch (err) {
      const status = err.response?.status;
      if (status === 401) {
        setError('Session expired. Please log in again.');
      } else if (status === 403) {
        setError('Access denied. Admin privileges required.');
      } else if (status >= 500) {
        setError('Server error. Please try again in a moment.');
      } else if (!navigator.onLine || err.code === 'ECONNABORTED') {
        setError('Network error. Check your connection and retry.');
      } else {
        setError('Failed to load dashboard data. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  }, []); // No deps — receives period as argument

  // Fetch whenever period changes (single fetch, no double-trigger)
  useEffect(() => {
    fetchData(period);
  }, [period, fetchData]);

  // ── Socket.IO real-time ───────────────────────────────────────────────────
  useAdminSocket({
    onConnected: useCallback(() => {
      setConnected(true);
    }, []),

    onDisconnected: useCallback(() => {
      setConnected(false);
    }, []),

    onUserCreated: useCallback((payload) => {
      setConnected(true); // connection confirmed
      setLiveNew(prev => prev + 1);
      setData(prev => {
        if (!prev) return prev;
        const stats = { ...prev.stats };
        stats.totalUsers     = (stats.totalUsers || 0) + 1;
        stats.newUsersToday  = (stats.newUsersToday || 0) + 1;
        stats.newUsersPeriod = (stats.newUsersPeriod || 0) + 1;

        const recentUsers = prev.recentUsers
          ? [payload, ...prev.recentUsers].slice(0, 10)
          : [payload];

        // Update registration trend
        const today = new Date().toISOString().slice(0, 10);
        const trend = [...(prev.registrationTrend || [])];
        const todayEntry = trend.find(t => t.date === today);
        if (todayEntry) todayEntry.count += 1;
        else trend.push({ date: today, count: 1 });

        return { ...prev, stats, recentUsers, registrationTrend: trend };
      });
    }, []),

    onAnalyticsUpdated: useCallback((payload) => {
      setConnected(true);
      setData(prev => {
        if (!prev) return prev;
        const stats = { ...prev.stats };
        stats.totalCompletedSessions = (stats.totalCompletedSessions || 0) + 1;
        stats.platformAttempted      = (stats.platformAttempted || 0) + (payload.attempted || 0);

        // Update DAU trend
        const today = new Date().toISOString().slice(0, 10);
        const dau = [...(prev.dauTrend || [])];
        const todayEntry = dau.find(d => d.date === today);
        if (todayEntry) {
          todayEntry.sessions       = (todayEntry.sessions || 0) + 1;
          todayEntry.totalQuestions = (todayEntry.totalQuestions || 0) + (payload.attempted || 0);
          todayEntry.totalStudyTime = (todayEntry.totalStudyTime || 0) + (payload.studyTimeSec || 0);
        } else {
          dau.push({
            date: today,
            sessions: 1,
            activeUsers: 1,
            totalQuestions: payload.attempted || 0,
            totalStudyTime: payload.studyTimeSec || 0,
          });
        }
        return { ...prev, stats, dauTrend: dau };
      });
    }, []),

    onReconnected: useCallback(() => {
      // Refetch on reconnect to reconcile any missed events
      fetchData(periodRef.current);
    }, [fetchData]),
  });

  const s = data?.stats;

  // ── Summary cards config ──────────────────────────────────────────────────
  const summaryCards = s ? [
    { label: 'Total Students',      value: fmt(s.totalUsers),           sub: `+${fmt(s.newUsersToday)} today`,           icon: Users,        color: 'text-blue-600',    bg: 'bg-blue-50',    highlight: liveNew > 0 },
    { label: `New (${period})`,     value: fmt(s.newUsersPeriod),       sub: `${fmt(s.activeUsersPeriod)} active`,        icon: TrendingUp,   color: 'text-violet-600',  bg: 'bg-violet-50' },
    { label: 'Active Today',        value: fmt(s.activeUsersToday),     sub: 'Completed ≥1 session',                      icon: Activity,     color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Questions Attempted', value: fmt(s.platformAttempted),    sub: `${fmt(s.totalCompletedSessions)} sessions`,  icon: BookOpen,     color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: 'Overall Accuracy',    value: fmtPct(s.platformAccuracy),  sub: 'Correct / attempted',                       icon: CheckCircle,  color: 'text-green-600',   bg: 'bg-green-50' },
    { label: 'Total Study Time',    value: fmtTime(s.platformStudyTime), sub: `Avg ${fmtTime(s.avgStudyTime)} / user`,    icon: Clock,        color: 'text-sky-600',     bg: 'bg-sky-50' },
    { label: 'Active Streaks',      value: fmt(s.streakCount),          sub: 'Users with streak > 0',                     icon: Award,        color: 'text-orange-600',  bg: 'bg-orange-50' },
    { label: 'Incomplete Profiles', value: fmt(s.incompleteProfiles),   sub: 'No exam or education status',               icon: AlertCircle,  color: 'text-red-600',     bg: 'bg-red-50' },
  ] : [];

  return (
    <div className="flex flex-col gap-6">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Shield size={20} className="text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-surface-900">Admin Dashboard</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <p className="text-surface-500 text-sm">Real-time platform analytics</p>
              {connected
                ? <span className="flex items-center gap-1 text-xs text-emerald-600"><Wifi size={11} /> Live</span>
                : <span className="flex items-center gap-1 text-xs text-surface-400"><WifiOff size={11} /> {loading ? 'Loading…' : 'Offline'}</span>
              }
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <button onClick={() => fetchData(period)} className="btn btn-secondary btn-sm" title="Refresh">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {liveNew > 0 && (
        <div className="alert alert-success">
          <Activity size={14} className="flex-shrink-0" />
          <span>{liveNew} new registration{liveNew > 1 ? 's' : ''} since last refresh — stats updated live.</span>
          <button onClick={() => fetchData(period)} className="ml-auto btn btn-secondary btn-sm">Refresh now</button>
        </div>
      )}

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => fetchData(period)} className="ml-auto btn btn-secondary btn-sm">Retry</button>
        </div>
      )}

      {/* ── Summary Cards ──────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="skeleton h-28 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {summaryCards.map(c => <StatCard key={c.label} {...c} />)}
        </div>
      )}

      {/* ── Charts Row 1: Registrations + DAU ──────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4 text-sm">Registrations Over Time</h2>
          {loading ? <div className="skeleton h-48 rounded-xl" /> : (
            data?.registrationTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data.registrationTrend} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <defs>
                    <linearGradient id="regGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.primary} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART_COLORS.primary} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                    formatter={(v) => [v, 'New users']}
                  />
                  <Area type="monotone" dataKey="count" stroke={CHART_COLORS.primary} fill="url(#regGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state h-48 text-sm">No registrations in this period.</div>
            )
          )}
        </div>

        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4 text-sm">Daily Active Users</h2>
          {loading ? <div className="skeleton h-48 rounded-xl" /> : (
            data?.dauTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.dauTrend} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [v, name === 'activeUsers' ? 'Active users' : name]}
                  />
                  <Bar dataKey="activeUsers" fill={CHART_COLORS.primary} radius={[3, 3, 0, 0]} maxBarSize={24} name="Active users" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state h-48 text-sm">No activity in this period.</div>
            )
          )}
        </div>
      </div>

      {/* ── Charts Row 2: Questions + Study Time ────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4 text-sm">Questions Attempted Per Day</h2>
          {loading ? <div className="skeleton h-48 rounded-xl" /> : (
            data?.dauTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data.dauTrend} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <defs>
                    <linearGradient id="qGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.success} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART_COLORS.success} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} />
                  <Area type="monotone" dataKey="totalQuestions" stroke={CHART_COLORS.success} fill="url(#qGrad)" strokeWidth={2} dot={false} name="Questions" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state h-48 text-sm">No activity in this period.</div>
            )
          )}
        </div>

        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4 text-sm">Study Time Per Day (hours)</h2>
          {loading ? <div className="skeleton h-48 rounded-xl" /> : (
            data?.dauTrend?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <AreaChart data={data.dauTrend.map(d => ({ ...d, hours: +(d.totalStudyTime / 3600).toFixed(1) }))} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                  <defs>
                    <linearGradient id="stGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_COLORS.warning} stopOpacity={0.15} />
                      <stop offset="95%" stopColor={CHART_COLORS.warning} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                  <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={d => d.slice(5)} />
                  <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} formatter={(v) => [`${v}h`, 'Study time']} />
                  <Area type="monotone" dataKey="hours" stroke={CHART_COLORS.warning} fill="url(#stGrad)" strokeWidth={2} dot={false} name="Study hours" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state h-48 text-sm">No study time recorded in this period.</div>
            )
          )}
        </div>
      </div>

      {/* ── Charts Row 3: Exam Popularity + Education Distribution ──────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4 text-sm">Exam Popularity</h2>
          {loading ? <div className="skeleton h-48 rounded-xl" /> : (
            data?.examPopularity?.length > 0 ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={data.examPopularity} layout="vertical" margin={{ top: 5, right: 20, bottom: 5, left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
                  <YAxis type="category" dataKey="shortName" tick={{ fontSize: 10, fill: '#64748b' }} width={60} />
                  <Tooltip contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }} formatter={v => [v, 'Students']} />
                  <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[0, 3, 3, 0]} maxBarSize={16} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state h-48 text-sm">No exam data yet.</div>
            )
          )}
        </div>

        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4 text-sm">Education / Employment Status</h2>
          {loading ? <div className="skeleton h-48 rounded-xl" /> : (
            data?.educationDist?.length > 0 ? (
              <div className="flex items-center gap-4">
                <ResponsiveContainer width="50%" height={160}>
                  <PieChart>
                    <Pie data={data.educationDist} dataKey="count" nameKey="_id" cx="50%" cy="50%" outerRadius={65} stroke="none">
                      {data.educationDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v, n) => [v, EDU_LABELS[n] || n]} contentStyle={{ fontSize: 12, borderRadius: 8 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                  {data.educationDist.slice(0, 6).map((d, i) => (
                    <div key={d._id} className="flex items-center gap-2 text-xs">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                      <span className="text-surface-600 truncate">{EDU_LABELS[d._id] || 'Other'}</span>
                      <span className="ml-auto font-semibold text-surface-800">{d.count}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="empty-state h-48 text-sm">No education data collected yet.</div>
            )
          )}
        </div>
      </div>

      {/* ── Topic Performance + Recent Users ───────────────────────────── */}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="card">
          <h2 className="text-surface-800 font-semibold mb-4 text-sm">Top Topics by Attempts</h2>
          {loading ? <div className="skeleton h-48 rounded-xl" /> : (
            data?.topicPerf?.length > 0 ? (
              <div className="flex flex-col gap-2 overflow-auto max-h-64">
                {data.topicPerf.slice(0, 10).map((t, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-surface-400 w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-medium text-surface-700 truncate">{t.topicName || 'Unknown'}</div>
                      <div className="progress-bar mt-1">
                        <div className="progress-fill" style={{
                          width: `${Math.round((t.accuracy || 0))}%`,
                          background: t.accuracy < 50 ? CHART_COLORS.danger : t.accuracy < 70 ? CHART_COLORS.warning : CHART_COLORS.success,
                        }} />
                      </div>
                    </div>
                    <div className="text-xs text-right flex-shrink-0">
                      <div className="font-semibold text-surface-800">{Math.round(t.accuracy || 0)}%</div>
                      <div className="text-surface-400">{t.totalAttempted} att.</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state h-48 text-sm">No topic data yet.</div>
            )
          )}
        </div>

        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-surface-800 font-semibold text-sm">Recent Registrations</h2>
            <Link to="/admin/users" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>
          {loading ? (
            <div className="flex flex-col gap-2">{[...Array(5)].map((_, i) => <div key={i} className="skeleton h-12 rounded-lg" />)}</div>
          ) : data?.recentUsers?.length === 0 ? (
            <div className="empty-state text-sm">No students yet.</div>
          ) : (
            <div className="flex flex-col gap-2 overflow-auto max-h-64">
              {(data?.recentUsers || []).map(u => (
                <Link key={u._id} to={`/admin/users/${u._id}`}
                  className="flex items-center gap-3 p-2.5 rounded-lg bg-surface-50 border border-surface-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all group">
                  <div className="w-7 h-7 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                    {u.name?.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-surface-700 truncate group-hover:text-primary-700 font-medium">{u.name}</div>
                    <div className="text-xs text-surface-400 truncate">{u.email}</div>
                  </div>
                  {u.targetExam && (
                    <span className="badge badge-primary text-xs">{u.targetExam.shortName}</span>
                  )}
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Quick Links ─────────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-surface-800 font-semibold mb-4 text-sm">Quick Management</h2>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { to: '/admin/exams',     label: 'Manage Exams',     icon: Zap,      desc: 'Add/edit exams, subjects, topics' },
            { to: '/admin/questions', label: 'Manage Questions',  icon: BookOpen, desc: 'Create, edit, approve questions' },
            { to: '/admin/users',     label: 'Manage Users',      icon: Users,    desc: 'View analytics and manage accounts' },
          ].map(({ to, label, icon: Icon, desc }) => (
            <Link key={to} to={to}
              className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 border border-surface-200 hover:border-primary-300 hover:bg-primary-50/30 transition-all group">
              <Icon size={16} className="text-primary-500 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-surface-700 group-hover:text-primary-700">{label}</div>
                <div className="text-xs text-surface-400">{desc}</div>
              </div>
              <ChevronRight size={14} className="text-surface-400 group-hover:text-primary-600" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
