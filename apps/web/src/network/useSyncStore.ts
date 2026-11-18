import { useSyncExternalStore } from "react";
import type { CellValue, PlayerState } from "@pageshooter/shared";
import { CELL_VALUES } from "@pageshooter/shared";
import type { SyncStore, SyncStoreState } from "./syncStore.js";

/**
 * React 18/19 tearing-free subscription to SyncStore via useSyncExternalStore.
 */
export function useSyncStore(syncStore: SyncStore): Readonly<SyncStoreState> {
  return useSyncExternalStore(
    (callback) => syncStore.subscribe(callback),
    () => syncStore.getState(),
    () => syncStore.getState()
  );
}

/**
 * Returns true if the local user is currently a spectator in the room.
 */
export function selectIsSpectator(
  state: Readonly<SyncStoreState>,
  currentUserId: string | null | undefined
): boolean {
  if (!currentUserId || !state.room) return false;
  return state.room.spectators.some((s) => s.userId === currentUserId);
}

/**
 * Returns true if the local user owns the active turn in the match.
 */
export function selectIsCurrentTurn(
  state: Readonly<SyncStoreState>,
  currentUserId: string | null | undefined
): boolean {
  if (!currentUserId || !state.match) return false;
  if (selectIsSpectator(state, currentUserId)) return false;
  return state.match.turn.currentPlayerId === currentUserId;
}

/**
 * Returns true if the local user can execute a Roll action right now.
 */
export function selectCanRoll(
  state: Readonly<SyncStoreState>,
  currentUserId: string | null | undefined
): boolean {
  if (!state.match || state.match.phase !== "ACTIVE") return false;
  if (!selectIsCurrentTurn(state, currentUserId)) return false;
  return state.match.turn.phase === "AWAITING_ROLL";
}

/**
 * Returns true if the local user can execute a Shoot action right now.
 */
export function selectCanShoot(
  state: Readonly<SyncStoreState>,
  currentUserId: string | null | undefined
): boolean {
  if (!state.match || state.match.phase !== "ACTIVE") return false;
  if (!selectIsCurrentTurn(state, currentUserId)) return false;
  return state.match.turn.phase === "AWAITING_SHOT" && state.match.turn.pendingShot;
}

export interface ValidTarget {
  playerId: string;
  cellValue: CellValue;
}

/**
 * Returns all legal { playerId, cellValue } targets for the current shooter.
 */
export function selectValidTargets(
  state: Readonly<SyncStoreState>,
  currentUserId: string | null | undefined
): ValidTarget[] {
  if (!selectCanShoot(state, currentUserId) || !state.match) return [];

  const targets: ValidTarget[] = [];
  for (const player of state.match.players) {
    if (player.playerId === currentUserId || player.status === "ELIMINATED") {
      continue;
    }
    for (const val of CELL_VALUES) {
      if (!player.cells[val].destroyed) {
        targets.push({ playerId: player.playerId, cellValue: val });
      }
    }
  }
  return targets;
}

/**
 * Returns the active turn's PlayerState, if any.
 */
export function selectCurrentTurnPlayer(state: Readonly<SyncStoreState>): PlayerState | null {
  if (!state.match) return null;
  return (
    state.match.players.find((p) => p.playerId === state.match?.turn.currentPlayerId) ?? null
  );
}
