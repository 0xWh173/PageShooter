import React, { useState, useEffect, useCallback, useRef } from "react";
import type { MatchState, PlayerState, CellValue, MatchEvent, PublicRoomState } from "@pageshooter/shared";
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
  saveOfflineMatchCharacters,
  loadOfflineMatchCharacters
} from "./storage/db.js";
import type { MatchCharacterConfig } from "./characters/types.js";
import { assignMatchCharacters, ensureMatchCharacters, getCharacter } from "./characters/registry.js";
import { soundManager } from "./audio/soundManager.js";
import { SetupScreen, type PlayerSetupInput } from "./components/SetupScreen.js";
import { TurnHUD } from "./components/TurnHUD.js";
import { Battlefield } from "./components/Battlefield.js";
import { BookCinematic } from "./components/BookCinematic.js";
import { CombatAnimation, type CartoonCombatPhase } from "./components/CombatAnimation.js";
import { EliminationModal } from "./components/EliminationModal.js";
import { VictoryModal } from "./components/VictoryModal.js";
import { EventFeed } from "./components/EventFeed.js";
import { HandDrawnGalleryQA } from "./components/qa/HandDrawnGalleryQA.js";
import { CellProgressionQA } from "./components/qa/CellProgressionQA.js";
import { AuthProvider, useAuth } from "./context/AuthContext.js";
import { AuthModal } from "./components/online/AuthModal.js";
import { MultiplayerLobbyScreen } from "./components/online/MultiplayerLobbyScreen.js";
import { WaitingRoomScreen } from "./components/online/WaitingRoomScreen.js";
import { MultiplayerArenaScreen } from "./components/online/MultiplayerArenaScreen.js";
import { AudioSettingsModal } from "./components/online/AudioSettingsModal.js";
import { CartoonClickEffects } from "./components/CartoonClickEffects.js";
import { apiClient, getWsBaseUrl, WebSocketClient } from "./network/index.js";

interface CinematicState {
  pageNumber: number;
  outcome: CellValue;
  actorName: string;
  consequenceText: string;
  nextMatchState: MatchState;
}

interface CombatState {
  shooterName: string;
  shooterPosition: string;
  shooterCharacterId: string;
  victimName: string;
  victimPosition: string;
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

export const AppContent: React.FC = () => {
  const qaView = getQaViewParam();
  const { user, isAuthenticated, isColdStarting } = useAuth();

  const [gameMode, setGameModeState] = useState<"OFFLINE" | "ONLINE">(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = window.sessionStorage?.getItem("pageshooter_game_mode");
        if (saved === "ONLINE" || saved === "OFFLINE") return saved;
      } catch {
        // Ignore sessionStorage errors
      }
    }
    return "OFFLINE";
  });

  const setGameMode = useCallback((mode: "OFFLINE" | "ONLINE") => {
    setGameModeState(mode);
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage?.setItem("pageshooter_game_mode", mode);
      } catch {
        // Ignore sessionStorage errors
      }
    }
  }, []);
  const [authModalOpen, setAuthModalOpen] = useState<boolean>(false);
  const [audioModalOpen, setAudioModalOpen] = useState<boolean>(false);
  const [activeOnlineRoom, setActiveOnlineRoom] = useState<PublicRoomState | null>(null);
  const [wsClient, setWsClient] = useState<WebSocketClient | null>(null);

  const [matchState, setMatchState] = useState<MatchState | null>(() => {
    if (!qaView || qaView === "setup") return null;
    if (
      qaView === "5p" ||
      qaView === "cinematic" ||
      qaView === "combat" ||
      qaView === "destruction" ||
      qaView === "elimination" ||
      qaView?.startsWith("combat_")
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

  const [characterConfig, setCharacterConfig] = useState<MatchCharacterConfig | null>(() => {
    if (!matchState) return null;
    return assignMatchCharacters(
      matchState.matchId,
      matchState.players.map((p) => ({ playerId: p.playerId }))
    );
  });

  const [savedMatch, setSavedMatch] = useState<MatchState | null>(null);
  const [matchEvents, setMatchEvents] = useState<MatchEvent[]>([]);
  const [loading, setLoading] = useState<boolean>(() => !qaView);

  const [cinematicData, setCinematicData] = useState<CinematicState | null>(() => {
    if (qaView === "cinematic") {
      const state = createQa5pState();
      return {
        pageNumber: 248,
        outcome: 8,
        actorName: "Barnaby",
        consequenceText: "🎉 Barnaby learned Arms stage!",
        nextMatchState: state
      };
    }
    return null;
  });

  const [combatData, setCombatData] = useState<CombatState | null>(() => {
    if (
      qaView === "combat" ||
      qaView === "destruction" ||
      qaView?.startsWith("combat_")
    ) {
      const state = createQa5pState();
      const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
      const shooterChar = urlParams?.get("shooter") || "barnaby";
      const victimChar = urlParams?.get("victim") || "clover";
      return {
        shooterName: "Barnaby",
        shooterPosition: "P1",
        shooterCharacterId: shooterChar,
        victimName: "Clover",
        victimPosition: "P2",
        victimCharacterId: victimChar,
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

  // Check IndexedDB for existing active match and character config on initial load
  useEffect(() => {
    if (qaView) return;
    let isMounted = true;
    Promise.all([loadOfflineMatch(true), loadOfflineMatchCharacters()])
      .then(([loadedMatch, loadedChars]) => {
        if (!isMounted) return;
        if (loadedMatch && loadedMatch.phase === "ACTIVE") {
          setMatchState(loadedMatch);
          setSavedMatch(loadedMatch);

          const fixedChars = ensureMatchCharacters(
            loadedChars,
            loadedMatch.matchId,
            loadedMatch.players.map((p) => p.playerId)
          );
          setCharacterConfig(fixedChars);
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

  // Online room session recovery (F5 refresh & active participation discovery)
  useEffect(() => {
    if (isAuthenticated && user) {
      let isSubscribed = true;
      apiClient
        .getMyActiveRoom()
        .then(({ activeRoom }) => {
          if (!isSubscribed || !activeRoom) return;
          apiClient
            .getRoom(activeRoom.roomCode)
            .then(({ room }) => {
              if (isSubscribed) {
                setActiveOnlineRoom(room);
                setGameMode("ONLINE");
              }
            })
            .catch(() => {});
        })
        .catch(() => {});
      return () => {
        isSubscribed = false;
      };
    } else if (!isAuthenticated) {
      setActiveOnlineRoom(null);
    }
  }, [gameMode, isAuthenticated, user, setGameMode]);

  // Connect WebSocket when entering an active online chamber
  useEffect(() => {
    if (gameMode === "ONLINE" && activeOnlineRoom && isAuthenticated && user) {
      const metaEnv = (import.meta as unknown as { env?: Record<string, string | undefined> })?.env;
      const isHostedWithoutExplicitWs =
        typeof window !== "undefined" &&
        window.location &&
        window.location.hostname !== "localhost" &&
        window.location.hostname !== "127.0.0.1" &&
        !metaEnv?.VITE_WS_URL;

      const client = new WebSocketClient({
        url: getWsBaseUrl(),
        autoReconnect: true,
        enableHttpFallback: true,
        preferHttpFallback: Boolean(isHostedWithoutExplicitWs)
      });

      let isMounted = true;

      client
        .connect()
        .then(() => {
          if (!isMounted) {
            client.disconnect();
            return;
          }
          // Join or reconnect room over WebSocket to register for room-wide broadcasts
          const isSpec = activeOnlineRoom.spectators.some((s) => s.userId === user.id);
          if (isSpec) {
            client.joinAsSpectator(activeOnlineRoom.roomCode);
          } else if (
            activeOnlineRoom.phase === "ACTIVE" ||
            activeOnlineRoom.phase === "PAUSED"
          ) {
            client.reconnectMatch(
              activeOnlineRoom.roomCode,
              activeOnlineRoom.match?.version ?? 0
            );
          } else {
            client.joinRoom(activeOnlineRoom.roomCode);
          }
        })
        .catch(() => {
          // Socket connection failure handled gracefully
        });

      const unsubscribeStore = client.syncStore.subscribe(() => {
        const syncedRoom = client.syncStore.getState().room;
        if (!syncedRoom) return;
        setActiveOnlineRoom((prev) => {
          if (!prev || prev.roomCode !== syncedRoom.roomCode) return prev;
          if (
            prev.phase !== syncedRoom.phase ||
            prev.playerCount !== syncedRoom.playerCount ||
            prev.hostUserId !== syncedRoom.hostUserId
          ) {
            return syncedRoom;
          }
          return prev;
        });
      });

      setWsClient(client);

      return () => {
        isMounted = false;
        unsubscribeStore();
        client.disconnect();
        setWsClient(null);
      };
    }
  }, [gameMode, activeOnlineRoom?.roomCode, isAuthenticated, user?.id]);

  // Start new match
  const handleStartMatch = async (players: PlayerSetupInput[]) => {
    isActionLockedRef.current = false;
    const matchId = `folio-match-${Date.now()}`;
    const playerInputs = players.map((p, idx) => ({
      playerId: `p_${idx + 1}_${Date.now()}`,
      username: p.name,
      avatarId: `avatar_${idx + 1}`
    }));

    const { state, events } = createInitialMatchState(matchId, "storybook-arena", playerInputs);

    // Assign 5 distinct characters per seat
    const charConfig = assignMatchCharacters(
      matchId,
      playerInputs.map((inp) => ({ playerId: inp.playerId }))
    );

    await saveOfflineMatch(state);
    await saveOfflineMatchCharacters(charConfig);

    setMatchState(state);
    setCharacterConfig(charConfig);
    setMatchEvents(events);
    setSavedMatch(null);
    soundManager.playTurnChime();
  };

  // Resume saved match from IndexedDB
  const handleResumeSavedMatch = async () => {
    if (savedMatch && savedMatch.phase === "ACTIVE") {
      const loadedChars = await loadOfflineMatchCharacters();
      const fixedChars = ensureMatchCharacters(
        loadedChars,
        savedMatch.matchId,
        savedMatch.players.map((p) => p.playerId)
      );
      setMatchState(savedMatch);
      setCharacterConfig(fixedChars);
      soundManager.playTurnChime();
    }
  };

  // Discard saved match
  const handleDiscardSavedMatch = async () => {
    await clearOfflineMatch();
    setSavedMatch(null);
    setCharacterConfig(null);
  };

  // Abandon / Reset current match
  const handleResetMatch = async () => {
    isActionLockedRef.current = false;
    await clearOfflineMatch();
    setMatchState(null);
    setCharacterConfig(null);
    setSavedMatch(null);
    setMatchEvents([]);
    setCinematicData(null);
    setCombatData(null);
    setEliminatedNoticePlayer(null);
  };

  // Play again with same roster
  const handlePlayAgain = async () => {
    if (!matchState) return;
    const playerInputs: PlayerSetupInput[] = matchState.players.map((p) => ({
      name: p.username
    }));
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
    const playerConfig = characterConfig?.playerCharacters[currentPlayerId];
    const assignedCharId = playerConfig?.characterAssignments[outcome] || "barnaby";
    const assignedChar = getCharacter(assignedCharId);

    if (targetCell.destroyed) {
      consequenceText = `Cell #${outcome} (${assignedChar.name}) was already poofed! Turn passes gently.`;
    } else if (targetCell.progress < 5) {
      const labels = ["Empty", "Face", "Body", "Legs", "Arms", "Folio Weapon"];
      consequenceText = `✏️ ${assignedChar.name} reached ${labels[targetCell.progress + 1]} stage!`;
    } else {
      consequenceText = `🎯 ${assignedChar.name}'s weapon loaded! Select an opponent cell to shoot!`;
    }

    // 5. Trigger Cinematic
    setCinematicData({
      pageNumber,
      outcome,
      actorName: currentPlayer.username,
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
    const shooterConfig = characterConfig?.playerCharacters[shooterId];
    const shooterCharId =
      shooterConfig?.characterAssignments[matchState.turn.rolledCell || 0] || "barnaby";

    const victimConfig = characterConfig?.playerCharacters[targetPlayerId];
    const victimCharId = victimConfig?.characterAssignments[cellValue] || "clover";

    // Trigger Combat Animation
    setCombatData({
      shooterName: shooter.username,
      shooterPosition: shooter.position,
      shooterCharacterId: shooterCharId,
      victimName: victim.username,
      victimPosition: victim.position,
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

  if (qaView === "gallery") {
    return <HandDrawnGalleryQA />;
  }

  if (qaView === "progression") {
    return <CellProgressionQA />;
  }

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

  return (
    <div className="min-h-screen cartoon-halftone-bg text-[#1C1917] flex flex-col justify-between selection:bg-[#C85A48] selection:text-[#FAF4E6] w-full max-w-full overflow-x-hidden">
      <CartoonClickEffects />
      {/* Top Comic-Book Issue Header & Mode Switcher */}
      <header className="w-full bg-[#1C1917] border-b-4 border-[#1C1917] shadow-[0_4px_0_rgba(28,25,23,0.35)] py-2.5 px-3 sm:px-5 flex flex-wrap items-center justify-between gap-2 z-30 flex-shrink-0">
        <div className="flex items-center space-x-2.5">
          <span className="text-lg sm:text-xl bg-[#C85A48] border-2 border-[#FAF4E6] px-1.5 py-0.5 -rotate-6 shadow-[2px_2px_0_#E5C467]">
            📖
          </span>
          <span className="font-bangers text-xl sm:text-2xl tracking-widest text-[#E5C467] uppercase">
            PageShooter
          </span>
          <span className="hidden md:inline-block bg-[#FAF4E6] text-[#1C1917] font-mono font-bold text-[10px] px-2 py-0.5 -skew-x-6">
            COMIC EDITION
          </span>
        </div>

        {/* Skewed Comic Ribbon Mode Switcher (Click Burst Enabled ONLY Here) */}
        <div className="flex items-center bg-[#FAF4E6] p-1 border-3 border-[#1C1917] shadow-[4px_4px_0_#C85A48] gap-1.5">
          <button
            data-cartoon-click="true"
            onClick={() => setGameMode("OFFLINE")}
            className={`px-3 sm:px-4 py-1 text-xs sm:text-sm font-bangers tracking-wider uppercase whitespace-nowrap transition-all cursor-pointer ${
              gameMode === "OFFLINE"
                ? "cartoon-btn bg-[#E5C467] text-[#1C1917]"
                : "text-[#1C1917]/70 hover:text-[#1C1917]"
            }`}
          >
            Local Pass & Play
          </button>
          <button
            data-cartoon-click="true"
            onClick={() => setGameMode("ONLINE")}
            className={`px-3 sm:px-4 py-1 text-xs sm:text-sm font-bangers tracking-wider uppercase whitespace-nowrap transition-all cursor-pointer ${
              gameMode === "ONLINE"
                ? "cartoon-btn bg-[#688B9A] text-[#FAF4E6]"
                : "text-[#1C1917]/70 hover:text-[#1C1917]"
            }`}
          >
            Online Multiplayer
          </button>
        </div>

        {/* Audio Mixer & Active Scribe Indicator */}
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setAudioModalOpen(true)}
            title="Audio Mixer (5 Channels)"
            aria-label="Audio Settings"
            data-testid="open-audio-settings"
            className="cartoon-btn px-3 py-1 bg-[#E5C467] hover:bg-[#EDD07A] text-xs font-bangers tracking-wider text-[#1C1917]"
          >
            🔊
          </button>
          {isAuthenticated && user && (
            <div className="flex items-center space-x-1.5 sm:space-x-2 bg-[#FAF4E6] border-2 border-[#1C1917] shadow-[3px_3px_0_#688B9A] px-2.5 py-1 text-xs font-bold text-[#1C1917] -skew-x-3">
              <span className="w-5 h-5 bg-[#C85A48] text-[#FAF4E6] border-2 border-[#1C1917] font-bangers flex items-center justify-center text-xs">
                {user.username[0]?.toUpperCase()}
              </span>
              <span className="max-w-[70px] sm:max-w-none truncate">{user.username}</span>
            </div>
          )}
        </div>
      </header>

      {/* Auth Modal & Audio Settings Modal */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      <AudioSettingsModal isOpen={audioModalOpen} onClose={() => setAudioModalOpen(false)} />

      {/* Main View: ONLINE vs OFFLINE */}
      {gameMode === "ONLINE" ? (
        <main className="flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 py-4 flex flex-col justify-center">
          {isColdStarting && (
            <div
              role="status"
              data-testid="cold-start-banner"
              className="mb-4 p-3 rounded-xl bg-amber-950/70 border border-amber-500/40 text-amber-200 text-xs flex items-center justify-center space-x-2"
            >
              <span className="animate-spin">⏳</span>
              <span>Summoning game server from its slumber (cold start)... Please allow up to 30–50s.</span>
            </div>
          )}
          {activeOnlineRoom ? (
            activeOnlineRoom.phase === "WAITING" ? (
              <WaitingRoomScreen
                room={activeOnlineRoom}
                currentUser={user}
                webSocketClient={wsClient}
                onLeaveRoom={() => setActiveOnlineRoom(null)}
                onMatchStarted={(startedMatch) => {
                  setActiveOnlineRoom((prev) =>
                    prev ? { ...prev, phase: "ACTIVE", match: startedMatch } : null
                  );
                }}
              />
            ) : (
              <MultiplayerArenaScreen
                initialRoom={activeOnlineRoom}
                currentUser={user}
                webSocketClient={wsClient}
                onLeaveMatch={() => setActiveOnlineRoom(null)}
              />
            )
          ) : (
            <MultiplayerLobbyScreen
              onRoomCreated={(room) => setActiveOnlineRoom(room)}
              onJoinRoom={(room) => setActiveOnlineRoom(room)}
              onOpenAuth={() => setAuthModalOpen(true)}
            />
          )}
        </main>
      ) : (
        /* OFFLINE PASS & PLAY VIEW (100% Preserved) */
        <div className="flex-1 flex flex-col justify-between">
          {!matchState ? (
            <SetupScreen
              savedMatch={savedMatch}
              onResumeSavedMatch={handleResumeSavedMatch}
              onDiscardSavedMatch={handleDiscardSavedMatch}
              onStartMatch={handleStartMatch}
            />
          ) : matchState.phase === "COMPLETED" ? (
            <VictoryModal
              matchState={matchState}
              characterConfig={characterConfig}
              onPlayAgain={handlePlayAgain}
              onNewMatch={handleResetMatch}
            />
          ) : (
            <div className="flex-1 flex flex-col justify-between w-full max-w-full overflow-x-hidden">
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
                  characterConfig={characterConfig}
                  onSelectTarget={handleSelectTarget}
                />
                <EventFeed events={matchEvents} />
              </main>

              {/* Storybook Opening Cinematic Modal */}
              {cinematicData && (
                <BookCinematic
                  pageNumber={cinematicData.pageNumber}
                  outcome={cinematicData.outcome}
                  actorName={cinematicData.actorName}
                  consequenceText={cinematicData.consequenceText}
                  onComplete={handleCinematicComplete}
                />
              )}

              {/* Combat Animation Modal */}
              {combatData && (
                <CombatAnimation
                  shooterName={combatData.shooterName}
                  shooterPosition={combatData.shooterPosition}
                  shooterCharacterId={combatData.shooterCharacterId}
                  victimName={combatData.victimName}
                  victimPosition={combatData.victimPosition}
                  victimCharacterId={combatData.victimCharacterId}
                  targetCellValue={combatData.targetCellValue}
                  onComplete={handleCombatComplete}
                  fixedPhase={
                    (typeof window !== "undefined" && (new URLSearchParams(window.location.search).get("phase") as CartoonCombatPhase | null) || undefined) ||
                    (qaView === "combat_focus"
                      ? "FOCUS"
                      : qaView === "combat_dash" || qaView === "combat_aim"
                      ? "KATANA_DASH"
                      : qaView === "combat_slash" || qaView === "combat_fire"
                      ? "SLASH_FLASH"
                      : qaView === "combat_blood" || qaView === "combat_impact" || qaView === "combat_travel"
                      ? "BLOOD_SPLASH"
                      : qaView === "combat_knockout"
                      ? "KNOCKOUT_CROSS"
                      : undefined)
                  }
                />
              )}

              {/* Player Elimination Modal */}
              {eliminatedNoticePlayer && (
                <EliminationModal
                  eliminatedPlayer={eliminatedNoticePlayer}
                  characterConfig={characterConfig}
                  onDismiss={() => setEliminatedNoticePlayer(null)}
                />
              )}
            </div>
          )}
        </div>
      )}

      {/* Footer / Status bar */}
      <footer className="w-full border-t border-[#292036] bg-[#14101a] py-2 px-4 text-center text-xs font-fredoka text-[#8e809e] flex-shrink-0">
        <span>PageShooter • Hand-Drawn Illustrated Stickman Edition • {gameMode === "ONLINE" ? "Authoritative Online Mode" : "Auto-saved to browser"}</span>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

