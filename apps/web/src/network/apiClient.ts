import type {
  PublicUserProfile,
  PublicRoomState,
  RoomChatMessage,
  RoomEmojiEvent,
  RoomLastRollInfo,
  RoomLastShotInfo,
  UserActiveRoomResolution,
  RoomParticipant,
  MatchState,
  MatchEvent,
  CellValue
} from "@pageshooter/shared";

export class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function getApiBaseUrl(): string {
  // Support Vite environment variable if configured
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
  if (metaEnv?.VITE_API_URL) {
    return metaEnv.VITE_API_URL;
  }
  // When deployed on Vercel or any non-localhost domain without explicit VITE_API_URL,
  // use same-origin (/api/* routed by vercel.json to /api/index.js)
  if (
    typeof window !== "undefined" &&
    window.location &&
    window.location.hostname !== "localhost" &&
    window.location.hostname !== "127.0.0.1"
  ) {
    return window.location.origin;
  }
  // Default to local Fastify server port 4000
  return "http://localhost:4000";
}

export function getWsBaseUrl(): string {
  const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
  if (metaEnv?.VITE_WS_URL) {
    return metaEnv.VITE_WS_URL;
  }
  const apiBase = getApiBaseUrl();
  return apiBase.replace(/^http/, "ws") + "/ws";
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const baseUrl = getApiBaseUrl().replace(/\/+$/, "");
  const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const method = (options.method || "GET").toUpperCase();
  const headers: Record<string, string> = {
    ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    ...((options.headers as Record<string, string>) || {})
  };

  // Enforce X-PageShooter-Client: web custom header on all state-changing REST requests (CSRF mitigation)
  if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    headers["X-PageShooter-Client"] = "web";
  }

  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers,
      credentials: "include" // Automatically attaches HttpOnly session cookie
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new ApiError(0, "NETWORK_ERROR", `Failed to connect to server: ${errorMsg}`);
  }

  if (!response.ok) {
    let errorData: { error?: string; message?: string; details?: Record<string, unknown> } = {};
    try {
      errorData = await response.json();
    } catch {
      // Failed to parse JSON error response
    }

    const code = errorData.error || (response.status === 401 ? "UNAUTHORIZED" : "HTTP_ERROR");
    const message = errorData.message || response.statusText || `Request failed with status ${response.status}`;
    throw new ApiError(response.status, code, message, errorData.details);
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  // Auth endpoints (Zero-Token Client: server sets HttpOnly cookie; returns only PublicUserProfile)
  async registerPassword(input: {
    email: string;
    username: string;
    password: string;
    avatarId?: string;
  }): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/auth/register-password", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async loginPassword(input: {
    identifier: string;
    password: string;
  }): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/auth/login-password", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async loginGoogle(input: {
    idToken: string;
    requestedUsername?: string;
  }): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/auth/google", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },

  async linkGoogle(idToken: string): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/auth/link-google", {
      method: "POST",
      body: JSON.stringify({ idToken })
    });
  },

  async logout(): Promise<{ success: boolean }> {
    return request<{ success: boolean }>("/api/auth/logout", {
      method: "POST"
    });
  },

  async getSession(): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/auth/session", {
      method: "GET"
    });
  },

  async createGuestSession(username?: string): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/auth/guest", {
      method: "POST",
      body: JSON.stringify({ username })
    });
  },

  // User endpoints
  async getCurrentUser(): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/users/me", {
      method: "GET"
    });
  },

  async changeUsername(newUsername: string): Promise<{ user: PublicUserProfile }> {
    return request<{ user: PublicUserProfile }>("/api/users/me/username", {
      method: "PATCH",
      body: JSON.stringify({ newUsername })
    });
  },

  // Room endpoints
  async getMyActiveRoom(): Promise<{ activeRoom: UserActiveRoomResolution | null }> {
    return request<{ activeRoom: UserActiveRoomResolution | null }>("/api/rooms/my-active", {
      method: "GET"
    });
  },

  async createRoom(): Promise<{ room: PublicRoomState }> {
    return request<{ room: PublicRoomState }>("/api/rooms", {
      method: "POST"
    });
  },

  async getRoom(roomCode: string): Promise<{ room: PublicRoomState }> {
    return request<{ room: PublicRoomState }>(`/api/rooms/${encodeURIComponent(roomCode)}`, {
      method: "GET"
    });
  },

  async joinRoom(roomCode: string): Promise<{ room: PublicRoomState }> {
    return request<{ room: PublicRoomState }>(`/api/rooms/${encodeURIComponent(roomCode)}/join`, {
      method: "POST"
    });
  },

  async spectateRoom(roomCode: string): Promise<{ room: PublicRoomState }> {
    return request<{ room: PublicRoomState }>(`/api/rooms/${encodeURIComponent(roomCode)}/spectate`, {
      method: "POST"
    });
  },

  async leaveRoom(roomCode: string): Promise<{ roomDeleted: boolean; newHostUserId?: string }> {
    return request<{ roomDeleted: boolean; newHostUserId?: string }>(
      `/api/rooms/${encodeURIComponent(roomCode)}/leave`,
      { method: "POST" }
    );
  },

  async kickPlayer(roomCode: string, targetUserId: string): Promise<{ kicked: RoomParticipant }> {
    return request<{ kicked: RoomParticipant }>(
      `/api/rooms/${encodeURIComponent(roomCode)}/kick`,
      {
        method: "POST",
        body: JSON.stringify({ targetUserId })
      }
    );
  },

  async startMatch(roomCode: string): Promise<{
    room: PublicRoomState;
    match: MatchState;
    currentCommitment: { turnNumber: number; commitmentHash: string };
  }> {
    return request<{
      room: PublicRoomState;
      match: MatchState;
      currentCommitment: { turnNumber: number; commitmentHash: string };
    }>(`/api/rooms/${encodeURIComponent(roomCode)}/start`, {
      method: "POST"
    });
  },

  async rollTurn(
    roomCode: string,
    expectedStateVersion?: number,
    commandId?: string
  ): Promise<{
    roomCode?: string;
    state: MatchState;
    rollResult: {
      turnNumber: number;
      outcome: CellValue;
      pageNumber: number;
      seed: string;
      commitmentHash: string;
    };
    lastRoll?: RoomLastRollInfo;
    nextCommitment: { turnNumber: number; commitmentHash: string } | null;
    events: MatchEvent[];
  }> {
    return request(`/api/rooms/${encodeURIComponent(roomCode)}/roll`, {
      method: "POST",
      body: JSON.stringify({ expectedStateVersion, commandId })
    });
  },

  async shootTurn(
    roomCode: string,
    targetUserId: string,
    targetCellValue: CellValue,
    expectedStateVersion?: number,
    commandId?: string
  ): Promise<{
    roomCode?: string;
    state: MatchState;
    lastShot?: RoomLastShotInfo;
    nextCommitment?: { turnNumber: number; commitmentHash: string } | null;
    events: MatchEvent[];
  }> {
    return request(`/api/rooms/${encodeURIComponent(roomCode)}/shoot`, {
      method: "POST",
      body: JSON.stringify({
        targetUserId,
        targetCellValue,
        expectedStateVersion,
        commandId
      })
    });
  },

  async sendChat(
    roomCode: string,
    message: string
  ): Promise<{ chat: RoomChatMessage }> {
    return request(`/api/rooms/${encodeURIComponent(roomCode)}/chat`, {
      method: "POST",
      body: JSON.stringify({ message })
    });
  },

  async sendEmoji(
    roomCode: string,
    emojiId: string
  ): Promise<{ emoji: RoomEmojiEvent | null; throttled: boolean }> {
    return request(`/api/rooms/${encodeURIComponent(roomCode)}/emoji`, {
      method: "POST",
      body: JSON.stringify({ emojiId })
    });
  }
};
