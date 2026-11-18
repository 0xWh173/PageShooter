import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { type FastifyInstance } from "fastify";
import { sql, eq } from "drizzle-orm";
import { getDb, closeDb, checkDbHealth } from "../src/db/index.js";
import { users } from "../src/db/schema.js";
import { buildServer } from "../src/server.js";
import { loadConfig } from "../src/config.js";
import { type GoogleTokenPayload } from "../src/services/googleAuth.js";

describe("Authentication Routes & Security Protections", () => {
  let app: FastifyInstance | null = null;
  let dbAvailable = false;

  // Mock Google verifier test fixture
  const mockGoogleVerifier = async (idToken: string): Promise<GoogleTokenPayload> => {
    if (idToken === "valid-google-token-new") {
      return {
        googleSub: "google-sub-1111111111",
        email: "new.google@test-pageshooter.local",
        emailVerified: true,
        name: "New Google Gamer"
      };
    }
    if (idToken === "valid-google-token-existing") {
      return {
        googleSub: "google-sub-2222222222",
        email: "existing.google@test-pageshooter.local",
        emailVerified: true,
        name: "Existing Google Gamer"
      };
    }
    if (idToken === "valid-google-token-link-target") {
      return {
        googleSub: "google-sub-3333333333",
        email: "password.only@test-pageshooter.local",
        emailVerified: true,
        name: "Linking Gamer"
      };
    }
    if (idToken === "valid-google-token-link-secondary") {
      return {
        googleSub: "google-sub-5555555555",
        email: "password.only@test-pageshooter.local",
        emailVerified: true,
        name: "Second Google Gamer"
      };
    }
    if (idToken === "valid-google-token-email-collision-no-pass") {
      return {
        googleSub: "google-sub-6666666666",
        email: "existing.google@test-pageshooter.local", // same email as existing.google, but different sub
        emailVerified: true,
        name: "Colliding Google Gamer"
      };
    }
    if (idToken === "valid-google-token-other-user") {
      return {
        googleSub: "google-sub-7777777777",
        email: "other.user@test-pageshooter.local",
        emailVerified: true,
        name: "Other Google Gamer"
      };
    }
    if (idToken === "valid-google-token-concurrent-a") {
      return {
        googleSub: "google-sub-8888888888",
        email: "concurrent.user@test-pageshooter.local",
        emailVerified: true,
        name: "Concurrent A"
      };
    }
    if (idToken === "valid-google-token-concurrent-b") {
      return {
        googleSub: "google-sub-9999999999",
        email: "concurrent.user@test-pageshooter.local",
        emailVerified: true,
        name: "Concurrent B"
      };
    }
    if (idToken === "unverified-google-token") {
      return {
        googleSub: "google-sub-4444444444",
        email: "unverified@test-pageshooter.local",
        emailVerified: false,
        name: "Unverified Gamer"
      };
    }
    throw new Error("Token expired or audience mismatch");
  };

  beforeAll(async () => {
    const health = await checkDbHealth();
    dbAvailable = health.ok;
    if (dbAvailable) {
      const db = getDb();
      await db.delete(users).where(sql`${users.email} LIKE '%@test-pageshooter.local'`);

      app = buildServer({
        config: loadConfig({ NODE_ENV: "test" }),
        googleTokenVerifier: mockGoogleVerifier,
        enableRateLimit: false // isolated in rateLimit.test.ts
      });
    }
  });

  afterAll(async () => {
    if (dbAvailable) {
      const db = getDb();
      await db.delete(users).where(sql`${users.email} LIKE '%@test-pageshooter.local'`);
      await closeDb();
    }
    if (app) {
      await app.close();
      app = null;
    }
  });

  it("POST /api/auth/register-password creates new user and returns JWT + sanitized profile", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "hero1@test-pageshooter.local",
        username: "BladeMaster",
        password: "Password123!"
      }
    });

    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user).toBeDefined();
    expect(body.user.email).toBe("hero1@test-pageshooter.local");
    expect(body.user.username).toBe("BladeMaster");
    expect(body.user.avatarId).toBe("barnaby");

    // Strict security check: password hash and googleSub MUST NEVER be exposed
    expect(body.user.passwordHash).toBeUndefined();
    expect(body.user.password_hash).toBeUndefined();
    expect(body.user.googleSub).toBeUndefined();
    expect(body.user.google_sub).toBeUndefined();
  });

  it("rejects registration with invalid input formats", async () => {
    if (!dbAvailable) return;

    // Bad email
    const resBadEmail = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "not-an-email",
        username: "ValidUser1",
        password: "Password123!"
      }
    });
    expect(resBadEmail.statusCode).toBe(400);

    // Bad username (contains symbols)
    const resBadUser = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "good@test-pageshooter.local",
        username: "Invalid!Name$",
        password: "Password123!"
      }
    });
    expect(resBadUser.statusCode).toBe(400);

    // Weak password (< 8 chars, no uppercase, no numbers)
    const resWeakPass = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "good@test-pageshooter.local",
        username: "ValidUser2",
        password: "weak"
      }
    });
    expect(resWeakPass.statusCode).toBe(400);
  });

  it("rejects registration with case-insensitive duplicate email (409 Conflict)", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "HERO1@TEST-PAGESHOOTER.LOCAL", // uppercase of hero1
        username: "DifferentUser",
        password: "Password123!"
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("EMAIL_TAKEN");
  });

  it("rejects registration with case-insensitive duplicate username (409 Conflict)", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "hero2@test-pageshooter.local",
        username: "blademaster", // lowercase of BladeMaster
        password: "Password123!"
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("USERNAME_TAKEN");
  });

  it("POST /api/auth/login-password succeeds with email identifier", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "hero1@test-pageshooter.local",
        password: "Password123!"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe("BladeMaster");
  });

  it("POST /api/auth/login-password succeeds with username identifier", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "blademaster", // lowercase
        password: "Password123!"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe("BladeMaster");
  });

  it("POST /api/auth/login-password returns generic 401 on incorrect password without leaking existence", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "BladeMaster",
        password: "WrongPassword999!"
      }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("INVALID_CREDENTIALS");
    expect(body.message).toBe("Invalid email/username or password");
  });

  it("POST /api/auth/login-password returns generic 401 on non-existent identifier", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "non_existent_user_999",
        password: "Password123!"
      }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("INVALID_CREDENTIALS");
    expect(body.message).toBe("Invalid email/username or password");
  });

  it("GET /api/users/me returns authenticated user with valid token", async () => {
    if (!dbAvailable) return;

    // Login to get token
    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "BladeMaster",
        password: "Password123!"
      }
    });
    const token = JSON.parse(loginRes.body).token;

    const meRes = await app!.inject({
      method: "GET",
      url: "/api/users/me",
      headers: {
        Authorization: `Bearer ${token}`
      }
    });

    expect(meRes.statusCode).toBe(200);
    const body = JSON.parse(meRes.body);
    expect(body.user.username).toBe("BladeMaster");
    expect(body.user.email).toBe("hero1@test-pageshooter.local");
  });

  it("GET /api/users/me returns 401 when token is missing or invalid", async () => {
    if (!dbAvailable) return;

    // Missing header
    const noHeader = await app!.inject({
      method: "GET",
      url: "/api/users/me"
    });
    expect(noHeader.statusCode).toBe(401);

    // Tampered header
    const tampered = await app!.inject({
      method: "GET",
      url: "/api/users/me",
      headers: {
        Authorization: "Bearer invalid.fake.token"
      }
    });
    expect(tampered.statusCode).toBe(401);
  });

  it("POST /api/auth/google registers new Google user via test fixture", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "valid-google-token-new",
        requestedUsername: "GoogleWarrior"
      }
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.token).toBeDefined();
    expect(body.user.username).toBe("GoogleWarrior");
    expect(body.user.email).toBe("new.google@test-pageshooter.local");
  });

  it("POST /api/auth/google logs in existing Google user via test fixture", async () => {
    if (!dbAvailable) return;

    // First registration
    await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "valid-google-token-existing",
        requestedUsername: "ExistingWarrior"
      }
    });

    // Subsequent login
    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "valid-google-token-existing"
      }
    });

    expect(loginRes.statusCode).toBe(200);
    const body = JSON.parse(loginRes.body);
    expect(body.user.username).toBe("ExistingWarrior");
  });

  it("POST /api/auth/google rejects silent takeover if account with same email has a password", async () => {
    if (!dbAvailable) return;

    // Create password-only user first
    await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "password.only@test-pageshooter.local",
        username: "PasswordOnlyHero",
        password: "Password123!"
      }
    });

    // Attempting Google sign-in with matching email must NOT silently log in or link!
    const linkRes = await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "valid-google-token-link-target"
      }
    });

    expect(linkRes.statusCode).toBe(409);
    const body = JSON.parse(linkRes.body);
    expect(body.error).toBe("ACCOUNT_EXISTS_WITH_PASSWORD");
  });

  it("POST /api/auth/link-google explicitly links Google account for authenticated password user", async () => {
    if (!dbAvailable) return;

    // Login with password to get session
    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "PasswordOnlyHero",
        password: "Password123!"
      }
    });
    const token = JSON.parse(loginRes.body).token;

    // Now explicitly link Google account
    const linkRes = await app!.inject({
      method: "POST",
      url: "/api/auth/link-google",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        idToken: "valid-google-token-link-target"
      }
    });

    expect(linkRes.statusCode).toBe(200);
    const body = JSON.parse(linkRes.body);
    expect(body.user.username).toBe("PasswordOnlyHero");

    // Subsequent Google sign-in now succeeds as linked account!
    const googleLoginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "valid-google-token-link-target"
      }
    });
    expect(googleLoginRes.statusCode).toBe(200);
    expect(JSON.parse(googleLoginRes.body).user.username).toBe("PasswordOnlyHero");

    // Explicit Policy 1: Re-linking identical Google account returns 200 idempotently
    const relinkSameRes = await app!.inject({
      method: "POST",
      url: "/api/auth/link-google",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        idToken: "valid-google-token-link-target"
      }
    });
    expect(relinkSameRes.statusCode).toBe(200);
    expect(JSON.parse(relinkSameRes.body).user.username).toBe("PasswordOnlyHero");

    // Explicit Policy 2: Attempting to replace an existing Google identity returns 409 ALREADY_LINKED
    const replaceRes = await app!.inject({
      method: "POST",
      url: "/api/auth/link-google",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        idToken: "valid-google-token-link-secondary"
      }
    });
    expect(replaceRes.statusCode).toBe(409);
    expect(JSON.parse(replaceRes.body).error).toBe("ALREADY_LINKED");
  });

  it("POST /api/auth/link-google returns 409 GOOGLE_ACCOUNT_ALREADY_LINKED when attempting to link another user's Google subject", async () => {
    if (!dbAvailable) return;

    // Create a new password-only user
    await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "victim@test-pageshooter.local",
        username: "VictimPlayer",
        password: "Password123!"
      }
    });

    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "VictimPlayer",
        password: "Password123!"
      }
    });
    const token = JSON.parse(loginRes.body).token;

    // Attempt to link a Google token whose googleSub is ALREADY linked to PasswordOnlyHero (google-sub-3333333333)
    const linkRes = await app!.inject({
      method: "POST",
      url: "/api/auth/link-google",
      headers: {
        Authorization: `Bearer ${token}`
      },
      payload: {
        idToken: "valid-google-token-link-target"
      }
    });

    expect(linkRes.statusCode).toBe(409);
    const body = JSON.parse(linkRes.body);
    expect(body.error).toBe("GOOGLE_ACCOUNT_ALREADY_LINKED");
  });

  it("two concurrent requests attempting to link different Google identities cannot overwrite one another", async () => {
    if (!dbAvailable) return;

    // Create a new password-only user
    await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "concurrent.race@test-pageshooter.local",
        username: "ConcurrentRacer",
        password: "Password123!"
      }
    });

    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "ConcurrentRacer",
        password: "Password123!"
      }
    });
    const token = JSON.parse(loginRes.body).token;

    // Fire two concurrent requests with DIFFERENT Google identities
    const [resA, resB] = await Promise.all([
      app!.inject({
        method: "POST",
        url: "/api/auth/link-google",
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: {
          idToken: "valid-google-token-concurrent-a"
        }
      }),
      app!.inject({
        method: "POST",
        url: "/api/auth/link-google",
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: {
          idToken: "valid-google-token-concurrent-b"
        }
      })
    ]);

    // Atomic conditional SQL guarantees exactly one succeeds (200) and the other is rejected (409 ALREADY_LINKED)
    const statusCodes = [resA.statusCode, resB.statusCode].sort();
    expect(statusCodes).toEqual([200, 409]);

    const failureRes = resA.statusCode === 409 ? resA : resB;
    expect(JSON.parse(failureRes.body).error).toBe("ALREADY_LINKED");

    // Verify database state matches the winner and was not overwritten by the loser
    const db = getDb();
    const [persisted] = await db.select().from(users).where(eq(users.username, "ConcurrentRacer"));
    const winnerSub = resA.statusCode === 200 ? "google-sub-8888888888" : "google-sub-9999999999";
    expect(persisted.googleSub).toBe(winnerSub);
  });

  it("two concurrent requests attempting to link the same Google identity produce a consistent successful result", async () => {
    if (!dbAvailable) return;

    // Create a new password-only user
    await app!.inject({
      method: "POST",
      url: "/api/auth/register-password",
      payload: {
        email: "concurrent.same@test-pageshooter.local",
        username: "ConcurrentSame",
        password: "Password123!"
      }
    });

    const loginRes = await app!.inject({
      method: "POST",
      url: "/api/auth/login-password",
      payload: {
        identifier: "ConcurrentSame",
        password: "Password123!"
      }
    });
    const token = JSON.parse(loginRes.body).token;

    // Fire two concurrent requests with the SAME Google identity
    const [res1, res2] = await Promise.all([
      app!.inject({
        method: "POST",
        url: "/api/auth/link-google",
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: {
          idToken: "valid-google-token-other-user"
        }
      }),
      app!.inject({
        method: "POST",
        url: "/api/auth/link-google",
        headers: {
          Authorization: `Bearer ${token}`
        },
        payload: {
          idToken: "valid-google-token-other-user"
        }
      })
    ]);

    // Both requests must succeed (one via atomic insert, one via idempotent fallback)
    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(JSON.parse(res1.body).user.username).toBe("ConcurrentSame");
    expect(JSON.parse(res2.body).user.username).toBe("ConcurrentSame");

    const db = getDb();
    const [persisted] = await db.select().from(users).where(eq(users.username, "ConcurrentSame"));
    expect(persisted.googleSub).toBe("google-sub-7777777777");
  });

  it("POST /api/auth/google returns 409 EMAIL_TAKEN when incoming email matches an existing OAuth account with different sub", async () => {
    if (!dbAvailable) return;

    // "existing.google@test-pageshooter.local" already exists with googleSub "google-sub-2222222222" and passwordHash null
    // Attempting to register via Google with same email but different sub ("google-sub-6666666666")
    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "valid-google-token-email-collision-no-pass"
      }
    });

    expect(res.statusCode).toBe(409);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("EMAIL_TAKEN");
  });

  it("POST /api/auth/google rejects unverified Google email with HTTP 403", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "unverified-google-token"
      }
    });

    expect(res.statusCode).toBe(403);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("EMAIL_NOT_VERIFIED");
  });

  it("POST /api/auth/google returns 401 when token verification fails", async () => {
    if (!dbAvailable) return;

    const res = await app!.inject({
      method: "POST",
      url: "/api/auth/google",
      payload: {
        idToken: "invalid-expired-or-malformed-token"
      }
    });

    expect(res.statusCode).toBe(401);
    const body = JSON.parse(res.body);
    expect(body.error).toBe("INVALID_GOOGLE_TOKEN");
  });
});
