import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import { WS_CLOSE_CODE_UNAUTHORIZED } from "@pageshooter/shared";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { RoomManager } from "../src/rooms/roomManager.js";
import { generateToken } from "../src/services/token.js";

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for close"));
    }, 3000);

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

describe("Milestone 1.1: CSRF & Transport-Appropriate Origin Protection (csrfProtection.test.ts)", () => {
  let app: FastifyInstance;
  let roomManager: RoomManager;
  let wsBaseUrl: string;

  const mockUser = {
    id: "usr-csrf-test-1",
    email: "csrf_tester@example.com",
    username: "CsrfTester",
    avatarId: "barnaby",
    createdAt: new Date(),
    usernameUpdatedAt: new Date()
  };

  const validToken = generateToken({ userId: mockUser.id, username: mockUser.username });

  const mockAuthService = {
    loginPassword: async () => ({ user: mockUser, token: validToken }),
    getCurrentUser: async () => mockUser,
    getUserProfile: async () => mockUser
  } as any;

  beforeAll(async () => {
    roomManager = new RoomManager();
    app = buildServer({
      config: loadConfig({
        NODE_ENV: "test",
        CORS_ORIGIN: "http://localhost:5173,https://pageshooter.example.com"
      }),
      roomManager,
      authService: mockAuthService,
      enableRateLimit: false,
      enableSweepTimer: false,
      dbHealthCheck: async () => ({ ok: true, latencyMs: 1 }),
      db: {} as any
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    wsBaseUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });

  describe("Dual-Layer REST CSRF Defense", () => {
    it("rejects state-changing POST /api/rooms when X-PageShooter-Client header is missing", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: `pageshooter_session=${validToken}`,
          origin: "http://localhost:5173"
          // Missing x-pageshooter-client
        }
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("CSRF_INVALID_CLIENT_HEADER");
    });

    it("rejects state-changing POST /api/rooms when X-PageShooter-Client header has invalid value", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: `pageshooter_session=${validToken}`,
          "x-pageshooter-client": "malicious_bot",
          origin: "http://localhost:5173"
        }
      });

      expect(res.statusCode).toBe(403);
      const body = JSON.parse(res.body);
      expect(body.error).toBe("CSRF_INVALID_CLIENT_HEADER");
    });

    it("rejects state-changing POST /api/rooms when Origin is untrusted/cross-origin", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: `pageshooter_session=${validToken}`,
          "x-pageshooter-client": "web",
          origin: "https://evil-attacker-site.com"
        }
      });

      // Blocked by CORS / Origin validation layer with strict 403 Forbidden
      expect(res.statusCode).toBe(403);
    });

    it("allows state-changing POST /api/rooms when both Origin and X-PageShooter-Client are valid", async () => {
      const res = await app.inject({
        method: "POST",
        url: "/api/rooms",
        headers: {
          cookie: `pageshooter_session=${validToken}`,
          "x-pageshooter-client": "web",
          origin: "http://localhost:5173"
        }
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body.room).toBeDefined();
      expect(body.room.roomCode).toHaveLength(6);
    });

    it("safe GET /api/auth/session succeeds without X-PageShooter-Client or Origin headers", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: `pageshooter_session=${validToken}`
          // No origin, no x-pageshooter-client
        }
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.user.id).toBe(mockUser.id);
    });
  });

  describe("WebSocket Handshake Defense (CSWSH Protection)", () => {
    it("rejects WebSocket upgrade when Origin is untrusted", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/ws?token=${validToken}`,
        headers: {
          origin: "https://evil-phishing-attacker.com",
          upgrade: "websocket",
          connection: "Upgrade"
        }
      });

      // Handshake rejected by security/CORS origin verification layer with strict 403 Forbidden
      expect(res.statusCode).toBe(403);
    });

    it("rejects WebSocket upgrade with malformed Origin header", async () => {
      const res = await app.inject({
        method: "GET",
        url: `/ws?token=${validToken}`,
        headers: {
          origin: "not-a-valid-url-origin",
          upgrade: "websocket",
          connection: "Upgrade"
        }
      });

      expect(res.statusCode).toBe(403);
    });

    it("rejects WebSocket upgrade when Origin is missing in production environment", async () => {
      const prodApp = buildServer({
        config: loadConfig({
          NODE_ENV: "production",
          CORS_ORIGIN: "https://pageshooter.example.com"
        }),
        roomManager,
        authService: mockAuthService,
        enableRateLimit: false,
        enableSweepTimer: false,
        dbHealthCheck: async () => ({ ok: true, latencyMs: 1 }),
        db: {} as any
      });

      const res = await prodApp.inject({
        method: "GET",
        url: `/ws?token=${validToken}`,
        headers: {
          // No Origin header in production WebSocket upgrade
          upgrade: "websocket",
          connection: "Upgrade"
        }
      });

      expect(res.statusCode).toBe(403);
      await prodApp.close();
    });

    it("accepts WebSocket upgrade with trusted Origin without requiring X-PageShooter-Client header", async () => {
      const ws = new WebSocket(`${wsBaseUrl}?token=${validToken}`, {
        headers: {
          origin: "http://localhost:5173"
          // Native browser WebSockets cannot send custom client headers
        }
      });

      const messagePromise = new Promise<any>((resolve) => {
        ws.once("message", (data) => resolve(JSON.parse(data.toString())));
      });

      const msg = await messagePromise;
      expect(msg.type).toBe("AUTH_SUCCESS");
      expect(msg.userId).toBe(mockUser.id);

      ws.close();
      await waitForClose(ws);
    });
  });
});
