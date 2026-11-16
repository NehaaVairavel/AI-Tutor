import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Flag, Send, Clock,
  CheckCircle, Circle, AlertCircle, Loader2
} from 'lucide-react';
import { practiceService } from '../services';
import QuestionRenderer from '../components/QuestionRenderer';

function QuestionStatus({ status }) {
  if (status === 'answered') return <CheckCircle size={12} className="text-emerald-400" />;
  if (status === 'flagged') return <Flag size={12} className="text-amber-400" />;
  return <Circle size={12} className="text-surface-600" />;
}

function formatTime(seconds) {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0');
  const s = (seconds % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

// ─── Draft persistence helpers ────────────────────────────────────────────────
// Persists in-progress answers, current index, elapsed time, and flags so the
// user can navigate away and return without losing work.
const DRAFT_VERSION = 1;

function draftKey(sessionId) {
  return `practice_draft_${sessionId}`;
}

function saveDraft(sessionId, { answers, currentIndex, elapsed, flagged }) {
  try {
    localStorage.setItem(draftKey(sessionId), JSON.stringify({
      v: DRAFT_VERSION,
      answers,
      currentIndex,
      elapsed,
      flagged,
      savedAt: Date.now(),
    }));
  } catch (_) {
    // localStorage full — silently ignore; data lives in React state
  }
}

function loadDraft(sessionId) {
  try {
    const raw = localStorage.getItem(draftKey(sessionId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.v !== DRAFT_VERSION) return null;
    return parsed;
  } catch (_) {
    return null;
  }
}

function clearDraft(sessionId) {
  try {
    localStorage.removeItem(draftKey(sessionId));
  } catch (_) {}
}

// ─── Session question cache ───────────────────────────────────────────────────
// Questions are cached in sessionStorage so the question *list* survives within
// the same browser tab. Draft (answers/index) is in localStorage for cross-tab.
function sessionCacheKey(sessionId) {
  return `practice_session_${sessionId}`;
}

export default function PracticeSession() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [sessionData, setSessionData] = useState(null);
  const [sessionMeta, setSessionMeta] = useState(null);
  const [answers, setAnswers] = useState({});
  const [flagged, setFlagged] = useState({});
  const [questionTimes, setQuestionTimes] = useState({});
  const [currentIndex, setCurrentIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const timerRef = useRef(null);
  const questionStartRef = useRef(Date.now());
  // Track whether we've already hydrated from draft (prevents double-write on first mount)
  const hydratedRef = useRef(false);

  // ── Step 1: Load questions (sessionStorage → API fallback) ─────────────────
  useEffect(() => {
    const stored = sessionStorage.getItem(sessionCacheKey(sessionId));
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setSessionData(parsed);
        if (parsed.meta) setSessionMeta(parsed.meta);

        // ── Step 2a: Restore draft state after questions are ready ─────────
        const draft = loadDraft(sessionId);
        if (draft) {
          setAnswers(draft.answers || {});
          setCurrentIndex(draft.currentIndex || 0);
          setElapsed(draft.elapsed || 0);
          setFlagged(draft.flagged || {});
        }
        hydratedRef.current = true;
        setLoading(false);
        return;
      } catch (_) {
        sessionStorage.removeItem(sessionCacheKey(sessionId));
      }
    }

    // Fallback: fetch from API (page hard-refresh with no sessionStorage)
    practiceService.getSessionQuestions(sessionId)
      .then(r => {
        const data = { questions: r.data.data.questions };
        sessionStorage.setItem(sessionCacheKey(sessionId), JSON.stringify(data));
        setSessionData(data);

        // ── Step 2b: Restore draft after API load ──────────────────────────
        const draft = loadDraft(sessionId);
        if (draft) {
          setAnswers(draft.answers || {});
          setCurrentIndex(draft.currentIndex || 0);
          setElapsed(draft.elapsed || 0);
          setFlagged(draft.flagged || {});
        }
        hydratedRef.current = true;
      })
      .catch(err => {
        const msg = err.response?.data?.message || '';
        if (err.response?.status === 404) {
          setError(
            'This session has already been submitted or cannot be found. ' +
            (msg ? msg + ' ' : '') +
            'Please start a new practice session.'
          );
        } else {
          setError(msg || 'Failed to load session. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  }, [sessionId]);

  // ── Step 3: Persist draft whenever answers/index/elapsed/flagged change ────
  // We skip the very first render cycle to avoid overwriting a just-loaded draft.
  const draftSaveRef = useRef(false);
  useEffect(() => {
    if (!sessionData || !hydratedRef.current) return;
    if (!draftSaveRef.current) {
      // First effect run after hydration — mark ready for future saves
      draftSaveRef.current = true;
      return;
    }
    saveDraft(sessionId, { answers, currentIndex, elapsed, flagged });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [answers, currentIndex, flagged]);

  // Save elapsed time to draft periodically (every 10 s) to not flood writes
  useEffect(() => {
    if (!sessionData || !hydratedRef.current) return;
    if (elapsed % 10 === 0 && elapsed > 0) {
      saveDraft(sessionId, { answers, currentIndex, elapsed, flagged });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsed]);

  // ── Step 4: Timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!sessionData) return;
    timerRef.current = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, [sessionData]);

  const currentQuestion = sessionData?.questions?.[currentIndex];
  const total = sessionData?.questions?.length || 0;

  const getStatus = (qId) => {
    if (flagged[qId]) return 'flagged';
    const ans = answers[qId];
    // Consider answered if: non-empty string, non-empty array, non-empty object
    const hasAnswer = ans !== null && ans !== undefined && ans !== ''
      && !(Array.isArray(ans) && ans.length === 0)
      && !(typeof ans === 'object' && !Array.isArray(ans) && Object.keys(ans).length === 0);
    if (hasAnswer) return 'answered';
    return 'unanswered';
  };

  const handleAnswer = (newAnswer) => {
    if (!currentQuestion) return;
    setAnswers(p => ({ ...p, [currentQuestion._id]: newAnswer }));
  };

  const handleFlag = () => {
    if (!currentQuestion) return;
    setFlagged(p => ({ ...p, [currentQuestion._id]: !p[currentQuestion._id] }));
  };

  // Record time spent on the current question before navigating
  const recordQuestionTime = useCallback(() => {
    if (!currentQuestion) return;
    const spent = Math.round((Date.now() - questionStartRef.current) / 1000);
    setQuestionTimes(p => ({ ...p, [currentQuestion._id]: (p[currentQuestion._id] || 0) + spent }));
    questionStartRef.current = Date.now();
  }, [currentQuestion]);

  const goTo = useCallback((idx) => {
    recordQuestionTime();
    setCurrentIndex(idx);
  }, [recordQuestionTime]);

  const handleSubmit = async () => {
    recordQuestionTime();
    clearInterval(timerRef.current);
    setSubmitting(true);
    try {
      const formattedAnswers = Object.entries(answers).map(([questionId, selectedAnswer]) => ({
        questionId,
        selectedAnswer,
        timeTaken: questionTimes[questionId] || 0,
      }));
      await practiceService.submitSession(sessionId, {
        answers: formattedAnswers,
        timeTaken: elapsed,
      });
      // Clear all persistence once submitted
      clearDraft(sessionId);
      sessionStorage.removeItem(sessionCacheKey(sessionId));
      navigate(`/practice/result/${sessionId}`);
    } catch (err) {
      const msg = err.response?.data?.message || '';
      // If already submitted — navigate to result anyway (idempotent)
      if (err.response?.status === 409 || (msg && msg.toLowerCase().includes('already'))) {
        clearDraft(sessionId);
        sessionStorage.removeItem(sessionCacheKey(sessionId));
        navigate(`/practice/result/${sessionId}`);
        return;
      }
      setError(msg || 'Failed to submit. Please try again.');
      setSubmitting(false);
    }
  };

  const answered = Object.entries(answers).filter(([, ans]) => {
    if (ans === null || ans === undefined || ans === '') return false;
    if (Array.isArray(ans)) return ans.length > 0;
    if (typeof ans === 'object') return Object.keys(ans).length > 0;
    return true;
  }).length;
  const unanswered = total - answered;

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="spinner spinner-lg" />
        <p className="text-surface-500 text-sm">Loading session…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-surface-600 text-center max-w-sm">{error}</p>
        <button onClick={() => navigate('/practice')} className="btn btn-primary">
          Back to Practice
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* Shortfall warning */}
      {sessionMeta?.shortfall && sessionMeta.shortfallMessage && (
        <div className="alert alert-warning text-xs">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{sessionMeta.shortfallMessage}</span>
        </div>
      )}
      {/* Repeated questions notice */}
      {sessionMeta && !sessionMeta.allFresh && sessionMeta.repeatedQuestions > 0 && (
        <div className="alert alert-info text-xs">
          <span>
            You've practiced all available fresh questions in this category.
            {' '}{sessionMeta.repeatedQuestions} of {sessionMeta.delivered} question{sessionMeta.repeatedQuestions > 1 ? 's are' : ' is'} from previous sessions.
          </span>
        </div>
      )}

      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="badge badge-primary">
            {currentIndex + 1} / {total}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-surface-400">
            <span className="text-emerald-400 font-semibold">{answered}</span> answered
            <span className="text-surface-600 mx-1">·</span>
            <span className="text-surface-500">{unanswered}</span> remaining
          </div>
        </div>
        <div className="flex items-center gap-2 text-surface-700 font-mono text-sm">
          <Clock size={14} className="text-primary-400" />
          {formatTime(elapsed)}
        </div>
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${total > 0 ? (answered / total) * 100 : 0}%` }} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* ─── Question Panel ──────────────────────────────────────────────── */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="card">
            {/* Question meta */}
            <div className="flex items-center gap-2 mb-4">
              {currentQuestion?.difficulty && (
                <span className={`badge badge-sm diff-${currentQuestion.difficulty}`}>
                  {currentQuestion.difficulty}
                </span>
              )}
              {flagged[currentQuestion?._id] && (
                <span className="badge badge-warning">Flagged</span>
              )}
            </div>

            {/* Question text */}
            <p className="text-surface-800 text-base leading-relaxed mb-6 font-medium">
              {currentQuestion?.text}
            </p>

            {/* Type-aware answer input — dispatches to correct UI per questionType */}
            <QuestionRenderer
              question={currentQuestion}
              answer={answers[currentQuestion?._id]}
              onChange={handleAnswer}
            />
          </div>

          {/* Navigation buttons */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => goTo(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="btn btn-secondary"
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <button onClick={handleFlag} className={`btn ${flagged[currentQuestion?._id] ? 'btn-primary' : 'btn-ghost'} btn-sm`}>
              <Flag size={14} />
              {flagged[currentQuestion?._id] ? 'Unflag' : 'Flag'}
            </button>

            {currentIndex < total - 1 ? (
              <button onClick={() => goTo(currentIndex + 1)} className="btn btn-secondary">
                Next <ChevronRight size={16} />
              </button>
            ) : (
              <button
                onClick={() => setShowConfirm(true)}
                className="btn btn-primary"
                disabled={submitting}
              >
                <Send size={15} /> Submit
              </button>
            )}
          </div>
        </div>

        {/* ─── Question Palette ────────────────────────────────────────────── */}
        <div className="card card-sm">
          <div className="text-sm font-semibold text-surface-700 mb-3">Question Navigator</div>
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {(sessionData?.questions || []).map((q, i) => {
              const st = getStatus(q._id);
              return (
                <button
                  key={q._id}
                  id={`palette-q${i + 1}`}
                  onClick={() => goTo(i)}
                  className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all
                    ${i === currentIndex ? 'border-primary-500 bg-primary-50 text-primary-700' :
                      st === 'answered' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                      st === 'flagged' ? 'border-amber-500 bg-amber-50 text-amber-700' :
                      'border-surface-200 bg-white text-surface-500 hover:border-surface-300'
                    }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1.5 text-xs text-surface-500">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-emerald-50 border border-emerald-500" />
              Answered
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-amber-50 border border-amber-500" />
              Flagged
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded bg-white border border-surface-200" />
              Not answered
            </div>
          </div>

          <div className="divider my-3" />

          <button
            id="submit-session-btn"
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
            className="btn btn-primary w-full btn-sm"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit Test
          </button>
        </div>
      </div>

      {/* ─── Confirm Submit Modal ────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm animate-fade-in">
            <h3 className="text-surface-800 font-bold text-lg mb-2">Submit Practice Session?</h3>
            <p className="text-surface-600 text-sm mb-4">
              You've answered <strong className="text-surface-800">{answered}</strong> of{' '}
              <strong className="text-surface-800">{total}</strong> questions.
              {unanswered > 0 && (
                <span className="text-amber-400"> {unanswered} question{unanswered > 1 ? 's' : ''} unanswered.</span>
              )}
            </p>
            {error && (
              <div className="alert alert-error text-xs mb-3">
                <AlertCircle size={13} />
                <span>{error}</span>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => { setShowConfirm(false); setError(''); }} className="btn btn-secondary flex-1">
                Continue
              </button>
              <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary flex-1">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                {submitting ? 'Submitting...' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
