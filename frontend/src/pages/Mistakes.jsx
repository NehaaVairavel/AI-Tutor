import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, BookOpen, Brain, ChevronDown, ChevronUp, Search, Loader2 } from 'lucide-react';
import { practiceService } from '../services';

export default function Mistakes() {
  const [mistakes, setMistakes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    setLoading(true);
    practiceService.getMyMistakes({ page, limit: 10 })
      .then(r => {
        setMistakes(r.data.data.mistakes);
        setPagination(r.data.data.pagination);
      })
      .catch(err => setError(err.response?.data?.message || 'Failed to load mistakes.'))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <div className="flex flex-col gap-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">My Mistakes</h1>
          <p className="text-surface-500 text-sm mt-1">Review incorrect answers and learn from them.</p>
        </div>
        {pagination && (
          <span className="badge badge-danger">{pagination.total} total</span>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertTriangle size={15} />
          <span>{error}</span>
        </div>
      )}

      {loading ? (
        <div className="flex flex-col gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 rounded-xl" />)}
        </div>
      ) : mistakes.length === 0 ? (
        <div className="card">
          <div className="empty-state">
            <BookOpen size={36} className="opacity-30 text-emerald-400" />
            <div>
              <div className="text-surface-700 font-semibold">No mistakes found!</div>
              <div className="text-surface-500 text-sm">Keep practicing to build your mistake log.</div>
            </div>
            <Link to="/practice" className="btn btn-primary btn-sm">Start Practice</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {mistakes.map((item, idx) => {
            const { question: q, selectedAnswer } = item;
            const isOpen = expanded === idx;
            return (
              <div key={idx} className="card card-sm border-l-4 border-l-red-500">
                <div
                  className="flex items-start gap-3 cursor-pointer"
                  onClick={() => setExpanded(isOpen ? null : idx)}
                >
                  <AlertTriangle size={15} className="text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-surface-700 line-clamp-2">{q?.text}</p>
                    <div className="flex gap-3 mt-1 text-xs text-surface-500">
                      {q?.topic?.name && <span>{q.topic.name}</span>}
                      {q?.difficulty && (
                        <span className={`diff-${q.difficulty} px-1.5 py-0.5 rounded text-xs`}>
                          {q.difficulty}
                        </span>
                      )}
                    </div>
                  </div>
                  <button className="text-surface-500 hover:text-surface-700 flex-shrink-0 mt-0.5">
                    {isOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </div>

                {isOpen && (
                  <div className="mt-4 pt-4 border-t border-surface-200">
                    <div className="flex flex-col gap-2 mb-4">
                      {(q?.options || []).map(opt => (
                        <div
                          key={opt.key}
                          className={`option-btn pointer-events-none text-sm py-2
                            ${opt.key === q.correctAnswer ? 'correct' :
                              opt.key === selectedAnswer ? 'wrong' : ''}`}
                        >
                          <span className={`option-key text-xs
                            ${opt.key === q.correctAnswer ? 'bg-emerald-900 border-emerald-700 text-emerald-300' :
                              opt.key === selectedAnswer ? 'bg-red-900 border-red-700 text-red-300' : ''}`}>
                            {opt.key}
                          </span>
                          {opt.text}
                        </div>
                      ))}
                    </div>

                    <div className="flex gap-2 mb-4 text-xs">
                      <span className="text-surface-500">Your answer:</span>
                      <span className="text-red-600 font-semibold">{selectedAnswer || 'Skipped'}</span>
                      <span className="text-surface-400 mx-1">·</span>
                      <span className="text-surface-500">Correct:</span>
                      <span className="text-emerald-600 font-semibold">{q?.correctAnswer}</span>
                    </div>

                    {q?.explanation && (
                      <div className="bg-primary-50 border border-primary-200 rounded-lg p-3 mb-3">
                        <div className="text-xs font-semibold text-primary-600 mb-1 uppercase tracking-wide">Explanation</div>
                        <p className="text-surface-600 text-sm leading-relaxed">{q.explanation}</p>
                      </div>
                    )}

                    <Link
                      to={`/ai-tutor?questionId=${q?._id}`}
                      className="btn btn-secondary btn-sm"
                    >
                      <Brain size={13} /> Ask AI Tutor
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={page === 1}
            className="btn btn-secondary btn-sm"
          >
            Previous
          </button>
          <span className="text-sm text-surface-400">
            Page {page} of {pagination.totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
            disabled={page === pagination.totalPages}
            className="btn btn-secondary btn-sm"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
