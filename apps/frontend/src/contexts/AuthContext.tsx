"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";
import {
  login as apiLogin,
  register as apiRegister,
  getProfile,
  logout as apiLogout,
  type AuthUser,
} from "@/services/auth";

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => void;
  refreshProfile: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshProfile = useCallback(async () => {
    try {
      const profile = await getProfile();
      setUser(profile);
      setError(null);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    // Always attempt to restore the session from the httpOnly cookie on mount.
    // The cookie is sent automatically; if it is still valid, the user stays logged
    // in even after the app was completely closed (sessionStorage is cleared then).
    // Synchronous loading update is part of the initialization flow.
    refreshProfile().finally(() => setLoading(false));
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [refreshProfile]);

  const login = async (email: string, password: string) => {
    setError(null);
    try {
      const response = await apiLogin(email, password);
      setUser(response.user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur de connexion";
      setError(message);
      throw err;
    }
  };

  const register = async (email: string, password: string, displayName?: string) => {
    setError(null);
    try {
      const response = await apiRegister(email, password, displayName);
      setUser(response.user);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Erreur d'inscription";
      setError(message);
      throw err;
    }
  };

  const logout = () => {
    apiLogout();
    setUser(null);
    setError(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        login,
        register,
        logout,
        refreshProfile,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}