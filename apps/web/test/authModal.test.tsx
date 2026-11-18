// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/context/AuthContext.js";
import { AuthModal } from "../src/components/online/AuthModal.js";

// Helper to set authenticated state for testing profile tab
const AuthenticatedTestWrapper: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  user: {
    id: string;
    email: string;
    username: string;
    avatarId: string;
    usernameUpdatedAt: string;
    createdAt: string;
  };
}> = ({ isOpen, onClose, user }) => {
  const { setSession } = useAuth();

  React.useEffect(() => {
    setSession(user);
  }, [setSession, user]);

  return <AuthModal isOpen={isOpen} onClose={onClose} />;
};

describe("AuthModal Component Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Default fetch mock handles /api/auth/session returning 401 unauthenticated
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return {
          ok: false,
          status: 401,
          statusText: "Unauthorized",
          json: async () => ({ error: "UNAUTHORIZED" })
        } as Response;
      }
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: "NOT_FOUND" })
      } as Response;
    });
  });

  it("does not render when isOpen is false", () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={false} onClose={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders login tab by default when unauthenticated", () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Storybook Gate")).toBeTruthy();
    expect(screen.getByPlaceholderText(/Barnaby or scribe@example.com/i)).toBeTruthy();
    expect(screen.getByPlaceholderText("Enter your password")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Enter Storybook" })).toBeTruthy();
  });

  it("switches to create account (register) tab on click", () => {
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={vi.fn()} />
      </AuthProvider>
    );

    const registerTabBtn = screen.getByRole("button", { name: "Create Account" });
    fireEvent.click(registerTabBtn);

    expect(screen.getByPlaceholderText("scribe@example.com")).toBeTruthy();
    expect(screen.getByPlaceholderText(/3-20 characters, alphanumeric & _/i)).toBeTruthy();
    expect(screen.getByPlaceholderText(/Min 8 chars, 1 uppercase, 1 lowercase, 1 number/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create Folio Account" })).toBeTruthy();
  });

  it("submits login form and invokes API with correct credentials", async () => {
    let capturedUrl = "";
    let capturedReq: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, req) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/api/auth/login-password")) {
        capturedUrl = urlStr;
        capturedReq = req;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "u-1",
              email: "test@example.com",
              username: "Barnaby",
              avatarId: "barnaby",
              usernameUpdatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString()
            }
          })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const onClose = vi.fn();
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={onClose} />
      </AuthProvider>
    );

    const idInput = screen.getByPlaceholderText(/Barnaby or scribe@example.com/i);
    const passInput = screen.getByPlaceholderText("Enter your password");

    fireEvent.change(idInput, { target: { value: "Barnaby" } });
    fireEvent.change(passInput, { target: { value: "Password123" } });

    const submitBtn = screen.getByRole("button", { name: "Enter Storybook" });
    await act(async () => {
      fireEvent.click(submitBtn);
    });

    expect(capturedUrl).toContain("/api/auth/login-password");
    expect(JSON.parse(capturedReq?.body as string)).toEqual({
      identifier: "Barnaby",
      password: "Password123"
    });
    expect(onClose).toHaveBeenCalled();
  });

  it("renders profile view when authenticated and displays username cooldown status", async () => {
    const mockUser = {
      id: "u-auth-1",
      email: "authenticated@example.com",
      username: "Archmage",
      avatarId: "barnaby",
      // Updated yesterday -> 29 days cooldown remaining
      usernameUpdatedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString()
    };

    render(
      <AuthProvider>
        <AuthenticatedTestWrapper isOpen={true} onClose={vi.fn()} user={mockUser} />
      </AuthProvider>
    );

    expect(await screen.findByText("Player Folio Profile")).toBeTruthy();
    expect(screen.getByText("Archmage")).toBeTruthy();
    expect(screen.getByText("authenticated@example.com")).toBeTruthy();
    expect(screen.getByText(/Username changed recently/i)).toBeTruthy();
    expect(screen.getByText(/29 days/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign Out of Storybook" })).toBeTruthy();
  });

  it("allows entering Google ID Token for authentication", async () => {
    let capturedUrl = "";
    let capturedReq: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, req) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/api/auth/google")) {
        capturedUrl = urlStr;
        capturedReq = req;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "u-g",
              email: "g@example.com",
              username: "GoogleScribe",
              avatarId: "barnaby",
              usernameUpdatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString()
            }
          })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const onClose = vi.fn();
    render(
      <AuthProvider>
        <AuthModal isOpen={true} onClose={onClose} />
      </AuthProvider>
    );

    // Expand Google Token section
    const googleBtn = screen.getByRole("button", { name: /Sign In with Google/i });
    fireEvent.click(googleBtn);

    const tokenInput = screen.getByPlaceholderText("eyJhbGciOiJSUzI1NiIs...");
    fireEvent.change(tokenInput, { target: { value: "mock.google.id.token" } });

    const authGoogleBtn = screen.getByRole("button", {
      name: "Authenticate with Google ID Token"
    });
    await act(async () => {
      fireEvent.click(authGoogleBtn);
    });

    expect(capturedUrl).toContain("/api/auth/google");
    expect(JSON.parse(capturedReq?.body as string)).toEqual({
      idToken: "mock.google.id.token"
    });
    expect(onClose).toHaveBeenCalled();
  });
});
