/**
 * QuestionRenderer.jsx
 * --------------------
 * Dispatches to the correct interactive input component based on questionType.
 * Used during an active practice session (before submission).
 *
 * Props:
 *   question     - Question object from the API (no correctAnswer exposed)
 *   answer       - Current saved answer for this question (type-specific)
 *   onChange     - (newAnswer) => void  — called when student changes answer
 *
 * Answer formats per type:
 *   single_choice / mcq / true_false / assertion_reason / statement_based
 *     → string (option key, e.g. "A")
 *   multiple_select
 *     → string[] (e.g. ["A","C"])
 *   matching
 *     → object (e.g. { "1": "a", "2": "b" })
 *   fill_blank
 *     → string[] (one entry per blank index)
 *   passage_based
 *     → rendered as passage text only; sub-questions are separate items
 */

import { useCallback } from 'react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function TypeBadge({ questionType }) {
  const labels = {
    single_choice:   'Single Choice',
    mcq:             'MCQ',
    multiple_select: 'Multiple Select',
    matching:        'Match the Following',
    true_false:      'True / False',
    fill_blank:      'Fill in the Blank',
    assertion_reason:'Assertion & Reason',
    statement_based: 'Statement Based',
    passage_based:   'Passage Based',
  };
  const label = labels[questionType] || questionType;
  return (
    <span className="badge badge-sm bg-violet-100 text-violet-700 border-violet-200">
      {label}
    </span>
  );
}

// ─── Single Choice (MCQ) ──────────────────────────────────────────────────────

function SingleChoiceInput({ question, answer, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      {(question.options || []).map(opt => (
        <button
          key={opt.key}
          className={`option-btn ${answer === opt.key ? 'selected' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          <span className={`option-key ${answer === opt.key ? 'bg-primary-900 border-primary-700 text-primary-300' : ''}`}>
            {opt.key}
          </span>
          <span className="leading-relaxed">{opt.text}</span>
        </button>
      ))}
    </div>
  );
}

// ─── True / False ─────────────────────────────────────────────────────────────

function TrueFalseInput({ answer, onChange }) {
  return (
    <div className="flex flex-col gap-3">
      {[{ key: 'true', label: 'True' }, { key: 'false', label: 'False' }].map(opt => (
        <button
          key={opt.key}
          className={`option-btn ${answer === opt.key ? 'selected' : ''}`}
          onClick={() => onChange(opt.key)}
        >
          <span className={`option-key ${answer === opt.key ? 'bg-primary-900 border-primary-700 text-primary-300' : ''}`}>
            {opt.key === 'true' ? 'T' : 'F'}
          </span>
          <span className="leading-relaxed font-medium">{opt.label}</span>
        </button>
      ))}
    </div>
  );
}

// ─── Multiple Select ──────────────────────────────────────────────────────────

function MultipleSelectInput({ question, answer, onChange }) {
  // answer is an array of selected option keys
  const selected = Array.isArray(answer) ? answer : [];

  const toggle = useCallback((key) => {
    if (selected.includes(key)) {
      onChange(selected.filter(k => k !== key));
    } else {
      onChange([...selected, key]);
    }
  }, [selected, onChange]);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-violet-600 font-semibold bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
        Select all that apply — choose every correct answer before submitting.
      </p>
      {(question.options || []).map(opt => {
        const isSelected = selected.includes(opt.key);
        return (
          <button
            key={opt.key}
            className={`option-btn ${isSelected ? 'selected' : ''}`}
            onClick={() => toggle(opt.key)}
          >
            {/* Checkbox indicator */}
            <span className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold transition-colors ${
              isSelected
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'border-surface-300 bg-white'
            }`}>
              {isSelected ? '✓' : ''}
            </span>
            <span className={`option-key ml-1 ${isSelected ? 'bg-primary-900 border-primary-700 text-primary-300' : ''}`}>
              {opt.key}
            </span>
            <span className="leading-relaxed">{opt.text}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Match the Following ──────────────────────────────────────────────────────

function MatchingInput({ question, answer, onChange }) {
  // answer is an object: { itemId: selectedMatchId }
  const pairs = question.matchingPairs || [];
  const current = (answer && typeof answer === 'object' && !Array.isArray(answer)) ? answer : {};

  // Separate Column A (items) and Column B (matches — shuffled display)
  // matchingPairs: [{ itemId, itemText, matchId, matchText }]
  const columnA = pairs.map(p => ({ id: p.itemId, text: p.itemText }));
  // Column B: sorted by matchId for stable display
  const columnB = [...pairs]
    .sort((a, b) => a.matchId.localeCompare(b.matchId))
    .map(p => ({ id: p.matchId, text: p.matchText }));

  const handleSelect = (itemId, matchId) => {
    onChange({ ...current, [itemId]: matchId });
  };

  if (pairs.length === 0) {
    return <p className="text-sm text-surface-400 italic">No matching data configured.</p>;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 text-xs font-semibold text-surface-500 uppercase tracking-wide px-1">
        <span>Column A</span>
        <span>Column B (select match)</span>
      </div>
      {columnA.map(item => (
        <div key={item.id} className="grid grid-cols-2 gap-3 items-center">
          <div className="bg-surface-50 border border-surface-200 rounded-lg px-3 py-2.5 text-sm text-surface-700 leading-relaxed">
            <span className="font-bold text-primary-600 mr-2">{item.id}.</span>
            {item.text}
          </div>
          <select
            value={current[item.id] || ''}
            onChange={e => handleSelect(item.id, e.target.value)}
            className={`form-input form-select text-sm py-2.5 ${current[item.id] ? 'border-primary-400 bg-primary-50' : ''}`}
          >
            <option value="">— Select —</option>
            {columnB.map(match => (
              <option key={match.id} value={match.id}>
                {match.id}. {match.text}
              </option>
            ))}
          </select>
        </div>
      ))}
      <p className="text-xs text-surface-400">
        {Object.keys(current).length}/{columnA.length} pairs matched
      </p>
    </div>
  );
}

// ─── Fill in the Blank ────────────────────────────────────────────────────────

function FillBlankInput({ question, answer, onChange }) {
  // answer is string[] — one entry per blank
  const blanks = question.blanks || [];
  const count = Math.max(blanks.length, 1);
  const current = Array.isArray(answer) ? answer : Array(count).fill('');

  const handleChange = (idx, val) => {
    const next = [...current];
    while (next.length <= idx) next.push('');
    next[idx] = val;
    onChange(next);
  };

  // Parse blank markers from question text: __1__, __2__, etc.
  // Display the question text with numbered blank labels
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-violet-600 font-semibold bg-violet-50 border border-violet-200 rounded-lg px-3 py-2">
        Type your answer(s) in the field(s) below. Spelling matters — extra spaces are ignored.
      </p>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-surface-500">
            Blank {count > 1 ? i + 1 : ''}
          </label>
          <input
            type="text"
            className={`form-input text-sm py-2.5 ${current[i] ? 'border-primary-400 bg-primary-50/30' : ''}`}
            placeholder={`Enter answer${count > 1 ? ` for blank ${i + 1}` : ''}…`}
            value={current[i] || ''}
            onChange={e => handleChange(i, e.target.value)}
            autoComplete="off"
          />
        </div>
      ))}
    </div>
  );
}

// ─── Assertion & Reason ───────────────────────────────────────────────────────

function AssertionReasonInput({ question, answer, onChange }) {
  // Standard A/R options — either from question.options or default set
  const options = (question.options && question.options.length > 0)
    ? question.options
    : [
        { key: 'A', text: 'Both Assertion and Reason are true, and Reason is the correct explanation of Assertion.' },
        { key: 'B', text: 'Both Assertion and Reason are true, but Reason is not the correct explanation of Assertion.' },
        { key: 'C', text: 'Assertion is true, but Reason is false.' },
        { key: 'D', text: 'Assertion is false, but Reason is true.' },
      ];

  return (
    <div className="flex flex-col gap-4">
      {/* Assertion and Reason display */}
      {question.assertionText && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-bold text-blue-700 mb-1 uppercase tracking-wide">Assertion (A)</p>
          <p className="text-sm text-surface-700 leading-relaxed">{question.assertionText}</p>
        </div>
      )}
      {question.reasonText && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-700 mb-1 uppercase tracking-wide">Reason (R)</p>
          <p className="text-sm text-surface-700 leading-relaxed">{question.reasonText}</p>
        </div>
      )}
      {/* Options */}
      <div className="flex flex-col gap-2.5">
        {options.map(opt => (
          <button
            key={opt.key}
            className={`option-btn text-left ${answer === opt.key ? 'selected' : ''}`}
            onClick={() => onChange(opt.key)}
          >
            <span className={`option-key ${answer === opt.key ? 'bg-primary-900 border-primary-700 text-primary-300' : ''}`}>
              {opt.key}
            </span>
            <span className="leading-relaxed text-sm">{opt.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Statement Based ──────────────────────────────────────────────────────────

function StatementBasedInput({ question, answer, onChange }) {
  const statements = question.statements || [];
  const options    = question.options    || [];

  return (
    <div className="flex flex-col gap-4">
      {/* Statements */}
      {statements.length > 0 && (
        <div className="bg-surface-50 border border-surface-200 rounded-lg p-3">
          <p className="text-xs font-bold text-surface-500 mb-2 uppercase tracking-wide">Statements</p>
          <ol className="flex flex-col gap-1.5 list-none">
            {statements.map(s => (
              <li key={s.number} className="text-sm text-surface-700 leading-relaxed flex gap-2">
                <span className="font-bold text-primary-600 flex-shrink-0">{s.number}.</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      {/* Answer options */}
      <div className="flex flex-col gap-2.5">
        {options.map(opt => (
          <button
            key={opt.key}
            className={`option-btn ${answer === opt.key ? 'selected' : ''}`}
            onClick={() => onChange(opt.key)}
          >
            <span className={`option-key ${answer === opt.key ? 'bg-primary-900 border-primary-700 text-primary-300' : ''}`}>
              {opt.key}
            </span>
            <span className="leading-relaxed text-sm">{opt.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Passage Based ────────────────────────────────────────────────────────────

function PassageDisplay({ question }) {
  if (!question.passageText) return null;
  return (
    <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-2">
      <p className="text-xs font-bold text-indigo-700 mb-2 uppercase tracking-wide">Passage</p>
      <p className="text-sm text-surface-700 leading-relaxed whitespace-pre-wrap">{question.passageText}</p>
    </div>
  );
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export default function QuestionRenderer({ question, answer, onChange }) {
  if (!question) return null;

  const qt = question.questionType || question.type || 'single_choice';

  return (
    <div className="flex flex-col gap-4">
      {/* Type badge */}
      <TypeBadge questionType={qt} />

      {/* Passage block (shown above question text for passage-based) */}
      {qt === 'passage_based' && <PassageDisplay question={question} />}

      {/* Assertion / Reason blocks (shown above options for assertion_reason) */}
      {qt === 'assertion_reason' && question.assertionText && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-bold text-blue-700 mb-1 uppercase tracking-wide">Assertion (A)</p>
          <p className="text-sm text-surface-700 leading-relaxed">{question.assertionText}</p>
        </div>
      )}
      {qt === 'assertion_reason' && question.reasonText && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-700 mb-1 uppercase tracking-wide">Reason (R)</p>
          <p className="text-sm text-surface-700 leading-relaxed">{question.reasonText}</p>
        </div>
      )}

      {/* Render the appropriate input */}
      {(qt === 'single_choice' || qt === 'mcq') && (
        <SingleChoiceInput question={question} answer={answer} onChange={onChange} />
      )}
      {qt === 'multiple_select' && (
        <MultipleSelectInput question={question} answer={answer} onChange={onChange} />
      )}
      {qt === 'true_false' && (
        <TrueFalseInput answer={answer} onChange={onChange} />
      )}
      {qt === 'fill_blank' && (
        <FillBlankInput question={question} answer={answer} onChange={onChange} />
      )}
      {qt === 'assertion_reason' && (
        <AssertionReasonInput question={question} answer={answer} onChange={onChange} />
      )}
      {qt === 'statement_based' && (
        <StatementBasedInput question={question} answer={answer} onChange={onChange} />
      )}
      {qt === 'matching' && (
        <MatchingInput question={question} answer={answer} onChange={onChange} />
      )}
      {qt === 'passage_based' && (
        <SingleChoiceInput question={question} answer={answer} onChange={onChange} />
      )}
    </div>
  );
}

