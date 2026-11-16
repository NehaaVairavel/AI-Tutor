import { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Loader2, ChevronDown, ChevronRight, Zap, AlertCircle } from 'lucide-react';
import { examService, subjectService, topicService } from '../../services';

/**
 * Modal — scrollable, max-height constrained so it works on small screens.
 * The overlay itself scrolls on very small viewports; the card has its own
 * internal scroll so long forms (Edit Exam with all fields) stay accessible.
 */
function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="card w-full max-w-md animate-fade-in my-4 flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between mb-4 flex-shrink-0">
          <h3 className="text-surface-800 font-bold">{title}</h3>
          <button onClick={onClose} className="text-surface-400 hover:text-surface-600 text-xl leading-none">&times;</button>
        </div>
        <div className="overflow-y-auto flex-1 pr-1">
          {children}
        </div>
      </div>
    </div>
  );
}

export default function AdminExams() {
  const [exams, setExams]             = useState([]);
  const [loading, setLoading]         = useState(true);
  const [loadError, setLoadError]     = useState('');
  const [modal, setModal]             = useState(null); // { type: 'exam'|'subject'|'topic', data?, examId?, subjectId? }
  const [form, setForm]               = useState({});
  const [saving, setSaving]           = useState(false);
  const [expandedExam, setExpandedExam] = useState(null);
  const [subjects, setSubjects]       = useState({});
  const [topics, setTopics]           = useState({});
  const [deleteConfirm, setDeleteConfirm] = useState(null); // { examId, examName }
  const [deleting, setDeleting]       = useState(false);

  useEffect(() => {
    loadExams();
  }, []);

  const loadExams = () => {
    setLoading(true);
    setLoadError('');
    examService.getAll({ isActive: 'all' })
      .then(r => setExams(r.data.data.exams))
      .catch(() => setLoadError('Failed to load exams. Please retry.'))
      .finally(() => setLoading(false));
  };

  const loadSubjects = async (examId) => {
    const r = await subjectService.getAll({ examId });
    setSubjects(p => ({ ...p, [examId]: r.data.data.subjects }));
  };

  const loadTopics = async (subjectId) => {
    const r = await topicService.getAll({ subjectId });
    setTopics(p => ({ ...p, [subjectId]: r.data.data.topics }));
  };

  const handleExpandExam = async (examId) => {
    if (expandedExam === examId) { setExpandedExam(null); return; }
    setExpandedExam(examId);
    if (!subjects[examId]) await loadSubjects(examId);
  };

  const openModal = (type, data = {}, examId = null, subjectId = null) => {
    setForm(data);
    setModal({ type, data, examId, subjectId });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { type, data, examId, subjectId } = modal;
      if (type === 'exam') {
        if (data._id) await examService.update(data._id, form);
        else await examService.create(form);
        loadExams();
      } else if (type === 'subject') {
        if (data._id) await subjectService.update(data._id, form);
        else await subjectService.create({ ...form, exam: examId });
        await loadSubjects(examId);
      } else if (type === 'topic') {
        if (data._id) await topicService.update(data._id, form);
        else await topicService.create({ ...form, subject: subjectId, exam: examId });
        await loadTopics(subjectId);
      }
      setModal(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Save failed. Please check your input and try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteExam = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      await examService.delete(deleteConfirm.examId);
      loadExams();
      setDeleteConfirm(null);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to archive exam.');
    } finally {
      setDeleting(false);
    }
  };

  const CATEGORIES = ['ssc', 'banking', 'tnpsc', 'upsc', 'railway', 'gate', 'cat', 'jee', 'neet', 'other'];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">Exam Management</h1>
          <p className="text-surface-500 text-sm mt-1">Manage exams, subjects, and topics.</p>
        </div>
        <button onClick={() => openModal('exam', { name: '', shortName: '', category: 'ssc', negativeMarking: false, negativeMarkingValue: 0, isActive: true })}
          className="btn btn-primary btn-sm">
          <Plus size={14} /> Add Exam
        </button>
      </div>

      {loadError && (
        <div className="alert alert-error">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{loadError}</span>
          <button onClick={loadExams} className="ml-auto btn btn-secondary btn-sm">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-16 rounded-xl" />)}</div>
      ) : exams.length === 0 && !loadError ? (
        <div className="card empty-state"><Zap size={28} className="opacity-30" /><span className="text-surface-500">No exams yet. Add the first one!</span></div>
      ) : (
        <div className="flex flex-col gap-3">
          {exams.map(exam => (
            <div key={exam._id} className="card card-sm">
              <div className="flex items-center gap-3">
                <button onClick={() => handleExpandExam(exam._id)} className="flex items-center gap-2 flex-1 text-left">
                  {expandedExam === exam._id ? <ChevronDown size={16} className="text-primary-400" /> : <ChevronRight size={16} className="text-surface-500" />}
                  <div>
                    <div className="text-surface-800 font-semibold text-sm">{exam.name}</div>
                    <div className="flex gap-2 mt-0.5">
                      <span className="badge badge-primary">{exam.shortName}</span>
                      <span className="badge badge-gray capitalize">{exam.category}</span>
                      {!exam.isActive && <span className="badge badge-danger">Inactive</span>}
                    </div>
                  </div>
                </button>
                <div className="flex gap-2">
                  <button onClick={() => openModal('exam', exam)} className="btn btn-ghost btn-sm"><Edit2 size={13} /></button>
                  <button onClick={() => setDeleteConfirm({ examId: exam._id, examName: exam.name })} className="btn btn-ghost btn-sm text-red-500 hover:text-red-700"><Trash2 size={13} /></button>
                </div>
              </div>

              {expandedExam === exam._id && (
                <div className="mt-4 pt-4 border-t border-surface-200">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Subjects</span>
                    <button onClick={() => openModal('subject', { name: '', color: '#6366F1' }, exam._id)} className="btn btn-ghost btn-sm text-primary-400">
                      <Plus size={12} /> Add Subject
                    </button>
                  </div>
                  <div className="flex flex-col gap-2">
                    {(subjects[exam._id] || []).map(subject => (
                      <div key={subject._id} className="p-2.5 rounded-lg bg-surface-50 border border-surface-200">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-surface-700">{subject.name}</span>
                          <div className="flex gap-1">
                            <button onClick={() => openModal('subject', subject, exam._id)} className="btn btn-ghost btn-sm py-1"><Edit2 size={11} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {(subjects[exam._id] || []).length === 0 && (
                      <span className="text-xs text-surface-600">No subjects. Add one!</span>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Modal ────────────────────────────────────────────────────────── */}
      {modal && (
        <Modal
          title={`${modal.data?._id ? 'Edit' : 'Add'} ${modal.type.charAt(0).toUpperCase() + modal.type.slice(1)}`}
          onClose={() => setModal(null)}
        >
          <div className="flex flex-col gap-3 pb-2">
            {modal.type === 'exam' && (
              <>
                <div className="form-group">
                  <label className="form-label">Exam Name *</label>
                  <input className="form-input" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. SSC Combined Graduate Level" />
                </div>
                <div className="form-group">
                  <label className="form-label">Short Name *</label>
                  <input className="form-input" value={form.shortName || ''} onChange={e => setForm(p => ({ ...p, shortName: e.target.value.toUpperCase() }))} placeholder="SSC CGL" />
                </div>
                <div className="form-group">
                  <label className="form-label">Category *</label>
                  <select className="form-input form-select" value={form.category || 'ssc'} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={2} value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="form-group">
                    <label className="form-label">Total Marks</label>
                    <input type="number" className="form-input" value={form.totalMarks || ''} onChange={e => setForm(p => ({ ...p, totalMarks: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Duration (min)</label>
                    <input type="number" className="form-input" value={form.duration || ''} onChange={e => setForm(p => ({ ...p, duration: e.target.value }))} />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="neg" checked={form.negativeMarking || false} onChange={e => setForm(p => ({ ...p, negativeMarking: e.target.checked }))} />
                  <label htmlFor="neg" className="form-label mb-0 cursor-pointer">Negative Marking</label>
                </div>
                {form.negativeMarking && (
                  <div className="form-group">
                    <label className="form-label">Negative Mark Value</label>
                    <input type="number" step="0.25" className="form-input" value={form.negativeMarkingValue || 0} onChange={e => setForm(p => ({ ...p, negativeMarkingValue: e.target.value }))} />
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input type="checkbox" id="active" checked={form.isActive !== false} onChange={e => setForm(p => ({ ...p, isActive: e.target.checked }))} />
                  <label htmlFor="active" className="form-label mb-0 cursor-pointer">Active (visible to students)</label>
                </div>
              </>
            )}

            {modal.type === 'subject' && (
              <>
                <div className="form-group">
                  <label className="form-label">Subject Name *</label>
                  <input className="form-input" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Quantitative Aptitude" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={2} value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Order</label>
                  <input type="number" className="form-input" value={form.order || 0} onChange={e => setForm(p => ({ ...p, order: e.target.value }))} />
                </div>
              </>
            )}

            {modal.type === 'topic' && (
              <>
                <div className="form-group">
                  <label className="form-label">Topic Name *</label>
                  <input className="form-input" value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Percentage" />
                </div>
                <div className="form-group">
                  <label className="form-label">Description</label>
                  <textarea className="form-input" rows={2} value={form.description || ''} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Estimated Study Time (minutes)</label>
                  <input type="number" className="form-input" value={form.estimatedStudyTime || 60} onChange={e => setForm(p => ({ ...p, estimatedStudyTime: e.target.value }))} />
                </div>
              </>
            )}

            <div className="flex gap-3 mt-2">
              <button onClick={() => setModal(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-primary flex-1">
                {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                {saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </Modal>
      )}
      {/* ── Delete Confirmation Modal ──────────────────────────────────── */}
      {deleteConfirm && (
        <Modal
          title={`Delete exam '${deleteConfirm.examName}'?`}
          onClose={() => setDeleteConfirm(null)}
        >
          <div className="flex flex-col gap-4">
            <p className="text-sm text-surface-600">
              This exam and all its subjects will be archived. Students using this as their target exam will not be affected. Historical practice data is preserved.
            </p>
            <div className="flex gap-3 mt-2">
              <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary flex-1">Cancel</button>
              <button
                onClick={handleDeleteExam}
                disabled={deleting}
                className="btn flex-1 bg-red-600 hover:bg-red-700 text-white border-red-600"
              >
                {deleting ? <Loader2 size={14} className="animate-spin" /> : null}
                {deleting ? 'Archiving...' : 'Archive Exam'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
