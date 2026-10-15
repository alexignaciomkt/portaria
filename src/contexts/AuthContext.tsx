import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export interface PortariaUser {
  id: string;
  email?: string;
  name?: string;
  avatarUrl?: string;
  role?: string;
}

export interface AuthContextType {
  session: any | null;
  user: PortariaUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  logout: () => Promise<void>;
  refreshSession: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<any | null>(null);
  const [user, setUser] = useState<PortariaUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email,
          avatarUrl: session.user.user_metadata?.avatar_url,
          role: session.user.role,
        });
        if (session.access_token) {
          localStorage.setItem('A2Tickets_token', session.access_token);
        }
      } else {
        setUser(null);
      }
      setLoading(false);
    }).catch(() => {
      setLoading(false);
    });

    // 2. Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email,
          name: session.user.user_metadata?.full_name || session.user.email,
          avatarUrl: session.user.user_metadata?.avatar_url,
          role: session.user.role,
        });
        if (session.access_token) {
          localStorage.setItem('A2Tickets_token', session.access_token);
        }
      } else {
        setUser(null);
        localStorage.removeItem('A2Tickets_token');
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const logout = async () => {
    localStorage.removeItem('A2Tickets_token');
    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
  };

  const refreshSession = async () => {
    const { data: { session } } = await supabase.auth.refreshSession();
    setSession(session);
    if (session?.access_token) {
      localStorage.setItem('A2Tickets_token', session.access_token);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        loading,
        isAuthenticated: !!session?.user,
        logout,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
