// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  HAND_DRAWN_CHARACTERS,
  getCharacter,
  getAllCharacters,
  assignMatchCharacters,
  ensureMatchCharacters
} from "../src/characters/registry.js";
import {
  saveOfflineMatchCharacters,
  loadOfflineMatchCharacters,
  clearOfflineMatch,
  resetDbInstance
} from "../src/storage/db.js";
import { CELL_VALUES } from "@pageshooter/shared";

describe("Hand-Drawn Character System QA", () => {
  beforeEach(async () => {
    resetDbInstance();
    await clearOfflineMatch();
  });

  describe("Roster & Character Definitions", () => {
    it("provides at least 20 distinct original hand-drawn characters", () => {
      const all = getAllCharacters();
      expect(all.length).toBeGreaterThanOrEqual(20);
      expect(HAND_DRAWN_CHARACTERS.length).toBeGreaterThanOrEqual(20);

      const uniqueIds = new Set(all.map((c) => c.id));
      expect(uniqueIds.size).toBe(all.length);

      const expectedNames = [
        "Barnaby",
        "Professor Pip",
        "Captain Barnacle",
        "Clover",
        "Chef Pierre",
        "Hazel",
        "Sir Reginald",
        "Rowan",
        "Oliver",
        "Bramble",
        "Milo",
        "Fern",
        "Penny",
        "Jasper",
        "Willow",
        "Archie",
        "Dot",
        "Gideon",
        "Ziggy",
        "Luna"
      ];

      for (const name of expectedNames) {
        const found = all.find((c) => c.name === name);
        expect(found, `Missing expected hand-drawn fighter: ${name}`).toBeDefined();
        expect(found?.title).toBeTruthy();
        expect(found?.weapon).toBeTruthy();
        expect(found?.tintColor).toBeTruthy();
      }
    });

    it("ensures each character has distinct traits and weapons", () => {
      const all = getAllCharacters();
      for (const char of all) {
        expect(char.id).toBeTruthy();
        expect(char.name).toBeTruthy();
        expect(char.hair).toBeDefined();
        expect(char.eyewear).toBeDefined();
        expect(char.facialHair).toBeDefined();
        expect(char.clothing).toBeDefined();
        expect(char.hat).toBeDefined();
        expect(char.accessory).toBeDefined();
        expect(char.weapon).toBeDefined();
      }
    });
  });

  describe("Random 5-Cell Character Assignment", () => {
    it("randomly assigns 5 distinct characters to the 5 cells for each player without duplicates", () => {
      const playerInputs = [
        { playerId: "p1" },
        { playerId: "p2" },
        { playerId: "p3" }
      ];

      const config = assignMatchCharacters("match-101", playerInputs);

      expect(config.matchId).toBe("match-101");
      expect(config.playerCharacters["p1"]).toBeDefined();
      expect(config.playerCharacters["p2"]).toBeDefined();
      expect(config.playerCharacters["p3"]).toBeDefined();

      for (const p of playerInputs) {
        const pCells = config.playerCharacters[p.playerId].characterAssignments;
        const assignedCharIds = CELL_VALUES.map((val) => pCells[val]);

        // All 5 cell assignments must be present
        expect(assignedCharIds.length).toBe(5);

        // All 5 assigned characters must be distinct (no duplicates on same player's matrix)
        const uniqueCharIds = new Set(assignedCharIds);
        expect(uniqueCharIds.size).toBe(5);

        // Verify each character exists in roster
        for (const cid of uniqueCharIds) {
          const char = getCharacter(cid);
          expect(char).toBeDefined();
          expect(char.id).toBe(cid);
        }
      }
    });
  });

  describe("IndexedDB Persistence and Recovery", () => {
    it("persists and restores exact character configuration across page reloads", async () => {
      const playerInputs = [
        { playerId: "p1" },
        { playerId: "p2" }
      ];

      const initialConfig = assignMatchCharacters("match-saved-1", playerInputs);
      await saveOfflineMatchCharacters(initialConfig);

      const restoredConfig = await loadOfflineMatchCharacters();
      expect(restoredConfig).toBeDefined();
      expect(restoredConfig?.matchId).toBe("match-saved-1");

      for (const p of playerInputs) {
        const origCells = initialConfig.playerCharacters[p.playerId].characterAssignments;
        const restoredCells = restoredConfig?.playerCharacters[p.playerId].characterAssignments;

        for (const val of CELL_VALUES) {
          expect(restoredCells?.[val]).toBe(origCells[val]);
        }
      }
    });

    it("ensures match recovery automatically heals missing players or unassigned cells", () => {
      const partialConfig = {
        matchId: "match-healed",
        playerCharacters: {}
      };

      const healed = ensureMatchCharacters(partialConfig as any, "match-healed", ["p1", "p2"]);
      expect(healed.playerCharacters["p1"]).toBeDefined();
      expect(healed.playerCharacters["p2"]).toBeDefined();

      for (const val of CELL_VALUES) {
        expect(healed.playerCharacters["p1"].characterAssignments[val]).toBeDefined();
        expect(healed.playerCharacters["p2"].characterAssignments[val]).toBeDefined();
      }
    });
  });
});
