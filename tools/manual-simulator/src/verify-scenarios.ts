import {
  CELL_VALUES,
  CellValue,
  PlayerPosition
} from "@pageshooter/shared";
import {
  createInitialMatchState,
  applyRoll,
  applyShot,
  generatePageNumberForOutcome
} from "@pageshooter/game-engine";
import {
  startMatch,
  createPlayers
} from "./index.js";

interface ScenarioResult {
  scenarioNumber: number;
  title: string;
  commands: string[];
  expectedResult: string;
  actualResult: string;
  passed: boolean;
}

const results: ScenarioResult[] = [];

function recordScenario(
  scenarioNumber: number,
  title: string,
  commands: string[],
  expectedResult: string,
  actualResult: string,
  passed: boolean
) {
  results.push({
    scenarioNumber,
    title,
    commands,
    expectedResult,
    actualResult,
    passed
  });
}

export function runAll17Scenarios(): ScenarioResult[] {
  // Scenario 1: Five-player match initialization
  {
    const session = startMatch(5);
    const count = session.state.players.length;
    const positions = session.state.players.map((p) => p.position);
    const hasP1toP5 = ["P1", "P2", "P3", "P4", "P5"].every((p) => positions.includes(p as PlayerPosition));
    const expected = "Match starts in ACTIVE phase with exactly 5 players assigned positions P1 through P5.";
    const actual = `Phase: ${session.state.phase}, Players: ${count}, Positions: [${positions.join(", ")}], Current Turn: ${session.state.turn.currentPlayerId}`;
    recordScenario(1, "Five-player match initialization", ["reset 5", "show"], expected, actual, count === 5 && hasP1toP5);
  }

  // Scenario 2: Ten-player match initialization
  {
    const session = startMatch(10);
    const count = session.state.players.length;
    const positions = session.state.players.map((p) => p.position);
    const hasP1toP10 = Array.from({ length: 10 }, (_, i) => `P${i + 1}`).every((p) => positions.includes(p as PlayerPosition));
    const expected = "Match starts in ACTIVE phase with exactly 10 players assigned positions P1 through P10.";
    const actual = `Phase: ${session.state.phase}, Players: ${count}, Positions: [${positions.join(", ")}]`;
    recordScenario(2, "Ten-player match initialization", ["reset 10", "show"], expected, actual, count === 10 && hasP1toP10);
  }

  // Scenario 3: Complete cell progression from Empty to Face, Body, Legs, Arms and Gun
  {
    const match = createInitialMatchState("m-prog", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    const cellVal: CellValue = 4;
    const stages: string[] = [];

    for (let rollCount = 1; rollCount <= 5; rollCount++) {
      const page = generatePageNumberForOutcome(cellVal);
      const res = applyRoll(state, p1, cellVal, page);
      state = res.state;
      const progress = state.players[0].cells[cellVal].progress;
      stages.push(`Roll ${rollCount}: Progress ${progress} (hasGun: ${state.players[0].cells[cellVal].hasGun})`);

      // Cycle turn back to P1
      if (rollCount < 5) {
        for (let i = 1; i < 5; i++) {
          state = applyRoll(state, state.turn.currentPlayerId!, 0, 10).state;
        }
      }
    }

    const expected = "Progression strictly advances: 1=Face -> 2=Body -> 3=Legs -> 4=Arms -> 5=Gun";
    const actual = stages.join(" | ");
    recordScenario(3, "Complete cell progression Empty -> Face -> Body -> Legs -> Arms -> Gun", ["roll 4 (x5)"], expected, actual, state.players[0].cells[cellVal].progress === 5 && state.players[0].cells[cellVal].hasGun === true);
  }

  // Scenario 4: Verify Gun creation does not fire
  {
    const match = createInitialMatchState("m-gun", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    state.players[0].cells[0].progress = 4; // At Arms
    const res = applyRoll(state, p1, 0, 10); // 5th roll creates gun
    state = res.state;

    const expected = "Gun created (progress 5, hasGun true); pendingShot is false; turn finishes without firing and advances to next player.";
    const actual = `progress: ${state.players[0].cells[0].progress}, hasGun: ${state.players[0].cells[0].hasGun}, pendingShot: ${state.turn.pendingShot}, currentTurn: ${state.turn.currentPlayerId}`;
    const passed = state.players[0].cells[0].progress === 5 && state.players[0].cells[0].hasGun === true && state.turn.pendingShot === false && state.turn.currentPlayerId !== p1;
    recordScenario(4, "Verify Gun creation does not fire", ["roll 0 (5th matching roll)"], expected, actual, passed);
  }

  // Scenario 5: Verify sixth matching roll creates exactly one bullet and requires an immediate shot
  {
    const match = createInitialMatchState("m-shot", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    state.players[0].cells[2].progress = 5;
    state.players[0].cells[2].hasGun = true;

    const res = applyRoll(state, p1, 2, 12);
    state = res.state;

    const expected = "Turn phase becomes AWAITING_SHOT, pendingShot is true, rolledCell is 2, current turn remains with shooter.";
    const actual = `phase: ${state.turn.phase}, pendingShot: ${state.turn.pendingShot}, rolledCell: ${state.turn.rolledCell}, shooter: ${state.turn.currentPlayerId}`;
    const passed = state.turn.phase === "AWAITING_SHOT" && state.turn.pendingShot === true && state.turn.currentPlayerId === p1;
    recordScenario(5, "Sixth matching roll creates 1 bullet and requires immediate shot", ["roll 2 (6th roll on Gun cell)"], expected, actual, passed);
  }

  // Scenario 6: Verify subsequent matching rolls never accumulate bullets
  {
    const match = createInitialMatchState("m-nobullets", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    state.players[0].cells[6].progress = 5;
    state.players[0].cells[6].hasGun = true;

    // Roll 6 -> 1 bullet
    state = applyRoll(state, p1, 6, 16).state;
    // Attempting another roll while pending shot is rejected
    let rejected = false;
    let errorCode = "";
    try {
      applyRoll(state, p1, 6, 26);
    } catch (err: unknown) {
      rejected = true;
      errorCode = (err as { code: string }).code;
    }

    const expected = "Bullets cannot accumulate; player must shoot before rolling again. Second roll attempt rejected with INVALID_COMMAND.";
    const actual = `Rejected: ${rejected}, Code: ${errorCode}, PendingShot: ${state.turn.pendingShot}`;
    recordScenario(6, "Subsequent matching rolls never accumulate bullets", ["roll 6", "roll 6"], expected, actual, rejected && errorCode === "INVALID_COMMAND");
  }

  // Scenario 7: Verify a destroyed-cell roll wastes the turn
  {
    const match = createInitialMatchState("m-waste", "r", createPlayers(5));
    const state = match.state;
    const p1 = state.players[0].playerId;
    state.players[0].cells[8].destroyed = true;
    state.players[0].cells[8].progress = 3;

    const res = applyRoll(state, p1, 8, 18);
    const hasTurnWastedEvent = res.events.some((e) => e.type === "TURN_WASTED");
    const progressAfter = res.state.players[0].cells[8].progress;
    const turnOwnerAfter = res.state.turn.currentPlayerId;

    const expected = "TURN_WASTED event emitted; cell progress remains unchanged at 3; turn immediately advances to next player.";
    const actual = `Event: ${hasTurnWastedEvent ? "TURN_WASTED" : "None"}, Progress: ${progressAfter}, NextTurnPlayer: ${turnOwnerAfter}`;
    recordScenario(7, "Destroyed-cell roll wastes the turn", ["roll 8 (on destroyed cell)"], expected, actual, hasTurnWastedEvent && progressAfter === 3 && turnOwnerAfter !== p1);
  }

  // Scenario 8: Verify shooting an empty opponent cell
  {
    const match = createInitialMatchState("m-shoot-empty", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;

    state = applyRoll(state, p1, 0, 10).state;
    const res = applyShot(state, p1, p2, 0); // P2 cell 0 is empty (progress 0)
    const targetCell = res.state.players[1].cells[0];

    const expected = "Target empty cell 0 destroyed (destroyed: true); shooter kills incremented to 1; turn advances.";
    const actual = `targetCell.destroyed: ${targetCell.destroyed}, targetCell.progress: ${targetCell.progress}, shooterKills: ${res.state.players[0].kills}`;
    recordScenario(8, "Shooting an empty opponent cell", ["shoot P2 0"], expected, actual, targetCell.destroyed === true && res.state.players[0].kills === 1);
  }

  // Scenario 9: Verify shooting a partially progressed opponent cell
  {
    const match = createInitialMatchState("m-shoot-partial", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    state.players[1].cells[2].progress = 3; // Legs

    state = applyRoll(state, p1, 0, 10).state;
    const res = applyShot(state, p1, p2, 2);
    const targetCell = res.state.players[1].cells[2];

    const expected = "Entire partially progressed cell destroyed (destroyed: true); shooter kills: 1.";
    const actual = `targetCell.destroyed: ${targetCell.destroyed}, previousProgress: 3, shooterKills: ${res.state.players[0].kills}`;
    recordScenario(9, "Shooting a partially progressed opponent cell", ["shoot P2 2"], expected, actual, targetCell.destroyed === true && res.state.players[0].kills === 1);
  }

  // Scenario 10: Verify shooting a gun-equipped opponent cell
  {
    const match = createInitialMatchState("m-shoot-gun", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    state.players[1].cells[4].progress = 5;
    state.players[1].cells[4].hasGun = true;

    state = applyRoll(state, p1, 0, 10).state;
    const res = applyShot(state, p1, p2, 4);
    const targetCell = res.state.players[1].cells[4];

    const expected = "Gun-equipped opponent cell destroyed completely (destroyed: true); shooter kills: 1.";
    const actual = `targetCell.destroyed: ${targetCell.destroyed}, targetCell.hasGun: ${targetCell.hasGun}, shooterKills: ${res.state.players[0].kills}`;
    recordScenario(10, "Shooting a gun-equipped opponent cell", ["shoot P2 4"], expected, actual, targetCell.destroyed === true && res.state.players[0].kills === 1);
  }

  // Scenario 11: Verify shooting your own cell is rejected
  {
    const match = createInitialMatchState("m-self", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    state = applyRoll(state, p1, 0, 10).state;

    let rejected = false;
    let code = "";
    try {
      applyShot(state, p1, p1, 2);
    } catch (err: unknown) {
      rejected = true;
      code = (err as { code: string }).code;
    }

    const expected = "Shot at self-column rejected with GameRuleError (INVALID_TARGET).";
    const actual = `Rejected: ${rejected}, Code: ${code}`;
    recordScenario(11, "Shooting your own cell is rejected", ["shoot P1 2"], expected, actual, rejected && code === "INVALID_TARGET");
  }

  // Scenario 12: Verify shooting a destroyed cell is rejected
  {
    const match = createInitialMatchState("m-dest", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    state.players[1].cells[6].destroyed = true;
    state = applyRoll(state, p1, 0, 10).state;

    let rejected = false;
    let code = "";
    try {
      applyShot(state, p1, p2, 6);
    } catch (err: unknown) {
      rejected = true;
      code = (err as { code: string }).code;
    }

    const expected = "Shot at already destroyed cell rejected with GameRuleError (CELL_DESTROYED).";
    const actual = `Rejected: ${rejected}, Code: ${code}`;
    recordScenario(12, "Shooting a destroyed cell is rejected", ["shoot P2 6"], expected, actual, rejected && code === "CELL_DESTROYED");
  }

  // Scenario 13: Verify invalid shots do not consume a pending shot entitlement
  {
    const match = createInitialMatchState("m-consume", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    state = applyRoll(state, p1, 0, 10).state;

    try {
      applyShot(state, p1, p1, 0); // Invalid self shot
    } catch {
      // Expected rejection
    }

    const expected = "Pending shot entitlement remains true after rejected invalid shot.";
    const actual = `pendingShot: ${state.turn.pendingShot}, phase: ${state.turn.phase}`;
    recordScenario(13, "Invalid shots do not consume pending shot entitlement", ["shoot P1 0 (rejected)", "show"], expected, actual, state.turn.pendingShot === true && state.turn.phase === "AWAITING_SHOT");
  }

  // Scenario 14: Verify player elimination after five destroyed cells
  {
    const match = createInitialMatchState("m-elim", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;

    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;
    // Destroy 4 cells of P2
    state.players[1].cells[0].destroyed = true;
    state.players[1].cells[2].destroyed = true;
    state.players[1].cells[4].destroyed = true;
    state.players[1].cells[6].destroyed = true;
    // 5th cell is still intact
    state.players[1].cells[8].destroyed = false;

    state = applyRoll(state, p1, 0, 10).state;
    const res = applyShot(state, p1, p2, 8); // Destroy 5th cell

    const p2Status = res.state.players[1].status;
    const hasElimEvent = res.events.some((e) => e.type === "PLAYER_ELIMINATED");

    const expected = "Target player status transitions to ELIMINATED; PLAYER_ELIMINATED event emitted.";
    const actual = `p2Status: ${p2Status}, hasElimEvent: ${hasElimEvent}`;
    recordScenario(14, "Player elimination after 5 destroyed cells", ["shoot P2 8 (5th destroyed cell)"], expected, actual, p2Status === "ELIMINATED" && hasElimEvent);
  }

  // Scenario 15: Verify eliminated players are skipped
  {
    const match = createInitialMatchState("m-skip", "r", createPlayers(5));
    const state = match.state;
    const p1 = state.players[0].playerId;
    const p3 = state.players[2].playerId;
    state.players[1].status = "ELIMINATED"; // Eliminate P2

    const res = applyRoll(state, p1, 0, 10); // P1 rolls and completes turn
    const nextTurnPlayer = res.state.turn.currentPlayerId;

    const expected = "Turn advances from P1 directly to P3, skipping eliminated P2.";
    const actual = `Next turn player: ${nextTurnPlayer} (expected ${p3})`;
    recordScenario(15, "Eliminated players are skipped in turn order", ["roll 0 (P1 completes turn with P2 eliminated)"], expected, actual, nextTurnPlayer === p3);
  }

  // Scenario 16: Verify immediate victory when one player remains
  {
    const match = createInitialMatchState("m-win", "r", createPlayers(5));
    let state = match.state;
    const p1 = state.players[0].playerId;
    const p2 = state.players[1].playerId;

    // Eliminate P3, P4, P5
    state.players[2].status = "ELIMINATED";
    state.players[3].status = "ELIMINATED";
    state.players[4].status = "ELIMINATED";

    // P2 has 1 cell remaining
    state.players[1].cells[0].destroyed = true;
    state.players[1].cells[2].destroyed = true;
    state.players[1].cells[4].destroyed = true;
    state.players[1].cells[6].destroyed = true;
    state.players[1].cells[8].destroyed = false;

    state.players[0].cells[0].progress = 5;
    state.players[0].cells[0].hasGun = true;

    state = applyRoll(state, p1, 0, 10).state;
    const res = applyShot(state, p1, p2, 8); // P1 eliminates P2

    const phase = res.state.phase;
    const winner = res.state.winnerPlayerId;
    const reason = res.state.winReason;

    const expected = "Match phase becomes COMPLETED; winner is P1; reason is LAST_PLAYER_STANDING; match ends immediately.";
    const actual = `Phase: ${phase}, Winner: ${winner}, Reason: ${reason}`;
    recordScenario(16, "Immediate victory when one player remains", ["shoot P2 8 (final opponent eliminated)"], expected, actual, phase === "COMPLETED" && winner === p1 && reason === "LAST_PLAYER_STANDING");
  }

  // Scenario 17: Verify reset correctly initializes a new match
  {
    const session1 = startMatch(5);
    const session2 = startMatch(7);

    const matchIdChanged = session1.state.matchId !== session2.state.matchId;
    const newPlayerCount = session2.state.players.length;
    const isClean = session2.state.players.every((p) =>
      CELL_VALUES.every((v) => p.cells[v].progress === 0 && !p.cells[v].destroyed)
    );

    const expected = "New match initialized with new matchId, clean empty cells (progress 0, destroyed false), turn #1, phase ACTIVE.";
    const actual = `matchIdChanged: ${matchIdChanged}, newPlayerCount: ${newPlayerCount}, allCellsClean: ${isClean}, phase: ${session2.state.phase}`;
    recordScenario(17, "Reset correctly initializes a new match", ["reset 7"], expected, actual, matchIdChanged && newPlayerCount === 7 && isClean && session2.state.phase === "ACTIVE");
  }

  return results;
}

// Direct execution
if (process.argv[1]?.includes("verify-scenarios")) {
  console.log("\n=======================================================");
  console.log("  RUNNING COMPLETE 17 MANUAL SIMULATOR SCENARIOS AUDIT");
  console.log("=======================================================\n");

  const runResults = runAll17Scenarios();
  let allPassed = true;

  for (const r of runResults) {
    const statusMark = r.passed ? "✅ PASS" : "❌ FAIL";
    if (!r.passed) allPassed = false;
    console.log(`Scenario ${r.scenarioNumber}: ${r.title}`);
    console.log(`  Commands:        ${r.commands.join(" -> ")}`);
    console.log(`  Expected Result: ${r.expectedResult}`);
    console.log(`  Actual Result:   ${r.actualResult}`);
    console.log(`  Status:          ${statusMark}\n`);
  }

  console.log("=======================================================");
  if (allPassed) {
    console.log(`🎉 ALL 17 SCENARIOS VERIFIED SUCCESSFULLY! (17/17 PASSED)`);
  } else {
    console.log(`❌ SOME SCENARIOS FAILED AUDIT.`);
    process.exit(1);
  }
  console.log("=======================================================\n");
}
