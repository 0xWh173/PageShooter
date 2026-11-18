import type { WebSocket } from "ws";
import {
  type WSServerMessage,
  WS_CLOSE_CODE_SESSION_SUPERSEDED
} from "@pageshooter/shared";
import type { WSConnectionContext } from "./types.js";

export class RoomBroadcaster {
  // socketId -> WSConnectionContext
  private sockets = new Map<string, WSConnectionContext>();

  // roomCode -> Set of socketIds
  private roomSockets = new Map<string, Set<string>>();

  // userId -> socketId (latest active socket per user)
  private userSockets = new Map<string, string>();

  registerSocket(context: WSConnectionContext): void {
    this.sockets.set(context.socketId, context);
  }

  unregisterSocket(socketId: string): WSConnectionContext | undefined {
    const ctx = this.sockets.get(socketId);
    if (!ctx) return undefined;

    this.sockets.delete(socketId);
    if (ctx.roomCode) {
      const roomSet = this.roomSockets.get(ctx.roomCode);
      if (roomSet) {
        roomSet.delete(socketId);
        if (roomSet.size === 0) {
          this.roomSockets.delete(ctx.roomCode);
        }
      }
    }

    if (this.userSockets.get(ctx.userId) === socketId) {
      this.userSockets.delete(ctx.userId);
    }

    return ctx;
  }

  getContext(socketId: string): WSConnectionContext | undefined {
    return this.sockets.get(socketId);
  }

  getContextByUserId(userId: string): WSConnectionContext | undefined {
    const socketId = this.userSockets.get(userId);
    if (!socketId) return undefined;
    return this.sockets.get(socketId);
  }

  getSocketsByUserId(userId: string): WSConnectionContext[] {
    const list: WSConnectionContext[] = [];
    for (const ctx of this.sockets.values()) {
      if (ctx.userId === userId) {
        list.push(ctx);
      }
    }
    return list;
  }

  subscribeToRoom(socketId: string, roomCode: string): void {
    const ctx = this.sockets.get(socketId);
    if (!ctx) return;

    // Handle multi-tab socket supersession:
    // If this user already has an active socket in this room, supersede it
    const existingSocketId = this.userSockets.get(ctx.userId);
    if (existingSocketId && existingSocketId !== socketId) {
      const oldCtx = this.sockets.get(existingSocketId);
      if (oldCtx && oldCtx.roomCode === roomCode && !oldCtx.superseded) {
        oldCtx.superseded = true;
        try {
          oldCtx.socket.close(
            WS_CLOSE_CODE_SESSION_SUPERSEDED,
            "Session Overwritten"
          );
        } catch {
          // Socket might already be closing
        }
      }
    }

    // Unsubscribe from old room if changing
    if (ctx.roomCode && ctx.roomCode !== roomCode) {
      this.unsubscribeFromRoom(socketId);
    }

    ctx.roomCode = roomCode;
    this.userSockets.set(ctx.userId, socketId);

    let roomSet = this.roomSockets.get(roomCode);
    if (!roomSet) {
      roomSet = new Set<string>();
      this.roomSockets.set(roomCode, roomSet);
    }
    roomSet.add(socketId);
  }

  unsubscribeFromRoom(socketId: string): void {
    const ctx = this.sockets.get(socketId);
    if (!ctx || !ctx.roomCode) return;

    const roomSet = this.roomSockets.get(ctx.roomCode);
    if (roomSet) {
      roomSet.delete(socketId);
      if (roomSet.size === 0) {
        this.roomSockets.delete(ctx.roomCode);
      }
    }
    ctx.roomCode = null;
  }

  broadcastToRoom(
    roomCode: string,
    message: WSServerMessage,
    excludeSocketId?: string
  ): void {
    const roomSet = this.roomSockets.get(roomCode);
    if (!roomSet) return;

    const payload = JSON.stringify(message);
    for (const sId of roomSet) {
      if (excludeSocketId && sId === excludeSocketId) continue;
      const ctx = this.sockets.get(sId);
      if (ctx && ctx.socket.readyState === 1 /* WebSocket.OPEN */) {
        try {
          ctx.socket.send(payload);
        } catch {
          // Ignore send errors during disconnect
        }
      }
    }
  }

  sendToSocket(socket: WebSocket, message: WSServerMessage): void {
    if (socket.readyState === 1 /* WebSocket.OPEN */) {
      try {
        socket.send(JSON.stringify(message));
      } catch {
        // Ignore
      }
    }
  }

  sendToUser(roomCode: string, userId: string, message: WSServerMessage): void {
    const ctx = this.getContextByUserId(userId);
    if (ctx && ctx.roomCode === roomCode) {
      this.sendToSocket(ctx.socket, message);
    }
  }

  clear(): void {
    this.sockets.clear();
    this.roomSockets.clear();
    this.userSockets.clear();
  }
}
