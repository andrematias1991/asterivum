import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, authenticate, getSessionToken, setSessionToken } from './api';
import type { User } from './types';

type AuthContextValue = {
  user: User | null;
  restoring: boolean;
  login(email: string, password: string): Promise<void>;
  register(name: string, email: string, password: string): Promise<void>;
  logout(): Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: React.PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [restoring, setRestoring] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!await getSessionToken()) return;
      try {
        const result = await api<{ user: User }>('/me', { authenticated: true });
        if (mounted) setUser(result.user);
      } catch {
        await setSessionToken(null);
      }
    })().finally(() => mounted && setRestoring(false));
    return () => { mounted = false; };
  }, []);

  const value = useMemo<AuthContextValue>(() => ({
    user, restoring,
    login: async (email, password) => setUser(await authenticate('login', { email, password })),
    register: async (name, email, password) => setUser(await authenticate('register', { name, email, password })),
    logout: async () => {
      try { await api('/auth/logout', { method: 'POST', authenticated: true }); }
      finally { await setSessionToken(null); setUser(null); }
    },
  }), [restoring, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
