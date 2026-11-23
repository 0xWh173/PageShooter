import { describe, it, expect, beforeEach, afterEach } from "vitest";
import crypto from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { RoomManager } from "../src/rooms/roomManager.js";
import { generateToken } from "../src/services/token.js";
import { getSessionCookieName } from "../src/config.js";

function makeAuthCookie(userId: string, username: string): string {
  const token = generateToken({ userId, username });
  return `${getSessionCookieName("test")}=${token}`;
}

describe("Chat, Emoji, Book Roll Sync & HTTP Fallback Parity", () => {
  let app: FastifyInstance;
  let roomManager: RoomManager;

  beforeEach(async () => {
    roomManager = new RoomManager();
    const cfg = loadConfig({
      NODE_ENV: "test",
      JWT_SECRET: "test_secret_key_for_chat_emoji_roll_sync_1234567890",
      CORS_ORIGIN: "http://localhost:5173"
    });
    app = buildServer({
      config: cfg,
      roomManager,
      enableRateLimit: false,
      enableSweepTimer: false
    });
    await app.ready();
  });

  afterEach(async () => {
    await app.close();
  });

  it("supports REST chat & emoji endpoints and exposes recentChats/recentEmojis in GET /api/rooms/:roomCode", async () => {
    const hostId = crypto.randomUUID();
    const hostCookie = makeAuthCookie(hostId, "BarnabyHost");

    const createRes = await app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: {
        cookie: hostCookie,
        "x-pageshooter-client": "web"
      }
    });
    expect(createRes.statusCode).toBe(201);
    const { room } = createRes.json();

    // Send chat via REST (HTTP fallback path)
    const chatRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.roomCode.toLowerCase()}/chat`,
      headers: {
        cookie: hostCookie,
        "x-pageshooter-client": "web"
      },
      payload: { message: "Ready to flip the comic book!" }
    });
    expect(chatRes.statusCode).toBe(200);
    const chatBody = chatRes.json();
    expect(chatBody.chat.message).toBe("Ready to flip the comic book!");
    expect(chatBody.chat.senderUsername).toBe("BarnabyHost");

    // Send emoji via REST (HTTP fallback path)
    const emojiRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.roomCode.toLowerCase()}/emoji`,
      headers: {
        cookie: hostCookie,
        "x-pageshooter-client": "web"
      },
      payload: { emojiId: "fire" }
    });
    expect(emojiRes.statusCode).toBe(200);
    const emojiBody = emojiRes.json();
    expect(emojiBody.emoji.emojiId).toBe("fire");
    expect(emojiBody.emoji.senderUsername).toBe("BarnabyHost");

    // Poll GET /api/rooms/:roomCode and verify both chat & emoji are present
    const pollRes = await app.inject({
      method: "GET",
      url: `/api/rooms/${room.roomCode}`,
      headers: { cookie: hostCookie }
    });
    expect(pollRes.statusCode).toBe(200);
    const polledRoom = pollRes.json().room;
    expect(polledRoom.recentChats).toHaveLength(1);
    expect(polledRoom.recentChats[0].message).toBe("Ready to flip the comic book!");
    expect(polledRoom.recentEmojis).toHaveLength(1);
    expect(polledRoom.recentEmojis[0].emojiId).toBe("fire");
  });

  it("populates lastRoll with actorUsername and consequenceText in GET /api/rooms/:roomCode so all polling players see the book animation", async () => {
    const players = Array.from({ length: 5 }, (_, idx) => ({
      id: crypto.randomUUID(),
      username: `Scribe${idx + 1}`
    }));

    const room = roomManager.createRoom({
      id: players[0].id,
      username: players[0].username,
      avatarId: "barnaby"
    });
    for (let i = 1; i < players.length; i++) {
      roomManager.joinAsPlayer(room.roomCode, {
        id: players[i].id,
        username: players[i].username,
        avatarId: "clover"
      });
    }

    const started = roomManager.startMatch(room.roomCode, players[0].id);
    const firstTurnPlayerId = started.matchState.turn.currentPlayerId!;
    const firstTurnPlayer = players.find((p) => p.id === firstTurnPlayerId)!;
    const rollerCookie = makeAuthCookie(firstTurnPlayer.id, firstTurnPlayer.username);

    const rollRes = await app.inject({
      method: "POST",
      url: `/api/rooms/${room.roomCode}/roll`,
      headers: {
        cookie: rollerCookie,
        "x-pageshooter-client": "web"
      },
      payload: { expectedStateVersion: started.matchState.version }
    });
    expect(rollRes.statusCode).toBe(200);
    const rollBody = rollRes.json();
    expect(rollBody.state).toBeDefined();
    expect(rollBody.rollResult.pageNumber).toBeGreaterThanOrEqual(1);
    expect(rollBody.lastRoll.actorUsername).toBe(firstTurnPlayer.username);
    expect(rollBody.lastRoll.consequenceText).toContain(firstTurnPlayer.username);

    // Another player polling the room sees lastRoll immediately
    const otherCookie = makeAuthCookie(players[1].id, players[1].username);
    const pollRes = await app.inject({
      method: "GET",
      url: `/api/rooms/${room.roomCode}`,
      headers: { cookie: otherCookie }
    });
    expect(pollRes.statusCode).toBe(200);
    const polled = pollRes.json().room;
    expect(polled.lastRoll).toBeDefined();
    expect(polled.lastRoll.turnNumber).toBe(1);
    expect(polled.lastRoll.actorUsername).toBe(firstTurnPlayer.username);
    expect(polled.lastRoll.pageNumber).toBe(rollBody.rollResult.pageNumber);
  });
});
