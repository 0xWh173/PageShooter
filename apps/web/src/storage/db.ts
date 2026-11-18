import { openDB, type IDBPDatabase } from "idb";
import type { MatchState } from "@pageshooter/shared";
import type { MatchCharacterConfig } from "../characters/types.js";

const DB_NAME = "pageshooter_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "matches";
const MATCH_KEY = "current_match";
const CHARACTER_CONFIG_KEY = "current_match_characters";
const LEGACY_VISUAL_CONFIG_KEY = "current_match_visuals";

let dbPromise: Promise<IDBPDatabase> | null = null;

export function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      }
    });
  }
  return dbPromise;
}

/**
 * Resets db promise reference (useful for testing or full teardown).
 */
export function resetDbInstance(): void {
  dbPromise = null;
}

/**
 * Persists the current offline match state to IndexedDB.
 */
export async function saveOfflineMatch(state: MatchState): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, state, MATCH_KEY);
}

/**
 * Persists the character configuration to IndexedDB.
 */
export async function saveOfflineMatchCharacters(config: MatchCharacterConfig): Promise<void> {
  const db = await getDb();
  await db.put(STORE_NAME, config, CHARACTER_CONFIG_KEY);
}

/**
 * Backward-compatible alias for saveOfflineMatchCharacters.
 */
export async function saveOfflineMatchVisuals(config: MatchCharacterConfig): Promise<void> {
  return saveOfflineMatchCharacters(config);
}

/**
 * Loads the current offline match state from IndexedDB.
 */
export async function loadOfflineMatch(onlyActive: boolean = false): Promise<MatchState | null> {
  try {
    const db = await getDb();
    const data = await db.get(STORE_NAME, MATCH_KEY);
    if (!data) {
      return null;
    }
    if (!data.matchId || !Array.isArray(data.players)) {
      console.warn("Invalid match data found:", data);
      return null;
    }
    if (onlyActive && data.phase !== "ACTIVE") {
      return null;
    }
    return data as MatchState;
  } catch (err) {
    console.error("Failed to load offline match from IndexedDB:", err);
    return null;
  }
}

/**
 * Loads the stored character configuration from IndexedDB.
 */
export async function loadOfflineMatchCharacters(): Promise<MatchCharacterConfig | null> {
  try {
    const db = await getDb();
    let data = await db.get(STORE_NAME, CHARACTER_CONFIG_KEY);
    if (!data) {
      // Check legacy key for migration
      data = await db.get(STORE_NAME, LEGACY_VISUAL_CONFIG_KEY);
    }
    if (!data || !data.matchId) {
      return null;
    }
    return data as MatchCharacterConfig;
  } catch (err) {
    console.error("Failed to load match characters from IndexedDB:", err);
    return null;
  }
}

/**
 * Backward-compatible alias for loadOfflineMatchCharacters.
 */
export async function loadOfflineMatchVisuals(): Promise<MatchCharacterConfig | null> {
  return loadOfflineMatchCharacters();
}

/**
 * Deletes the stored offline match and its character configuration from IndexedDB.
 */
export async function clearOfflineMatch(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, MATCH_KEY);
  await db.delete(STORE_NAME, CHARACTER_CONFIG_KEY);
  await db.delete(STORE_NAME, LEGACY_VISUAL_CONFIG_KEY);
}
