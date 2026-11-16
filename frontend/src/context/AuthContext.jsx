/**
 * AuthContext.jsx
 * ---------------
 * React authentication context for the AI Tutor platform.
 *
 * TOKEN STORAGE — sessionStorage (per-tab isolation)
 * ---------------------------------------------------
 * Each browser tab maintains its own independent authentication session.
 * An admin logged in on Tab 1 and a student logged in on Tab 2 do NOT
 * interfere with each other because sessionStorage is tab-local.
 *
 * Behaviour on refresh:
 *   - The token survives a tab refresh (sessionStorage persists until the tab
 *     is closed, NOT until the browser is closed — different from cookies).
 *   - On mount the context reads sessionStorage optimistically, then verifies
 *     the token with the backend (/auth/me).  If the token is expired or
 *     revoked the context clears the session for that tab only.
 *
 * Logout isolation:
 *   - Logging out on one tab clears ONLY that tab's sessionStorage.
 *   - Other tabs remain authenticated with their own tokens.
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { authService } from '../services';
import { tokenStorage } from '../services/api';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);

  // Guard against concurrent / double-submit registration calls
  // (React StrictMode double-mounts, rapid form clicks, etc.)
  const registerInFlight = useRef(false);

  // ── On mount — verify this tab's token with the server ───────────────────
  useEffect(() => {
    const token = tokenStorage.get(); // sessionStorage — this tab only
    if (!token) {
      setLoading(false);
      return;
    }

    // Optimistically hydrate from sessionStorage while the network call is in
    // flight so the UI doesn't flash a loading spinner on every refresh.
    const savedUser = tokenStorage.getUser();
    if (savedUser) {
      setUser(savedUser);
    }

    // Verify the token is still valid (catches expired / server-revoked tokens)
    authService
      .getMe()
      .then((res) => {
        const userData = res.data.data.user;
        setUser(userData);
        tokenStorage.setUser(userData); // keep cache fresh
      })
      .catch(() => {
        // Token invalid — clear only this tab's session
        tokenStorage.clear();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Login ─────────────────────────────────────────────────────────────────
  const login = useCallback(async (email, password) => {
    const res = await authService.login({ email, password });
    const { token, user: userData } = res.data.data;

    // Store in sessionStorage — this tab only; other tabs unaffected
    tokenStorage.set(token);
    tokenStorage.setUser(userData);
    setUser(userData);
    return userData;
  }, []);

  // ── Register ──────────────────────────────────────────────────────────────
  const register = useCallback(async (formData) => {
    // Prevent race-conditions: double-click, StrictMode double-invoke, etc.
    if (registerInFlight.current) {
      throw new Error('Registration already in progress. Please wait.');
    }
    registerInFlight.current = true;
    try {
      const res = await authService.register(formData);
      const { token, user: userData } = res.data.data;

      tokenStorage.set(token);
      tokenStorage.setUser(userData);
      setUser(userData);
      return userData;
    } finally {
      // Always release the guard so the user can retry after an error
      registerInFlight.current = false;
    }
  }, []);

  // ── Logout — clears THIS tab only ────────────────────────────────────────
  const logout = useCallback(() => {
    tokenStorage.clear(); // sessionStorage.removeItem('token') + ('user')
    setUser(null);
  }, []);

  // ── Update cached user (profile edits, etc.) ──────────────────────────────
  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser);
    tokenStorage.setUser(updatedUser);
  }, []);

  // ── Refresh user from server ───────────────────────────────────────────────
  const refreshUser = useCallback(async () => {
    try {
      const res = await authService.getMe();
      const userData = res.data.data.user;
      setUser(userData);
      tokenStorage.setUser(userData);
      return userData;
    } catch (_) {
      logout();
    }
  }, [logout]);

  const value = {
    user,
    loading,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    login,
    register,
    logout,
    updateUser,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
