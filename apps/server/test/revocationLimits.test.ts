import { describe, it, expect, beforeEach } from "vitest";
import { type FastifyInstance } from "fastify";
import { RevocationManager, DEFAULT_REVOCATION_CAPACITY } from "../src/services/revocation.js";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { generateToken } from "../src/services/token.js";
import { RoomManager } from "../src/rooms/roomManager.js";

describe("Milestone 1.1: Fail-Closed Revocation Manager & Capacity Limits (revocationLimits.test.ts)", () => {
  let manager: RevocationManager;

  beforeEach(() => {
    manager = new RevocationManager(5, 0, false); // Small capacity of 5 for deterministic limit testing
  });

  it("enforces default bounded capacity limit of 10,000 entries (ADR-01 compliance)", () => {
    const defaultManager = new RevocationManager();
    expect(defaultManager.maxCapacity).toBe(DEFAULT_REVOCATION_CAPACITY);
    expect(DEFAULT_REVOCATION_CAPACITY).toBe(10_000);
    defaultManager.close();
  });

  it("adds and tracks revoked JTIs while within capacity", () => {
    const now = Date.now();
    const exp = now + 60_000;

    expect(manager.revoke("jti-1", exp)).toBe(true);
    expect(manager.revoke("jti-2", exp)).toBe(true);
    expect(manager.size).toBe(2);

    expect(manager.isRevoked("jti-1")).toBe(true);
    expect(manager.isRevoked("jti-2")).toBe(true);
    expect(manager.isRevoked("jti-unknown")).toBe(false);
  });

  it("never evicts unexpired entries when capacity is full (fail-closed policy)", () => {
    const futureExp = Date.now() + 300_000; // 5 minutes in future

    // Fill capacity to 5
    for (let i = 1; i <= 5; i++) {
      expect(manager.revoke(`jti-${i}`, futureExp)).toBe(true);
    }
    expect(manager.size).toBe(5);

    // Attempt to add a 6th revocation: must return false (fail closed)
    const success = manager.revoke("jti-6-overflow", futureExp);
    expect(success).toBe(false);
    expect(manager.size).toBe(5);
    expect(manager.isRevoked("jti-6-overflow")).toBe(false);

    // Verify all original 5 entries remain intact and revoked
    for (let i = 1; i <= 5; i++) {
      expect(manager.isRevoked(`jti-${i}`)).toBe(true);
    }
  });

  it("sweeps expired entries to reclaim capacity for new revocations", () => {
    const pastExp = Date.now() - 1000; // Expired 1 second ago
    const futureExp = Date.now() + 60_000;

    // Fill with 3 expired and 2 active entries
    manager.revoke("expired-1", pastExp);
    manager.revoke("expired-2", pastExp);
    manager.revoke("expired-3", pastExp);
    manager.revoke("active-1", futureExp);
    manager.revoke("active-2", futureExp);
    expect(manager.size).toBe(5);

    // Sweeping should purge the 3 expired entries
    const pruned = manager.sweep();
    expect(pruned).toBe(3);
    expect(manager.size).toBe(2);

    // Now capacity is available for new entries
    expect(manager.revoke("new-entry-1", futureExp)).toBe(true);
    expect(manager.size).toBe(3);
    expect(manager.isRevoked("active-1")).toBe(true);
    expect(manager.isRevoked("expired-1")).toBe(false);
  });

  it("POST /api/auth/logout returns HTTP 503 REVOCATION_CAPACITY_EXHAUSTED when blocklist is full", async () => {
    const { revocationManager: singletonManager } = await import("../src/services/revocation.js");
    singletonManager.clear();

    const mockUser = {
      id: "usr-rev-exhaust-1",
      email: "rev_exhaust@example.com",
      username: "ExhaustUser",
      avatarId: "barnaby",
      createdAt: new Date(),
      usernameUpdatedAt: new Date()
    };

    // Pre-fill revocation manager to maximum capacity (10,000 entries) with unexpired tokens
    const futureExp = Date.now() + 3_600_000;
    for (let i = 0; i < singletonManager.maxCapacity; i++) {
      singletonManager.revoke(`filler-jti-${i}`, futureExp);
    }
    expect(singletonManager.size).toBe(singletonManager.maxCapacity);

    const testApp = buildServer({
      config: loadConfig({ NODE_ENV: "test" }),
      roomManager: new RoomManager(),
      authService: {
        getCurrentUser: async () => mockUser,
        getUserProfile: async () => mockUser
      } as any,
      enableRateLimit: false
    });

    const userToken = generateToken({ userId: mockUser.id, username: mockUser.username });

    const res = await testApp.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: {
        cookie: `pageshooter_session=${userToken}`,
        "x-pageshooter-client": "web",
        origin: "http://localhost:5173"
      }
    });

    // When capacity is exhausted and entry cannot be recorded, fail-closed returns 503
    expect(res.statusCode).toBe(503);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("REVOCATION_CAPACITY_EXHAUSTED");

    // Clean up singleton
    singletonManager.clear();
    await testApp.close();
  });
});
