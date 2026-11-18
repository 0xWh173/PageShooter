// @vitest-environment happy-dom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { AuthProvider, useAuth } from "../src/context/AuthContext.js";
import { MultiplayerLobbyScreen } from "../src/components/online/MultiplayerLobbyScreen.js";
import type { PublicRoomState } from "@pageshooter/shared";

const AuthenticatedLobbyWrapper: React.FC<{
  onRoomCreated: (room: PublicRoomState) => void;
  onJoinRoom: (room: PublicRoomState, role: "PLAYER" | "SPECTATOR") => void;
  onOpenAuth: () => void;
}> = (props) => {
  const { setSession } = useAuth();

  React.useEffect(() => {
    setSession({
      id: "u-lobby-host",
      email: "host@example.com",
      username: "GrandMagus",
      avatarId: "barnaby",
      usernameUpdatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    });
  }, [setSession]);

  return <MultiplayerLobbyScreen {...props} />;
};

describe("MultiplayerLobbyScreen Component Tests (Milestone 1.1)", () => {
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

  it("enables room creation and room code input immediately without requiring login", async () => {
    const mockRoom: PublicRoomState = {
      roomId: "room-guest-123",
      roomCode: "GST234",
      hostUserId: "u-guest-1",
      phase: "WAITING",
      players: [
        {
          userId: "u-guest-1",
          username: "CustomScribe",
          avatarId: "barnaby",
          role: "HOST",
          connected: true,
          socketId: null,
          joinSequence: 1,
          joinedAt: Date.now()
        }
      ],
      spectators: [],
      playerCount: 1,
      spectatorCount: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000
    };

    let guestCreated = false;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, req) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({ error: "UNAUTHORIZED" }) } as Response;
      }
      if (urlStr.includes("/api/auth/guest") && req?.method === "POST") {
        guestCreated = true;
        return {
          ok: true,
          status: 200,
          json: async () => ({
            user: {
              id: "u-guest-1",
              email: null,
              username: "CustomScribe",
              avatarId: "barnaby",
              usernameUpdatedAt: new Date().toISOString(),
              createdAt: new Date().toISOString()
            }
          })
        } as Response;
      }
      if (urlStr.includes("/api/rooms") && req?.method === "POST") {
        return {
          ok: true,
          status: 201,
          json: async () => ({ room: mockRoom })
        } as Response;
      }
      return { ok: false, status: 404, json: async () => ({}) } as Response;
    });

    const onRoomCreated = vi.fn();
    render(
      <AuthProvider>
        <MultiplayerLobbyScreen
          onRoomCreated={onRoomCreated}
          onJoinRoom={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByText("Multiplayer Folio Arena")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Sign In to Play Online/i })).toBeNull();

    // Scribe Name input and Create Room button are immediately enabled without logging in
    const scribeInput = screen.getByLabelText("Scribe Name") as HTMLInputElement;
    expect(scribeInput.disabled).toBe(false);
    fireEvent.change(scribeInput, { target: { value: "CustomScribe" } });

    const createBtn = screen.getByRole("button", { name: /Inscribe New Room/i }) as HTMLButtonElement;
    expect(createBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(guestCreated).toBe(true);
    expect(onRoomCreated).toHaveBeenCalledWith(mockRoom);
  });

  it("renders user status bar when authenticated", () => {
    render(
      <AuthProvider>
        <AuthenticatedLobbyWrapper
          onRoomCreated={vi.fn()}
          onJoinRoom={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AuthProvider>
    );

    expect(screen.getByText("GrandMagus")).toBeTruthy();
    expect(screen.getByText("Online Scribe")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Inscribe New Room/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("successfully creates room and invokes onRoomCreated with credentials and client header", async () => {
    const mockRoom: PublicRoomState = {
      roomId: "room-uuid-123",
      roomCode: "ABC234",
      hostUserId: "u-lobby-host",
      phase: "WAITING",
      players: [
        {
          userId: "u-lobby-host",
          username: "GrandMagus",
          avatarId: "barnaby",
          role: "HOST",
          connected: true,
          socketId: null,
          joinSequence: 1,
          joinedAt: Date.now()
        }
      ],
      spectators: [],
      playerCount: 1,
      spectatorCount: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000
    };

    let capturedUrl = "";
    let capturedReq: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, req) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/api/rooms") && req?.method === "POST") {
        capturedUrl = urlStr;
        capturedReq = req;
        return {
          ok: true,
          status: 201,
          json: async () => ({ room: mockRoom })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const onRoomCreated = vi.fn();

    render(
      <AuthProvider>
        <AuthenticatedLobbyWrapper
          onRoomCreated={onRoomCreated}
          onJoinRoom={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AuthProvider>
    );

    const createBtn = screen.getByRole("button", { name: /Inscribe New Room/i });
    await act(async () => {
      fireEvent.click(createBtn);
    });

    expect(capturedUrl).toContain("/api/rooms");
    // Verify HttpOnly cookie credentials and X-PageShooter-Client custom header
    expect(capturedReq?.credentials).toBe("include");
    const headers = capturedReq?.headers as Record<string, string>;
    expect(headers["X-PageShooter-Client"]).toBe("web");
    expect(onRoomCreated).toHaveBeenCalledWith(mockRoom);
  });

  it("formats room code input: uppercases, limits to 6 chars, and filters non-Base32", () => {
    render(
      <AuthProvider>
        <AuthenticatedLobbyWrapper
          onRoomCreated={vi.fn()}
          onJoinRoom={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AuthProvider>
    );

    const codeInput = screen.getByPlaceholderText("ABC234") as HTMLInputElement;

    // Test lowercase conversion and confusing character stripping (0, 1, I, O omitted; U, L allowed)
    fireEvent.change(codeInput, { target: { value: "ab1iou-234xyz" } });

    // 'a', 'b', 'u', '2', '3', '4' -> allowed: A, B, U, 2, 3, 4 (capped at 6 chars)
    expect(codeInput.value).toBe("ABU234");
    expect(screen.getByText("6 / 6")).toBeTruthy();
  });

  it("successfully joins room as player", async () => {
    const mockRoom: PublicRoomState = {
      roomId: "room-uuid-456",
      roomCode: "XYZ789",
      hostUserId: "u-other-host",
      phase: "WAITING",
      players: [
        {
          userId: "u-other-host",
          username: "OtherHost",
          avatarId: "barnaby",
          role: "HOST",
          connected: true,
          socketId: null,
          joinSequence: 1,
          joinedAt: Date.now()
        },
        {
          userId: "u-lobby-host",
          username: "GrandMagus",
          avatarId: "barnaby",
          role: "PLAYER",
          connected: true,
          socketId: null,
          joinSequence: 2,
          joinedAt: Date.now()
        }
      ],
      spectators: [],
      playerCount: 2,
      spectatorCount: 0,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000
    };

    let capturedUrl = "";
    let capturedReq: RequestInit | undefined;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url, req) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/join")) {
        capturedUrl = urlStr;
        capturedReq = req;
        return {
          ok: true,
          status: 200,
          json: async () => ({ room: mockRoom })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const onJoinRoom = vi.fn();

    render(
      <AuthProvider>
        <AuthenticatedLobbyWrapper
          onRoomCreated={vi.fn()}
          onJoinRoom={onJoinRoom}
          onOpenAuth={vi.fn()}
        />
      </AuthProvider>
    );

    const codeInput = screen.getByPlaceholderText("ABC234");
    fireEvent.change(codeInput, { target: { value: "XYZ789" } });

    const joinPlayerBtn = screen.getByRole("button", { name: "Join as Player" }) as HTMLButtonElement;
    expect(joinPlayerBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(joinPlayerBtn);
    });

    expect(capturedUrl).toContain("/api/rooms/XYZ789/join");
    expect(capturedReq?.credentials).toBe("include");
    const headers = capturedReq?.headers as Record<string, string>;
    expect(headers["X-PageShooter-Client"]).toBe("web");
    expect(onJoinRoom).toHaveBeenCalledWith(mockRoom, "PLAYER");
  });

  it("successfully joins room as spectator", async () => {
    const mockRoom: PublicRoomState = {
      roomId: "room-uuid-456",
      roomCode: "XYZ789",
      hostUserId: "u-other-host",
      phase: "WAITING",
      players: [],
      spectators: [],
      playerCount: 5,
      spectatorCount: 1,
      createdAt: Date.now(),
      expiresAt: Date.now() + 600000
    };

    let capturedUrl = "";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      if (urlStr.includes("/spectate")) {
        capturedUrl = urlStr;
        return {
          ok: true,
          status: 200,
          json: async () => ({ room: mockRoom })
        } as Response;
      }
      return { ok: false, status: 404 } as Response;
    });

    const onJoinRoom = vi.fn();

    render(
      <AuthProvider>
        <AuthenticatedLobbyWrapper
          onRoomCreated={vi.fn()}
          onJoinRoom={onJoinRoom}
          onOpenAuth={vi.fn()}
        />
      </AuthProvider>
    );

    const codeInput = screen.getByPlaceholderText("ABC234");
    fireEvent.change(codeInput, { target: { value: "XYZ789" } });

    const spectateBtn = screen.getByRole("button", { name: "Spectate" }) as HTMLButtonElement;
    expect(spectateBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(spectateBtn);
    });

    expect(capturedUrl).toContain("/api/rooms/XYZ789/spectate");
    expect(onJoinRoom).toHaveBeenCalledWith(mockRoom, "SPECTATOR");
  });

  it("displays error message when room is not found", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const urlStr = String(url);
      if (urlStr.includes("/api/auth/session")) {
        return { ok: false, status: 401, json: async () => ({}) } as Response;
      }
      return {
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ error: "ROOM_NOT_FOUND", message: "Chamber not found or expired" })
      } as Response;
    });

    render(
      <AuthProvider>
        <AuthenticatedLobbyWrapper
          onRoomCreated={vi.fn()}
          onJoinRoom={vi.fn()}
          onOpenAuth={vi.fn()}
        />
      </AuthProvider>
    );

    const codeInput = screen.getByPlaceholderText("ABC234");
    // Use valid Base-32 6-character code (A-Z and 2-9, excluding vowels O, I, etc.)
    fireEvent.change(codeInput, { target: { value: "NTFND2" } });

    const joinPlayerBtn = screen.getByRole("button", { name: "Join as Player" }) as HTMLButtonElement;
    expect(joinPlayerBtn.disabled).toBe(false);

    await act(async () => {
      fireEvent.click(joinPlayerBtn);
    });

    expect(screen.getByText("Chamber not found or expired")).toBeTruthy();
  });
});
