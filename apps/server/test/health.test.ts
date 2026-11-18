import { describe, it, expect, afterEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("Server Health & Diagnostics Routes", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app) {
      await app.close();
      app = null;
    }
  });

  it("GET / returns root server info", async () => {
    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" })
    });

    const response = await app.inject({
      method: "GET",
      url: "/"
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.name).toBe("PageShooter Multiplayer Server");
    expect(body.phase).toBe("6.4");
    expect(body.status).toBe("ONLINE");
  });

  it("GET /api/health returns HTTP 200 and HEALTHY status when database is connected", async () => {
    const mockDbHealth = async () => ({
      ok: true,
      latencyMs: 12
    });

    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" }),
      dbHealthCheck: mockDbHealth
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health"
    });

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("HEALTHY");
    expect(body.version).toBe("1.0.0");
    expect(body.database.status).toBe("CONNECTED");
    expect(body.database.latencyMs).toBe(12);
    expect(typeof body.uptime).toBe("number");
    expect(new Date(body.timestamp).getTime()).not.toBeNaN();
  });

  it("GET /api/health returns HTTP 503 and DEGRADED status when database is unreachable", async () => {
    const mockDbHealth = async () => ({
      ok: false,
      error: "Connection refused on port 5432"
    });

    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" }),
      dbHealthCheck: mockDbHealth
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/health"
    });

    expect(response.statusCode).toBe(503);
    const body = JSON.parse(response.body);
    expect(body.status).toBe("DEGRADED");
    expect(body.version).toBe("1.0.0");
    expect(body.database.status).toBe("DISCONNECTED");
    expect(body.database.error).toBe("Connection refused on port 5432");
  });
});
