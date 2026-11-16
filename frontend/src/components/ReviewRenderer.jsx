/**
 * ReviewRenderer.jsx
 * ------------------
 * Dispatches to the correct review display component based on questionType.
 * Used in PracticeReview (after submission) to show answer comparisons.
 *
 * Props:
 *   item - A reviewItem object from the API (includes selectedAnswer, correctAnswer,
 *          questionType, options, matchingPairs, blanks, statements, etc.)
 *   isLegacy - boolean (legacy sessions have no selectedAnswer)
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

function AnswerLabel({ correct, wrong, skipped, legacy, children }) {
  if (legacy) return <span className="text-emerald-600 font-semibold text-xs">✓ Correct</span>;
  if (correct && !wrong) return <span className="text-emerald-600 font-semibold text-xs">✓ Your answer · Correct</span>;
  if (correct && !skipped) return <span className="text-emerald-600 font-semibold text-xs">✓ Correct answer</span>;
  if (wrong) return <span className="text-red-500 font-semibold text-xs">✗ Your answer</span>;
  return children || null;
}

// ─── Single Choice / MCQ / Assertion-Reason / Statement-Based ────────────────

function SingleChoiceReview({ options, selectedAnswer, correctAnswer, isSkipped, isLegacy }) {
  return (
    <div className="flex flex-col gap-2">
      {(options || []).map(opt => {
        const isCorrectOpt  = opt.key === correctAnswer;
        const isSelectedOpt = opt.key === selectedAnswer;
        const isWrongSelect = isSelectedOpt && !isSkipped && opt.key !== correctAnswer;

        let cls = 'option-btn pointer-events-none text-sm py-2.5 ';
        if (isCorrectOpt)  cls += 'correct ';
        if (isWrongSelect) cls += 'wrong ';

        let keyBg = '';
        if (isCorrectOpt)  keyBg = 'bg-emerald-50 border-emerald-300 text-emerald-700';
        else if (isWrongSelect) keyBg = 'bg-red-50 border-red-300 text-red-700';

        return (
          <div key={opt.key} className={cls}>
            <span className={`option-key text-xs ${keyBg}`}>{opt.key}</span>
            <span className="leading-relaxed flex-1">{opt.text}</span>
            <div className="flex items-center gap-1 ml-2 flex-shrink-0">
              {!isLegacy && isCorrectOpt && isSelectedOpt && (
                <AnswerLabel correct wrong={false} skipped={isSkipped} legacy={false} />
              )}
              {!isLegacy && isCorrectOpt && !isSelectedOpt && (
                <AnswerLabel correct wrong={false} skipped={isSkipped} legacy={false}>
                  <span className="text-emerald-600 font-semibold text-xs">✓ Correct answer</span>
                </AnswerLabel>
              )}
              {!isLegacy && isWrongSelect && (
                <span className="text-red-500 font-semibold text-xs">✗ Your answer</span>
              )}
              {isLegacy && isCorrectOpt && (
                <span className="text-emerald-600 font-semibold text-xs">✓ Correct</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── True / False ─────────────────────────────────────────────────────────────

function TrueFalseReview({ selectedAnswer, correctAnswer, isSkipped, isLegacy }) {
  return (
    <SingleChoiceReview
      options={[{ key: 'true', text: 'True' }, { key: 'false', text: 'False' }]}
      selectedAnswer={selectedAnswer}
      correctAnswer={correctAnswer}
      isSkipped={isSkipped}
      isLegacy={isLegacy}
    />
  );
}

// ─── Multiple Select ──────────────────────────────────────────────────────────

function MultipleSelectReview({ options, selectedAnswer, correctAnswer, isSkipped, isLegacy }) {
  // Parse array answers
  let selected = [];
  if (!isSkipped) {
    if (Array.isArray(selectedAnswer)) selected = selectedAnswer;
    else if (typeof selectedAnswer === 'string') {
      try { selected = JSON.parse(selectedAnswer); } catch { selected = [selectedAnswer]; }
    }
  }

  let correct = [];
  if (Array.isArray(correctAnswer)) correct = correctAnswer;
  else if (typeof correctAnswer === 'string') {
    try { correct = JSON.parse(correctAnswer); } catch { correct = [correctAnswer]; }
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-surface-500 italic mb-1">
        Correct answer requires selecting all highlighted options.
      </p>
      {(options || []).map(opt => {
        const isCorrectOpt  = correct.includes(opt.key);
        const isSelectedOpt = selected.includes(opt.key);
        const isWrongSelect = isSelectedOpt && !isCorrectOpt;

        let cls = 'option-btn pointer-events-none text-sm py-2.5 ';
        if (isCorrectOpt)  cls += 'correct ';
        if (isWrongSelect) cls += 'wrong ';

        let keyBg = '';
        if (isCorrectOpt)  keyBg = 'bg-emerald-50 border-emerald-300 text-emerald-700';
        else if (isWrongSelect) keyBg = 'bg-red-50 border-red-300 text-red-700';

        return (
          <div key={opt.key} className={cls}>
            {/* Checkbox indicator */}
            <span className={`flex-shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center text-xs font-bold ${
              isCorrectOpt  ? 'bg-emerald-500 border-emerald-500 text-white' :
              isWrongSelect ? 'bg-red-500 border-red-500 text-white' :
              'border-surface-300 bg-white'
            }`}>
              {(isCorrectOpt || isWrongSelect) ? '✓' : ''}
            </span>
            <span className={`option-key ml-1 text-xs ${keyBg}`}>{opt.key}</span>
            <span className="leading-relaxed flex-1">{opt.text}</span>
            <div className="ml-2 flex-shrink-0 text-xs">
              {!isLegacy && isCorrectOpt && isSelectedOpt && (
                <span className="text-emerald-600 font-semibold">✓ Selected · Correct</span>
              )}
              {!isLegacy && isCorrectOpt && !isSelectedOpt && (
                <span className="text-emerald-600 font-semibold">✓ Should have selected</span>
              )}
              {!isLegacy && isWrongSelect && (
                <span className="text-red-500 font-semibold">✗ Wrong selection</span>
              )}
              {isLegacy && isCorrectOpt && (
                <span className="text-emerald-600 font-semibold">✓ Correct</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Match the Following ──────────────────────────────────────────────────────

function MatchingReview({ item, isLegacy }) {
  const pairs = item.matchingPairs || [];
  if (pairs.length === 0) return <p className="text-sm text-surface-400 italic">Matching data not available.</p>;

  let studentAnswers = {};
  if (!item.isSkipped) {
    if (typeof item.selectedAnswer === 'object' && !Array.isArray(item.selectedAnswer) && item.selectedAnswer) {
      studentAnswers = item.selectedAnswer;
    } else if (typeof item.selectedAnswer === 'string') {
      try { studentAnswers = JSON.parse(item.selectedAnswer); } catch {}
    }
  }

  let correctAnswers = {};
  if (typeof item.correctAnswer === 'object' && !Array.isArray(item.correctAnswer) && item.correctAnswer) {
    correctAnswers = item.correctAnswer;
  } else if (typeof item.correctAnswer === 'string') {
    try { correctAnswers = JSON.parse(item.correctAnswer); } catch {}
  }

  // Build matchId → matchText lookup
  const matchLookup = {};
  pairs.forEach(p => { matchLookup[p.matchId] = p.matchText; });

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-surface-500 uppercase tracking-wide px-1">
        <span>Column A</span>
        <span>Your Answer</span>
        <span>Correct</span>
      </div>
      {pairs.map(p => {
        const studentMatchId  = studentAnswers[p.itemId];
        const correctMatchId  = correctAnswers[p.itemId] || p.matchId;
        const pairCorrect     = studentMatchId === correctMatchId;

        return (
          <div key={p.itemId} className={`grid grid-cols-3 gap-2 items-start p-2 rounded-lg border ${
            isLegacy  ? 'border-surface-200 bg-surface-50' :
            pairCorrect  ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}>
            <div className="text-sm text-surface-700">
              <span className="font-bold text-primary-600 mr-1">{p.itemId}.</span>{p.itemText}
            </div>
            <div className={`text-sm ${
              isLegacy ? 'text-surface-400 italic' :
              pairCorrect ? 'text-emerald-700 font-medium' : 'text-red-600'
            }`}>
              {isLegacy || !studentMatchId
                ? <span className="italic text-surface-400">—</span>
                : <>{p.matchId === studentMatchId ? `${studentMatchId}. ` : `${studentMatchId}. `}{matchLookup[studentMatchId] || studentMatchId}</>
              }
            </div>
            <div className="text-sm text-emerald-700 font-medium">
              {p.matchId}. {p.matchText}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Fill in the Blank ────────────────────────────────────────────────────────

function FillBlankReview({ item, isLegacy }) {
  let studentAnswers = [];
  if (!item.isSkipped) {
    if (Array.isArray(item.selectedAnswer)) studentAnswers = item.selectedAnswer;
    else if (typeof item.selectedAnswer === 'string') {
      try { studentAnswers = JSON.parse(item.selectedAnswer); } catch { studentAnswers = [item.selectedAnswer]; }
    }
  }

  let correctAnswers = [];
  if (Array.isArray(item.correctAnswer)) correctAnswers = item.correctAnswer;
  else if (typeof item.correctAnswer === 'string') {
    try { correctAnswers = JSON.parse(item.correctAnswer); } catch { correctAnswers = [item.correctAnswer]; }
  }

  const blanks = item.blanks || [];
  const count  = Math.max(correctAnswers.length, blanks.length, 1);

  return (
    <div className="flex flex-col gap-3">
      {Array.from({ length: count }, (_, i) => {
        const student = studentAnswers[i] || '';
        const accepted = Array.isArray(correctAnswers[i]) ? correctAnswers[i] : [correctAnswers[i] || ''];
        const blankConfig = blanks[i] || {};
        const cs = blankConfig.caseSensitive === true;
        const norm = cs ? student.trim() : student.trim().toLowerCase();
        const correct = accepted.some(a => (cs ? a.trim() : a.trim().toLowerCase()) === norm);

        return (
          <div key={i} className={`p-3 rounded-lg border ${
            isLegacy ? 'border-surface-200 bg-surface-50' :
            item.isSkipped ? 'border-surface-200 bg-surface-50' :
            correct ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50'
          }`}>
            <p className="text-xs font-semibold text-surface-500 mb-1">Blank {count > 1 ? i + 1 : ''}</p>
            <div className="flex flex-wrap gap-3 text-sm">
              <div>
                <span className="text-surface-500 text-xs mr-1">Your answer:</span>
                <span className={`font-medium ${
                  isLegacy ? 'text-surface-500 italic' :
                  item.isSkipped ? 'text-surface-400 italic' :
                  correct ? 'text-emerald-700' : 'text-red-600'
                }`}>
                  {(item.isSkipped || !student) ? '(skipped)' : student}
                </span>
              </div>
              <div>
                <span className="text-surface-500 text-xs mr-1">Correct:</span>
                <span className="text-emerald-700 font-medium">{accepted[0]}</span>
                {accepted.length > 1 && (
                  <span className="text-surface-400 text-xs ml-1">(also: {accepted.slice(1).join(', ')})</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Assertion & Reason Review ────────────────────────────────────────────────

function AssertionReasonReview({ item, isLegacy }) {
  const options = (item.options && item.options.length > 0)
    ? item.options
    : [
        { key: 'A', text: 'Both Assertion and Reason are true, and Reason is the correct explanation of Assertion.' },
        { key: 'B', text: 'Both Assertion and Reason are true, but Reason is not the correct explanation of Assertion.' },
        { key: 'C', text: 'Assertion is true, but Reason is false.' },
        { key: 'D', text: 'Assertion is false, but Reason is true.' },
      ];

  return (
    <div className="flex flex-col gap-3">
      {item.assertionText && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
          <p className="text-xs font-bold text-blue-700 mb-1 uppercase tracking-wide">Assertion (A)</p>
          <p className="text-sm text-surface-700 leading-relaxed">{item.assertionText}</p>
        </div>
      )}
      {item.reasonText && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
          <p className="text-xs font-bold text-amber-700 mb-1 uppercase tracking-wide">Reason (R)</p>
          <p className="text-sm text-surface-700 leading-relaxed">{item.reasonText}</p>
        </div>
      )}
      <SingleChoiceReview
        options={options}
        selectedAnswer={item.selectedAnswer}
        correctAnswer={item.correctAnswer}
        isSkipped={item.isSkipped}
        isLegacy={isLegacy}
      />
    </div>
  );
}

// ─── Statement Based Review ───────────────────────────────────────────────────

function StatementBasedReview({ item, isLegacy }) {
  return (
    <div className="flex flex-col gap-3">
      {(item.statements || []).length > 0 && (
        <div className="bg-surface-50 border border-surface-200 rounded-lg p-3">
          <p className="text-xs font-bold text-surface-500 mb-2 uppercase tracking-wide">Statements</p>
          <ol className="flex flex-col gap-1.5 list-none">
            {item.statements.map(s => (
              <li key={s.number} className="text-sm text-surface-700 leading-relaxed flex gap-2">
                <span className="font-bold text-primary-600 flex-shrink-0">{s.number}.</span>
                <span>{s.text}</span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <SingleChoiceReview
        options={item.options}
        selectedAnswer={item.selectedAnswer}
        correctAnswer={item.correctAnswer}
        isSkipped={item.isSkipped}
        isLegacy={isLegacy}
      />
    </div>
  );
}

// ─── Main Dispatcher ──────────────────────────────────────────────────────────

export default function ReviewRenderer({ item, isLegacy }) {
  if (!item) return null;

  const qt = item.questionType || item.type || 'single_choice';

  switch (qt) {
    case 'multiple_select':
      return (
        <MultipleSelectReview
          options={item.options}
          selectedAnswer={item.selectedAnswer}
          correctAnswer={item.correctAnswer}
          isSkipped={item.isSkipped}
          isLegacy={isLegacy}
        />
      );
    case 'matching':
      return <MatchingReview item={item} isLegacy={isLegacy} />;
    case 'fill_blank':
      return <FillBlankReview item={item} isLegacy={isLegacy} />;
    case 'true_false':
      return (
        <TrueFalseReview
          selectedAnswer={item.selectedAnswer}
          correctAnswer={item.correctAnswer}
          isSkipped={item.isSkipped}
          isLegacy={isLegacy}
        />
      );
    case 'assertion_reason':
      return <AssertionReasonReview item={item} isLegacy={isLegacy} />;
    case 'statement_based':
      return <StatementBasedReview item={item} isLegacy={isLegacy} />;
    case 'passage_based':
    case 'single_choice':
    case 'mcq':
    default:
      return (
        <SingleChoiceReview
          options={item.options}
          selectedAnswer={item.selectedAnswer}
          correctAnswer={item.correctAnswer}
          isSkipped={item.isSkipped}
          isLegacy={isLegacy}
        />
      );
  }
}

