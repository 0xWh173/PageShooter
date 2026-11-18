import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import {
  type CellValue,
  CELL_VALUES,
  COMPLETED_ROOM_TTL_MS
} from "@pageshooter/shared";
import { RoomManager, sanitizeRoom } from "../src/rooms/roomManager.js";
import {
  generateSecretSeed,
  computeCommitment,
  deriveRollFromSeed,
  verifyRollCommitment
} from "../src/game/commitment.js";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { generateToken } from "../src/services/token.js";

describe("Phase 6.5: Authoritative Turn Execution & Game Engine Synchronization", () => {
  describe("Cryptographic Commitment-Reveal Protocol (Section 10)", () => {
    it("generates 256-bit (64 hex char) cryptographically secure secret seeds", () => {
      const seed1 = generateSecretSeed();
      const seed2 = generateSecretSeed();
      expect(seed1).toHaveLength(64);
      expect(seed2).toHaveLength(64);
      expect(seed1).not.toBe(seed2);
      expect(/^[0-9a-f]{64}$/.test(seed1)).toBe(true);
    });

    it("computes deterministic SHA-256 hash commitments", () => {
      const seed = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const matchId = "11111111-1111-1111-1111-111111111111";
      const turnNumber = 1;

      const hash1 = computeCommitment(seed, matchId, turnNumber);
      const hash2 = computeCommitment(seed, matchId, turnNumber);
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64);

      // Different turn number produces different commitment
      const hashTurn2 = computeCommitment(seed, matchId, 2);
      expect(hashTurn2).not.toBe(hash1);
    });

    it("derives deterministic outcome and page number from seed, matchId, and turnNumber", () => {
      const seed = generateSecretSeed();
      const matchId = "22222222-2222-2222-2222-222222222222";
      const turn = 3;

      const roll1 = deriveRollFromSeed(seed, matchId, turn);
      const roll2 = deriveRollFromSeed(seed, matchId, turn);

      expect(roll1.outcome).toBe(roll2.outcome);
      expect(roll1.pageNumber).toBe(roll2.pageNumber);
      expect([0, 2, 4, 6, 8]).toContain(roll1.outcome);
      expect(roll1.pageNumber % 10).toBe(roll1.outcome);
      expect(roll1.pageNumber).toBeGreaterThanOrEqual(1);
      expect(roll1.pageNumber).toBeLessThanOrEqual(500);
    });

    it("verifies roll commitment proof strictly and rejects tampered proofs", () => {
      const seed = generateSecretSeed();
      const matchId = "33333333-3333-3333-3333-333333333333";
      const turnNumber = 5;

      const commitmentHash = computeCommitment(seed, matchId, turnNumber);
      const { outcome, pageNumber } = deriveRollFromSeed(seed, matchId, turnNumber);

      // Valid verification
      expect(verifyRollCommitment(seed, matchId, turnNumber, commitmentHash, outcome, pageNumber)).toBe(true);

      // Tampered seed fails
      const fakeSeed = generateSecretSeed();
      expect(verifyRollCommitment(fakeSeed, matchId, turnNumber, commitmentHash, outcome, pageNumber)).toBe(false);

      // Tampered turn number fails
      expect(verifyRollCommitment(seed, matchId, turnNumber + 1, commitmentHash, outcome, pageNumber)).toBe(false);

      // Tampered outcome fails
      const wrongOutcome = ((outcome + 2) % 10) as CellValue;
      expect(verifyRollCommitment(seed, matchId, turnNumber, commitmentHash, wrongOutcome, pageNumber)).toBe(false);

      // Tampered page fails
      expect(verifyRollCommitment(seed, matchId, turnNumber, commitmentHash, outcome, pageNumber === 500 ? 490 : pageNumber + 10)).toBe(false);
    });

    it("statistically verifies uniform 20% distribution over 50,000 rolls", () => {
      const counts: Record<CellValue, number> = { 0: 0, 2: 0, 4: 0, 6: 0, 8: 0 };
      const total = 50000;
      const seed = generateSecretSeed();
      const matchId = "44444444-4444-4444-4444-444444444444";

      for (let t = 1; t <= total; t++) {
        const { outcome, pageNumber } = deriveRollFromSeed(seed, matchId, t);
        counts[outcome]++;
        expect(pageNumber % 10).toBe(outcome);
      }

      for (const val of [0, 2, 4, 6, 8] as CellValue[]) {
        const proportion = counts[val] / total;
        // 20% +/- 1.0%
        expect(proportion).toBeGreaterThan(0.19);
        expect(proportion).toBeLessThan(0.21);
      }
    });
  });

  describe("RoomManager Turn Execution & Lifecycle (ADR-01 & ADR-02)", () => {
    let roomManager: RoomManager;

    const mockPlayers = [
      { id: "10000000-0000-0000-0000-000000000001", username: "Player1", avatarId: "barnaby" },
      { id: "10000000-0000-0000-0000-000000000002", username: "Player2", avatarId: "clara" },
      { id: "10000000-0000-0000-0000-000000000003", username: "Player3", avatarId: "dexter" },
      { id: "10000000-0000-0000-0000-000000000004", username: "Player4", avatarId: "fiona" },
      { id: "10000000-0000-0000-0000-000000000005", username: "Player5", avatarId: "gideon" }
    ];

    const mockSpectator = {
      id: "90000000-0000-0000-0000-000000000099",
      username: "SpectatorUser",
      avatarId: "spectator"
    };

    beforeEach(() => {
      roomManager = new RoomManager();
    });

    it("rejects starting match when player count is below minimum (MIN_PLAYERS = 5)", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      // Only 1 player
      expect(() => roomManager.startMatch(room.roomCode, mockPlayers[0].id)).toThrowError(
        expect.objectContaining({ code: "NOT_ENOUGH_PLAYERS", statusCode: 400 })
      );

      // Add up to 4 players
      roomManager.joinAsPlayer(room.roomCode, mockPlayers[1]);
      roomManager.joinAsPlayer(room.roomCode, mockPlayers[2]);
      roomManager.joinAsPlayer(room.roomCode, mockPlayers[3]);
      expect(() => roomManager.startMatch(room.roomCode, mockPlayers[0].id)).toThrowError(
        expect.objectContaining({ code: "NOT_ENOUGH_PLAYERS", statusCode: 400 })
      );
    });

    it("rejects non-host from starting match", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }

      expect(() => roomManager.startMatch(room.roomCode, mockPlayers[1].id)).toThrowError(
        expect.objectContaining({ code: "NOT_HOST", statusCode: 403 })
      );
    });

    it("successfully starts match with 5 players: sets ACTIVE, expiresAt=null, shuffles turn order, generates commitment", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }

      const result = roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      expect(result.room.phase).toBe("ACTIVE");
      expect(result.room.expiresAt).toBeNull(); // Active rooms never expire by timer
      expect(result.matchState).toBeDefined();
      expect(result.matchState.players).toHaveLength(5);
      // Players array contains all 5 players assigned positions P1..P5
      expect(result.matchState.players.map((p) => p.position)).toEqual(["P1", "P2", "P3", "P4", "P5"]);
      expect(result.matchState.turn.turnNumber).toBe(1);
      expect(result.matchState.turn.phase).toBe("AWAITING_ROLL");
      expect(result.commitment).toBeDefined();
      expect(result.commitment.turnNumber).toBe(1);
      expect(result.commitment.commitmentHash).toHaveLength(64);

      // Secret seed is hidden from public room state
      const publicRoom = sanitizeRoom(result.room);
      expect(publicRoom.phase).toBe("ACTIVE");
      expect(publicRoom.match).toBeDefined();
      expect(publicRoom.currentCommitment).toEqual(result.commitment);
      expect((publicRoom as any).currentTurnCommitment).toBeUndefined();
    });

    it("rejects out-of-turn roll commands with NOT_YOUR_TURN", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      const startResult = roomManager.startMatch(room.roomCode, mockPlayers[0].id);
      const activePlayerId = startResult.matchState.turn.currentPlayerId;

      // Find a player whose turn it is NOT
      const wrongPlayer = mockPlayers.find((p) => p.id !== activePlayerId)!;

      expect(() => roomManager.executeRoll(room.roomCode, wrongPlayer.id)).toThrowError(
        expect.objectContaining({ code: "NOT_YOUR_TURN", statusCode: 400 })
      );
    });

    it("rejects spectators from executing roll or shoot commands (zero gameplay authority)", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.joinAsSpectator(room.roomCode, mockSpectator);

      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      expect(() => roomManager.executeRoll(room.roomCode, mockSpectator.id)).toThrowError(
        expect.objectContaining({ code: "SPECTATOR_FORBIDDEN", statusCode: 403 })
      );

      expect(() =>
        roomManager.executeShot(room.roomCode, mockSpectator.id, mockPlayers[1].id, 0)
      ).toThrowError(expect.objectContaining({ code: "SPECTATOR_FORBIDDEN", statusCode: 403 }));
    });

    it("rejects non-participants from executing gameplay commands", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      const outsiderId = "88888888-8888-8888-8888-888888888888";
      expect(() => roomManager.executeRoll(room.roomCode, outsiderId)).toThrowError(
        expect.objectContaining({ code: "NOT_A_PLAYER", statusCode: 403 })
      );
    });

    it("executes valid roll: reveals seed, updates match state, and advances turn", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      const startResult = roomManager.startMatch(room.roomCode, mockPlayers[0].id);
      const activePlayerId = startResult.matchState.turn.currentPlayerId;

      const rollResult = roomManager.executeRoll(room.roomCode, activePlayerId);

      expect(rollResult.rollResult.turnNumber).toBe(1);
      expect(rollResult.rollResult.seed).toHaveLength(64);
      expect(rollResult.rollResult.commitmentHash).toBe(startResult.commitment.commitmentHash);
      expect([0, 2, 4, 6, 8]).toContain(rollResult.rollResult.outcome);

      // Verify that the revealed roll matches cryptographic proof
      const isValidProof = verifyRollCommitment(
        rollResult.rollResult.seed,
        rollResult.state.matchId,
        1,
        rollResult.rollResult.commitmentHash,
        rollResult.rollResult.outcome,
        rollResult.rollResult.pageNumber
      );
      expect(isValidProof).toBe(true);

      // State version incremented (starts at 1 in createInitialMatchState, becomes 2 after roll)
      expect(rollResult.state.version).toBe(2);
    });

    it("rejects roll commands when stateVersion is stale or commandId is duplicated", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      const startResult = roomManager.startMatch(room.roomCode, mockPlayers[0].id);
      const activePlayerId = startResult.matchState.turn.currentPlayerId;

      // Stale state version rejected (current is 1, expected 999)
      expect(() =>
        roomManager.executeRoll(room.roomCode, activePlayerId, {
          expectedStateVersion: 999
        })
      ).toThrowError(expect.objectContaining({ code: "STALE_STATE", statusCode: 409 }));

      // First call with commandId succeeds
      const roll1 = roomManager.executeRoll(room.roomCode, activePlayerId, {
        commandId: "cmd-uuid-1",
        expectedStateVersion: 1
      });

      // Second call with duplicate commandId rejected
      const nextPlayerId = roll1.state.turn.currentPlayerId;
      expect(() =>
        roomManager.executeRoll(room.roomCode, nextPlayerId, {
          commandId: "cmd-uuid-1"
        })
      ).toThrowError(expect.objectContaining({ code: "DUPLICATE_COMMAND", statusCode: 409 }));
    });
  });

  describe("End-to-End Game Engine Invariants (Progression, Shooting, Elimination, Victory)", () => {
    let roomManager: RoomManager;

    const mockPlayers = [
      { id: "20000000-0000-0000-0000-000000000001", username: "P1", avatarId: "barnaby" },
      { id: "20000000-0000-0000-0000-000000000002", username: "P2", avatarId: "clara" },
      { id: "20000000-0000-0000-0000-000000000003", username: "P3", avatarId: "dexter" },
      { id: "20000000-0000-0000-0000-000000000004", username: "P4", avatarId: "fiona" },
      { id: "20000000-0000-0000-0000-000000000005", username: "P5", avatarId: "gideon" }
    ];

    beforeEach(() => {
      roomManager = new RoomManager();
    });

    it("strictly follows progression: Empty -> Face -> Body -> Legs -> Arms -> Gun -> mandatory immediate shot on 6th match", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      const p1 = room.matchState!.players[0];
      const p1Id = p1.playerId;

      // Simulate step-by-step matching rolls on cell 0 for p1
      // Roll 1: Face (progress 1)
      p1.cells[0].progress = 1;
      expect(p1.cells[0].progress).toBe(1);

      // Roll 2: Body (progress 2)
      p1.cells[0].progress = 2;
      expect(p1.cells[0].progress).toBe(2);

      // Roll 3: Legs (progress 3)
      p1.cells[0].progress = 3;
      expect(p1.cells[0].progress).toBe(3);

      // Roll 4: Arms (progress 4)
      p1.cells[0].progress = 4;
      expect(p1.cells[0].progress).toBe(4);

      // Roll 5: Gun created (progress 5, hasGun true, does not shoot)
      p1.cells[0].progress = 5;
      p1.cells[0].hasGun = true;
      expect(p1.cells[0].progress).toBe(5);
      expect(p1.cells[0].hasGun).toBe(true);

      // Roll 6: 6th matching roll triggers immediate shot entitlement
      room.matchState!.turn.currentPlayerId = p1Id;
      room.matchState!.turn.phase = "AWAITING_SHOT";
      room.matchState!.turn.pendingShot = true;

      // Shooter cannot target their own column
      expect(() =>
        roomManager.executeShot(room.roomCode, p1Id, p1Id, 0)
      ).toThrowError(expect.objectContaining({ code: "INVALID_TARGET", statusCode: 400 }));

      // Shooter targets opponent (p2) cell 0
      const opponent = room.matchState!.players[1];
      const opponentId = opponent.playerId;
      const shotResult = roomManager.executeShot(room.roomCode, p1Id, opponentId, 0);

      const targetPlayer = shotResult.state.players.find((p) => p.playerId === opponentId)!;
      expect(targetPlayer.cells[0].destroyed).toBe(true);

      const shooter = shotResult.state.players.find((p) => p.playerId === p1Id)!;
      expect(shooter.kills).toBe(1); // Kill incremented

      // Turn advanced to next active player
      expect(shotResult.state.turn.phase).toBe("AWAITING_ROLL");
      expect(shotResult.state.turn.pendingShot).toBe(false);
      expect(shotResult.nextCommitment).toBeDefined();
    });

    it("eliminates player when all 5 cells are destroyed and declares LAST_PLAYER_STANDING victory", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      const p1Id = room.matchState!.players[0].playerId;
      const p2Id = room.matchState!.players[1].playerId;

      // Mark all players except p1 and p2 as eliminated
      for (let i = 2; i < 5; i++) {
        const p = room.matchState!.players[i];
        p.status = "ELIMINATED";
        for (const c of CELL_VALUES) {
          p.cells[c].destroyed = true;
        }
      }

      // Mark p2's cells 0, 2, 4, 6 as already destroyed, leaving only cell 8
      const p2 = room.matchState!.players.find((pl) => pl.playerId === p2Id)!;
      for (const c of [0, 2, 4, 6] as CellValue[]) {
        p2.cells[c].destroyed = true;
      }
      expect(p2.status).toBe("ACTIVE");

      // Setup p1 to shoot p2's final cell (8)
      room.matchState!.turn.currentPlayerId = p1Id;
      room.matchState!.turn.phase = "AWAITING_SHOT";
      room.matchState!.turn.pendingShot = true;
      const p1 = room.matchState!.players.find((pl) => pl.playerId === p1Id)!;
      p1.cells[0].progress = 5;
      p1.cells[0].hasGun = true;

      // Execute winning shot
      const shotResult = roomManager.executeShot(room.roomCode, p1Id, p2Id, 8);

      const targetPlayer = shotResult.state.players.find((pl) => pl.playerId === p2Id)!;
      expect(targetPlayer.cells[8].destroyed).toBe(true);
      expect(targetPlayer.status).toBe("ELIMINATED");

      // Match completes with LAST_PLAYER_STANDING
      expect(shotResult.state.phase).toBe("COMPLETED");
      expect(shotResult.state.winnerPlayerId).toBe(p1Id);
      expect(shotResult.state.winReason).toBe("LAST_PLAYER_STANDING");
      expect(room.phase).toBe("COMPLETED");
      expect(room.expiresAt).toBeGreaterThan(Date.now()); // 10-minute TTL set
      expect(shotResult.nextCommitment).toBeNull();
    });

    it("triggers immediate victory when a shot is awarded but NO_VALID_TARGETS remain", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      const p1Id = room.matchState!.players[0].playerId;

      // Mark all opponent cells destroyed
      for (let i = 1; i < 5; i++) {
        const opp = room.matchState!.players[i];
        opp.status = "ELIMINATED";
        for (const c of CELL_VALUES) {
          opp.cells[c].destroyed = true;
        }
      }

      // Configure p1 with cell 0 at stage 5
      const p1 = room.matchState!.players.find((pl) => pl.playerId === p1Id)!;
      p1.cells[0].progress = 5;
      p1.cells[0].hasGun = true;

      // Force room commitment to derive outcome 0 for turn
      room.matchState!.turn.currentPlayerId = p1Id;
      room.matchState!.turn.phase = "AWAITING_ROLL";

      // Mock commitment derivation to guarantee outcome 0
      const turnNum = room.matchState!.turn.turnNumber;
      // Find a seed that derives outcome 0
      let seed = generateSecretSeed();
      while (deriveRollFromSeed(seed, room.matchState!.matchId, turnNum).outcome !== 0) {
        seed = generateSecretSeed();
      }
      room.currentTurnCommitment = {
        turnNumber: turnNum,
        seed,
        commitmentHash: computeCommitment(seed, room.matchState!.matchId, turnNum)
      };

      // Execute roll: since no opponent cells remain, engine immediately awards victory!
      const rollResult = roomManager.executeRoll(room.roomCode, p1Id);

      expect(rollResult.state.phase).toBe("COMPLETED");
      expect(rollResult.state.winnerPlayerId).toBe(p1Id);
      expect(rollResult.state.winReason).toBe("NO_VALID_TARGETS");
      expect(room.phase).toBe("COMPLETED");
    });

    it("advances turn without progression when rolling on an already destroyed cell (TURN_WASTED)", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      const p1 = room.matchState!.players[0];
      const p1Id = p1.playerId;
      p1.cells[0].destroyed = true;

      // Force outcome 0
      const turnNum = room.matchState!.turn.turnNumber;
      let seed = generateSecretSeed();
      while (deriveRollFromSeed(seed, room.matchState!.matchId, turnNum).outcome !== 0) {
        seed = generateSecretSeed();
      }
      room.currentTurnCommitment = {
        turnNumber: turnNum,
        seed,
        commitmentHash: computeCommitment(seed, room.matchState!.matchId, turnNum)
      };

      const result = roomManager.executeRoll(room.roomCode, p1Id);
      expect(result.events.some((e) => e.type === "TURN_WASTED")).toBe(true);
      expect(result.state.turn.currentPlayerId).not.toBe(p1Id);
    });

    it("rejects invalid shot targets (already destroyed cell, eliminated player)", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      const p1 = room.matchState!.players[0];
      const p2 = room.matchState!.players[1];
      const p3 = room.matchState!.players[2];

      room.matchState!.turn.currentPlayerId = p1.playerId;
      room.matchState!.turn.phase = "AWAITING_SHOT";
      room.matchState!.turn.pendingShot = true;
      p1.cells[0].progress = 5;
      p1.cells[0].hasGun = true;

      // Target cell 0 on p2 destroyed already
      p2.cells[0].destroyed = true;
      expect(() =>
        roomManager.executeShot(room.roomCode, p1.playerId, p2.playerId, 0)
      ).toThrowError(expect.objectContaining({ code: "CELL_DESTROYED", statusCode: 400 }));

      // Target eliminated player p3
      p3.status = "ELIMINATED";
      expect(() =>
        roomManager.executeShot(room.roomCode, p1.playerId, p3.playerId, 2)
      ).toThrowError(expect.objectContaining({ code: "INVALID_TARGET", statusCode: 400 }));
    });

    it("rejects rolls and shots when match is completed", () => {
      const room = roomManager.createRoom(mockPlayers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockPlayers[i]);
      }
      roomManager.startMatch(room.roomCode, mockPlayers[0].id);

      room.phase = "COMPLETED";
      room.matchState!.phase = "COMPLETED";

      expect(() => roomManager.executeRoll(room.roomCode, mockPlayers[0].id)).toThrowError(
        expect.objectContaining({ code: "MATCH_NOT_ACTIVE", statusCode: 400 })
      );

      expect(() =>
        roomManager.executeShot(room.roomCode, mockPlayers[0].id, mockPlayers[1].id, 0)
      ).toThrowError(expect.objectContaining({ code: "MATCH_NOT_ACTIVE", statusCode: 400 }));
    });
  });

  describe("Fastify REST Endpoints for Match Execution (/api/rooms)", () => {
    let app: FastifyInstance | null = null;
    let roomManager: RoomManager;

    const mockUsers = [
      { id: "30000000-0000-0000-0000-000000000001", username: "Alice", avatarId: "barnaby" },
      { id: "30000000-0000-0000-0000-000000000002", username: "Bob", avatarId: "clara" },
      { id: "30000000-0000-0000-0000-000000000003", username: "Charlie", avatarId: "dexter" },
      { id: "30000000-0000-0000-0000-000000000004", username: "Diana", avatarId: "fiona" },
      { id: "30000000-0000-0000-0000-000000000005", username: "Edward", avatarId: "gideon" }
    ];

    const tokens = mockUsers.map((u) => generateToken({ userId: u.id, username: u.username }));

    const mockAuthService = {
      getCurrentUser: async (userId: string) => {
        const found = mockUsers.find((u) => u.id === userId);
        if (found) {
          return { ...found, email: `${found.username.toLowerCase()}@test.local`, createdAt: new Date(), usernameUpdatedAt: new Date() };
        }
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

    it("POST /api/rooms/:roomCode/start starts match with 5 players", async () => {
      const room = roomManager.createRoom(mockUsers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockUsers[i]);
      }

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/start`,
        headers: {
          authorization: `Bearer ${tokens[0]}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.room.phase).toBe("ACTIVE");
      expect(body.match).toBeDefined();
      expect(body.match.players).toHaveLength(5);
      expect(body.currentCommitment).toBeDefined();
      expect(body.currentCommitment.turnNumber).toBe(1);
    });

    it("GET /api/rooms/:roomCode/match returns active match and commitment", async () => {
      const room = roomManager.createRoom(mockUsers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockUsers[i]);
      }
      roomManager.startMatch(room.roomCode, mockUsers[0].id);

      const res = await app!.inject({
        method: "GET",
        url: `/api/rooms/${room.roomCode}/match`,
        headers: {
          authorization: `Bearer ${tokens[1]}`
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.state.turn.turnNumber).toBe(1);
      expect(body.currentCommitment.commitmentHash).toHaveLength(64);
    });

    it("POST /api/rooms/:roomCode/roll executes roll for current player", async () => {
      const room = roomManager.createRoom(mockUsers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockUsers[i]);
      }
      const startResult = roomManager.startMatch(room.roomCode, mockUsers[0].id);
      const activePlayerId = startResult.matchState.turn.currentPlayerId;
      const activeUserIndex = mockUsers.findIndex((u) => u.id === activePlayerId);

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/roll`,
        headers: {
          authorization: `Bearer ${tokens[activeUserIndex]}`
        },
        payload: {
          expectedStateVersion: 1,
          commandId: "client-cmd-1"
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.rollResult.seed).toHaveLength(64);
      expect(body.rollResult.turnNumber).toBe(1);
      expect(body.state.version).toBe(2);
      expect(body.events.length).toBeGreaterThan(0);
    });

    it("POST /api/rooms/:roomCode/verify-roll confirms valid commitment proof", async () => {
      const room = roomManager.createRoom(mockUsers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockUsers[i]);
      }
      const startResult = roomManager.startMatch(room.roomCode, mockUsers[0].id);
      const activePlayerId = startResult.matchState.turn.currentPlayerId;

      const rollResult = roomManager.executeRoll(room.roomCode, activePlayerId);

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/verify-roll`,
        headers: {
          authorization: `Bearer ${tokens[0]}`
        },
        payload: {
          seed: rollResult.rollResult.seed,
          matchId: rollResult.state.matchId,
          turnNumber: rollResult.rollResult.turnNumber,
          commitmentHash: rollResult.rollResult.commitmentHash,
          outcome: rollResult.rollResult.outcome,
          pageNumber: rollResult.rollResult.pageNumber
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(true);
    });

    it("POST /api/rooms/:roomCode/shoot executes shot during AWAITING_SHOT", async () => {
      const room = roomManager.createRoom(mockUsers[0]);
      for (let i = 1; i < 5; i++) {
        roomManager.joinAsPlayer(room.roomCode, mockUsers[i]);
      }
      roomManager.startMatch(room.roomCode, mockUsers[0].id);

      const p1 = room.matchState!.players[0];
      const p2 = room.matchState!.players[1];
      const p1Index = mockUsers.findIndex((u) => u.id === p1.playerId);

      // Force state to AWAITING_SHOT for p1
      room.matchState!.turn.currentPlayerId = p1.playerId;
      room.matchState!.turn.phase = "AWAITING_SHOT";
      room.matchState!.turn.pendingShot = true;
      p1.cells[0].progress = 5;
      p1.cells[0].hasGun = true;

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/shoot`,
        headers: {
          authorization: `Bearer ${tokens[p1Index]}`
        },
        payload: {
          targetUserId: p2.playerId,
          targetCellValue: 0
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      const targetInBody = body.state.players.find((p: any) => p.playerId === p2.playerId);
      expect(targetInBody.cells[0].destroyed).toBe(true);
    });

    it("GET /api/rooms/:roomCode/match returns 404 when match has not started", async () => {
      const room = roomManager.createRoom(mockUsers[0]);

      const res = await app!.inject({
        method: "GET",
        url: `/api/rooms/${room.roomCode}/match`,
        headers: {
          authorization: `Bearer ${tokens[0]}`
        }
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("MATCH_NOT_STARTED");
    });

    it("POST /api/rooms/:roomCode/verify-roll returns valid=false when proof is invalid", async () => {
      const room = roomManager.createRoom(mockUsers[0]);

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/verify-roll`,
        headers: {
          authorization: `Bearer ${tokens[0]}`
        },
        payload: {
          seed: "a".repeat(64),
          matchId: "30000000-0000-0000-0000-000000000001",
          turnNumber: 1,
          commitmentHash: "b".repeat(64),
          outcome: 0,
          pageNumber: 10
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.valid).toBe(false);
    });

    it("POST /api/rooms/:roomCode/shoot returns 400 for invalid body schema", async () => {
      const room = roomManager.createRoom(mockUsers[0]);

      const res = await app!.inject({
        method: "POST",
        url: `/api/rooms/${room.roomCode}/shoot`,
        headers: {
          authorization: `Bearer ${tokens[0]}`
        },
        payload: {
          targetUserId: "not-a-uuid",
          targetCellValue: 3 // invalid cell value (must be 0, 2, 4, 6, 8)
        }
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("VALIDATION_ERROR");
    });
  });
});
