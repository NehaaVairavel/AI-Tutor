import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Trophy, Clock, BookOpen, Target, CheckCircle, AlertCircle,
  TrendingUp, Brain, Play, Calendar, Loader2, Eye
} from 'lucide-react';
import { mockTestService } from '../services';

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(secs) {
  if (!secs) return '—';
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m} min`;
}

function MockTestCard({ test, onStart, starting }) {
  return (
    <div className="card hover:shadow-md transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center">
            <Trophy size={18} className="text-amber-600" />
          </div>
          <div>
            <div className="font-semibold text-surface-800">{test.title}</div>
            <div className="text-xs text-surface-500">{test.exam?.shortName || 'General'}</div>
          </div>
        </div>
        <span className={`badge ${test.isActive ? 'badge-success' : 'badge-gray'}`}>
          {test.isActive ? 'Available' : 'Inactive'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4">
        {[
          { label: 'Questions', value: test.totalQuestions || '—' },
          { label: 'Duration',  value: test.duration ? `${test.duration} min` : '—' },
          { label: 'Marks',     value: test.totalMarks || '—' },
        ].map(({ label, value }) => (
          <div key={label} className="text-center p-2 rounded-lg bg-surface-50 border border-surface-200">
            <div className="text-surface-800 font-bold text-sm">{value}</div>
            <div className="text-surface-500 text-xs">{label}</div>
          </div>
        ))}
      </div>

      {test.instructions && (
        <p className="text-xs text-surface-400 mb-3 line-clamp-2">{test.instructions}</p>
      )}

      {test.negativeMarking && (
        <p className="text-xs text-red-400 mb-2">
          ⚠ Negative marking: −{test.negativeMarkingValue} per wrong answer
        </p>
      )}

      <button
        id={`start-mock-${test._id}`}
        onClick={() => onStart(test)}
        disabled={!test.isActive || starting === test._id}
        className="btn btn-primary w-full btn-sm"
      >
        {starting === test._id
          ? <Loader2 size={14} className="animate-spin" />
          : <Play size={14} />
        }
        {starting === test._id ? 'Starting…' : 'Start Mock Test'}
      </button>
    </div>
  );
}

function PastAttemptRow({ attempt }) {
  const accuracy = attempt.result?.accuracy || 0;
  const testTitle = attempt.mockTestTitle || attempt.mockTest?.title || 'Mock Test';
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-surface-50 border border-surface-200 hover:border-surface-300 transition-colors">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 font-bold text-sm
        ${accuracy >= 70 ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' :
          accuracy >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-300' :
          'bg-red-50 text-red-700 border border-red-300'}`}>
        {accuracy}%
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-surface-700 truncate">{testTitle}</div>
        <div className="text-xs text-surface-500">
          {attempt.result?.correct ?? '—'} correct · {attempt.result?.wrong ?? '—'} wrong
          {' '}· {formatDate(attempt.submittedAt)}
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="text-xs text-surface-400">
          {attempt.result?.marksObtained?.toFixed?.(0) ?? '—'}/{attempt.result?.totalMarks ?? '—'}
        </div>
        <Link
          to={`/mock-tests/attempts/${attempt._id}/result`}
          className="btn btn-ghost btn-sm text-xs"
          title="View result"
        >
          <Eye size={13} />
        </Link>
      </div>
    </div>
  );
}

export default function MockTests() {
  const navigate = useNavigate();

  const [mockTests, setMockTests]     = useState([]);
  const [pastAttempts, setPastAttempts] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState('');
  const [starting, setStarting]       = useState(null); // testId being started

  useEffect(() => {
    Promise.all([
      mockTestService.getAll(),
      mockTestService.getMyAttempts({ page: 1, limit: 10 }),
    ])
      .then(([testsRes, attemptsRes]) => {
        setMockTests(testsRes.data.data.mockTests || []);
        setPastAttempts(attemptsRes.data.data.attempts || []);
      })
      .catch(() => setError('Failed to load mock tests. Please refresh.'))
      .finally(() => setLoading(false));
  }, []);

  const handleStart = async (test) => {
    setStarting(test._id);
    setError('');
    try {
      const res = await mockTestService.startAttempt(test._id);
      const { attempt, questions, mockTest: info } = res.data.data;
      // Navigate to the dedicated session page with all data in state
      navigate(`/mock-tests/${test._id}/session`, {
        state: {
          attemptId: attempt._id,
          questions,
          mockTest: info,
        },
      });
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to start mock test. Please try again.');
      setStarting(null);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Mock Tests</h1>
          <p className="text-surface-500 text-sm mt-1">Full-length timed exam simulations with detailed analysis.</p>
        </div>
        {pastAttempts.length > 0 && (
          <div className="badge badge-primary">
            {pastAttempts.length} attempt{pastAttempts.length !== 1 ? 's' : ''}
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={15} />
          <span>{error}</span>
        </div>
      )}

      {/* Info banner */}
      <div className="alert alert-info">
        <Trophy size={16} className="flex-shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">Full Mock Test Engine</div>
          <div className="text-xs mt-0.5 opacity-80">
            Mock tests simulate real exam conditions with a countdown timer, question palette, and
            detailed post-exam analysis. Results are saved to your history automatically.
          </div>
        </div>
      </div>

      {/* Quick stats */}
      {pastAttempts.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: Trophy,      label: 'Tests Taken',  value: pastAttempts.length, color: 'text-amber-400',  bg: 'bg-amber-900/20' },
            { icon: Target,      label: 'Best Score',   value: `${Math.max(...pastAttempts.map(a => a.result?.accuracy || 0))}%`, color: 'text-emerald-400', bg: 'bg-emerald-900/20' },
            { icon: TrendingUp,  label: 'Avg Accuracy', value: `${Math.round(pastAttempts.reduce((s, a) => s + (a.result?.accuracy || 0), 0) / pastAttempts.length)}%`, color: 'text-blue-400', bg: 'bg-blue-900/20' },
            { icon: CheckCircle, label: 'Passed (≥60%)', value: pastAttempts.filter(a => (a.result?.accuracy || 0) >= 60).length, color: 'text-violet-400', bg: 'bg-violet-900/20' },
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
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* Available tests */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <h2 className="text-surface-800 font-semibold">Available Tests</h2>
          {loading ? (
            <div className="flex flex-col gap-4">
              {[...Array(2)].map((_, i) => <div key={i} className="skeleton h-48 rounded-xl" />)}
            </div>
          ) : mockTests.length === 0 ? (
            <div className="card">
              <div className="empty-state">
                <Trophy size={36} className="opacity-30 text-amber-400" />
                <div>
                  <div className="text-surface-700 font-semibold">No mock tests available yet</div>
                  <div className="text-surface-500 text-sm">Admins can add mock tests from the admin panel.</div>
                </div>
                <Link to="/practice" className="btn btn-primary btn-sm">
                  <BookOpen size={14} /> Practice Instead
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {mockTests.map(test => (
                <MockTestCard
                  key={test._id}
                  test={test}
                  onStart={handleStart}
                  starting={starting}
                />
              ))}
            </div>
          )}
        </div>

        {/* Past attempts */}
        <div className="flex flex-col gap-4">
          <h2 className="text-surface-800 font-semibold">Past Attempts</h2>
          {loading ? (
            <div className="flex flex-col gap-2">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
            </div>
          ) : pastAttempts.length === 0 ? (
            <div className="card">
              <div className="empty-state py-6">
                <Clock size={28} className="opacity-30" />
                <div className="text-surface-500 text-sm text-center">
                  No completed attempts yet.<br />Take your first mock test!
                </div>
              </div>
            </div>
          ) : (
            <div className="card card-sm flex flex-col gap-2">
              {pastAttempts.map((attempt) => (
                <PastAttemptRow key={attempt._id} attempt={attempt} />
              ))}
              {pastAttempts.length >= 10 && (
                <div className="text-xs text-surface-400 text-center pt-1">
                  Showing 10 most recent attempts
                </div>
              )}
            </div>
          )}

          <div className="card card-sm">
            <h3 className="text-surface-700 font-semibold text-sm mb-3">Need more practice?</h3>
            <div className="flex flex-col gap-2">
              <Link to="/practice" className="btn btn-secondary btn-sm w-full">
                <BookOpen size={14} /> Topic Practice
              </Link>
              <Link to="/analytics" className="btn btn-ghost btn-sm w-full">
                <TrendingUp size={14} /> View Analytics
              </Link>
              <Link to="/ai-tutor" className="btn btn-ghost btn-sm w-full">
                <Brain size={14} /> Ask AI Tutor
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
