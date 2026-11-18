import type { WebSocket } from "ws";
import {
  RECONNECT_WINDOW_MS
} from "@pageshooter/shared";
import { RoomManager, sanitizeRoom } from "../rooms/roomManager.js";
import type { RoomBroadcaster } from "./roomBroadcaster.js";
import type { WSConnectionContext } from "./types.js";

export class ReconnectManager {
  constructor(
    private roomManager: RoomManager,
    private broadcaster: RoomBroadcaster,
    private serverInstanceId: string
  ) {}

  onSocketDisconnect(context: WSConnectionContext, roomCode: string): void {
    // If the socket was superseded by a newer connection from the same user (e.g. multi-tab),
    // ignore this disconnect event completely (phantom disconnect prevention)
    if (context.superseded) {
      return;
    }

    const room = this.roomManager.getRoomByCode(roomCode);
    if (!room) {
      return;
    }

    // Check if the disconnected user is a spectator
    if (room.spectators.has(context.userId)) {
      room.spectators.delete(context.userId);
      this.broadcaster.broadcastToRoom(roomCode, {
        type: "SPECTATOR_LEFT",
        userId: context.userId
      });
      return;
    }

    // Check if the user is a player
    const player = room.players.get(context.userId);
    if (!player) {
      return;
    }

    // If game is in WAITING phase
    if (room.phase === "WAITING") {
      player.connected = false;
      player.socketId = null;
      return;
    }

    // If game is ACTIVE or already PAUSED
    if ((room.phase === "ACTIVE" || room.phase === "PAUSED") && room.matchState) {
      // Arm an independent 60-second timer for this player
      const timer = setTimeout(() => {
        this.onDisconnectTimeout(roomCode, context.userId);
      }, RECONNECT_WINDOW_MS);

      if (typeof timer.unref === "function") {
        timer.unref();
      }

      const pauseResult = this.roomManager.pauseMatchForPlayer(
        roomCode,
        context.userId,
        RECONNECT_WINDOW_MS,
        timer
      );

      this.broadcaster.broadcastToRoom(roomCode, {
        type: "MATCH_PAUSED",
        disconnectedPlayerId: context.userId,
        deadline: pauseResult.deadline
      });
    }
  }

  onDisconnectTimeout(roomCode: string, userId: string): void {
    const room = this.roomManager.getRoomByCode(roomCode);
    if (!room || !room.matchState || room.matchState.phase === "COMPLETED") {
      return;
    }

    // Check if this player is still tracked as disconnected
    if (!room.disconnectedPlayers.has(userId)) {
      return;
    }

    const result = this.roomManager.eliminateDisconnectedPlayer(roomCode, userId);

    // Broadcast player elimination
    this.broadcaster.broadcastToRoom(roomCode, {
      type: "PLAYER_ELIMINATED",
      targetPlayerId: userId
    });

    // Broadcast host migration if applicable
    if (result.newHostUserId) {
      this.broadcaster.broadcastToRoom(roomCode, {
        type: "HOST_MIGRATED",
        newHostUserId: result.newHostUserId,
        reason: "ACTIVE_MATCH_TIMEOUT"
      });
    }

    // Check if match completed (<= 1 player surviving)
    if (result.state.phase === "COMPLETED") {
      this.broadcaster.broadcastToRoom(roomCode, {
        type: "MATCH_COMPLETED",
        matchState: result.state,
        winnerPlayerId: result.state.winnerPlayerId ?? "",
        winReason: result.state.winReason ?? "LAST_PLAYER_STANDING"
      });
      return;
    }

    // If >= 2 players survive:
    if (room.disconnectedPlayers.size === 0) {
      // All disconnects resolved -> Match resumed!
      this.broadcaster.broadcastToRoom(roomCode, {
        type: "MATCH_RESUMED",
        reconnectedPlayerId: "TIMEOUT_RESOLVED"
      });
      this.broadcaster.broadcastToRoom(roomCode, {
        type: "MATCH_STATE_SYNC",
        matchState: result.state,
        events: result.events
      });
      if (result.nextCommitment) {
        this.broadcaster.broadcastToRoom(roomCode, {
          type: "ROLL_COMMITMENT",
          turnNumber: result.nextCommitment.turnNumber,
          commitmentHash: result.nextCommitment.commitmentHash
        });
      }
    } else {
      // Other players are still disconnected -> Match remains paused
      this.broadcaster.broadcastToRoom(roomCode, {
        type: "MATCH_STATE_SYNC",
        matchState: result.state,
        events: result.events
      });
    }
  }

  handleReconnect(
    correlationId: string,
    roomCode: string,
    userId: string,
    socketId: string,
    socket: WebSocket,
    _lastKnownVersion: number,
    clientServerInstanceId?: string
  ): void {
    const room = this.roomManager.getRoomByCode(roomCode);

    // If room is missing in memory
    if (!room) {
      if (
        clientServerInstanceId &&
        clientServerInstanceId !== this.serverInstanceId
      ) {
        // Mismatch confirms the server process restarted
        this.broadcaster.sendToSocket(socket, {
          type: "MATCH_TERMINATED_SERVER_RESTART",
          message:
            "The match ended because the game server restarted or was redeployed. Please create or join a new room."
        });
        return;
      }

      // Identical or untracked instance ID: room expired naturally or was deleted
      this.broadcaster.sendToSocket(socket, {
        type: "ERROR",
        code: "MATCH_UNAVAILABLE",
        message: "This match is no longer available. The room has expired or ended.",
        correlationId
      });
      return;
    }

    // User must be an active or disconnected player in the room
    const player = room.players.get(userId);
    if (!player) {
      this.broadcaster.sendToSocket(socket, {
        type: "ERROR",
        code: "NOT_A_PLAYER",
        message: "You are not a player in this room.",
        correlationId
      });
      return;
    }

    // Re-bind socket and subscribe to room
    this.broadcaster.subscribeToRoom(socketId, roomCode);
    this.roomManager.bindParticipantSocket(roomCode, userId, socketId);

    // If match is in progress and was paused
    if (room.matchState) {
      const resumeResult = this.roomManager.resumeMatchForPlayer(roomCode, userId);

      // Send snapshots to the reconnecting player
      this.broadcaster.sendToSocket(socket, {
        type: "ROOM_SNAPSHOT",
        room: sanitizeRoom(room),
        serverInstanceId: this.serverInstanceId,
        correlationId
      });

      this.broadcaster.sendToSocket(socket, {
        type: "MATCH_STATE_SYNC",
        matchState: room.matchState
      });

      // If Turn has a commitment, send it to the reconnecting player
      if (room.currentTurnCommitment) {
        this.broadcaster.sendToSocket(socket, {
          type: "ROLL_COMMITMENT",
          turnNumber: room.currentTurnCommitment.turnNumber,
          commitmentHash: room.currentTurnCommitment.commitmentHash
        });
      }

      // If all players have reconnected, unpause the match for everyone
      if (resumeResult.allReconnected) {
        this.broadcaster.broadcastToRoom(roomCode, {
          type: "MATCH_RESUMED",
          reconnectedPlayerId: userId
        });
        this.broadcaster.broadcastToRoom(roomCode, {
          type: "MATCH_STATE_SYNC",
          matchState: room.matchState,
          events: resumeResult.events
        });
      } else {
        // Broadcast sync to other players reflecting reconnected status
        this.broadcaster.broadcastToRoom(
          roomCode,
          {
            type: "MATCH_STATE_SYNC",
            matchState: room.matchState
          },
          socketId
        );
      }
    } else {
      // Room in WAITING phase
      this.broadcaster.sendToSocket(socket, {
        type: "ROOM_SNAPSHOT",
        room: sanitizeRoom(room),
        serverInstanceId: this.serverInstanceId,
        correlationId
      });
    }
  }
}
