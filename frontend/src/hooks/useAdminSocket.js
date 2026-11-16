/**
 * useAdminSocket.js
 * -----------------
 * React hook that establishes an authenticated Socket.IO connection for admins
 * and calls provided callbacks when admin:* events are received.
 *
 * Usage:
 *   useAdminSocket({
 *     onConnected:              ()        => { ... },
 *     onDisconnected:           ()        => { ... },
 *     onUserCreated:            (payload) => { ... },
 *     onAnalyticsUpdated:       (payload) => { ... },  // dashboard-level chart data
 *     onUserAnalyticsUpdated:   (payload) => { ... },  // per-user row { userId, analytics }
 *     onUserUpdated:            (payload) => { ... },  // status toggle etc.
 *     onReconnected:            ()        => { ... },
 *   });
 *
 * The hook:
 *  - Only connects when a token is present in sessionStorage (tab-local).
 *  - Uses refs for all callbacks so they are always current without
 *    re-creating the socket (avoids the stale-closure problem).
 *  - Cleans up all listeners and disconnects on unmount.
 *  - Calls onReconnected after a successful reconnection so the
 *    component can refetch authoritative data for any missed events.
 *  - Exposes the socket ref so callers can read socket.connected.
 *
 * Socket events (backend → admin clients only):
 *   admin:user-created          — new student registration
 *   admin:analytics-updated     — dashboard-level chart data (after session submit)
 *   admin:user-analytics-updated— single-user aggregated analytics row update
 *   admin:user-updated          — user status change (activate/deactivate)
 */

import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import { tokenStorage } from '../services/api';

const SOCKET_URL = import.meta.env.VITE_API_URL
  ? import.meta.env.VITE_API_URL.replace('/api', '')
  : 'http://localhost:5000';

export function useAdminSocket({
  onConnected,
  onDisconnected,
  onUserCreated,
  onAnalyticsUpdated,
  onUserAnalyticsUpdated,
  onUserUpdated,
  onReconnected,
} = {}) {
  const socketRef = useRef(null);

  // Store callbacks in refs so event handlers always call the latest version
  // without needing to re-register listeners on every render.
  const cbConnected              = useRef(onConnected);
  const cbDisconnected           = useRef(onDisconnected);
  const cbUserCreated            = useRef(onUserCreated);
  const cbAnalyticsUpdated       = useRef(onAnalyticsUpdated);
  const cbUserAnalyticsUpdated   = useRef(onUserAnalyticsUpdated);
  const cbUserUpdated            = useRef(onUserUpdated);
  const cbReconnected            = useRef(onReconnected);

  // Keep refs current on every render (no deps needed for the effect below)
  cbConnected.current            = onConnected;
  cbDisconnected.current         = onDisconnected;
  cbUserCreated.current          = onUserCreated;
  cbAnalyticsUpdated.current     = onAnalyticsUpdated;
  cbUserAnalyticsUpdated.current = onUserAnalyticsUpdated;
  cbUserUpdated.current          = onUserUpdated;
  cbReconnected.current          = onReconnected;

  useEffect(() => {
    const token = tokenStorage.get(); // sessionStorage — this tab's token only
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 2000,
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    // ── Stable wrapper handlers (close over refs, not props) ─────────────────
    const handleConnect              = ()        => cbConnected.current?.();
    const handleDisconnect           = ()        => cbDisconnected.current?.();
    const handleUserCreated          = (payload) => cbUserCreated.current?.(payload);
    const handleAnalytics            = (payload) => cbAnalyticsUpdated.current?.(payload);
    const handleUserAnalyticsUpdated = (payload) => cbUserAnalyticsUpdated.current?.(payload);
    const handleUserUpdated          = (payload) => cbUserUpdated.current?.(payload);
    const handleReconnect            = ()        => cbReconnected.current?.();
    const handleConnectError         = (err)     => {
      console.warn('[AdminSocket] Connection error:', err.message);
    };

    socket.on('connect',                       handleConnect);
    socket.on('disconnect',                    handleDisconnect);
    socket.on('admin:user-created',            handleUserCreated);
    socket.on('admin:analytics-updated',       handleAnalytics);
    socket.on('admin:user-analytics-updated',  handleUserAnalyticsUpdated);
    socket.on('admin:user-updated',            handleUserUpdated);
    socket.on('reconnect',                     handleReconnect);
    socket.on('connect_error',                 handleConnectError);

    // ── Cleanup ──────────────────────────────────────────────────────────────
    return () => {
      socket.off('connect',                       handleConnect);
      socket.off('disconnect',                    handleDisconnect);
      socket.off('admin:user-created',            handleUserCreated);
      socket.off('admin:analytics-updated',       handleAnalytics);
      socket.off('admin:user-analytics-updated',  handleUserAnalyticsUpdated);
      socket.off('admin:user-updated',            handleUserUpdated);
      socket.off('reconnect',                     handleReconnect);
      socket.off('connect_error',                 handleConnectError);
      socket.disconnect();
      socketRef.current = null;
    };
  }, []); // Only run once — callbacks are always current via refs

  return socketRef;
}
