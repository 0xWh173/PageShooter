import { describe, it, expect } from "vitest";
import { loadConfig, assertProductionSecrets } from "../src/config.js";
import { RoomManager, RoomError } from "../src/rooms/roomManager.js";
import { buildServer } from "../src/server.js";

describe("Phase 7 Hardening & Release Verification", () => {
  it("rejects default/placeholder JWT_SECRET when NODE_ENV is production", () => {
    const devCfg = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db",
      JWT_SECRET: "dev_jwt_secret_super_secure_key_at_least_32_characters_long_12345"
    });
    expect(() => assertProductionSecrets(devCfg)).toThrow(
      /JWT_SECRET must not use a default\/placeholder value in production/i
    );

    const placeholderCfg = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db",
      JWT_SECRET: "super_secret_cryptographic_key_min_32_characters_long"
    });
    expect(() => assertProductionSecrets(placeholderCfg)).toThrow(
      /JWT_SECRET must not use a default\/placeholder value in production/i
    );

    const validProd = loadConfig({
      NODE_ENV: "production",
      DATABASE_URL: "postgresql://user:pass@host:5432/db",
      JWT_SECRET: "a_real_randomly_generated_production_secret_key_64_chars_long_xyz"
    });
    expect(() => assertProductionSecrets(validProd)).not.toThrow();
    expect(validProd.NODE_ENV).toBe("production");
    expect(validProd.MAX_ACTIVE_ROOMS).toBe(20);
  });

  it("enforces MAX_ACTIVE_ROOMS capacity guard with 503 SERVER_CAPACITY_REACHED", () => {
    const manager = new RoomManager({ maxActiveRooms: 2 });
    const host1 = { id: "u1", username: "Host1", avatarId: "barnaby" };
    const host2 = { id: "u2", username: "Host2", avatarId: "clover" };
    const host3 = { id: "u3", username: "Host3", avatarId: "pip" };

    const r1 = manager.createRoom(host1);
    manager.createRoom(host2);

    expect(() => manager.createRoom(host3)).toThrow(RoomError);
    try {
      manager.createRoom(host3);
    } catch (err) {
      expect(err).toBeInstanceOf(RoomError);
      expect((err as RoomError).statusCode).toBe(503);
      expect((err as RoomError).code).toBe("SERVER_CAPACITY_REACHED");
    }

    // Leaving room frees slot
    manager.leaveRoom(r1.roomCode, host1.id);
    const r3 = manager.createRoom(host3);
    expect(r3.roomCode).toHaveLength(6);
  });

  it("exposes /api/ready probe and security headers (X-Frame-Options, Referrer-Policy)", async () => {
    const roomManager = new RoomManager({ maxActiveRooms: 2 });
    const app = buildServer({
      enableRateLimit: false,
      enableSweepTimer: false,
      roomManager,
      dbHealthCheck: async () => ({ ok: true, latencyMs: 2 })
    });

    const resOk = await app.inject({ method: "GET", url: "/api/ready" });
    expect(resOk.statusCode).toBe(200);
    expect(resOk.headers["x-frame-options"]).toBe("DENY");
    expect(resOk.headers["referrer-policy"]).toBe("no-referrer");
    expect(resOk.headers["x-content-type-options"]).toBe("nosniff");
    const bodyOk = resOk.json();
    expect(bodyOk.ready).toBe(true);
    expect(bodyOk.maxActiveRooms).toBe(2);

    // Fill capacity -> /api/ready still returns 200 (healthy server) with acceptingNewRooms: false
    roomManager.createRoom({ id: "u1", username: "H1", avatarId: "barnaby" });
    roomManager.createRoom({ id: "u2", username: "H2", avatarId: "clover" });
    const resFull = await app.inject({ method: "GET", url: "/api/ready" });
    expect(resFull.statusCode).toBe(200);
    expect(resFull.json().ready).toBe(true);
    expect(resFull.json().acceptingNewRooms).toBe(false);

    await app.close();
  });

  it("returns 503 on /api/ready when database health check fails", async () => {
    const app = buildServer({
      enableRateLimit: false,
      enableSweepTimer: false,
      dbHealthCheck: async () => ({ ok: false, error: "Connection refused" })
    });

    const res = await app.inject({ method: "GET", url: "/api/ready" });
    expect(res.statusCode).toBe(503);
    expect(res.json().ready).toBe(false);
    expect(res.json().databaseOk).toBe(false);

    await app.close();
  });
});
