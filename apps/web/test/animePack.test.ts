// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from "vitest";
import "fake-indexeddb/auto";
import {
  ANIME_PACK_REGISTRY,
  getAnimePack,
  getCharacter,
  assignMatchVisuals,
  ensureMatchVisuals
} from "../src/anime/registry.js";
import { DRAGON_BALL_CHARACTERS } from "../src/anime/packs/dragonBall.js";
import { assetCacheManager } from "../src/anime/preloader.js";
import {
  saveOfflineMatchVisuals,
  loadOfflineMatchVisuals,
  clearOfflineMatch,
  resetDbInstance
} from "../src/storage/db.js";
import { CELL_VALUES } from "@pageshooter/shared";

describe("Anime Character Pack System QA", () => {
  beforeEach(async () => {
    resetDbInstance();
    await clearOfflineMatch();
  });

  describe("Phase A & B: Roster & Character Definitions", () => {
    it("provides the Dragon Ball Z prototype pack with at least 12 distinct characters", () => {
      const dbz = getAnimePack("dragon-ball");
      expect(dbz).toBeDefined();
      expect(dbz.id).toBe("dragon-ball");
      expect(dbz.status).toBe("available");
      expect(dbz.roster.length).toBeGreaterThanOrEqual(12);

      const expectedNames = [
        "Goku",
        "Vegeta",
        "Gohan",
        "Piccolo",
        "Krillin",
        "Trunks",
        "Frieza",
        "Cell",
        "Majin Buu",
        "Goten",
        "Beerus",
        "Whis"
      ];

      for (const name of expectedNames) {
        const found = dbz.roster.find((c) => c.name === name);
        expect(found, `Missing expected Dragon Ball fighter: ${name}`).toBeDefined();
        expect(found?.attack.attackName).toBeTruthy();
        expect(found?.attack.beamColor).toBeTruthy();
        expect(found?.primaryColor).toBeTruthy();
      }
    });

    it("registers upcoming packs without crashing", () => {
      expect(ANIME_PACK_REGISTRY["naruto"].status).toBe("coming_soon");
      expect(ANIME_PACK_REGISTRY["one-piece"].status).toBe("coming_soon");
      expect(ANIME_PACK_REGISTRY["bleach"].status).toBe("coming_soon");
      expect(ANIME_PACK_REGISTRY["jujutsu-kaisen"].status).toBe("coming_soon");
    });
  });

  describe("Phase A: Random 5-Cell Character Assignment", () => {
    it("randomly assigns 5 distinct characters to the 5 cells for each player", () => {
      const playerInputs = [
        { playerId: "p1", animePackId: "dragon-ball" as const },
        { playerId: "p2", animePackId: "dragon-ball" as const }
      ];

      const config = assignMatchVisuals("match-101", playerInputs);

      expect(config.matchId).toBe("match-101");
      expect(config.playerVisuals["p1"]).toBeDefined();
      expect(config.playerVisuals["p2"]).toBeDefined();

      const p1Cells = config.playerVisuals["p1"].characterAssignments;
      const assignedCharIds = CELL_VALUES.map((val) => p1Cells[val]);

      // All 5 cell assignments must be present
      expect(assignedCharIds.length).toBe(5);

      // All 5 assigned characters must be distinct (no duplicates on same player's matrix)
      const uniqueCharIds = new Set(assignedCharIds);
      expect(uniqueCharIds.size).toBe(5);

      // Verify each character exists in Dragon Ball roster
      for (const cid of uniqueCharIds) {
        const char = getCharacter("dragon-ball", cid);
        expect(char).toBeDefined();
      }
    });
  });

  describe("Phase A: IndexedDB Persistence and Exact Match Recovery", () => {
    it("persists and restores exact visual configuration across page reloads", async () => {
      const playerInputs = [
        { playerId: "player_alpha", animePackId: "dragon-ball" as const },
        { playerId: "player_beta", animePackId: "dragon-ball" as const }
      ];

      const originalConfig = assignMatchVisuals("match-recovery-test", playerInputs);
      await saveOfflineMatchVisuals(originalConfig);

      // Simulate browser reload by loading fresh from DB
      const loaded = await loadOfflineMatchVisuals();
      expect(loaded).toBeDefined();
      expect(loaded?.matchId).toBe("match-recovery-test");

      // Verify exact character assignments are restored identically
      for (const val of CELL_VALUES) {
        expect(loaded?.playerVisuals["player_alpha"].characterAssignments[val]).toBe(
          originalConfig.playerVisuals["player_alpha"].characterAssignments[val]
        );
        expect(loaded?.playerVisuals["player_beta"].characterAssignments[val]).toBe(
          originalConfig.playerVisuals["player_beta"].characterAssignments[val]
        );
      }
    });

    it("ensureMatchVisuals provides fallback if visual configuration is missing or mismatched", () => {
      const recovered = ensureMatchVisuals(null, "fallback-match", ["p1", "p2"]);
      expect(recovered).toBeDefined();
      expect(recovered.matchId).toBe("fallback-match");
      expect(recovered.playerVisuals["p1"]).toBeDefined();
      expect(Object.keys(recovered.playerVisuals["p1"].characterAssignments).length).toBe(5);
    });
  });

  describe("Phase A & D: Asset Preloading and Validation", () => {
    it("preloads and validates all 12 Dragon Ball characters successfully", async () => {
      const ok = await assetCacheManager.preloadPack("dragon-ball");
      expect(ok).toBe(true);
      expect(assetCacheManager.isPackPreloaded("dragon-ball")).toBe(true);

      for (const char of DRAGON_BALL_CHARACTERS) {
        expect(assetCacheManager.isCharacterValid("dragon-ball", char.id)).toBe(true);
      }
    });
  });
});
