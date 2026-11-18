import { eq, sql, and, isNull } from "drizzle-orm";
import { z } from "zod";
import { type PublicUserProfile, type AuthResponse, USERNAME_CHANGE_COOLDOWN_MS } from "@pageshooter/shared";
import { users, type User } from "../db/schema.js";
import { type AppDatabase } from "../db/index.js";
import { hashPassword, verifyPassword, dummyVerify } from "./password.js";
import { generateToken } from "./token.js";
import { verifyGoogleIdToken, type GoogleTokenVerifier } from "./googleAuth.js";

export class AuthError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: Record<string, unknown>
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// Input Validation Schemas
export const registerPasswordSchema = z.object({
  email: z.string().email("Invalid email format").max(255),
  username: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username must contain only letters, numbers, and underscores"),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one number")
});

export const loginPasswordSchema = z.object({
  identifier: z.string().min(1, "Identifier (email or username) is required").max(255),
  password: z.string().min(1, "Password is required")
});

export const googleAuthSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required"),
  requestedUsername: z
    .string()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9_]+$/)
    .optional()
});

export const linkGoogleSchema = z.object({
  idToken: z.string().min(1, "Google ID token is required")
});

export const changeUsernameSchema = z.object({
  newUsername: z
    .string()
    .min(3, "Username must be at least 3 characters")
    .max(20, "Username must be at most 20 characters")
    .regex(/^[a-zA-Z0-9_]+$/, "Username must contain only letters, numbers, and underscores")
});

export function sanitizeUser(user: User): PublicUserProfile {
  return {
    id: user.id,
    email: user.email,
    username: user.username,
    avatarId: user.avatarId,
    usernameUpdatedAt: user.usernameUpdatedAt.toISOString(),
    createdAt: user.createdAt.toISOString()
  };
}

export class AuthService {
  constructor(private db: AppDatabase) {}

  async registerPassword(rawInput: unknown): Promise<AuthResponse> {
    const parseResult = registerPasswordSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(", ");
      throw new AuthError(400, "VALIDATION_ERROR", errorMsg);
    }
    const input = parseResult.data;
    const normalizedEmail = input.email.trim();
    const cleanUsername = input.username.trim();

    // 1. Check case-insensitive email collision
    const [existingEmail] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${normalizedEmail})`)
      .limit(1);

    if (existingEmail) {
      throw new AuthError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }

    // 2. Check case-insensitive username collision
    const [existingUsername] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.username}) = LOWER(${cleanUsername})`)
      .limit(1);

    if (existingUsername) {
      throw new AuthError(409, "USERNAME_TAKEN", "This username is already taken");
    }

    // 3. Hash password using Argon2id
    const passwordHash = await hashPassword(input.password);

    // 4. Insert user row
    const [newUser] = await this.db
      .insert(users)
      .values({
        email: normalizedEmail,
        username: cleanUsername,
        passwordHash,
        avatarId: "barnaby"
      })
      .returning();

    // 5. Issue JWT
    const token = generateToken({
      userId: newUser.id,
      username: newUser.username
    });

    return {
      user: sanitizeUser(newUser),
      token
    };
  }

  async loginPassword(rawInput: unknown): Promise<AuthResponse> {
    const parseResult = loginPasswordSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AuthError(400, "VALIDATION_ERROR", "Invalid input format");
    }
    const { identifier, password } = parseResult.data;
    const cleanIdentifier = identifier.trim();

    // Look up by case-insensitive email OR username
    const [user] = await this.db
      .select()
      .from(users)
      .where(
        sql`LOWER(${users.email}) = LOWER(${cleanIdentifier}) OR LOWER(${users.username}) = LOWER(${cleanIdentifier})`
      )
      .limit(1);

    // Timing-safe defense against account enumeration: run dummy verify if user missing or OAuth-only
    if (!user || !user.passwordHash) {
      await dummyVerify();
      throw new AuthError(401, "INVALID_CREDENTIALS", "Invalid email/username or password");
    }

    const isValid = await verifyPassword(user.passwordHash, password);
    if (!isValid) {
      throw new AuthError(401, "INVALID_CREDENTIALS", "Invalid email/username or password");
    }

    const token = generateToken({
      userId: user.id,
      username: user.username
    });

    return {
      user: sanitizeUser(user),
      token
    };
  }

  async loginOrRegisterGoogle(
    rawInput: unknown,
    verifier: GoogleTokenVerifier = verifyGoogleIdToken
  ): Promise<AuthResponse> {
    const parseResult = googleAuthSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AuthError(400, "VALIDATION_ERROR", "Invalid Google authentication request");
    }
    const { idToken, requestedUsername } = parseResult.data;

    let googlePayload;
    try {
      googlePayload = await verifier(idToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AuthError(401, "INVALID_GOOGLE_TOKEN", `Google token verification failed: ${message}`);
    }

    // Require verified email
    if (!googlePayload.emailVerified) {
      throw new AuthError(403, "EMAIL_NOT_VERIFIED", "Google email must be verified");
    }

    // 1. Check if user already exists with this google_sub
    const [existingGoogleUser] = await this.db
      .select()
      .from(users)
      .where(eq(users.googleSub, googlePayload.googleSub))
      .limit(1);

    if (existingGoogleUser) {
      const token = generateToken({
        userId: existingGoogleUser.id,
        username: existingGoogleUser.username
      });
      return {
        user: sanitizeUser(existingGoogleUser),
        token
      };
    }

    // 2. Prevent Silent Account Linking / Duplicate Email Collision:
    // If an existing account matches this email and has a password, do NOT silently link!
    // If an existing account matches this email without password, reject duplicate email.
    const [existingEmailUser] = await this.db
      .select()
      .from(users)
      .where(sql`LOWER(${users.email}) = LOWER(${googlePayload.email})`)
      .limit(1);

    if (existingEmailUser) {
      if (existingEmailUser.passwordHash) {
        throw new AuthError(
          409,
          "ACCOUNT_EXISTS_WITH_PASSWORD",
          "An account with this email already exists with password authentication. Please sign in with your password and link your Google account securely."
        );
      }
      throw new AuthError(409, "EMAIL_TAKEN", "An account with this email already exists");
    }

    // 3. New Google User Registration: Determine safe, unique username
    let chosenUsername = requestedUsername;
    if (!chosenUsername) {
      // Derive username from email prefix or name
      const base = (googlePayload.email.split("@")[0] || "player")
        .replace(/[^a-zA-Z0-9_]/g, "_")
        .slice(0, 15);
      chosenUsername = base.length >= 3 ? base : `user_${base}`;
    }

    // Ensure username uniqueness
    let candidate = chosenUsername;
    let attempts = 0;
    while (attempts < 5) {
      const [collision] = await this.db
        .select({ id: users.id })
        .from(users)
        .where(sql`LOWER(${users.username}) = LOWER(${candidate})`)
        .limit(1);

      if (!collision) {
        break;
      }
      attempts++;
      const randomSuffix = Math.floor(100 + Math.random() * 900);
      candidate = `${chosenUsername.slice(0, 16)}_${randomSuffix}`;
    }

    const [newUser] = await this.db
      .insert(users)
      .values({
        email: googlePayload.email.toLowerCase(),
        username: candidate,
        googleSub: googlePayload.googleSub,
        avatarId: "barnaby"
      })
      .returning();

    const token = generateToken({
      userId: newUser.id,
      username: newUser.username
    });

    return {
      user: sanitizeUser(newUser),
      token
    };
  }

  async linkGoogleAccount(
    userId: string,
    rawInput: unknown,
    verifier: GoogleTokenVerifier = verifyGoogleIdToken
  ): Promise<PublicUserProfile> {
    const parseResult = linkGoogleSchema.safeParse(rawInput);
    if (!parseResult.success) {
      throw new AuthError(400, "VALIDATION_ERROR", "Invalid Google link request");
    }
    const { idToken } = parseResult.data;

    let googlePayload;
    try {
      googlePayload = await verifier(idToken);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new AuthError(401, "INVALID_GOOGLE_TOKEN", `Google token verification failed: ${message}`);
    }

    if (!googlePayload.emailVerified) {
      throw new AuthError(403, "EMAIL_NOT_VERIFIED", "Google email must be verified");
    }

    // 1. Fetch current user to verify existence and check existing googleSub
    const [currentUser] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) {
      throw new AuthError(404, "USER_NOT_FOUND", "User profile not found");
    }

    // 2. Prevent silently replacing an existing Google identity
    if (currentUser.googleSub) {
      if (currentUser.googleSub === googlePayload.googleSub) {
        // Explicit policy: Idempotently return existing profile if linking identical Google identity
        return sanitizeUser(currentUser);
      }
      throw new AuthError(409, "ALREADY_LINKED", "This account is already linked to a different Google account");
    }

    // 3. Check if another user is already linked to this googleSub
    const [existingLinkedUser] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`${users.googleSub} = ${googlePayload.googleSub} AND ${users.id} != ${userId}`)
      .limit(1);

    if (existingLinkedUser) {
      throw new AuthError(409, "GOOGLE_ACCOUNT_ALREADY_LINKED", "This Google account is already linked to another profile");
    }

    // 4. Atomic conditional database update: update succeeds ONLY IF googleSub IS STILL NULL
    try {
      const [updatedUser] = await this.db
        .update(users)
        .set({
          googleSub: googlePayload.googleSub,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(users.id, userId),
            isNull(users.googleSub)
          )
        )
        .returning();

      if (!updatedUser) {
        // Zero rows updated: a concurrent competing request linked an identity, or user was deleted
        const [freshUser] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
        if (!freshUser) {
          throw new AuthError(404, "USER_NOT_FOUND", "User profile not found");
        }
        if (freshUser.googleSub === googlePayload.googleSub) {
          // Competing concurrent request linked the exact same Google identity -> idempotent success
          return sanitizeUser(freshUser);
        }
        // Competing concurrent request linked a different Google identity -> 409 conflict
        throw new AuthError(409, "ALREADY_LINKED", "This account is already linked to a different Google account");
      }

      return sanitizeUser(updatedUser);
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      if (errorObj?.code === "23505" || errorObj?.message?.includes("users_google_sub_idx")) {
        throw new AuthError(409, "GOOGLE_ACCOUNT_ALREADY_LINKED", "This Google account is already linked to another profile");
      }
      throw err;
    }
  }

  async getCurrentUser(userId: string): Promise<PublicUserProfile> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) {
      throw new AuthError(404, "USER_NOT_FOUND", "User profile not found");
    }
    return sanitizeUser(user);
  }

  async changeUsername(userId: string, rawInput: unknown): Promise<PublicUserProfile> {
    const parseResult = changeUsernameSchema.safeParse(rawInput);
    if (!parseResult.success) {
      const errorMsg = parseResult.error.errors.map((e) => e.message).join(", ");
      throw new AuthError(400, "VALIDATION_ERROR", errorMsg);
    }
    const newUsername = parseResult.data.newUsername.trim();

    // 1. Fetch current user
    const [currentUser] = await this.db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!currentUser) {
      throw new AuthError(404, "USER_NOT_FOUND", "User not found");
    }

    // 2. Reject if identical to current username
    if (currentUser.username.toLowerCase() === newUsername.toLowerCase()) {
      throw new AuthError(400, "SAME_USERNAME", "New username must be different from current username");
    }

    // 3. Reject if taken by another user (case-insensitive)
    const [collision] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(sql`LOWER(${users.username}) = LOWER(${newUsername}) AND ${users.id} != ${userId}`)
      .limit(1);

    if (collision) {
      throw new AuthError(409, "USERNAME_TAKEN", "This username is already taken");
    }

    // 4. Atomic 30-day cooldown enforcement in SQL
    const [updatedUser] = await this.db
      .update(users)
      .set({
        username: newUsername,
        usernameUpdatedAt: new Date(),
        updatedAt: new Date()
      })
      .where(sql`${users.id} = ${userId} AND ${users.usernameUpdatedAt} <= NOW() - INTERVAL '30 days'`)
      .returning();

    if (!updatedUser) {
      // Cooldown is still active
      const nextAllowedTimestamp = currentUser.usernameUpdatedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS;
      const nextAllowedDate = new Date(nextAllowedTimestamp);
      throw new AuthError(429, "COOLDOWN_ACTIVE", "Username can only be changed once every 30 days", {
        nextAllowedAt: nextAllowedDate.toISOString(),
        daysRemaining: Math.ceil((nextAllowedTimestamp - Date.now()) / (24 * 60 * 60 * 1000))
      });
    }

    return sanitizeUser(updatedUser);
  }

  async updateUsername(userId: string, rawInput: unknown): Promise<PublicUserProfile> {
    return this.changeUsername(userId, rawInput);
  }

  async getUserProfile(userId: string): Promise<PublicUserProfile> {
    return this.getCurrentUser(userId);
  }
}
