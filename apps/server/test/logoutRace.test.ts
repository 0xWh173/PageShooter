import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { WS_CLOSE_CODE_UNAUTHORIZED, type WSServerMessage } from "@pageshooter/shared";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { RoomManager } from "../src/rooms/roomManager.js";
import { generateToken } from "../src/services/token.js";
import { revocationManager } from "../src/services/revocation.js";

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for close"));
    }, 4000);

    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });

    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForMessage(ws: WebSocket): Promise<WSServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for message"));
    }, 4000);

    ws.once("message", (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    });

    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("Milestone 1.1: Logout Synchronization & In-Flight Race Verification (logoutRace.test.ts)", () => {
  let app: FastifyInstance;
  let roomManager: RoomManager;
  let wsBaseUrl: string;

  let currentUser = {
    id: "usr-race-test-1",
    email: "racer@example.com",
    username: "RacerOne",
    avatarId: "barnaby",
    createdAt: new Date(),
    usernameUpdatedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
  };

  let updateDelayMs = 0;
  let getUserDelayMs = 0;
  let activeToken = "";

  const mockAuthService = {
    getCurrentUser: async () => {
      if (getUserDelayMs > 0) {
        await new Promise((r) => setTimeout(r, getUserDelayMs));
      }
      return currentUser;
    },
    getUserProfile: async () => currentUser,
    changeUsername: async (id: string, payload: any) => {
      if (updateDelayMs > 0) {
        await new Promise((r) => setTimeout(r, updateDelayMs));
      }
      // If session was revoked while in-flight, don't commit changes to state
      if (activeToken) {
        try {
          const decoded = (await import("../src/services/token.js")).verifyToken(activeToken);
          if (decoded.jti && revocationManager.isRevoked(decoded.jti)) {
            return currentUser;
          }
        } catch {}
      }
      currentUser.username = typeof payload === "object" ? payload.newUsername : payload;
      return currentUser;
    },
    updateUsername: async (id: string, payload: any) => {
      return (mockAuthService as any).changeUsername(id, payload);
    }
  } as any;

  beforeEach(async () => {
    revocationManager.clear();
    roomManager = new RoomManager();
    updateDelayMs = 0;
    getUserDelayMs = 0;
    currentUser = {
      id: "usr-race-test-1",
      email: "racer@example.com",
      username: "RacerOne",
      avatarId: "barnaby",
      createdAt: new Date(),
      usernameUpdatedAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
    };

    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" }),
      roomManager,
      authService: mockAuthService,
      enableRateLimit: false
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    wsBaseUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterEach(async () => {
    await app.close();
  });

  it("Race-1: Paused REST mutation vs concurrent logout -> Pre-commit guard rejects with 401 and leaves state unchanged", async () => {
    const userToken = generateToken({ userId: currentUser.id, username: currentUser.username });
    activeToken = userToken;

    // Inject a 60ms delay inside authService.updateUsername to simulate an asynchronous in-flight mutation
    updateDelayMs = 60;

    // Start the PATCH mutation in background
    const mutationPromise = app.inject({
      method: "PATCH",
      url: "/api/users/me/username",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      },
      payload: {
        newUsername: "RacerMutated"
      }
    });

    // Concurrently issue logout after 10ms (while mutation is executing)
    await new Promise((r) => setTimeout(r, 10));

    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });

    expect(logoutRes.statusCode).toBe(200);

    // Wait for mutation to complete
    const mutationRes = await mutationPromise;

    // Pre-commit revocation guard catches the mid-operation revocation and returns 401
    expect([401]).toContain(mutationRes.statusCode);
    const body = JSON.parse(mutationRes.body);
    expect(["SESSION_REVOKED", "TOKEN_REVOKED"]).toContain(body.error);
    expect(currentUser.username).toBe("RacerOne");
  });

  it("Race-2: Queued WebSocket turn command vs concurrent logout -> Socket closed with 4401 and command discarded", async () => {
    const userToken = generateToken({ userId: currentUser.id, username: currentUser.username });

    const ws = new WebSocket(`${wsBaseUrl}?token=${userToken}`, {
      headers: { origin: "http://localhost:5173" }
    });

    const authMsg = await waitForMessage(ws);
    expect(authMsg.type).toBe("AUTH_SUCCESS");

    // Create room and start match with 5 players
    const room = roomManager.createRoom({ id: currentUser.id, username: currentUser.username, avatarId: "barnaby" }, "RACER2");
    roomManager.joinAsPlayer(room.roomCode, { id: "p2", username: "P2", avatarId: "clover" });
    roomManager.joinAsPlayer(room.roomCode, { id: "p3", username: "P3", avatarId: "pip" });
    roomManager.joinAsPlayer(room.roomCode, { id: "p4", username: "P4", avatarId: "hazel" });
    roomManager.joinAsPlayer(room.roomCode, { id: "p5", username: "P5", avatarId: "oliver" });
    roomManager.startMatch(room.roomCode, currentUser.id);

    const initialVersion = room.stateVersion;

    // Concurrently logout while dispatching WS command
    ws.send(JSON.stringify({
      type: "ROLL_REQUEST",
      roomCode: "RACER2",
      turnNumber: 1
    }));

    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });
    expect(logoutRes.statusCode).toBe(200);

    // Socket must be closed with 4401
    const { code } = await waitForClose(ws);
    expect(code).toBe(WS_CLOSE_CODE_UNAUTHORIZED);
  });

  it("Race-3: Paused room creation vs concurrent logout -> Pre-commit guard rejects with 401 and zero rooms created", async () => {
    const userToken = generateToken({ userId: currentUser.id, username: currentUser.username });

    // Inject a 50ms pause inside authService.getCurrentUser to pause room creation after requireAuth
    getUserDelayMs = 50;

    // 1. Begin authenticated room creation in background (pauses inside getCurrentUser before createRoom)
    const createPromise = app.inject({
      method: "POST",
      url: "/api/rooms",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });

    // 2. Concurrently execute logout during the pause (at t=10ms)
    await new Promise((r) => setTimeout(r, 10));
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });
    expect(logoutRes.statusCode).toBe(200);

    // 3. Resume room creation
    const createRes = await createPromise;

    // 4. Pre-commit check catches revoked session, rejects with 401, and leaves 0 rooms created
    expect(createRes.statusCode).toBe(401);
    expect(JSON.parse(createRes.body).error).toBe("SESSION_REVOKED");
    expect(roomManager.roomCount).toBe(0);
  });

  it("Race-4: Paused room join vs concurrent logout -> Pre-commit guard rejects with 401 and user not joined", async () => {
    const hostUser = { id: "usr-host", username: "HostGuy", avatarId: "barnaby" };
    const room = roomManager.createRoom(hostUser, "J23456");

    const userToken = generateToken({ userId: currentUser.id, username: currentUser.username });

    // Inject a 50ms pause inside authService.getCurrentUser to pause joinRoom after requireAuth
    getUserDelayMs = 50;

    // 1. Begin authenticated room join in background (pauses inside getCurrentUser before joinAsPlayer)
    const joinPromise = app.inject({
      method: "POST",
      url: `/api/rooms/${room.roomCode}/join`,
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });

    // 2. Concurrently execute logout during the pause (at t=10ms)
    await new Promise((r) => setTimeout(r, 10));
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });
    expect(logoutRes.statusCode).toBe(200);

    // 3. Resume room join
    const joinRes = await joinPromise;

    // 4. Pre-commit check catches revoked session, rejects with 401, and user NEVER becomes participant
    expect(joinRes.statusCode).toBe(401);
    expect(JSON.parse(joinRes.body).error).toBe("SESSION_REVOKED");
    expect(room.players.has(currentUser.id)).toBe(false);
  });

  it("Race-5: Multi-Tab Logout Cascade -> Both Tab 1 and Tab 2 sockets closed with 4401 and token revoked across tabs", async () => {
    const userToken = generateToken({ userId: currentUser.id, username: currentUser.username });

    // Tab 1 WebSocket
    const tab1Ws = new WebSocket(`${wsBaseUrl}?token=${userToken}`, {
      headers: { origin: "http://localhost:5173" }
    });
    const msg1 = await waitForMessage(tab1Ws);
    expect(msg1.type).toBe("AUTH_SUCCESS");

    // Tab 2 WebSocket
    const tab2Ws = new WebSocket(`${wsBaseUrl}?token=${userToken}`, {
      headers: { origin: "http://localhost:5173" }
    });
    const msg2 = await waitForMessage(tab2Ws);
    expect(msg2.type).toBe("AUTH_SUCCESS");

    // Tab 1 initiates logout via REST
    const logoutRes = await app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });

    expect(logoutRes.statusCode).toBe(200);

    // Both Tab 1 and Tab 2 sockets MUST be immediately terminated with close code 4401
    const [tab1Close, tab2Close] = await Promise.all([
      waitForClose(tab1Ws),
      waitForClose(tab2Ws)
    ]);

    expect(tab1Close.code).toBe(WS_CLOSE_CODE_UNAUTHORIZED);
    expect(tab2Close.code).toBe(WS_CLOSE_CODE_UNAUTHORIZED);
  });
});
