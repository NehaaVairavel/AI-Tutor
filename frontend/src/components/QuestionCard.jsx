import { useState, useCallback } from 'react';
import { CheckCircle2, XCircle, Eye, Send, Loader2, BookOpen, Zap, Tag } from 'lucide-react';
import api from '../services/api';

const DIFFICULTY_COLORS = {
  easy:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  medium: 'bg-amber-50   text-amber-700   border-amber-200',
  hard:   'bg-red-50     text-red-700     border-red-200',
};

const OPTION_KEYS = ['A', 'B', 'C', 'D'];

// ─── AnswerSection ────────────────────────────────────────────────────────────
function AnswerSection({ result, selectedOption, options }) {
  const { isCorrect, correctAnswer, correctAnswerText, explanation, steps, formula, revealed } = result;
  return (
    <div className="mt-4 border-t border-surface-100 pt-4 space-y-3">
      {/* Outcome badge */}
      {selectedOption && !revealed && (
        <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium
          ${isCorrect
            ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
            : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {isCorrect
            ? <CheckCircle2 size={16} className="flex-shrink-0" />
            : <XCircle size={16} className="flex-shrink-0" />}
          {isCorrect
            ? 'Correct! Well done.'
            : `Incorrect. You selected ${selectedOption}) ${options[selectedOption]}`}
        </div>
      )}
      {revealed && !selectedOption && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium bg-blue-50 border border-blue-200 text-blue-700">
          <Eye size={16} className="flex-shrink-0" />
          Answer revealed without submission.
        </div>
      )}

      {/* Correct answer highlight */}
      <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200">
        <CheckCircle2 size={14} className="text-emerald-600 mt-0.5 flex-shrink-0" />
        <div className="text-sm">
          <span className="font-semibold text-emerald-700">Correct answer: </span>
          <span className="text-emerald-800">{correctAnswer}) {correctAnswerText}</span>
        </div>
      </div>

      {/* Formula */}
      {formula && (
        <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200">
          <Zap size={13} className="text-violet-500 mt-0.5 flex-shrink-0" />
          <div className="text-xs text-violet-700">
            <span className="font-semibold">Formula: </span>{formula}
          </div>
        </div>
      )}

      {/* Step-by-step */}
      {steps && steps.length > 0 && (
        <div>
          <div className="flex items-center gap-1.5 mb-1.5 text-xs font-semibold text-surface-600 uppercase tracking-wide">
            <BookOpen size={11} /> Step-by-step
          </div>
          <ol className="space-y-1 pl-4">
            {steps.map((step, i) => (
              <li key={i} className="text-xs text-surface-700 leading-relaxed list-decimal">
                {step}
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Explanation */}
      {explanation && (
        <div className="text-xs text-surface-600 leading-relaxed border-l-2 border-surface-200 pl-3">
          {explanation}
        </div>
      )}
    </div>
  );
}

// ─── QuestionCard ─────────────────────────────────────────────────────────────
export default function QuestionCard({ message, sessionId }) {
  const q = message.question; // public fields: {type, topic, difficulty, question, options}

  const [selectedOption, setSelectedOption] = useState(null);
  const [result, setResult]                 = useState(null);
  const [loading, setLoading]               = useState(false);
  const [error, setError]                   = useState('');

  const handleSubmit = useCallback(async () => {
    if (!selectedOption || loading || result) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post(
        `/tutor/sessions/${sessionId}/question/${message._id}/submit`,
        { selectedOption }
      );
      setResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit answer. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [selectedOption, loading, result, sessionId, message._id]);

  const handleReveal = useCallback(async () => {
    if (loading || result) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post(
        `/tutor/sessions/${sessionId}/question/${message._id}/reveal`,
        {}
      );
      setResult(res.data.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reveal answer. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [loading, result, sessionId, message._id]);

  if (!q) return null;

  return (
    <div className="w-full max-w-xl rounded-xl border border-surface-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-violet-50 border-b border-violet-100">
        <BookOpen size={13} className="text-violet-600" />
        <span className="text-xs font-semibold text-violet-700 flex-1">Practice Question</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${DIFFICULTY_COLORS[q.difficulty] || DIFFICULTY_COLORS.medium}`}>
          {q.difficulty}
        </span>
        {q.topic && (
          <span className="flex items-center gap-1 text-xs text-surface-500">
            <Tag size={10} /> {q.topic}
          </span>
        )}
      </div>

      <div className="px-4 py-4">
        {/* Question text */}
        <p className="text-sm font-medium text-surface-800 leading-relaxed mb-4">
          {q.question}
        </p>

        {/* Options */}
        <fieldset disabled={!!result || loading} className="space-y-2">
          <legend className="sr-only">Select your answer</legend>
          {OPTION_KEYS.map(key => {
            const isChosen  = selectedOption === key;
            const isCorrect = result && result.correctAnswer === key;
            const isWrong   = result && !result.revealed && isChosen && !isCorrect;

            let optionClass = 'border-surface-200 hover:border-primary-400 hover:bg-primary-50';
            if (isChosen && !result)  optionClass = 'border-primary-500 bg-primary-50';
            if (isCorrect && result)  optionClass = 'border-emerald-500 bg-emerald-50';
            if (isWrong)              optionClass = 'border-red-400 bg-red-50';

            return (
              <label
                key={key}
                htmlFor={`option-${message._id}-${key}`}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all text-sm
                  ${optionClass} ${result ? 'cursor-default' : 'cursor-pointer'}`}
              >
                <input
                  id={`option-${message._id}-${key}`}
                  type="radio"
                  name={`question-${message._id}`}
                  value={key}
                  checked={isChosen}
                  onChange={() => !result && setSelectedOption(key)}
                  className="accent-primary-600 w-3.5 h-3.5 flex-shrink-0"
                  tabIndex={result ? -1 : 0}
                  aria-label={`Option ${key}: ${q.options[key]}`}
                />
                <span className="font-semibold text-surface-500 w-4 flex-shrink-0">{key})</span>
                <span className="text-surface-700 flex-1">{q.options[key]}</span>
                {isCorrect && result && <CheckCircle2 size={14} className="text-emerald-600 flex-shrink-0" />}
                {isWrong            && <XCircle       size={14} className="text-red-500     flex-shrink-0" />}
              </label>
            );
          })}
        </fieldset>

        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

        {/* Action buttons — only before result */}
        {!result && (
          <div className="flex gap-2 mt-4">
            <button
              id={`submit-answer-${message._id}`}
              onClick={handleSubmit}
              disabled={!selectedOption || loading}
              className="btn btn-primary btn-sm flex-1"
              aria-label="Submit your selected answer"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              Submit Answer
            </button>
            <button
              id={`reveal-answer-${message._id}`}
              onClick={handleReveal}
              disabled={loading}
              className="btn btn-ghost btn-sm"
              aria-label="Reveal the correct answer without submitting"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />}
              Reveal
            </button>
          </div>
        )}

        {/* Answer reveal */}
        {result && (
          <AnswerSection
            result={result}
            selectedOption={result.revealed ? null : selectedOption}
            options={q.options}
          />
        )}
      </div>

      <div className="px-4 pb-2 text-xs text-surface-400">
        {new Date(message.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  );
}
