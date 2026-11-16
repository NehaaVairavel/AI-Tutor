import { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Search, Users, ToggleLeft, ToggleRight, ChevronRight,
  ChevronUp, ChevronDown, RefreshCw, AlertCircle, ExternalLink,
} from 'lucide-react';
import { adminService } from '../../services';
import { useAdminSocket } from '../../hooks/useAdminSocket';

const EDU_LABELS = {
  school_student:       'School Student',
  undergraduate:        'Undergraduate',
  postgraduate:         'Postgraduate',
  working_professional: 'Working Professional',
  graduate_job_seeker:  'Job Seeker',
  other:                'Other',
  '':                   '—',
};

const fmtTime = (sec) => {
  if (!sec) return '—';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

function SortIcon({ field, sortBy, sortOrder }) {
  if (sortBy !== field) return <ChevronDown size={12} className="opacity-30" />;
  return sortOrder === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />;
}

export default function AdminUsers() {
  const [users, setUsers]           = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState('');
  const [pagination, setPagination] = useState(null);
  const [search, setSearch]         = useState('');
  const [page, setPage]             = useState(1);
  const [examFilter, setExamFilter] = useState('');
  const [eduFilter, setEduFilter]   = useState('');
  const [sortBy, setSortBy]         = useState('createdAt');
  const [sortOrder, setSortOrder]   = useState('desc');
  const [exams, setExams]           = useState([]);
  const [liveCount, setLiveCount]   = useState(0);

  // Debounce search
  const searchTimer = useRef(null);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  const loadUsers = useCallback(() => {
    setLoading(true);
    setError('');
    adminService.getUsers({
      page,
      limit: 20,
      search: debouncedSearch || undefined,
      role: 'student',
      examId: examFilter || undefined,
      educationStatus: eduFilter || undefined,
      sortBy,
      sortOrder,
    })
      .then(r => {
        setUsers(r.data.data.users);
        setPagination(r.data.data.pagination);
        setLiveCount(0);
      })
      .catch((err) => {
        const status = err.response?.status;
        if (status === 401) {
          setError('Session expired. Please log in again.');
        } else if (status === 403) {
          setError('Access denied. Admin privileges required.');
        } else {
          setError('Failed to load users. Please retry.');
        }
      })
      .finally(() => setLoading(false));
  }, [page, debouncedSearch, examFilter, eduFilter, sortBy, sortOrder]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  // Load exams for filter dropdown once
  useEffect(() => {
    adminService.getExamsList()
      .then(r => setExams(r.data.data.exams))
      .catch(() => {});
  }, []);

  const handleSort = (field) => {
    if (sortBy === field) {
      setSortOrder(o => o === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(field);
      setSortOrder('desc');
    }
    setPage(1);
  };

  const handleToggleStatus = async (id) => {
    try {
      await adminService.toggleUserStatus(id);
      setUsers(prev => prev.map(u =>
        u._id === id ? { ...u, isActive: !u.isActive } : u
      ));
    } catch {
      alert('Failed to update user status.');
    }
  };

  // Real-time: new user appears at top of first page
  useAdminSocket({
    onUserCreated: useCallback((payload) => {
      // Deduplication guard — socket reconnects can replay events; StrictMode
      // can call effects twice.  Never add a user that is already in the list.
      setUsers(prev => {
        const alreadyPresent = prev.some(
          u => u._id?.toString() === payload._id?.toString()
        );
        if (alreadyPresent) return prev;
        return [
          {
            ...payload,
            analytics: {
              totalQuestionsAttempted: 0,
              overallAccuracy: 0,
              currentStreak: 0,
              totalStudyTime: 0,
            },
          },
          ...prev,
        ].slice(0, 20);
      });
      setLiveCount(prev => prev + 1);
      setPagination(prev => prev ? { ...prev, total: prev.total + 1 } : prev);
    }, []),

    onUserUpdated: useCallback((payload) => {
      setUsers(prev => prev.map(u =>
        u._id.toString() === payload._id.toString()
          ? { ...u, isActive: payload.isActive }
          : u
      ));
    }, []),

    // admin:user-analytics-updated fires after every practice session submit.
    // The payload already contains the fully-aggregated analytics across all
    // exams for that user — no HTTP round-trip needed.
    onUserAnalyticsUpdated: useCallback((payload) => {
      const userId = payload.userId?.toString();
      if (!userId || !payload.analytics) return;
      setUsers(prev => prev.map(u =>
        u._id.toString() === userId
          ? { ...u, analytics: payload.analytics }
          : u
      ));
    }, []),

    onReconnected: useCallback(() => { loadUsers(); }, [loadUsers]),
  });

  const ThButton = ({ field, children }) => (
    <button
      onClick={() => handleSort(field)}
      className="flex items-center gap-1 text-left text-surface-500 font-medium hover:text-surface-700 transition-colors"
    >
      {children}
      <SortIcon field={field} sortBy={sortBy} sortOrder={sortOrder} />
    </button>
  );

  // Determine table body state
  const hasActiveFilters = debouncedSearch || examFilter || eduFilter;

  return (
    <div className="flex flex-col gap-5">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-surface-900">User Management</h1>
          <p className="text-surface-400 text-sm mt-1">
            {pagination ? `${pagination.total.toLocaleString()} students registered` : 'Manage student accounts'}
            {liveCount > 0 && <span className="text-emerald-600 font-semibold ml-2">+{liveCount} new</span>}
          </p>
        </div>
        <button onClick={loadUsers} className="btn btn-secondary btn-sm">
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={14} className="flex-shrink-0" />
          <span>{error}</span>
          <button onClick={loadUsers} className="ml-auto btn btn-secondary btn-sm">Retry</button>
        </div>
      )}

      {/* ── Filters ──────────────────────────────────────────────────────── */}
      <div className="card card-sm flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
          <input
            className="form-input pl-8 text-sm py-2"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <select
          className="form-input form-select text-sm py-2 min-w-40"
          value={examFilter}
          onChange={e => { setExamFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Exams</option>
          {exams.map(ex => <option key={ex._id} value={ex._id}>{ex.shortName} — {ex.name}</option>)}
        </select>
        <select
          className="form-input form-select text-sm py-2 min-w-44"
          value={eduFilter}
          onChange={e => { setEduFilter(e.target.value); setPage(1); }}
        >
          <option value="">All Education Status</option>
          {Object.entries(EDU_LABELS).filter(([k]) => k !== '').map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        {(search || examFilter || eduFilter) && (
          <button
            onClick={() => { setSearch(''); setExamFilter(''); setEduFilter(''); setPage(1); }}
            className="btn btn-ghost btn-sm text-surface-500"
          >
            Clear
          </button>
        )}
      </div>

      {/* ── Table ────────────────────────────────────────────────────────── */}
      <div className="card p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-surface-200 bg-surface-50">
                <th className="text-left py-3 px-4"><ThButton field="name">Student</ThButton></th>
                <th className="text-left py-3 px-4 hidden lg:table-cell"><ThButton field="educationStatus">Education</ThButton></th>
                <th className="text-left py-3 px-4 hidden md:table-cell">Target Exam</th>
                <th className="text-right py-3 px-4 hidden xl:table-cell">Questions</th>
                <th className="text-right py-3 px-4 hidden xl:table-cell">Accuracy</th>
                <th className="text-right py-3 px-4 hidden 2xl:table-cell">Study Time</th>
                <th className="text-center py-3 px-4 hidden sm:table-cell"><ThButton field="createdAt">Joined</ThButton></th>
                <th className="text-center py-3 px-4">Status</th>
                <th className="text-right py-3 px-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                [...Array(8)].map((_, i) => (
                  <tr key={i} className="border-b border-surface-200/50">
                    <td colSpan={9} className="py-3 px-4"><div className="skeleton h-4 rounded w-3/4" /></td>
                  </tr>
                ))
              ) : error ? (
                // API error — do NOT say "no students match filters"
                <tr>
                  <td colSpan={9} className="py-16 text-center text-surface-500">
                    <AlertCircle size={28} className="mx-auto mb-2 opacity-30 text-red-400" />
                    <div className="text-sm">Unable to load students. Use the Retry button above.</div>
                  </td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-16 text-center text-surface-500">
                    <Users size={28} className="mx-auto mb-2 opacity-20" />
                    <div className="text-sm">
                      {hasActiveFilters
                        ? 'No students match the current filters.'
                        : 'No students registered yet.'}
                    </div>
                  </td>
                </tr>
              ) : users.map(u => (
                <tr key={u._id} className="border-b border-surface-200/50 hover:bg-surface-50 transition-colors">
                  <td className="py-3 px-4">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-primary-100 border border-primary-200 flex items-center justify-center text-xs font-bold text-primary-700 flex-shrink-0">
                        {u.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <div className="text-surface-800 font-medium truncate max-w-[160px]">{u.name}</div>
                        <div className="text-surface-400 text-xs truncate max-w-[160px]">{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-surface-500 text-xs hidden lg:table-cell">
                    {EDU_LABELS[u.educationStatus] || '—'}
                  </td>
                  <td className="py-3 px-4 hidden md:table-cell">
                    {u.targetExam
                      ? <span className="badge badge-primary">{u.targetExam.shortName}</span>
                      : <span className="text-surface-400 text-xs">Not selected</span>}
                  </td>
                  <td className="py-3 px-4 text-right text-surface-700 tabular-nums hidden xl:table-cell">
                    {(u.analytics?.totalQuestionsAttempted || 0).toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right tabular-nums hidden xl:table-cell">
                    <span className={`font-medium ${(u.analytics?.overallAccuracy || 0) >= 70 ? 'text-emerald-600' : (u.analytics?.overallAccuracy || 0) >= 50 ? 'text-amber-600' : 'text-red-500'}`}>
                      {u.analytics?.overallAccuracy ?? 0}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right text-surface-500 text-xs hidden 2xl:table-cell">
                    {fmtTime(u.analytics?.totalStudyTime)}
                  </td>
                  <td className="py-3 px-4 text-center text-surface-400 text-xs hidden sm:table-cell">
                    {fmtDate(u.createdAt)}
                  </td>
                  <td className="py-3 px-4 text-center">
                    {u.isActive
                      ? <span className="badge badge-success">Active</span>
                      : <span className="badge badge-danger">Inactive</span>}
                  </td>
                  <td className="py-3 px-4">
                    <div className="flex justify-end items-center gap-1">
                      <Link
                        to={`/admin/users/${u._id}`}
                        className="btn btn-ghost btn-sm text-primary-600 hover:text-primary-700"
                        title="View analytics"
                      >
                        <ExternalLink size={14} />
                        <span className="hidden sm:inline">View</span>
                      </Link>
                      <button
                        onClick={() => handleToggleStatus(u._id)}
                        className={`btn btn-sm btn-ghost ${u.isActive ? 'text-red-500 hover:text-red-600 hover:bg-red-50' : 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'}`}
                        title={u.isActive ? 'Deactivate' : 'Activate'}
                      >
                        {u.isActive ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                        <span className="hidden sm:inline">{u.isActive ? 'Deactivate' : 'Activate'}</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ── Pagination ──────────────────────────────────────────────────── */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-surface-200">
            <span className="text-sm text-surface-500">
              Page {page} of {pagination.totalPages} ({pagination.total.toLocaleString()} total)
            </span>
            <div className="flex gap-2">
              <button onClick={() => setPage(1)} disabled={page === 1} className="btn btn-secondary btn-sm">First</button>
              <button onClick={() => setPage(p => p - 1)} disabled={page === 1} className="btn btn-secondary btn-sm">Prev</button>
              <button onClick={() => setPage(p => p + 1)} disabled={page === pagination.totalPages} className="btn btn-secondary btn-sm">Next</button>
              <button onClick={() => setPage(pagination.totalPages)} disabled={page === pagination.totalPages} className="btn btn-secondary btn-sm">Last</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
