import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto";
import { saveOfflineMatch, loadOfflineMatch, clearOfflineMatch, resetDbInstance } from "../src/storage/db.js";
import { createInitialMatchState } from "@pageshooter/game-engine";

const SAMPLE_PLAYERS = [
  { playerId: "p1", username: "Aethelgard" },
  { playerId: "p2", username: "Balthazar" },
  { playerId: "p3", username: "Cassian" },
  { playerId: "p4", username: "Darius" },
  { playerId: "p5", username: "Elspeth" }
];

describe("IndexedDB Storage Layer", () => {
  beforeEach(async () => {
    resetDbInstance();
    await clearOfflineMatch();
  });

  afterEach(async () => {
    await clearOfflineMatch();
    resetDbInstance();
  });

  it("returns null when no match is saved", async () => {
    const match = await loadOfflineMatch();
    expect(match).toBeNull();
  });

  it("saves and reloads a match state accurately", async () => {
    const { state: initial } = createInitialMatchState(
      "offline-test-1",
      "room-offline",
      SAMPLE_PLAYERS
    );

    await saveOfflineMatch(initial);

    const reloaded = await loadOfflineMatch();
    expect(reloaded).not.toBeNull();
    expect(reloaded?.matchId).toBe(initial.matchId);
    expect(reloaded?.players.length).toBe(5);
    expect(reloaded?.phase).toBe(initial.phase);
    expect(reloaded?.turn.currentPlayerId).toBe(initial.turn.currentPlayerId);
  });

  it("overwrites existing match when saved again", async () => {
    const { state: initial } = createInitialMatchState(
      "offline-test-2",
      "room-offline",
      SAMPLE_PLAYERS
    );

    await saveOfflineMatch(initial);

    const modified = { ...initial, totalTurns: 42 };
    await saveOfflineMatch(modified);

    const reloaded = await loadOfflineMatch();
    expect(reloaded?.totalTurns).toBe(42);
  });

  it("clears stored match completely", async () => {
    const { state: initial } = createInitialMatchState(
      "offline-test-3",
      "room-offline",
      SAMPLE_PLAYERS
    );

    await saveOfflineMatch(initial);
    expect(await loadOfflineMatch()).not.toBeNull();

    await clearOfflineMatch();
    expect(await loadOfflineMatch()).toBeNull();
  });
});
