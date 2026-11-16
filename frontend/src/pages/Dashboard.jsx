import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import {
  BookOpen, Target, BarChart2, Flame, Clock,
  AlertTriangle, ChevronRight, TrendingUp, Brain, Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { analyticsService } from '../services';

function StatCard({ icon: Icon, label, value, sub, color = 'text-primary-600', iconBg = 'bg-primary-50' }) {
  return (
    <div className="stat-card">
      <div className={`w-9 h-9 rounded-lg ${iconBg} flex items-center justify-center mb-3`}>
        <Icon size={18} className={color} />
      </div>
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {sub && <div className="stat-sub">{sub}</div>}
    </div>
  );
}

function formatTime(seconds) {
  if (!seconds) return '0 min';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}

export default function Dashboard() {
  const { user, isAdmin } = useAuth();
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Admins should not reach this page — ProtectedRoute guards it,
    // but skip the API call if somehow an admin lands here.
    if (isAdmin) return;
    analyticsService.getDashboard()
      .then(res => setAnalytics(res.data.data.analytics))
      .catch(err => setError(err.response?.data?.message || 'Failed to load dashboard.'))
      .finally(() => setLoading(false));
  }, [isAdmin]);

  // After hooks: safe to render a redirect for admin
  if (isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  const hasExam = !!user?.targetExam;

  return (
    <div className="flex flex-col gap-6">
      {/* ─── Welcome Header ──────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">
            Welcome back, {user?.name?.split(' ')[0] || 'Student'} 👋
          </h1>
          <p className="text-surface-500 text-sm mt-1">
            {hasExam
              ? `Preparing for ${user.targetExam?.shortName || user.targetExam?.name} — Keep it up!`
              : 'Select your target exam to get personalized preparation.'}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/practice" className="btn btn-primary btn-sm">
            <BookOpen size={15} />
            Start Practice
          </Link>
          <Link to="/ai-tutor" className="btn btn-secondary btn-sm">
            <Brain size={15} />
            Ask AI
          </Link>
        </div>
      </div>

      {/* ─── No Exam Banner ───────────────────────────────────────────────────── */}
      {!hasExam && (
        <div className="alert alert-info">
          <Zap size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold">No exam selected yet</div>
            <div className="text-xs mt-0.5 opacity-80">
              <Link to="/profile" className="underline underline-offset-2">Update your profile</Link>{' '}
              to select your target exam and get personalized content.
            </div>
          </div>
        </div>
      )}

      {/* ─── Stats Grid ───────────────────────────────────────────────────────── */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="stat-card">
              <div className="skeleton w-9 h-9 rounded-lg mb-3" />
              <div className="skeleton h-3 w-20 mb-2 rounded" />
              <div className="skeleton h-7 w-12 rounded" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={BookOpen} label="Questions Solved" value={analytics?.totalQuestions || 0}
            color="text-blue-600" iconBg="bg-blue-50" />
          <StatCard icon={Target} label="Overall Accuracy"
            value={`${analytics?.overallAccuracy || 0}%`}
            sub={analytics?.totalQuestions > 0 ? 'Calculated from attempts' : 'No attempts yet'}
            color="text-emerald-600" iconBg="bg-emerald-50" />
          <StatCard icon={Flame} label="Study Streak"
            value={`${analytics?.currentStreak || 0} days`}
            sub={analytics?.longestStreak ? `Best: ${analytics.longestStreak} days` : 'Start today!'}
            color="text-amber-600" iconBg="bg-amber-50" />
          <StatCard icon={Clock} label="Study Time"
            value={formatTime(analytics?.totalStudyTime)}
            sub={`${analytics?.totalPracticeSessions || 0} sessions`}
            color="text-violet-600" iconBg="bg-violet-50" />
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* ─── Recent Sessions ────────────────────────────────────────────────── */}
        <div className="md:col-span-2 card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-surface-800 font-semibold">Recent Practice Sessions</h2>
            <Link to="/practice" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              View all <ChevronRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="skeleton w-10 h-10 rounded-lg" />
                  <div className="flex-1">
                    <div className="skeleton h-3.5 w-32 rounded mb-1.5" />
                    <div className="skeleton h-3 w-24 rounded" />
                  </div>
                  <div className="skeleton h-6 w-12 rounded-full" />
                </div>
              ))}
            </div>
          ) : analytics?.recentSessions?.length > 0 ? (
            <div className="flex flex-col gap-2">
              {analytics.recentSessions.map((session) => (
                <div key={session._id} className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 border border-surface-200 hover:border-surface-300 transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                    <BookOpen size={16} className="text-primary-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-700 truncate">
                      {session.subject?.name || 'Practice'} — {session.topic?.name || 'Mixed'}
                    </div>
                    <div className="text-xs text-surface-500">
                      {session.exam?.shortName} · {formatDate(session.completedAt)}
                    </div>
                  </div>
                  <div className={`badge text-xs ${
                    session.result?.accuracy >= 70 ? 'badge-success' :
                    session.result?.accuracy >= 50 ? 'badge-warning' : 'badge-danger'
                  }`}>
                    {session.result?.accuracy || 0}%
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state py-8">
              <BookOpen size={32} className="opacity-30" />
              <div>
                <div className="text-surface-400 font-medium">No practice sessions yet</div>
                <div className="text-surface-600 text-sm">Start practicing to see your history here</div>
              </div>
              <Link to="/practice" className="btn btn-primary btn-sm mt-2">Start Practice</Link>
            </div>
          )}
        </div>

        {/* ─── Weak Topics ────────────────────────────────────────────────────── */}
        <div className="card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-surface-800 font-semibold">Weak Topics</h2>
            <Link to="/analytics" className="text-xs text-primary-600 hover:text-primary-700 flex items-center gap-1">
              Analytics <ChevronRight size={12} />
            </Link>
          </div>

          {loading ? (
            <div className="flex flex-col gap-2">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="skeleton h-10 rounded-lg" />
              ))}
            </div>
          ) : analytics?.weakTopics?.length > 0 ? (
            <div className="flex flex-col gap-2">
              {analytics.weakTopics.slice(0, 5).map((topic, i) => (
                <div key={topic._id || i} className="flex items-center justify-between p-2.5 rounded-lg bg-red-50 border border-red-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                    <div className="min-w-0">
                      <span className="text-sm text-surface-700 truncate block">{topic.name}</span>
                      <span className="text-xs text-red-500">{topic.accuracy}% · {topic.totalAttempted} attempted</span>
                    </div>
                  </div>
                  <Link
                    to="/practice"
                    state={{ topicId: topic._id, topicName: topic.name }}
                    className="text-xs text-primary-600 hover:text-primary-700 flex-shrink-0 ml-2"
                  >
                    Practice
                  </Link>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state py-6">
              <TrendingUp size={28} className="opacity-30 text-surface-400" />
              <div className="text-sm text-surface-500">
                {analytics?.totalQuestions > 0
                  ? 'No weak topics identified yet!'
                  : 'Practice to identify weak areas'}
              </div>
            </div>
          )}

          <div className="divider my-3" />
          <Link to="/ai-tutor" className="btn btn-secondary btn-sm w-full">
            <Brain size={14} />
            Ask AI Tutor for Help
          </Link>
        </div>
      </div>

      {/* ─── Quick Actions ─────────────────────────────────────────────────────── */}
      <div className="card">
        <h2 className="text-surface-800 font-semibold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { to: '/practice', icon: BookOpen, label: 'Practice Questions', color: 'text-blue-600', bg: 'bg-blue-50' },
            { to: '/study-plan', icon: Target, label: 'Study Plan', color: 'text-emerald-600', bg: 'bg-emerald-50' },
            { to: '/analytics', icon: BarChart2, label: 'View Analytics', color: 'text-violet-600', bg: 'bg-violet-50' },
            { to: '/mistakes', icon: AlertTriangle, label: 'Review Mistakes', color: 'text-rose-600', bg: 'bg-rose-50' },
          ].map(({ to, icon: Icon, label, color, bg }) => (
            <Link key={to} to={to}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-surface-50 border border-surface-200 hover:border-surface-300 text-center transition-all hover:-translate-y-0.5 group">
              <div className={`w-10 h-10 rounded-lg ${bg} flex items-center justify-center`}>
                <Icon size={18} className={color} />
              </div>
              <span className="text-xs font-medium text-surface-500 group-hover:text-surface-700 transition-colors leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
