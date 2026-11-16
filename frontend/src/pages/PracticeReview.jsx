import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  CheckCircle, XCircle, MinusCircle, ChevronLeft, ChevronRight,
  Brain, BookOpen, Loader2, AlertCircle, RotateCcw, Sparkles,
  Clock, Target, BarChart2, Flag, Info
} from 'lucide-react';
import { practiceService } from '../services';
import ReviewRenderer from '../components/ReviewRenderer';
// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(secs) {
  if (!secs && secs !== 0) return '—';
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    weekday: 'short', day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StatusIcon({ isSkipped, isCorrect }) {
  if (isSkipped === null || isSkipped === undefined) {
    return <Info size={18} className="text-surface-400 flex-shrink-0" />;
  }
  if (isSkipped)  return <MinusCircle size={18} className="text-surface-400 flex-shrink-0" />;
  if (isCorrect)  return <CheckCircle  size={18} className="text-emerald-400 flex-shrink-0" />;
  return               <XCircle       size={18} className="text-red-400    flex-shrink-0" />;
}

function OptionRow({ opt, selectedAnswer, correctAnswer, isSkipped, isLegacy }) {
  const isCorrectOpt  = opt.key === correctAnswer;
  const isSelectedOpt = opt.key === selectedAnswer;
  const isWrongSelect = isSelectedOpt && !isSkipped && opt.key !== correctAnswer;

  let cls = 'option-btn pointer-events-none text-sm py-2.5 transition-colors ';
  if (isCorrectOpt)  cls += 'correct ';
  if (isWrongSelect) cls += 'wrong ';

  let keyBg = '';
  if (isCorrectOpt)  keyBg = 'bg-emerald-50 border-emerald-300 text-emerald-700';
  else if (isWrongSelect) keyBg = 'bg-red-50 border-red-300 text-red-700';

  return (
    <div className={cls}>
      <span className={`option-key text-xs ${keyBg}`}>{opt.key}</span>
      <span className="leading-relaxed flex-1">{opt.text}</span>
      <div className="flex items-center gap-1 ml-2 flex-shrink-0 text-xs">
        {!isLegacy && isCorrectOpt  && isSelectedOpt  && (
          <span className="text-emerald-600 font-semibold">✓ Your answer · Correct</span>
        )}
        {!isLegacy && isCorrectOpt  && !isSelectedOpt && (
          <span className="text-emerald-600 font-semibold">✓ Correct answer</span>
        )}
        {!isLegacy && isWrongSelect && (
          <span className="text-red-500 font-semibold">✗ Your answer</span>
        )}
        {isLegacy  && isCorrectOpt  && (
          <span className="text-emerald-600 font-semibold">✓ Correct</span>
        )}
      </div>
    </div>
  );
}

function ExplanationBlock({ explanation, sessionId, questionIndex, onGenerated }) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [demo,    setDemo]    = useState(false);

  const handleGenerate = async () => {
    setLoading(true);
    setError('');
    setDemo(false);
    try {
      const r = await practiceService.explainQuestion(sessionId, questionIndex);
      const { explanation: gen, demoMode, hint } = r.data.data;
      if (demoMode) {
        setDemo(true);
        setError(hint || 'AI explanation unavailable in demo mode. Add AI_API_KEY to backend/.env.');
      } else {
        onGenerated(questionIndex, gen);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to generate explanation. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (explanation) {
    return (
      <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={13} className="text-primary-500" />
          <span className="text-xs font-semibold text-primary-600 uppercase tracking-wide">Explanation</span>
        </div>
        <p className="text-surface-600 text-sm leading-relaxed whitespace-pre-wrap">{explanation}</p>
      </div>
    );
  }

  return (
    <div className="border border-surface-200 rounded-lg p-4 bg-surface-50">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <span className="text-xs text-surface-400 italic">No explanation stored for this question.</span>
        <button
          onClick={handleGenerate}
          disabled={loading}
          className="btn btn-secondary btn-sm text-xs flex items-center gap-1.5 flex-shrink-0"
        >
          {loading
            ? <><Loader2 size={12} className="animate-spin" /> Generating…</>
            : <><Sparkles size={12} /> Generate with AI</>
          }
        </button>
      </div>
      {error && (
        <div className={`mt-2 text-xs ${demo ? 'text-amber-600' : 'text-red-500'}`}>
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Legacy Banner ─────────────────────────────────────────────────────────────
function LegacyBanner({ note }) {
  return (
    <div className="alert border border-amber-300 bg-amber-50 text-amber-800 rounded-xl p-4 text-sm">
      <Info size={16} className="flex-shrink-0 text-amber-500" />
      <div>
        <div className="font-semibold mb-0.5">Older Session — Limited Review Data</div>
        <div className="text-amber-700 text-xs">{note}</div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function PracticeReview() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  // Cache AI-generated explanations in component state (not persisted)
  const [generatedExplanations, setGeneratedExplanations] = useState({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    practiceService.getSessionReview(sessionId)
      .then(r => {
        if (!cancelled) setData(r.data.data);
      })
      .catch(err => {
        if (!cancelled) {
          const msg = err.response?.data?.message;
          const status = err.response?.status;
          if (status === 404) {
            setError('This practice session was not found, or it has not been completed yet.');
          } else if (status === 400) {
            setError('Invalid session ID.');
          } else {
            setError(msg || 'Failed to load review. Please try again.');
          }
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [sessionId]);

  const handleExplanationGenerated = useCallback((idx, text) => {
    setGeneratedExplanations(prev => ({ ...prev, [idx]: text }));
  }, []);

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <div className="spinner spinner-lg" />
        <p className="text-surface-500 text-sm">Loading answer review…</p>
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 max-w-md mx-auto text-center">
        <AlertCircle size={40} className="text-red-400" />
        <div>
          <p className="text-surface-700 font-semibold mb-1">Could not load review</p>
          <p className="text-surface-500 text-sm">{error || 'Review not available.'}</p>
        </div>
        <button onClick={() => navigate('/practice')} className="btn btn-primary">
          <ChevronLeft size={15} /> Back to Practice
        </button>
      </div>
    );
  }

  const { session, reviewItems, isLegacy, legacyNote } = data;
  const r     = session.result || {};
  const total = reviewItems.length;

  // ── Empty — session completed but no questions stored ─────────────────────
  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 max-w-md mx-auto text-center">
        <BookOpen size={40} className="text-surface-300" />
        <div>
          <p className="text-surface-700 font-semibold mb-1">No question data available</p>
          <p className="text-surface-500 text-sm">
            This session was completed but no question data was stored for review.
          </p>
        </div>
        <button onClick={() => navigate('/practice')} className="btn btn-primary">
          Back to Practice
        </button>
      </div>
    );
  }

  const currentItem = reviewItems[currentIndex];
  const explanation = generatedExplanations[currentIndex] || currentItem?.explanation || '';

  const goTo = (i) => setCurrentIndex(Math.max(0, Math.min(total - 1, i)));
  const prev = () => goTo(currentIndex - 1);
  const next = () => goTo(currentIndex + 1);

  return (
    <div className="flex flex-col gap-5 max-w-4xl">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <button
              onClick={() => navigate('/practice')}
              className="text-surface-400 hover:text-surface-600 transition-colors"
            >
              <ChevronLeft size={18} />
            </button>
            <h1 className="text-xl font-bold text-surface-900">Answer Review</h1>
            {isLegacy && (
              <span className="badge badge-warning text-xs">Legacy</span>
            )}
          </div>
          <p className="text-surface-500 text-sm">
            {session.subject?.name}
            {session.topic?.name  ? ` — ${session.topic.name}`    : ''}
            {session.difficulty   ? ` · ${session.difficulty}`     : ''}
            {session.completedAt  ? ` · ${formatDate(session.completedAt)}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/practice" className="btn btn-secondary btn-sm">
            <RotateCcw size={14} /> Practice Again
          </Link>
          <Link to="/analytics" className="btn btn-ghost btn-sm">
            <BarChart2 size={14} /> Analytics
          </Link>
        </div>
      </div>

      {/* ─── Legacy banner ───────────────────────────────────────────────────── */}
      {isLegacy && legacyNote && <LegacyBanner note={legacyNote} />}

      {/* ─── Score Summary ───────────────────────────────────────────────────── */}
      {!isLegacy && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {[
            { label: 'Correct',  value: r.correct  || 0, cls: 'text-emerald-600', icon: CheckCircle },
            { label: 'Wrong',    value: r.wrong    || 0, cls: 'text-red-500',     icon: XCircle },
            { label: 'Skipped',  value: r.skipped  || 0, cls: 'text-surface-400', icon: MinusCircle },
            { label: 'Accuracy', value: `${r.accuracy || 0}%`, cls: 'text-primary-600', icon: Target },
            { label: 'Time',     value: formatTime(r.timeTaken), cls: 'text-violet-600', icon: Clock },
          ].map(({ label, value, cls, icon: Icon }) => (
            <div key={label} className="stat-card text-center items-center">
              <Icon size={16} className={cls} />
              <div className={`font-bold text-lg ${cls}`}>{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      {isLegacy && r && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Total Qs',  value: r.totalQuestions || total, cls: 'text-surface-600' },
            { label: 'Score',     value: `${(r.marksObtained ?? 0).toFixed(1)}/${r.totalMarks || 0}`, cls: 'text-primary-600' },
            { label: 'Accuracy',  value: `${r.accuracy || 0}%`, cls: r.accuracy >= 60 ? 'text-emerald-600' : 'text-red-500' },
            { label: 'Time',      value: formatTime(r.timeTaken), cls: 'text-violet-600' },
          ].map(({ label, value, cls }) => (
            <div key={label} className="stat-card text-center items-center">
              <div className={`font-bold text-lg ${cls}`}>{value}</div>
              <div className="stat-label">{label}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        {/* ─── Question Panel ─────────────────────────────────────────────── */}
        <div className="md:col-span-2 flex flex-col gap-4">
          {currentItem && (
            <div className={`card border-l-4 ${
              currentItem.isSkipped === null ? 'border-l-amber-400' :
              currentItem.isSkipped          ? 'border-l-surface-400' :
              currentItem.isCorrect          ? 'border-l-emerald-500' : 'border-l-red-500'
            }`}>
              {/* Question meta */}
              <div className="flex items-center gap-2 mb-4 flex-wrap">
                <StatusIcon
                  isSkipped={isLegacy ? null : currentItem.isSkipped}
                  isCorrect={isLegacy ? null : currentItem.isCorrect}
                />
                {!isLegacy && (
                  <span className="text-xs font-semibold text-surface-500">
                    {currentItem.isSkipped ? 'Skipped' :
                     currentItem.isCorrect ? 'Correct'  : 'Incorrect'}
                  </span>
                )}
                {isLegacy && (
                  <span className="text-xs text-surface-400 italic">Answer not recorded</span>
                )}
                {currentItem.difficulty && (
                  <span className={`badge badge-sm diff-${currentItem.difficulty}`}>
                    {currentItem.difficulty}
                  </span>
                )}
                {currentItem.topicName && (
                  <span className="badge badge-gray text-xs">{currentItem.topicName}</span>
                )}
                {!isLegacy && currentItem.marksAwarded !== null && currentItem.marksAwarded !== undefined && !currentItem.isSkipped && (
                  <span className="ml-auto text-xs font-mono">
                    {currentItem.marksAwarded > 0
                      ? <span className="text-emerald-500">+{currentItem.marksAwarded}</span>
                      : currentItem.marksAwarded < 0
                      ? <span className="text-red-500">{Number(currentItem.marksAwarded).toFixed(2)}</span>
                      : <span className="text-surface-400">0</span>
                    }
                  </span>
                )}
              </div>

              {/* Question text */}
              <p className="text-surface-800 text-base leading-relaxed mb-5 font-medium">
                {currentItem.text}
              </p>

              {/* Type-aware answer display */}
              {(currentItem.options && currentItem.options.length > 0) || currentItem.questionType === 'matching' || currentItem.questionType === 'fill_blank' ? (
                <div className="mb-5">
                  <ReviewRenderer item={currentItem} isLegacy={isLegacy} />
                </div>
              ) : (
                <div className="text-xs text-surface-400 italic mb-5">
                  Answer options are not available for this question.
                </div>
              )}

              {/* Skipped notice */}
              {!isLegacy && currentItem.isSkipped && (
                <div className="alert alert-info text-xs mb-4">
                  <Flag size={13} />
                  <span>
                    This question was skipped.
                    {currentItem.correctAnswer && typeof currentItem.correctAnswer === 'string'
                      ? <> The correct answer is <strong>{currentItem.correctAnswer}</strong>.</>
                      : null}
                  </span>
                </div>
              )}

              {/* Legacy notice: cannot show user's answer */}
              {isLegacy && (
                <div className="alert border-amber-200 bg-amber-50 text-amber-700 text-xs mb-4 rounded-lg">
                  <Info size={13} />
                  <span>Your selected answer was not recorded for this session.</span>
                </div>
              )}

              {/* Explanation */}
              {!isLegacy ? (
                <ExplanationBlock
                  explanation={explanation}
                  sessionId={sessionId}
                  questionIndex={currentIndex}
                  onGenerated={handleExplanationGenerated}
                />
              ) : explanation ? (
                <div className="bg-primary-50 border border-primary-200 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Brain size={13} className="text-primary-500" />
                    <span className="text-xs font-semibold text-primary-600 uppercase tracking-wide">Explanation</span>
                  </div>
                  <p className="text-surface-600 text-sm leading-relaxed">{explanation}</p>
                </div>
              ) : null}
            </div>
          )}

          {/* Prev / Next */}
          <div className="flex items-center justify-between">
            <button
              onClick={prev}
              disabled={currentIndex === 0}
              className="btn btn-secondary"
            >
              <ChevronLeft size={16} /> Previous
            </button>
            <span className="text-sm text-surface-500 font-mono">
              {currentIndex + 1} / {total}
            </span>
            <button
              onClick={next}
              disabled={currentIndex === total - 1}
              className="btn btn-secondary"
            >
              Next <ChevronRight size={16} />
            </button>
          </div>
        </div>

        {/* ─── Question Palette ─────────────────────────────────────────────── */}
        <div className="card card-sm h-fit sticky top-4">
          <div className="text-sm font-semibold text-surface-700 mb-3">Question Navigator</div>
          <div className="grid grid-cols-5 gap-1.5 mb-4">
            {reviewItems.map((item, i) => {
              let btnCls = 'w-9 h-9 rounded-lg text-xs font-bold border transition-all ';
              if (i === currentIndex) {
                btnCls += 'border-primary-500 bg-primary-50 text-primary-700 ring-1 ring-primary-400 ';
              } else if (isLegacy) {
                btnCls += 'border-surface-300 bg-surface-100 text-surface-500 ';
              } else if (item.isSkipped) {
                btnCls += 'border-surface-300 bg-surface-100 text-surface-400 ';
              } else if (item.isCorrect) {
                btnCls += 'border-emerald-400 bg-emerald-50 text-emerald-700 ';
              } else {
                btnCls += 'border-red-400 bg-red-50 text-red-600 ';
              }
              return (
                <button
                  key={i}
                  id={`review-q${i + 1}`}
                  onClick={() => goTo(i)}
                  className={btnCls}
                  title={isLegacy ? `Question ${i + 1}` : item.isSkipped ? 'Skipped' : item.isCorrect ? 'Correct' : 'Wrong'}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          {/* Legend */}
          {!isLegacy && (
            <div className="flex flex-col gap-1.5 text-xs text-surface-500 mb-3">
              {[
                { bg: 'bg-emerald-50 border-emerald-400',  label: 'Correct' },
                { bg: 'bg-red-50 border-red-400',          label: 'Wrong' },
                { bg: 'bg-surface-100 border-surface-300', label: 'Skipped' },
              ].map(({ bg, label }) => (
                <div key={label} className="flex items-center gap-1.5">
                  <div className={`w-3 h-3 rounded border ${bg}`} />
                  {label}
                </div>
              ))}
            </div>
          )}

          <div className="divider my-3" />

          <div className="flex flex-col gap-2 text-xs text-surface-600">
            <div className="flex justify-between">
              <span>Score</span>
              <span className="font-semibold text-surface-800">
                {(r.marksObtained ?? 0).toFixed(1)}/{r.totalMarks || 0}
              </span>
            </div>
            <div className="flex justify-between">
              <span>Accuracy{!isLegacy ? '*' : ''}</span>
              <span className="font-semibold text-surface-800">{r.accuracy || 0}%</span>
            </div>
            {!isLegacy && r.negativeMarks > 0 && (
              <div className="flex justify-between">
                <span>Neg. marks</span>
                <span className="font-semibold text-red-500">-{r.negativeMarks}</span>
              </div>
            )}
            {!isLegacy && (
              <div className="text-surface-400 text-[10px] mt-1">
                *Accuracy = correct ÷ answered (skipped excluded)
              </div>
            )}
          </div>

          <div className="divider my-3" />

          <Link to="/practice" className="btn btn-primary btn-sm w-full">
            <BookOpen size={13} /> Practice Again
          </Link>
        </div>
      </div>
    </div>
  );
}
