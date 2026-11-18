// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/context/AuthContext.js";

// Test Consumer Component
const TestAuthConsumer: React.FC = () => {
  const {
    user,
    isAuthenticated,
    isLoading,
    error,
    login,
    register,
    loginWithGoogle,
    linkGoogle,
    changeUsername,
    logout
  } = useAuth();

  return (
    <div>
      <div data-testid="is-auth">{isAuthenticated ? "YES" : "NO"}</div>
      <div data-testid="username">{user?.username || "NONE"}</div>
      <div data-testid="loading">{isLoading ? "LOADING" : "IDLE"}</div>
      <div data-testid="error">{error || "NONE"}</div>

      <button
        onClick={() =>
          login({ identifier: "barnaby", password: "Password123" }).catch(() => {})
        }
      >
        Trigger Login
      </button>

      <button
        onClick={() =>
          register({
            email: "clover@example.com",
            username: "clover",
            password: "Password123"
          }).catch(() => {})
        }
      >
        Trigger Register
      </button>

      <button
        onClick={() =>
          loginWithGoogle({ idToken: "valid-google-token" }).catch(() => {})
        }
      >
        Trigger Google Login
      </button>

      <button
        onClick={() => linkGoogle("valid-link-token").catch(() => {})}
      >
        Trigger Link Google
      </button>

      <button
        onClick={() => changeUsername("barnaby_new").catch(() => {})}
      >
        Trigger Change Username
      </button>

      <button onClick={() => logout()}>Trigger Logout</button>
    </div>
  );
};

describe("AuthContext & Zero-Token Session Security Tests (Milestone 1.1)", () => {
  let sessionUser: any = null;

  beforeEach(() => {
    vi.restoreAllMocks();
    sessionUser = null;
    localStorage.clear();
    sessionStorage.clear();

    // Default fetch mock handles /api/auth/session safely
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        if (sessionUser) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ user: sessionUser })
          } as Response;
        }
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({ error: "UNAUTHORIZED", message: "No active session" })
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "NOT_FOUND" })
      } as Response;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes in unauthenticated state when no session cookie exists", async () => {
    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("NO");
    expect(screen.getByTestId("username").textContent).toBe("NONE");
    expect(screen.getByTestId("error").textContent).toBe("NONE");
  });

  it("restores user session automatically from HttpOnly session cookie on mount (F5 Refresh)", async () => {
    sessionUser = {
      id: "u-recovered-123",
      email: "recovered@example.com",
      username: "RecoveredScribe",
      avatarId: "barnaby",
      usernameUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("is-auth").textContent).toBe("YES");
    });

    expect(screen.getByTestId("username").textContent).toBe("RecoveredScribe");
  });

  it("successfully registers user without exposing token in response or client memory", async () => {
    const mockUser = {
      id: "u-123",
      email: "clover@example.com",
      username: "clover",
      avatarId: "barnaby",
      usernameUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({ error: "UNAUTHORIZED" })
        } as Response;
      }
      if (urlStr.includes("/api/auth/register-password")) {
        // Zero-token response: server sets Set-Cookie and returns only { user }
        return {
          ok: true,
          status: 201,
          json: async () => ({ user: mockUser })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Register"));
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("YES");
    expect(screen.getByTestId("username").textContent).toBe("clover");

    // MANDATORY ZERO-TOKEN SECURITY INVARIANT:
    // JWT must NEVER be present in localStorage or sessionStorage
    expect(localStorage.getItem("token")).toBeNull();
    expect(sessionStorage.getItem("token")).toBeNull();
    expect(localStorage.getItem("jwt")).toBeNull();
    expect(sessionStorage.getItem("jwt")).toBeNull();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it("successfully logs in user via password and attaches credentials", async () => {
    const mockUser = {
      id: "u-456",
      email: "barnaby@example.com",
      username: "barnaby",
      avatarId: "barnaby",
      usernameUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    let capturedInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/api/auth/login-password")) {
        capturedInit = init;
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: mockUser })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Login"));
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("YES");
    expect(screen.getByTestId("username").textContent).toBe("barnaby");

    // Enforces credentials: "include" and X-PageShooter-Client on mutating requests
    expect(capturedInit?.credentials).toBe("include");
    const headers = capturedInit?.headers as Record<string, string>;
    expect(headers["X-PageShooter-Client"]).toBe("web");
  });

  it("handles invalid credentials without setting session", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      return {
        ok: false,
        status: 401,
        statusText: "Unauthorized",
        json: async () => ({ error: "INVALID_CREDENTIALS", message: "Invalid username or password" })
      } as Response;
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Login"));
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("NO");
    expect(screen.getByTestId("error").textContent).toBe("Session expired or invalid. Please log in again.");
  });

  it("successfully logs in with Google ID token", async () => {
    const mockUser = {
      id: "u-google-789",
      email: "googleuser@example.com",
      username: "google_scribe",
      avatarId: "barnaby",
      usernameUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/api/auth/google")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: mockUser })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Google Login"));
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("YES");
    expect(screen.getByTestId("username").textContent).toBe("google_scribe");
  });

  it("handles Google authentication failure gracefully", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      return {
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: "INVALID_GOOGLE_TOKEN", message: "Invalid or expired Google token" })
      } as Response;
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Google Login"));
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("NO");
    expect(screen.getByTestId("error").textContent).toBe("Invalid or expired Google token");
  });

  it("logout issues POST /api/auth/logout, clears session, and executes onLogoutCleanup", async () => {
    const cleanupSpy = vi.fn();
    const mockUser = {
      id: "u-123",
      email: "clover@example.com",
      username: "clover",
      avatarId: "barnaby",
      usernameUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    let logoutCalled = false;
    let logoutInit: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, init) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/api/auth/login-password")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: mockUser })
        } as Response;
      }
      if (urlStr.includes("/api/auth/logout")) {
        logoutCalled = true;
        logoutInit = init;
        return {
          ok: true,
          status: 200,
          json: async () => ({ success: true })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(
      <AuthProvider onLogoutCleanup={cleanupSpy}>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Login"));
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("YES");

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Logout"));
    });

    expect(logoutCalled).toBe(true);
    expect(logoutInit?.credentials).toBe("include");
    const headers = logoutInit?.headers as Record<string, string>;
    expect(headers["X-PageShooter-Client"]).toBe("web");

    expect(screen.getByTestId("is-auth").textContent).toBe("NO");
    expect(screen.getByTestId("username").textContent).toBe("NONE");
    expect(cleanupSpy).toHaveBeenCalledTimes(1);
  });

  it("clears session automatically when an authenticated request returns 401 (JWT Expiration)", async () => {
    const mockUser = {
      id: "u-123",
      email: "clover@example.com",
      username: "clover",
      avatarId: "barnaby",
      usernameUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/api/auth/login-password")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ user: mockUser })
        } as Response;
      }
      if (urlStr.includes("/api/users/me/username")) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({ error: "EXPIRED_TOKEN", message: "Token has expired" })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    render(
      <AuthProvider>
        <TestAuthConsumer />
      </AuthProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading").textContent).toBe("IDLE");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Login"));
    });
    expect(screen.getByTestId("is-auth").textContent).toBe("YES");

    await act(async () => {
      fireEvent.click(screen.getByText("Trigger Change Username"));
    });

    expect(screen.getByTestId("is-auth").textContent).toBe("NO");
    expect(screen.getByTestId("username").textContent).toBe("NONE");
    expect(screen.getByTestId("error").textContent).toBe(
      "Session expired or invalid. Please log in again."
    );
  });
});
