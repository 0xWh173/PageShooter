import React, { useState, useEffect, useCallback } from "react";
import type { MatchState, PlayerState, CellValue } from "@pageshooter/shared";
import {
  createInitialMatchState,
  applyRoll,
  applyShot,
  generateBookRoll
} from "@pageshooter/game-engine";
import { saveOfflineMatch, loadOfflineMatch, clearOfflineMatch } from "./storage/db.js";
import { soundManager } from "./audio/soundManager.js";
import { SetupScreen } from "./components/SetupScreen.js";
import { TurnHUD } from "./components/TurnHUD.js";
import { Battlefield } from "./components/Battlefield.js";
import { BookCinematic } from "./components/BookCinematic.js";
import { EliminationModal } from "./components/EliminationModal.js";
import { VictoryModal } from "./components/VictoryModal.js";

interface CinematicState {
  pageNumber: number;
  outcome: CellValue;
  consequenceText: string;
  nextMatchState: MatchState;
}

export const App: React.FC = () => {
  const [matchState, setMatchState] = useState<MatchState | null>(null);
  const [savedMatch, setSavedMatch] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [cinematicData, setCinematicData] = useState<CinematicState | null>(null);
  const [eliminatedNoticePlayer, setEliminatedNoticePlayer] = useState<PlayerState | null>(null);

  // Check IndexedDB for existing match on initial load
  useEffect(() => {
    let isMounted = true;
    loadOfflineMatch()
      .then((loaded) => {
        if (!isMounted) return;
        if (loaded) {
          setSavedMatch(loaded);
        }
      })
      .catch((err) => {
        console.error("IndexedDB initialization error:", err);
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // Start new match
  const handleStartMatch = async (playerNames: string[]) => {
    const matchId = `offline-match-${Date.now()}`;
    const playerInputs = playerNames.map((name, idx) => ({
      playerId: `p_${idx + 1}_${Date.now()}`,
      username: name,
      avatarId: `avatar_${idx + 1}`
    }));

    const { state } = createInitialMatchState(matchId, "offline-arena", playerInputs);
    await saveOfflineMatch(state);
    setMatchState(state);
    setSavedMatch(null);
    soundManager.playTurnChime();
  };

  // Resume saved match from IndexedDB
  const handleResumeSavedMatch = () => {
    if (savedMatch) {
      setMatchState(savedMatch);
      soundManager.playTurnChime();
    }
  };

  // Discard saved match
  const handleDiscardSavedMatch = async () => {
    await clearOfflineMatch();
    setSavedMatch(null);
  };

  // Abandon / Reset current match
  const handleResetMatch = async () => {
    await clearOfflineMatch();
    setMatchState(null);
    setSavedMatch(null);
    setCinematicData(null);
    setEliminatedNoticePlayer(null);
  };

  // Play again with same roster
  const handlePlayAgain = async () => {
    if (!matchState) return;
    const playerNames = matchState.players.map((p) => p.username);
    await handleStartMatch(playerNames);
  };

  // Roll book
  const handleRoll = async () => {
    if (!matchState || matchState.turn.phase !== "AWAITING_ROLL") return;
    const currentPlayerId = matchState.turn.currentPlayerId;
    if (!currentPlayerId) return;

    const currentPlayer = matchState.players.find((p) => p.playerId === currentPlayerId);
    if (!currentPlayer) return;

    // 1. Generate cryptographic outcome & page number
    const { outcome, pageNumber } = generateBookRoll();

    // 2. Apply roll to engine state
    const { state: nextState } = applyRoll(
      matchState,
      currentPlayerId,
      outcome,
      pageNumber
    );

    // 3. Immediately persist state to IndexedDB before animation starts
    await saveOfflineMatch(nextState);

    // 4. Determine consequence description
    let consequenceText: string;
    const targetCell = currentPlayer.cells[outcome];
    if (targetCell.destroyed) {
      consequenceText = `Cell #${outcome} is already destroyed! Turn wasted.`;
    } else if (targetCell.progress < 5) {
      const labels = ["Empty", "Face", "Body", "Legs", "Arms", "Gun"];
      consequenceText = `Cell #${outcome} advanced to ${labels[targetCell.progress + 1]}!`;
    } else {
      consequenceText = `Bullet created! Mandatory shot required immediately!`;
    }

    // 5. Trigger Cinematic
    setCinematicData({
      pageNumber,
      outcome,
      consequenceText,
      nextMatchState: nextState
    });
  };

  // Complete cinematic
  const handleCinematicComplete = useCallback(() => {
    if (cinematicData) {
      setMatchState(cinematicData.nextMatchState);
      setCinematicData(null);
    }
  }, [cinematicData]);

  // Select target opponent cell
  const handleSelectTarget = async (targetPlayerId: string, cellValue: CellValue) => {
    if (!matchState || !matchState.turn.pendingShot) return;
    const shooterId = matchState.turn.currentPlayerId;
    if (!shooterId) return;

    // Audio effects
    soundManager.playGunshot();
    setTimeout(() => {
      soundManager.playCellDestroyed();
    }, 180);

    // Apply shot in pure rules engine
    const { state: nextState, events } = applyShot(
      matchState,
      shooterId,
      targetPlayerId,
      cellValue
    );

    // Persist immediately to IndexedDB
    await saveOfflineMatch(nextState);
    setMatchState(nextState);

    // Check if any player was eliminated by this shot
    const eliminationEvent = events.find((e) => e.type === "PLAYER_ELIMINATED");
    if (eliminationEvent && eliminationEvent.actorPlayerId) {
      const eliminated = nextState.players.find(
        (p) => p.playerId === eliminationEvent.actorPlayerId
      );
      if (eliminated) {
        setEliminatedNoticePlayer(eliminated);
      }
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-fantasy-bg flex flex-col items-center justify-center text-fantasy-parchment">
        <span className="text-4xl animate-bounce mb-3">📜</span>
        <div className="font-serif text-lg tracking-wider text-fantasy-gold">
          Awakening Grimoire...
        </div>
      </div>
    );
  }

  // If no active match, show setup screen
  if (!matchState) {
    return (
      <SetupScreen
        savedMatch={savedMatch}
        onResumeSavedMatch={handleResumeSavedMatch}
        onDiscardSavedMatch={handleDiscardSavedMatch}
        onStartMatch={handleStartMatch}
      />
    );
  }

  return (
    <div className="min-h-screen bg-fantasy-bg text-fantasy-parchment flex flex-col justify-between selection:bg-fantasy-gold selection:text-black">
      {/* Turn HUD Header */}
      <TurnHUD
        matchState={matchState}
        isRolling={cinematicData !== null}
        onRoll={handleRoll}
        onResetMatch={handleResetMatch}
      />

      {/* Main Battlefield Area */}
      <main className="flex-1 flex flex-col justify-center py-4">
        <Battlefield
          matchState={matchState}
          onSelectTarget={handleSelectTarget}
        />
      </main>

      {/* Footer / Status bar */}
      <footer className="w-full border-t border-fantasy-border/40 py-2.5 px-4 text-center text-[11px] font-mono text-fantasy-parchment/40">
        <span>PageShooter v1.0 • Offline Mode (Local Pass & Play) • Auto-saved to IndexedDB</span>
      </footer>

      {/* Book Opening Cinematic Modal */}
      {cinematicData && (
        <BookCinematic
          pageNumber={cinematicData.pageNumber}
          outcome={cinematicData.outcome}
          consequenceText={cinematicData.consequenceText}
          onComplete={handleCinematicComplete}
        />
      )}

      {/* Player Elimination Modal */}
      {eliminatedNoticePlayer && (
        <EliminationModal
          eliminatedPlayer={eliminatedNoticePlayer}
          onDismiss={() => setEliminatedNoticePlayer(null)}
        />
      )}

      {/* Match Victory Modal */}
      {matchState.phase === "COMPLETED" && (
        <VictoryModal
          matchState={matchState}
          onPlayAgain={handlePlayAgain}
          onNewMatch={handleResetMatch}
        />
      )}
    </div>
  );
};
