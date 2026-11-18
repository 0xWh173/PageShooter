import type { CellValue } from "@pageshooter/shared";
import type {
  CharacterDefinition,
  MatchCharacterConfig,
  PlayerCharacterConfig
} from "./types.js";
import { HAND_DRAWN_CHARACTERS } from "./roster.js";

export { HAND_DRAWN_CHARACTERS };

const DEFAULT_CHARACTER_ID = "barnaby";

const CHARACTER_MAP = new Map<string, CharacterDefinition>(
  HAND_DRAWN_CHARACTERS.map((char) => [char.id, char])
);

export function getAllCharacters(): CharacterDefinition[] {
  return HAND_DRAWN_CHARACTERS;
}

export function getCharacter(id: string): CharacterDefinition {
  const found = CHARACTER_MAP.get(id);
  if (found) return found;
  return CHARACTER_MAP.get(DEFAULT_CHARACTER_ID) || HAND_DRAWN_CHARACTERS[0];
}

/**
 * Deterministic PRNG seeded by matchId and seat index to ensure reproducible,
 * consistent shuffling that survives across page refreshes.
 */
function createSeededRandom(seedStr: string): () => number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return ((h ^= h >>> 16) >>> 0) / 4294967296;
  };
}

/**
 * Assigns exactly 5 distinct hand-drawn stick figures to each player's 5 folio cells (0, 2, 4, 6, 8).
 * Guarantees zero duplicate characters within a player's seat.
 */
export function assignMatchCharacters(
  matchId: string,
  players: (string | { playerId: string })[]
): MatchCharacterConfig {
  const playerIds: string[] = players.map((p) => (typeof p === "string" ? p : p.playerId));
  const playerCharacters: Record<string, PlayerCharacterConfig> = {};

  playerIds.forEach((pid, seatIdx) => {
    const rng = createSeededRandom(`${matchId}_seat_${seatIdx}_${pid}`);

    // Shuffle a copy of all 20 character IDs
    const pool = [...HAND_DRAWN_CHARACTERS.map((c) => c.id)];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const temp = pool[i];
      pool[i] = pool[j];
      pool[j] = temp;
    }

    // Pick top 5 distinct characters
    const assigned = pool.slice(0, 5);
    const assignments: Record<CellValue, string> = {
      0: assigned[0],
      2: assigned[1],
      4: assigned[2],
      6: assigned[3],
      8: assigned[4]
    };

    playerCharacters[pid] = {
      playerId: pid,
      characterAssignments: assignments
    };
  });

  return {
    matchId,
    playerCharacters
  };
}

/**
 * Fallback to ensure every active player has a complete, valid character assignment.
 */
export function ensureMatchCharacters(
  existing: MatchCharacterConfig | null | undefined,
  matchId: string,
  players: (string | { playerId: string })[]
): MatchCharacterConfig {
  const playerIds: string[] = players.map((p) => (typeof p === "string" ? p : p.playerId));
  if (!existing || existing.matchId !== matchId || !existing.playerCharacters) {
    return assignMatchCharacters(matchId, playerIds);
  }

  const updated: Record<string, PlayerCharacterConfig> = { ...existing.playerCharacters };
  let needsRegen = false;

  for (const pid of playerIds) {
    const current = updated[pid];
    if (
      !current ||
      !current.characterAssignments ||
      Object.keys(current.characterAssignments).length < 5
    ) {
      needsRegen = true;
      break;
    }

    // Validate all characters exist in roster
    const values = Object.values(current.characterAssignments);
    const unique = new Set(values);
    if (unique.size < 5 || values.some((cid) => !CHARACTER_MAP.has(cid))) {
      needsRegen = true;
      break;
    }
  }

  if (needsRegen) {
    return assignMatchCharacters(matchId, playerIds);
  }

  return existing;
}
