import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Flag, Send, Clock,
  CheckCircle, Circle, AlertCircle, Loader2, Trophy
} from 'lucide-react';
import { mockTestService } from '../services';

/**
 * Dedicated Mock Test session page.
 * Route: /mock-tests/:testId/session
 * State: attemptId is passed via location.state (set by MockTests on start).
 * On refresh: re-fetches the attempt from the backend.
 */

function formatTime(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export default function MockTestSession() {
  const { testId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Passed from MockTests page on start
  const passedState = location.state || {};

  const [questions, setQuestions] = useState(passedState.questions || null);
  const [attemptId, setAttemptId] = useState(passedState.attemptId || null);
  const [mockTestInfo, setMockTestInfo] = useState(passedState.mockTest || null);

  const [answers, setAnswers] = useState({});   // { questionId: selectedKey }
  const [flagged, setFlagged] = useState({});   // { questionId: bool }
  const [questionTimes, setQuestionTimes] = useState({});

  const [currentIndex, setCurrentIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(null);  // countdown in seconds
  const [elapsed, setElapsed]   = useState(0);     // elapsed in seconds (for submission)

  const [loading, setLoading] = useState(!passedState.questions);
  const [submitting, setSubmitting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState('');

  const timerRef = useRef(null);
  const questionStartRef = useRef(Date.now());
  const submittedRef = useRef(false); // guard against double-submit from timer

  // ── Load session on mount (or page refresh) ─────────────────────────────────
  useEffect(() => {
    if (passedState.questions && passedState.attemptId) {
      // Came via navigation — data already in state
      setLoading(false);
      return;
    }

    // Page refresh or direct navigation — re-start the test
    setLoading(true);
    mockTestService.startAttempt(testId)
      .then(r => {
        const d = r.data.data;
        setQuestions(d.questions);
        setAttemptId(d.attempt._id);
        setMockTestInfo(d.mockTest);
      })
      .catch(err => {
        setError(err.response?.data?.message || 'Failed to load mock test. Please go back and try again.');
      })
      .finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testId]);

  // ── Initialize countdown once test info + questions are ready ────────────────
  useEffect(() => {
    if (!mockTestInfo || !questions) return;
    const durationSecs = (mockTestInfo.duration || 0) * 60;
    setTimeLeft(durationSecs);
  }, [mockTestInfo, questions]);

  // ── Countdown timer ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (timeLeft === null) return;
    if (timeLeft <= 0) {
      // Time's up — auto-submit
      if (!submittedRef.current) {
        submittedRef.current = true;
        handleSubmit(true);
      }
      return;
    }
    timerRef.current = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(timerRef.current);
          if (!submittedRef.current) {
            submittedRef.current = true;
            handleSubmit(true);
          }
          return 0;
        }
        return t - 1;
      });
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(timerRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft !== null]); // run once when timeLeft is first set

  const currentQuestion = questions?.[currentIndex];
  const total = questions?.length || 0;

  const getStatus = (qId) => {
    if (flagged[qId]) return 'flagged';
    if (answers[qId])  return 'answered';
    return 'unanswered';
  };

  const handleAnswer = (key) => {
    if (!currentQuestion || submitting) return;
    setAnswers(p => ({ ...p, [currentQuestion._id]: key }));
  };

  const handleFlag = () => {
    if (!currentQuestion) return;
    setFlagged(p => ({ ...p, [currentQuestion._id]: !p[currentQuestion._id] }));
  };

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

  const handleSubmit = async (autoSubmit = false) => {
    if (submitting) return;
    recordQuestionTime();
    clearInterval(timerRef.current);
    setSubmitting(true);
    setShowConfirm(false);

    try {
      const formattedAnswers = Object.entries(answers).map(([questionId, selectedAnswer]) => ({
        questionId,
        selectedAnswer,
        timeTaken: questionTimes[questionId] || 0,
        markedForReview: Boolean(flagged[questionId]),
      }));

      const res = await mockTestService.submitAttempt(attemptId, {
        answers: formattedAnswers,
        timeTaken: elapsed,
      });

      const savedAttemptId = res.data.data.attemptId || attemptId;
      navigate(`/mock-tests/attempts/${savedAttemptId}/result`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Submission failed. Please try again.');
      setSubmitting(false);
      submittedRef.current = false;
    }
  };

  const answered = Object.keys(answers).length;
  const unanswered = total - answered;

  // ── Loading state ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="spinner spinner-lg" />
        <p className="text-surface-500 text-sm">Loading mock test…</p>
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────────────
  if (error && !questions) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-surface-600 text-center max-w-md">{error}</p>
        <button onClick={() => navigate('/mock-tests')} className="btn btn-primary">
          Back to Mock Tests
        </button>
      </div>
    );
  }

  if (!questions || questions.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20">
        <Trophy size={40} className="text-amber-400 opacity-50" />
        <p className="text-surface-600">No questions found in this mock test.</p>
        <button onClick={() => navigate('/mock-tests')} className="btn btn-secondary">
          Back to Mock Tests
        </button>
      </div>
    );
  }

  const timerWarning = timeLeft !== null && timeLeft <= 300; // last 5 minutes

  return (
    <div className="flex flex-col gap-4 max-w-4xl">
      {/* In-session error banner */}
      {error && (
        <div className="alert alert-error text-xs">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ─── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="badge badge-primary font-semibold">
            {currentIndex + 1} / {total}
          </div>
          <div className="flex items-center gap-1.5 text-sm text-surface-400">
            <span className="text-emerald-400 font-semibold">{answered}</span> answered
            <span className="text-surface-600 mx-1">·</span>
            <span className="text-surface-500">{unanswered}</span> remaining
          </div>
          {mockTestInfo?.title && (
            <span className="text-xs text-surface-400 hidden sm:block truncate max-w-32">
              {mockTestInfo.title}
            </span>
          )}
        </div>

        {/* Countdown timer */}
        {timeLeft !== null && (
          <div className={`flex items-center gap-2 font-mono text-sm px-3 py-1.5 rounded-lg border transition-colors ${
            timerWarning
              ? 'text-red-400 border-red-300 bg-red-50 animate-pulse'
              : 'text-surface-700 border-surface-200 bg-surface-50'
          }`}>
            <Clock size={14} />
            {formatTime(timeLeft)}
          </div>
        )}
      </div>

      {/* Progress bar */}
      <div className="progress-bar">
        <div className="progress-fill" style={{ width: `${(answered / total) * 100}%` }} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        {/* ─── Question Panel ────────────────────────────────────────────────── */}
        <div className="md:col-span-2 flex flex-col gap-4">
          <div className="card">
            {/* Question meta */}
            <div className="flex items-center gap-2 mb-4">
              {currentQuestion?.difficulty && (
                <span className={`badge badge-sm diff-${currentQuestion.difficulty}`}>
                  {currentQuestion.difficulty}
                </span>
              )}
              {currentQuestion?.topic?.name && (
                <span className="badge badge-gray text-xs">{currentQuestion.topic.name}</span>
              )}
              {flagged[currentQuestion?._id] && (
                <span className="badge badge-warning">Flagged</span>
              )}
            </div>

            {/* Question text */}
            <p className="text-surface-800 text-base leading-relaxed mb-6 font-medium">
              {currentQuestion?.text}
            </p>

            {/* Options */}
            <div className="flex flex-col gap-3">
              {(currentQuestion?.options || []).map(opt => (
                <button
                  key={opt.key}
                  className={`option-btn ${answers[currentQuestion._id] === opt.key ? 'selected' : ''}`}
                  onClick={() => handleAnswer(opt.key)}
                  disabled={submitting}
                >
                  <span className={`option-key ${answers[currentQuestion._id] === opt.key ? 'bg-primary-900 border-primary-700 text-primary-300' : ''}`}>
                    {opt.key}
                  </span>
                  <span className="leading-relaxed">{opt.text}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Navigation */}
          <div className="flex items-center justify-between">
            <button
              onClick={() => goTo(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0 || submitting}
              className="btn btn-secondary"
            >
              <ChevronLeft size={16} /> Previous
            </button>

            <button
              onClick={handleFlag}
              className={`btn ${flagged[currentQuestion?._id] ? 'btn-primary' : 'btn-ghost'} btn-sm`}
              disabled={submitting}
            >
              <Flag size={14} />
              {flagged[currentQuestion?._id] ? 'Unflag' : 'Flag'}
            </button>

            {currentIndex < total - 1 ? (
              <button
                onClick={() => goTo(currentIndex + 1)}
                disabled={submitting}
                className="btn btn-secondary"
              >
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

        {/* ─── Question Palette ────────────────────────────────────────────────── */}
        <div className="card card-sm">
          <div className="text-sm font-semibold text-surface-700 mb-3">Question Navigator</div>
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {(questions || []).map((q, i) => {
              const st = getStatus(q._id);
              return (
                <button
                  key={q._id}
                  onClick={() => goTo(i)}
                  disabled={submitting}
                  className={`w-9 h-9 rounded-lg text-xs font-bold border transition-all
                    ${i === currentIndex ? 'border-primary-500 bg-primary-50 text-primary-700' :
                      st === 'answered' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' :
                      st === 'flagged'  ? 'border-amber-500  bg-amber-50  text-amber-700' :
                      'border-surface-200 bg-white text-surface-500 hover:border-surface-300'
                    }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex flex-col gap-1.5 text-xs text-surface-500 mb-4">
            {[
              { color: 'bg-emerald-50 border-emerald-500', label: 'Answered' },
              { color: 'bg-amber-50 border-amber-500',   label: 'Flagged' },
              { color: 'bg-white border-surface-200',    label: 'Not answered' },
            ].map(({ color, label }) => (
              <div key={label} className="flex items-center gap-1.5">
                <div className={`w-3 h-3 rounded border ${color}`} />
                {label}
              </div>
            ))}
          </div>

          <div className="divider my-2" />

          <button
            onClick={() => setShowConfirm(true)}
            disabled={submitting}
            className="btn btn-primary w-full btn-sm"
          >
            {submitting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
            Submit Test
          </button>

          {mockTestInfo?.negativeMarking && (
            <p className="text-xs text-red-400 mt-2 text-center">
              ⚠ Negative marking: −{mockTestInfo.negativeMarkingValue} per wrong answer
            </p>
          )}
        </div>
      </div>

      {/* ─── Confirm Submit Modal ──────────────────────────────────────────────── */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm animate-fade-in">
            <div className="flex items-center gap-2 mb-3">
              <Trophy size={20} className="text-amber-400" />
              <h3 className="text-surface-800 font-bold text-lg">Submit Mock Test?</h3>
            </div>
            <p className="text-surface-600 text-sm mb-1">
              You've answered <strong className="text-surface-800">{answered}</strong> of{' '}
              <strong className="text-surface-800">{total}</strong> questions.
            </p>
            {unanswered > 0 && (
              <p className="text-amber-500 text-sm mb-4">
                {unanswered} question{unanswered > 1 ? 's' : ''} left unanswered.
              </p>
            )}
            {!unanswered && <div className="mb-4" />}
            <p className="text-surface-500 text-xs mb-4">
              Once submitted, you cannot change your answers.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirm(false)} className="btn btn-secondary flex-1">
                Continue
              </button>
              <button onClick={() => handleSubmit(false)} disabled={submitting} className="btn btn-primary flex-1">
                {submitting ? <Loader2 size={15} className="animate-spin" /> : null}
                {submitting ? 'Submitting…' : 'Submit'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
