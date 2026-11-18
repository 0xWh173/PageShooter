import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import type { WSServerMessage } from "@pageshooter/shared";
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

function createWSClient(
  wsBaseUrl: string,
  userId: string,
  username: string
): Promise<{ client: TestWSClient; auth: WSServerMessage }> {
  return new Promise((resolve, reject) => {
    const token = generateToken({ userId, username });
    const ws = new WebSocket(`${wsBaseUrl}?token=${token}`);
    const client = new TestWSClient(ws);

    client
      .waitFor("AUTH_SUCCESS")
      .then((auth) => resolve({ client, auth }))
      .catch(reject);

    ws.once("error", reject);
  });
}

describe("WebSocket Room Synchronization & Rate Limits (wsRoomSync.test.ts)", () => {
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

  it("handles player joins, snapshot reception, and peer broadcast", async () => {
    const room = roomManager.createRoom({
      id: "u-host",
      username: "HostPlayer",
      avatarId: "barnaby"
    });

    const { client: host } = await createWSClient(wsBaseUrl, "u-host", "HostPlayer");
    const { client: p2 } = await createWSClient(wsBaseUrl, "u-p2", "PlayerTwo");

    host.send({
      type: "JOIN_ROOM",
      correlationId: "cid-join-host",
      roomCode: room.roomCode
    });

    const hostSnapshot = await host.waitFor("ROOM_SNAPSHOT");
    expect(hostSnapshot.room.roomCode).toBe(room.roomCode);
    expect(hostSnapshot.room.playerCount).toBe(1);

    p2.send({
      type: "JOIN_ROOM",
      correlationId: "cid-join-p2",
      roomCode: room.roomCode
    });

    const p2Snapshot = await p2.waitFor("ROOM_SNAPSHOT");
    expect(p2Snapshot.room.playerCount).toBe(2);

    const hostReceivedJoin = await host.waitFor("PLAYER_JOINED");
    expect(hostReceivedJoin.player.userId).toBe("u-p2");
    expect(hostReceivedJoin.player.username).toBe("PlayerTwo");

    host.close();
    p2.close();
  });

  it("handles spectator joins and broadcasts SPECTATOR_JOINED to players", async () => {
    const room = roomManager.createRoom({
      id: "u-host-2",
      username: "HostPlayer2",
      avatarId: "barnaby"
    });

    const { client: host } = await createWSClient(wsBaseUrl, "u-host-2", "HostPlayer2");
    const { client: spec } = await createWSClient(wsBaseUrl, "u-spec", "SpectatorOne");

    host.send({
      type: "JOIN_ROOM",
      correlationId: "cid-host-j",
      roomCode: room.roomCode
    });
    await host.waitFor("ROOM_SNAPSHOT");

    spec.send({
      type: "JOIN_AS_SPECTATOR",
      correlationId: "cid-spec-j",
      roomCode: room.roomCode
    });

    const specSnapshot = await spec.waitFor("ROOM_SNAPSHOT");
    expect(specSnapshot.room.spectatorCount).toBe(1);

    const hostReceivedSpec = await host.waitFor("SPECTATOR_JOINED");
    expect(hostReceivedSpec.spectator.userId).toBe("u-spec");
    expect(hostReceivedSpec.spectator.role).toBe("SPECTATOR");

    host.close();
    spec.close();
  });

  it("rejects unauthorized host actions from spectators and regular players", async () => {
    const room = roomManager.createRoom({
      id: "u-host-3",
      username: "HostPlayer3",
      avatarId: "barnaby"
    });

    const { client: host } = await createWSClient(wsBaseUrl, "u-host-3", "HostPlayer3");
    const { client: player } = await createWSClient(wsBaseUrl, "u-p3", "RegularPlayer");
    const { client: spec } = await createWSClient(wsBaseUrl, "u-spec-2", "Spectator2");

    host.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await host.waitFor("ROOM_SNAPSHOT");

    player.send({ type: "JOIN_ROOM", correlationId: "c2", roomCode: room.roomCode });
    await player.waitFor("ROOM_SNAPSHOT");

    spec.send({ type: "JOIN_AS_SPECTATOR", correlationId: "c3", roomCode: room.roomCode });
    await spec.waitFor("ROOM_SNAPSHOT");

    // 1. Regular player attempts START_MATCH -> rejected with NOT_HOST
    player.send({ type: "START_MATCH", correlationId: "c-start", roomCode: room.roomCode });
    const pErr = await player.waitFor("ERROR");
    expect(pErr.code).toBe("NOT_HOST");

    // 2. Spectator attempts KICK_PLAYER -> rejected with NOT_HOST
    spec.send({
      type: "KICK_PLAYER",
      correlationId: "c-kick",
      roomCode: room.roomCode,
      targetUserId: "u-p3"
    });
    const specErr = await spec.waitFor("ERROR");
    expect(specErr.code).toBe("NOT_HOST");

    host.close();
    player.close();
    spec.close();
  });

  it("enforces chat message limits and applies 30-second mute on violation", async () => {
    const room = roomManager.createRoom({
      id: "u-chat-host",
      username: "ChatHost",
      avatarId: "barnaby"
    });

    const { client: host } = await createWSClient(wsBaseUrl, "u-chat-host", "ChatHost");
    const { client: p } = await createWSClient(wsBaseUrl, "u-chat-p", "ChatPlayer");

    host.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await host.waitFor("ROOM_SNAPSHOT");
    p.send({ type: "JOIN_ROOM", correlationId: "c2", roomCode: room.roomCode });
    await p.waitFor("ROOM_SNAPSHOT");

    // 1. Valid chat message broadcasts
    p.send({
      type: "SEND_CHAT_MESSAGE",
      correlationId: "c-chat-1",
      roomCode: room.roomCode,
      message: "Hello world!"
    });

    const chatBroadcast = await host.waitFor("CHAT_BROADCAST");
    expect(chatBroadcast.message).toBe("Hello world!");
    expect(chatBroadcast.senderUserId).toBe("u-chat-p");

    // 2. Message > 200 characters is rejected with VALIDATION_ERROR
    p.send({
      type: "SEND_CHAT_MESSAGE",
      correlationId: "c-chat-long",
      roomCode: room.roomCode,
      message: "a".repeat(201)
    });

    const lenErr = await p.waitFor("ERROR");
    expect(lenErr.code).toBe("VALIDATION_ERROR");

    // 3. Sending another message within 2s cooldown -> rejected with MUTED
    p.send({
      type: "SEND_CHAT_MESSAGE",
      correlationId: "c-chat-fast",
      roomCode: room.roomCode,
      message: "Spamming too fast!"
    });

    const muteErr = await p.waitFor("ERROR");
    expect(muteErr.code).toBe("MUTED");

    host.close();
    p.close();
  });

  it("enforces emoji whitelist and rate limits (max 2/sec, silent drop on excess)", async () => {
    const room = roomManager.createRoom({
      id: "u-emoji-host",
      username: "EmojiHost",
      avatarId: "barnaby"
    });

    const { client: host } = await createWSClient(wsBaseUrl, "u-emoji-host", "EmojiHost");
    host.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await host.waitFor("ROOM_SNAPSHOT");

    // 1. Valid emoji broadcasts: test "thumb" and "fire"
    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e1",
      roomCode: room.roomCode,
      emojiId: "thumb"
    });

    const b1 = await host.waitFor("EMOJI_BROADCAST");
    expect(b1.emojiId).toBe("thumb");

    // 2. Second emoji in window broadcasts
    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e2",
      roomCode: room.roomCode,
      emojiId: "fire"
    });
    const b2 = await host.waitFor("EMOJI_BROADCAST");
    expect(b2.emojiId).toBe("fire");

    // 3. Third emoji in same 1-second window is silently dropped
    let thirdReceived = false;
    const onThird = (data: Buffer) => {
      const parsed = JSON.parse(data.toString());
      if (parsed.type === "EMOJI_BROADCAST" && parsed.emojiId === "skull") {
        thirdReceived = true;
      }
    };
    host.ws.on("message", onThird);

    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e3",
      roomCode: room.roomCode,
      emojiId: "skull"
    });

    await new Promise((r) => setTimeout(r, 200));
    host.ws.off("message", onThird);
    expect(thirdReceived).toBe(false);

    // Wait for the 1-second rate limit window to expire
    await new Promise((r) => setTimeout(r, 1000));

    // 4. Verify all remaining authorized emojis broadcast successfully: skull, scream, sword, cheer
    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e4",
      roomCode: room.roomCode,
      emojiId: "skull"
    });
    const b4 = await host.waitFor("EMOJI_BROADCAST");
    expect(b4.emojiId).toBe("skull");

    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e5",
      roomCode: room.roomCode,
      emojiId: "scream"
    });
    const b5 = await host.waitFor("EMOJI_BROADCAST");
    expect(b5.emojiId).toBe("scream");

    // Wait for next window
    await new Promise((r) => setTimeout(r, 1050));

    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e6",
      roomCode: room.roomCode,
      emojiId: "sword"
    });
    const b6 = await host.waitFor("EMOJI_BROADCAST");
    expect(b6.emojiId).toBe("sword");

    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e7",
      roomCode: room.roomCode,
      emojiId: "cheer"
    });
    const b7 = await host.waitFor("EMOJI_BROADCAST");
    expect(b7.emojiId).toBe("cheer");

    // 5. Invalid emoji rejected with VALIDATION_ERROR
    host.send({
      type: "SEND_EMOJI_REACTION",
      correlationId: "e-inv",
      roomCode: room.roomCode,
      emojiId: "nonexistent_alien"
    });

    const valErr = await host.waitFor("ERROR");
    expect(valErr.code).toBe("VALIDATION_ERROR");

    host.close();
  });

  it("strictly rejects all unauthorized emoji IDs (including previously deprecated IDs) with VALIDATION_ERROR", async () => {
    const room = roomManager.createRoom({
      id: "u-emoji-unauth",
      username: "UnauthEmojiHost",
      avatarId: "barnaby"
    });

    const { client: host } = await createWSClient(wsBaseUrl, "u-emoji-unauth", "UnauthEmojiHost");
    host.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await host.waitFor("ROOM_SNAPSHOT");

    const deprecatedOrInvalidIds = [
      "thumbsup",
      "flame",
      "gun",
      "party",
      "eyes",
      "clap",
      "cry",
      "heart",
      "rocket",
      "12345"
    ];

    for (const invalidId of deprecatedOrInvalidIds) {
      host.send({
        type: "SEND_EMOJI_REACTION",
        correlationId: `c-inv-${invalidId}`,
        roomCode: room.roomCode,
        emojiId: invalidId
      });

      const err = await host.waitFor("ERROR");
      expect(err.code).toBe("VALIDATION_ERROR");
      expect(err.message).toBe(`Invalid emoji ID: ${invalidId}`);
      expect(err.correlationId).toBe(`c-inv-${invalidId}`);
    }

    host.close();
  });

  it("migrates host privileges when host voluntarily leaves in WAITING phase", async () => {
    const room = roomManager.createRoom({
      id: "u-leave-host",
      username: "LeaveHost",
      avatarId: "barnaby"
    });

    const { client: host } = await createWSClient(wsBaseUrl, "u-leave-host", "LeaveHost");
    const { client: p2 } = await createWSClient(wsBaseUrl, "u-p2-migrate", "NextHostCandidate");

    host.send({ type: "JOIN_ROOM", correlationId: "c1", roomCode: room.roomCode });
    await host.waitFor("ROOM_SNAPSHOT");

    p2.send({ type: "JOIN_ROOM", correlationId: "c2", roomCode: room.roomCode });
    await p2.waitFor("ROOM_SNAPSHOT");

    // Host leaves room
    host.send({ type: "LEAVE_ROOM", correlationId: "c-leave", roomCode: room.roomCode });
    await host.waitFor("ACK");

    // P2 receives PLAYER_LEFT and HOST_MIGRATED
    const playerLeft = await p2.waitFor("PLAYER_LEFT");
    expect(playerLeft.userId).toBe("u-leave-host");

    const hostMigrated = await p2.waitFor("HOST_MIGRATED");
    expect(hostMigrated.newHostUserId).toBe("u-p2-migrate");

    host.close();
    p2.close();
  });

  it("Finding F-06: rejects WS JOIN_ROOM and JOIN_AS_SPECTATOR with ACTIVE_MATCH_IN_PROGRESS if user is an active participant in another match", async () => {
    // 1. Create match room with 5 players and start match
    const matchRoom = roomManager.createRoom({ id: "u-active-p1", username: "ActiveP1", avatarId: "barnaby" });
    roomManager.joinAsPlayer(matchRoom.roomCode, { id: "u-active-p2", username: "ActiveP2", avatarId: "pip" });
    roomManager.joinAsPlayer(matchRoom.roomCode, { id: "u-active-p3", username: "ActiveP3", avatarId: "clover" });
    roomManager.joinAsPlayer(matchRoom.roomCode, { id: "u-active-p4", username: "ActiveP4", avatarId: "hazel" });
    roomManager.joinAsPlayer(matchRoom.roomCode, { id: "u-active-p5", username: "ActiveP5", avatarId: "oliver" });
    roomManager.startMatch(matchRoom.roomCode, "u-active-p1");

    // 2. Create another separate room
    const otherRoom = roomManager.createRoom({ id: "u-other-host", username: "OtherHost", avatarId: "barnaby" });

    // 3. Connect as u-active-p2 over WebSocket
    const { client: activeClient, auth } = await createWSClient(wsBaseUrl, "u-active-p2", "ActiveP2");
    expect((auth as any).hasActiveMatchParticipation).toBe(true);

    // 4. Try JOIN_ROOM on otherRoom -> should fail with ACTIVE_MATCH_IN_PROGRESS
    activeClient.send({
      type: "JOIN_ROOM",
      correlationId: "c-join-forbidden",
      roomCode: otherRoom.roomCode
    });
    const joinErr = await activeClient.waitFor("ERROR");
    expect(joinErr.code).toBe("ACTIVE_MATCH_IN_PROGRESS");
    expect(joinErr.correlationId).toBe("c-join-forbidden");

    // 5. Try JOIN_AS_SPECTATOR on otherRoom -> should fail with ACTIVE_MATCH_IN_PROGRESS
    activeClient.send({
      type: "JOIN_AS_SPECTATOR",
      correlationId: "c-spec-forbidden",
      roomCode: otherRoom.roomCode
    });
    const specErr = await activeClient.waitFor("ERROR");
    expect(specErr.code).toBe("ACTIVE_MATCH_IN_PROGRESS");
    expect(specErr.correlationId).toBe("c-spec-forbidden");

    activeClient.close();
  });
});
