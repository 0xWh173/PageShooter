import React, { useState, useEffect, useCallback, useRef } from "react";
import type { MatchState, PlayerState, CellValue, MatchEvent } from "@pageshooter/shared";
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
import { CombatAnimation } from "./components/CombatAnimation.js";
import { EliminationModal } from "./components/EliminationModal.js";
import { VictoryModal } from "./components/VictoryModal.js";

interface CinematicState {
  pageNumber: number;
  outcome: CellValue;
  consequenceText: string;
  nextMatchState: MatchState;
}

interface CombatState {
  shooterName: string;
  shooterPosition: string;
  victimName: string;
  victimPosition: string;
  targetCellValue: CellValue;
  nextState: MatchState;
  events: MatchEvent[];
}

function getQaViewParam(): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get("qa_view");
}

function createQa5pState(): MatchState {
  const fiveNames = ["Barnaby", "Clover", "Pip", "Hazel", "Oliver"];
  const inputs = fiveNames.map((name, idx) => ({
    playerId: `p_${idx + 1}`,
    username: name,
    avatarId: `avatar_${idx + 1}`
  }));
  const { state } = createInitialMatchState("qa-5p", "storybook-arena", inputs);
  state.players[0].cells[4].progress = 5;
  state.players[0].cells[4].hasGun = true;
  state.turn.phase = "AWAITING_SHOT";
  state.turn.pendingShot = true;
  state.turn.rolledCell = 4;
  return state;
}

export const App: React.FC = () => {
  const qaView = getQaViewParam();

  const [matchState, setMatchState] = useState<MatchState | null>(() => {
    if (!qaView || qaView === "setup") return null;
    if (qaView === "5p" || qaView === "cinematic" || qaView === "combat" || qaView === "destruction" || qaView === "elimination") {
      return createQa5pState();
    }
    if (qaView === "10p") {
      const tenNames = ["Barnaby", "Clover", "Pip", "Hazel", "Oliver", "Rowan", "Milo", "Fern", "Bramble", "Willow"];
      const inputs = tenNames.map((name, idx) => ({
        playerId: `p_${idx + 1}`,
        username: name,
        avatarId: `avatar_${idx + 1}`
      }));
      return createInitialMatchState("qa-10p", "storybook-arena", inputs).state;
    }
    if (qaView === "victory") {
      const state = createQa5pState();
      state.phase = "COMPLETED";
      state.winnerPlayerId = state.players[0].playerId;
      state.winReason = "LAST_PLAYER_STANDING";
      state.totalTurns = 24;
      state.players[0].kills = 4;
      state.players[0].cells[0].progress = 5;
      state.players[0].cells[0].hasGun = true;
      state.players[0].cells[4].progress = 3;
      state.players[0].cells[8].progress = 4;
      state.players[0].cells[2].destroyed = true;
      state.players[0].cells[6].destroyed = true;
      return state;
    }
    return null;
  });

  const [savedMatch, setSavedMatch] = useState<MatchState | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !qaView);

  const [cinematicData, setCinematicData] = useState<CinematicState | null>(() => {
    if (qaView === "cinematic") {
      const state = createQa5pState();
      return {
        pageNumber: 248,
        outcome: 8,
        consequenceText: "🎉 Cell #8 learned Arms!",
        nextMatchState: state
      };
    }
    return null;
  });

  const [combatData, setCombatData] = useState<CombatState | null>(() => {
    if (qaView === "combat" || qaView === "destruction") {
      const state = createQa5pState();
      return {
        shooterName: "Barnaby",
        shooterPosition: "P1",
        victimName: "Clover",
        victimPosition: "P2",
        targetCellValue: 2,
        nextState: state,
        events: []
      };
    }
    return null;
  });

  const [eliminatedNoticePlayer, setEliminatedNoticePlayer] = useState<PlayerState | null>(() => {
    if (qaView === "elimination") {
      const state = createQa5pState();
      return state.players[1];
    }
    return null;
  });

  const isActionLockedRef = useRef<boolean>(false);

  // Check IndexedDB for existing active match on initial load (if not in QA mode)
  useEffect(() => {
    if (qaView) return;
    let isMounted = true;
    loadOfflineMatch(true)
      .then((loaded) => {
        if (!isMounted) return;
        if (loaded && loaded.phase === "ACTIVE") {
          setMatchState(loaded);
          setSavedMatch(loaded);
        } else {
          clearOfflineMatch().catch(() => {});
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
  }, [qaView]);

  // Start new match
  const handleStartMatch = async (playerNames: string[]) => {
    isActionLockedRef.current = false;
    const matchId = `cozy-match-${Date.now()}`;
    const playerInputs = playerNames.map((name, idx) => ({
      playerId: `p_${idx + 1}_${Date.now()}`,
      username: name,
      avatarId: `avatar_${idx + 1}`
    }));

    const { state } = createInitialMatchState(matchId, "storybook-arena", playerInputs);
    await saveOfflineMatch(state);
    setMatchState(state);
    setSavedMatch(null);
    soundManager.playTurnChime();
  };

  // Resume saved match from IndexedDB
  const handleResumeSavedMatch = () => {
    if (savedMatch && savedMatch.phase === "ACTIVE") {
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
    isActionLockedRef.current = false;
    await clearOfflineMatch();
    setMatchState(null);
    setSavedMatch(null);
    setCinematicData(null);
    setCombatData(null);
    setEliminatedNoticePlayer(null);
  };

  // Play again with same roster
  const handlePlayAgain = async () => {
    if (!matchState) return;
    const playerNames = matchState.players.map((p) => p.username);
    await handleStartMatch(playerNames);
  };

  // Roll storybook
  const handleRoll = async () => {
    if (isActionLockedRef.current) return;
    if (!matchState || matchState.turn.phase !== "AWAITING_ROLL") return;
    const currentPlayerId = matchState.turn.currentPlayerId;
    if (!currentPlayerId) return;

    const currentPlayer = matchState.players.find((p) => p.playerId === currentPlayerId);
    if (!currentPlayer) return;

    // Lock to prevent rapid double-clicks
    isActionLockedRef.current = true;

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
      consequenceText = `Cell #${outcome} was already poofed! Turn passes gently.`;
    } else if (targetCell.progress < 5) {
      const labels = ["Empty", "Face", "Body", "Legs", "Arms", "Gun"];
      consequenceText = `🎉 Cell #${outcome} learned ${labels[targetCell.progress + 1]}!`;
    } else {
      consequenceText = `⭐ Star Bullet loaded! Pick an opponent cell to aim!`;
    }

    // 5. Trigger Cinematic
    setCinematicData({
      pageNumber,
      outcome,
      consequenceText,
      nextMatchState: nextState
    });
  };

  // Complete storybook cinematic
  const handleCinematicComplete = useCallback(() => {
    if (cinematicData) {
      setMatchState(cinematicData.nextMatchState);
      setCinematicData(null);
    }
    isActionLockedRef.current = false;
  }, [cinematicData]);

  // Select target opponent cell
  const handleSelectTarget = async (targetPlayerId: string, cellValue: CellValue) => {
    if (isActionLockedRef.current) return;
    if (!matchState || !matchState.turn.pendingShot) return;
    const shooterId = matchState.turn.currentPlayerId;
    if (!shooterId) return;

    const shooter = matchState.players.find((p) => p.playerId === shooterId);
    const victim = matchState.players.find((p) => p.playerId === targetPlayerId);
    if (!shooter || !victim) return;

    // Lock to prevent rapid double-clicks
    isActionLockedRef.current = true;

    // Apply shot in pure rules engine
    const { state: nextState, events } = applyShot(
      matchState,
      shooterId,
      targetPlayerId,
      cellValue
    );

    // Persist immediately to IndexedDB
    await saveOfflineMatch(nextState);

    // Trigger Playful Killing Sequence
    setCombatData({
      shooterName: shooter.username,
      shooterPosition: shooter.position,
      victimName: victim.username,
      victimPosition: victim.position,
      targetCellValue: cellValue,
      nextState,
      events
    });
  };

  // Complete combat animation
  const handleCombatComplete = useCallback(() => {
    if (!combatData) return;
    const { nextState, events } = combatData;
    setMatchState(nextState);
    setCombatData(null);
    isActionLockedRef.current = false;

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
  }, [combatData]);

  if (loading) {
    return (
      <div className="min-h-screen bg-notebook-pattern flex flex-col items-center justify-center text-cozy-brown">
        <span className="text-4xl animate-bounce mb-3">📖</span>
        <div className="font-fredoka text-lg font-bold tracking-wider text-cozy-brown">
          Opening Storybook Folio...
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
    <div className="min-h-screen bg-notebook-pattern text-cozy-brown flex flex-col justify-between selection:bg-cozy-gold selection:text-cozy-brown">
      {/* Turn HUD Header */}
      <TurnHUD
        matchState={matchState}
        isRolling={cinematicData !== null || combatData !== null}
        onRoll={handleRoll}
        onResetMatch={handleResetMatch}
      />

      {/* Main Matrix Battlefield Area */}
      <main className="flex-1 flex flex-col justify-center py-2 sm:py-4">
        <Battlefield
          matchState={matchState}
          onSelectTarget={handleSelectTarget}
        />
      </main>

      {/* Footer / Status bar */}
      <footer className="w-full border-t border-[#E2D3BE] bg-[#FFFDF9]/60 py-2 px-4 text-center text-xs font-hand text-cozy-brown-light">
        <span>PageShooter • Cozy Storybook Edition • Auto-saved to browser</span>
      </footer>

      {/* Storybook Opening Cinematic Modal */}
      {cinematicData && (
        <BookCinematic
          pageNumber={cinematicData.pageNumber}
          outcome={cinematicData.outcome}
          consequenceText={cinematicData.consequenceText}
          onComplete={handleCinematicComplete}
        />
      )}

      {/* Playful Killing Animation Modal */}
      {combatData && (
        <CombatAnimation
          shooterName={combatData.shooterName}
          shooterPosition={combatData.shooterPosition}
          victimName={combatData.victimName}
          victimPosition={combatData.victimPosition}
          targetCellValue={combatData.targetCellValue}
          onComplete={handleCombatComplete}
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
