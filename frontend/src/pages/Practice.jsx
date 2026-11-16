import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import {
  BookOpen, ChevronRight, Loader2, SlidersHorizontal, AlertCircle,
  Clock, CheckCircle, XCircle, MinusCircle, Eye, ChevronLeft, AlertTriangle
} from 'lucide-react';
import { examService, subjectService, topicService, practiceService } from '../services';
import { useAuth } from '../context/AuthContext';

const DIFFICULTIES = [
  { value: 'mixed', label: 'Mixed', desc: 'All levels' },
  { value: 'easy', label: 'Easy', desc: 'Foundational' },
  { value: 'medium', label: 'Medium', desc: 'Moderate' },
  { value: 'hard', label: 'Hard', desc: 'Challenging' },
];
const COUNTS = [5, 10, 15, 20, 30];

export default function Practice() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Pre-selection passed from weak-topic "Practice This Topic" links
  const preSelectedTopic = location.state?.topicId || '';

  const [exams, setExams] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [topics, setTopics] = useState([]);

  // Resolve the saved profile exam ID safely — handle both populated object and raw string
  const profileExamId = user?.targetExam?._id || user?.targetExam || '';

  const [selectedExam, setSelectedExam] = useState(profileExamId);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [difficulty, setDifficulty] = useState('mixed');
  const [count, setCount] = useState(10);

  const [loading, setLoading] = useState({ exams: true, subjects: false, topics: false, starting: false });
  const [error, setError] = useState('');
  // Shortfall confirmation — shown when backend returns 422
  const [shortfallInfo, setShortfallInfo] = useState(null); // { available, requestedCount, message, pendingPayload }
  const startingRef = useRef(false); // duplicate-click guard

  // ── Practice history ──────────────────────────────────────────────────────
  const [history,      setHistory]      = useState([]);
  const [histLoading,  setHistLoading]  = useState(true);
  const [histError,    setHistError]    = useState('');
  const [histPage,     setHistPage]     = useState(1);
  const [histPagination, setHistPagination] = useState(null);

  // Abort-controller ref to cancel stale subject/topic requests
  const subjectReqId = useRef(0);
  const topicReqId = useRef(0);

  // Load history on mount and when page changes
  useEffect(() => {
    setHistLoading(true);
    setHistError('');
    practiceService.getMySessions({ page: histPage, limit: 6 })
      .then(r => {
        setHistory(r.data.data.sessions || []);
        setHistPagination(r.data.data.pagination || null);
      })
      .catch(err => setHistError(err.response?.data?.message || 'Failed to load history.'))
      .finally(() => setHistLoading(false));
  }, [histPage]);

  // Load exams once on mount
  useEffect(() => {
    examService.getAll({ isActive: true })
      .then(r => {
        const list = r.data.data.exams || [];
        setExams(list);
        // After exams load, validate that the pre-selected exam still exists in the list.
        // If the saved profile exam ID is not in the list (e.g. exam deactivated), clear it.
        if (profileExamId && list.length > 0) {
          const found = list.some(e => e._id === profileExamId || e._id.toString() === profileExamId.toString());
          if (!found) setSelectedExam('');
        }
      })
      .catch(() => setError('Failed to load exams.'))
      .finally(() => setLoading(p => ({ ...p, exams: false })));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load subjects when exam changes — cancel stale responses
  useEffect(() => {
    if (!selectedExam) {
      setSubjects([]);
      setSelectedSubject('');
      setTopics([]);
      setSelectedTopic('');
      return;
    }

    const reqId = ++subjectReqId.current;
    setLoading(p => ({ ...p, subjects: true }));
    setSubjects([]);
    setSelectedSubject('');
    setTopics([]);
    setSelectedTopic('');
    setError('');

    subjectService.getAll({ examId: selectedExam })
      .then(r => {
        // Discard if a newer request has already started
        if (reqId !== subjectReqId.current) return;
        setSubjects(r.data.data.subjects || []);
      })
      .catch(() => {
        if (reqId !== subjectReqId.current) return;
        setError('Failed to load subjects.');
      })
      .finally(() => {
        if (reqId !== subjectReqId.current) return;
        setLoading(p => ({ ...p, subjects: false }));
      });
  }, [selectedExam]);

  // Load topics when subject changes — cancel stale responses
  useEffect(() => {
    if (!selectedSubject) {
      setTopics([]);
      setSelectedTopic('');
      return;
    }

    const reqId = ++topicReqId.current;
    setLoading(p => ({ ...p, topics: true }));
    setTopics([]);
    setSelectedTopic('');

    topicService.getAll({ subjectId: selectedSubject })
      .then(r => {
        if (reqId !== topicReqId.current) return;
        const loaded = r.data.data.topics || [];
        setTopics(loaded);
        // Auto-select topic if coming from "Practice This Topic"
        if (preSelectedTopic) {
          const match = loaded.find(t => t._id === preSelectedTopic || t._id.toString() === preSelectedTopic.toString());
          if (match) setSelectedTopic(match._id);
        }
      })
      .catch(() => {
        if (reqId !== topicReqId.current) return;
        setError('Failed to load topics.');
      })
      .finally(() => {
        if (reqId !== topicReqId.current) return;
        setLoading(p => ({ ...p, topics: false }));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSubject]);

  const handleExamChange = (e) => {
    // Changing exam must clear subject and topic so stale values are never submitted
    setSelectedExam(e.target.value);
    // selectedSubject and selectedTopic are reset inside the subjects useEffect
  };

  const handleStart = async (overrideCount = null) => {
    if (!selectedExam || !selectedSubject) {
      setError('Please select an exam and subject to start.');
      return;
    }
    // Prevent duplicate submissions from rapid clicks
    if (startingRef.current) return;
    startingRef.current = true;
    setLoading(p => ({ ...p, starting: true }));
    setError('');
    setShortfallInfo(null);
    const requestedCount = overrideCount !== null ? overrideCount : count;
    const payload = {
      examId: selectedExam,
      subjectId: selectedSubject,
      topicId: selectedTopic || undefined,
      difficulty,
      count: requestedCount,
    };
    try {
      const res = await practiceService.startSession(payload);
      const { session, questions, meta } = res.data.data;
      sessionStorage.setItem(`practice_session_${session._id}`, JSON.stringify({ questions, meta }));
      navigate(`/practice/session/${session._id}`);
    } catch (err) {
      // 422 = shortfall — the exact count cannot be fulfilled. Offer user a choice.
      if (err.response?.status === 422 && err.response?.data?.shortfall) {
        const meta = err.response.data.data?.meta || {};
        setShortfallInfo({
          available: meta.available,
          requestedCount: meta.requestedCount,
          message: meta.shortfallMessage || err.response.data.message,
          payload,
        });
      } else {
        setError(err.response?.data?.message || 'Failed to start session. Please try again.');
      }
    } finally {
      startingRef.current = false;
      setLoading(p => ({ ...p, starting: false }));
    }
  };

  // User confirms they want to proceed with fewer questions
  const handleShortfallProceed = async () => {
    if (!shortfallInfo) return;
    setShortfallInfo(null);
    await handleStart(shortfallInfo.available);
  };

  // Determine subject dropdown state message
  const subjectPlaceholder = () => {
    if (!selectedExam) return 'Select exam first';
    if (loading.subjects) return 'Loading subjects…';
    if (subjects.length === 0) return 'No subjects configured for this exam';
    return 'Select subject';
  };

  // Determine topic dropdown state message
  const topicPlaceholder = () => {
    if (!selectedSubject) return 'Select subject first';
    if (loading.topics) return 'Loading topics…';
    if (topics.length === 0) return 'No topics configured — any topic will be used';
    return 'All topics';
  };

  // Inline validation message for the Start button area
  const startBlockReason = !selectedExam
    ? 'Select a target exam first'
    : !selectedSubject
    ? subjects.length === 0
      ? 'No subjects available for this exam'
      : 'Select a subject to continue'
    : null;

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      {/* Shortfall confirmation modal */}
      {shortfallInfo && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <AlertTriangle size={22} className="text-amber-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-bold text-surface-900">Not enough questions available</h3>
                <p className="text-surface-600 text-sm mt-1">{shortfallInfo.message}</p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                id="shortfall-cancel-btn"
                onClick={() => setShortfallInfo(null)}
                className="btn btn-ghost"
              >
                Change filters
              </button>
              <button
                id="shortfall-proceed-btn"
                onClick={handleShortfallProceed}
                className="btn btn-primary"
                disabled={loading.starting}
              >
                {loading.starting ? <Loader2 size={15} className="animate-spin" /> : null}
                Proceed with {shortfallInfo.available} question{shortfallInfo.available !== 1 ? 's' : ''}
              </button>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-surface-900">Practice Questions</h1>
        <p className="text-surface-500 text-sm mt-1">Configure your practice session and start answering questions.</p>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      <div className="card flex flex-col gap-5">
        <div className="flex items-center gap-2 text-surface-700 font-semibold">
          <SlidersHorizontal size={16} className="text-primary-400" />
          Session Configuration
        </div>

        {/* Exam */}
        <div className="form-group">
          <label className="form-label">Target Exam *</label>
          {loading.exams ? (
            <div className="skeleton h-10 rounded-lg" />
          ) : (
            <select
              id="practice-exam-select"
              className="form-input form-select"
              value={selectedExam}
              onChange={handleExamChange}
            >
              <option value="">Select exam</option>
              {exams.map(e => (
                <option key={e._id} value={e._id}>{e.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Subject */}
        <div className="form-group">
          <label className="form-label">Subject *</label>
          {loading.subjects ? (
            <div className="skeleton h-10 rounded-lg" />
          ) : (
            <>
              <select
                id="practice-subject-select"
                className="form-input form-select"
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                disabled={!selectedExam || loading.subjects}
              >
                <option value="">{subjectPlaceholder()}</option>
                {subjects.map(s => (
                  <option key={s._id} value={s._id}>{s.name}</option>
                ))}
              </select>
              {selectedExam && !loading.subjects && subjects.length === 0 && (
                <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                  <AlertCircle size={11} />
                  No subjects are configured for this exam yet. Contact an admin to seed syllabus data.
                </p>
              )}
            </>
          )}
        </div>

        {/* Topic */}
        <div className="form-group">
          <label className="form-label">Topic <span className="text-surface-400">(optional)</span></label>
          {loading.topics ? (
            <div className="skeleton h-10 rounded-lg" />
          ) : (
            <select
              id="practice-topic-select"
              className="form-input form-select"
              value={selectedTopic}
              onChange={e => setSelectedTopic(e.target.value)}
              disabled={!selectedSubject || loading.topics}
            >
              <option value="">{topicPlaceholder()}</option>
              {topics.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          )}
        </div>

        {/* Difficulty */}
        <div className="form-group">
          <label className="form-label">Difficulty Level</label>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DIFFICULTIES.map(({ value, label, desc }) => (
              <button
                key={value}
                type="button"
                onClick={() => setDifficulty(value)}
                className={`p-3 rounded-lg border text-left transition-all ${
                  difficulty === value
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-surface-200 bg-surface-50 text-surface-600 hover:border-surface-300'
                }`}
              >
                <div className="font-semibold text-sm">{label}</div>
                <div className="text-xs opacity-70">{desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* Question count */}
        <div className="form-group">
          <label className="form-label">Number of Questions</label>
          <div className="flex gap-2 flex-wrap">
            {COUNTS.map(n => (
              <button
                key={n}
                type="button"
                onClick={() => setCount(n)}
                className={`px-4 py-2 rounded-lg border text-sm font-semibold transition-all ${
                  count === n
                    ? 'border-primary-600 bg-primary-50 text-primary-700'
                    : 'border-surface-200 bg-surface-50 text-surface-600 hover:border-surface-300'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </div>

        {startBlockReason && (
          <p className="text-xs text-amber-600 flex items-center gap-1">
            <AlertCircle size={12} />
            {startBlockReason}
          </p>
        )}
        <button
          id="practice-start-btn"
          onClick={() => handleStart()}
          disabled={loading.starting || !!startBlockReason}
          className="btn btn-primary w-full"
          title={startBlockReason || `Start ${count}-question session`}
        >
          {loading.starting ? <Loader2 size={18} className="animate-spin" /> : <BookOpen size={18} />}
          {loading.starting ? 'Starting session…' : `Start ${count} Questions`}
        </button>
      </div>
      {/* session config card ends above */}
    {/* ─── Previous Sessions ──────────────────────────────────────────────── */}
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-surface-900">Previous Sessions</h2>
        {histPagination && (
          <span className="badge badge-gray text-xs">{histPagination.total} total</span>
        )}
      </div>

      {histError && (
        <div className="alert alert-error text-sm">
          <AlertCircle size={14} />
          <span>{histError}</span>
          <button
            onClick={() => { setHistPage(1); setHistError(''); }}
            className="ml-auto text-xs underline"
          >Retry</button>
        </div>
      )}

      {histLoading ? (
        <div className="flex flex-col gap-2">
          {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}
        </div>
      ) : history.length === 0 ? (
        <div className="card">
          <div className="empty-state py-8">
            <BookOpen size={32} className="opacity-30 text-surface-400" />
            <div>
              <div className="text-surface-600 font-semibold">No sessions yet</div>
              <div className="text-surface-400 text-sm">Complete your first practice session to see history here.</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {history.map(s => {
            const r = s.result || {};
            const subjectName = s.subject?.name || 'Practice';
            const topicName   = s.topic?.name || '';
            return (
              <div key={s._id} className="card card-sm flex items-center gap-3 hover:border-surface-300 transition-colors">
                {/* Status dot */}
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  (r.accuracy || 0) >= 70 ? 'bg-emerald-500' :
                  (r.accuracy || 0) >= 50 ? 'bg-amber-500'  : 'bg-red-500'
                }`} />

                {/* Session info */}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-surface-700 text-sm truncate">
                    {subjectName}{topicName ? ` — ${topicName}` : ''}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-surface-400 mt-0.5 flex-wrap">
                    <span>{s.exam?.shortName || ''}</span>
                    {s.difficulty && <><span>·</span><span className="capitalize">{s.difficulty}</span></>}
                    <span>·</span>
                    <span>{new Date(s.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                  </div>
                </div>

                {/* Stats */}
                <div className="hidden sm:flex items-center gap-3 text-xs text-surface-500 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <CheckCircle size={11} className="text-emerald-500" />
                    {r.correct || 0}
                  </div>
                  <div className="flex items-center gap-1">
                    <XCircle size={11} className="text-red-400" />
                    {r.wrong || 0}
                  </div>
                  <div className="flex items-center gap-1">
                    <MinusCircle size={11} className="text-surface-400" />
                    {r.skipped || 0}
                  </div>
                  <div className="flex items-center gap-1">
                    <Clock size={11} className="text-primary-400" />
                    {r.timeTaken ? `${Math.round(r.timeTaken / 60)}m` : '—'}
                  </div>
                </div>

                {/* Accuracy badge */}
                <span className={`badge text-xs flex-shrink-0 ${
                  (r.accuracy || 0) >= 70 ? 'badge-success' :
                  (r.accuracy || 0) >= 50 ? 'badge-warning' : 'badge-danger'
                }`}>
                  {r.accuracy || 0}%
                </span>

                {/* Review link */}
                <Link
                  to={`/practice/review/${s._id}`}
                  className="btn btn-ghost btn-sm text-xs flex-shrink-0 gap-1"
                  title="Review answers"
                >
                  <Eye size={13} /> Review
                </Link>
              </div>
            );
          })}

          {/* Pagination */}
          {histPagination && histPagination.pages > 1 && (
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                onClick={() => setHistPage(p => Math.max(1, p - 1))}
                disabled={histPage <= 1}
                className="btn btn-ghost btn-sm"
              >
                <ChevronLeft size={14} /> Prev
              </button>
              <span className="text-xs text-surface-500">
                Page {histPage} of {histPagination.pages}
              </span>
              <button
                onClick={() => setHistPage(p => Math.min(histPagination.pages, p + 1))}
                disabled={histPage >= histPagination.pages}
                className="btn btn-ghost btn-sm"
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  {/* END outer flex-col gap-6 max-w-2xl */}
  </div>
  );
}
