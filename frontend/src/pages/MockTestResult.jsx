import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useLocation } from 'react-router-dom';
import {
  CheckCircle, XCircle, MinusCircle, Trophy, Target,
  RotateCcw, BookOpen, Brain, ChevronDown, ChevronUp,
  Loader2, AlertCircle, Clock, Percent, TrendingUp, AlertTriangle
} from 'lucide-react';
import { mockTestService } from '../services';

/**
 * Mock Test Result page.
 * Route: /mock-tests/attempts/:attemptId/result
 * Fetches the completed attempt from the backend.
 * Also shows Weak Topics detected in this test and historically.
 */

// ── Thresholds (configurable) ───────────────────────────────────────────────
const WEAK_ACCURACY_THRESHOLD = 60;      // below this % → weak
const WEAK_MIN_ATTEMPTS = 5;             // need at least this many questions attempted

function ResultBadge({ accuracy }) {
  if (accuracy >= 80) return <span className="badge badge-success">Excellent</span>;
  if (accuracy >= 60) return <span className="badge badge-warning">Good</span>;
  if (accuracy >= 40) return <span className="badge badge-danger">Needs Work</span>;
  return <span className="badge badge-gray">Keep Practicing</span>;
}

function formatTime(secs) {
  if (!secs) return '0s';
  const h = Math.floor(secs / 3600);
  const m = Math.floor(secs / 60) % 60;
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

/**
 * Compute per-topic performance from questionAttempts in this test.
 * Returns an array of { topicId, topicName, subjectName, correct, wrong, skipped, attempted, accuracy, classification }
 */
function computeTopicPerformance(attempts) {
  const topicMap = new Map();

  for (const qa of attempts) {
    if (!qa.topicId) continue;
    const key = qa.topicId.toString ? qa.topicId.toString() : qa.topicId;
    if (!topicMap.has(key)) {
      topicMap.set(key, {
        topicId: key,
        topicName: qa.topicName || 'Unknown topic',
        subjectName: qa.subjectName || '',
        correct: 0, wrong: 0, skipped: 0, attempted: 0,
      });
    }
    const entry = topicMap.get(key);
    if (qa.isSkipped) entry.skipped++;
    else if (qa.isCorrect) { entry.correct++; entry.attempted++; }
    else { entry.wrong++; entry.attempted++; }
  }

  return Array.from(topicMap.values()).map(t => {
    const accuracy = t.attempted > 0 ? Math.round((t.correct / t.attempted) * 100) : 0;

    let classification;
    const totalSeen = t.correct + t.wrong + t.skipped;
    if (totalSeen < WEAK_MIN_ATTEMPTS) {
      classification = 'insufficient';
    } else if (accuracy < WEAK_ACCURACY_THRESHOLD) {
      classification = 'weak';
    } else {
      classification = 'ok';
    }

    return { ...t, accuracy, classification };
  }).sort((a, b) => a.accuracy - b.accuracy);
}

export default function MockTestResult() {
  const { attemptId } = useParams();
  const navigate = useNavigate();

  const [attempt, setAttempt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedQuestion, setExpandedQuestion] = useState(null);
  const [showReview, setShowReview] = useState(false);

  useEffect(() => {
    mockTestService.getAttempt(attemptId)
      .then(r => setAttempt(r.data.data.attempt))
      .catch(err => setError(err.response?.data?.message || 'Failed to load result.'))
      .finally(() => setLoading(false));
  }, [attemptId]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="spinner spinner-lg" />
        <p className="text-surface-500 text-sm">Loading your result…</p>
      </div>
    );
  }

  if (error || !attempt) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-surface-600">{error || 'Result not found.'}</p>
        <button onClick={() => navigate('/mock-tests')} className="btn btn-primary">
          Back to Mock Tests
        </button>
      </div>
    );
  }

  const { result, attempts: questionAttempts = [] } = attempt;
  const topicPerformance = computeTopicPerformance(questionAttempts);
  const weakTopics = topicPerformance.filter(t => t.classification === 'weak');
  const insufficientTopics = topicPerformance.filter(t => t.classification === 'insufficient' && (t.correct + t.wrong + t.skipped) > 0);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={20} className="text-amber-400" />
            <h1 className="text-2xl font-bold text-surface-900">Mock Test Result</h1>
          </div>
          <p className="text-surface-500 text-sm">
            {attempt.mockTestTitle || attempt.mockTest?.title || 'Mock Test'}
            {attempt.examName ? ` · ${attempt.examName}` : ''}
          </p>
          {attempt.submittedAt && (
            <p className="text-surface-400 text-xs mt-0.5">
              Submitted: {formatDate(attempt.submittedAt)}
            </p>
          )}
        </div>
        <ResultBadge accuracy={result?.accuracy || 0} />
      </div>

      {/* ─── Score Overview ──────────────────────────────────────────────────── */}
      <div className="card text-center">
        <div className="text-5xl font-bold text-surface-900 mb-1">
          {(result?.marksObtained ?? 0).toFixed(1)}
          <span className="text-2xl text-surface-400">/{result?.totalMarks || 0}</span>
        </div>
        <div className="text-surface-400 text-sm mb-1">Marks Obtained</div>
        {result?.rawMarks !== undefined && result.rawMarks < 0 && (
          <div className="text-xs text-red-400 mb-3">
            Raw score: {result.rawMarks.toFixed(1)} (negative marks applied)
          </div>
        )}
        <div className="flex justify-center mb-2">
          <div className="w-40 h-2 bg-surface-200 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${
                (result?.percentage || 0) >= 80 ? 'bg-emerald-500' :
                (result?.percentage || 0) >= 60 ? 'bg-amber-500' : 'bg-red-500'
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
            <div className="text-surface-700 font-semibold">{formatTime(attempt.timeTaken)}</div>
          </div>
        </div>
        <div className="stat-card flex-row items-center gap-3">
          <TrendingUp size={16} className="text-amber-400 flex-shrink-0" />
          <div>
            <div className="stat-label">Negative Marks</div>
            <div className="text-red-400 font-semibold">-{result?.negativeMarks || 0}</div>
          </div>
        </div>
      </div>
      <div className="text-xs text-surface-500">* Accuracy excludes skipped questions (correct ÷ attempted)</div>

      {/* ─── Weak Topics ────────────────────────────────────────────────────── */}
      {(weakTopics.length > 0 || insufficientTopics.length > 0) && (
        <div className="card">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle size={17} className="text-amber-500" />
            <h2 className="text-surface-800 font-semibold">Areas to Improve</h2>
          </div>

          {weakTopics.length > 0 && (
            <>
              <div className="text-xs text-surface-500 mb-2">
                <strong>Weak</strong>: below {WEAK_ACCURACY_THRESHOLD}% accuracy with at least {WEAK_MIN_ATTEMPTS} questions attempted.
              </div>
              <div className="flex flex-col gap-2 mb-4">
                {weakTopics.map(t => (
                  <div key={t.topicId} className="flex items-center justify-between p-3 rounded-lg bg-red-50 border border-red-200">
                    <div>
                      <div className="text-sm font-medium text-surface-700">{t.topicName}</div>
                      {t.subjectName && <div className="text-xs text-surface-500">{t.subjectName}</div>}
                      <div className="text-xs text-red-500 mt-0.5">
                        {t.correct}/{t.attempted} correct · {t.accuracy}% accuracy · {t.wrong} wrong
                      </div>
                    </div>
                    <Link
                      to="/practice"
                      state={{ topicId: t.topicId, topicName: t.topicName }}
                      className="btn btn-secondary btn-sm flex-shrink-0 ml-3"
                    >
                      <BookOpen size={13} /> Practice
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}

          {insufficientTopics.length > 0 && (
            <>
              <div className="text-xs text-surface-500 mb-2">
                <strong>Needs more data</strong>: fewer than {WEAK_MIN_ATTEMPTS} questions attempted — not enough to classify reliably.
              </div>
              <div className="flex flex-col gap-2">
                {insufficientTopics.map(t => (
                  <div key={t.topicId} className="flex items-center justify-between p-3 rounded-lg bg-surface-50 border border-surface-200">
                    <div>
                      <div className="text-sm font-medium text-surface-600">{t.topicName}</div>
                      {t.subjectName && <div className="text-xs text-surface-400">{t.subjectName}</div>}
                      <div className="text-xs text-surface-400 mt-0.5">
                        {t.correct + t.wrong + t.skipped} question{(t.correct + t.wrong + t.skipped) !== 1 ? 's' : ''} seen in this test
                      </div>
                    </div>
                    <Link
                      to="/practice"
                      state={{ topicId: t.topicId, topicName: t.topicName }}
                      className="btn btn-ghost btn-sm flex-shrink-0 ml-3"
                    >
                      <BookOpen size={13} /> Practice
                    </Link>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {weakTopics.length === 0 && topicPerformance.length > 0 && (
        <div className="card">
          <div className="flex items-center gap-2">
            <CheckCircle size={17} className="text-emerald-500" />
            <div>
              <div className="font-semibold text-surface-800 text-sm">No weak topics detected!</div>
              <div className="text-xs text-surface-500 mt-0.5">
                You performed at or above {WEAK_ACCURACY_THRESHOLD}% accuracy on all topics with sufficient data.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─── Actions ─────────────────────────────────────────────────────────── */}
      <div className="flex gap-3 flex-wrap">
        <button onClick={() => navigate('/mock-tests')} className="btn btn-primary">
          <RotateCcw size={15} /> More Tests
        </button>
        <button onClick={() => setShowReview(r => !r)} className="btn btn-secondary">
          <BookOpen size={15} /> {showReview ? 'Hide' : 'Review'} Questions
        </button>
        <Link to="/analytics" className="btn btn-secondary">
          <Target size={15} /> Analytics
        </Link>
        <Link to="/ai-tutor" className="btn btn-ghost">
          <Brain size={15} /> Ask AI Tutor
        </Link>
      </div>

      {/* ─── Question Review ─────────────────────────────────────────────────── */}
      {showReview && (
        <div>
          <h2 className="text-surface-800 font-semibold mb-3">Question-by-Question Review</h2>
          <div className="flex flex-col gap-3">
            {questionAttempts.map((qa, idx) => {
              const isOpen = expandedQuestion === idx;
              return (
                <div
                  key={idx}
                  className={`card card-sm border-l-4 ${
                    qa.isSkipped ? 'border-l-surface-600' :
                    qa.isCorrect ? 'border-l-emerald-500' : 'border-l-red-500'
                  }`}
                >
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => setExpandedQuestion(isOpen ? null : idx)}
                  >
                    <div className="flex-shrink-0 mt-0.5">
                      {qa.isSkipped ? <MinusCircle size={16} className="text-surface-500" /> :
                       qa.isCorrect ? <CheckCircle size={16} className="text-emerald-400" /> :
                       <XCircle size={16} className="text-red-400" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-surface-700 truncate">
                        Q{idx + 1}. {qa.questionText || '(Question text unavailable)'}
                      </div>
                      <div className="text-xs text-surface-500 mt-0.5 flex items-center gap-2">
                        {qa.topicName && <span>{qa.topicName}</span>}
                        <span>
                          {qa.isSkipped ? 'Skipped' :
                           qa.isCorrect ? `Correct — +${qa.marksAwarded}` :
                           `Wrong — ${qa.marksAwarded !== 0 ? qa.marksAwarded.toFixed(2) : '0'} marks`}
                        </span>
                      </div>
                    </div>
                    <button className="text-surface-400 hover:text-surface-600 flex-shrink-0">
                      {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {isOpen && (
                    <div className="mt-4 pt-4 border-t border-surface-200 flex flex-col gap-3">
                      {/* Options */}
                      <div className="flex flex-col gap-2">
                        {(qa.options || []).map(opt => (
                          <div
                            key={opt.key}
                            className={`option-btn pointer-events-none text-sm py-2
                              ${opt.key === qa.correctAnswer ? 'correct' :
                                opt.key === qa.selectedAnswer && !qa.isCorrect ? 'wrong' : ''}
                            `}
                          >
                            <span className={`option-key text-xs ${
                              opt.key === qa.correctAnswer ? 'bg-emerald-50 border-emerald-300 text-emerald-700' :
                              opt.key === qa.selectedAnswer && !qa.isCorrect ? 'bg-red-50 border-red-300 text-red-700' : ''
                            }`}>{opt.key}</span>
                            {opt.text}
                          </div>
                        ))}
                      </div>

                      {/* Your answer */}
                      <div className="flex gap-2 text-xs">
                        <span className="text-surface-500">Your answer:</span>
                        <span className={qa.isCorrect ? 'text-emerald-600 font-semibold' : 'text-red-600 font-semibold'}>
                          {qa.selectedAnswer || 'Skipped'}
                        </span>
                        {!qa.isCorrect && !qa.isSkipped && (
                          <>
                            <span className="text-surface-400 mx-1">·</span>
                            <span className="text-surface-500">Correct:</span>
                            <span className="text-emerald-600 font-semibold">{qa.correctAnswer}</span>
                          </>
                        )}
                      </div>

                      {/* Explanation */}
                      {qa.explanation && (
                        <div className="bg-primary-50 border border-primary-200 rounded-lg p-3">
                          <div className="text-xs font-semibold text-primary-600 mb-1 uppercase tracking-wide">Explanation</div>
                          <p className="text-surface-600 text-sm leading-relaxed">{qa.explanation}</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
