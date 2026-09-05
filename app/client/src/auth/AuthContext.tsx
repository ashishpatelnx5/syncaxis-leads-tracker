import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchSession, login as apiLogin, logout as apiLogout } from '../api';

interface AuthContextValue {
  authenticated: boolean;
  checking: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [authenticated, setAuthenticated] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchSession()
      .then(() => setAuthenticated(true))
      .catch(() => setAuthenticated(false))
      .finally(() => setChecking(false));
  }, []);

  async function login(username: string, password: string) {
    await apiLogin(username, password);
    setAuthenticated(true);
  }

  async function logout() {
    await apiLogout().catch(() => {});
    setAuthenticated(false);
  }

  return <AuthContext.Provider value={{ authenticated, checking, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
