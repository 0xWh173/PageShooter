import { type FastifyRequest, type FastifyReply } from "fastify";
import { config, getSessionCookieName } from "../config.js";
import { verifyToken, type TokenPayload } from "../services/token.js";
import { revocationManager } from "../services/revocation.js";

// Extend FastifyRequest type to include authenticated user
declare module "fastify" {
  interface FastifyRequest {
    user?: TokenPayload;
  }
}

/**
 * Authentication Middleware:
 * Validates session cookie (primary) or Bearer header (test environments).
 * Validates HS256 claims and checks the in-memory RevocationManager.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const currentConfig = request.server.pageshooterConfig ?? config;
  const cookieName = getSessionCookieName(currentConfig.NODE_ENV);
  const cookieToken =
    request.cookies?.[cookieName] ??
    request.cookies?.["__Host-pageshooter_session"] ??
    request.cookies?.["pageshooter_session"];
  const authHeader = request.headers.authorization;

  let token: string | undefined = cookieToken;

  if (!token && currentConfig.NODE_ENV === "test" && authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    return reply.status(401).send({
      statusCode: 401,
      error: "UNAUTHORIZED",
      message: "Missing authentication session"
    });
  }

  try {
    const payload = verifyToken(token);

    // Verify revocation status
    if (payload.jti && revocationManager.isRevoked(payload.jti)) {
      return reply.status(401).send({
        statusCode: 401,
        error: "TOKEN_REVOKED",
        message: "Session has been revoked"
      });
    }

    request.user = payload;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid or expired token";
    return reply.status(401).send({
      statusCode: 401,
      error: "UNAUTHORIZED",
      message: `Authentication failed: ${message}`
    });
  }
}

/**
 * State-changing CSRF defense middleware for browser REST endpoints:
 * Enforces X-PageShooter-Client: web custom header and strict Origin matching against CORS_ORIGIN.
 */
export async function verifyMutatingOrigin(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const method = request.method.toUpperCase();
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
    return;
  }

  const currentConfig = request.server.pageshooterConfig ?? config;

  // Allow headless test runners using Bearer token in test environment
  const isHeadlessBearerTest =
    currentConfig.NODE_ENV === "test" &&
    Boolean(request.headers.authorization?.startsWith("Bearer ")) &&
    !request.headers["x-pageshooter-client"];

  if (!isHeadlessBearerTest) {
    const clientHeader = request.headers["x-pageshooter-client"];
    if (clientHeader !== "web") {
      return reply.status(403).send({
        statusCode: 403,
        error: "CSRF_INVALID_CLIENT_HEADER",
        message: "Missing or invalid X-PageShooter-Client header"
      });
    }

    const origin = request.headers.origin;
    const allowedOrigins = currentConfig.CORS_ORIGIN.split(",").map((o) => o.trim());

    if (!origin) {
      if (currentConfig.NODE_ENV !== "test") {
        return reply.status(403).send({
          statusCode: 403,
          error: "CSRF_ORIGIN_REJECTED",
          message: "Missing Origin header on state-changing request"
        });
      }
    } else if (!allowedOrigins.includes(origin) && !allowedOrigins.includes("*")) {
      return reply.status(403).send({
        statusCode: 403,
        error: "CSRF_ORIGIN_REJECTED",
        message: "Cross-origin request rejected"
      });
    }
  }
}

/**
 * In-Flight Pre-Commit Revocation Guard:
 * Checks whether the session was revoked concurrently while an asynchronous operation was in flight.
 */
export function checkPreCommitRevocation(request: FastifyRequest, reply: FastifyReply): boolean {
  if (request.user?.jti && revocationManager.isRevoked(request.user.jti)) {
    reply.status(401).send({
      statusCode: 401,
      error: "SESSION_REVOKED",
      message: "Session was revoked during operation execution"
    });
    return false;
  }
  return true;
}
