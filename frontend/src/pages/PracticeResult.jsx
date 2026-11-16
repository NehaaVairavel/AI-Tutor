import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle, XCircle, MinusCircle, Trophy, Target,
  RotateCcw, BookOpen, Brain, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Clock, Percent, TrendingUp, Eye
} from 'lucide-react';
import { practiceService } from '../services';

function ResultBadge({ accuracy }) {
  if (accuracy >= 80) return <span className="badge badge-success">Excellent</span>;
  if (accuracy >= 60) return <span className="badge badge-warning">Good</span>;
  if (accuracy >= 40) return <span className="badge badge-danger">Needs Work</span>;
  return <span className="badge badge-gray">Keep Practicing</span>;
}

function formatTime(secs) {
  if (!secs) return '0s';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export default function PracticeResult() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedQuestion, setExpandedQuestion] = useState(null);

  useEffect(() => {
    practiceService.getSessionResult(sessionId)
      .then(r => setSession(r.data.data.session))
      .catch(err => setError(err.response?.data?.message || 'Failed to load results.'))
      .finally(() => setLoading(false));
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  if (error || !session) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-surface-600">{error || 'Result not found.'}</p>
        <button onClick={() => navigate('/practice')} className="btn btn-primary">Back to Practice</button>
      </div>
    );
  }

  const { result, attempts, questions } = session;
  const questionMap = {};
  (questions || []).forEach(q => { if (q?._id) questionMap[q._id] = q; });

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Practice Result</h1>
          <p className="text-surface-500 text-sm mt-1">
            {session.subject?.name}{session.topic?.name ? ` → ${session.topic.name}` : ''}
          </p>
        </div>
        <ResultBadge accuracy={result?.accuracy || 0} />
      </div>

      {/* ─── Score Overview ──────────────────────────────────────────────────── */}
      <div className="card text-center">
        <div className="text-5xl font-bold text-surface-900 mb-1">
          {(result?.marksObtained ?? 0).toFixed(1)}
          <span className="text-2xl text-surface-400">/{result?.totalMarks || 0}</span>
        </div>
        <div className="text-surface-400 text-sm mb-1">Marks Obtained (clamped to 0)</div>
        {/* Show raw signed score if it differs from clamped */}
        {result?.rawMarks !== undefined && result.rawMarks < 0 && (
          <div className="text-xs text-red-400 mb-3">
            Raw score: {result.rawMarks.toFixed(1)} (negative marks applied)
          </div>
        )}
        <div className="flex justify-center mb-2">
          <div className="w-32 h-2 bg-surface-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                result?.percentage >= 80 ? 'bg-emerald-500' :
                result?.percentage >= 60 ? 'bg-amber-500' : 'bg-red-500'
              }`}
              style={{ width: `${result?.percentage || 0}%` }}
            />
          </div>
        </div>
        <div className="text-surface-700 font-semibold">{result?.percentage || 0}% Score</div>
      </div>

      {/* ─── Stats Grid ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="stat-card text-center items-center">
          <CheckCircle size={18} className="text-emerald-600" />
          <div className="stat-value text-emerald-600">{result?.correct || 0}</div>
          <div className="stat-label">Correct</div>
        </div>
        <div className="stat-card text-center items-center">
          <XCircle size={18} className="text-red-600" />
          <div className="stat-value text-red-600">{result?.wrong || 0}</div>
          <div className="stat-label">Wrong</div>
        </div>
        <div className="stat-card text-center items-center">
          <MinusCircle size={18} className="text-surface-500" />
          <div className="stat-value text-surface-400">{result?.skipped || 0}</div>
          <div className="stat-label">Skipped</div>
        </div>
        <div className="stat-card text-center items-center">
          <Percent size={18} className="text-primary-600" />
          <div className="stat-value text-primary-600">{result?.accuracy || 0}%</div>
          <div className="stat-label">Accuracy*</div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="stat-card flex-row items-center gap-3">
          <Clock size={16} className="text-violet-400 flex-shrink-0" />
          <div>
            <div className="stat-label">Time Taken</div>
            <div className="text-surface-700 font-semibold">{formatTime(result?.timeTaken)}</div>
          </div>
        </div>
        <div className="stat-card flex-row items-center gap-3">
          <TrendingUp size={16} className="text-amber-400 flex-shrink-0" />
          <div>
            <div className="stat-label">Negative Marks</div>
            <div className="text-surface-700 font-semibold text-red-400">-{result?.negativeMarks || 0}</div>
          </div>
        </div>
      </div>
      <div className="text-xs text-surface-500">* Accuracy excludes skipped questions (correct ÷ attempted)</div>

      {/* ─── Actions ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <button onClick={() => navigate('/practice')} className="btn btn-primary">
          <RotateCcw size={15} /> Practice Again
        </button>
        <Link to={`/practice/review/${sessionId}`} className="btn btn-primary">
          <Eye size={15} /> Review Answers
        </Link>
        <Link to="/mistakes" className="btn btn-secondary">
          <BookOpen size={15} /> Review Mistakes
        </Link>
        <Link to="/ai-tutor" className="btn btn-secondary">
          <Brain size={15} /> Ask AI Tutor
        </Link>
      </div>

      {/* ─── Question Review ─────────────────────────────────────────────────── */}
      <div>
        <h2 className="text-surface-800 font-semibold mb-3">Question-by-Question Review</h2>
        <div className="flex flex-col gap-3">
          {(attempts || []).map((attempt, idx) => {
            const q = questionMap[attempt.question?.toString?.() || attempt.question];
            if (!q) return null;
            const isOpen = expandedQuestion === idx;
            return (
              <div
                key={idx}
                className={`card card-sm border-l-4 ${
                  attempt.isSkipped ? 'border-l-surface-600' :
                  attempt.isCorrect ? 'border-l-emerald-500' : 'border-l-red-500'
                }`}
              >
                <div className="flex items-start gap-3 cursor-pointer" onClick={() => setExpandedQuestion(isOpen ? null : idx)}>
                  <div className="flex-shrink-0 mt-0.5">
                    {attempt.isSkipped ? <MinusCircle size={16} className="text-surface-500" /> :
                     attempt.isCorrect ? <CheckCircle size={16} className="text-emerald-400" /> :
                     <XCircle size={16} className="text-red-400" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-surface-700 truncate">
                      Q{idx + 1}. {q.text}
                    </div>
                    <div className="text-xs text-surface-500 mt-0.5">
                      {attempt.isSkipped ? 'Skipped' :
                       attempt.isCorrect
                         ? `Correct — +${attempt.marksAwarded}`
                         : `Wrong — ${attempt.marksAwarded !== 0 ? attempt.marksAwarded.toFixed(2) : '0'} marks`}
                    </div>
                  </div>
                  <button className="text-surface-400 hover:text-surface-600 flex-shrink-0">
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-surface-200 flex flex-col gap-3">
                    <div className="flex flex-col gap-2">
                      {(q.options || []).map(opt => (
                        <div
                          key={opt.key}
                          className={`option-btn pointer-events-none text-sm py-2
                            ${opt.key === q.correctAnswer ? 'correct' :
                              opt.key === attempt.selectedAnswer && !attempt.isCorrect ? 'wrong' : ''
                            }`}
                        >
                          <span className={`option-key text-xs ${
                            opt.key === q.correctAnswer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                            opt.key === attempt.selectedAnswer && !attempt.isCorrect ? 'bg-red-50 border-red-300 text-red-700' : ''
                          }`}>{opt.key}</span>
                          {opt.text}
                        </div>
                      ))}
                    </div>
                    {q.explanation && (
                      <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
                        <div className="text-xs font-semibold text-primary-600 mb-1 uppercase tracking-wide">Explanation</div>
                        <p className="text-surface-600 text-sm leading-relaxed">{q.explanation}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
