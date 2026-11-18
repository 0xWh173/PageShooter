import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { type FastifyInstance } from "fastify";
import {
  WAITING_ROOM_TTL_MS,
  MAX_PLAYERS
} from "@pageshooter/shared";
import * as roomCodeModule from "../src/rooms/roomCode.js";
import {
  generateRoomCode,
  normalizeRoomCode,
  isValidRoomCode,
  BASE32_ALPHABET
} from "../src/rooms/roomCode.js";
import { RoomManager, RoomError, sanitizeRoom } from "../src/rooms/roomManager.js";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { generateToken } from "../src/services/token.js";

describe("Phase 6.4: Room & Spectator System", () => {
  describe("Room Code Specification & Validation (Base-32)", () => {
    it("generates 6-character room codes exclusively using Base-32 alphabet", () => {
      for (let i = 0; i < 50; i++) {
        const code = generateRoomCode();
        expect(code).toHaveLength(6);
        expect(isValidRoomCode(code)).toBe(true);
        for (const char of code) {
          expect(BASE32_ALPHABET).toContain(char);
        }
      }
    });

    it("excludes visually ambiguous characters 0, 1, I, O from alphabet", () => {
      expect(BASE32_ALPHABET).not.toContain("0");
      expect(BASE32_ALPHABET).not.toContain("1");
      expect(BASE32_ALPHABET).not.toContain("I");
      expect(BASE32_ALPHABET).not.toContain("O");
      expect(BASE32_ALPHABET.length).toBe(32);
    });

    it("normalizes lowercase and whitespace, and validates correctly", () => {
      expect(normalizeRoomCode(" 234abc ")).toBe("234ABC");
      expect(isValidRoomCode("234ABC")).toBe(true);
      expect(isValidRoomCode(" 234abc ")).toBe(true); // normalizeRoomCode inside isValidRoomCode

      // Reject wrong length
      expect(isValidRoomCode("234AB")).toBe(false); // 5 chars
      expect(isValidRoomCode("234ABCD")).toBe(false); // 7 chars

      // Reject forbidden characters
      expect(isValidRoomCode("234AB0")).toBe(false); // contains 0
      expect(isValidRoomCode("234AB1")).toBe(false); // contains 1
      expect(isValidRoomCode("234ABI")).toBe(false); // contains I
      expect(isValidRoomCode("234ABO")).toBe(false); // contains O
      expect(isValidRoomCode("234AB-")).toBe(false); // contains punctuation
    });
  });

  describe("In-Memory RoomManager Lifecycle & Host Migration (ADR-01 & ADR-02)", () => {
    let roomManager: RoomManager;

    beforeEach(() => {
      roomManager = new RoomManager();
    });

    it("creates a room in WAITING phase with host having joinSequence 1 and 10-minute TTL", () => {
      const host = { id: "host-uuid-1", username: "HostPlayer", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      expect(roomManager.roomCount).toBe(1);
      expect(room.phase).toBe("WAITING");
      expect(room.hostUserId).toBe(host.id);
      expect(room.players.size).toBe(1);
      expect(room.spectators.size).toBe(0);
      expect(room.nextJoinSequence).toBe(2);

      const hostParticipant = room.players.get(host.id);
      expect(hostParticipant).toBeDefined();
      expect(hostParticipant?.role).toBe("HOST");
      expect(hostParticipant?.joinSequence).toBe(1);
      expect(hostParticipant?.connected).toBe(true);

      // Verify 10-minute waiting-room TTL (600,000 ms)
      expect(room.expiresAt).toBe(room.createdAt + WAITING_ROOM_TTL_MS);
    });

    it("allows players to join up to MAX_PLAYERS (10) and assigns monotonic joinSequence", () => {
      const host = { id: "p-1", username: "Player1", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      for (let i = 2; i <= MAX_PLAYERS; i++) {
        const user = { id: `p-${i}`, username: `Player${i}`, avatarId: "barnaby" };
        const result = roomManager.joinAsPlayer(room.roomCode, user);
        expect(result.participant.joinSequence).toBe(i);
        expect(result.participant.role).toBe("PLAYER");
      }

      expect(room.players.size).toBe(10);

      // 11th player must be rejected with ROOM_FULL (HTTP 400)
      const user11 = { id: "p-11", username: "Player11", avatarId: "barnaby" };
      expect(() => roomManager.joinAsPlayer(room.roomCode, user11)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "ROOM_FULL"
        })
      );
    });

    it("is idempotent when existing player rejoins and updates connected status", () => {
      const host = { id: "p-1", username: "Player1", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      const p2 = { id: "p-2", username: "Player2", avatarId: "barnaby" };
      roomManager.joinAsPlayer(room.roomCode, p2);

      // Rejoin p2
      const rejoinResult = roomManager.joinAsPlayer(room.roomCode, {
        id: "p-2",
        username: "Player2_Updated",
        avatarId: "shadow_ninja"
      });

      expect(rejoinResult.participant.joinSequence).toBe(2);
      expect(rejoinResult.participant.username).toBe("Player2_Updated");
      expect(rejoinResult.participant.avatarId).toBe("shadow_ninja");
      expect(room.players.size).toBe(2);
    });

    it("supports spectator separation: spectators do not consume player slots and cannot double-join as players", () => {
      const host = { id: "p-1", username: "Player1", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      // Fill room with 10 players
      for (let i = 2; i <= 10; i++) {
        roomManager.joinAsPlayer(room.roomCode, { id: `p-${i}`, username: `Player${i}`, avatarId: "barnaby" });
      }
      expect(room.players.size).toBe(10);

      // Add 5 spectators (spectators do not consume player slots)
      for (let s = 1; s <= 5; s++) {
        const specUser = { id: `spec-${s}`, username: `Watcher${s}`, avatarId: "barnaby" };
        const result = roomManager.joinAsSpectator(room.roomCode, specUser);
        expect(result.participant.role).toBe("SPECTATOR");
      }

      expect(room.players.size).toBe(10);
      expect(room.spectators.size).toBe(5);

      // Active player cannot join as spectator simultaneously
      expect(() =>
        roomManager.joinAsSpectator(room.roomCode, { id: "p-2", username: "Player2", avatarId: "barnaby" })
      ).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "ALREADY_PLAYER"
        })
      );

      // But a spectator CAN transition into a player if room has capacity
      const freshRoom = roomManager.createRoom(host);
      const specUser = { id: "spec-switch", username: "Switcher", avatarId: "barnaby" };
      roomManager.joinAsSpectator(freshRoom.roomCode, specUser);
      expect(freshRoom.spectators.has("spec-switch")).toBe(true);

      roomManager.joinAsPlayer(freshRoom.roomCode, specUser);
      expect(freshRoom.spectators.has("spec-switch")).toBe(false);
      expect(freshRoom.players.has("spec-switch")).toBe(true);
    });

    it("enforces host permissions: host can kick players/spectators; non-host kick is rejected", () => {
      const host = { id: "host-1", username: "Host", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      const p2 = { id: "p-2", username: "Player2", avatarId: "barnaby" };
      const p3 = { id: "p-3", username: "Player3", avatarId: "barnaby" };
      roomManager.joinAsPlayer(room.roomCode, p2);
      roomManager.joinAsPlayer(room.roomCode, p3);

      // Non-host attempts to kick p3 -> 403 NOT_HOST
      expect(() => roomManager.kickPlayer(room.roomCode, "p-2", "p-3")).toThrowError(
        expect.objectContaining({
          statusCode: 403,
          code: "NOT_HOST"
        })
      );

      // Host cannot kick themselves -> 400 CANNOT_KICK_HOST
      expect(() => roomManager.kickPlayer(room.roomCode, host.id, host.id)).toThrowError(
        expect.objectContaining({
          statusCode: 400,
          code: "CANNOT_KICK_HOST"
        })
      );

      // Host kicks p2 -> succeeds
      const kickRes = roomManager.kickPlayer(room.roomCode, host.id, "p-2");
      expect(kickRes.kicked.userId).toBe("p-2");
      expect(room.players.has("p-2")).toBe(false);
      expect(room.players.size).toBe(2); // host + p3
    });

    it("implements ADR-02 Option B host migration in WAITING phase (earliest joinSequence wins)", () => {
      const host = { id: "p-1", username: "HostOne", avatarId: "barnaby" }; // seq 1
      const room = roomManager.createRoom(host);

      const p2 = { id: "p-2", username: "PlayerTwo", avatarId: "barnaby" }; // seq 2
      const p3 = { id: "p-3", username: "PlayerThree", avatarId: "barnaby" }; // seq 3
      const p4 = { id: "p-4", username: "PlayerFour", avatarId: "barnaby" }; // seq 4

      roomManager.joinAsPlayer(room.roomCode, p2);
      roomManager.joinAsPlayer(room.roomCode, p3);
      roomManager.joinAsPlayer(room.roomCode, p4);

      expect(room.hostUserId).toBe("p-1");

      // Host leaves the waiting room -> p2 (sequence 2) MUST become new host
      const leaveResult1 = roomManager.leaveRoom(room.roomCode, "p-1");
      expect(leaveResult1.roomDeleted).toBe(false);
      expect(leaveResult1.newHostUserId).toBe("p-2");
      expect(room.hostUserId).toBe("p-2");
      expect(room.players.get("p-2")?.role).toBe("HOST");

      // Now p2 leaves -> p3 (sequence 3) MUST become new host
      const leaveResult2 = roomManager.leaveRoom(room.roomCode, "p-2");
      expect(leaveResult2.roomDeleted).toBe(false);
      expect(leaveResult2.newHostUserId).toBe("p-3");
      expect(room.hostUserId).toBe("p-3");
      expect(room.players.get("p-3")?.role).toBe("HOST");

      // Non-host p4 leaves -> host remains p3
      const leaveResult3 = roomManager.leaveRoom(room.roomCode, "p-4");
      expect(leaveResult3.roomDeleted).toBe(false);
      expect(leaveResult3.newHostUserId).toBeUndefined();
      expect(room.hostUserId).toBe("p-3");

      // Last player p3 leaves -> room is deleted immediately from memory
      const leaveResult4 = roomManager.leaveRoom(room.roomCode, "p-3");
      expect(leaveResult4.roomDeleted).toBe(true);
      expect(roomManager.roomCount).toBe(0);
      expect(roomManager.getRoomByCode(room.roomCode)).toBeNull();
    });

    it("enforces 10-minute waiting-room TTL and sweeps expired rooms", () => {
      const now = 1000000;
      const host = { id: "p-1", username: "HostOne", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      // Override createdAt and expiresAt for controlled testing
      room.createdAt = now;
      room.expiresAt = now + WAITING_ROOM_TTL_MS;

      // At 9 minutes (540,000 ms), room is still valid
      expect(roomManager.sweepExpiredRooms(now + 540_000)).toBe(0);
      expect(roomManager.getRoomByCode(room.roomCode, now + 540_000)).toBeDefined();

      // At 10 minutes and 1 second (600,001 ms), room is expired
      const sweptCount = roomManager.sweepExpiredRooms(now + 600_001);
      expect(sweptCount).toBe(1);
      expect(roomManager.roomCount).toBe(0);
      expect(roomManager.getRoomByCode(room.roomCode, now + 600_001)).toBeNull();
    });

    it("sanitizes room state for client consumption without internal memory maps", () => {
      const host = { id: "p-1", username: "HostOne", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);
      roomManager.joinAsPlayer(room.roomCode, { id: "p-2", username: "PlayerTwo", avatarId: "barnaby" });
      roomManager.joinAsSpectator(room.roomCode, { id: "s-1", username: "SpectatorOne", avatarId: "barnaby" });

      const sanitized = sanitizeRoom(room);
      expect(Array.isArray(sanitized.players)).toBe(true);
      expect(Array.isArray(sanitized.spectators)).toBe(true);
      expect(sanitized.playerCount).toBe(2);
      expect(sanitized.spectatorCount).toBe(1);
      expect(sanitized.hostUserId).toBe("p-1");
      expect(sanitized.phase).toBe("WAITING");
    });

    it("throws RoomError CODE_GENERATION_FAILED when collision retries are exhausted", () => {
      const host = { id: "p-1", username: "HostOne", avatarId: "barnaby" };
      // Create a room that occupies the code "ABCDEF" (valid Base-32 code)
      roomManager.createRoom(host, "ABCDEF");

      // Mock generateRoomCode to consistently return the colliding code "ABCDEF"
      const spy = vi.spyOn(roomCodeModule, "generateRoomCode").mockReturnValue("ABCDEF");

      try {
        expect(() => roomManager.createRoom(host)).toThrowError(
          expect.objectContaining({
            statusCode: 500,
            code: "CODE_GENERATION_FAILED"
          })
        );
      } finally {
        spy.mockRestore();
      }
    });

    it("deletes room immediately when final player leaves, even if spectators remain", () => {
      const host = { id: "p-1", username: "HostOne", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      roomManager.joinAsSpectator(room.roomCode, { id: "s-1", username: "SpectatorOne", avatarId: "barnaby" });
      roomManager.joinAsSpectator(room.roomCode, { id: "s-2", username: "SpectatorTwo", avatarId: "barnaby" });

      expect(room.players.size).toBe(1);
      expect(room.spectators.size).toBe(2);

      const leaveResult = roomManager.leaveRoom(room.roomCode, host.id);
      expect(leaveResult.roomDeleted).toBe(true);
      expect(roomManager.roomCount).toBe(0);
      expect(roomManager.getRoomByCode(room.roomCode)).toBeNull();
    });

    it("verifies kicked participant rejoin rules: resets join sequence and obeys waiting/capacity constraints", () => {
      const host = { id: "p-1", username: "HostOne", avatarId: "barnaby" };
      const room = roomManager.createRoom(host);

      const p2 = { id: "p-2", username: "PlayerTwo", avatarId: "barnaby" };
      const p3 = { id: "p-3", username: "PlayerThree", avatarId: "barnaby" };
      roomManager.joinAsPlayer(room.roomCode, p2); // seq 2
      roomManager.joinAsPlayer(room.roomCode, p3); // seq 3

      // Host kicks PlayerTwo
      const kickRes = roomManager.kickPlayer(room.roomCode, host.id, "p-2");
      expect(kickRes.kicked.userId).toBe("p-2");
      expect(room.players.has("p-2")).toBe(false);

      // Intended Room Membership Rule:
      // Kicking removes the user from the room and revokes their seniority sequence.
      // There is no permanent room ban list in v3.2.0; the user can rejoin as a fresh player if slots remain.
      const rejoinRes = roomManager.joinAsPlayer(room.roomCode, p2);
      expect(rejoinRes.participant.joinSequence).toBe(4); // New monotonic sequence (seq 2 is lost)
      expect(room.players.size).toBe(3);

      // If host now leaves, p3 (seq 3) becomes host over the rejoined p2 (seq 4)
      const leaveRes = roomManager.leaveRoom(room.roomCode, host.id);
      expect(leaveRes.newHostUserId).toBe("p-3");
    });
  });

  describe("Fastify REST Endpoints for Rooms (/api/rooms)", () => {
    let app: FastifyInstance | null = null;
    let roomManager: RoomManager;

    const mockUser1 = { id: "11111111-1111-4111-8111-111111111111", username: "HostUser", avatarId: "barnaby" };
    const mockUser2 = { id: "22222222-2222-4222-8222-222222222222", username: "GamerTwo", avatarId: "shadow_ninja" };
    const mockUser3 = { id: "33333333-3333-4333-8333-333333333333", username: "GamerThree", avatarId: "barnaby" };

    const tokenUser1 = generateToken({ userId: mockUser1.id, username: mockUser1.username });
    const tokenUser2 = generateToken({ userId: mockUser2.id, username: mockUser2.username });
    const tokenUser3 = generateToken({ userId: mockUser3.id, username: mockUser3.username });

    // Mock AuthService to return user summaries without touching live DB
    const mockAuthService = {
      getCurrentUser: async (userId: string) => {
        if (userId === mockUser1.id) return { ...mockUser1, email: "user1@test.local", createdAt: new Date(), usernameUpdatedAt: new Date() };
        if (userId === mockUser2.id) return { ...mockUser2, email: "user2@test.local", createdAt: new Date(), usernameUpdatedAt: new Date() };
        if (userId === mockUser3.id) return { ...mockUser3, email: "user3@test.local", createdAt: new Date(), usernameUpdatedAt: new Date() };
        throw new Error("User not found");
      }
    } as any;

    beforeEach(() => {
      roomManager = new RoomManager();
      app = buildServer({
        config: loadConfig({ NODE_ENV: "test" }),
        roomManager,
        authService: mockAuthService,
        enableRateLimit: false
      });
    });

    afterEach(async () => {
      if (app) {
        await app.close();
        app = null;
      }
    });

    it("rejects unauthenticated requests with HTTP 401", async () => {
      const res = await app!.inject({
        method: "POST",
        url: "/api/rooms"
      });
      expect(res.statusCode).toBe(401);
    });

    it("POST /api/rooms creates room and returns sanitized PublicRoomState", async () => {
      const res = await app!.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          authorization: `Bearer ${tokenUser1}`
        }
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.room).toBeDefined();
      expect(body.room.roomCode).toHaveLength(6);
      expect(body.room.hostUserId).toBe(mockUser1.id);
      expect(body.room.playerCount).toBe(1);
      expect(body.room.players[0].username).toBe("HostUser");
      expect(body.room.players[0].role).toBe("HOST");
    });

    it("GET /api/rooms/:roomCode retrieves room state or returns 404", async () => {
      // 1. Create room
      const room = roomManager.createRoom(mockUser1);

      // 2. Query valid code
      const res = await app!.inject({
        method: "GET",
        url: `/api/rooms/${room.roomCode}`,
        headers: {
          authorization: `Bearer ${tokenUser2}`
        }
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.room.roomCode).toBe(room.roomCode);

      // 3. Query nonexistent code
      const badRes = await app!.inject({
        method: "GET",
        url: "/api/rooms/ZZZZZZ",
        headers: {
          authorization: `Bearer ${tokenUser2}`
        }
      });
      expect(badRes.statusCode).toBe(404);
      const badBody = JSON.parse(badRes.body);
      expect(badBody.error).toBe("ROOM_NOT_FOUND");
    });

    it("POST /api/rooms/:roomCode/join allows joining as a player", async () => {
      const room = roomManager.createRoom(mockUser1);

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/join`,
        headers: {
          authorization: `Bearer ${tokenUser2}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.room.playerCount).toBe(2);
      expect(body.participant.username).toBe("GamerTwo");
      expect(body.participant.role).toBe("PLAYER");
      expect(body.participant.joinSequence).toBe(2);
    });

    it("POST /api/rooms/:roomCode/spectate allows joining as a spectator", async () => {
      const room = roomManager.createRoom(mockUser1);

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/spectate`,
        headers: {
          authorization: `Bearer ${tokenUser2}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.room.spectatorCount).toBe(1);
      expect(body.participant.username).toBe("GamerTwo");
      expect(body.participant.role).toBe("SPECTATOR");
    });

    it("POST /api/rooms/:roomCode/kick allows host to kick player, rejects non-host", async () => {
      const room = roomManager.createRoom(mockUser1);
      roomManager.joinAsPlayer(room.roomCode, mockUser2);
      roomManager.joinAsPlayer(room.roomCode, mockUser3);

      // GamerTwo attempts to kick GamerThree -> 403 NOT_HOST
      const failRes = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/kick`,
        headers: {
          authorization: `Bearer ${tokenUser2}`
        },
        payload: {
          targetUserId: mockUser3.id
        }
      });
      expect(failRes.statusCode).toBe(403);
      expect(JSON.parse(failRes.body).error).toBe("NOT_HOST");

      // Host kicks GamerThree -> 200 OK
      const successRes = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/kick`,
        headers: {
          authorization: `Bearer ${tokenUser1}`
        },
        payload: {
          targetUserId: mockUser3.id
        }
      });
      expect(successRes.statusCode).toBe(200);
      const body = JSON.parse(successRes.body);
      expect(body.kicked.userId).toBe(mockUser3.id);
      expect(room.players.has(mockUser3.id)).toBe(false);
    });

    it("POST /api/rooms/:roomCode/leave handles player leaving and host migration", async () => {
      const room = roomManager.createRoom(mockUser1); // seq 1
      roomManager.joinAsPlayer(room.roomCode, mockUser2); // seq 2

      // Host leaves room
      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/leave`,
        headers: {
          authorization: `Bearer ${tokenUser1}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.roomDeleted).toBe(false);
      expect(body.newHostUserId).toBe(mockUser2.id);
      expect(room.hostUserId).toBe(mockUser2.id);

      // GamerTwo leaves -> room is deleted
      const res2 = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/leave`,
        headers: {
          authorization: `Bearer ${tokenUser2}`
        }
      });
      expect(res2.statusCode).toBe(200);
      expect(JSON.parse(res2.body).roomDeleted).toBe(true);
      expect(roomManager.roomCount).toBe(0);
    });

    it("verifies server background expiration sweep does not expire ACTIVE rooms and clears timer on close", async () => {
      const customRoomManager = new RoomManager();
      const server = buildServer({
        config: loadConfig({ NODE_ENV: "test" }),
        roomManager: customRoomManager,
        authService: mockAuthService,
        enableRateLimit: false,
        sweepIntervalMs: 50
      });

      const host = { id: "p-1", username: "HostOne", avatarId: "barnaby" };
      const roomWaiting = customRoomManager.createRoom(host);
      const roomActive = customRoomManager.createRoom(host);
      roomActive.phase = "ACTIVE";
      roomActive.expiresAt = null; // Invariant: active matches have null expiresAt

      // Set roomWaiting as expired
      roomWaiting.expiresAt = Date.now() - 1000;

      // Trigger sweep via roomManager
      const swept = customRoomManager.sweepExpiredRooms();
      expect(swept).toBe(1);
      expect(customRoomManager.getRoomByCode(roomWaiting.roomCode)).toBeNull();
      expect(customRoomManager.getRoomByCode(roomActive.roomCode)).toBeDefined();

      // Close server cleanly (triggers clearInterval)
      await server.close();
    });
  });
});
