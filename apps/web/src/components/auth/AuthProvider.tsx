import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '../../services/api';
import type { User } from '@deadlock-draft/shared';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (returnTo?: string) => void;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const userData = await api.getMe();
      setUser(userData);
    } catch (error) {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback((returnTo?: string) => {
    // Default to current path so user returns to same page after login
    const path = returnTo ?? window.location.pathname;
    window.location.href = api.getSteamLoginUrl(path);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}
