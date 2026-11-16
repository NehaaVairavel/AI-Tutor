/**
 * api.js
 * ------
 * Axios instance configured for the AI Tutor backend.
 *
 * TOKEN STORAGE — sessionStorage (per-tab isolation)
 * ---------------------------------------------------
 * Tokens are stored in sessionStorage instead of localStorage so that each
 * browser tab has an independent authentication session. This allows an admin
 * and a student to be logged in simultaneously in different tabs of the same
 * browser without their tokens interfering with each other.
 *
 *   sessionStorage  — isolated per tab; cleared when the tab is closed.
 *   localStorage    — shared across all tabs; NOT used for auth tokens.
 *
 * The backend never trusts the role supplied by the frontend.  All role checks
 * are enforced server-side via JWT decoding + database lookup in auth.js.
 */

import axios from 'axios';

// ── Token helpers (sessionStorage) ───────────────────────────────────────────
// Centralised so every part of the app reads/writes the same key in the same
// storage area.  Import these helpers wherever a raw token is needed.

export const tokenStorage = {
  /** Read the access token for this tab. */
  get:    ()          => sessionStorage.getItem('token'),
  /** Persist the access token for this tab. */
  set:    (token)     => sessionStorage.setItem('token', token),
  /** Remove the access token (logout). */
  remove: ()          => sessionStorage.removeItem('token'),

  /** Read the cached user object for this tab (JSON string → object). */
  getUser: () => {
    try {
      const raw = sessionStorage.getItem('user');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },
  /** Persist the user object for this tab. */
  setUser: (user)  => sessionStorage.setItem('user', JSON.stringify(user)),
  /** Remove the cached user. */
  removeUser: ()   => sessionStorage.removeItem('user'),

  /** Clear all auth data for this tab. */
  clear: () => {
    sessionStorage.removeItem('token');
    sessionStorage.removeItem('user');
  },
};

// ── Axios instance ────────────────────────────────────────────────────────────
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 35000, // 35s — backend AI calls can take up to 30s
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor — attach this tab's token to every outgoing request
api.interceptors.request.use(
  (config) => {
    const token = tokenStorage.get(); // sessionStorage — tab-local
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor — handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      // Only clear THIS tab's session — other tabs are unaffected
      tokenStorage.clear();
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
