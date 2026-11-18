import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import {
  WS_CLOSE_CODE_SESSION_SUPERSEDED,
  type WSServerMessage,
  type CellValue
} from "@pageshooter/shared";
import { buildServer } from "../src/server.js";
import { generateToken } from "../src/services/token.js";
import { RoomManager } from "../src/rooms/roomManager.js";

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
): Promise<{ client: TestWSClient; auth: Extract<WSServerMessage, { type: "AUTH_SUCCESS" }> }> {
  const token = generateToken({ userId, username });
  const ws = new WebSocket(`${wsBaseUrl}?token=${token}`);
  const client = new TestWSClient(ws);
  const auth = (await client.waitFor("AUTH_SUCCESS")) as Extract<
    WSServerMessage,
    { type: "AUTH_SUCCESS" }
  >;
  return { client, auth };
}

describe("WebSocket Disconnect, Reconnect & Server Restart Lifecycle (wsReconnect.test.ts)", () => {
  let app: ReturnType<typeof buildServer>;
  let roomManager: RoomManager;
  let wsBaseUrl: string;
  let activeServerInstanceId: string;

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

  it("pauses match when active player drops and resumes when reconnected", async () => {
    const room = roomManager.createRoom({ id: "u-rec-1", username: "P1", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-rec-2", username: "P2", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-rec-3", username: "P3", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-rec-4", username: "P4", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-rec-5", username: "P5", avatarId: "barnaby" });

    const { client: p1 } = await createWSClient(wsBaseUrl, "u-rec-1", "P1");
    const { client: p2 } = await createWSClient(wsBaseUrl, "u-rec-2", "P2");

    p1.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await p1.waitFor("ROOM_SNAPSHOT");
    p2.send({ type: "JOIN_ROOM", correlationId: "c2", roomCode: room.roomCode });
    await p2.waitFor("ROOM_SNAPSHOT");

    p1.send({ type: "START_MATCH", correlationId: "c-start", roomCode: room.roomCode });
    await p1.waitFor("MATCH_STARTED");

    // P2 disconnects abruptly
    p2.close();

    // P1 receives MATCH_PAUSED
    const paused = await p1.waitFor("MATCH_PAUSED");
    expect(paused.disconnectedPlayerId).toBe("u-rec-2");
    expect(paused.deadline).toBeGreaterThan(Date.now());

    // P2 reconnects within 60s
    const { client: p2Recon, auth } = await createWSClient(wsBaseUrl, "u-rec-2", "P2");
    p2Recon.send({
      type: "RECONNECT_MATCH",
      correlationId: "c-recon",
      roomCode: room.roomCode,
      lastKnownVersion: 1,
      serverInstanceId: auth.serverInstanceId
    });

    const snapshot = await p2Recon.waitFor("ROOM_SNAPSHOT");
    expect(snapshot.room.roomCode).toBe(room.roomCode);

    // P1 receives MATCH_RESUMED
    const resumed = await p1.waitFor("MATCH_RESUMED");
    expect(resumed.reconnectedPlayerId).toBe("u-rec-2");

    p1.close();
    p2Recon.close();
  });

  it("handles multi-tab socket replacement without triggering phantom disconnects", async () => {
    const room = roomManager.createRoom({ id: "u-mt-1", username: "MT1", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-mt-2", username: "MT2", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-mt-3", username: "MT3", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-mt-4", username: "MT4", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-mt-5", username: "MT5", avatarId: "barnaby" });

    const { client: p1 } = await createWSClient(wsBaseUrl, "u-mt-1", "MT1");
    const { client: tab1 } = await createWSClient(wsBaseUrl, "u-mt-2", "MT2");

    p1.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await p1.waitFor("ROOM_SNAPSHOT");
    tab1.send({ type: "JOIN_ROOM", correlationId: "c2", roomCode: room.roomCode });
    await tab1.waitFor("ROOM_SNAPSHOT");

    p1.send({ type: "START_MATCH", correlationId: "c-start", roomCode: room.roomCode });
    await p1.waitFor("MATCH_STARTED");

    // Open Tab 2 for user u-mt-2 in active match
    let tab1ClosedWithCode: number | null = null;
    tab1.ws.on("close", (code) => {
      tab1ClosedWithCode = code;
    });

    const { client: tab2, auth: tab2Auth } = await createWSClient(wsBaseUrl, "u-mt-2", "MT2");
    tab2.send({
      type: "RECONNECT_MATCH",
      correlationId: "c-tab2",
      roomCode: room.roomCode,
      lastKnownVersion: 1,
      serverInstanceId: tab2Auth.serverInstanceId
    });
    await tab2.waitFor("ROOM_SNAPSHOT");

    // Tab 1 is closed by server with code 4409 (Session Overwritten)
    await new Promise((r) => setTimeout(r, 150));
    expect(tab1ClosedWithCode).toBe(WS_CLOSE_CODE_SESSION_SUPERSEDED);

    // Verify P1 does NOT receive MATCH_PAUSED (no phantom disconnect)
    let p1ReceivedPause = false;
    const onMsg = (data: Buffer) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === "MATCH_PAUSED") {
        p1ReceivedPause = true;
      }
    };
    p1.ws.on("message", onMsg);

    await new Promise((r) => setTimeout(r, 200));
    p1.ws.off("message", onMsg);
    expect(p1ReceivedPause).toBe(false);

    p1.close();
    tab2.close();
  });

  it("cancels pending mandatory shot, retains 0 bullets, and advances turn on timeout elimination", async () => {
    const room = roomManager.createRoom({ id: "u-shot-1", username: "P1", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-shot-2", username: "P2", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-shot-3", username: "P3", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-shot-4", username: "P4", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-shot-5", username: "P5", avatarId: "barnaby" });

    const startResult = roomManager.startMatch(room.roomCode, "u-shot-1");
    const currentTurnPlayerId = startResult.matchState.turn.currentPlayerId!;
    expect(currentTurnPlayerId).toBeDefined();

    // Manually set pending shot on current player to simulate mandatory shot state
    room.matchState!.turn.phase = "AWAITING_SHOT";
    room.matchState!.turn.pendingShot = true;
    room.matchState!.turn.rolledCell = 2;

    // Simulate current player disconnecting and timeout occurring
    const elimResult = roomManager.eliminateDisconnectedPlayer(room.roomCode, currentTurnPlayerId);

    // 1. Target is eliminated
    const eliminatedPlayer = elimResult.state.players.find((p) => p.playerId === currentTurnPlayerId);
    expect(eliminatedPlayer?.status).toBe("ELIMINATED");

    // 2. Pending shot is cancelled atomically with 0 bullets retained
    expect(elimResult.state.turn.pendingShot).toBe(false);
    expect(elimResult.state.turn.rolledCell).toBeNull();

    // 3. Turn advanced cyclically to next surviving active player
    expect(elimResult.state.turn.currentPlayerId).not.toBe(currentTurnPlayerId);
    expect(elimResult.state.turn.phase).toBe("AWAITING_ROLL");

    // 4. Eliminated player cannot execute a shot
    expect(() => {
      roomManager.executeShot(room.roomCode, currentTurnPlayerId, "u-shot-3", 2 as CellValue);
    }).toThrow(/not your turn to shoot|NOT_YOUR_TURN/i);
  });

  it("handles multiple simultaneous disconnects with independent timers and sequential resolution", async () => {
    const room = roomManager.createRoom({ id: "u-sim-1", username: "P1", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-sim-2", username: "P2", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-sim-3", username: "P3", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-sim-4", username: "P4", avatarId: "barnaby" });
    roomManager.joinAsPlayer(room.roomCode, { id: "u-sim-5", username: "P5", avatarId: "barnaby" });

    roomManager.startMatch(room.roomCode, "u-sim-1");

    // 1. P2 disconnects -> match paused
    const dummyTimer1 = setTimeout(() => {}, 60000);
    const p1 = roomManager.pauseMatchForPlayer(room.roomCode, "u-sim-2", 60000, dummyTimer1);
    expect(p1.state.phase).toBe("PAUSED");
    expect(room.disconnectedPlayers.size).toBe(1);

    // 2. P4 disconnects while paused -> match stays paused with independent timer
    const dummyTimer2 = setTimeout(() => {}, 60000);
    const p2 = roomManager.pauseMatchForPlayer(room.roomCode, "u-sim-4", 60000, dummyTimer2);
    expect(p2.state.phase).toBe("PAUSED");
    expect(room.disconnectedPlayers.size).toBe(2);

    // 3. P2's timer expires -> P2 eliminated, but P4 is still disconnected, so match stays PAUSED
    const res1 = roomManager.eliminateDisconnectedPlayer(room.roomCode, "u-sim-2");
    expect(res1.state.phase).toBe("PAUSED");
    expect(room.disconnectedPlayers.size).toBe(1);

    // 4. P4's timer expires -> P4 eliminated, and with 0 disconnected players remaining, match resumes to ACTIVE
    const res2 = roomManager.eliminateDisconnectedPlayer(room.roomCode, "u-sim-4");
    expect(res2.state.phase).toBe("ACTIVE");
    expect(room.disconnectedPlayers.size).toBe(0);

    clearTimeout(dummyTimer1);
    clearTimeout(dummyTimer2);
  });

  it("distinguishes confirmed server restart from unavailable or expired room", async () => {
    const { client, auth } = await createWSClient(wsBaseUrl, "u-check-restart", "Checker");

    // 1. Unknown room code with MISMATCHED serverInstanceId -> MATCH_TERMINATED_SERVER_RESTART
    client.send({
      type: "RECONNECT_MATCH",
      correlationId: "c-restart",
      roomCode: "NONEXIST",
      lastKnownVersion: 1,
      serverInstanceId: "old-server-boot-uuid-9999"
    });

    const restartMsg = await client.waitFor("MATCH_TERMINATED_SERVER_RESTART");
    expect(restartMsg.message).toContain("restarted or was redeployed");

    // 2. Unknown room code with MATCHING serverInstanceId -> MATCH_UNAVAILABLE error
    client.send({
      type: "RECONNECT_MATCH",
      correlationId: "c-unavail",
      roomCode: "NONEXIST",
      lastKnownVersion: 1,
      serverInstanceId: auth.serverInstanceId
    });

    const unavailMsg = await client.waitFor("ERROR");
    expect(unavailMsg.code).toBe("MATCH_UNAVAILABLE");

    client.close();
  });
});
