import type { WebSocket } from "ws";

export interface WSConnectionContext {
  socketId: string;
  userId: string;
  username: string;
  jti?: string;
  roomCode: string | null;
  socket: WebSocket;
  isAlive: boolean;
  superseded: boolean;
  lastChatMessageTime: number;
  mutedUntil: number;
  emojiTimestamps: number[];
}
