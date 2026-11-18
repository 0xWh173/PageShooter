import dotenv from "dotenv";
import { z } from "zod";

// Load local .env if present
dotenv.config();

export const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(4000),
  HOST: z.string().default("0.0.0.0"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  CORS_ORIGIN: z.string().default("http://localhost:5173,http://localhost:5175,http://localhost:3234"),
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .default("postgresql://postgres:postgres@localhost:5432/pageshooter"),
  JWT_SECRET: z
    .string()
    .min(32, "JWT_SECRET must be at least 32 characters long")
    .default("dev_jwt_secret_super_secure_key_at_least_32_characters_long_12345"),
  JWT_EXPIRES_IN: z.string().default("24h"),
  GOOGLE_CLIENT_ID: z.string().optional(),
  MAX_ACTIVE_ROOMS: z.coerce.number().int().positive().default(20)
});

const FORBIDDEN_PROD_SECRETS = new Set([
  "dev_jwt_secret_super_secure_key_at_least_32_characters_long_12345",
  "super_secret_cryptographic_key_min_32_characters_long"
]);

export type Config = z.infer<typeof envSchema>;

export function assertProductionSecrets(cfg: Config): void {
  if (cfg.NODE_ENV === "production" && FORBIDDEN_PROD_SECRETS.has(cfg.JWT_SECRET)) {
    throw new Error(
      "Invalid server environment configuration: JWT_SECRET must not use a default/placeholder value in production"
    );
  }
}

export function loadConfig(sourceEnv: Record<string, string | undefined> = process.env): Config {
  const result = envSchema.safeParse(sourceEnv);
  if (!result.success) {
    const errorDetails = result.error.errors
      .map((err) => `${err.path.join(".")}: ${err.message}`)
      .join(", ");
    throw new Error(`Invalid server environment configuration: ${errorDetails}`);
  }
  return result.data;
}

export const config = loadConfig();

/**
 * Phase 6.7 Milestone 1.1: Session Cookie Configuration Helpers
 * Production enforces `__Host-` prefix with Secure, HttpOnly, and no Domain.
 * Local development over HTTP gracefully falls back to `pageshooter_session` without Secure.
 */
export function getSessionCookieName(nodeEnv: string = config.NODE_ENV): string {
  return nodeEnv === "production" ? "__Host-pageshooter_session" : "pageshooter_session";
}

export function getSessionCookieOptions(nodeEnv: string = config.NODE_ENV) {
  const isProd = nodeEnv === "production";
  return {
    path: "/",
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const
    // Note: Max-Age and Expires are intentionally omitted for Option B Browser-Session cookie
  };
}

export function getClearSessionCookieOptions(nodeEnv: string = config.NODE_ENV) {
  return {
    ...getSessionCookieOptions(nodeEnv),
    maxAge: 0
  };
}
