// Constants and Limits
export const CELL_VALUES = [0, 2, 4, 6, 8] as const;
export type CellValue = (typeof CELL_VALUES)[number];

export const MIN_PLAYERS = 5;
export const MAX_PLAYERS = 10;

export const MIN_PAGE_NUMBER = 1;
export const MAX_PAGE_NUMBER = 500;

export const BOOK_ANIMATION_MIN_MS = 4_000;
export const BOOK_ANIMATION_MAX_MS = 6_000;
export const DEFAULT_GAME_ANIMATION_MS = 1_000;

export const RECONNECT_WINDOW_MS = 60_000;
export const WAITING_ROOM_TTL_MS = 10 * 60_000;
export const COMPLETED_ROOM_TTL_MS = 10 * 60_000;

export const USERNAME_CHANGE_COOLDOWN_MS = 30 * 24 * 60 * 60_000;

// Domain Types
export type PlayerPosition = `P${number}`;

export type PlayerStatus = "ACTIVE" | "ELIMINATED" | "DISCONNECTED";

export type RoomRole = "HOST" | "PLAYER" | "SPECTATOR";

export type MatchPhase = "WAITING" | "ACTIVE" | "PAUSED" | "COMPLETED" | "DELETED";

export type TurnPhase = "AWAITING_ROLL" | "AWAITING_SHOT" | "RESOLVING" | "TURN_COMPLETE";

export type CellProgress = 0 | 1 | 2 | 3 | 4 | 5;

export const CELL_PROGRESS_LABELS: Record<CellProgress, string> = {
  0: "Empty",
  1: "Face",
  2: "Body",
  3: "Legs",
  4: "Hands/Arms",
  5: "Gun"
} as const;

export interface CellState {
  value: CellValue;
  destroyed: boolean;
  progress: CellProgress;
  hasGun: boolean;
}

export interface PlayerState {
  playerId: string;
  username: string;
  avatarId: string;
  position: PlayerPosition;
  status: PlayerStatus;
  cells: Record<CellValue, CellState>;
  kills: number; // Destroyed cells count
  connected: boolean;
}

export interface TurnState {
  currentPlayerId: string | null;
  turnNumber: number;
  phase: TurnPhase;
  rolledCell: CellValue | null;
  pendingShot: boolean;
}

export type WinReason = "LAST_PLAYER_STANDING" | "NO_VALID_TARGETS";

export interface MatchState {
  matchId: string;
  roomId: string;
  phase: MatchPhase;
  players: PlayerState[];
  spectators: string[];
  turn: TurnState;
  winnerPlayerId: string | null;
  winReason?: WinReason;
  startedAt: number | null;
  completedAt: number | null;
  totalTurns: number;
  version: number;
}

export interface RoomState {
  roomId: string;
  roomCode: string;
  hostPlayerId: string;
  phase: MatchPhase;
  playerIds: string[];
  spectatorIds: string[];
  createdAt: number;
  expiresAt: number | null;
  match: MatchState | null;
  version: number;
}

// Error Codes
export type GameErrorCode =
  | "UNAUTHENTICATED"
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "ROOM_NOT_WAITING"
  | "NOT_HOST"
  | "NOT_YOUR_TURN"
  | "MATCH_NOT_ACTIVE"
  | "MATCH_PAUSED"
  | "CELL_DESTROYED"
  | "SHOT_NOT_AVAILABLE"
  | "INVALID_TARGET"
  | "DUPLICATE_COMMAND"
  | "STALE_STATE"
  | "SPECTATOR_FORBIDDEN"
  | "RATE_LIMITED"
  | "RECONNECT_EXPIRED"
  | "INVALID_COMMAND";

export class GameRuleError extends Error {
  constructor(public code: GameErrorCode, message: string) {
    super(message);
    this.name = "GameRuleError";
  }
}

// Events
export type MatchEventType =
  | "MATCH_STARTED"
  | "BOOK_ROLL_ACCEPTED"
  | "CELL_PROGRESS_UPDATED"
  | "TURN_WASTED"
  | "SHOT_REQUIRED"
  | "SHOT_ACCEPTED"
  | "CELL_DESTROYED"
  | "PLAYER_ELIMINATED"
  | "MATCH_PAUSED"
  | "PLAYER_RECONNECTED"
  | "HOST_TRANSFERRED"
  | "MATCH_RESUMED"
  | "MATCH_WON"
  | "MATCH_COMPLETED"
  | "ROOM_UPDATED"
  | "ROOM_DELETED";

export interface MatchEvent {
  eventId: string;
  matchId: string;
  sequence: number;
  type: MatchEventType;
  actorPlayerId?: string;
  actorUsername?: string;
  actorPosition?: PlayerPosition;
  targetPlayerId?: string;
  targetUsername?: string;
  targetPosition?: PlayerPosition;
  cellValue?: CellValue;
  outcome?: CellValue;
  pageNumber?: number;
  serverTimestamp: number;
  metadata?: Record<string, string | number | boolean>;
}

// Commands
export type ClientCommand =
  | {
      type: "ROLL_REQUEST";
      commandId: string;
      roomCode: string;
      expectedStateVersion: number;
    }
  | {
      type: "SHOOT_REQUEST";
      commandId: string;
      roomCode: string;
      targetPlayerId: string;
      targetCellValue: CellValue;
      expectedStateVersion: number;
    }
  | {
      type: "CHAT_MESSAGE";
      commandId: string;
      roomCode: string;
      message: string;
    }
  | {
      type: "EMOJI_REACTION";
      commandId: string;
      roomCode: string;
      emojiId: string;
    }
  | {
      type: "RECONNECT";
      commandId: string;
      roomCode: string;
      lastKnownStateVersion: number;
    };
