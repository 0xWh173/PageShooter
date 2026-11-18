import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from "react";
import type { PublicUserProfile, AuthResponse } from "@pageshooter/shared";
import { apiClient, ApiError } from "../network/apiClient.js";

export interface AuthContextType {
  user: PublicUserProfile | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isColdStarting: boolean;
  error: string | null;
  register: (input: {
    email: string;
    username: string;
    password: string;
    avatarId?: string;
  }) => Promise<AuthResponse>;
  login: (input: { identifier: string; password: string }) => Promise<AuthResponse>;
  loginWithGoogle: (input: {
    idToken: string;
    requestedUsername?: string;
  }) => Promise<AuthResponse>;
  linkGoogle: (idToken: string) => Promise<PublicUserProfile>;
  changeUsername: (newUsername: string) => Promise<PublicUserProfile>;
  logout: () => Promise<void>;
  clearError: () => void;
  setSession: (userOrToken: unknown, maybeUser?: PublicUserProfile | null) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export interface AuthProviderProps {
  children: React.ReactNode;
  onLogoutCleanup?: () => void;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children, onLogoutCleanup }) => {
  // ZERO-TOKEN CLIENT ARCHITECTURE:
  // Access JWT is held SOLELY in an HttpOnly session cookie managed by the browser.
  // Never stored in React state, localStorage, sessionStorage, or window globals.
  const [user, setUser] = useState<PublicUserProfile | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isColdStarting, setIsColdStarting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const logout = useCallback(async () => {
    setIsLoading(true);
    try {
      await apiClient.logout();
    } catch {
      // Ignore network errors on logout to ensure client state cleans up
    } finally {
      setUser(null);
      setError(null);
      setIsLoading(false);
      if (onLogoutCleanup) {
        try {
          onLogoutCleanup();
        } catch {
          // Ignore cleanup errors
        }
      }
    }
  }, [onLogoutCleanup]);

  // Restore authenticated session from HttpOnly cookie on initial mount (F5 refresh recovery)
  useEffect(() => {
    let isMounted = true;
    const coldTimer = setTimeout(() => {
      if (isMounted) setIsColdStarting(true);
    }, 3000);

    apiClient
      .getSession()
      .then((res) => {
        if (isMounted) {
          setUser(res.user);
        }
      })
      .catch(() => {
        // No active session or unauthenticated; retain initial null state
      })
      .finally(() => {
        clearTimeout(coldTimer);
        if (isMounted) {
          setIsColdStarting(false);
          setIsLoading(false);
        }
      });
    return () => {
      isMounted = false;
      clearTimeout(coldTimer);
    };
  }, []);

  const handleAuthError = useCallback((err: unknown): string => {
    if (err instanceof ApiError) {
      if (err.statusCode === 401) {
        setUser(null);
        return "Session expired or invalid. Please log in again.";
      }
      return err.message;
    }
    return err instanceof Error ? err.message : "Authentication request failed";
  }, []);

  const register = useCallback(
    async (input: {
      email: string;
      username: string;
      password: string;
      avatarId?: string;
    }): Promise<AuthResponse> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.registerPassword(input);
        setUser(response.user);
        return response;
      } catch (err) {
        const message = handleAuthError(err);
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [handleAuthError]
  );

  const login = useCallback(
    async (input: { identifier: string; password: string }): Promise<AuthResponse> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.loginPassword(input);
        setUser(response.user);
        return response;
      } catch (err) {
        const message = handleAuthError(err);
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [handleAuthError]
  );

  const loginWithGoogle = useCallback(
    async (input: { idToken: string; requestedUsername?: string }): Promise<AuthResponse> => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.loginGoogle(input);
        setUser(response.user);
        return response;
      } catch (err) {
        const message = handleAuthError(err);
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [handleAuthError]
  );

  const linkGoogle = useCallback(
    async (idToken: string): Promise<PublicUserProfile> => {
      if (!user) {
        throw new Error("Must be logged in to link a Google account");
      }
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.linkGoogle(idToken);
        setUser(response.user);
        return response.user;
      } catch (err) {
        const message = handleAuthError(err);
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user, handleAuthError]
  );

  const changeUsername = useCallback(
    async (newUsername: string): Promise<PublicUserProfile> => {
      if (!user) {
        throw new Error("Must be logged in to change username");
      }
      setIsLoading(true);
      setError(null);
      try {
        const response = await apiClient.changeUsername(newUsername);
        setUser(response.user);
        return response.user;
      } catch (err) {
        const message = handleAuthError(err);
        setError(message);
        throw err;
      } finally {
        setIsLoading(false);
      }
    },
    [user, handleAuthError]
  );

  const setSession = useCallback((userOrToken: unknown, maybeUser?: PublicUserProfile | null) => {
    if (maybeUser !== undefined) {
      setUser(maybeUser);
    } else if (userOrToken && typeof userOrToken === "object") {
      setUser(userOrToken as PublicUserProfile);
    } else {
      setUser(null);
    }
    setError(null);
  }, []);

  const value = useMemo<AuthContextType>(
    () => ({
      user,
      isAuthenticated: Boolean(user),
      isLoading,
      isColdStarting,
      error,
      register,
      login,
      loginWithGoogle,
      linkGoogle,
      changeUsername,
      logout,
      clearError,
      setSession
    }),
    [
      user,
      isLoading,
      isColdStarting,
      error,
      register,
      login,
      loginWithGoogle,
      linkGoogle,
      changeUsername,
      logout,
      clearError,
      setSession
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
