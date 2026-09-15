import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { fetchSession, login as apiLogin, logout as apiLogout, ssoLogin as apiSsoLogin } from '../api';
import type { SessionUser } from '../api';

interface AuthContextValue {
  authenticated: boolean;
  checking: boolean;
  user: SessionUser | null;
  login: (username: string, password: string) => Promise<void>;
  loginWithCode: (code: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    fetchSession()
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setChecking(false));
  }, []);

  async function login(username: string, password: string) {
    const sessionUser = await apiLogin(username, password);
    setUser(sessionUser);
  }

  async function loginWithCode(code: string) {
    const sessionUser = await apiSsoLogin(code);
    setUser(sessionUser);
  }

  async function logout() {
    await apiLogout().catch(() => {});
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ authenticated: !!user, checking, user, login, loginWithCode, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
