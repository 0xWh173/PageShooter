import { describe, it, expect, beforeEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { RoomManager } from "../src/rooms/roomManager.js";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { generateToken } from "../src/services/token.js";

describe("Milestone 1.1: Server-Assisted Room Discovery & 6-State Recovery Model (serverRoomRecovery.test.ts)", () => {
  let roomManager: RoomManager;

  const userAlice = { id: "usr-alice", username: "Alice", avatarId: "barnaby" };
  const userBob = { id: "usr-bob", username: "Bob", avatarId: "pip" };
  const userCharlie = { id: "usr-charlie", username: "Charlie", avatarId: "clover" };
  const userDiana = { id: "usr-diana", username: "Diana", avatarId: "hazel" };
  const userEvan = { id: "usr-evan", username: "Evan", avatarId: "oliver" };

  beforeEach(() => {
    roomManager = new RoomManager();
  });

  describe("Six-Tier Participation State Resolution", () => {
    it("Tier 1: resolves DISCONNECTED_PLAYER with canReconnectMatch = true and active timer deadline", () => {
      // Create room and start match with 5 players
      const room = roomManager.createRoom(userAlice, "ABCDEF");
      roomManager.joinAsPlayer(room.roomCode, userBob);
      roomManager.joinAsPlayer(room.roomCode, userCharlie);
      roomManager.joinAsPlayer(room.roomCode, userDiana);
      roomManager.joinAsPlayer(room.roomCode, userEvan);

      roomManager.startMatch(room.roomCode, userAlice.id);
      expect(room.phase).toBe("ACTIVE");

      // Bob disconnects
      const deadline = Date.now() + 60_000;
      room.disconnectedPlayers.set(userBob.id, { deadline, timer: setTimeout(() => {}, 60_000) as any });
      room.players.get(userBob.id)!.connected = false;

      const resolution = roomManager.resolveUserRoomParticipation(userBob.id);
      expect(resolution).not.toBeNull();
      expect(resolution?.participation).toBe("DISCONNECTED_PLAYER");
      expect(resolution?.canReconnectMatch).toBe(true);
      expect(resolution?.hasActiveMatchParticipation).toBe(true);
      expect(resolution?.roomCode).toBe("ABCDEF");
      expect(resolution?.reconnectDeadlineMs).toBeGreaterThan(0);
      expect(resolution?.role).toBe("PLAYER");
    });

    it("Tier 2: resolves CONNECTED_PLAYER with canReconnectMatch = false (transferable session)", () => {
      const room = roomManager.createRoom(userAlice, "BCDEFG");
      roomManager.joinAsPlayer(room.roomCode, userBob);
      roomManager.joinAsPlayer(room.roomCode, userCharlie);
      roomManager.joinAsPlayer(room.roomCode, userDiana);
      roomManager.joinAsPlayer(room.roomCode, userEvan);

      roomManager.startMatch(room.roomCode, userAlice.id);

      const resolution = roomManager.resolveUserRoomParticipation(userAlice.id);
      expect(resolution).not.toBeNull();
      expect(resolution?.participation).toBe("CONNECTED_PLAYER");
      expect(resolution?.canReconnectMatch).toBe(false);
      expect(resolution?.hasActiveMatchParticipation).toBe(true);
      expect(resolution?.roomCode).toBe("BCDEFG");
      expect(resolution?.role).toBe("HOST");
    });

    it("Tier 3: resolves WAITING_PLAYER for unstarted room in WAITING phase (host vs guest)", () => {
      const room = roomManager.createRoom(userAlice, "CDEFGH");
      roomManager.joinAsPlayer(room.roomCode, userBob);

      // Host resolution
      const hostRes = roomManager.resolveUserRoomParticipation(userAlice.id);
      expect(hostRes).not.toBeNull();
      expect(hostRes?.participation).toBe("WAITING_PLAYER");
      expect(hostRes?.role).toBe("HOST");
      expect(hostRes?.phase).toBe("WAITING");
      expect(hostRes?.canReconnectMatch).toBe(false);
      expect(hostRes?.hasActiveMatchParticipation).toBe(false);

      // Guest resolution
      const guestRes = roomManager.resolveUserRoomParticipation(userBob.id);
      expect(guestRes).not.toBeNull();
      expect(guestRes?.participation).toBe("WAITING_PLAYER");
      expect(guestRes?.role).toBe("PLAYER");
      expect(guestRes?.phase).toBe("WAITING");
      expect(guestRes?.canReconnectMatch).toBe(false);
      expect(guestRes?.hasActiveMatchParticipation).toBe(false);
      expect(guestRes?.roomCode).toBe("CDEFGH");
    });

    it("Tier 4: resolves SPECTATOR with strictly no player seat reclamation", () => {
      const room = roomManager.createRoom(userAlice, "DEFGHJ");
      roomManager.joinAsSpectator(room.roomCode, userBob);

      const resolution = roomManager.resolveUserRoomParticipation(userBob.id);
      expect(resolution).not.toBeNull();
      expect(resolution?.participation).toBe("SPECTATOR");
      expect(resolution?.role).toBe("SPECTATOR");
      expect(resolution?.canReconnectMatch).toBe(false);
      expect(resolution?.hasActiveMatchParticipation).toBe(false);
      expect(resolution?.roomCode).toBe("DEFGHJ");
    });

    it("Tier 5: resolves ELIMINATED participant in an active match as non-reconnectable spectator", () => {
      const room = roomManager.createRoom(userAlice, "EFGHJK");
      roomManager.joinAsPlayer(room.roomCode, userBob);
      roomManager.joinAsPlayer(room.roomCode, userCharlie);
      roomManager.joinAsPlayer(room.roomCode, userDiana);
      roomManager.joinAsPlayer(room.roomCode, userEvan);

      roomManager.startMatch(room.roomCode, userAlice.id);

      // Simulate Bob's elimination in engine
      const bobInMatch = room.matchState?.players.find((p) => p.playerId === userBob.id);
      if (bobInMatch) {
        bobInMatch.status = "ELIMINATED";
      }

      const resolution = roomManager.resolveUserRoomParticipation(userBob.id);
      expect(resolution).not.toBeNull();
      expect(resolution?.participation).toBe("ELIMINATED");
      expect(resolution?.role).toBe("SPECTATOR");
      expect(resolution?.canReconnectMatch).toBe(false);
      expect(resolution?.hasActiveMatchParticipation).toBe(false);
    });

    it("Tier 6: resolves COMPLETED_PARTICIPANT when match phase is COMPLETED", () => {
      const room = roomManager.createRoom(userAlice, "FGHJKL");
      roomManager.joinAsPlayer(room.roomCode, userBob);
      roomManager.joinAsPlayer(room.roomCode, userCharlie);
      roomManager.joinAsPlayer(room.roomCode, userDiana);
      roomManager.joinAsPlayer(room.roomCode, userEvan);

      roomManager.startMatch(room.roomCode, userAlice.id);
      room.phase = "COMPLETED";

      const resolution = roomManager.resolveUserRoomParticipation(userAlice.id);
      expect(resolution).not.toBeNull();
      expect(resolution?.participation).toBe("COMPLETED_PARTICIPANT");
      expect(resolution?.phase).toBe("COMPLETED");
      expect(resolution?.canReconnectMatch).toBe(false);
      expect(resolution?.hasActiveMatchParticipation).toBe(false);
    });

    it("returns null when user is not present in any room", () => {
      const resolution = roomManager.resolveUserRoomParticipation("non-existent-user");
      expect(resolution).toBeNull();
    });
  });

  describe("Multi-Room Disambiguation Rules", () => {
    it("strictly prefers higher-tier DISCONNECTED_PLAYER over SPECTATOR across rooms", () => {
      // Room A: Bob is a spectator
      const roomA = roomManager.createRoom(userAlice, "GHJKLM");
      roomManager.joinAsSpectator(roomA.roomCode, userBob);

      // Room B: Bob is a disconnected player
      const roomB = roomManager.createRoom(userCharlie, "HJKLMN");
      roomManager.joinAsPlayer(roomB.roomCode, userBob);
      roomManager.joinAsPlayer(roomB.roomCode, userDiana);
      roomManager.joinAsPlayer(roomB.roomCode, userEvan);
      roomManager.joinAsPlayer(roomB.roomCode, { id: "p5", username: "P5", avatarId: "barnaby" });
      roomManager.startMatch(roomB.roomCode, userCharlie.id);

      roomB.disconnectedPlayers.set(userBob.id, { deadline: Date.now() + 60_000, timer: setTimeout(() => {}, 60_000) as any });
      roomB.players.get(userBob.id)!.connected = false;

      // Precedence Rule: Tier 1 (DISCONNECTED_PLAYER) must beat Tier 4 (SPECTATOR)
      const resolution = roomManager.resolveUserRoomParticipation(userBob.id);
      expect(resolution).not.toBeNull();
      expect(resolution?.roomCode).toBe("HJKLMN");
      expect(resolution?.participation).toBe("DISCONNECTED_PLAYER");
      expect(resolution?.canReconnectMatch).toBe(true);
    });

    it("breaks ties deterministically using lexicographical roomId comparison", () => {
      // Create two rooms where Bob is WAITING_PLAYER
      const room1 = roomManager.createRoom(userAlice, "RM2222");
      roomManager.joinAsPlayer(room1.roomCode, userBob);

      const room2 = roomManager.createRoom(userCharlie, "RM3333");
      roomManager.joinAsPlayer(room2.roomCode, userBob);

      const resolution = roomManager.resolveUserRoomParticipation(userBob.id);
      expect(resolution).not.toBeNull();

      // Tie-breaker: lexicographical sort of roomId
      const expectedFirst = room1.roomId.localeCompare(room2.roomId) < 0 ? "RM2222" : "RM3333";
      expect(resolution?.roomCode).toBe(expectedFirst);
    });
  });

  describe("Single Recoverable Room Invariant Protection on Mutations", () => {
    let app: FastifyInstance;

    beforeEach(() => {
      app = buildServer({
        config: loadConfig({ NODE_ENV: "test" }),
        roomManager,
        authService: {
          getCurrentUser: async (id: string) => {
            if (id === userBob.id) return userBob;
            return userAlice;
          },
          getUserProfile: async (id: string) => {
            if (id === userBob.id) return userBob;
            return userAlice;
          }
        } as any,
        enableRateLimit: false
      });
    });

    it("rejects POST /api/rooms with 409 ACTIVE_MATCH_IN_PROGRESS if user has a recoverable match", async () => {
      // Setup active match with Bob disconnected
      const room = roomManager.createRoom(userAlice, "JKLMNP");
      roomManager.joinAsPlayer(room.roomCode, userBob);
      roomManager.joinAsPlayer(room.roomCode, userCharlie);
      roomManager.joinAsPlayer(room.roomCode, userDiana);
      roomManager.joinAsPlayer(room.roomCode, userEvan);
      roomManager.startMatch(room.roomCode, userAlice.id);
      room.disconnectedPlayers.set(userBob.id, { deadline: Date.now() + 60_000, timer: setTimeout(() => {}, 60_000) as any });
      room.players.get(userBob.id)!.connected = false;

      const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

      // Bob tries to create another room while his match is recoverable
      const res = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: `pageshooter_session=${bobToken}`,
          "x-pageshooter-client": "web",
          origin: "http://localhost:5173"
        }
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("ACTIVE_MATCH_IN_PROGRESS");
    });

    it("rejects POST /api/rooms/:code/join with 409 ACTIVE_MATCH_IN_PROGRESS if user has a recoverable match", async () => {
      // Setup active match with Bob disconnected
      const matchRoom = roomManager.createRoom(userAlice, "KLMNPQ");
      roomManager.joinAsPlayer(matchRoom.roomCode, userBob);
      roomManager.joinAsPlayer(matchRoom.roomCode, userCharlie);
      roomManager.joinAsPlayer(matchRoom.roomCode, userDiana);
      roomManager.joinAsPlayer(matchRoom.roomCode, userEvan);
      roomManager.startMatch(matchRoom.roomCode, userAlice.id);
      matchRoom.disconnectedPlayers.set(userBob.id, { deadline: Date.now() + 60_000, timer: setTimeout(() => {}, 60_000) as any });
      matchRoom.players.get(userBob.id)!.connected = false;

      // Other unstarted room
      const otherRoom = roomManager.createRoom(userCharlie, "LMNPQR");

      const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

      // Bob tries to join otherRoom
      const res = await app.inject({
        method: "POST",
        url: `/api/rooms/${otherRoom.roomCode}/join`,
        headers: {
          cookie: `pageshooter_session=${bobToken}`,
          "x-pageshooter-client": "web",
          origin: "http://localhost:5173"
        }
      });

      expect(res.statusCode).toBe(409);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("ACTIVE_MATCH_IN_PROGRESS");
    });

    it("GET /api/rooms/my-active returns activeRoom resolution payload", async () => {
      const room = roomManager.createRoom(userAlice, "MNPQRS");
      roomManager.joinAsPlayer(room.roomCode, userBob);

      const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

      const res = await app.inject({
        method: "GET",
        url: "/api/rooms/my-active",
        headers: {
          cookie: `pageshooter_session=${bobToken}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.activeRoom).toBeDefined();
      expect(body.activeRoom.roomCode).toBe("MNPQRS");
      expect(body.activeRoom.participation).toBe("WAITING_PLAYER");
      expect(body.activeRoom.hasActiveMatchParticipation).toBe(false);
    });

    describe("Finding F-06: Connected Active Player Single-Room Invariant Enforcement", () => {
      it("rejects POST /api/rooms with 409 ACTIVE_MATCH_IN_PROGRESS if user is a CONNECTED active player", async () => {
        // Setup active match where Bob is connected (not disconnected)
        const matchRoom = roomManager.createRoom(userAlice, "F6AA22");
        roomManager.joinAsPlayer(matchRoom.roomCode, userBob);
        roomManager.joinAsPlayer(matchRoom.roomCode, userCharlie);
        roomManager.joinAsPlayer(matchRoom.roomCode, userDiana);
        roomManager.joinAsPlayer(matchRoom.roomCode, userEvan);
        roomManager.startMatch(matchRoom.roomCode, userAlice.id);

        // Verify Bob's participation is CONNECTED_PLAYER with hasActiveMatchParticipation = true
        const bobRes = roomManager.resolveUserRoomParticipation(userBob.id);
        expect(bobRes?.participation).toBe("CONNECTED_PLAYER");
        expect(bobRes?.canReconnectMatch).toBe(false);
        expect(bobRes?.hasActiveMatchParticipation).toBe(true);

        const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

        // Bob attempts to create a new room from another tab while actively connected in matchRoom
        const res = await app.inject({
          method: "POST",
          url: "/api/rooms",
          headers: {
            cookie: `pageshooter_session=${bobToken}`,
            "x-pageshooter-client": "web",
            origin: "http://localhost:5173"
          }
        });

        expect(res.statusCode).toBe(409);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("ACTIVE_MATCH_IN_PROGRESS");
        expect(body.message).toContain("Cannot create a new room while an active match is in progress");
      });

      it("rejects POST /api/rooms/:code/join with 409 ACTIVE_MATCH_IN_PROGRESS if user is a CONNECTED active player", async () => {
        // Setup active match where Bob is connected
        const matchRoom = roomManager.createRoom(userAlice, "F6BB22");
        roomManager.joinAsPlayer(matchRoom.roomCode, userBob);
        roomManager.joinAsPlayer(matchRoom.roomCode, userCharlie);
        roomManager.joinAsPlayer(matchRoom.roomCode, userDiana);
        roomManager.joinAsPlayer(matchRoom.roomCode, userEvan);
        roomManager.startMatch(matchRoom.roomCode, userAlice.id);

        // Another waiting room created by Charlie (prior to joining or separate room)
        const otherRoom = roomManager.createRoom({ id: "usr-stranger", username: "Stranger", avatarId: "barnaby" }, "F6CC22");

        const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

        // Bob attempts to join otherRoom while actively participating in matchRoom
        const res = await app.inject({
          method: "POST",
          url: `/api/rooms/${otherRoom.roomCode}/join`,
          headers: {
            cookie: `pageshooter_session=${bobToken}`,
            "x-pageshooter-client": "web",
            origin: "http://localhost:5173"
          }
        });

        expect(res.statusCode).toBe(409);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("ACTIVE_MATCH_IN_PROGRESS");
        expect(body.message).toContain("Cannot join another room while an active match is in progress");
      });

      it("rejects POST /api/rooms/:code/spectate with 409 ACTIVE_MATCH_IN_PROGRESS if user is a CONNECTED active player", async () => {
        const matchRoom = roomManager.createRoom(userAlice, "F6DD22");
        roomManager.joinAsPlayer(matchRoom.roomCode, userBob);
        roomManager.joinAsPlayer(matchRoom.roomCode, userCharlie);
        roomManager.joinAsPlayer(matchRoom.roomCode, userDiana);
        roomManager.joinAsPlayer(matchRoom.roomCode, userEvan);
        roomManager.startMatch(matchRoom.roomCode, userAlice.id);

        const otherRoom = roomManager.createRoom({ id: "usr-stranger", username: "Stranger", avatarId: "barnaby" }, "F6EE22");

        const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

        // Bob attempts to spectate otherRoom while actively participating in matchRoom
        const res = await app.inject({
          method: "POST",
          url: `/api/rooms/${otherRoom.roomCode}/spectate`,
          headers: {
            cookie: `pageshooter_session=${bobToken}`,
            "x-pageshooter-client": "web",
            origin: "http://localhost:5173"
          }
        });

        expect(res.statusCode).toBe(409);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("ACTIVE_MATCH_IN_PROGRESS");
        expect(body.message).toContain("Cannot spectate another room while an active match is in progress");
      });

      it("rejects POST /api/rooms/:code/spectate with 409 ACTIVE_MATCH_IN_PROGRESS if user is a DISCONNECTED active player", async () => {
        const matchRoom = roomManager.createRoom(userAlice, "F6FF22");
        roomManager.joinAsPlayer(matchRoom.roomCode, userBob);
        roomManager.joinAsPlayer(matchRoom.roomCode, userCharlie);
        roomManager.joinAsPlayer(matchRoom.roomCode, userDiana);
        roomManager.joinAsPlayer(matchRoom.roomCode, userEvan);
        roomManager.startMatch(matchRoom.roomCode, userAlice.id);
        matchRoom.disconnectedPlayers.set(userBob.id, { deadline: Date.now() + 60_000, timer: setTimeout(() => {}, 60_000) as any });
        matchRoom.players.get(userBob.id)!.connected = false;

        const otherRoom = roomManager.createRoom({ id: "usr-stranger", username: "Stranger", avatarId: "barnaby" }, "F6GG22");

        const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

        const res = await app.inject({
          method: "POST",
          url: `/api/rooms/${otherRoom.roomCode}/spectate`,
          headers: {
            cookie: `pageshooter_session=${bobToken}`,
            "x-pageshooter-client": "web",
            origin: "http://localhost:5173"
          }
        });

        expect(res.statusCode).toBe(409);
        const body = JSON.parse(res.body);
        expect(body.error).toBe("ACTIVE_MATCH_IN_PROGRESS");
        expect(body.message).toContain("Cannot spectate another room while an active match is in progress");
      });

      it("allows an ELIMINATED player to join another room without 409 ACTIVE_MATCH_IN_PROGRESS", async () => {
        const matchRoom = roomManager.createRoom(userAlice, "F6HH22");
        roomManager.joinAsPlayer(matchRoom.roomCode, userBob);
        roomManager.joinAsPlayer(matchRoom.roomCode, userCharlie);
        roomManager.joinAsPlayer(matchRoom.roomCode, userDiana);
        roomManager.joinAsPlayer(matchRoom.roomCode, userEvan);
        roomManager.startMatch(matchRoom.roomCode, userAlice.id);

        // Eliminate Bob
        const bobInMatch = matchRoom.matchState?.players.find((p) => p.playerId === userBob.id);
        if (bobInMatch) {
          bobInMatch.status = "ELIMINATED";
        }

        const otherRoom = roomManager.createRoom({ id: "usr-stranger", username: "Stranger", avatarId: "barnaby" }, "F6JJ22");

        const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

        const res = await app.inject({
          method: "POST",
          url: `/api/rooms/${otherRoom.roomCode}/join`,
          headers: {
            cookie: `pageshooter_session=${bobToken}`,
            "x-pageshooter-client": "web",
            origin: "http://localhost:5173"
          }
        });

        // Should succeed (200) since eliminated player is no longer an active participant
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.room.roomCode).toBe("F6JJ22");
      });

      it("allows a SPECTATOR to join another room without 409 ACTIVE_MATCH_IN_PROGRESS", async () => {
        const waitingRoom = roomManager.createRoom(userAlice, "F6KK22");
        roomManager.joinAsSpectator(waitingRoom.roomCode, userBob);

        const otherRoom = roomManager.createRoom({ id: "usr-stranger", username: "Stranger", avatarId: "barnaby" }, "F6MM22");

        const bobToken = generateToken({ userId: userBob.id, username: userBob.username });

        const res = await app.inject({
          method: "POST",
          url: `/api/rooms/${otherRoom.roomCode}/join`,
          headers: {
            cookie: `pageshooter_session=${bobToken}`,
            "x-pageshooter-client": "web",
            origin: "http://localhost:5173"
          }
        });

        // Should succeed (200) since spectator has hasActiveMatchParticipation = false
        expect(res.statusCode).toBe(200);
        const body = JSON.parse(res.body);
        expect(body.room.roomCode).toBe("F6MM22");
      });
    });
  });
});
