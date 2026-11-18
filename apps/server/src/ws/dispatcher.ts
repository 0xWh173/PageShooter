import type { RawData } from "ws";
import {
  WSClientMessageSchema,
  ALLOWED_EMOJI_IDS,
  CHAT_COOLDOWN_MS,
  CHAT_MUTE_DURATION_MS,
  EMOJI_WINDOW_MS,
  EMOJI_MAX_PER_WINDOW,
  GameRuleError,
  WS_CLOSE_CODE_UNAUTHORIZED,
  type WSClientMessage
} from "@pageshooter/shared";
import { RoomManager, RoomError, sanitizeRoom } from "../rooms/roomManager.js";
import { revocationManager as defaultRevocationManager, type RevocationManager } from "../services/revocation.js";
import type { RoomBroadcaster } from "./roomBroadcaster.js";
import type { ReconnectManager } from "./reconnectManager.js";
import type { WSConnectionContext } from "./types.js";

export class WSDispatcher {
  constructor(
    private roomManager: RoomManager,
    private broadcaster: RoomBroadcaster,
    private reconnectManager: ReconnectManager,
    private serverInstanceId: string,
    private revocationManager: RevocationManager = defaultRevocationManager
  ) {}

  dispatchMessage(context: WSConnectionContext, rawData: RawData): void {
    if (!context.isAlive || context.superseded) {
      return;
    }

    if (context.jti && this.revocationManager.isRevoked(context.jti)) {
      context.isAlive = false;
      try {
        context.socket.close(WS_CLOSE_CODE_UNAUTHORIZED, "Session revoked");
      } catch {
        // Ignore
      }
      return;
    }

    const rawString = typeof rawData === "string" ? rawData : rawData.toString("utf8");

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(rawString);
    } catch {
      this.broadcaster.sendToSocket(context.socket, {
        type: "ERROR",
        code: "MALFORMED_JSON",
        message: "Invalid JSON frame received."
      });
      return;
    }

    const parseResult = WSClientMessageSchema.safeParse(parsedJson);
    if (!parseResult.success) {
      const correlationId =
        typeof parsedJson === "object" && parsedJson !== null && "correlationId" in parsedJson
          ? String((parsedJson as { correlationId: unknown }).correlationId)
          : undefined;

      this.broadcaster.sendToSocket(context.socket, {
        type: "ERROR",
        code: "VALIDATION_ERROR",
        message: parseResult.error.errors.map((e) => e.message).join("; "),
        correlationId
      });
      return;
    }

    const message: WSClientMessage = parseResult.data;

    try {
      this.handleCommand(context, message);
    } catch (err) {
      const correlationId = "correlationId" in message ? message.correlationId : undefined;

      if (err instanceof RoomError) {
        this.broadcaster.sendToSocket(context.socket, {
          type: "ERROR",
          code: err.code,
          message: err.message,
          correlationId
        });
      } else if (err instanceof GameRuleError) {
        this.broadcaster.sendToSocket(context.socket, {
          type: "ERROR",
          code: err.code,
          message: err.message,
          correlationId
        });
      } else {
        this.broadcaster.sendToSocket(context.socket, {
          type: "ERROR",
          code: "INTERNAL_ERROR",
          message: err instanceof Error ? err.message : "An unexpected server error occurred.",
          correlationId
        });
      }
    }
  }

  private handleCommand(context: WSConnectionContext, message: WSClientMessage): void {
    const now = Date.now();

    switch (message.type) {
      case "PING": {
        this.broadcaster.sendToSocket(context.socket, { type: "PONG" });
        return;
      }

      case "JOIN_ROOM": {
        const activeRes = this.roomManager.resolveUserRoomParticipation(context.userId);
        if (activeRes?.hasActiveMatchParticipation && activeRes.roomCode !== message.roomCode) {
          throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot join another room while an active match is in progress");
        }

        const { room, participant } = this.roomManager.joinAsPlayer(message.roomCode, {
          id: context.userId,
          username: context.username,
          avatarId: "barnaby"
        });

        this.broadcaster.subscribeToRoom(context.socketId, room.roomCode);
        this.roomManager.bindParticipantSocket(room.roomCode, context.userId, context.socketId);

        // Send ROOM_SNAPSHOT to the joining player
        this.broadcaster.sendToSocket(context.socket, {
          type: "ROOM_SNAPSHOT",
          room: sanitizeRoom(room),
          serverInstanceId: this.serverInstanceId,
          correlationId: message.correlationId
        });

        // Broadcast PLAYER_JOINED to existing participants in the room
        this.broadcaster.broadcastToRoom(
          room.roomCode,
          {
            type: "PLAYER_JOINED",
            player: participant
          },
          context.socketId
        );
        return;
      }

      case "JOIN_AS_SPECTATOR": {
        const activeRes = this.roomManager.resolveUserRoomParticipation(context.userId);
        if (activeRes?.hasActiveMatchParticipation && activeRes.roomCode !== message.roomCode) {
          throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot spectate another room while an active match is in progress");
        }

        const { room, participant } = this.roomManager.joinAsSpectator(message.roomCode, {
          id: context.userId,
          username: context.username,
          avatarId: "barnaby"
        });

        this.broadcaster.subscribeToRoom(context.socketId, room.roomCode);
        this.roomManager.bindParticipantSocket(room.roomCode, context.userId, context.socketId);

        // Send snapshot to the joining spectator
        this.broadcaster.sendToSocket(context.socket, {
          type: "ROOM_SNAPSHOT",
          room: sanitizeRoom(room),
          serverInstanceId: this.serverInstanceId,
          correlationId: message.correlationId
        });

        // Broadcast SPECTATOR_JOINED to others
        this.broadcaster.broadcastToRoom(
          room.roomCode,
          {
            type: "SPECTATOR_JOINED",
            spectator: participant
          },
          context.socketId
        );
        return;
      }

      case "LEAVE_ROOM": {
        const result = this.roomManager.leaveRoom(message.roomCode, context.userId);
        this.broadcaster.unsubscribeFromRoom(context.socketId);

        this.broadcaster.sendToSocket(context.socket, {
          type: "ACK",
          correlationId: message.correlationId
        });

        if (!result.roomDeleted) {
          this.broadcaster.broadcastToRoom(message.roomCode, {
            type: "PLAYER_LEFT",
            userId: context.userId
          });

          if (result.newHostUserId) {
            this.broadcaster.broadcastToRoom(message.roomCode, {
              type: "HOST_MIGRATED",
              newHostUserId: result.newHostUserId,
              reason: "HOST_LEFT"
            });
          }
        }
        return;
      }

      case "KICK_PLAYER": {
        const { kicked } = this.roomManager.kickPlayer(
          message.roomCode,
          context.userId,
          message.targetUserId
        );

        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "PLAYER_KICKED",
          userId: context.userId,
          targetUserId: message.targetUserId
        });

        // Unsubscribe the kicked participant's socket if connected
        const targetCtx = this.broadcaster.getContextByUserId(message.targetUserId);
        if (targetCtx && targetCtx.roomCode === message.roomCode) {
          this.broadcaster.unsubscribeFromRoom(targetCtx.socketId);
        }

        this.broadcaster.sendToSocket(context.socket, {
          type: "ACK",
          correlationId: message.correlationId,
          message: `Kicked ${kicked.username}`
        });
        return;
      }

      case "START_MATCH": {
        const result = this.roomManager.startMatch(message.roomCode, context.userId);

        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "MATCH_STARTED",
          matchState: result.matchState
        });

        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "ROLL_COMMITMENT",
          turnNumber: result.commitment.turnNumber,
          commitmentHash: result.commitment.commitmentHash
        });
        return;
      }

      case "ROLL_REQUEST": {
        const result = this.roomManager.executeRoll(message.roomCode, context.userId, {
          expectedStateVersion: message.expectedStateVersion
        });

        // 1. Broadcast the revealed roll with the secret seed
        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "ROLL_REVEALED",
          turnNumber: result.rollResult.turnNumber,
          outcome: result.rollResult.outcome,
          pageNumber: result.rollResult.pageNumber,
          seed: result.rollResult.seed
        });

        // 2. Broadcast the state sync with events
        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "MATCH_STATE_SYNC",
          matchState: result.state,
          events: result.events
        });

        // 3. Broadcast next turn commitment if awaiting roll
        if (result.nextCommitment) {
          this.broadcaster.broadcastToRoom(message.roomCode, {
            type: "ROLL_COMMITMENT",
            turnNumber: result.nextCommitment.turnNumber,
            commitmentHash: result.nextCommitment.commitmentHash
          });
        }

        // 4. If victory condition was triggered
        if (result.state.phase === "COMPLETED") {
          this.broadcaster.broadcastToRoom(message.roomCode, {
            type: "MATCH_COMPLETED",
            matchState: result.state,
            winnerPlayerId: result.state.winnerPlayerId ?? "",
            winReason: result.state.winReason ?? "LAST_PLAYER_STANDING"
          });
        }
        return;
      }

      case "SHOOT_REQUEST": {
        const result = this.roomManager.executeShot(
          message.roomCode,
          context.userId,
          message.targetPlayerId,
          message.targetCellValue,
          { expectedStateVersion: message.expectedStateVersion }
        );

        // 1. Broadcast state sync with shot/destruction events
        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "MATCH_STATE_SYNC",
          matchState: result.state,
          events: result.events
        });

        // 2. Broadcast next turn commitment if turn advanced
        if (result.nextCommitment) {
          this.broadcaster.broadcastToRoom(message.roomCode, {
            type: "ROLL_COMMITMENT",
            turnNumber: result.nextCommitment.turnNumber,
            commitmentHash: result.nextCommitment.commitmentHash
          });
        }

        // 3. If victory condition was triggered
        if (result.state.phase === "COMPLETED") {
          this.broadcaster.broadcastToRoom(message.roomCode, {
            type: "MATCH_COMPLETED",
            matchState: result.state,
            winnerPlayerId: result.state.winnerPlayerId ?? "",
            winReason: result.state.winReason ?? "LAST_PLAYER_STANDING"
          });
        }
        return;
      }

      case "RECONNECT_MATCH": {
        this.reconnectManager.handleReconnect(
          message.correlationId,
          message.roomCode,
          context.userId,
          context.socketId,
          context.socket,
          message.lastKnownVersion,
          message.serverInstanceId
        );
        return;
      }

      case "SEND_CHAT_MESSAGE": {
        // Enforce room membership
        const room = this.roomManager.getRoomByCode(message.roomCode);
        if (!room) {
          throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found");
        }
        if (!room.players.has(context.userId) && !room.spectators.has(context.userId)) {
          throw new RoomError(403, "NOT_IN_ROOM", "Must be in room to send chat messages");
        }

        // Check if currently muted
        if (now < context.mutedUntil) {
          this.broadcaster.sendToSocket(context.socket, {
            type: "ERROR",
            code: "MUTED",
            message: "You are muted for sending messages too quickly. Please wait 30 seconds.",
            correlationId: message.correlationId
          });
          return;
        }

        // Check chat rate limit: 1 message per 2 seconds
        if (now - context.lastChatMessageTime < CHAT_COOLDOWN_MS) {
          // Violation: Apply 30-second mute
          context.mutedUntil = now + CHAT_MUTE_DURATION_MS;
          this.broadcaster.sendToSocket(context.socket, {
            type: "ERROR",
            code: "MUTED",
            message: "You are muted for sending messages too quickly. Please wait 30 seconds.",
            correlationId: message.correlationId
          });
          return;
        }

        context.lastChatMessageTime = now;

        const role = room.players.get(context.userId)?.role || "SPECTATOR";
        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "CHAT_BROADCAST",
          senderUserId: context.userId,
          senderUsername: context.username,
          role,
          message: message.message,
          timestamp: now
        });
        return;
      }

      case "SEND_EMOJI_REACTION": {
        const room = this.roomManager.getRoomByCode(message.roomCode);
        if (!room) {
          throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found");
        }
        if (!room.players.has(context.userId) && !room.spectators.has(context.userId)) {
          throw new RoomError(403, "NOT_IN_ROOM", "Must be in room to send emoji reactions");
        }

        // Whitelist check
        if (!ALLOWED_EMOJI_IDS.includes(message.emojiId as (typeof ALLOWED_EMOJI_IDS)[number])) {
          this.broadcaster.sendToSocket(context.socket, {
            type: "ERROR",
            code: "VALIDATION_ERROR",
            message: `Invalid emoji ID: ${message.emojiId}`,
            correlationId: message.correlationId
          });
          return;
        }

        // Sliding 1-second window check: max 2 emojis per second
        const windowStart = now - EMOJI_WINDOW_MS;
        context.emojiTimestamps = context.emojiTimestamps.filter((t) => t > windowStart);

        if (context.emojiTimestamps.length >= EMOJI_MAX_PER_WINDOW) {
          // Drop excess emojis silently per specification
          return;
        }

        context.emojiTimestamps.push(now);

        this.broadcaster.broadcastToRoom(message.roomCode, {
          type: "EMOJI_BROADCAST",
          senderUserId: context.userId,
          emojiId: message.emojiId,
          timestamp: now
        });
        return;
      }

      case "DOWNLOAD_MATCH_REPORT": {
        const room = this.roomManager.getRoomByCode(message.roomCode);
        if (!room) {
          throw new RoomError(404, "ROOM_NOT_FOUND", "Room not found");
        }
        if (room.hostUserId !== context.userId) {
          throw new RoomError(403, "NOT_HOST", "Only host may download match report");
        }
        this.broadcaster.sendToSocket(context.socket, {
          type: "TEMPORARY_REPORT_DATA",
          report: {
            roomId: room.roomId,
            roomCode: room.roomCode,
            match: room.matchState
          }
        });
        return;
      }
    }
  }
}
