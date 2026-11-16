import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Calendar, Target, Clock, BookOpen, CheckCircle, Circle,
  ChevronRight, Brain, TrendingUp, Loader2, AlertCircle, Zap
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { studyPlanService } from '../services';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

function daysUntil(dateStr) {
  if (!dateStr) return null;
  const diff = new Date(dateStr) - new Date();
  return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
}

function SessionCard({ session, onComplete, completing }) {
  const typeConfig = {
    study:    { color: 'text-blue-600',   bg: 'bg-blue-50',   border: 'border-blue-200',   icon: BookOpen },
    practice: { color: 'text-violet-600', bg: 'bg-violet-50', border: 'border-violet-200', icon: Target },
    revision: { color: 'text-amber-600',  bg: 'bg-amber-50',  border: 'border-amber-200',  icon: TrendingUp },
  };
  const config = typeConfig[session.type] || typeConfig.study;
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border ${session.isCompleted ? 'opacity-60 border-surface-200 bg-surface-100' : `${config.border} ${config.bg}`} transition-all`}>
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${config.bg} border ${config.border}`}>
        <Icon size={15} className={config.color} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-surface-700 truncate">{session.topic?.name || session.subject?.name || 'Study Session'}</div>
        <div className="flex items-center gap-2 text-xs text-surface-500 mt-0.5">
          <span className="capitalize">{session.type?.replace('_', ' ')}</span>
          <span className="text-surface-400">·</span>
          <span>{session.duration} min</span>
        </div>
      </div>
      {session.isCompleted ? (
        <CheckCircle size={16} className="text-emerald-400 flex-shrink-0" />
      ) : completing ? (
        <Loader2 size={16} className="animate-spin text-surface-400 flex-shrink-0" />
      ) : (
        <button
          onClick={() => onComplete(session._id)}
          className="btn btn-secondary btn-sm flex-shrink-0 text-xs"
          disabled={completing}
        >
          Done
        </button>
      )}
    </div>
  );
}

export default function StudyPlan() {
  const { user } = useAuth();
  const [plan, setPlan] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [selectedDay, setSelectedDay] = useState(0);
  const [completingIds, setCompletingIds] = useState(new Set()); // tracks in-flight completion requests

  const [genForm, setGenForm] = useState({
    examDate: user?.targetExamDate?.split('T')[0] || '',
    targetScore: user?.targetScore || '',
    dailyHours: user?.dailyStudyHours || 2,
  });

  useEffect(() => {
    studyPlanService.getCurrent()
      .then(r => {
        const p = r.data.data.plan;
        setPlan(p);
        // Auto-select today's day if the plan has a matching date
        if (p && p.dailyPlans) {
          const todayStr = new Date().toDateString();
          const todayIdx = p.dailyPlans.findIndex(
            d => new Date(d.date).toDateString() === todayStr
          );
          if (todayIdx >= 0) setSelectedDay(todayIdx);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    if (!user?.targetExam) {
      setError('Please set your target exam in Profile first.');
      return;
    }
    setGenerating(true);
    setError('');
    try {
      const res = await studyPlanService.generate({
        examId: user.targetExam?._id || user.targetExam,
        examDate: genForm.examDate || null,
        targetScore: genForm.targetScore ? Number(genForm.targetScore) : null,
        dailyHours: Number(genForm.dailyHours),
      });
      const p = res.data.data.plan;
      setPlan(p);
      // Auto-select today after generation
      if (p && p.dailyPlans) {
        const todayStr = new Date().toDateString();
        const todayIdx = p.dailyPlans.findIndex(
          d => new Date(d.date).toDateString() === todayStr
        );
        setSelectedDay(todayIdx >= 0 ? todayIdx : 0);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate study plan.');
    } finally {
      setGenerating(false);
    }
  };

  const handleCompleteSession = async (sessionId) => {
    if (completingIds.has(sessionId)) return;
    setCompletingIds(prev => new Set(prev).add(sessionId));
    setError('');
    try {
      await studyPlanService.completeSession(plan._id, sessionId);
      const res = await studyPlanService.getCurrent();
      setPlan(res.data.data.plan);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save session. Please try again.');
    } finally {
      setCompletingIds(prev => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  };

  const examDaysLeft = daysUntil(user?.targetExamDate);
  const today = new Date();
  const currentDayData = plan?.dailyPlans?.[selectedDay];

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Study Plan</h1>
          <p className="text-surface-500 text-sm mt-1">AI-generated personalized daily schedule for your exam preparation.</p>
        </div>
        {examDaysLeft !== null && (
          <div className="badge badge-primary text-sm px-4 py-2">
            <Calendar size={13} className="mr-1" />
            {examDaysLeft} days to exam
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[40vh]">
          <div className="spinner spinner-lg" />
        </div>
      ) : !plan ? (
        /* ─── No Plan — Generate one ─────────────────────────────────────────── */
        <div className="grid md:grid-cols-2 gap-6">
          <div className="card flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-xl bg-primary-50 border border-primary-200 flex items-center justify-center">
                <Brain size={22} className="text-primary-600" />
              </div>
              <div>
                <div className="text-surface-800 font-bold">Generate Study Plan</div>
                <div className="text-surface-500 text-sm">AI creates a day-by-day schedule</div>
              </div>
            </div>

            {!user?.targetExam && (
              <div className="alert alert-info">
                <Zap size={14} />
                <span className="text-xs">
                  <Link to="/profile" className="underline">Set your target exam</Link> in Profile first.
                </span>
              </div>
            )}

            <div className="form-group">
              <label className="form-label">Exam Date</label>
              <input
                type="date"
                className="form-input"
                value={genForm.examDate}
                onChange={e => setGenForm(p => ({ ...p, examDate: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Target Score</label>
              <input
                type="number"
                className="form-input"
                placeholder="e.g. 160"
                value={genForm.targetScore}
                onChange={e => setGenForm(p => ({ ...p, targetScore: e.target.value }))}
              />
            </div>
            <div className="form-group">
              <label className="form-label">Daily Study Hours</label>
              <select
                className="form-input form-select"
                value={genForm.dailyHours}
                onChange={e => setGenForm(p => ({ ...p, dailyHours: e.target.value }))}
              >
                {[1, 1.5, 2, 3, 4, 5, 6].map(h => (
                  <option key={h} value={h}>{h} {h === 1 ? 'hour' : 'hours'}/day</option>
                ))}
              </select>
            </div>
            <button
              onClick={handleGenerate}
              disabled={generating || !user?.targetExam}
              className="btn btn-primary w-full"
            >
              {generating ? <Loader2 size={16} className="animate-spin" /> : <Brain size={16} />}
              {generating ? 'Generating plan...' : 'Generate My Study Plan'}
            </button>
          </div>

          <div className="flex flex-col gap-4">
            <div className="card">
              <h3 className="text-surface-800 font-semibold mb-3">What you'll get</h3>
              <div className="flex flex-col gap-2.5">
                {[
                  { icon: Calendar, text: 'Day-by-day topic schedule', color: 'text-blue-400' },
                  { icon: Target, text: 'Practice sessions by difficulty', color: 'text-violet-400' },
                  { icon: TrendingUp, text: 'Revision sessions for weak topics', color: 'text-amber-400' },
                  { icon: CheckCircle, text: 'Mock test scheduling', color: 'text-emerald-400' },
                  { icon: Brain, text: 'AI adapts as you progress', color: 'text-primary-400' },
                ].map(({ icon: Icon, text, color }) => (
                  <div key={text} className="flex items-center gap-2.5 text-sm text-surface-600">
                    <Icon size={14} className={color} />
                    {text}
                  </div>
                ))}
              </div>
            </div>
            <div className="card card-sm">
              <p className="text-surface-400 text-xs leading-relaxed">
                The study plan is personalized based on your target exam, exam date, daily availability,
                and your current performance on practice sessions.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ─── Plan exists — show it ──────────────────────────────────────────── */
        <div className="flex flex-col gap-4">
          {/* Overall progress banner */}
          {(() => {
            const allSessions = (plan.dailyPlans || []).flatMap(d => d.sessions);
            const totalSess = allSessions.length;
            const doneSess  = allSessions.filter(s => s.isCompleted).length;
            const pct = totalSess > 0 ? Math.round((doneSess / totalSess) * 100) : 0;
            return (
              <div className="card card-sm flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-semibold text-surface-700">Overall Plan Progress</span>
                    <span className="text-xs text-surface-500">{doneSess}/{totalSess} sessions · {pct}%</span>
                  </div>
                  <div className="progress-bar">
                    <div className="progress-fill bg-emerald-500" style={{ width: `${pct}%` }} />
                  </div>
                </div>
                <button
                  onClick={() => setPlan(null)}
                  className="btn btn-ghost btn-sm text-xs flex-shrink-0"
                >
                  Regenerate Plan
                </button>
              </div>
            );
          })()}

          <div className="grid md:grid-cols-3 gap-4">
          {/* Day selector */}
          <div className="card card-sm flex flex-col gap-2 max-h-[70vh] overflow-y-auto">
            <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-1">Daily Schedule</div>
            {(plan.dailyPlans || []).map((day, i) => {
              const completed = day.sessions.filter(s => s.isCompleted).length;
              const total = day.sessions.length;
              const isToday = new Date(day.date).toDateString() === today.toDateString();
              return (
                <button
                  key={i}
                  onClick={() => setSelectedDay(i)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all border ${
                    selectedDay === i
                      ? 'border-primary-600 bg-primary-50 text-primary-700'
                      : isToday
                      ? 'border-amber-300 bg-amber-50 text-surface-700'
                      : 'border-surface-200 bg-white text-surface-500 hover:border-surface-300'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium">{formatDate(day.date)}</span>
                    {isToday && <span className="badge badge-warning text-xs py-0 px-1.5">Today</span>}
                  </div>
                  <div className="text-xs opacity-70 mt-0.5">{completed}/{total} done</div>
                </button>
              );
            })}
          </div>

          {/* Day sessions */}
          <div className="md:col-span-2 flex flex-col gap-4">
            {currentDayData ? (
              <>
                <div className="card card-sm flex items-center justify-between">
                  <div>
                    <div className="font-semibold text-surface-800">{formatDate(currentDayData.date)}</div>
                    <div className="text-xs text-surface-500 mt-0.5">
                      {currentDayData.sessions.filter(s => s.isCompleted).length} of {currentDayData.sessions.length} sessions completed
                    </div>
                  </div>
                  <div className="w-20">
                    <div className="text-right text-xs text-surface-500 mb-1">
                      {Math.round((currentDayData.sessions.filter(s => s.isCompleted).length / currentDayData.sessions.length) * 100)}%
                    </div>
                    <div className="progress-bar">
                      <div
                        className="progress-fill bg-emerald-500"
                        style={{ width: `${(currentDayData.sessions.filter(s => s.isCompleted).length / Math.max(1, currentDayData.sessions.length)) * 100}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="card flex flex-col gap-2">
                  {currentDayData.sessions.length === 0 ? (
                    <div className="empty-state py-6">
                      <CheckCircle size={28} className="text-emerald-400 opacity-50" />
                      <span className="text-surface-500 text-sm">Rest day — no sessions scheduled!</span>
                    </div>
                  ) : (
                    currentDayData.sessions.map((session) => (
                      <SessionCard
                        key={session._id}
                        session={session}
                        onComplete={handleCompleteSession}
                        completing={completingIds.has(session._id)}
                      />
                    ))
                  )}
                </div>

                <div className="flex gap-2">
                  <Link to="/practice" className="btn btn-secondary btn-sm flex-1">
                    <BookOpen size={14} /> Practice Now
                  </Link>
                  <Link to="/ai-tutor" className="btn btn-ghost btn-sm flex-1">
                    <Brain size={14} /> Ask AI Tutor
                  </Link>
                </div>
              </>
            ) : (
              <div className="card">
                <div className="empty-state">
                  <Calendar size={32} className="opacity-30" />
                  <span className="text-surface-500">Select a day to view sessions</span>
                </div>
              </div>
            )}
          </div>
        </div>
        </div>
      )}
    </div>
  );
}
