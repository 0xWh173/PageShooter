import { describe, it, expect, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("Authentication Route Rate Limiting", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it("enforces rate limit on /api/auth/register-password (max 5 requests per minute)", async () => {
    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" }),
      enableRateLimit: true
    });

    // Send 5 rapid registration requests
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/register-password",
        payload: {
          email: `ratelimit${i}@test.com`,
          username: `user_${i}`,
          password: "Password123!"
        }
      });
      // Requests 1-5 will not be 429
      expect(res.statusCode).not.toBe(429);
    }

    // 6th request must be rejected with 429 Too Many Requests
    const res6 = await app.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "ratelimit6@test.com",
        username: "user_6",
        password: "Password123!"
      }
    });

    expect(res6.statusCode).toBe(429);
    const body = JSON.parse(res6.body);
    expect(body.statusCode).toBe(429);
  });

  it("enforces rate limit on /api/auth/login-password (max 10 requests per minute)", async () => {
    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" }),
      enableRateLimit: true
    });

    for (let i = 0; i < 10; i++) {
      const res = await app.inject({
        method: "POST",
        url: "/api/auth/login-password",
        payload: {
          identifier: `login_${i}`,
          password: "Password123!"
        }
      });
      expect(res.statusCode).not.toBe(429);
    }

    // 11th request must be 429
    const res11 = await app.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "login_11",
        password: "Password123!"
      }
    });

    expect(res11.statusCode).toBe(429);
  });
});
