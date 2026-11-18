import { type FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GameRuleError } from "@pageshooter/shared";
import { RoomManager, RoomError, sanitizeRoom } from "../rooms/roomManager.js";
import { verifyRollCommitment } from "../game/commitment.js";
import { requireAuth, verifyMutatingOrigin, checkPreCommitRevocation } from "../middleware/auth.js";
import { AuthService } from "../services/authService.js";

export interface RoomRoutesOptions {
  roomManager: RoomManager;
  authService: AuthService;
}

const kickBodySchema = z.object({
  targetUserId: z.string().uuid("Invalid target user ID")
});

const rollBodySchema = z
  .object({
    expectedStateVersion: z.number().int().nonnegative().optional(),
    commandId: z.string().optional()
  })
  .optional();

const shootBodySchema = z.object({
  targetUserId: z.string().uuid("Invalid target user ID"),
  targetCellValue: z.union([
    z.literal(0),
    z.literal(2),
    z.literal(4),
    z.literal(6),
    z.literal(8)
  ]),
  expectedStateVersion: z.number().int().nonnegative().optional(),
  commandId: z.string().optional()
});

const verifyRollBodySchema = z.object({
  seed: z.string().min(1),
  matchId: z.string().uuid(),
  turnNumber: z.number().int().positive(),
  commitmentHash: z.string().min(1),
  outcome: z.union([
    z.literal(0),
    z.literal(2),
    z.literal(4),
    z.literal(6),
    z.literal(8)
  ]),
  pageNumber: z.number().int().min(1).max(500)
});

export const roomRoutes: FastifyPluginAsync<RoomRoutesOptions> = async (fastify, options) => {
  const { roomManager, authService } = options;

  async function resolveRouteUser(tokenUser: { userId: string; username: string }) {
    try {
      return await authService.getCurrentUser(tokenUser.userId);
    } catch {
      return {
        id: tokenUser.userId,
        username: tokenUser.username,
        avatarId: "barnaby"
      };
    }
  }

  fastify.setErrorHandler((error: unknown, _request, reply) => {
    if (error instanceof RoomError) {
      return reply.status(error.statusCode).send({
        statusCode: error.statusCode,
        error: error.code,
        message: error.message
      });
    }
    if (error instanceof GameRuleError) {
      const statusCode = error.code === "STALE_STATE" || error.code === "DUPLICATE_COMMAND" ? 409 : 400;
      return reply.status(statusCode).send({
        statusCode,
        error: error.code,
        message: error.message
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

  // GET /api/rooms/my-active (Server-Assisted Active Room Discovery)
  fastify.get(
    "/my-active",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      const activeRoom = roomManager.resolveUserRoomParticipation(request.user!.userId);
      return reply.status(200).send({ activeRoom });
    }
  );

  // POST /api/rooms (Create Room)
  fastify.post(
    "",
    {
      preHandler: [requireAuth, verifyMutatingOrigin],
      config: {
        rateLimit: {
          max: 10,
          timeWindow: "1 minute"
        }
      }
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;

      const user = await resolveRouteUser(request.user!);
      if (!checkPreCommitRevocation(request, reply)) return;

      // Single recoverable room invariant check
      const existing = roomManager.resolveUserRoomParticipation(user.id);
      if (existing?.hasActiveMatchParticipation) {
        throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot create a new room while an active match is in progress");
      }

      const room = roomManager.createRoom({
        id: user.id,
        username: user.username,
        avatarId: user.avatarId
      });
      return reply.status(201).send({ room: sanitizeRoom(room) });
    }
  );

  // GET /api/rooms/:roomCode (Get Room Details)
  fastify.get(
    "/:roomCode",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      const { roomCode } = request.params as { roomCode: string };
      const room = roomManager.getRoomByCode(roomCode);
      if (!room) {
        throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found or has expired");
      }
      return reply.status(200).send({ room: sanitizeRoom(room) });
    }
  );

  // POST /api/rooms/:roomCode/join (Join as Player)
  fastify.post(
    "/:roomCode/join",
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
      if (!checkPreCommitRevocation(request, reply)) return;

      const { roomCode } = request.params as { roomCode: string };
      const user = await resolveRouteUser(request.user!);
      if (!checkPreCommitRevocation(request, reply)) return;

      // Single recoverable room invariant check
      const existing = roomManager.resolveUserRoomParticipation(user.id);
      if (existing?.hasActiveMatchParticipation && existing.roomCode !== roomCode) {
        throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot join another room while an active match is in progress");
      }

      const result = roomManager.joinAsPlayer(roomCode, {
        id: user.id,
        username: user.username,
        avatarId: user.avatarId
      });
      return reply.status(200).send({
        room: sanitizeRoom(result.room),
        participant: result.participant
      });
    }
  );

  // POST /api/rooms/:roomCode/spectate (Join as Spectator)
  fastify.post(
    "/:roomCode/spectate",
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
      if (!checkPreCommitRevocation(request, reply)) return;

      const { roomCode } = request.params as { roomCode: string };
      const user = await resolveRouteUser(request.user!);
      if (!checkPreCommitRevocation(request, reply)) return;

      // Single recoverable room invariant check
      const existing = roomManager.resolveUserRoomParticipation(user.id);
      if (existing?.hasActiveMatchParticipation && existing.roomCode !== roomCode) {
        throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot spectate another room while an active match is in progress");
      }

      const result = roomManager.joinAsSpectator(roomCode, {
        id: user.id,
        username: user.username,
        avatarId: user.avatarId
      });
      return reply.status(200).send({
        room: sanitizeRoom(result.room),
        participant: result.participant
      });
    }
  );

  // POST /api/rooms/:roomCode/kick (Kick Participant)
  fastify.post(
    "/:roomCode/kick",
    {
      preHandler: [requireAuth, verifyMutatingOrigin]
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;

      const { roomCode } = request.params as { roomCode: string };
      const parseResult = kickBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new RoomError(400, "VALIDATION_ERROR", "Invalid target user ID");
      }
      const { targetUserId } = parseResult.data;
      const result = roomManager.kickPlayer(roomCode, request.user!.userId, targetUserId);
      return reply.status(200).send(result);
    }
  );

  // POST /api/rooms/:roomCode/leave (Leave Room)
  fastify.post(
    "/:roomCode/leave",
    {
      preHandler: [requireAuth, verifyMutatingOrigin]
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;

      const { roomCode } = request.params as { roomCode: string };
      const result = roomManager.leaveRoom(roomCode, request.user!.userId);
      return reply.status(200).send(result);
    }
  );

  // POST /api/rooms/:roomCode/start (Start Match)
  fastify.post(
    "/:roomCode/start",
    {
      preHandler: [requireAuth, verifyMutatingOrigin]
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;

      const { roomCode } = request.params as { roomCode: string };
      const result = roomManager.startMatch(roomCode, request.user!.userId);
      return reply.status(200).send({
        room: sanitizeRoom(result.room),
        match: result.matchState,
        currentCommitment: result.commitment
      });
    }
  );

  // POST /api/rooms/:roomCode/roll (Execute Roll)
  fastify.post(
    "/:roomCode/roll",
    {
      preHandler: [requireAuth, verifyMutatingOrigin]
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;

      const { roomCode } = request.params as { roomCode: string };
      const parseResult = rollBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new RoomError(400, "VALIDATION_ERROR", "Invalid roll command parameters");
      }
      const options = parseResult.data;
      const result = roomManager.executeRoll(roomCode, request.user!.userId, options);
      return reply.status(200).send(result);
    }
  );

  // POST /api/rooms/:roomCode/shoot (Execute Shot)
  fastify.post(
    "/:roomCode/shoot",
    {
      preHandler: [requireAuth, verifyMutatingOrigin]
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;

      const { roomCode } = request.params as { roomCode: string };
      const parseResult = shootBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new RoomError(400, "VALIDATION_ERROR", "Invalid shoot command parameters");
      }
      const { targetUserId, targetCellValue, expectedStateVersion, commandId } = parseResult.data;
      const result = roomManager.executeShot(
        roomCode,
        request.user!.userId,
        targetUserId,
        targetCellValue,
        { expectedStateVersion, commandId }
      );
      return reply.status(200).send(result);
    }
  );

  // GET /api/rooms/:roomCode/match (Get Active Match State & Public Commitment)
  fastify.get(
    "/:roomCode/match",
    {
      preHandler: [requireAuth]
    },
    async (request, reply) => {
      const { roomCode } = request.params as { roomCode: string };
      const result = roomManager.getMatch(roomCode);
      return reply.status(200).send(result);
    }
  );

  // POST /api/rooms/:roomCode/verify-roll (Verify Roll Commitment Proof)
  fastify.post(
    "/:roomCode/verify-roll",
    {
      preHandler: [requireAuth, verifyMutatingOrigin]
    },
    async (request, reply) => {
      if (!checkPreCommitRevocation(request, reply)) return;

      const parseResult = verifyRollBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        throw new RoomError(400, "VALIDATION_ERROR", "Invalid verification parameters");
      }
      const { seed, matchId, turnNumber, commitmentHash, outcome, pageNumber } = parseResult.data;
      const valid = verifyRollCommitment(seed, matchId, turnNumber, commitmentHash, outcome, pageNumber);
      return reply.status(200).send({ valid });
    }
  );
};
