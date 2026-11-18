import { describe, it, expect, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("Fastify Server Middleware & Security", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it("handles CORS allowed origins correctly", async () => {
    app = buildServer({
      config: loadConfig({
        NODE_ENV: "test",
        CORS_ORIGIN: "http://localhost:5173,https://pageshooter.example"
      }),
      dbHealthCheck: async () => ({ ok: true, latencyMs: 5 })
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "http://localhost:5173"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
    expect(response.headers["access-control-allow-credentials"]).toBe("true");
  });

  it("blocks requests from unauthorized CORS origins", async () => {
    app = buildServer({
      config: loadConfig({
        NODE_ENV: "test",
        CORS_ORIGIN: "http://localhost:5173"
      }),
      dbHealthCheck: async () => ({ ok: true, latencyMs: 5 })
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health",
      headers: {
        origin: "https://malicious-site.com"
      }
    });

    // When CORS origin check fails with Error, Fastify returns 403 Forbidden
    expect(response.statusCode).toBe(403);
  });

  it("includes security headers from helmet", async () => {
    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" }),
      dbHealthCheck: async () => ({ ok: true, latencyMs: 5 })
    });

    const response = await app.inject({
      method: "GET",
      url: "/"
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});
