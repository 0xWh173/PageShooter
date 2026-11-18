import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { sql } from "drizzle-orm";
import { getDb, closeDb, checkDbHealth } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("Live PostgreSQL Integration & Constraint Verification", () => {
  let app: FastifyInstance | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    const health = await checkDbHealth();
    dbAvailable = health.ok;
    if (dbAvailable) {
      // Clean test users before starting
      const db = getDb();
      await db.delete(users).where(sql`${users.email} LIKE '%@test-livedb.local'`);
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const db = getDb();
      await db.delete(users).where(sql`${users.email} LIKE '%@test-livedb.local'`);
      await closeDb();
    }
    if (app) {
      await app.close();
      app = null;
    }
  });

  it("confirms database connectivity is healthy through checkDbHealth", async () => {
    if (!dbAvailable) {
      console.warn("Skipping live database test: local PostgreSQL not available.");
      return;
    }
    const health = await checkDbHealth();
    expect(health.ok).toBe(true);
    expect(health.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("verifies /api/health returns HTTP 200 and HEALTHY through the live Fastify application", async () => {
    if (!dbAvailable) return;

    app = buildServer({
      config: loadConfig({ NODE_ENV: "test" })
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
    expect(typeof body.database.latencyMs).toBe("number");
    expect(body.database.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it("tests normal user insertion and confirms default avatar and timestamps", async () => {
    if (!dbAvailable) return;
    const db = getDb();

    const [inserted] = await db
      .insert(users)
      .values({
        email: "alice@test-livedb.local",
        username: "AliceWarrior",
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$fakehash123",
        googleSub: null
      })
      .returning();

    expect(inserted).toBeDefined();
    expect(inserted.id).toBeDefined();
    expect(inserted.email).toBe("alice@test-livedb.local");
    expect(inserted.username).toBe("AliceWarrior");
    expect(inserted.avatarId).toBe("barnaby"); // Default avatar
    expect(inserted.createdAt).toBeInstanceOf(Date);
    expect(inserted.updatedAt).toBeInstanceOf(Date);
    expect(inserted.usernameUpdatedAt).toBeInstanceOf(Date);
  });

  it("verifies case-insensitive duplicate email rejection", async () => {
    if (!dbAvailable) return;
    const db = getDb();

    // Attempt to insert same email with different casing: "ALICE@test-livedb.local"
    await expect(
      db.insert(users).values({
        email: "ALICE@TEST-LIVEDB.LOCAL",
        username: "AliceDifferentName",
        passwordHash: "somehash"
      })
    ).rejects.toThrow(/(unique constraint|users_email_idx)/i);
  });

  it("verifies case-insensitive duplicate username rejection", async () => {
    if (!dbAvailable) return;
    const db = getDb();

    // Attempt to insert same username with different casing: "alicewarrior"
    await expect(
      db.insert(users).values({
        email: "bob@test-livedb.local",
        username: "alicewarrior",
        passwordHash: "somehash"
      })
    ).rejects.toThrow(/(unique constraint|users_username_lower_idx)/i);
  });

  it("verifies nullable password_hash and google_sub behavior for OAuth and password users", async () => {
    if (!dbAvailable) return;
    const db = getDb();

    // 1. Google OAuth user: passwordHash is NULL, googleSub is populated
    const [oauthUser] = await db
      .insert(users)
      .values({
        email: "google.user@test-livedb.local",
        username: "GoogleGamer",
        passwordHash: null,
        googleSub: "google-oauth2|123456789012345678901",
        avatarId: "shadow_ninja"
      })
      .returning();

    expect(oauthUser.passwordHash).toBeNull();
    expect(oauthUser.googleSub).toBe("google-oauth2|123456789012345678901");
    expect(oauthUser.avatarId).toBe("shadow_ninja");

    // 2. Reject duplicate google_sub
    await expect(
      db.insert(users).values({
        email: "google.user2@test-livedb.local",
        username: "GoogleGamer2",
        passwordHash: null,
        googleSub: "google-oauth2|123456789012345678901" // Duplicate google_sub
      })
    ).rejects.toThrow(/(unique constraint|users_google_sub_idx)/i);

    // 3. Password user: googleSub is NULL, passwordHash is populated
    const [passwordUser] = await db
      .insert(users)
      .values({
        email: "password.user@test-livedb.local",
        username: "PasswordGamer",
        passwordHash: "$argon2id$v=19$m=19456,t=2,p=1$passhash456",
        googleSub: null
      })
      .returning();

    expect(passwordUser.passwordHash).toBe("$argon2id$v=19$m=19456,t=2,p=1$passhash456");
    expect(passwordUser.googleSub).toBeNull();
  });
});
