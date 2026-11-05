import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { saveOfflineMatch, loadOfflineMatch, clearOfflineMatch, resetDbInstance } from "../src/storage/db.js";
import {
  createInitialMatchState,
  applyRoll,
  applyShot,
  hasAnyValidOpponentTarget
} from "@pageshooter/game-engine";
import type { CellValue } from "@pageshooter/shared";

const FIVE_PLAYERS = [
  { playerId: "p1", username: "Aethelgard" },
  { playerId: "p2", username: "Balthazar" },
  { playerId: "p3", username: "Cassian" },
  { playerId: "p4", username: "Darius" },
  { playerId: "p5", username: "Elspeth" }
];

describe("Offline Game & Local Persistence Integration", () => {
  beforeEach(async () => {
    resetDbInstance();
    await clearOfflineMatch();
  });

  afterEach(async () => {
    await clearOfflineMatch();
    resetDbInstance();
  });

  it("persists and restores match progression after rolls and shots", async () => {
    // 1. Initialize match
    let { state } = createInitialMatchState("offline-int-1", "offline-room", FIVE_PLAYERS);
    await saveOfflineMatch(state);

    let restored = await loadOfflineMatch();
    expect(restored).not.toBeNull();
    expect(restored?.phase).toBe("ACTIVE");
    expect(restored?.totalTurns).toBe(1);

    const shooterId = state.turn.currentPlayerId!;
    const cellToRoll: CellValue = 4;

    // 2. Advance cell 4 to Gun (progress = 5, hasGun = true)
    const shooter = state.players.find((p) => p.playerId === shooterId)!;
    shooter.cells[cellToRoll].progress = 5;
    shooter.cells[cellToRoll].hasGun = true;
    await saveOfflineMatch(state);

    restored = await loadOfflineMatch();
    expect(restored).not.toBeNull();
    const loadedShooter = restored?.players.find((p) => p.playerId === shooterId)!;
    expect(loadedShooter.cells[cellToRoll].progress).toBe(5);
    expect(loadedShooter.cells[cellToRoll].hasGun).toBe(true);
    expect(restored?.turn.pendingShot).toBe(false);

    // 3. Roll 6th matching roll: gains bullet and requires mandatory shot
    const bulletRoll = applyRoll(state, shooterId, cellToRoll, 200 + cellToRoll);
    state = bulletRoll.state;
    await saveOfflineMatch(state);

    restored = await loadOfflineMatch();
    expect(restored?.turn.pendingShot).toBe(true);
    expect(restored?.turn.rolledCell).toBe(cellToRoll);

    // 4. Execute shot against opponent
    const targetPlayer = restored!.players.find((p) => p.playerId !== shooterId && p.status === "ACTIVE")!;
    const targetCell: CellValue = 0;

    const shotRes = applyShot(
      state,
      shooterId,
      targetPlayer.playerId,
      targetCell
    );
    state = shotRes.state;
    await saveOfflineMatch(state);

    restored = await loadOfflineMatch();
    expect(restored?.turn.pendingShot).toBe(false);
    const updatedTarget = restored?.players.find((p) => p.playerId === targetPlayer.playerId)!;
    expect(updatedTarget.cells[targetCell].destroyed).toBe(true);
    // Turn advanced to next player
    expect(restored?.turn.currentPlayerId).not.toBe(shooterId);
  });

  it("persists elimination and victory accurately across refresh", async () => {
    let { state } = createInitialMatchState("offline-int-2", "offline-room", FIVE_PLAYERS);
    const winnerId = state.players[0].playerId;

    // Eliminate other 4 players by destroying all their cells
    for (let i = 1; i < state.players.length; i++) {
      const victim = state.players[i];
      for (const val of [0, 2, 4, 6, 8] as CellValue[]) {
        victim.cells[val].destroyed = true;
      }
      victim.status = "ELIMINATED";
    }

    // Now only winner is ACTIVE
    // Verify engine detects victory
    expect(state.players.filter((p) => p.status === "ACTIVE").length).toBe(1);

    // Advance turn or verify state can be saved as completed
    state.phase = "COMPLETED";
    state.winnerPlayerId = winnerId;
    state.winReason = "LAST_PLAYER_STANDING";
    state.completedAt = Date.now();

    await saveOfflineMatch(state);

    const reloaded = await loadOfflineMatch();
    expect(reloaded?.phase).toBe("COMPLETED");
    expect(reloaded?.winnerPlayerId).toBe(winnerId);
    expect(reloaded?.winReason).toBe("LAST_PLAYER_STANDING");

    // Requirement 4: Completed matches are NOT offered as active resumable matches
    const activeOnly = await loadOfflineMatch(true);
    expect(activeOnly).toBeNull();
  });

  it("exact match recovery on refresh during normal turn", async () => {
    const { state } = createInitialMatchState("offline-int-turn", "offline-room", FIVE_PLAYERS);
    await saveOfflineMatch(state);

    const reloaded = await loadOfflineMatch(true);
    expect(reloaded).not.toBeNull();
    expect(reloaded?.matchId).toBe("offline-int-turn");
    expect(reloaded?.turn.phase).toBe("AWAITING_ROLL");
    expect(reloaded?.turn.pendingShot).toBe(false);
    expect(reloaded?.turn.currentPlayerId).toBe(state.turn.currentPlayerId);
  });

  it("exact match recovery on refresh during mandatory shot", async () => {
    let { state } = createInitialMatchState("offline-int-shot", "offline-room", FIVE_PLAYERS);
    const shooterId = state.turn.currentPlayerId!;
    const shooter = state.players.find((p) => p.playerId === shooterId)!;
    shooter.cells[2].progress = 5;
    shooter.cells[2].hasGun = true;

    // Roll 6th matching roll -> grants bullet and enters AWAITING_SHOT
    state = applyRoll(state, shooterId, 2, 22).state;
    expect(state.turn.phase).toBe("AWAITING_SHOT");
    expect(state.turn.pendingShot).toBe(true);
    expect(state.turn.rolledCell).toBe(2);

    // Save state (as happens before book animation begins)
    await saveOfflineMatch(state);

    // Simulate browser refresh during animation or while awaiting shot
    const restored = await loadOfflineMatch(true);
    expect(restored).not.toBeNull();
    expect(restored?.turn.phase).toBe("AWAITING_SHOT");
    expect(restored?.turn.pendingShot).toBe(true);
    expect(restored?.turn.rolledCell).toBe(2);
    expect(restored?.turn.currentPlayerId).toBe(shooterId);
  });
});
