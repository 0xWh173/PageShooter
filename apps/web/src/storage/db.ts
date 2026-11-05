import { openDB, type IDBPDatabase } from "idb";
import type { MatchState } from "@pageshooter/shared";

const DB_NAME = "pageshooter_offline_db";
const DB_VERSION = 1;
const STORE_NAME = "matches";
const MATCH_KEY = "current_match";

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
 * Loads the current offline match state from IndexedDB.
 * If onlyActive is true, returns null if the match is COMPLETED.
 * Returns null if no match is stored or if stored state is invalid.
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
 * Deletes the stored offline match from IndexedDB.
 */
export async function clearOfflineMatch(): Promise<void> {
  const db = await getDb();
  await db.delete(STORE_NAME, MATCH_KEY);
}
