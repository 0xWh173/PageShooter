import {
  CELL_VALUES,
  CellValue,
  CellState,
  PlayerState,
  PlayerPosition,
  MatchState,
  MatchEvent,
  MatchEventType,
  MIN_PLAYERS,
  MAX_PLAYERS,
  GameRuleError,
  WinReason
} from "@pageshooter/shared";
import { PRNG, defaultPRNG } from "./random.js";

export interface CreatePlayerInput {
  playerId: string;
  username: string;
  avatarId: string;
}

export interface EngineResult {
  state: MatchState;
  events: MatchEvent[];
}

/**
 * Creates 5 fresh cells for a player (0, 2, 4, 6, 8), all empty and undestroyed.
 */
export function createInitialCells(): Record<CellValue, CellState> {
  const cells = {} as Record<CellValue, CellState>;
  for (const val of CELL_VALUES) {
    cells[val] = {
      value: val,
      destroyed: false,
      progress: 0,
      hasGun: false
    };
  }
  return cells;
}

/**
 * Deep clones the MatchState immutably.
 */
export function cloneMatchState(state: MatchState): MatchState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      cells: {
        0: { ...p.cells[0] },
        2: { ...p.cells[2] },
        4: { ...p.cells[4] },
        6: { ...p.cells[6] },
        8: { ...p.cells[8] }
      }
    })),
    spectators: [...state.spectators],
    turn: {
      ...state.turn
    }
  };
}

/**
 * Helper to build an event object with monotonic sequence.
 */
export function createEvent(
  state: MatchState,
  sequence: number,
  type: MatchEventType,
  details: Partial<MatchEvent> = {}
): MatchEvent {
  return {
    eventId: `${state.matchId}-evt-${sequence}`,
    matchId: state.matchId,
    sequence,
    type,
    serverTimestamp: Date.now(),
    ...details
  };
}

/**
 * Initializes a new match with 5-10 players, randomly assigning positions P1..Pn.
 */
export function createInitialMatchState(
  matchId: string,
  roomId: string,
  playerInputs: CreatePlayerInput[],
  prng: PRNG = defaultPRNG
): EngineResult {
  if (playerInputs.length < MIN_PLAYERS) {
    throw new GameRuleError(
      "INVALID_COMMAND",
      `A match requires at least ${MIN_PLAYERS} active players. Received ${playerInputs.length}.`
    );
  }
  if (playerInputs.length > MAX_PLAYERS) {
    throw new GameRuleError(
      "ROOM_FULL",
      `A match supports at most ${MAX_PLAYERS} active players. Received ${playerInputs.length}.`
    );
  }

  // Shuffle players randomly to assign positions P1..Pn
  const shuffled = [...playerInputs];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(prng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }

  const players: PlayerState[] = shuffled.map((input, idx) => ({
    playerId: input.playerId,
    username: input.username,
    avatarId: input.avatarId,
    position: `P${idx + 1}` as PlayerPosition,
    status: "ACTIVE",
    cells: createInitialCells(),
    kills: 0,
    connected: true
  }));

  const state: MatchState = {
    matchId,
    roomId,
    phase: "ACTIVE",
    players,
    spectators: [],
    turn: {
      currentPlayerId: players[0].playerId,
      turnNumber: 1,
      phase: "AWAITING_ROLL",
      rolledCell: null,
      pendingShot: false
    },
    winnerPlayerId: null,
    startedAt: Date.now(),
    completedAt: null,
    totalTurns: 1,
    version: 1
  };

  const initialEvent = createEvent(state, 1, "MATCH_STARTED", {
    actorPlayerId: players[0].playerId,
    actorUsername: players[0].username,
    actorPosition: players[0].position
  });

  return {
    state,
    events: [initialEvent]
  };
}

/**
 * Checks whether at least one active opponent has an undestroyed cell.
 */
export function hasAnyValidOpponentTarget(state: MatchState, shooterPlayerId: string): boolean {
  for (const player of state.players) {
    if (player.playerId === shooterPlayerId || player.status !== "ACTIVE") {
      continue;
    }
    for (const val of CELL_VALUES) {
      if (!player.cells[val].destroyed) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Finds the next active player cyclically following the current player's fixed position.
 */
export function getNextActivePlayer(
  players: PlayerState[],
  currentPlayerId: string
): PlayerState | null {
  const currentIndex = players.findIndex((p) => p.playerId === currentPlayerId);
  if (currentIndex === -1) return null;

  const numPlayers = players.length;
  for (let step = 1; step < numPlayers; step++) {
    const nextIdx = (currentIndex + step) % numPlayers;
    const candidate = players[nextIdx];
    if (candidate.status === "ACTIVE") {
      return candidate;
    }
  }
  return null;
}

/**
 * Applies a book roll to the current turn.
 */
export function applyRoll(
  currentState: MatchState,
  senderPlayerId: string,
  outcome: CellValue,
  pageNumber: number
): EngineResult {
  if (currentState.phase !== "ACTIVE") {
    throw new GameRuleError(
      "MATCH_NOT_ACTIVE",
      `Cannot roll when match is in phase ${currentState.phase}.`
    );
  }

  if (currentState.turn.phase !== "AWAITING_ROLL") {
    throw new GameRuleError(
      "INVALID_COMMAND",
      `Cannot roll when turn is in phase ${currentState.turn.phase}.`
    );
  }

  if (currentState.turn.currentPlayerId !== senderPlayerId) {
    throw new GameRuleError("NOT_YOUR_TURN", "It is not your turn to roll.");
  }

  if (!CELL_VALUES.includes(outcome)) {
    throw new GameRuleError("INVALID_COMMAND", `Invalid roll outcome: ${outcome}.`);
  }

  const nextState = cloneMatchState(currentState);
  nextState.version += 1;
  let nextSeq = nextState.version;
  const events: MatchEvent[] = [];

  const currentPlayer = nextState.players.find((p) => p.playerId === senderPlayerId)!;
  const cell = currentPlayer.cells[outcome];

  events.push(
    createEvent(nextState, nextSeq++, "BOOK_ROLL_ACCEPTED", {
      actorPlayerId: currentPlayer.playerId,
      actorUsername: currentPlayer.username,
      actorPosition: currentPlayer.position,
      cellValue: outcome,
      outcome,
      pageNumber
    })
  );

  // Case 1: Cell is already destroyed -> Turn is wasted.
  if (cell.destroyed) {
    events.push(
      createEvent(nextState, nextSeq++, "TURN_WASTED", {
        actorPlayerId: currentPlayer.playerId,
        actorUsername: currentPlayer.username,
        actorPosition: currentPlayer.position,
        cellValue: outcome
      })
    );

    advanceToNextPlayer(nextState, currentPlayer.playerId);
    return { state: nextState, events };
  }

  // Case 2: Cell is alive and progression < 5
  if (cell.progress < 5) {
    cell.progress = (cell.progress + 1) as CellState["progress"];
    if (cell.progress === 5) {
      cell.hasGun = true; // 5th roll creates gun with 0 bullets and does not shoot
    }

    events.push(
      createEvent(nextState, nextSeq++, "CELL_PROGRESS_UPDATED", {
        actorPlayerId: currentPlayer.playerId,
        actorUsername: currentPlayer.username,
        actorPosition: currentPlayer.position,
        cellValue: outcome,
        metadata: {
          progress: cell.progress,
          hasGun: cell.hasGun
        }
      })
    );

    advanceToNextPlayer(nextState, currentPlayer.playerId);
    return { state: nextState, events };
  }

  // Case 3: Cell already has gun (progress === 5).
  // Matching roll creates exactly one mandatory shot entitlement.
  nextState.turn.phase = "AWAITING_SHOT";
  nextState.turn.pendingShot = true;
  nextState.turn.rolledCell = outcome;

  events.push(
    createEvent(nextState, nextSeq++, "SHOT_REQUIRED", {
      actorPlayerId: currentPlayer.playerId,
      actorUsername: currentPlayer.username,
      actorPosition: currentPlayer.position,
      cellValue: outcome
    })
  );

  // Check if any opponent has an undestroyed cell.
  // "If a player must shoot but no valid opponent cell remains, declare that player the winner immediately."
  const hasTargets = hasAnyValidOpponentTarget(nextState, currentPlayer.playerId);
  if (!hasTargets) {
    nextState.phase = "COMPLETED";
    nextState.winnerPlayerId = currentPlayer.playerId;
    nextState.winReason = "NO_VALID_TARGETS";
    nextState.completedAt = Date.now();
    nextState.turn.pendingShot = false;

    events.push(
      createEvent(nextState, nextSeq++, "MATCH_WON", {
        actorPlayerId: currentPlayer.playerId,
        actorUsername: currentPlayer.username,
        actorPosition: currentPlayer.position,
        metadata: { reason: "NO_VALID_TARGETS" }
      }),
      createEvent(nextState, nextSeq++, "MATCH_COMPLETED", {
        actorPlayerId: currentPlayer.playerId
      })
    );
  }

  return { state: nextState, events };
}

/**
 * Applies a shot by the current player to a target opponent cell.
 */
export function applyShot(
  currentState: MatchState,
  senderPlayerId: string,
  targetPlayerId: string,
  targetCellValue: CellValue
): EngineResult {
  if (currentState.phase !== "ACTIVE") {
    throw new GameRuleError(
      "MATCH_NOT_ACTIVE",
      `Cannot shoot when match is in phase ${currentState.phase}.`
    );
  }

  if (currentState.turn.phase !== "AWAITING_SHOT" || !currentState.turn.pendingShot) {
    throw new GameRuleError("SHOT_NOT_AVAILABLE", "No shot entitlement pending.");
  }

  if (currentState.turn.currentPlayerId !== senderPlayerId) {
    throw new GameRuleError("NOT_YOUR_TURN", "It is not your turn to shoot.");
  }

  if (senderPlayerId === targetPlayerId) {
    throw new GameRuleError("INVALID_TARGET", "Shooter cannot target their own column.");
  }

  if (!CELL_VALUES.includes(targetCellValue)) {
    throw new GameRuleError("INVALID_TARGET", `Invalid target cell value: ${targetCellValue}.`);
  }

  const nextState = cloneMatchState(currentState);
  nextState.version += 1;
  let nextSeq = nextState.version;
  const events: MatchEvent[] = [];

  const shooter = nextState.players.find((p) => p.playerId === senderPlayerId)!;
  const targetPlayer = nextState.players.find((p) => p.playerId === targetPlayerId);

  if (!targetPlayer || targetPlayer.status !== "ACTIVE") {
    throw new GameRuleError("INVALID_TARGET", "Target player is not active in this match.");
  }

  const targetCell = targetPlayer.cells[targetCellValue];
  if (targetCell.destroyed) {
    throw new GameRuleError("CELL_DESTROYED", "Target cell is already destroyed.");
  }

  // Atomically consume bullet and destroy target cell
  nextState.turn.pendingShot = false;
  targetCell.destroyed = true;
  shooter.kills += 1;

  events.push(
    createEvent(nextState, nextSeq++, "SHOT_ACCEPTED", {
      actorPlayerId: shooter.playerId,
      actorUsername: shooter.username,
      actorPosition: shooter.position,
      targetPlayerId: targetPlayer.playerId,
      targetUsername: targetPlayer.username,
      targetPosition: targetPlayer.position,
      cellValue: targetCellValue
    }),
    createEvent(nextState, nextSeq++, "CELL_DESTROYED", {
      actorPlayerId: shooter.playerId,
      actorUsername: shooter.username,
      actorPosition: shooter.position,
      targetPlayerId: targetPlayer.playerId,
      targetUsername: targetPlayer.username,
      targetPosition: targetPlayer.position,
      cellValue: targetCellValue
    })
  );

  // Check if target player is eliminated (all 5 cells destroyed)
  const isTargetEliminated = CELL_VALUES.every((val) => targetPlayer.cells[val].destroyed);
  if (isTargetEliminated) {
    targetPlayer.status = "ELIMINATED";
    events.push(
      createEvent(nextState, nextSeq++, "PLAYER_ELIMINATED", {
        targetPlayerId: targetPlayer.playerId,
        targetUsername: targetPlayer.username,
        targetPosition: targetPlayer.position
      })
    );
  }

  // Check win condition: active players count <= 1
  const activePlayers = nextState.players.filter((p) => p.status === "ACTIVE");
  if (activePlayers.length <= 1) {
    const winner = activePlayers[0] || shooter;
    nextState.phase = "COMPLETED";
    nextState.winnerPlayerId = winner.playerId;
    nextState.winReason = "LAST_PLAYER_STANDING";
    nextState.completedAt = Date.now();

    events.push(
      createEvent(nextState, nextSeq++, "MATCH_WON", {
        actorPlayerId: winner.playerId,
        actorUsername: winner.username,
        actorPosition: winner.position,
        metadata: { reason: "LAST_PLAYER_STANDING" }
      }),
      createEvent(nextState, nextSeq++, "MATCH_COMPLETED", {
        actorPlayerId: winner.playerId
      })
    );
    return { state: nextState, events };
  }

  // Match continues -> Advance turn to next eligible active player
  advanceToNextPlayer(nextState, shooter.playerId);
  return { state: nextState, events };
}

/**
 * Eliminates a player (e.g., voluntary leave or 60s disconnect timeout).
 * All 5 cells are destroyed immediately.
 */
export function eliminatePlayer(
  currentState: MatchState,
  playerIdToEliminate: string,
  reason: "VOLUNTARY_LEAVE" | "DISCONNECT_TIMEOUT" = "VOLUNTARY_LEAVE"
): EngineResult {
  const nextState = cloneMatchState(currentState);
  nextState.version += 1;
  let nextSeq = nextState.version;
  const events: MatchEvent[] = [];

  const targetPlayer = nextState.players.find((p) => p.playerId === playerIdToEliminate);
  if (!targetPlayer || targetPlayer.status === "ELIMINATED") {
    return { state: nextState, events };
  }

  targetPlayer.status = "ELIMINATED";
  // Destroy all 5 cells
  for (const val of CELL_VALUES) {
    targetPlayer.cells[val].destroyed = true;
  }

  events.push(
    createEvent(nextState, nextSeq++, "PLAYER_ELIMINATED", {
      targetPlayerId: targetPlayer.playerId,
      targetUsername: targetPlayer.username,
      targetPosition: targetPlayer.position,
      metadata: { reason }
    })
  );

  // Check if only 1 active player remains
  const activePlayers = nextState.players.filter((p) => p.status === "ACTIVE");
  if (activePlayers.length <= 1) {
    if (activePlayers.length === 1) {
      const winner = activePlayers[0];
      nextState.phase = "COMPLETED";
      nextState.winnerPlayerId = winner.playerId;
      nextState.winReason = "LAST_PLAYER_STANDING";
      nextState.completedAt = Date.now();

      events.push(
        createEvent(nextState, nextSeq++, "MATCH_WON", {
          actorPlayerId: winner.playerId,
          actorUsername: winner.username,
          actorPosition: winner.position,
          metadata: { reason: "LAST_PLAYER_STANDING" }
        }),
        createEvent(nextState, nextSeq++, "MATCH_COMPLETED", {
          actorPlayerId: winner.playerId
        })
      );
    } else {
      nextState.phase = "COMPLETED";
      nextState.completedAt = Date.now();
      events.push(createEvent(nextState, nextSeq++, "MATCH_COMPLETED"));
    }
    return { state: nextState, events };
  }

  // If the eliminated player was the current turn owner, advance turn to next eligible active player
  if (nextState.turn.currentPlayerId === playerIdToEliminate) {
    advanceToNextPlayer(nextState, playerIdToEliminate);
  }

  return { state: nextState, events };
}

/**
 * Transfers host to the lowest-numbered surviving player.
 * Player positions never change.
 */
export function getNextHostPlayerId(players: PlayerState[]): string | null {
  const activeSorted = [...players]
    .filter((p) => p.status === "ACTIVE")
    .sort((a, b) => {
      const numA = parseInt(a.position.replace("P", ""), 10);
      const numB = parseInt(b.position.replace("P", ""), 10);
      return numA - numB;
    });

  return activeSorted.length > 0 ? activeSorted[0].playerId : null;
}

/**
 * Helper to advance turn state to the next eligible active player cyclically.
 */
function advanceToNextPlayer(state: MatchState, currentTurnPlayerId: string): void {
  const nextPlayer = getNextActivePlayer(state.players, currentTurnPlayerId);
  if (!nextPlayer) {
    // Only 1 or 0 players remain
    return;
  }

  state.turn.currentPlayerId = nextPlayer.playerId;
  state.turn.phase = "AWAITING_ROLL";
  state.turn.rolledCell = null;
  state.turn.pendingShot = false;
  state.turn.turnNumber += 1;
  state.totalTurns += 1;
}
