import { describe, it, expect } from "vitest";
import type { PublicRoomState, MatchState, RoomParticipant } from "@pageshooter/shared";
import {
  computeCommitmentWeb,
  deriveRollFromSeedWeb,
  verifyRollCommitmentClient,
  assertRollCommitmentValid
} from "../src/network/clientVerification.js";
import { SyncStore } from "../src/network/syncStore.js";
import { WebSocketClient } from "../src/network/websocketClient.js";

describe("Headless Web Client Transport & State Synchronization (networkClient.test.ts)", () => {
  describe("Cryptographic Roll Verification (clientVerification.ts)", () => {
    it("computes SHA-256 commitment and derives roll deterministically via Web Crypto", async () => {
      const seed = "abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890";
      const matchId = "match-test-uuid";
      const turnNumber = 1;

      const commitmentHash = await computeCommitmentWeb(seed, matchId, turnNumber);
      expect(typeof commitmentHash).toBe("string");
      expect(commitmentHash.length).toBe(64); // SHA-256 hex length

      const derived = await deriveRollFromSeedWeb(seed, matchId, turnNumber);
      expect([0, 2, 4, 6, 8]).toContain(derived.outcome);
      expect(derived.pageNumber).toBeGreaterThanOrEqual(1);
      expect(derived.pageNumber).toBeLessThanOrEqual(500);

      // Verify validation passes
      const isValid = await verifyRollCommitmentClient(
        seed,
        matchId,
        turnNumber,
        commitmentHash,
        derived.outcome,
        derived.pageNumber
      );
      expect(isValid).toBe(true);

      await expect(
        assertRollCommitmentValid(
          seed,
          matchId,
          turnNumber,
          commitmentHash,
          derived.outcome,
          derived.pageNumber
        )
      ).resolves.toBeUndefined();
    });

    it("rejects tampered seeds and corrupted outcomes with an explicit assertion failure", async () => {
      const seed = "1111111111111111111111111111111111111111111111111111111111111111";
      const matchId = "match-tamper-check";
      const turnNumber = 2;

      const commitmentHash = await computeCommitmentWeb(seed, matchId, turnNumber);
      const derived = await deriveRollFromSeedWeb(seed, matchId, turnNumber);

      // 1. Altered seed -> throws
      const forgedSeed = "2222222222222222222222222222222222222222222222222222222222222222";
      await expect(
        assertRollCommitmentValid(
          forgedSeed,
          matchId,
          turnNumber,
          commitmentHash,
          derived.outcome,
          derived.pageNumber
        )
      ).rejects.toThrow(/Cryptographic verification failed/);

      // 2. Corrupted outcome -> throws
      const corruptedOutcome = derived.outcome === 0 ? 2 : 0;
      await expect(
        assertRollCommitmentValid(
          seed,
          matchId,
          turnNumber,
          commitmentHash,
          corruptedOutcome,
          derived.pageNumber
        )
      ).rejects.toThrow(/Cryptographic verification failed/);
    });
  });

  describe("In-Memory State Synchronization Store (syncStore.ts)", () => {
    it("tracks room snapshot and participant updates", () => {
      const store = new SyncStore();
      expect(store.getState().room).toBeNull();

      const mockPlayer: RoomParticipant = {
        userId: "u1",
        username: "Alice",
        avatarId: "barnaby",
        role: "HOST",
        connected: true,
        socketId: "sock-1",
        joinSequence: 1,
        joinedAt: Date.now()
      };

      const mockSnapshot: PublicRoomState = {
        roomId: "rid-1",
        roomCode: "TESTCD",
        hostUserId: "u1",
        phase: "WAITING",
        players: [mockPlayer],
        spectators: [],
        playerCount: 1,
        spectatorCount: 0,
        createdAt: Date.now(),
        expiresAt: Date.now() + 600000
      };

      store.applyRoomSnapshot(mockSnapshot, "inst-boot-1");
      expect(store.getState().room?.roomCode).toBe("TESTCD");
      expect(store.getState().serverInstanceId).toBe("inst-boot-1");

      // Player join
      const p2: RoomParticipant = {
        userId: "u2",
        username: "Bob",
        avatarId: "barnaby",
        role: "PLAYER",
        connected: true,
        socketId: "sock-2",
        joinSequence: 2,
        joinedAt: Date.now()
      };
      store.applyPlayerJoined(p2);
      expect(store.getState().room?.playerCount).toBe(2);

      // Spectator join
      const s1: RoomParticipant = {
        userId: "u3",
        username: "Charlie",
        avatarId: "barnaby",
        role: "SPECTATOR",
        connected: true,
        socketId: "sock-3",
        joinSequence: 3,
        joinedAt: Date.now()
      };
      store.applySpectatorJoined(s1);
      expect(store.getState().room?.spectatorCount).toBe(1);

      // Host migration
      store.applyHostMigrated("u2", "HOST_LEFT");
      expect(store.getState().room?.hostUserId).toBe("u2");
    });

    it("verifies roll revelations against pre-received commitments during gameplay", async () => {
      const store = new SyncStore();
      const seed = "3333333333333333333333333333333333333333333333333333333333333333";
      const matchId = "m-sync-1";
      const turnNumber = 1;

      const commitmentHash = await computeCommitmentWeb(seed, matchId, turnNumber);
      const derived = await deriveRollFromSeedWeb(seed, matchId, turnNumber);

      const mockMatch = {
        matchId,
        roomId: "r1",
        phase: "ACTIVE" as const,
        players: [],
        spectators: [],
        turn: {
          currentPlayerId: "u1",
          turnNumber: 1,
          phase: "AWAITING_ROLL" as const,
          rolledCell: null,
          pendingShot: false
        },
        winnerPlayerId: null,
        startedAt: Date.now(),
        completedAt: null,
        totalTurns: 0,
        version: 1
      };

      store.applyMatchStarted(mockMatch);
      store.applyCommitment(turnNumber, commitmentHash);

      // Valid reveal -> verification passes
      await expect(
        store.applyRollRevealed(turnNumber, derived.outcome, derived.pageNumber, seed)
      ).resolves.toBeUndefined();

      // Tampered reveal -> throws error and records verification error
      await expect(
        store.applyRollRevealed(turnNumber, derived.outcome, derived.pageNumber, "forged_seed_value_here")
      ).rejects.toThrow();

      expect(store.getState().verificationErrors.length).toBeGreaterThan(0);
    });

    it("wipes match state replica upon server restart or match termination", () => {
      const store = new SyncStore();
      store.applyRoomSnapshot(
        {
          roomId: "r1",
          roomCode: "WIPE01",
          hostUserId: "u1",
          phase: "ACTIVE",
          players: [],
          spectators: [],
          playerCount: 0,
          spectatorCount: 0,
          createdAt: Date.now(),
          expiresAt: null
        },
        "inst-old"
      );

      expect(store.getState().room).not.toBeNull();

      // Apply server restart termination
      store.applyMatchTerminated("Game server restarted");
      expect(store.getState().match).toBeNull();
      expect(store.getState().room).toBeNull();
      expect(store.getState().matchTerminatedReason).toBe("Game server restarted");
    });
  });

  describe("Headless WebSocketClient dispatching", () => {
    it("instantiates cleanly and generates typed command payloads", () => {
      const client = new WebSocketClient({
        url: "ws://localhost:9999/ws",
        token: "test.jwt.token"
      });

      expect(client.isConnected).toBe(false);
      expect(client.syncStore).toBeDefined();

      // Ensure convenience action methods throw expected error when socket is not open
      expect(() => client.joinRoom("CODE01")).toThrow(/WebSocket is not open/);
      expect(() => client.roll("CODE01", 1)).toThrow(/WebSocket is not open/);
      expect(() => client.shoot("CODE01", "target", 0, 1)).toThrow(/WebSocket is not open/);
      expect(() => client.sendChat("CODE01", "hello")).toThrow(/WebSocket is not open/);
      expect(() => client.sendEmoji("CODE01", "thumb")).toThrow(/WebSocket is not open/);

      client.disconnect();
    });
  });
});
