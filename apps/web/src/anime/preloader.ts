import type { AnimePackId } from "./types.js";
import { getAnimePack } from "./registry.js";

class AssetCacheManager {
  private preloadedPacks: Set<AnimePackId> = new Set();
  private validationResults: Map<string, boolean> = new Map();

  /**
   * Preloads and validates assets for the specified anime pack.
   * Only loads the selected pack to avoid memory bloat.
   */
  public async preloadPack(packId: AnimePackId): Promise<boolean> {
    if (this.preloadedPacks.has(packId)) {
      return true;
    }

    try {
      const manifest = getAnimePack(packId);
      if (!manifest || manifest.roster.length === 0) {
        return false;
      }

      // Validate all characters in the roster
      for (const char of manifest.roster) {
        const key = `${packId}:${char.id}`;
        const isValid =
          Boolean(char.id) &&
          Boolean(char.name) &&
          Boolean(char.attack?.attackName) &&
          Boolean(char.attack?.beamColor);

        this.validationResults.set(key, isValid);
      }

      this.preloadedPacks.add(packId);
      return true;
    } catch (err) {
      console.warn(`Failed to preload anime pack "${packId}":`, err);
      return false;
    }
  }

  public isPackPreloaded(packId: AnimePackId): boolean {
    return this.preloadedPacks.has(packId);
  }

  public isCharacterValid(packId: AnimePackId, characterId: string): boolean {
    const key = `${packId}:${characterId}`;
    return this.validationResults.get(key) ?? true;
  }
}

export const assetCacheManager = new AssetCacheManager();
