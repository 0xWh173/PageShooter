import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import type { WSServerMessage, CellValue, MatchState } from "@pageshooter/shared";
import { CELL_VALUES } from "@pageshooter/shared";
import { buildServer } from "../src/server.js";
import { generateToken } from "../src/services/token.js";
import { RoomManager } from "../src/rooms/roomManager.js";
import { assertRollCommitmentValid } from "../../web/src/network/clientVerification.js";

class SimClient {
  public ws: WebSocket;
  public userId: string;
  public username: string;
  public lastMatchState: MatchState | null = null;
  public commitmentsByTurn = new Map<number, string>();
  private queue: WSServerMessage[] = [];
  private waiters: Array<{
    predicate: (msg: WSServerMessage) => boolean;
    resolve: (msg: WSServerMessage) => void;
  }> = [];

  constructor(ws: WebSocket, userId: string, username: string) {
    this.ws = ws;
    this.userId = userId;
    this.username = username;

    ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString()) as WSServerMessage;
        if (msg.type === "MATCH_STARTED") {
          this.lastMatchState = msg.matchState;
        } else if (msg.type === "MATCH_STATE_SYNC") {
          this.lastMatchState = msg.matchState;
        } else if (msg.type === "ROLL_COMMITMENT") {
          this.commitmentsByTurn.set(msg.turnNumber, msg.commitmentHash);
        }

        const idx = this.waiters.findIndex((w) => w.predicate(msg));
        if (idx !== -1) {
          const [w] = this.waiters.splice(idx, 1);
          w.resolve(msg);
        } else {
          this.queue.push(msg);
        }
      } catch {
        // Ignore
      }
    });
  }

  waitFor<T extends WSServerMessage["type"]>(
    type: T,
    timeoutMs = 5000
  ): Promise<Extract<WSServerMessage, { type: T }>> {
    const qIdx = this.queue.findIndex((m) => m.type === type);
    if (qIdx !== -1) {
      const [msg] = this.queue.splice(qIdx, 1);
      return Promise.resolve(msg as Extract<WSServerMessage, { type: T }>);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${this.username} timed out waiting for ${type}`));
      }, timeoutMs);
      this.waiters.push({
        predicate: (m) => m.type === type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m as Extract<WSServerMessage, { type: T }>);
        }
      });
    });
  }

  send(payload: object): void {
    this.ws.send(JSON.stringify(payload));
  }

  close(): void {
    try {
      this.ws.close(1000, "Done");
    } catch {
      // Ignore
    }
  }
}

async function connectSimClient(
  baseUrl: string,
  userId: string,
  username: string
): Promise<SimClient> {
  const token = generateToken({ userId, username });
  const ws = new WebSocket(baseUrl, {
    headers: {
      Origin: "http://localhost:5173",
      Cookie: `pageshooter_session=${token}`
    }
  });
  const client = new SimClient(ws, userId, username);
  await client.waitFor("AUTH_SUCCESS");
  return client;
}

describe("Phase 6.8: Multi-Client E2E Verification (10 Players + 2 Spectators)", () => {
  let app: Awaited<ReturnType<typeof buildServer>>;
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

  it("simulates a 10-player + 2-spectator match with commitment verification, spectator isolation, and turn execution", async () => {
    const clients: SimClient[] = [];
    const spectators: SimClient[] = [];

    try {
      // Connect 10 players and 2 spectators
      for (let i = 1; i <= 10; i++) {
        clients.push(
          await connectSimClient(
            wsBaseUrl,
            `00000000-0000-4000-8000-0000000000${String(i).padStart(2, "0")}`,
            `Scribe${i}`
          )
        );
      }
      for (let s = 1; s <= 2; s++) {
        spectators.push(
          await connectSimClient(
            wsBaseUrl,
            `00000000-0000-4000-9000-00000000000${s}`,
            `Spec${s}`
          )
        );
      }

      // Host creates room in RoomManager and everyone joins via WS
      const room = roomManager.createRoom({
        id: clients[0].userId,
        username: clients[0].username,
        avatarId: "barnaby"
      });
      const roomCode = room.roomCode;

      for (const c of clients) {
        c.send({ type: "JOIN_ROOM", correlationId: `j-${c.userId}`, roomCode });
        await c.waitFor("ROOM_SNAPSHOT");
      }
      for (const sp of spectators) {
        sp.send({ type: "JOIN_AS_SPECTATOR", correlationId: `js-${sp.userId}`, roomCode });
        await sp.waitFor("ROOM_SNAPSHOT");
      }

      expect(room.players.size).toBe(10);
      expect(room.spectators.size).toBe(2);

      // Host starts match
      clients[0].send({ type: "START_MATCH", correlationId: "start-1", roomCode });
      await Promise.all([
        ...clients.map((c) => c.waitFor("MATCH_STARTED")),
        ...spectators.map((sp) => sp.waitFor("MATCH_STARTED"))
      ]);
      await Promise.all([
        ...clients.map((c) => c.waitFor("ROLL_COMMITMENT")),
        ...spectators.map((sp) => sp.waitFor("ROLL_COMMITMENT"))
      ]);

      // Verify spectator cannot execute ROLL_REQUEST
      spectators[0].send({
        type: "ROLL_REQUEST",
        correlationId: "spec-roll",
        roomCode,
        expectedStateVersion: clients[0].lastMatchState!.version
      });
      const specErr = await spectators[0].waitFor("ERROR");
      expect(specErr.code).toBe("SPECTATOR_FORBIDDEN");

      // Execute 12 authoritative turns across the 10-player room, verifying every commitment
      for (let t = 0; t < 12; t++) {
        const state = clients[0].lastMatchState!;
        if (state.phase === "COMPLETED") break;

        const activeClient = clients.find((c) => c.userId === state.turn.currentPlayerId)!;
        expect(activeClient).toBeTruthy();

        activeClient.send({
          type: "ROLL_REQUEST",
          correlationId: `roll-${t}`,
          roomCode,
          expectedStateVersion: state.version
        });

        // All 10 players & 2 spectators receive ROLL_REVEALED and verify commitment
        const reveals = await Promise.all([
          ...clients.map((c) => c.waitFor("ROLL_REVEALED")),
          ...spectators.map((sp) => sp.waitFor("ROLL_REVEALED"))
        ]);

        for (const rev of reveals) {
          const commitmentHash = clients[0].commitmentsByTurn.get(rev.turnNumber)!;
          await expect(
            assertRollCommitmentValid(
              rev.seed,
              state.matchId,
              rev.turnNumber,
              commitmentHash,
              rev.outcome,
              rev.pageNumber
            )
          ).resolves.toBeUndefined();
        }

        await Promise.all([
          ...clients.map((c) => c.waitFor("MATCH_STATE_SYNC")),
          ...spectators.map((sp) => sp.waitFor("MATCH_STATE_SYNC"))
        ]);

        const postRollState = clients[0].lastMatchState!;
        if (postRollState.turn.phase === "AWAITING_SHOT" && postRollState.turn.pendingShot) {
          // Pick first valid opponent target cell
          const targetPlayer = postRollState.players.find(
            (p) => p.playerId !== activeClient.userId && p.status === "ACTIVE"
          )!;
          const targetCell = CELL_VALUES.find((v) => !targetPlayer.cells[v].destroyed) as CellValue;

          activeClient.send({
            type: "SHOOT_REQUEST",
            correlationId: `shoot-${t}`,
            roomCode,
            targetPlayerId: targetPlayer.playerId,
            targetCellValue: targetCell,
            expectedStateVersion: postRollState.version
          });

          await Promise.all([
            ...clients.map((c) => c.waitFor("MATCH_STATE_SYNC")),
            ...spectators.map((sp) => sp.waitFor("MATCH_STATE_SYNC"))
          ]);
        }

        if (clients[0].lastMatchState!.phase !== "COMPLETED") {
          await Promise.all([
            ...clients.map((c) => c.waitFor("ROLL_COMMITMENT")),
            ...spectators.map((sp) => sp.waitFor("ROLL_COMMITMENT"))
          ]);
        }
      }
    } finally {
      for (const c of [...clients, ...spectators]) c.close();
    }
  });

  it("verifies waiting-room host migration and active-match disconnect/reconnect recovery", async () => {
    const clients: SimClient[] = [];
    try {
      for (let i = 1; i <= 5; i++) {
        clients.push(
          await connectSimClient(
            wsBaseUrl,
            `00000000-0000-4000-7000-00000000000${i}`,
            `MigPlayer${i}`
          )
        );
      }

      const room = roomManager.createRoom({
        id: clients[0].userId,
        username: clients[0].username,
        avatarId: "barnaby"
      });
      const roomCode = room.roomCode;

      for (const c of clients) {
        c.send({ type: "JOIN_ROOM", correlationId: `mj-${c.userId}`, roomCode });
        await c.waitFor("ROOM_SNAPSHOT");
      }

      // Add a 6th player so 5 remain after host leaves
      const p6 = await connectSimClient(
        wsBaseUrl,
        "00000000-0000-4000-7000-000000000006",
        "MigPlayer6"
      );
      clients.push(p6);
      p6.send({ type: "JOIN_ROOM", correlationId: "mj-6", roomCode });
      await p6.waitFor("ROOM_SNAPSHOT");

      // Original host leaves -> MigPlayer2 (index 1) must become host
      clients[0].send({ type: "LEAVE_ROOM", correlationId: "leave-host", roomCode });
      const migrated = await clients[1].waitFor("HOST_MIGRATED");
      expect(migrated.newHostUserId).toBe(clients[1].userId);

      // Promoted host starts match
      clients[1].send({ type: "START_MATCH", correlationId: "start-mig", roomCode });
      await Promise.all(clients.slice(1).map((c) => c.waitFor("MATCH_STARTED")));

      // Player 3 disconnects unexpectedly -> MATCH_PAUSED
      clients[2].ws.terminate();
      const paused = await clients[1].waitFor("MATCH_PAUSED");
      expect(paused.disconnectedPlayerId).toBe(clients[2].userId);

      // Player 3 reconnects -> MATCH_RESUMED
      const reconnected = await connectSimClient(wsBaseUrl, clients[2].userId, clients[2].username);
      clients[2] = reconnected;
      reconnected.send({
        type: "RECONNECT_MATCH",
        correlationId: "rec-3",
        roomCode,
        lastKnownVersion: clients[1].lastMatchState!.version
      });
      await reconnected.waitFor("ROOM_SNAPSHOT");
      const resumed = await clients[1].waitFor("MATCH_RESUMED");
      expect(resumed.reconnectedPlayerId).toBe(clients[2].userId);
    } finally {
      for (const c of clients) c.close();
    }
  });
});
