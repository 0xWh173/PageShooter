import { z } from "zod";
import type {
  CellValue,
  MatchEvent,
  MatchState,
  PublicRoomState,
  RoomParticipant,
  WinReason
} from "./index.js";

// Protocol Constraints
export const MAX_WS_FRAME_BYTES = 4096;
export const CHAT_MESSAGE_MAX_CHARS = 200;
export const CHAT_COOLDOWN_MS = 2000; // 1 message per 2 seconds
export const CHAT_MUTE_DURATION_MS = 30000; // 30-second mute on violation
export const EMOJI_WINDOW_MS = 1000;
export const EMOJI_MAX_PER_WINDOW = 2; // max 2 emoji reactions per second
export const WS_HEARTBEAT_INTERVAL_MS = 15000; // 15-second ping/pong liveness

// WebSocket Close Codes
export const WS_CLOSE_CODE_NORMAL = 1000;
export const WS_CLOSE_CODE_FRAME_TOO_LARGE = 1009;
export const WS_CLOSE_CODE_UNAUTHORIZED = 4401;
export const WS_CLOSE_CODE_SESSION_SUPERSEDED = 4409;

// Whitelisted Emojis (Frozen Architecture v3.2.0, Section 8.2)
export const ALLOWED_EMOJI_IDS = [
  "thumb",
  "fire",
  "skull",
  "scream",
  "sword",
  "cheer"
] as const;

export type AllowedEmojiId = (typeof ALLOWED_EMOJI_IDS)[number];

// Client -> Server Schemas
export const JoinRoomSchema = z.object({
  type: z.literal("JOIN_ROOM"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10)
});

export const JoinAsSpectatorSchema = z.object({
  type: z.literal("JOIN_AS_SPECTATOR"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10)
});

export const LeaveRoomSchema = z.object({
  type: z.literal("LEAVE_ROOM"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10)
});

export const KickPlayerSchema = z.object({
  type: z.literal("KICK_PLAYER"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10),
  targetUserId: z.string().min(1)
});

export const StartMatchSchema = z.object({
  type: z.literal("START_MATCH"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10)
});

export const RollRequestSchema = z.object({
  type: z.literal("ROLL_REQUEST"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10),
  expectedStateVersion: z.number().int().nonnegative()
});

export const ShootRequestSchema = z.object({
  type: z.literal("SHOOT_REQUEST"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10),
  targetPlayerId: z.string().min(1),
  targetCellValue: z.union([
    z.literal(0),
    z.literal(2),
    z.literal(4),
    z.literal(6),
    z.literal(8)
  ]),
  expectedStateVersion: z.number().int().nonnegative()
});

export const SendChatMessageSchema = z.object({
  type: z.literal("SEND_CHAT_MESSAGE"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10),
  message: z.string().trim().min(1).max(CHAT_MESSAGE_MAX_CHARS)
});

export const SendEmojiReactionSchema = z.object({
  type: z.literal("SEND_EMOJI_REACTION"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10),
  emojiId: z.string().min(1)
});

export const ReconnectMatchSchema = z.object({
  type: z.literal("RECONNECT_MATCH"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10),
  lastKnownVersion: z.number().int().nonnegative(),
  serverInstanceId: z.string().optional()
});

export const DownloadMatchReportSchema = z.object({
  type: z.literal("DOWNLOAD_MATCH_REPORT"),
  correlationId: z.string().min(1),
  roomCode: z.string().min(1).max(10)
});

export const PingSchema = z.object({
  type: z.literal("PING")
});

export const PongSchema = z.object({
  type: z.literal("PONG")
});

export const WSClientMessageSchema = z.discriminatedUnion("type", [
  JoinRoomSchema,
  JoinAsSpectatorSchema,
  LeaveRoomSchema,
  KickPlayerSchema,
  StartMatchSchema,
  RollRequestSchema,
  ShootRequestSchema,
  SendChatMessageSchema,
  SendEmojiReactionSchema,
  ReconnectMatchSchema,
  DownloadMatchReportSchema,
  PingSchema,
  PongSchema
]);

export type WSClientMessage = z.infer<typeof WSClientMessageSchema>;

// Server -> Client Message Types
export interface WSServerAuthSuccess {
  type: "AUTH_SUCCESS";
  userId: string;
  username: string;
  serverInstanceId: string;
  activeRoomCode?: string;
  activeRoomPhase?: string;
  canReconnectMatch?: boolean;
  hasActiveMatchParticipation?: boolean;
}

export interface WSServerError {
  type: "ERROR";
  code: string;
  message: string;
  correlationId?: string;
}

export interface WSServerRoomSnapshot {
  type: "ROOM_SNAPSHOT";
  correlationId?: string;
  room: PublicRoomState;
  serverInstanceId: string;
}

export interface WSServerPlayerJoined {
  type: "PLAYER_JOINED";
  player: RoomParticipant;
}

export interface WSServerPlayerLeft {
  type: "PLAYER_LEFT";
  userId: string;
}

export interface WSServerPlayerKicked {
  type: "PLAYER_KICKED";
  userId: string;
  targetUserId: string;
}

export interface WSServerSpectatorJoined {
  type: "SPECTATOR_JOINED";
  spectator: RoomParticipant;
}

export interface WSServerSpectatorLeft {
  type: "SPECTATOR_LEFT";
  userId: string;
}

export interface WSServerHostMigrated {
  type: "HOST_MIGRATED";
  newHostUserId: string;
  reason: string;
}

export interface WSServerMatchStarted {
  type: "MATCH_STARTED";
  matchState: MatchState;
}

export interface WSServerRollCommitment {
  type: "ROLL_COMMITMENT";
  turnNumber: number;
  commitmentHash: string;
}

export interface WSServerRollRevealed {
  type: "ROLL_REVEALED";
  turnNumber: number;
  outcome: CellValue;
  pageNumber: number;
  seed: string;
  actorPlayerId?: string;
  actorUsername?: string;
  consequenceText?: string;
}

export interface WSServerMatchStateSync {
  type: "MATCH_STATE_SYNC";
  matchState: MatchState;
  events?: MatchEvent[];
}

export interface WSServerMatchPaused {
  type: "MATCH_PAUSED";
  disconnectedPlayerId: string;
  deadline: number;
}

export interface WSServerMatchResumed {
  type: "MATCH_RESUMED";
  reconnectedPlayerId: string;
}

export interface WSServerPlayerEliminated {
  type: "PLAYER_ELIMINATED";
  targetPlayerId: string;
}

export interface WSServerMatchCompleted {
  type: "MATCH_COMPLETED";
  matchState: MatchState;
  winnerPlayerId: string;
  winReason: WinReason;
}

export interface WSServerMatchTerminatedServerRestart {
  type: "MATCH_TERMINATED_SERVER_RESTART";
  message: string;
}

export interface WSServerTemporaryReportReady {
  type: "TEMPORARY_REPORT_READY";
  expiresAt: number;
}

export interface WSServerTemporaryReportData {
  type: "TEMPORARY_REPORT_DATA";
  report: Record<string, unknown>;
}

export interface WSServerChatBroadcast {
  type: "CHAT_BROADCAST";
  id?: string;
  senderUserId: string;
  senderUsername: string;
  role?: string;
  message: string;
  timestamp: number;
}

export interface WSServerEmojiBroadcast {
  type: "EMOJI_BROADCAST";
  id?: string;
  senderUserId: string;
  senderUsername?: string;
  emojiId: string;
  timestamp: number;
}

export interface WSServerAck {
  type: "ACK";
  correlationId: string;
  message?: string;
}

export interface WSServerPong {
  type: "PONG";
}

export interface WSServerPing {
  type: "PING";
}

export type WSServerMessage =
  | WSServerAuthSuccess
  | WSServerError
  | WSServerRoomSnapshot
  | WSServerPlayerJoined
  | WSServerPlayerLeft
  | WSServerPlayerKicked
  | WSServerSpectatorJoined
  | WSServerSpectatorLeft
  | WSServerHostMigrated
  | WSServerMatchStarted
  | WSServerRollCommitment
  | WSServerRollRevealed
  | WSServerMatchStateSync
  | WSServerMatchPaused
  | WSServerMatchResumed
  | WSServerPlayerEliminated
  | WSServerMatchCompleted
  | WSServerMatchTerminatedServerRestart
  | WSServerTemporaryReportReady
  | WSServerTemporaryReportData
  | WSServerChatBroadcast
  | WSServerEmojiBroadcast
  | WSServerAck
  | WSServerPong
  | WSServerPing;
