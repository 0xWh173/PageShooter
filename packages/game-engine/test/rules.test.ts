import { describe, it, expect } from "vitest";
import {
  CELL_VALUES,
  CellValue,
  GameRuleError
} from "@pageshooter/shared";
import {
  createInitialMatchState,
  applyRoll,
  applyShot,
  eliminatePlayer,
  getNextHostPlayerId,
  pauseMatch,
  resumeMatch,
  CreatePlayerInput
} from "../src/index.js";

function createTestPlayers(count: number): CreatePlayerInput[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: `player-${i + 1}`,
    username: `User${i + 1}`,
    avatarId: `avatar-${i + 1}`
  }));
}

describe("Game Engine - 20 Required Rules Tests", () => {
  // Test Case 1: Every player starts with five empty cells
  it("Rule 1: Every player starts with five empty cells (0, 2, 4, 6, 8)", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    expect(state.players).toHaveLength(5);

    for (const player of state.players) {
      for (const val of CELL_VALUES) {
        const cell = player.cells[val];
        expect(cell).toBeDefined();
        expect(cell.value).toBe(val);
        expect(cell.progress).toBe(0);
        expect(cell.hasGun).toBe(false);
        expect(cell.destroyed).toBe(false);
      }
    }
  });

  // Test Case 2-6: Step-by-step cell progression
  it("Rule 2-6: Sequential rolls progress cell: 1=Face, 2=Body, 3=Legs, 4=Hands/Arms, 5=Gun with 0 bullets (no shot)", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const cellVal: CellValue = 4;

    // Roll 1: Face
    let currState = state;
    let res = applyRoll(currState, p1, cellVal, 24);
    currState = res.state;
    expect(currState.players[0].cells[cellVal].progress).toBe(1);
    expect(currState.players[0].cells[cellVal].hasGun).toBe(false);
    expect(currState.turn.pendingShot).toBe(false);

    // Roll for other players to return turn to P1
    for (let i = 1; i < 5; i++) {
      const pid = currState.turn.currentPlayerId!;
      currState = applyRoll(currState, pid, 0, 10).state;
    }
    expect(currState.turn.currentPlayerId).toBe(p1);

    // Roll 2: Body
    res = applyRoll(currState, p1, cellVal, 34);
    currState = res.state;
    expect(currState.players[0].cells[cellVal].progress).toBe(2);
    expect(currState.players[0].cells[cellVal].hasGun).toBe(false);
    expect(currState.turn.pendingShot).toBe(false);

    // Cycle round back to P1
    for (let i = 1; i < 5; i++) {
      currState = applyRoll(currState, currState.turn.currentPlayerId!, 0, 10).state;
    }

    // Roll 3: Legs
    res = applyRoll(currState, p1, cellVal, 44);
    currState = res.state;
    expect(currState.players[0].cells[cellVal].progress).toBe(3);
    expect(currState.players[0].cells[cellVal].hasGun).toBe(false);
    expect(currState.turn.pendingShot).toBe(false);

    // Cycle round back to P1
    for (let i = 1; i < 5; i++) {
      currState = applyRoll(currState, currState.turn.currentPlayerId!, 0, 10).state;
    }

    // Roll 4: Hands/Arms
    res = applyRoll(currState, p1, cellVal, 54);
    currState = res.state;
    expect(currState.players[0].cells[cellVal].progress).toBe(4);
    expect(currState.players[0].cells[cellVal].hasGun).toBe(false);
    expect(currState.turn.pendingShot).toBe(false);

    // Cycle round back to P1
    for (let i = 1; i < 5; i++) {
      currState = applyRoll(currState, currState.turn.currentPlayerId!, 0, 10).state;
    }

    // Roll 5: Gun with zero bullets and does NOT fire
    res = applyRoll(currState, p1, cellVal, 64);
    currState = res.state;
    expect(currState.players[0].cells[cellVal].progress).toBe(5);
    expect(currState.players[0].cells[cellVal].hasGun).toBe(true);
    expect(currState.turn.pendingShot).toBe(false); // Does not shoot on roll 5!
    expect(currState.turn.phase).toBe("AWAITING_ROLL"); // Turn completed, advanced to next player
    expect(currState.turn.currentPlayerId).toBe(currState.players[1].playerId);
  });

  // Test Case 7 & 8: Roll 6 and later matching rolls create one mandatory shot
  it("Rule 7 & 8: 6th and 7+ matching rolls award one bullet and immediately require a shot", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const cellVal: CellValue = 2;

    // Manually set cell progress to 5 (Gun)
    state.players[0].cells[cellVal].progress = 5;
    state.players[0].cells[cellVal].hasGun = true;

    // Roll 6: Gun cell rolled again
    let res = applyRoll(state, p1, cellVal, 102);
    expect(res.state.turn.phase).toBe("AWAITING_SHOT");
    expect(res.state.turn.pendingShot).toBe(true);
    expect(res.state.turn.currentPlayerId).toBe(p1);
    expect(res.state.players[0].cells[cellVal].progress).toBe(5); // Does not progress beyond 5

    // Fire the shot at opponent
    const opponentId = res.state.players[1].playerId;
    res = applyShot(res.state, p1, opponentId, 0);
    expect(res.state.turn.phase).toBe("AWAITING_ROLL");
    expect(res.state.turn.pendingShot).toBe(false);

    // Cycle round back to P1
    let currState = res.state;
    for (let i = 1; i < 5; i++) {
      currState = applyRoll(currState, currState.turn.currentPlayerId!, 0, 10).state;
    }

    // Roll 7+: Gun cell rolled again -> Another mandatory shot
    res = applyRoll(currState, p1, cellVal, 202);
    expect(res.state.turn.phase).toBe("AWAITING_SHOT");
    expect(res.state.turn.pendingShot).toBe(true);
    expect(res.state.turn.currentPlayerId).toBe(p1);
  });

  // Test Case 9 & 10: Destroyed cell roll wastes the turn and never progresses
  it("Rule 9 & 10: Destroyed cell roll wastes the turn and never progresses", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const destroyedCellVal: CellValue = 6;

    state.players[0].cells[destroyedCellVal].destroyed = true;
    state.players[0].cells[destroyedCellVal].progress = 2;

    const res = applyRoll(state, p1, destroyedCellVal, 16);
    expect(res.state.players[0].cells[destroyedCellVal].progress).toBe(2); // No progression
    expect(res.state.players[0].cells[destroyedCellVal].destroyed).toBe(true);
    expect(res.state.turn.pendingShot).toBe(false); // No bullet or shot
    expect(res.events.some((e) => e.type === "TURN_WASTED")).toBe(true);
    // Turn advanced to next player
    expect(res.state.turn.currentPlayerId).toBe(state.players[1].playerId);
  });

  // Test Case 11, 12, 13: Target validity
  it("Rule 11, 12, 13: A shot can target empty, partially progressed, or gun-equipped opponent cells", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const targetPlayer = state.players[1];

    // Configure opponent cells:
    // Cell 0: empty (progress 0)
    targetPlayer.cells[0].progress = 0;
    // Cell 2: partially progressed (progress 3)
    targetPlayer.cells[2].progress = 3;
    // Cell 4: gun-equipped (progress 5)
    targetPlayer.cells[4].progress = 5;
    targetPlayer.cells[4].hasGun = true;

    // Prepare P1 with a shot
    state.players[0].cells[8].progress = 5;
    state.players[0].cells[8].hasGun = true;
    let res = applyRoll(state, p1, 8, 48);

    // Shot 1: Can target empty cell 0
    let shootRes = applyShot(res.state, p1, targetPlayer.playerId, 0);
    expect(shootRes.state.players[1].cells[0].destroyed).toBe(true);
    expect(shootRes.state.players[0].kills).toBe(1);

    // Prepare another shot for P1 after cycling
    let currState = shootRes.state;
    for (let i = 1; i < 5; i++) {
      currState = applyRoll(currState, currState.turn.currentPlayerId!, 6, 16).state;
    }
    res = applyRoll(currState, p1, 8, 88);

    // Shot 2: Can target partially progressed cell 2
    shootRes = applyShot(res.state, p1, targetPlayer.playerId, 2);
    expect(shootRes.state.players[1].cells[2].destroyed).toBe(true);
    expect(shootRes.state.players[0].kills).toBe(2);

    // Prepare another shot for P1 after cycling
    currState = shootRes.state;
    for (let i = 1; i < 5; i++) {
      currState = applyRoll(currState, currState.turn.currentPlayerId!, 6, 16).state;
    }
    res = applyRoll(currState, p1, 8, 108);

    // Shot 3: Can target gun-equipped cell 4
    shootRes = applyShot(res.state, p1, targetPlayer.playerId, 4);
    expect(shootRes.state.players[1].cells[4].destroyed).toBe(true);
    expect(shootRes.state.players[0].kills).toBe(3);
  });

  // Test Case 14: Shooter cannot target own cell
  it("Rule 14: A shot cannot target the shooter's own cell", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;

    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;

    const res = applyRoll(state, p1, 0, 10);
    expect(() => {
      applyShot(res.state, p1, p1, 2);
    }).toThrowError(GameRuleError);

    try {
      applyShot(res.state, p1, p1, 2);
    } catch (err: any) {
      expect(err.code).toBe("INVALID_TARGET");
    }
  });

  // Test Case 15: A shot cannot target an already destroyed cell
  it("Rule 15: A shot cannot target an already destroyed cell", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const targetPlayerId = state.players[1].playerId;

    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    state.players[1].cells[2].destroyed = true;

    const res = applyRoll(state, p1, 0, 10);
    expect(() => {
      applyShot(res.state, p1, targetPlayerId, 2);
    }).toThrowError(GameRuleError);

    try {
      applyShot(res.state, p1, targetPlayerId, 2);
    } catch (err: any) {
      expect(err.code).toBe("CELL_DESTROYED");
    }
    // Pending shot must NOT be consumed on rejection
    expect(res.state.turn.pendingShot).toBe(true);
  });

  // Test Case 16: One shot destroys exactly one cell
  it("Rule 16: One shot destroys exactly one cell", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const targetPlayerId = state.players[1].playerId;

    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;

    const res = applyRoll(state, p1, 0, 10);
    const shootRes = applyShot(res.state, p1, targetPlayerId, 4);

    const targetCells = shootRes.state.players[1].cells;
    expect(targetCells[4].destroyed).toBe(true);
    expect(targetCells[0].destroyed).toBe(false);
    expect(targetCells[2].destroyed).toBe(false);
    expect(targetCells[6].destroyed).toBe(false);
    expect(targetCells[8].destroyed).toBe(false);
  });

  // Test Case 17: Player is eliminated only when all five cells are destroyed
  it("Rule 17: Player is eliminated only when all five cells are destroyed", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const targetPlayer = state.players[1];

    // Destroy 4 cells
    targetPlayer.cells[0].destroyed = true;
    targetPlayer.cells[2].destroyed = true;
    targetPlayer.cells[4].destroyed = true;
    targetPlayer.cells[6].destroyed = true;
    // 5th cell is still intact
    targetPlayer.cells[8].destroyed = false;

    // Shooter sets up shot
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    let res = applyRoll(state, state.players[0].playerId, 0, 10);

    // Target is still ACTIVE before 5th destruction
    expect(res.state.players[1].status).toBe("ACTIVE");

    // Destroy 5th cell
    const shootRes = applyShot(res.state, state.players[0].playerId, targetPlayer.playerId, 8);
    expect(shootRes.state.players[1].status).toBe("ELIMINATED");
    expect(shootRes.events.some((e) => e.type === "PLAYER_ELIMINATED")).toBe(true);
  });

  // Test Case 18: Eliminated player is skipped in turn order
  it("Rule 18: Eliminated players are skipped automatically in turn order", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    // Eliminate player 2
    state.players[1].status = "ELIMINATED";

    // P1 rolls and completes turn
    const res = applyRoll(state, state.players[0].playerId, 0, 10);
    // Turn should skip P2 and land directly on P3!
    expect(res.state.turn.currentPlayerId).toBe(state.players[2].playerId);
  });

  // Test Case 19: Match ends immediately when one active player remains
  it("Rule 19: Match ends immediately when only one active player remains (do not finish round)", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const p2 = state.players[1];

    // Eliminate players 3, 4, 5
    state.players[2].status = "ELIMINATED";
    state.players[3].status = "ELIMINATED";
    state.players[4].status = "ELIMINATED";

    // P2 has only 1 remaining cell: cell 8
    p2.cells[0].destroyed = true;
    p2.cells[2].destroyed = true;
    p2.cells[4].destroyed = true;
    p2.cells[6].destroyed = true;

    // P1 rolls gun cell
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    const res = applyRoll(state, p1, 0, 10);

    // P1 destroys P2's final cell
    const shootRes = applyShot(res.state, p1, p2.playerId, 8);

    expect(shootRes.state.phase).toBe("COMPLETED");
    expect(shootRes.state.winnerPlayerId).toBe(p1);
    expect(shootRes.state.winReason).toBe("LAST_PLAYER_STANDING");
    expect(shootRes.events.some((e) => e.type === "MATCH_WON")).toBe(true);
    expect(shootRes.events.some((e) => e.type === "MATCH_COMPLETED")).toBe(true);
  });

  // Test Case 20: Shooter wins immediately if no opponent target remains when a shot is required
  it("Rule 20: Shooter wins immediately if no opponent target remains when a shot is required", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;

    // All opponent cells are already destroyed across all other players
    for (let i = 1; i < 5; i++) {
      for (const val of CELL_VALUES) {
        state.players[i].cells[val].destroyed = true;
      }
    }

    // P1 rolls gun cell
    state.players[0].cells[2].progress = 5;
    state.players[0].cells[2].hasGun = true;

    const res = applyRoll(state, p1, 2, 22);

    expect(res.state.phase).toBe("COMPLETED");
    expect(res.state.winnerPlayerId).toBe(p1);
    expect(res.state.winReason).toBe("NO_VALID_TARGETS");
    expect(res.events.some((e) => e.type === "MATCH_WON")).toBe(true);
  });
});

describe("Game Engine - Additional Edge Cases & Security Rules", () => {
  it("rejects match creation with fewer than 5 or more than 10 players", () => {
    expect(() => createInitialMatchState("m", "r", createTestPlayers(4))).toThrowError(
      GameRuleError
    );
    expect(() => createInitialMatchState("m", "r", createTestPlayers(11))).toThrowError(
      GameRuleError
    );
  });

  it("rejects out-of-turn rolls with NOT_YOUR_TURN", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p2 = state.players[1].playerId;

    expect(() => applyRoll(state, p2, 0, 10)).toThrowError(GameRuleError);
    try {
      applyRoll(state, p2, 0, 10);
    } catch (err: any) {
      expect(err.code).toBe("NOT_YOUR_TURN");
    }
  });

  it("rejects shot when no shot entitlement is pending", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;

    expect(() => applyShot(state, p1, p2, 0)).toThrowError(GameRuleError);
    try {
      applyShot(state, p1, p2, 0);
    } catch (err: any) {
      expect(err.code).toBe("SHOT_NOT_AVAILABLE");
    }
  });

  it("voluntary leave or disconnect timeout destroys all 5 cells and eliminates player", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p2 = state.players[1].playerId;

    const res = eliminatePlayer(state, p2, "VOLUNTARY_LEAVE");
    const eliminatedP2 = res.state.players.find((p) => p.playerId === p2)!;
    expect(eliminatedP2.status).toBe("ELIMINATED");
    for (const val of CELL_VALUES) {
      expect(eliminatedP2.cells[val].destroyed).toBe(true);
    }
  });

  it("host transfer selects the lowest-numbered surviving player position", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    // Positions: P1, P2, P3, P4, P5
    // If P1 is eliminated, lowest active is P2
    state.players[0].status = "ELIMINATED";
    expect(getNextHostPlayerId(state.players)).toBe(state.players[1].playerId);

    // If P2 is also eliminated, lowest active is P3
    state.players[1].status = "ELIMINATED";
    expect(getNextHostPlayerId(state.players)).toBe(state.players[2].playerId);
  });

  it("verifies independent progression of all 5 cells for a player", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;

    // Roll cell 0 -> progress 1
    let s = applyRoll(state, p1, 0, 10).state;
    expect(s.players[0].cells[0].progress).toBe(1);
    expect(s.players[0].cells[2].progress).toBe(0);
    expect(s.players[0].cells[4].progress).toBe(0);
    expect(s.players[0].cells[6].progress).toBe(0);
    expect(s.players[0].cells[8].progress).toBe(0);

    // Cycle back to P1 and roll cell 6 -> progress 1 on cell 6, cell 0 stays 1
    for (let i = 1; i < 5; i++) {
      s = applyRoll(s, s.turn.currentPlayerId!, 0, 10).state;
    }
    s = applyRoll(s, p1, 6, 16).state;
    expect(s.players[0].cells[0].progress).toBe(1);
    expect(s.players[0].cells[6].progress).toBe(1);
    expect(s.players[0].cells[2].progress).toBe(0);
  });

  it("rejects commands with STALE_STATE when expectedStateVersion does not match", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;

    expect(() =>
      applyRoll(state, p1, 0, 10, { expectedStateVersion: 999 })
    ).toThrowError(GameRuleError);

    try {
      applyRoll(state, p1, 0, 10, { expectedStateVersion: 999 });
    } catch (err: any) {
      expect(err.code).toBe("STALE_STATE");
    }
  });

  it("rejects duplicate commands with DUPLICATE_COMMAND", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;

    const res = applyRoll(state, p1, 0, 10, { commandId: "cmd-123" });
    expect(res.state.processedCommandIds).toContain("cmd-123");

    // Attempting same commandId
    expect(() =>
      applyRoll(res.state, res.state.turn.currentPlayerId!, 0, 10, { commandId: "cmd-123" })
    ).toThrowError(GameRuleError);

    try {
      applyRoll(res.state, res.state.turn.currentPlayerId!, 0, 10, { commandId: "cmd-123" });
    } catch (err: any) {
      expect(err.code).toBe("DUPLICATE_COMMAND");
    }
  });

  it("handles match pause, gameplay rejection during pause, and successful resume", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p2 = state.players[1].playerId;

    const pauseRes = pauseMatch(state, p2, 60_000);
    expect(pauseRes.state.phase).toBe("PAUSED");
    expect(pauseRes.events.some((e) => e.type === "MATCH_PAUSED")).toBe(true);

    // Gameplay commands must be rejected with MATCH_PAUSED while paused
    expect(() =>
      applyRoll(pauseRes.state, pauseRes.state.turn.currentPlayerId!, 0, 10)
    ).toThrowError(GameRuleError);

    try {
      applyRoll(pauseRes.state, pauseRes.state.turn.currentPlayerId!, 0, 10);
    } catch (err: any) {
      expect(err.code).toBe("MATCH_PAUSED");
    }

    // Resume match
    const resumeRes = resumeMatch(pauseRes.state, p2);
    expect(resumeRes.state.phase).toBe("ACTIVE");
    expect(resumeRes.events.some((e) => e.type === "PLAYER_RECONNECTED")).toBe(true);
    expect(resumeRes.events.some((e) => e.type === "MATCH_RESUMED")).toBe(true);
  });

  it("rejects reconnect if deadline has expired with RECONNECT_EXPIRED", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p2 = state.players[1].playerId;

    // Timeout of -1000ms ensures deadline is already in the past
    const pauseRes = pauseMatch(state, p2, -1000);

    expect(() => resumeMatch(pauseRes.state, p2)).toThrowError(GameRuleError);
    try {
      resumeMatch(pauseRes.state, p2);
    } catch (err: any) {
      expect(err.code).toBe("RECONNECT_EXPIRED");
    }
  });

  it("advances turn if the eliminated player was the current turn owner", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    const p1 = state.players[0].playerId;
    expect(state.turn.currentPlayerId).toBe(p1);

    const res = eliminatePlayer(state, p1, "VOLUNTARY_LEAVE");
    expect(res.state.turn.currentPlayerId).toBe(state.players[1].playerId);
  });

  it("rejects pausing a completed match with MATCH_NOT_ACTIVE", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    state.phase = "COMPLETED";

    expect(() => pauseMatch(state, state.players[0].playerId)).toThrowError(GameRuleError);
    try {
      pauseMatch(state, state.players[0].playerId);
    } catch (err: any) {
      expect(err.code).toBe("MATCH_NOT_ACTIVE");
    }
  });

  it("rejects resuming when match is not paused with INVALID_COMMAND", () => {
    const { state } = createInitialMatchState("m1", "r1", createTestPlayers(5));
    expect(() => resumeMatch(state, state.players[0].playerId)).toThrowError(GameRuleError);
    try {
      resumeMatch(state, state.players[0].playerId);
    } catch (err: any) {
      expect(err.code).toBe("INVALID_COMMAND");
    }
  });

  it("verifies package entrypoint exports", async () => {
    const entry = await import("../src/index.js");
    expect(entry.createInitialMatchState).toBeDefined();
    expect(entry.applyRoll).toBeDefined();
    expect(entry.applyShot).toBeDefined();
    expect(entry.generateBookRoll).toBeDefined();
  });
});
