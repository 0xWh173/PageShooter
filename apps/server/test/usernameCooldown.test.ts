import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { sql, eq } from "drizzle-orm";
import { getDb, closeDb, checkDbHealth } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";

describe("Atomic 30-Day Username Cooldown Enforcement", () => {
  let app: FastifyInstance | null = null;
  let dbAvailable = false;

  beforeAll(async () => {
    const health = await checkDbHealth();
    dbAvailable = health.ok;
    if (dbAvailable) {
      const db = getDb();
      await db.delete(users).where(sql`${users.email} LIKE '%@test-cooldown.local'`);

      app = buildServer({
        config: loadConfig({ NODE_ENV: "test" }),
        enableRateLimit: false // disable rate limit here to isolate cooldown testing
      });
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const db = getDb();
      await db.delete(users).where(sql`${users.email} LIKE '%@test-cooldown.local'`);
      await closeDb();
    }
    if (app) {
      await app.close();
      app = null;
    }
  });

  it("rejects username change immediately after registration with HTTP 429 and cooldown details", async () => {
    if (!dbAvailable) return;

    // 1. Register a user
    const regRes = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "cooldown.user1@test-cooldown.local",
        username: "InitialName",
        password: "Password123!"
      }
    });
    expect(regRes.statusCode).toBe(201);
    const token = JSON.parse(regRes.body).token;

    // 2. Attempt to change username immediately
    const changeRes = await app!.inject({
      method: "PATCH",
      url: "/api/users/me/username",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        newUsername: "UpdatedName"
      }
    });

    expect(changeRes.statusCode).toBe(429);
    const body = JSON.parse(changeRes.body);
    expect(body.error).toBe("COOLDOWN_ACTIVE");
    expect(body.details.nextAllowedAt).toBeDefined();
    expect(new Date(body.details.nextAllowedAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("rejects change to identical username with HTTP 400", async () => {
    if (!dbAvailable) return;

    const regRes = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "cooldown.user2@test-cooldown.local",
        username: "StaticUser",
        password: "Password123!"
      }
    });
    const token = JSON.parse(regRes.body).token;

    const changeRes = await app!.inject({
      method: "PATCH",
      url: "/api/users/me/username",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        newUsername: "staticuser" // case-insensitive identical
      }
    });

    expect(changeRes.statusCode).toBe(400);
    const body = JSON.parse(changeRes.body);
    expect(body.error).toBe("SAME_USERNAME");
  });

  it("allows username change when username_updated_at is 31 days in the past, then resets cooldown", async () => {
    if (!dbAvailable) return;
    const db = getDb();

    // 1. Register user
    const regRes = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "cooldown.eligible@test-cooldown.local",
        username: "OldUsername",
        password: "Password123!"
      }
    });
    const { user, token } = JSON.parse(regRes.body);

    // 2. Set username_updated_at to 31 days ago in SQL
    await db
      .update(users)
      .set({
        usernameUpdatedAt: sql`NOW() - INTERVAL '31 days'`
      })
      .where(eq(users.id, user.id));

    // 3. Attempt username change now -> must succeed!
    const changeRes = await app!.inject({
      method: "PATCH",
      url: "/api/users/me/username",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        newUsername: "NewCoolName"
      }
    });

    expect(changeRes.statusCode).toBe(200);
    const changeBody = JSON.parse(changeRes.body);
    expect(changeBody.user.username).toBe("NewCoolName");
    expect(new Date(changeBody.user.usernameUpdatedAt).getTime()).toBeGreaterThan(Date.now() - 5000);

    // 4. Second immediate attempt must now be on cooldown (429)
    const secondChangeRes = await app!.inject({
      method: "PATCH",
      url: "/api/users/me/username",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        newUsername: "AnotherName"
      }
    });
    expect(secondChangeRes.statusCode).toBe(429);
    expect(JSON.parse(secondChangeRes.body).error).toBe("COOLDOWN_ACTIVE");
  });

  it("enforces atomic single-winner constraint under concurrent rename requests", async () => {
    if (!dbAvailable) return;
    const db = getDb();

    // 1. Register user
    const regRes = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "cooldown.race@test-cooldown.local",
        username: "RaceRunner",
        password: "Password123!"
      }
    });
    const { user, token } = JSON.parse(regRes.body);

    // 2. Make user eligible by backdating timestamp
    await db
      .update(users)
      .set({
        usernameUpdatedAt: sql`NOW() - INTERVAL '31 days'`
      })
      .where(eq(users.id, user.id));

    // 3. Fire two concurrent rename requests simultaneously
    const [req1, req2] = await Promise.all([
      app!.inject({
        method: "PATCH",
        url: "/api/users/me/username",
        headers: { Authorization: `Bearer ${token}` },
        payload: { newUsername: "WinnerCandidateA" }
      }),
      app!.inject({
        method: "PATCH",
        url: "/api/users/me/username",
        headers: { Authorization: `Bearer ${token}` },
        payload: { newUsername: "WinnerCandidateB" }
      })
    ]);

    const statusCodes = [req1.statusCode, req2.statusCode];
    // Exactly one must be 200 OK, and exactly one must be 429 Too Many Requests
    expect(statusCodes).toContain(200);
    expect(statusCodes).toContain(429);

    // Verify DB holds the winning username
    const [finalUser] = await db.select().from(users).where(eq(users.id, user.id));
    expect(["WinnerCandidateA", "WinnerCandidateB"]).toContain(finalUser.username);
  });
});
