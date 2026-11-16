import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { Brain, Send, Plus, Loader2, User, Trash2, AlertCircle, RefreshCw, MessageSquare } from 'lucide-react';
import api, { tokenStorage } from '../services/api';
import { useAuth } from '../context/AuthContext';
import QuestionCard from '../components/QuestionCard';

// Detects whether the user's message is a request for a practice question/MCQ
const QUESTION_PHRASES = [
  'practice question', 'give me a question', 'mcq', 'quiz me', 'test me',
  'practice mcq', 'give me mcq', 'practice problem', 'a question on',
];
function isPracticeRequest(text) {
  if (!text) return false;
  const t = text.toLowerCase().trim();
  return QUESTION_PHRASES.some(p => t.includes(p));
}

// ─── Constants ────────────────────────────────────────────────────────────────
const ACTIVE_SESSION_KEY = 'aiTutor_activeSessionId';
const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

// ─── Markdown renderer for AI messages ───────────────────────────────────────
function MarkdownContent({ content }) {
  return (
    <ReactMarkdown
      components={{
        // Headings
        h1: ({ children }) => <h1 className="text-base font-bold text-surface-800 mt-3 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-bold text-surface-800 mt-3 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-semibold text-surface-700 mt-2 mb-1">{children}</h3>,
        // Paragraphs
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        // Lists
        ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        // Inline formatting
        strong: ({ children }) => <strong className="font-semibold text-surface-800">{children}</strong>,
        em: ({ children }) => <em className="italic">{children}</em>,
        // Code
        code: ({ inline, className, children }) => {
          const lang = /language-(\w+)/.exec(className || '')?.[1];
          if (inline) {
            return (
              <code className="bg-surface-100 text-violet-700 rounded px-1 py-0.5 text-xs font-mono">
                {children}
              </code>
            );
          }
          return (
            <div className="mt-2 mb-2 rounded-lg overflow-hidden border border-surface-200">
              {lang && (
                <div className="bg-surface-100 px-3 py-1 text-xs text-surface-500 font-mono border-b border-surface-200">
                  {lang}
                </div>
              )}
              <pre className="bg-surface-50 p-3 overflow-x-auto">
                <code className="text-xs font-mono text-surface-700 whitespace-pre">{children}</code>
              </pre>
            </div>
          );
        },
        // Tables
        table: ({ children }) => (
          <div className="overflow-x-auto my-2">
            <table className="text-xs border-collapse w-full">{children}</table>
          </div>
        ),
        thead: ({ children }) => <thead className="bg-surface-100">{children}</thead>,
        th: ({ children }) => <th className="border border-surface-200 px-2 py-1 text-left font-semibold text-surface-700">{children}</th>,
        td: ({ children }) => <td className="border border-surface-200 px-2 py-1 text-surface-600">{children}</td>,
        // Divider
        hr: () => <hr className="border-surface-200 my-3" />,
        // Blockquote
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary-300 pl-3 my-2 text-surface-600 italic">
            {children}
          </blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─── MessageBubble ────────────────────────────────────────────────────────────
function MessageBubble({ message, isStreaming, onContinue }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5
        ${isUser ? 'bg-primary-100 border border-primary-300' : 'bg-violet-100 border border-violet-300'}`}>
        {isUser
          ? <User size={13} className="text-primary-600" />
          : <Brain size={13} className="text-violet-600" />}
      </div>
      <div className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
        isUser
          ? 'bg-primary-50 border border-primary-200 text-surface-800 rounded-tr-sm'
          : 'bg-white border border-surface-200 text-surface-700 rounded-tl-sm shadow-sm'
      }`}>
        {isUser ? (
          <div className="whitespace-pre-wrap">{message.content}</div>
        ) : (
          <div className="prose-sm max-w-none">
            <MarkdownContent content={message.content || ''} />
            {isStreaming && (
              <span className="inline-block w-1 h-3.5 bg-violet-400 animate-pulse ml-0.5 rounded-sm align-middle" />
            )}
            {!isStreaming && message.truncated && (
              <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertCircle size={12} className="mt-0.5 flex-shrink-0" />
                <span className="flex-1">Response was cut off. The answer may be incomplete.</span>
                {onContinue && (
                  <button onClick={onContinue} className="font-medium underline hover:text-amber-900 whitespace-nowrap">
                    Continue →
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <div className="text-xs text-surface-400 mt-1.5">
          {new Date(message.createdAt || Date.now()).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  );
}

// ─── ErrorBubble ──────────────────────────────────────────────────────────────
function ErrorBubble({ message, onRetry }) {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 bg-red-100 border border-red-300">
        <AlertCircle size={13} className="text-red-500" />
      </div>
      <div className="max-w-[85%] rounded-xl px-4 py-3 text-sm bg-red-50 border border-red-200 text-red-700 rounded-tl-sm">
        <div>{message}</div>
        {onRetry && (
          <button onClick={onRetry} className="mt-2 flex items-center gap-1.5 text-xs text-red-600 hover:text-red-800 font-medium">
            <RefreshCw size={11} /> Retry
          </button>
        )}
      </div>
    </div>
  );
}

const QUICK_PROMPTS = [
  'Explain this concept from basics',
  'Give me a practice question',
  'What is the formula?',
  'Give me an easier example',
  'Why was my answer wrong?',
  'Summarize this topic',
];

// Extract topic hint from practice-question prompt (e.g. "question on percentages" → "percentages")
function extractTopic(text) {
  const m = text.match(/(?:on|about|for|regarding)\s+([\w\s&]+)/i);
  return m ? m[1].trim().slice(0, 60) : '';
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AiTutor() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const [sessions, setSessions]               = useState([]);
  const [activeSession, setActiveSession]     = useState(null);
  const [messages, setMessages]               = useState([]);
  const [input, setInput]                     = useState('');
  const [loading, setLoading]                 = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError]     = useState('');
  const [sessionLoading, setSessionLoading]   = useState(false);
  const [error, setError]                     = useState('');
  const [creatingSession, setCreatingSession] = useState(false);
  const [lastFailedContent, setLastFailedContent] = useState(null);
  const [streamingMsgIndex, setStreamingMsgIndex] = useState(null);

  const messagesEndRef  = useRef(null);
  const textareaRef     = useRef(null);
  const loadedSessionId = useRef(null);
  const abortRef        = useRef(null); // cancel in-flight SSE

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);
  useEffect(scrollToBottom, [messages, scrollToBottom]);

  // ── Load session list ──────────────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    setSessionsLoading(true);
    setSessionsError('');
    try {
      const r = await api.get('/tutor/sessions');
      const list = r.data.data.sessions || [];
      setSessions(list);
      return list;
    } catch (err) {
      const msg = err.response?.status === 401
        ? 'Please log in to access AI Tutor.'
        : 'Could not load chat sessions. Check your connection.';
      setSessionsError(msg);
      return [];
    } finally {
      setSessionsLoading(false);
    }
  }, []);

  // ── Load one session's messages ────────────────────────────────────────────
  const loadSessionMessages = useCallback(async (session) => {
    if (loadedSessionId.current === session._id) return;
    loadedSessionId.current = session._id;
    setSessionLoading(true);
    setError('');
    setActiveSession(session);
    setMessages([]);
    try {
      const res = await api.get(`/tutor/sessions/${session._id}`);
      const full = res.data.data?.session;
      if (full) {
        setActiveSession(full);
        setMessages(full.messages || []);
      }
    } catch (err) {
      const status = err.response?.status;
      if (status === 404) {
        setSessions(prev => prev.filter(s => s._id !== session._id));
        localStorage.removeItem(ACTIVE_SESSION_KEY);
        setActiveSession(null);
        setMessages([]);
        loadedSessionId.current = null;
      } else {
        setError('Failed to load conversation history. Please try again.');
      }
    } finally {
      setSessionLoading(false);
    }
  }, []);

  // ── On mount: load sessions + restore active session ──────────────────────
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      const list = await loadSessions();
      if (cancelled) return;
      const savedId = localStorage.getItem(ACTIVE_SESSION_KEY);
      if (savedId && list.length > 0) {
        const match = list.find(s => s._id === savedId);
        if (match) await loadSessionMessages(match);
        else localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    };
    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Handle questionId deep-link from Practice ──────────────────────────────
  useEffect(() => {
    const questionId = searchParams.get('questionId');
    if (questionId && !activeSession) {
      handleNewSession(null, questionId);
      setTimeout(() => setInput('Explain why I got this question wrong and what concept should I revise?'), 500);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Create a new session ───────────────────────────────────────────────────
  const handleNewSession = async (initialPrompt = null, questionId = null) => {
    if (creatingSession) return;
    // Cancel any in-flight stream
    abortRef.current?.abort();
    setCreatingSession(true);
    setError('');
    try {
      const context = {
        exam:       user?.targetExam?._id || user?.targetExam || null,
        questionId: questionId || null,
      };
      const res = await api.post('/tutor/sessions', { context });
      const session = res.data.data?.session;
      if (session) {
        loadedSessionId.current = session._id;
        setActiveSession(session);
        setMessages([]);
        setStreamingMsgIndex(null);
        setSessions(prev => [session, ...prev]);
        localStorage.setItem(ACTIVE_SESSION_KEY, session._id);
        setTimeout(() => textareaRef.current?.focus(), 100);
        if (initialPrompt) setTimeout(() => sendMessage(session._id, initialPrompt), 150);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create a new chat session. Please try again.');
    } finally {
      setCreatingSession(false);
    }
  };

  // ── Select existing session ────────────────────────────────────────────────
  const handleSelectSession = (session) => {
    if (activeSession?._id === session._id) return;
    abortRef.current?.abort();
    setStreamingMsgIndex(null);
    setLoading(false);
    localStorage.setItem(ACTIVE_SESSION_KEY, session._id);
    loadedSessionId.current = null;
    loadSessionMessages(session);
  };

  // ── Delete a session ───────────────────────────────────────────────────────
  const handleDeleteSession = async (e, sessionId) => {
    e.stopPropagation();
    try {
      await api.delete(`/tutor/sessions/${sessionId}`);
      setSessions(prev => prev.filter(s => s._id !== sessionId));
      if (activeSession?._id === sessionId) {
        abortRef.current?.abort();
        setActiveSession(null);
        setMessages([]);
        setStreamingMsgIndex(null);
        loadedSessionId.current = null;
        localStorage.removeItem(ACTIVE_SESSION_KEY);
      }
    } catch { /* silent */ }
  };

  // ── Core streaming send logic ──────────────────────────────────────────────
  const sendMessage = useCallback(async (sessionId, content) => {
    const trimmed = (content || '').trim();
    if (!trimmed || loading) return;

    // Cancel previous in-flight request
    abortRef.current?.abort();
    const aborter = new AbortController();
    abortRef.current = aborter;

    const userMsg = { role: 'user', content: trimmed, createdAt: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setLastFailedContent(null);
    setError('');

    // Optimistically add an empty assistant message for streaming into
    const aiMsgPlaceholder = { role: 'assistant', content: '', createdAt: new Date() };
    setMessages(prev => {
      setStreamingMsgIndex(prev.length);
      return [...prev, aiMsgPlaceholder];
    });

    const token = tokenStorage.get(); // sessionStorage — this tab's token only

    try {
      const resp = await fetch(`${API_BASE}/tutor/sessions/${sessionId}/message`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'Accept': 'text/event-stream',
        },
        body: JSON.stringify({ content: trimmed }),
        signal: aborter.signal,
      });

      // ── Non-streaming fallback (demo mode or non-Gemini) ──────────────────
      if (resp.headers.get('content-type')?.includes('application/json')) {
        const json = await resp.json();
        if (!resp.ok) {
          throw new Error(json.message || 'AI service error. Please try again.');
        }
        const aiMsg = json.data?.message;
        const newTitle = json.data?.sessionTitle;
        setMessages(prev => {
          const copy = [...prev];
          const idx = copy.findLastIndex(m => m.role === 'assistant');
          if (idx >= 0 && aiMsg) copy[idx] = { ...aiMsg, createdAt: aiMsg.createdAt || new Date() };
          return copy;
        });
        if (newTitle) {
          setSessions(prev => prev.map(s => s._id === sessionId ? { ...s, title: newTitle } : s));
          setActiveSession(prev => prev ? { ...prev, title: newTitle } : prev);
        }
        setStreamingMsgIndex(null);
        setLoading(false);
        return;
      }

      // ── SSE streaming path ────────────────────────────────────────────────
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
          if (line.startsWith('event: ')) continue; // handled via next data line
          if (!line.startsWith('data: ')) continue;
          const jsonStr = line.slice(6).trim();
          if (!jsonStr) continue;

          let evt;
          try { evt = JSON.parse(jsonStr); } catch { continue; }

          // Figure out event type from adjacent event: line (already consumed)
          // We identify by shape: chunk has .text, done has .message, error has .message string
          if (evt.text !== undefined) {
            // chunk event
            setMessages(prev => {
              const copy = [...prev];
              const idx = copy.findLastIndex(m => m.role === 'assistant');
              if (idx >= 0) copy[idx] = { ...copy[idx], content: (copy[idx].content || '') + evt.text };
              return copy;
            });
          } else if (evt.message?.role === 'assistant') {
            // done event — replace placeholder with persisted message
            const newTitle = evt.sessionTitle;
            const truncated = evt.finishReason === 'MAX_TOKENS';
            setMessages(prev => {
              const copy = [...prev];
              const idx = copy.findLastIndex(m => m.role === 'assistant');
              if (idx >= 0) copy[idx] = { ...evt.message, createdAt: evt.message.createdAt || new Date(), truncated };
              return copy;
            });
            if (newTitle) {
              setSessions(p => p.map(s => s._id === sessionId ? { ...s, title: newTitle } : s));
              setActiveSession(p => p ? { ...p, title: newTitle } : p);
            }
          } else if (evt.message && typeof evt.message === 'string') {
            // error event
            throw new Error(evt.message);
          }
        }
      }

      setStreamingMsgIndex(null);
      setLoading(false);
    } catch (err) {
      if (err.name === 'AbortError') {
        // User navigated away or cancelled — clean up silently
        setStreamingMsgIndex(null);
        setLoading(false);
        return;
      }
      const status = err.response?.status;
      let errMessage = err.message || 'Failed to get AI response. Please try again.';
      if (status === 401) errMessage = 'Your session expired. Please log in again.';
      if (status === 429) errMessage = 'Too many requests. Please wait a moment and try again.';

      setLastFailedContent(trimmed);
      // Replace the streaming placeholder with an error bubble
      setMessages(prev => {
        const copy = prev.filter(m => !(m.role === 'assistant' && m.content === '' && !m._id));
        return [...copy, { role: '__error__', content: errMessage, createdAt: new Date() }];
      });
      setStreamingMsgIndex(null);
      setLoading(false);
    }
  }, [loading]);

  const handleSend = () => {
    if (!activeSession || loading || !input.trim()) return;
    const trimmed = input.trim();
    if (isPracticeRequest(trimmed)) {
      handleGenerateQuestion(activeSession._id, extractTopic(trimmed));
    } else {
      sendMessage(activeSession._id, trimmed);
    }
  };

  // ── Generate a structured practice question ────────────────────────────────
  const handleGenerateQuestion = useCallback(async (sessionId, topic = '') => {
    if (loading) return;
    setLoading(true);
    setError('');
    setInput('');
    // Show a placeholder user message immediately
    setMessages(prev => [
      ...prev,
      { role: 'user', content: topic ? `Give me a practice question on ${topic}` : 'Give me a practice question', createdAt: new Date() },
    ]);
    try {
      const res = await api.post(`/tutor/sessions/${sessionId}/question`, topic ? { topic } : {});
      const { message: qMsg, sessionTitle } = res.data.data;
      setMessages(prev => {
        // Replace the last user message (placeholder) + add the question message
        const withoutLastUser = prev.slice(0, -1); // remove optimistic user msg
        // Push back the persisted user msg (same content) and question message
        return [
          ...withoutLastUser,
          { role: 'user', content: qMsg.content.split('\n')[0] || 'Give me a practice question', createdAt: new Date() },
          qMsg, // contains .question field with public question data
        ];
      });
      if (sessionTitle) {
        setSessions(p => p.map(s => s._id === sessionId ? { ...s, title: sessionTitle } : s));
        setActiveSession(p => p ? { ...p, title: sessionTitle } : p);
      }
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to generate a practice question. Please try again.';
      setMessages(prev => [
        ...prev.filter(m => !(m.role === 'user' && !m._id)),
        { role: '__error__', content: msg, createdAt: new Date() },
      ]);
    } finally {
      setLoading(false);
    }
  }, [loading]);

  const handleQuickPrompt = async (prompt) => {
    if (loading) return;
    if (isPracticeRequest(prompt)) {
      if (activeSession) await handleGenerateQuestion(activeSession._id, extractTopic(prompt));
      else await handleNewSession(null, null, () => handleGenerateQuestion(activeSession?._id, extractTopic(prompt)));
    } else {
      if (activeSession) sendMessage(activeSession._id, prompt);
      else await handleNewSession(prompt);
    }
  };

  const handleRetry = () => {
    if (!lastFailedContent || !activeSession) return;
    setMessages(prev => prev.filter(m => m.role !== '__error__'));
    sendMessage(activeSession._id, lastFailedContent);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-120px)] gap-4">
      {/* ─── Session sidebar ───────────────────────────────────────────────── */}
      <div className="w-56 flex-shrink-0 flex flex-col gap-2 hidden md:flex">
        <button
          id="ai-tutor-new-chat-btn"
          onClick={() => handleNewSession()}
          disabled={creatingSession}
          className="btn btn-primary btn-sm w-full"
        >
          {creatingSession ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          New Chat
        </button>
        <div className="card card-sm flex-1 overflow-y-auto">
          <div className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-2">Sessions</div>
          {sessionsLoading ? (
            <div className="flex flex-col gap-2">
              {[...Array(3)].map((_, i) => <div key={i} className="skeleton h-8 rounded-lg" />)}
            </div>
          ) : sessionsError ? (
            <div className="text-xs text-red-500 flex flex-col gap-2">
              <AlertCircle size={13} />
              <span>{sessionsError}</span>
              <button onClick={loadSessions} className="text-primary-600 underline text-xs">Retry</button>
            </div>
          ) : sessions.length === 0 ? (
            <p className="text-surface-400 text-xs">No sessions yet. Start a new chat!</p>
          ) : (
            sessions.map(s => (
              <div key={s._id} className="group relative">
                <button
                  onClick={() => handleSelectSession(s)}
                  className={`w-full text-left px-2 py-2 rounded-lg text-xs transition-colors pr-7
                    ${activeSession?._id === s._id
                      ? 'bg-primary-50 text-primary-700 border border-primary-200'
                      : 'text-surface-500 hover:bg-surface-100 hover:text-surface-700'}`}
                >
                  <Brain size={11} className="inline mr-1.5 opacity-60" />
                  <span className="truncate">{s.title || 'Chat'}</span>
                </button>
                <button
                  onClick={(e) => handleDeleteSession(e, s._id)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 rounded text-surface-400 hover:text-red-500 transition-all"
                  title="Delete session"
                >
                  <Trash2 size={10} />
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ─── Main chat area ────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col gap-3 min-w-0">
        {error && (
          <div className="alert alert-error text-sm">
            <AlertCircle size={14} />
            <span>{error}</span>
            <button onClick={() => setError('')} className="ml-auto text-xs underline">Dismiss</button>
          </div>
        )}

        {!activeSession ? (
          /* ── Empty state ─────────────────────────────────────────────────── */
          <div className="flex-1 card flex flex-col items-center justify-center gap-5">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 border border-violet-200 flex items-center justify-center">
              <Brain size={32} className="text-violet-600" />
            </div>
            <div className="text-center">
              <h2 className="text-surface-800 font-bold text-xl mb-2">AI Tutor</h2>
              <p className="text-surface-400 text-sm max-w-xs">
                Your personalized exam preparation assistant. Ask me anything about your syllabus.
              </p>
            </div>
            <button
              id="ai-tutor-start-btn"
              onClick={() => handleNewSession()}
              disabled={creatingSession}
              className="btn btn-primary"
            >
              {creatingSession ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
              {creatingSession ? 'Creating…' : 'Start New Chat'}
            </button>
            <div className="flex flex-wrap justify-center gap-2 max-w-md">
              {QUICK_PROMPTS.map(p => (
                <button
                  key={p}
                  onClick={() => handleQuickPrompt(p)}
                  disabled={creatingSession}
                  className="px-3 py-1.5 rounded-full border border-surface-200 text-xs text-surface-500 hover:border-primary-400 hover:text-primary-600 transition-colors disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* ── Chat header ───────────────────────────────────────────────── */}
            <div className="card card-sm flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-violet-100 border border-violet-200 flex items-center justify-center">
                <Brain size={15} className="text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-surface-700 truncate">
                  {activeSession.title || 'AI Tutor'}
                </div>
                <div className="text-xs text-surface-500">
                  {user?.targetExam?.shortName || user?.targetExam?.name
                    ? `Tutor for ${user.targetExam.shortName || user.targetExam.name}`
                    : 'Personalized exam tutor'}
                  {loading && <span className="ml-2 text-violet-500 animate-pulse">· Thinking…</span>}
                </div>
              </div>
              <button
                onClick={() => handleNewSession()}
                disabled={creatingSession}
                className="btn btn-ghost btn-sm"
              >
                {creatingSession ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                New
              </button>
            </div>

            {/* ── Messages ───────────────────────────────────────────────────── */}
            <div className="flex-1 card overflow-y-auto flex flex-col gap-4 min-h-0">
              {sessionLoading ? (
                <div className="flex items-center justify-center py-12 gap-2">
                  <Loader2 size={20} className="animate-spin text-surface-400" />
                  <span className="text-surface-400 text-sm">Loading conversation…</span>
                </div>
              ) : messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
                  <MessageSquare size={28} className="text-surface-300" />
                  <div>
                    <p className="text-surface-500 text-sm font-medium">Chat started</p>
                    <p className="text-surface-400 text-xs mt-0.5">Send a message or pick a suggested topic below.</p>
                  </div>
                </div>
              ) : (
                messages.map((msg, i) =>
                  msg.role === '__error__' ? (
                    <ErrorBubble
                      key={`err-${i}`}
                      message={msg.content}
                      onRetry={i === messages.length - 1 ? handleRetry : null}
                    />
                  ) : msg.role === 'assistant' && msg.question ? (
                    /* ── Structured MCQ question ─────────────────────────── */
                    <QuestionCard
                      key={msg._id || `q-${i}`}
                      message={msg}
                      sessionId={activeSession._id}
                    />
                  ) : (
                    <MessageBubble
                      key={msg._id || `msg-${i}`}
                      message={msg}
                      isStreaming={i === streamingMsgIndex && loading}
                      onContinue={
                        msg.truncated && i === messages.length - 1 && !loading
                          ? () => sendMessage(activeSession._id, 'Please continue from where you left off.')
                          : null
                      }
                    />
                  )
                )
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Quick prompts ─────────────────────────────────────────────── */}
            <div className="flex gap-2 overflow-x-auto pb-1">
              {QUICK_PROMPTS.slice(0, 4).map(p => (
                <button
                  key={p}
                  onClick={() => sendMessage(activeSession._id, p)}
                  disabled={loading}
                  className="px-3 py-1.5 rounded-full border border-surface-200 text-xs text-surface-500 hover:border-primary-400 hover:text-primary-600 transition-colors whitespace-nowrap flex-shrink-0 disabled:opacity-50"
                >
                  {p}
                </button>
              ))}
            </div>

            {/* ── Input ─────────────────────────────────────────────────────── */}
            <div className="flex gap-2">
              <textarea
                ref={textareaRef}
                id="ai-tutor-input"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything… (Enter to send, Shift+Enter for newline)"
                rows={2}
                maxLength={4000}
                className="form-input resize-none flex-1 text-sm"
                disabled={loading}
              />
              <button
                id="ai-tutor-send-btn"
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="btn btn-primary px-4 self-end"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
