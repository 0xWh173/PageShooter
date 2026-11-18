import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import type { WSServerMessage, CellValue } from "@pageshooter/shared";
import { buildServer } from "../src/server.js";
import { generateToken } from "../src/services/token.js";
import { RoomManager } from "../src/rooms/roomManager.js";
import {
  verifyRollCommitmentClient,
  assertRollCommitmentValid
} from "../../web/src/network/clientVerification.js";

class TestWSClient {
  public ws: WebSocket;
  private queue: WSServerMessage[] = [];
  private waiters: Array<{
    type: string;
    resolve: (msg: WSServerMessage) => void;
  }> = [];

  constructor(ws: WebSocket) {
    this.ws = ws;
    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSServerMessage;
        const waiterIdx = this.waiters.findIndex((w) => w.type === msg.type);
        if (waiterIdx !== -1) {
          const [waiter] = this.waiters.splice(waiterIdx, 1);
          waiter.resolve(msg);
        } else {
          this.queue.push(msg);
        }
      } catch {
        // Ignore unparseable frames
      }
    });
  }

  waitFor<T extends WSServerMessage["type"]>(
    type: T,
    timeoutMs = 3000
  ): Promise<Extract<WSServerMessage, { type: T }>> {
    const queuedIdx = this.queue.findIndex((m) => m.type === type);
    if (queuedIdx !== -1) {
      const [msg] = this.queue.splice(queuedIdx, 1);
      return Promise.resolve(msg as Extract<WSServerMessage, { type: T }>);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Timeout waiting for message type: ${type}`));
      }, timeoutMs);

      this.waiters.push({
        type,
        resolve: (msg) => {
          clearTimeout(timer);
          resolve(msg as Extract<WSServerMessage, { type: T }>);
        }
      });
    });
  }

  send(message: object): void {
    this.ws.send(JSON.stringify(message));
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Ignore
    }
  }
}

async function createWSClient(
  wsBaseUrl: string,
  userId: string,
  username: string
): Promise<TestWSClient> {
  const token = generateToken({ userId, username });
  const ws = new WebSocket(`${wsBaseUrl}?token=${token}`);
  const client = new TestWSClient(ws);
  await client.waitFor("AUTH_SUCCESS");
  return client;
}

describe("WebSocket Authoritative Gameplay & Commitment Verification (wsGameplay.test.ts)", () => {
  let app: ReturnType<typeof buildServer>;
  let roomManager: RoomManager;
  let wsBaseUrl: string;

  beforeAll(async () => {
    roomManager = new RoomManager();
    app = buildServer({
      enableRateLimit: false,
      enableSweepTimer: false,
      roomManager,
      dbHealthCheck: async () => ({ ok: true, latencyMs: 1 })
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    wsBaseUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("executes authoritative roll with cryptographic commitment and client verification", async () => {
    // Create room with 5 players
    const room = roomManager.createRoom({
      id: "u-p1",
      username: "Player1",
      avatarId: "barnaby"
    });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p2", username: "Player2", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p3", username: "Player3", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p4", username: "Player4", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p5", username: "Player5", avatarId: "barnaby" });

    // Connect all 5 players so we have a client for whichever player is chosen as P1
    const playerIds = ["u-p1", "u-p2", "u-p3", "u-p4", "u-p5"];
    const clients = new Map<string, TestWSClient>();

    for (const uid of playerIds) {
      const client = await createWSClient(wsBaseUrl, uid, `Player_${uid}`);
      clients.set(uid, client);
      client.send({ type: "JOIN_ROOM", correlationId: `c-join-${uid}`, roomCode: room.roomCode });
      await client.waitFor("ROOM_SNAPSHOT");
    }

    const hostClient = clients.get("u-p1")!;

    // 1. Host starts match with 5 players
    hostClient.send({ type: "START_MATCH", correlationId: "c-start", roomCode: room.roomCode });

    const matchStarted = await hostClient.waitFor("MATCH_STARTED");
    const initialCommitment = await hostClient.waitFor("ROLL_COMMITMENT");

    expect(matchStarted.matchState.phase).toBe("ACTIVE");
    expect(initialCommitment.turnNumber).toBe(1);
    expect(typeof initialCommitment.commitmentHash).toBe("string");

    const currentPlayerId = matchStarted.matchState.turn.currentPlayerId!;
    expect(currentPlayerId).toBeDefined();

    const activeClient = clients.get(currentPlayerId)!;
    const inactiveUserId = playerIds.find((id) => id !== currentPlayerId)!;
    const inactiveClient = clients.get(inactiveUserId)!;

    // 2. Non-active player attempts ROLL_REQUEST -> rejected with NOT_YOUR_TURN
    inactiveClient.send({
      type: "ROLL_REQUEST",
      correlationId: "c-wrong-turn",
      roomCode: room.roomCode,
      expectedStateVersion: matchStarted.matchState.version
    });
    const turnErr = await inactiveClient.waitFor("ERROR");
    expect(turnErr.code).toBe("NOT_YOUR_TURN");

    // 3. Current player sends stale state version -> rejected with STALE_STATE
    activeClient.send({
      type: "ROLL_REQUEST",
      correlationId: "c-stale",
      roomCode: room.roomCode,
      expectedStateVersion: matchStarted.matchState.version + 999
    });
    const staleErr = await activeClient.waitFor("ERROR");
    expect(staleErr.code).toBe("STALE_STATE");

    // 4. Current player executes valid ROLL_REQUEST
    activeClient.send({
      type: "ROLL_REQUEST",
      correlationId: "c-roll-ok",
      roomCode: room.roomCode,
      expectedStateVersion: matchStarted.matchState.version
    });

    const rollRevealed = await activeClient.waitFor("ROLL_REVEALED");
    const stateSync = await activeClient.waitFor("MATCH_STATE_SYNC");

    expect(rollRevealed.turnNumber).toBe(1);
    expect(rollRevealed.seed).toBeDefined();
    expect([0, 2, 4, 6, 8]).toContain(rollRevealed.outcome);
    expect(rollRevealed.pageNumber).toBeGreaterThanOrEqual(1);
    expect(rollRevealed.pageNumber).toBeLessThanOrEqual(500);

    // 5. Client performs cryptographic verification of revealed seed vs initial commitment
    const isValid = await verifyRollCommitmentClient(
      rollRevealed.seed,
      matchStarted.matchState.matchId,
      1,
      initialCommitment.commitmentHash,
      rollRevealed.outcome,
      rollRevealed.pageNumber
    );
    expect(isValid).toBe(true);

    // assertRollCommitmentValid resolves without error
    await expect(
      assertRollCommitmentValid(
        rollRevealed.seed,
        matchStarted.matchState.matchId,
        1,
        initialCommitment.commitmentHash,
        rollRevealed.outcome,
        rollRevealed.pageNumber
      )
    ).resolves.toBeUndefined();

    // 6. Tampering with seed or outcome causes assertRollCommitmentValid to throw
    await expect(
      assertRollCommitmentValid(
        "badseed" + rollRevealed.seed.slice(7),
        matchStarted.matchState.matchId,
        1,
        initialCommitment.commitmentHash,
        rollRevealed.outcome,
        rollRevealed.pageNumber
      )
    ).rejects.toThrow(/Cryptographic verification failed/);

    for (const c of clients.values()) {
      c.close();
    }
  });

  it("handles spectator gameplay rejection", async () => {
    const room = roomManager.createRoom({ id: "u-h-spec", username: "HSpec", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p2-s", username: "P2", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p3-s", username: "P3", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p4-s", username: "P4", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-p5-s", username: "P5", avatarId: "barnaby" });

    const host = await createWSClient(wsBaseUrl, "u-h-spec", "HSpec");
    const spec = await createWSClient(wsBaseUrl, "u-spec-watcher", "Watcher");

    host.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await host.waitFor("ROOM_SNAPSHOT");
    spec.send({ type: "JOIN_AS_SPECTATOR", correlationId: "c2", roomCode: room.roomCode });
    await spec.waitFor("ROOM_SNAPSHOT");

    host.send({ type: "START_MATCH", correlationId: "c-start", roomCode: room.roomCode });
    await host.waitFor("MATCH_STARTED");

    // Spectator attempts ROLL_REQUEST
    spec.send({
      type: "ROLL_REQUEST",
      correlationId: "c-spec-roll",
      roomCode: room.roomCode,
      expectedStateVersion: 0
    });

    const err = await spec.waitFor("ERROR");
    expect(err.code).toBe("SPECTATOR_FORBIDDEN");

    host.close();
    spec.close();
  });
});
