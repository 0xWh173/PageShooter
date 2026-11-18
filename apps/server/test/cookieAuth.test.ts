import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { RoomManager } from "../src/rooms/roomManager.js";
import { revocationManager } from "../src/services/revocation.js";

import { generateToken } from "../src/services/token.js";

describe("Milestone 1.1: Cookie-Based Authentication & Zero-Token Specification (cookieAuth.test.ts)", () => {
  let app: FastifyInstance | null = null;
  let roomManager: RoomManager;

  const mockUser = {
    id: "usr-cookie-test-1",
    email: "cookie_tester@example.com",
    username: "CookieTester",
    avatarId: "barnaby",
    createdAt: new Date(),
    usernameUpdatedAt: new Date()
  };

  const mockToken = generateToken({ userId: mockUser.id, username: mockUser.username });

  const mockAuthService = {
    registerPassword: async () => ({ user: mockUser, token: mockToken }),
    loginPassword: async () => ({ user: mockUser, token: mockToken }),
    getCurrentUser: async () => mockUser,
    getUserProfile: async () => mockUser,
    updateUsername: async (_id: string, newName: string) => ({ ...mockUser, username: newName })
  } as any;

  beforeEach(() => {
    revocationManager.clear();
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

  it("POST /api/auth/register-password sets HttpOnly session cookie and returns zero token in JSON body", async () => {
    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      headers: {
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      },
      payload: {
        email: "cookie_tester@example.com",
        username: "CookieTester",
        password: "Password123"
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);

    // ZERO-TOKEN INVARIANT: token must NEVER appear in JSON payload
    expect(body.user).toBeDefined();
    expect(body.user.username).toBe("CookieTester");
    expect(body.token).toBeUndefined();

    // Cookie Verification
    const setCookieHeader = res.headers["set-cookie"];
    expect(setCookieHeader).toBeDefined();
    const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : (setCookieHeader as string);

    expect(cookieStr).toContain("pageshooter_session=");
    expect(cookieStr).toContain("HttpOnly");
    expect(cookieStr).toContain("Path=/");
    expect(cookieStr).toContain("SameSite=Lax");
  });

  it("POST /api/auth/login-password sets HttpOnly session cookie and authenticates subsequent GET /api/auth/session", async () => {
    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      headers: {
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      },
      payload: {
        identifier: "CookieTester",
        password: "Password123"
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const loginBody = JSON.parse(loginRes.body);
    expect(loginBody.user.id).toBe(mockUser.id);
    expect(loginBody.token).toBeUndefined();

    const setCookie = loginRes.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0].split(";")[0] : (setCookie as string).split(";")[0];

    // Authenticate via cookie
    const sessionRes = await app!.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: {
        cookie: cookieHeader
      }
    });

    expect(sessionRes.statusCode).toBe(200);
    const sessionBody = JSON.parse(sessionRes.body);
    expect(sessionBody.user.id).toBe(mockUser.id);
    expect(sessionBody.user.username).toBe("CookieTester");
  });

  it("POST /api/auth/logout revokes session in RevocationManager and clears session cookie", async () => {
    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      headers: {
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      },
      payload: {
        identifier: "CookieTester",
        password: "Password123"
      }
    });

    const setCookie = loginRes.headers["set-cookie"];
    const cookieHeader = Array.isArray(setCookie) ? setCookie[0].split(";")[0] : (setCookie as string).split(";")[0];

    // Issue logout
    const logoutRes = await app!.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: cookieHeader,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });

    expect(logoutRes.statusCode).toBe(200);
    expect(JSON.parse(logoutRes.body)).toEqual({ success: true });

    // Verify cookie expiration in Set-Cookie header
    const clearCookieHeader = logoutRes.headers["set-cookie"];
    const clearStr = Array.isArray(clearCookieHeader) ? clearCookieHeader[0] : (clearCookieHeader as string);
    expect(clearStr).toContain("Max-Age=0");

    // Replay attack prevention: Attempting to use the old cookie must now be rejected
    const replayedRes = await app!.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: {
        cookie: cookieHeader
      }
    });

    expect(replayedRes.statusCode).toBe(401);
    expect(JSON.parse(replayedRes.body).error).toBe("TOKEN_REVOKED");
  });

  it("rejects forged or tampered session cookie signatures with HTTP 401", async () => {
    const res = await app!.inject({
      method: "GET",
      url: "/api/auth/session",
      headers: {
        cookie: "pageshooter_session=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.e30.tampered_signature"
      }
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error).toBe("UNAUTHORIZED");
  });

  describe("Production Environment Cookie Specification (__Host- Prefix & Security)", () => {
    let prodApp: FastifyInstance | null = null;

    beforeEach(() => {
      prodApp = buildServer({
        config: loadConfig({
          NODE_ENV: "production",
          CORS_ORIGIN: "https://pageshooter.example.com"
        }),
        roomManager,
        authService: mockAuthService,
        enableRateLimit: false
      });
    });

    afterEach(async () => {
      if (prodApp) {
        await prodApp.close();
        prodApp = null;
      }
    });

    it("POST /api/auth/register-password in production sets __Host-pageshooter_session with Secure, HttpOnly, Path=/, and no Domain", async () => {
      const res = await prodApp!.inject({
        method: "POST",
        url: "/api/auth/register-password",
        headers: {
          "x-pageshooter-client": "web",
          origin: "https://pageshooter.example.com"
        },
        payload: {
          email: "prod_cookie@example.com",
          username: "ProdCookie",
          password: "Password123"
        }
      });

      expect(res.statusCode).toBe(201);
      const setCookieHeader = res.headers["set-cookie"];
      expect(setCookieHeader).toBeDefined();
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : (setCookieHeader as string);

      // __Host- cookie invariant checks
      expect(cookieStr).toContain("__Host-pageshooter_session=");
      expect(cookieStr).toContain("HttpOnly");
      expect(cookieStr).toContain("Secure");
      expect(cookieStr).toContain("Path=/");
      expect(cookieStr).toContain("SameSite=Lax");
      expect(cookieStr.toLowerCase()).not.toContain("domain=");
      expect(cookieStr.toLowerCase()).not.toContain("max-age=");
      expect(cookieStr.toLowerCase()).not.toContain("expires=");
    });

    it("POST /api/auth/login-password in production sets __Host-pageshooter_session and allows session restoration", async () => {
      const res = await prodApp!.inject({
        method: "POST",
        url: "/api/auth/login-password",
        headers: {
          "x-pageshooter-client": "web",
          origin: "https://pageshooter.example.com"
        },
        payload: {
          identifier: "ProdCookie",
          password: "Password123"
        }
      });

      expect(res.statusCode).toBe(200);
      const setCookieHeader = res.headers["set-cookie"];
      const cookieStr = Array.isArray(setCookieHeader) ? setCookieHeader[0] : (setCookieHeader as string);
      const cookieVal = cookieStr.split(";")[0];

      expect(cookieVal).toContain("__Host-pageshooter_session=");

      const sessionRes = await prodApp!.inject({
        method: "GET",
        url: "/api/auth/session",
        headers: {
          cookie: cookieVal
        }
      });

      expect(sessionRes.statusCode).toBe(200);
      const sessionBody = JSON.parse(sessionRes.body);
      expect(sessionBody.user.id).toBe(mockUser.id);
    });

    it("POST /api/auth/logout in production clears __Host-pageshooter_session with Max-Age=0", async () => {
      const res = await prodApp!.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: {
          cookie: `__Host-pageshooter_session=${mockToken}`,
          "x-pageshooter-client": "web",
          origin: "https://pageshooter.example.com"
        }
      });

      expect(res.statusCode).toBe(200);
      const clearCookieHeader = res.headers["set-cookie"];
      const clearStr = Array.isArray(clearCookieHeader) ? clearCookieHeader[0] : (clearCookieHeader as string);

      expect(clearStr).toContain("__Host-pageshooter_session=");
      expect(clearStr).toContain("Max-Age=0");
      expect(clearStr).toContain("Path=/");
      expect(clearStr).toContain("HttpOnly");
      expect(clearStr).toContain("Secure");
    });
  });
});
