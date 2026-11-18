import { CellValue, CellState, PlayerState, MatchState, MatchEvent, MatchEventType } from "@pageshooter/shared";
import { PRNG } from "./random.js";
export interface CreatePlayerInput {
    playerId: string;
    username: string;
    avatarId: string;
}
export interface CommandOptions {
    commandId?: string;
    expectedStateVersion?: number;
}
export interface EngineResult {
    state: MatchState;
    events: MatchEvent[];
}
/**
 * Creates 5 fresh cells for a player (0, 2, 4, 6, 8), all empty and undestroyed.
 */
export declare function createInitialCells(): Record<CellValue, CellState>;
/**
 * Deep clones the MatchState immutably.
 */
export declare function cloneMatchState(state: MatchState): MatchState;
/**
 * Helper to build an event object with monotonic sequence.
 */
export declare function createEvent(state: MatchState, sequence: number, type: MatchEventType, details?: Partial<MatchEvent>): MatchEvent;
/**
 * Initializes a new match with 5-10 players, randomly assigning positions P1..Pn.
 */
export declare function createInitialMatchState(matchId: string, roomId: string, playerInputs: CreatePlayerInput[], prng?: PRNG): EngineResult;
/**
 * Checks whether at least one active opponent has an undestroyed cell.
 */
export declare function hasAnyValidOpponentTarget(state: MatchState, shooterPlayerId: string): boolean;
/**
 * Finds the next active player cyclically following the current player's fixed position.
 */
export declare function getNextActivePlayer(players: PlayerState[], currentPlayerId: string): PlayerState | null;
/**
 * Applies a book roll to the current turn.
 */
export declare function applyRoll(currentState: MatchState, senderPlayerId: string, outcome: CellValue, pageNumber: number, options?: CommandOptions): EngineResult;
/**
 * Applies a shot by the current player to a target opponent cell.
 */
export declare function applyShot(currentState: MatchState, senderPlayerId: string, targetPlayerId: string, targetCellValue: CellValue, options?: CommandOptions): EngineResult;
/**
 * Eliminates a player (e.g., voluntary leave or 60s disconnect timeout).
 * All 5 cells are destroyed immediately.
 */
export declare function eliminatePlayer(currentState: MatchState, playerIdToEliminate: string, reason?: "VOLUNTARY_LEAVE" | "DISCONNECT_TIMEOUT"): EngineResult;
/**
 * Pauses an active match when an active player disconnects, setting a 60-second deadline.
 */
export declare function pauseMatch(currentState: MatchState, disconnectedPlayerId: string, timeoutMs?: number): EngineResult;
/**
 * Resumes a paused match when the disconnected player successfully reconnects within the deadline.
 */
export declare function resumeMatch(currentState: MatchState, reconnectedPlayerId: string): EngineResult;
/**
 * Transfers host to the lowest-numbered surviving player.
 * Player positions never change.
 */
export declare function getNextHostPlayerId(players: PlayerState[]): string | null;
//# sourceMappingURL=engine.d.ts.map