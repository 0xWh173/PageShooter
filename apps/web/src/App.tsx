import React, { useState, useEffect, useCallback, useRef } from "react";
import type { MatchState, PlayerState, CellValue, MatchEvent } from "@pageshooter/shared";
import {
  createInitialMatchState,
  applyRoll,
  applyShot,
  generateBookRoll
} from "@pageshooter/game-engine";
import {
  saveOfflineMatch,
  loadOfflineMatch,
  clearOfflineMatch,
  saveOfflineMatchVisuals,
  loadOfflineMatchVisuals
} from "./storage/db.js";
import type { MatchVisualConfig, AnimePackId } from "./anime/types.js";
import { assignMatchVisuals, ensureMatchVisuals } from "./anime/registry.js";
import { soundManager } from "./audio/soundManager.js";
import { SetupScreen, type PlayerSetupInput } from "./components/SetupScreen.js";
import { TurnHUD } from "./components/TurnHUD.js";
import { Battlefield } from "./components/Battlefield.js";
import { BookCinematic } from "./components/BookCinematic.js";
import { CombatAnimation } from "./components/CombatAnimation.js";
import { EliminationModal } from "./components/EliminationModal.js";
import { VictoryModal } from "./components/VictoryModal.js";
import { EventFeed } from "./components/EventFeed.js";

interface CinematicState {
  pageNumber: number;
  outcome: CellValue;
  consequenceText: string;
  nextMatchState: MatchState;
}

interface CombatState {
  shooterName: string;
  shooterPosition: string;
  shooterPackId: AnimePackId;
  shooterCharacterId: string;
  victimName: string;
  victimPosition: string;
  victimPackId: AnimePackId;
  victimCharacterId: string;
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
    if (
      qaView === "5p" ||
      qaView === "cinematic" ||
      qaView === "combat" ||
      qaView === "destruction" ||
      qaView === "elimination" ||
      qaView === "dragonball"
    ) {
      return createQa5pState();
    }
    if (qaView === "6p") {
      const sixNames = ["Barnaby", "Clover", "Pip", "Hazel", "Oliver", "Rowan"];
      const inputs = sixNames.map((name, idx) => ({
        playerId: `p_${idx + 1}`,
        username: name,
        avatarId: `avatar_${idx + 1}`
      }));
      return createInitialMatchState("qa-6p", "storybook-arena", inputs).state;
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
    if (qaView === "victory" || qaView === "victory_5survivors" || qaView === "victory_novalidtargets") {
      const state = createQa5pState();
      state.phase = "COMPLETED";
      state.winnerPlayerId = state.players[0].playerId;
      state.winReason = qaView === "victory_novalidtargets" ? "NO_VALID_TARGETS" : "LAST_PLAYER_STANDING";
      state.totalTurns = 28;
      state.players[0].kills = 4;

      if (qaView === "victory_5survivors") {
        state.players[0].cells[0].progress = 5;
        state.players[0].cells[0].hasGun = true;
        state.players[0].cells[2].progress = 4;
        state.players[0].cells[4].progress = 3;
        state.players[0].cells[6].progress = 2;
        state.players[0].cells[8].progress = 1;
      } else {
        state.players[0].cells[0].progress = 5;
        state.players[0].cells[0].hasGun = true;
        state.players[0].cells[4].progress = 3;
        state.players[0].cells[8].progress = 4;
        state.players[0].cells[2].destroyed = true;
        state.players[0].cells[6].destroyed = true;
      }
      return state;
    }
    return null;
  });

  const [visualConfig, setVisualConfig] = useState<MatchVisualConfig | null>(() => {
    if (!matchState) return null;
    return assignMatchVisuals(
      matchState.matchId,
      matchState.players.map((p) => ({ playerId: p.playerId, animePackId: "dragon-ball" }))
    );
  });

  const [savedMatch, setSavedMatch] = useState<MatchState | null>(null);
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !qaView);

  // Global subtle animation frame ticker for idle breathing and Ki flickering
  const [frame, setFrame] = useState<number>(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setFrame((f) => (f + 1) % 60);
    }, 150);
    return () => clearInterval(timer);
  }, []);

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
        shooterPackId: "dragon-ball",
        shooterCharacterId: "goku",
        victimName: "Clover",
        victimPosition: "P2",
        victimPackId: "dragon-ball",
        victimCharacterId: "vegeta",
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

  // Check IndexedDB for existing active match and visual config on initial load
  useEffect(() => {
    if (qaView) return;
    let isMounted = true;
    Promise.all([loadOfflineMatch(true), loadOfflineMatchVisuals()])
      .then(([loadedMatch, loadedVisuals]) => {
        if (!isMounted) return;
        if (loadedMatch && loadedMatch.phase === "ACTIVE") {
          setMatchState(loadedMatch);
          setSavedMatch(loadedMatch);

          const fixedVisuals = ensureMatchVisuals(
            loadedVisuals,
            loadedMatch.matchId,
            loadedMatch.players.map((p) => p.playerId)
          );
          setVisualConfig(fixedVisuals);
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
  const handleStartMatch = async (players: PlayerSetupInput[]) => {
    isActionLockedRef.current = false;
    const matchId = `anime-match-${Date.now()}`;
    const playerInputs = players.map((p, idx) => ({
      playerId: `p_${idx + 1}_${Date.now()}`,
      username: p.name,
      avatarId: `avatar_${idx + 1}`
    }));

    const { state, events } = createInitialMatchState(matchId, "storybook-arena", playerInputs);

    // Assign fixed characters from chosen packs
    const visuals = assignMatchVisuals(
      matchId,
      playerInputs.map((inp, idx) => ({
        playerId: inp.playerId,
        animePackId: players[idx]?.animePackId || "dragon-ball"
      }))
    );

    await saveOfflineMatch(state);
    await saveOfflineMatchVisuals(visuals);

    setMatchState(state);
    setVisualConfig(visuals);
    setMatchEvents(events);
    setSavedMatch(null);
    soundManager.playTurnChime();
  };

  // Resume saved match from IndexedDB
  const handleResumeSavedMatch = async () => {
    if (savedMatch && savedMatch.phase === "ACTIVE") {
      const loadedVisuals = await loadOfflineMatchVisuals();
      const fixedVisuals = ensureMatchVisuals(
        loadedVisuals,
        savedMatch.matchId,
        savedMatch.players.map((p) => p.playerId)
      );
      setMatchState(savedMatch);
      setVisualConfig(fixedVisuals);
      soundManager.playTurnChime();
    }
  };

  // Discard saved match
  const handleDiscardSavedMatch = async () => {
    await clearOfflineMatch();
    setSavedMatch(null);
    setVisualConfig(null);
  };

  // Abandon / Reset current match
  const handleResetMatch = async () => {
    isActionLockedRef.current = false;
    await clearOfflineMatch();
    setMatchState(null);
    setVisualConfig(null);
    setSavedMatch(null);
    setMatchEvents([]);
    setCinematicData(null);
    setCombatData(null);
    setEliminatedNoticePlayer(null);
  };

  // Play again with same roster & packs
  const handlePlayAgain = async () => {
    if (!matchState) return;
    const playerInputs: PlayerSetupInput[] = matchState.players.map((p) => {
      const vis = visualConfig?.playerVisuals[p.playerId];
      return {
        name: p.username,
        animePackId: vis?.animePackId || "dragon-ball"
      };
    });
    await handleStartMatch(playerInputs);
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
    const { state: nextState, events } = applyRoll(
      matchState,
      currentPlayerId,
      outcome,
      pageNumber
    );

    // 3. Immediately persist state to IndexedDB before animation starts
    await saveOfflineMatch(nextState);
    setMatchEvents((prev) => [...prev, ...events]);

    // 4. Determine consequence description
    let consequenceText: string;
    const targetCell = currentPlayer.cells[outcome];
    const playerVis = visualConfig?.playerVisuals[currentPlayerId];
    const assignedCharId = playerVis?.characterAssignments[outcome];

    if (targetCell.destroyed) {
      consequenceText = `Cell #${outcome} was already vaporized! Turn passes gently.`;
    } else if (targetCell.progress < 5) {
      const labels = ["Empty", "Face", "Body", "Legs", "Arms", "Attack Ready"];
      const charName = assignedCharId ? assignedCharId.toUpperCase() : `Cell #${outcome}`;
      consequenceText = `⚡ ${charName} reached ${labels[targetCell.progress + 1]} stage!`;
    } else {
      consequenceText = `⭐ Ki Blast loaded! Select an opponent cell to unleash!`;
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

    // Character identity resolution
    const shooterVisual = visualConfig?.playerVisuals[shooterId];
    const shooterPackId = shooterVisual?.animePackId || "dragon-ball";
    const shooterCharId =
      shooterVisual?.characterAssignments[matchState.turn.rolledCell || 0] || "goku";

    const victimVisual = visualConfig?.playerVisuals[targetPlayerId];
    const victimPackId = victimVisual?.animePackId || "dragon-ball";
    const victimCharId = victimVisual?.characterAssignments[cellValue] || "vegeta";

    // Trigger Combat Animation
    setCombatData({
      shooterName: shooter.username,
      shooterPosition: shooter.position,
      shooterPackId,
      shooterCharacterId: shooterCharId,
      victimName: victim.username,
      victimPosition: victim.position,
      victimPackId,
      victimCharacterId: victimCharId,
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
    setMatchEvents((prev) => [...prev, ...events]);
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

  // If match is completed, show Victory Screen dedicated full-page view
  if (matchState.phase === "COMPLETED") {
    return (
      <VictoryModal
        matchState={matchState}
        visualConfig={visualConfig}
        onPlayAgain={handlePlayAgain}
        onNewMatch={handleResetMatch}
      />
    );
  }

  return (
    <div className="min-h-screen bg-cozy-ivory text-cozy-brown-dark flex flex-col justify-between selection:bg-cozy-amber selection:text-cozy-brown-dark w-full max-w-full overflow-x-hidden">
      {/* Turn HUD Header (Fixed height flow, no overlap) */}
      <TurnHUD
        matchState={matchState}
        isRolling={cinematicData !== null || combatData !== null}
        onRoll={handleRoll}
        onResetMatch={handleResetMatch}
      />

      {/* Main Matrix Battlefield Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 py-3 flex flex-col max-w-full overflow-hidden">
        <Battlefield
          matchState={matchState}
          visualConfig={visualConfig}
          frame={frame}
          onSelectTarget={handleSelectTarget}
        />
        <EventFeed events={matchEvents} />
      </main>

      {/* Footer / Status bar */}
      <footer className="w-full border-t border-cozy-parchment bg-cozy-white/60 py-2 px-4 text-center text-xs font-fredoka text-cozy-brown/70 flex-shrink-0">
        <span>PageShooter • Anime Character Pack Edition • Auto-saved to browser</span>
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

      {/* Combat Animation Modal */}
      {combatData && (
        <CombatAnimation
          shooterName={combatData.shooterName}
          shooterPosition={combatData.shooterPosition}
          shooterPackId={combatData.shooterPackId}
          shooterCharacterId={combatData.shooterCharacterId}
          victimName={combatData.victimName}
          victimPosition={combatData.victimPosition}
          victimPackId={combatData.victimPackId}
          victimCharacterId={combatData.victimCharacterId}
          targetCellValue={combatData.targetCellValue}
          onComplete={handleCombatComplete}
        />
      )}

      {/* Player Elimination Modal */}
      {eliminatedNoticePlayer && (
        <EliminationModal
          eliminatedPlayer={eliminatedNoticePlayer}
          visualConfig={visualConfig}
          onDismiss={() => setEliminatedNoticePlayer(null)}
        />
      )}
    </div>
  );
};
