import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Edit2, Trash2, CheckCircle, XCircle, Loader2, AlertCircle, Sparkles, BarChart2, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { questionService, examService, subjectService, topicService } from '../../services';

const DIFFICULTIES = ['easy', 'medium', 'hard'];

const QUESTION_TYPES = [
  { value: 'single_choice',   label: 'Single Choice MCQ' },
  { value: 'multiple_select', label: 'Multiple Select' },
  { value: 'true_false',      label: 'True / False' },
  { value: 'fill_blank',      label: 'Fill in the Blank' },
  { value: 'assertion_reason',label: 'Assertion & Reason' },
  { value: 'statement_based', label: 'Statement Based' },
  { value: 'matching',        label: 'Match the Following' },
  { value: 'passage_based',   label: 'Passage Based' },
];

const TYPE_LABELS = Object.fromEntries(QUESTION_TYPES.map(t => [t.value, t.label]));

// ─── Default form shapes per type ────────────────────────────────────────────

function defaultFormForType(questionType) {
  const base = {
    text: '', questionType, difficulty: 'easy',
    exam: '', subject: '', topic: '',
    marks: 1, negativeMarks: 0.25, source: 'admin',
    explanation: '',
    // fields for specific types
    options: [], correctAnswer: '', correctAnswerData: null,
    matchingPairs: [], blanks: [], statements: [],
    assertionText: '', reasonText: '', passageText: '',
  };

  switch (questionType) {
    case 'single_choice':
      return { ...base, options: [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }], correctAnswer: 'A' };
    case 'multiple_select':
      return { ...base, options: [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }], correctAnswerData: [] };
    case 'true_false':
      return { ...base, options: [{ key: 'true', text: 'True' }, { key: 'false', text: 'False' }], correctAnswer: 'true' };
    case 'fill_blank':
      return { ...base, blanks: [{ blankIndex: 0, acceptedAnswers: [''], caseSensitive: false }], correctAnswerData: [['']] };
    case 'assertion_reason':
      return {
        ...base,
        options: [
          { key: 'A', text: 'Both Assertion and Reason are true, and Reason is the correct explanation of Assertion.' },
          { key: 'B', text: 'Both Assertion and Reason are true, but Reason is not the correct explanation of Assertion.' },
          { key: 'C', text: 'Assertion is true, but Reason is false.' },
          { key: 'D', text: 'Assertion is false, but Reason is true.' },
        ],
        assertionText: '', reasonText: '', correctAnswer: 'A',
      };
    case 'statement_based':
      return { ...base, statements: [{ number: 1, text: '' }, { number: 2, text: '' }], options: [{ key: 'A', text: 'Only 1' }, { key: 'B', text: 'Only 2' }, { key: 'C', text: 'Both 1 and 2' }, { key: 'D', text: 'Neither 1 nor 2' }], correctAnswer: 'A' };
    case 'matching':
      return { ...base, matchingPairs: [{ itemId: '1', itemText: '', matchId: 'a', matchText: '' }, { itemId: '2', itemText: '', matchId: 'b', matchText: '' }], correctAnswerData: { '1': 'a', '2': 'b' } };
    case 'passage_based':
      return { ...base, passageText: '', options: [{ key: 'A', text: '' }, { key: 'B', text: '' }, { key: 'C', text: '' }, { key: 'D', text: '' }], correctAnswer: 'A' };
    default:
      return base;
  }
}

// ─── Type-specific form sections ──────────────────────────────────────────────

function SingleChoiceFields({ form, setForm }) {
  const setOpt = (key, val) => setForm(p => ({ ...p, options: p.options.map(o => o.key === key ? { ...o, text: val } : o) }));
  return (
    <div className="form-group">
      <label className="form-label">Options & Correct Answer *</label>
      <div className="flex flex-col gap-2">
        {form.options.map(opt => (
          <div key={opt.key} className="flex gap-2 items-center">
            <span className={`option-key flex-shrink-0 ${form.correctAnswer === opt.key ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : ''}`}>{opt.key}</span>
            <input className="form-input flex-1 text-sm py-2" value={opt.text} onChange={e => setOpt(opt.key, e.target.value)} placeholder={`Option ${opt.key}`} />
            <button onClick={() => setForm(p => ({ ...p, correctAnswer: opt.key }))} className={`btn btn-sm flex-shrink-0 ${form.correctAnswer === opt.key ? 'btn-primary' : 'btn-ghost'}`}>
              {form.correctAnswer === opt.key ? <CheckCircle size={13} /> : <XCircle size={13} className="opacity-30" />}
            </button>
          </div>
        ))}
      </div>
      <span className="text-xs text-surface-500 mt-1">Click ✓ to mark the correct answer</span>
    </div>
  );
}

function MultipleSelectFields({ form, setForm }) {
  const setOpt = (key, val) => setForm(p => ({ ...p, options: p.options.map(o => o.key === key ? { ...o, text: val } : o) }));
  const toggleCorrect = (key) => {
    const current = Array.isArray(form.correctAnswerData) ? form.correctAnswerData : [];
    const next = current.includes(key) ? current.filter(k => k !== key) : [...current, key];
    setForm(p => ({ ...p, correctAnswerData: next }));
  };
  const selected = Array.isArray(form.correctAnswerData) ? form.correctAnswerData : [];
  return (
    <div className="form-group">
      <label className="form-label">Options & Correct Answers * <span className="text-violet-600 text-xs">(select all that apply)</span></label>
      <div className="flex flex-col gap-2">
        {form.options.map(opt => (
          <div key={opt.key} className="flex gap-2 items-center">
            <button onClick={() => toggleCorrect(opt.key)} className={`w-6 h-6 rounded border-2 flex items-center justify-center text-xs font-bold flex-shrink-0 transition-colors ${selected.includes(opt.key) ? 'bg-emerald-500 border-emerald-500 text-white' : 'border-surface-300 bg-white'}`}>
              {selected.includes(opt.key) ? '✓' : ''}
            </button>
            <span className={`option-key flex-shrink-0 ${selected.includes(opt.key) ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : ''}`}>{opt.key}</span>
            <input className="form-input flex-1 text-sm py-2" value={opt.text} onChange={e => setOpt(opt.key, e.target.value)} placeholder={`Option ${opt.key}`} />
          </div>
        ))}
      </div>
      <span className="text-xs text-surface-500 mt-1">Check boxes to mark correct answers. At least 2 correct answers required.</span>
    </div>
  );
}

function TrueFalseFields({ form, setForm }) {
  return (
    <div className="form-group">
      <label className="form-label">Correct Answer *</label>
      <div className="flex gap-3">
        {[{ key: 'true', label: 'True' }, { key: 'false', label: 'False' }].map(opt => (
          <button key={opt.key} onClick={() => setForm(p => ({ ...p, correctAnswer: opt.key }))}
            className={`btn flex-1 ${form.correctAnswer === opt.key ? 'btn-primary' : 'btn-secondary'}`}>
            {form.correctAnswer === opt.key ? <CheckCircle size={14} /> : null} {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function FillBlankFields({ form, setForm }) {
  const addBlank = () => {
    const idx = form.blanks.length;
    setForm(p => ({
      ...p,
      blanks: [...p.blanks, { blankIndex: idx, acceptedAnswers: [''], caseSensitive: false }],
      correctAnswerData: [...(Array.isArray(p.correctAnswerData) ? p.correctAnswerData : []), ['']],
    }));
  };
  const removeBlank = (i) => {
    setForm(p => ({
      ...p,
      blanks: p.blanks.filter((_, j) => j !== i),
      correctAnswerData: (Array.isArray(p.correctAnswerData) ? p.correctAnswerData : []).filter((_, j) => j !== i),
    }));
  };
  const updateAnswer = (blankIdx, answerIdx, val) => {
    setForm(p => {
      const data = [...(Array.isArray(p.correctAnswerData) ? p.correctAnswerData : [])];
      const answers = [...(data[blankIdx] || [''])];
      answers[answerIdx] = val;
      data[blankIdx] = answers;
      return { ...p, correctAnswerData: data };
    });
  };
  const addAlternative = (blankIdx) => {
    setForm(p => {
      const data = [...(Array.isArray(p.correctAnswerData) ? p.correctAnswerData : [])];
      data[blankIdx] = [...(data[blankIdx] || ['']), ''];
      return { ...p, correctAnswerData: data };
    });
  };
  const removeAlternative = (blankIdx, answerIdx) => {
    setForm(p => {
      const data = [...(Array.isArray(p.correctAnswerData) ? p.correctAnswerData : [])];
      data[blankIdx] = (data[blankIdx] || ['']).filter((_, j) => j !== answerIdx);
      if (!data[blankIdx].length) data[blankIdx] = [''];
      return { ...p, correctAnswerData: data };
    });
  };
  const toggleCase = (blankIdx) => {
    setForm(p => ({
      ...p,
      blanks: p.blanks.map((b, i) => i === blankIdx ? { ...b, caseSensitive: !b.caseSensitive } : b),
    }));
  };

  const correctData = Array.isArray(form.correctAnswerData) ? form.correctAnswerData : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="form-group">
        <label className="form-label">Blanks & Accepted Answers *</label>
        <p className="text-xs text-surface-400 mb-2">Use __1__, __2__ in the question text to indicate blank positions.</p>
        {form.blanks.map((blank, i) => (
          <div key={i} className="bg-surface-50 border border-surface-200 rounded-lg p-3 mb-2">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-surface-700">Blank {i + 1}</span>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-xs text-surface-500 cursor-pointer">
                  <input type="checkbox" checked={!!blank.caseSensitive} onChange={() => toggleCase(i)} className="accent-primary-600" />
                  Case-sensitive
                </label>
                {form.blanks.length > 1 && (
                  <button onClick={() => removeBlank(i)} className="btn btn-ghost btn-sm text-red-500 py-0.5 px-1.5 text-xs">Remove</button>
                )}
              </div>
            </div>
            {(correctData[i] || ['']).map((ans, j) => (
              <div key={j} className="flex gap-2 mb-1.5">
                <input className="form-input flex-1 text-sm py-1.5" value={ans} onChange={e => updateAnswer(i, j, e.target.value)}
                  placeholder={j === 0 ? `Primary answer for blank ${i + 1}` : `Alternative ${j}`} />
                {j > 0 && (
                  <button onClick={() => removeAlternative(i, j)} className="btn btn-ghost btn-sm text-red-500 py-1 px-2">✕</button>
                )}
              </div>
            ))}
            <button onClick={() => addAlternative(i)} className="btn btn-ghost btn-sm text-xs text-primary-600 py-1">+ Add alternative answer</button>
          </div>
        ))}
        <button onClick={addBlank} className="btn btn-secondary btn-sm text-xs">+ Add Blank</button>
      </div>
    </div>
  );
}

function AssertionReasonFields({ form, setForm }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="form-group">
        <label className="form-label">Assertion (A) *</label>
        <textarea className="form-input" rows={2} value={form.assertionText || ''}
          onChange={e => setForm(p => ({ ...p, assertionText: e.target.value }))} placeholder="Enter the assertion statement…" />
      </div>
      <div className="form-group">
        <label className="form-label">Reason (R) *</label>
        <textarea className="form-input" rows={2} value={form.reasonText || ''}
          onChange={e => setForm(p => ({ ...p, reasonText: e.target.value }))} placeholder="Enter the reason statement…" />
      </div>
      <div className="form-group">
        <label className="form-label">Options (editable) & Correct Answer *</label>
        <div className="flex flex-col gap-2">
          {form.options.map(opt => (
            <div key={opt.key} className="flex gap-2 items-start">
              <span className={`option-key flex-shrink-0 mt-1 ${form.correctAnswer === opt.key ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : ''}`}>{opt.key}</span>
              <input className="form-input flex-1 text-sm py-2" value={opt.text}
                onChange={e => setForm(p => ({ ...p, options: p.options.map(o => o.key === opt.key ? { ...o, text: e.target.value } : o) }))} />
              <button onClick={() => setForm(p => ({ ...p, correctAnswer: opt.key }))}
                className={`btn btn-sm flex-shrink-0 ${form.correctAnswer === opt.key ? 'btn-primary' : 'btn-ghost'}`}>
                {form.correctAnswer === opt.key ? <CheckCircle size={13} /> : <XCircle size={13} className="opacity-30" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatementBasedFields({ form, setForm }) {
  const addStatement = () => setForm(p => ({ ...p, statements: [...p.statements, { number: p.statements.length + 1, text: '' }] }));
  const removeStatement = (i) => setForm(p => ({ ...p, statements: p.statements.filter((_, j) => j !== i).map((s, j) => ({ ...s, number: j + 1 })) }));
  const setOpt = (key, val) => setForm(p => ({ ...p, options: p.options.map(o => o.key === key ? { ...o, text: val } : o) }));
  return (
    <div className="flex flex-col gap-3">
      <div className="form-group">
        <label className="form-label">Statements *</label>
        {form.statements.map((s, i) => (
          <div key={i} className="flex gap-2 items-center mb-1.5">
            <span className="text-sm font-bold text-primary-600 flex-shrink-0 w-5">{s.number}.</span>
            <input className="form-input flex-1 text-sm py-2" value={s.text}
              onChange={e => setForm(p => ({ ...p, statements: p.statements.map((st, j) => j === i ? { ...st, text: e.target.value } : st) }))}
              placeholder={`Statement ${s.number}`} />
            {form.statements.length > 1 && <button onClick={() => removeStatement(i)} className="btn btn-ghost btn-sm text-red-500 py-1 px-2">✕</button>}
          </div>
        ))}
        <button onClick={addStatement} className="btn btn-secondary btn-sm text-xs mt-1">+ Add Statement</button>
      </div>
      <div className="form-group">
        <label className="form-label">Answer Options & Correct Answer *</label>
        <div className="flex flex-col gap-2">
          {form.options.map(opt => (
            <div key={opt.key} className="flex gap-2 items-center">
              <span className={`option-key flex-shrink-0 ${form.correctAnswer === opt.key ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : ''}`}>{opt.key}</span>
              <input className="form-input flex-1 text-sm py-2" value={opt.text} onChange={e => setOpt(opt.key, e.target.value)} placeholder={`Option ${opt.key}`} />
              <button onClick={() => setForm(p => ({ ...p, correctAnswer: opt.key }))} className={`btn btn-sm flex-shrink-0 ${form.correctAnswer === opt.key ? 'btn-primary' : 'btn-ghost'}`}>
                {form.correctAnswer === opt.key ? <CheckCircle size={13} /> : <XCircle size={13} className="opacity-30" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MatchingFields({ form, setForm }) {
  const addPair = () => {
    const idx = form.matchingPairs.length + 1;
    const itemId = String(idx);
    const matchId = String.fromCharCode(96 + idx); // a, b, c...
    setForm(p => ({
      ...p,
      matchingPairs: [...p.matchingPairs, { itemId, itemText: '', matchId, matchText: '' }],
      correctAnswerData: { ...(p.correctAnswerData || {}), [itemId]: matchId },
    }));
  };
  const removePair = (i) => {
    setForm(p => {
      const pairs = p.matchingPairs.filter((_, j) => j !== i);
      const correctData = {};
      pairs.forEach(pr => { correctData[pr.itemId] = pr.matchId; });
      return { ...p, matchingPairs: pairs, correctAnswerData: correctData };
    });
  };
  const updatePair = (i, field, val) => {
    setForm(p => {
      const pairs = p.matchingPairs.map((pr, j) => j === i ? { ...pr, [field]: val } : pr);
      const correctData = {};
      pairs.forEach(pr => { correctData[pr.itemId] = pr.matchId; });
      return { ...p, matchingPairs: pairs, correctAnswerData: correctData };
    });
  };

  return (
    <div className="form-group">
      <label className="form-label">Matching Pairs *</label>
      <p className="text-xs text-surface-400 mb-2">Correct answers are auto-set from the pairs you define. Shuffle is handled automatically during practice.</p>
      <div className="grid grid-cols-2 gap-2 text-xs font-semibold text-surface-500 uppercase px-1 mb-1">
        <span>Column A (item)</span>
        <span>Column B (match)</span>
      </div>
      {form.matchingPairs.map((pair, i) => (
        <div key={i} className="grid grid-cols-2 gap-2 mb-1.5 items-center">
          <div className="flex gap-1 items-center">
            <span className="text-xs font-bold text-primary-600 w-5 flex-shrink-0">{pair.itemId}.</span>
            <input className="form-input flex-1 text-sm py-2" value={pair.itemText}
              onChange={e => updatePair(i, 'itemText', e.target.value)} placeholder={`Column A item ${pair.itemId}`} />
          </div>
          <div className="flex gap-1 items-center">
            <span className="text-xs font-bold text-violet-600 w-5 flex-shrink-0">{pair.matchId}.</span>
            <input className="form-input flex-1 text-sm py-2" value={pair.matchText}
              onChange={e => updatePair(i, 'matchText', e.target.value)} placeholder={`Column B match`} />
            {form.matchingPairs.length > 2 && <button onClick={() => removePair(i)} className="btn btn-ghost btn-sm text-red-500 py-1 px-1.5">✕</button>}
          </div>
        </div>
      ))}
      <button onClick={addPair} className="btn btn-secondary btn-sm text-xs mt-1">+ Add Pair</button>
    </div>
  );
}

function PassageBasedFields({ form, setForm }) {
  const setOpt = (key, val) => setForm(p => ({ ...p, options: p.options.map(o => o.key === key ? { ...o, text: val } : o) }));
  return (
    <div className="flex flex-col gap-3">
      <div className="form-group">
        <label className="form-label">Passage Text *</label>
        <textarea className="form-input" rows={4} value={form.passageText || ''}
          onChange={e => setForm(p => ({ ...p, passageText: e.target.value }))} placeholder="Enter the reading passage…" />
      </div>
      <div className="form-group">
        <label className="form-label">Options & Correct Answer *</label>
        <div className="flex flex-col gap-2">
          {form.options.map(opt => (
            <div key={opt.key} className="flex gap-2 items-center">
              <span className={`option-key flex-shrink-0 ${form.correctAnswer === opt.key ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : ''}`}>{opt.key}</span>
              <input className="form-input flex-1 text-sm py-2" value={opt.text} onChange={e => setOpt(opt.key, e.target.value)} placeholder={`Option ${opt.key}`} />
              <button onClick={() => setForm(p => ({ ...p, correctAnswer: opt.key }))} className={`btn btn-sm flex-shrink-0 ${form.correctAnswer === opt.key ? 'btn-primary' : 'btn-ghost'}`}>
                {form.correctAnswer === opt.key ? <CheckCircle size={13} /> : <XCircle size={13} className="opacity-30" />}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Validation per type ──────────────────────────────────────────────────────

function validateForm(form) {
  if (!form.text.trim()) return 'Question text is required.';
  if (!form.exam) return 'Exam is required.';
  if (!form.subject) return 'Subject is required.';
  if (!form.topic) return 'Topic is required.';

  const qt = form.questionType;

  if (qt === 'single_choice' || qt === 'passage_based') {
    if (form.options.some(o => !o.text.trim())) return 'All 4 options must have text.';
    if (!form.correctAnswer) return 'Please select the correct answer.';
  }
  if (qt === 'multiple_select') {
    if (form.options.some(o => !o.text.trim())) return 'All options must have text.';
    if (!Array.isArray(form.correctAnswerData) || form.correctAnswerData.length < 1)
      return 'Select at least one correct answer.';
  }
  if (qt === 'true_false') {
    if (!form.correctAnswer) return 'Please select True or False as the correct answer.';
  }
  if (qt === 'fill_blank') {
    if (!form.blanks.length) return 'At least one blank is required.';
    const data = form.correctAnswerData;
    if (!Array.isArray(data) || data.length === 0) return 'Accepted answers are required for each blank.';
    for (let i = 0; i < data.length; i++) {
      if (!data[i] || !data[i][0] || !data[i][0].trim()) return `Primary answer for blank ${i + 1} is required.`;
    }
  }
  if (qt === 'assertion_reason') {
    if (!form.assertionText.trim()) return 'Assertion text is required.';
    if (!form.reasonText.trim()) return 'Reason text is required.';
    if (!form.correctAnswer) return 'Please select the correct option.';
  }
  if (qt === 'statement_based') {
    if (form.statements.some(s => !s.text.trim())) return 'All statements must have text.';
    if (form.options.some(o => !o.text.trim())) return 'All options must have text.';
    if (!form.correctAnswer) return 'Please select the correct answer.';
  }
  if (qt === 'matching') {
    if (form.matchingPairs.length < 2) return 'At least 2 matching pairs are required.';
    if (form.matchingPairs.some(p => !p.itemText.trim() || !p.matchText.trim())) return 'All matching pair texts are required.';
  }
  if (qt === 'passage_based') {
    if (!form.passageText.trim()) return 'Passage text is required.';
  }
  return null;
}

// ─── Build the payload sent to the API ───────────────────────────────────────

function buildPayload(form) {
  const base = {
    text: form.text.trim(),
    questionType: form.questionType,
    type: form.questionType === 'single_choice' ? 'mcq' : form.questionType, // legacy compat
    difficulty: form.difficulty,
    exam: form.exam,
    subject: form.subject,
    topic: form.topic,
    marks: Number(form.marks) || 1,
    negativeMarks: Number(form.negativeMarks) || 0,
    source: form.source,
    explanation: (form.explanation || '').trim(),
  };

  const qt = form.questionType;
  if (['single_choice', 'assertion_reason', 'statement_based', 'passage_based'].includes(qt)) {
    base.options = form.options;
    base.correctAnswer = form.correctAnswer;
  }
  if (qt === 'multiple_select') {
    base.options = form.options;
    base.correctAnswerData = form.correctAnswerData;
  }
  if (qt === 'true_false') {
    base.options = [{ key: 'true', text: 'True' }, { key: 'false', text: 'False' }];
    base.correctAnswer = form.correctAnswer;
  }
  if (qt === 'fill_blank') {
    base.blanks = form.blanks;
    base.correctAnswerData = form.correctAnswerData;
  }
  if (qt === 'matching') {
    base.matchingPairs = form.matchingPairs;
    base.correctAnswerData = form.correctAnswerData;
  }
  if (qt === 'assertion_reason') {
    base.assertionText = form.assertionText.trim();
    base.reasonText = form.reasonText.trim();
  }
  if (qt === 'statement_based') {
    base.statements = form.statements;
  }
  if (qt === 'passage_based') {
    base.passageText = form.passageText.trim();
  }
  return base;
}

// ─── Question Modal ───────────────────────────────────────────────────────────

function QuestionModal({ question, exams, onClose, onSave }) {
  const isEdit = !!(question && question._id);

  // Initialise form — on edit use existing data; on create use defaults
  const [form, setForm] = useState(() => {
    if (isEdit) {
      // Normalise the question type from legacy 'mcq' → 'single_choice'
      const qt = question.questionType || (question.type === 'mcq' ? 'single_choice' : question.type) || 'single_choice';
      return { ...defaultFormForType(qt), ...question, questionType: qt };
    }
    return defaultFormForType('single_choice');
  });

  const [subjects, setSubjects] = useState([]);
  const [topics,   setTopics]   = useState([]);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [typeWarning, setTypeWarning] = useState('');

  useEffect(() => {
    if (form.exam) subjectService.getAll({ examId: form.exam }).then(r => setSubjects(r.data.data.subjects)).catch(() => {});
  }, [form.exam]);

  useEffect(() => {
    if (form.subject) topicService.getAll({ subjectId: form.subject }).then(r => setTopics(r.data.data.topics)).catch(() => {});
  }, [form.subject]);

  const handleTypeChange = (newType) => {
    if (isEdit && newType !== form.questionType) {
      setTypeWarning(`Changing from "${TYPE_LABELS[form.questionType] || form.questionType}" to "${TYPE_LABELS[newType] || newType}" will reset the answer configuration for this question.`);
    } else {
      setTypeWarning('');
    }
    setForm(p => ({ ...defaultFormForType(newType), text: p.text, exam: p.exam, subject: p.subject, topic: p.topic, difficulty: p.difficulty, marks: p.marks, negativeMarks: p.negativeMarks, source: p.source, explanation: p.explanation }));
  };

  const handleSave = async () => {
    const validationError = validateForm(form);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    try {
      const payload = buildPayload(form);
      if (isEdit) await questionService.update(question._id, payload);
      else        await questionService.create(payload);
      onSave();
    } catch (err) {
      setError(err.response?.data?.message || 'Save failed. Please check all fields and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 overflow-y-auto p-4">
      <div className="card max-w-2xl mx-auto my-8 animate-fade-in">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-surface-800 font-bold">{isEdit ? 'Edit Question' : 'Add Question'}</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-2xl leading-none">&times;</button>
        </div>

        {error && <div className="alert alert-error mb-4"><AlertCircle size={14} className="flex-shrink-0" /><span>{error}</span></div>}
        {typeWarning && (
          <div className="alert border-amber-300 bg-amber-50 text-amber-800 mb-4 text-xs">
            <AlertCircle size={13} className="flex-shrink-0" />
            <span>{typeWarning}</span>
            <button className="ml-auto text-xs underline" onClick={() => setTypeWarning('')}>Dismiss</button>
          </div>
        )}

        <div className="flex flex-col gap-4">
          {/* Question Type */}
          <div className="form-group">
            <label className="form-label">Question Type *</label>
            <select className="form-input form-select" value={form.questionType} onChange={e => handleTypeChange(e.target.value)}>
              {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          {/* Question Text */}
          <div className="form-group">
            <label className="form-label">Question Text *</label>
            <textarea className="form-input" rows={3} value={form.text}
              onChange={e => setForm(p => ({ ...p, text: e.target.value }))} placeholder="Enter the question…" />
            {form.questionType === 'fill_blank' && (
              <span className="text-xs text-violet-600 mt-1">Use __1__, __2__, etc. to mark blank positions.</span>
            )}
          </div>

          {/* Exam / Subject / Topic */}
          <div className="grid grid-cols-3 gap-3">
            <div className="form-group">
              <label className="form-label">Exam *</label>
              <select className="form-input form-select" value={form.exam} onChange={e => setForm(p => ({ ...p, exam: e.target.value, subject: '', topic: '' }))}>
                <option value="">Select</option>
                {exams.map(e => <option key={e._id} value={e._id}>{e.shortName}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Subject *</label>
              <select className="form-input form-select" value={form.subject} onChange={e => setForm(p => ({ ...p, subject: e.target.value, topic: '' }))}>
                <option value="">Select</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Topic *</label>
              <select className="form-input form-select" value={form.topic} onChange={e => setForm(p => ({ ...p, topic: e.target.value }))}>
                <option value="">Select</option>
                {topics.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
              </select>
            </div>
          </div>

          {/* Difficulty / Marks / Neg Marks */}
          <div className="grid grid-cols-3 gap-3">
            <div className="form-group">
              <label className="form-label">Difficulty *</label>
              <select className="form-input form-select" value={form.difficulty} onChange={e => setForm(p => ({ ...p, difficulty: e.target.value }))}>
                {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Marks</label>
              <input type="number" className="form-input" value={form.marks || 1} onChange={e => setForm(p => ({ ...p, marks: Number(e.target.value) }))} min="0" step="0.5" />
            </div>
            <div className="form-group">
              <label className="form-label">Neg. Marks</label>
              <input type="number" className="form-input" value={form.negativeMarks ?? 0} onChange={e => setForm(p => ({ ...p, negativeMarks: Number(e.target.value) }))} min="0" step="0.25" />
            </div>
          </div>

          {/* ── Type-specific fields ──────────────────────────────────────── */}
          {form.questionType === 'single_choice'    && <SingleChoiceFields    form={form} setForm={setForm} />}
          {form.questionType === 'multiple_select'  && <MultipleSelectFields  form={form} setForm={setForm} />}
          {form.questionType === 'true_false'       && <TrueFalseFields       form={form} setForm={setForm} />}
          {form.questionType === 'fill_blank'       && <FillBlankFields       form={form} setForm={setForm} />}
          {form.questionType === 'assertion_reason' && <AssertionReasonFields form={form} setForm={setForm} />}
          {form.questionType === 'statement_based'  && <StatementBasedFields  form={form} setForm={setForm} />}
          {form.questionType === 'matching'         && <MatchingFields        form={form} setForm={setForm} />}
          {form.questionType === 'passage_based'    && <PassageBasedFields    form={form} setForm={setForm} />}

          {/* Explanation */}
          <div className="form-group">
            <label className="form-label">Explanation</label>
            <textarea className="form-input" rows={2} value={form.explanation || ''}
              onChange={e => setForm(p => ({ ...p, explanation: e.target.value }))} placeholder="Explain the correct answer…" />
          </div>

          {/* Source */}
          <div className="form-group">
            <label className="form-label">Source</label>
            <select className="form-input form-select" value={form.source} onChange={e => setForm(p => ({ ...p, source: e.target.value }))}>
              <option value="admin">Admin</option>
              <option value="previous_year">Previous Year</option>
            </select>
          </div>

          <div className="flex gap-3 mt-2">
            <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
            <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1">
              {saving ? <Loader2 size={14} className="animate-spin" /> : null}
              {saving ? 'Saving…' : 'Save Question'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Default AI generation distribution ───────────────────────────────────────

const DEFAULT_DISTRIBUTION = {
  single_choice:   35,
  multiple_select: 15,
  matching:        15,
  statement_based: 10,
  assertion_reason:10,
  true_false:       5,
  fill_blank:       5,
  passage_based:    5,
};

// ─── Type Distribution Panel ──────────────────────────────────────────────────

function TypeDistributionPanel({ examId, onGenerateClick }) {
  const [stats,      setStats]      = useState(null);
  const [loading,    setLoading]    = useState(false);
  const [collapsed,  setCollapsed]  = useState(false);
  const [error,      setError]      = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = {};
    if (examId) params.examId = examId;
    questionService.getStats(params)
      .then(r => setStats(r.data.data))
      .catch(() => setError('Could not load stats. Check backend connection.'))
      .finally(() => setLoading(false));
  }, [examId]);

  useEffect(() => { load(); }, [load]);

  const total = stats?.total || 0;

  return (
    <div className="card card-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <BarChart2 size={15} className="text-violet-500" />
          <span className="font-semibold text-surface-800 text-sm">Question Bank Distribution</span>
          {total > 0 && <span className="badge badge-sm bg-surface-100 text-surface-500">{total} total</span>}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} disabled={loading} className="btn btn-ghost btn-sm py-1 px-2" title="Refresh stats">
            <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setCollapsed(c => !c)} className="btn btn-ghost btn-sm py-1 px-2">
            {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
          {loading && !stats && (
            <div className="flex gap-1 flex-col">
              {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-3 rounded" />)}
            </div>
          )}
          {stats && (
            <>
              <div className="flex flex-col gap-1.5">
                {QUESTION_TYPES.map(({ value, label }) => {
                  const count   = stats.byType?.[value] || 0;
                  const target  = DEFAULT_DISTRIBUTION[value] || 0;
                  const pct     = total > 0 ? Math.round((count / total) * 100) : 0;
                  const met     = pct >= target;
                  return (
                    <div key={value} className="flex items-center gap-2 text-xs">
                      <span className="w-36 text-surface-600 truncate flex-shrink-0">{label}</span>
                      <div className="flex-1 bg-surface-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${met ? 'bg-emerald-400' : 'bg-amber-400'}`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <span className={`w-16 text-right flex-shrink-0 ${met ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {count} ({pct}%)
                      </span>
                      <span className="w-12 text-right text-surface-400 flex-shrink-0">
                        target {target}%
                      </span>
                    </div>
                  );
                })}
              </div>

              {stats.gaps && stats.gaps.length > 0 && (
                <div className="mt-3 pt-2 border-t border-surface-100">
                  <p className="text-xs font-medium text-amber-700 mb-1">Content gaps (below target):</p>
                  <div className="flex flex-wrap gap-1">
                    {stats.gaps.map(g => (
                      <span key={g.questionType} className="badge badge-sm bg-amber-50 text-amber-700 border-amber-200">
                        {TYPE_LABELS[g.questionType]} — needs {g.needed} more
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-3">
                <button onClick={onGenerateClick} className="btn btn-primary btn-sm w-full">
                  <Sparkles size={13} /> Generate with AI
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ─── AI Generation Modal ──────────────────────────────────────────────────────

function AIGenerateModal({ exams, onClose, onSuccess }) {
  const [genExamId,   setGenExamId]   = useState('');
  const [subjects,    setSubjects]    = useState([]);
  const [genSubjectId,setGenSubjectId]= useState('');
  const [topics,      setTopics]      = useState([]);
  const [genTopicId,  setGenTopicId]  = useState('');
  const [count,       setCount]       = useState(10);
  const [difficulty,  setDifficulty]  = useState('mixed');
  const [dist,        setDist]        = useState({ ...DEFAULT_DISTRIBUTION });
  const [generating,  setGenerating]  = useState(false);
  const [result,      setResult]      = useState(null);
  const [error,       setError]       = useState('');

  // Load subjects when exam changes
  useEffect(() => {
    setSubjects([]); setGenSubjectId('');
    setTopics([]);   setGenTopicId('');
    if (!genExamId) return;
    subjectService.getAll({ examId: genExamId, isActive: true })
      .then(r => setSubjects(r.data.data.subjects || []))
      .catch(() => {});
  }, [genExamId]);

  // Load topics when subject changes
  useEffect(() => {
    setTopics([]); setGenTopicId('');
    if (!genSubjectId) return;
    topicService.getAll({ subjectId: genSubjectId, isActive: true })
      .then(r => setTopics(r.data.data.topics || []))
      .catch(() => {});
  }, [genSubjectId]);

  const totalPct = Object.values(dist).reduce((s, v) => s + (Number(v) || 0), 0);

  const updateDist = (type, val) => {
    setDist(p => ({ ...p, [type]: Math.max(0, Math.min(100, Number(val) || 0)) }));
  };

  const resetDist = () => setDist({ ...DEFAULT_DISTRIBUTION });

  const handleGenerate = async () => {
    if (!genExamId) { setError('Please select an exam.'); return; }
    if (totalPct === 0) { setError('Type distribution must sum to at least 1%.'); return; }
    setError('');
    setGenerating(true);
    setResult(null);
    try {
      const payload = {
        examId: genExamId,
        count: Math.min(50, Math.max(1, count)),
        difficulty,
        typeDistribution: dist,
      };
      if (genSubjectId) payload.subjectId = genSubjectId;
      if (genTopicId)   payload.topicId   = genTopicId;
      const r = await questionService.generate(payload);
      setResult(r.data.data);
    } catch (err) {
      const msg = err.response?.data?.message || 'Generation failed. Check AI_API_KEY in backend .env.';
      setError(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="card w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Sparkles size={18} className="text-violet-500" />
            <h3 className="text-surface-800 font-bold">Generate Questions with AI</h3>
          </div>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-xl leading-none">&times;</button>
        </div>

        {result ? (
          /* ── Results view ── */
          <div className="flex flex-col gap-4">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
              <p className="font-semibold text-emerald-700 mb-1">
                ✅ {result.generated} question{result.generated !== 1 ? 's' : ''} generated successfully
              </p>
              <p className="text-xs text-emerald-600">
                {result.duplicatesSkipped > 0 && `${result.duplicatesSkipped} duplicate(s) skipped. `}
                {result.failed > 0 && `${result.failed} failed validation. `}
              </p>
            </div>

            {result.byType && Object.keys(result.byType).length > 0 && (
              <div>
                <p className="text-sm font-medium text-surface-700 mb-2">Generated by type:</p>
                <div className="flex flex-col gap-1">
                  {Object.entries(result.byType).map(([type, n]) => (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-surface-600">{TYPE_LABELS[type] || type}</span>
                      <span className="font-medium text-surface-800">{n}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-700">
              <strong>⚠️ Pending Approval:</strong> Generated questions are saved as <em>Pending</em>.
              Click <em>Pending</em> in the Status column of the Question Bank to approve each one
              before it appears in practice sessions.
            </div>

            {result.demoMode && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                <strong>Demo mode:</strong> Set a valid <code>AI_API_KEY</code> (Gemini or OpenAI) in
                your backend <code>.env</code> to generate real questions.
              </div>
            )}

            <div className="flex gap-3 mt-2">
              <button onClick={() => { setResult(null); setError(''); }} className="btn btn-secondary flex-1">
                Generate More
              </button>
              <button onClick={() => { onSuccess(); onClose(); }} className="btn btn-primary flex-1">
                Done — View Questions
              </button>
            </div>
          </div>
        ) : (
          /* ── Form view ── */
          <div className="flex flex-col gap-4">
            {/* Exam / Subject / Topic */}
            <div className="grid grid-cols-3 gap-3">
              <div className="form-group">
                <label className="form-label">Exam *</label>
                <select className="form-input form-select" value={genExamId} onChange={e => setGenExamId(e.target.value)}>
                  <option value="">Select exam</option>
                  {exams.map(e => <option key={e._id} value={e._id}>{e.shortName}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Subject</label>
                <select className="form-input form-select" value={genSubjectId} onChange={e => setGenSubjectId(e.target.value)} disabled={!genExamId}>
                  <option value="">All subjects</option>
                  {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Topic</label>
                <select className="form-input form-select" value={genTopicId} onChange={e => setGenTopicId(e.target.value)} disabled={!genSubjectId}>
                  <option value="">All topics</option>
                  {topics.map(t => <option key={t._id} value={t._id}>{t.name}</option>)}
                </select>
              </div>
            </div>

            {/* Count / Difficulty */}
            <div className="grid grid-cols-2 gap-3">
              <div className="form-group">
                <label className="form-label">Number of Questions (1–50)</label>
                <input type="number" className="form-input" value={count} min={1} max={50}
                  onChange={e => setCount(Math.min(50, Math.max(1, Number(e.target.value))))} />
              </div>
              <div className="form-group">
                <label className="form-label">Difficulty</label>
                <select className="form-input form-select" value={difficulty} onChange={e => setDifficulty(e.target.value)}>
                  <option value="mixed">Mixed</option>
                  <option value="easy">Easy</option>
                  <option value="medium">Medium</option>
                  <option value="hard">Hard</option>
                </select>
              </div>
            </div>

            {/* Type Distribution */}
            <div className="form-group">
              <div className="flex items-center justify-between mb-2">
                <label className="form-label mb-0">Type Distribution (%)</label>
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-medium ${totalPct === 100 ? 'text-emerald-600' : 'text-amber-600'}`}>
                    Total: {totalPct}%
                  </span>
                  <button onClick={resetDist} className="btn btn-ghost btn-sm py-1 px-2 text-xs">Reset</button>
                </div>
              </div>
              <div className="bg-surface-50 rounded-lg p-3 flex flex-col gap-2">
                {QUESTION_TYPES.map(({ value, label }) => (
                  <div key={value} className="flex items-center gap-3">
                    <span className="text-xs text-surface-600 w-40 flex-shrink-0">{label}</span>
                    <input
                      type="range" min={0} max={100} step={5}
                      value={dist[value] || 0}
                      onChange={e => updateDist(value, e.target.value)}
                      className="flex-1"
                    />
                    <input
                      type="number" min={0} max={100}
                      value={dist[value] || 0}
                      onChange={e => updateDist(value, e.target.value)}
                      className="form-input w-14 text-center text-sm py-1"
                    />
                  </div>
                ))}
              </div>
              {totalPct !== 100 && (
                <p className="text-xs text-amber-600 mt-1">
                  Distribution sums to {totalPct}%. It doesn't have to be exactly 100% — the system will scale proportionally.
                </p>
              )}
            </div>

            {error && (
              <div className="alert alert-error text-sm">
                <AlertCircle size={14} className="flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <div className="bg-surface-50 rounded-lg p-3 text-xs text-surface-500">
              Generated questions are saved as <strong>Pending</strong> and require approval
              before appearing in practice sessions. Generation may take 15–60 seconds depending on count.
            </div>

            <div className="flex gap-3 mt-1">
              <button onClick={onClose} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={handleGenerate} disabled={generating || !genExamId} className="btn btn-primary flex-1">
                {generating ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {generating ? 'Generating…' : `Generate ${count} Questions`}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdminQuestions() {
  const [questions,    setQuestions]    = useState([]);
  const [exams,        setExams]        = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [pagination,   setPagination]   = useState(null);
  const [filters,      setFilters]      = useState({ examId: '', subjectId: '', difficulty: '', questionType: '', search: '', page: 1 });
  const [modal,        setModal]        = useState(null);
  const [aiModal,      setAiModal]      = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [deleting,     setDeleting]     = useState(false);
  const [toast,        setToast]        = useState(null);

  const showToast = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const loadQuestions = useCallback(() => {
    setLoading(true);
    setLoadError('');
    const params = { page: filters.page, limit: 15 };
    if (filters.examId)       params.examId       = filters.examId;
    if (filters.difficulty)   params.difficulty   = filters.difficulty;
    if (filters.questionType) params.questionType = filters.questionType;
    if (filters.search)       params.search       = filters.search;
    questionService.getAll(params)
      .then(r => { setQuestions(r.data.data.questions); setPagination(r.data.data.pagination); })
      .catch(() => setLoadError('Failed to load questions. Please retry.'))
      .finally(() => setLoading(false));
  }, [filters]);

  useEffect(() => { loadQuestions(); }, [loadQuestions]);
  useEffect(() => { examService.getAll({ isActive: true }).then(r => setExams(r.data.data.exams)).catch(() => {}); }, []);

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await questionService.delete(deleteConfirm.questionId);
      loadQuestions();
      setDeleteConfirm(null);
      showToast('success', 'Question deactivated successfully.');
    } catch (err) {
      showToast('error', err.response?.data?.message || 'Failed to deactivate question.');
    } finally {
      setDeleting(false);
    }
  };

  const handleApprove = async (id) => {
    await questionService.approve(id);
    loadQuestions();
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Question Bank</h1>
          <p className="text-surface-400 text-sm mt-1">
            {pagination ? `${pagination.total} questions total` : 'Manage practice questions'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAiModal(true)} className="btn btn-secondary btn-sm">
            <Sparkles size={14} /> Generate with AI
          </button>
          <button onClick={() => setModal({})} className="btn btn-primary btn-sm">
            <Plus size={14} /> Add Question
          </button>
        </div>
      </div>

      {/* Type Distribution Panel */}
      <TypeDistributionPanel
        examId={filters.examId}
        onGenerateClick={() => setAiModal(true)}
      />

      {loadError && (
        <div className="alert alert-error">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{loadError}</span>
          <button onClick={loadQuestions} className="ml-auto btn btn-secondary btn-sm">Retry</button>
        </div>
      )}

      {/* Filters */}
      <div className="card card-sm flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-500" />
          <input className="form-input pl-8 text-sm py-2" placeholder="Search questions…"
            value={filters.search} onChange={e => setFilters(p => ({ ...p, search: e.target.value, page: 1 }))} />
        </div>
        <select className="form-input form-select text-sm py-2 w-auto" value={filters.examId}
          onChange={e => setFilters(p => ({ ...p, examId: e.target.value, page: 1 }))}>
          <option value="">All Exams</option>
          {exams.map(e => <option key={e._id} value={e._id}>{e.shortName}</option>)}
        </select>
        <select className="form-input form-select text-sm py-2 w-auto" value={filters.questionType}
          onChange={e => setFilters(p => ({ ...p, questionType: e.target.value, page: 1 }))}>
          <option value="">All Types</option>
          {QUESTION_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        <select className="form-input form-select text-sm py-2 w-auto" value={filters.difficulty}
          onChange={e => setFilters(p => ({ ...p, difficulty: e.target.value, page: 1 }))}>
          <option value="">All Difficulties</option>
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      {/* Questions Table */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left py-3 px-4 text-surface-500 font-medium">Question</th>
                <th className="text-left py-3 px-4 text-surface-500 font-medium hidden md:table-cell">Type</th>
                <th className="text-left py-3 px-4 text-surface-500 font-medium hidden md:table-cell">Topic</th>
                <th className="text-center py-3 px-4 text-surface-500 font-medium">Difficulty</th>
                <th className="text-center py-3 px-4 text-surface-500 font-medium">Status</th>
                <th className="text-right py-3 px-4 text-surface-500 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-surface-200/50">
                    <td colSpan={6} className="py-3 px-4"><div className="skeleton h-4 rounded w-3/4" /></td>
                  </tr>
                ))
              ) : loadError ? (
                <tr><td colSpan={6} className="py-12 text-center text-surface-500">Unable to load questions. Use the Retry button above.</td></tr>
              ) : questions.length === 0 ? (
                <tr><td colSpan={6} className="py-12 text-center text-surface-500">No questions found. Add your first question!</td></tr>
              ) : questions.map(q => (
                <tr key={q._id} className="border-b border-surface-200/50 hover:bg-surface-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="text-surface-700 truncate max-w-xs" title={q.text}>{q.text}</div>
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    <span className="badge badge-sm bg-violet-50 text-violet-700 border-violet-200">
                      {TYPE_LABELS[q.questionType] || TYPE_LABELS[q.type] || q.type || 'MCQ'}
                    </span>
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell text-surface-500">{q.topic?.name || '—'}</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`badge diff-${q.difficulty}`}>{q.difficulty}</span>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {q.isApproved
                      ? <span className="badge badge-success">Approved</span>
                      : <button onClick={() => handleApprove(q._id)} className="badge badge-warning cursor-pointer hover:opacity-80">Pending</button>
                    }
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => setModal(q)} className="btn btn-ghost btn-sm py-1 px-2"><Edit2 size={12} /></button>
                      <button onClick={() => setDeleteConfirm({ questionId: q._id, questionText: q.text })}
                        className="btn btn-ghost btn-sm py-1 px-2 text-red-500 hover:text-red-700"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
            <span className="text-sm text-surface-500">
              Showing {((filters.page - 1) * 15) + 1}–{Math.min(filters.page * 15, pagination.total)} of {pagination.total}
            </span>
            <div className="flex gap-2">
              <button onClick={() => setFilters(p => ({ ...p, page: p.page - 1 }))} disabled={filters.page === 1} className="btn btn-secondary btn-sm">Prev</button>
              <button onClick={() => setFilters(p => ({ ...p, page: p.page + 1 }))} disabled={filters.page === pagination.totalPages} className="btn btn-secondary btn-sm">Next</button>
            </div>
          </div>
        )}
      </div>

      {modal !== null && (
        <QuestionModal question={modal._id ? modal : null} exams={exams}
          onClose={() => setModal(null)} onSave={() => { setModal(null); loadQuestions(); }} />
      )}

      {/* AI Generation Modal */}
      {aiModal && (
        <AIGenerateModal
          exams={exams}
          onClose={() => setAiModal(false)}
          onSuccess={() => { loadQuestions(); showToast('success', 'Questions generated! Approve them in the Status column.'); }}
        />
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card w-full max-w-sm animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-surface-800 font-bold">Deactivate Question?</h3>
              <button onClick={() => setDeleteConfirm(null)} className="text-surface-400 hover:text-surface-600 text-xl leading-none">&times;</button>
            </div>
            <p className="text-sm text-surface-600 bg-surface-50 p-2 rounded mb-3">
              {deleteConfirm.questionText.slice(0, 80)}{deleteConfirm.questionText.length > 80 ? '…' : ''}
            </p>
            <p className="text-xs text-surface-500 mb-4">
              This question will no longer appear in new practice sessions. Student history and past results are preserved.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn flex-1 bg-red-600 hover:bg-red-700 text-white border-red-600">
                {deleting ? <Loader2 size={14} className="animate-spin" /> : null}
                {deleting ? 'Deactivating…' : 'Deactivate'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2 ${
          toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
        }`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}
