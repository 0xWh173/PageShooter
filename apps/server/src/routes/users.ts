import { type FastifyPluginAsync } from "fastify";
import { AuthService, AuthError } from "../services/authService.js";
import { requireAuth, verifyMutatingOrigin, checkPreCommitRevocation } from "../middleware/auth.js";

export interface UserRoutesOptions {
  authService: AuthService;
}

export const userRoutes: FastifyPluginAsync<UserRoutesOptions> = async (fastify, options) => {
  const { authService } = options;

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

  // GET /api/users/me
  fastify.get(
    "/me",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      const user = await authService.getCurrentUser(request.user!.userId);
      return reply.status(200).send({ user });
    }
  );

  // PATCH /api/users/me/username
  fastify.patch(
    "/me/username",
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
      const user = await authService.changeUsername(request.user!.userId, request.body);
      if (!checkPreCommitRevocation(request, reply)) return;
      return reply.status(200).send({ user });
    }
  );
};
