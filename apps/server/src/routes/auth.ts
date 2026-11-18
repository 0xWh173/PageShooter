import crypto from "node:crypto";
import { type FastifyPluginAsync } from "fastify";
import { config, getSessionCookieName, getSessionCookieOptions, getClearSessionCookieOptions } from "../config.js";
import { AuthService, AuthError } from "../services/authService.js";
import { generateToken } from "../services/token.js";
import { type GoogleTokenVerifier } from "../services/googleAuth.js";
import { requireAuth, verifyMutatingOrigin, checkPreCommitRevocation } from "../middleware/auth.js";
import { revocationManager } from "../services/revocation.js";
import type { WebSocketGateway } from "../ws/gateway.js";

export interface AuthRoutesOptions {
  authService: AuthService;
  googleTokenVerifier?: GoogleTokenVerifier;
  wsGateway?: WebSocketGateway;
}

export const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (fastify, options) => {
  const { authService, googleTokenVerifier, wsGateway } = options;
  const currentConfig = fastify.pageshooterConfig ?? config;

  // Global error handler for auth routes
  fastify.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof AuthError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.code,
        message: error.message,
        details: error.details
      });
    }
    const err = error as { statusCode?: number; name?: string; message?: string } | undefined;
    const statusCode = err?.statusCode || 500;
    return reply.status(statusCode).send({
      statusCode,
      error: err?.name || "INTERNAL_ERROR",
      message: err?.message || "An unexpected error occurred"
    });
  });

  // POST /api/auth/register-password
  fastify.post(
    "/register-password",
    {
      preHandler: [verifyMutatingOrigin],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const result = await authService.registerPassword(request.body);
      const cookieName = getSessionCookieName(currentConfig.NODE_ENV);
      if (result.token) {
        reply.setCookie(cookieName, result.token, getSessionCookieOptions(currentConfig.NODE_ENV));
      }
      return reply.status(201).send({ user: result.user });
    }
  );

  // POST /api/auth/login-password
  fastify.post(
    "/login-password",
    {
      preHandler: [verifyMutatingOrigin],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const result = await authService.loginPassword(request.body);
      const cookieName = getSessionCookieName(currentConfig.NODE_ENV);
      if (result.token) {
        reply.setCookie(cookieName, result.token, getSessionCookieOptions(currentConfig.NODE_ENV));
      }
      return reply.status(200).send({ user: result.user });
    }
  );

  // POST /api/auth/google
  fastify.post(
    "/google",
    {
      preHandler: [verifyMutatingOrigin],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      const result = await authService.loginOrRegisterGoogle(request.body, googleTokenVerifier);
      const cookieName = getSessionCookieName(currentConfig.NODE_ENV);
      if (result.token) {
        reply.setCookie(cookieName, result.token, getSessionCookieOptions(currentConfig.NODE_ENV));
      }
      return reply.status(200).send({ user: result.user });
    }
  );

  // POST /api/auth/link-google (Explicit authenticated linking)
  fastify.post(
    "/link-google",
    {
      preHandler: [requireAuth, verifyMutatingOrigin],
      config: {
        rateLimit: {
          max: 5,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;
      const result = await authService.linkGoogleAccount(request.user!.userId, request.body, googleTokenVerifier);
      return reply.status(200).send({ user: result });
    }
  );

  // POST /api/auth/logout
  fastify.post(
    "/logout",
    {
      preHandler: [requireAuth, verifyMutatingOrigin],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      if (request.user?.jti) {
        const expMs = request.user.exp ? request.user.exp * 1000 : Date.now() + 24 * 60 * 60 * 1000;
        const revoked = revocationManager.revoke(request.user.jti, expMs);
        if (!revoked) {
          return reply.status(503).send({
            statusCode: 503,
            error: "REVOCATION_CAPACITY_EXHAUSTED",
            message: "Server revocation capacity is full. Logout could not be recorded."
          });
        }
      }

      // Terminate any active WebSocket connections owned by this user
      if (wsGateway) {
        wsGateway.terminateUserSockets(request.user!.userId, "LOGOUT");
      }

      // Clear session cookie
      const cookieName = getSessionCookieName(currentConfig.NODE_ENV);
      reply.setCookie(cookieName, "", getClearSessionCookieOptions(currentConfig.NODE_ENV));

      return reply.status(200).send({ success: true });
    }
  );

  // POST /api/auth/guest (Zero-Login Instant Online Scribe Session)
  fastify.post(
    "/guest",
    {
      preHandler: [verifyMutatingOrigin]
    },
    async (request, reply) => {
      const body = (request.body || {}) as { username?: string; avatarId?: string };
      const rawName = (body.username || "").trim().replace(/[^a-zA-Z0-9_]/g, "");
      const suffix = crypto.randomInt(1000, 9999);
      const username = rawName.length >= 3 ? rawName.slice(0, 20) : `Scribe_${suffix}`;
      const userId = crypto.randomUUID();
      const avatarId = body.avatarId || "barnaby";
      const nowIso = new Date().toISOString();

      const token = generateToken({ userId, username });
      const cookieName = getSessionCookieName(currentConfig.NODE_ENV);
      reply.setCookie(cookieName, token, getSessionCookieOptions(currentConfig.NODE_ENV));

      return reply.status(200).send({
        user: {
          id: userId,
          username,
          email: "",
          avatarId,
          usernameUpdatedAt: nowIso,
          createdAt: nowIso
        }
      });
    }
  );

  // GET /api/auth/session
  fastify.get(
    "/session",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      try {
        const user = await authService.getCurrentUser(request.user!.userId);
        return reply.status(200).send({ user });
      } catch {
        const nowIso = new Date().toISOString();
        return reply.status(200).send({
          user: {
            id: request.user!.userId,
            username: request.user!.username,
            email: "",
            avatarId: "barnaby",
            usernameUpdatedAt: nowIso,
            createdAt: nowIso
          }
        });
      }
    }
  );
};
