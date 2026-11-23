import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import type {
  MatchState,
  PlayerState,
  CellValue,
  PublicRoomState,
  PublicUserProfile
} from "@pageshooter/shared";
import { assignMatchCharacters } from "../../characters/registry.js";
import { soundManager } from "../../audio/soundManager.js";
import { Battlefield } from "../Battlefield.js";
import { BookCinematic } from "../BookCinematic.js";
import { CombatAnimation } from "../CombatAnimation.js";
import { EliminationModal } from "../EliminationModal.js";
import { VictoryModal } from "../VictoryModal.js";
import { EventFeed } from "../EventFeed.js";
import {
  SyncStore,
  useSyncStore,
  selectIsSpectator,
  selectCanRoll,
  selectCanShoot,
  type WebSocketClient,
  type ConnectionStatus
} from "../../network/index.js";
import { OnlineTurnHUD } from "./OnlineTurnHUD.js";
import { ChatAndEmojiHUD } from "./ChatAndEmojiHUD.js";
import { DisconnectOverlay } from "./DisconnectOverlay.js";
import { ServerRestartModal } from "./ServerRestartModal.js";

interface OnlineCinematicData {
  pageNumber: number;
  outcome: CellValue;
  actorName: string;
  consequenceText: string;
}

interface OnlineCombatData {
  shooterName: string;
  shooterPosition: string;
  shooterCharacterId: string;
  victimName: string;
  victimPosition: string;
  victimCharacterId: string;
  targetCellValue: CellValue;
}

interface MultiplayerArenaScreenProps {
  initialRoom: PublicRoomState;
  currentUser: PublicUserProfile | null;
  webSocketClient: WebSocketClient | null;
  onLeaveMatch: () => void;
}

export const MultiplayerArenaScreen: React.FC<MultiplayerArenaScreenProps> = ({
  initialRoom,
  currentUser,
  webSocketClient,
  onLeaveMatch
}) => {
  const fallbackStoreRef = useRef<SyncStore | null>(null);
  if (!fallbackStoreRef.current) {
    fallbackStoreRef.current = new SyncStore();
    fallbackStoreRef.current.applyRoomSnapshot(initialRoom, "local-fallback");
  }
  const syncStore = webSocketClient?.syncStore ?? fallbackStoreRef.current;
  const syncState = useSyncStore(syncStore);

  const room = syncState.room ?? initialRoom;
  const match: MatchState | null = syncState.match ?? room.match ?? null;

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>(
    () => webSocketClient?.connectionStatus ?? "CONNECTED"
  );
  const [isPendingRoll, setIsPendingRoll] = useState(false);
  const [cinematicData, setCinematicData] = useState<OnlineCinematicData | null>(null);
  const [combatData, setCombatData] = useState<OnlineCombatData | null>(null);
  const [eliminatedNoticePlayer, setEliminatedNoticePlayer] = useState<PlayerState | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const [showYourTurnSplash, setShowYourTurnSplash] = useState(false);
  const [isShaking, setIsShaking] = useState(false);

  const prevEliminatedIdsRef = useRef<Set<string>>(new Set());
  const prevCanRollRef = useRef<boolean>(false);

  // Track connection status changes
  useEffect(() => {
    if (!webSocketClient) return;
    setConnectionStatus(webSocketClient.connectionStatus);
    return webSocketClient.onStatusChange((status) => {
      setConnectionStatus(status);
    });
  }, [webSocketClient]);

  // Deterministic character assignment for the match
  const characterConfig = useMemo(() => {
    if (!match) return null;
    return assignMatchCharacters(
      match.matchId,
      match.players.map((p) => ({ playerId: p.playerId }))
    );
  }, [match?.matchId, match?.players.length]);

  // Track newly eliminated players
  useEffect(() => {
    if (!match) return;
    const prevSet = prevEliminatedIdsRef.current;
    for (const player of match.players) {
      if (player.status === "ELIMINATED" && !prevSet.has(player.playerId)) {
        prevSet.add(player.playerId);
        // Only show modal after initial load if match is active
        if (match.turn.turnNumber > 1 || match.totalTurns > 1) {
          setEliminatedNoticePlayer(player);
        }
      }
    }
  }, [match]);

  // Listen to WebSocket messages for cinematics, combat, and errors
  useEffect(() => {
    if (!webSocketClient) return;

    const unsubscribe = webSocketClient.onMessage((msg) => {
      if (msg.type === "ROLL_REVEALED") {
        setIsPendingRoll(false);
        const current = syncStore.getState();
        if (
          current.verificationErrors.length > 0 ||
          current.lastVerifiedRoll?.turnNumber !== msg.turnNumber
        ) {
          setErrorBanner(
            "Cryptographic Verification Failed — Outcome Tampering Detected"
          );
          return;
        }
        const actor = msg.actorPlayerId
          ? current.match?.players.find((p) => p.playerId === msg.actorPlayerId)
          : current.match?.players.find(
              (p) => p.playerId === current.match?.turn.currentPlayerId
            );
        const actorName = msg.actorUsername ?? actor?.username ?? "Scribe";
        setCinematicData({
          pageNumber: msg.pageNumber,
          outcome: msg.outcome,
          actorName,
          consequenceText:
            msg.consequenceText ??
            `${actorName} turned to Page ${msg.pageNumber} (Cell #${msg.outcome})`
        });
      } else if (msg.type === "MATCH_STATE_SYNC") {
        setIsPendingRoll(false);
        if (msg.events && msg.events.length > 0) {
          const shotEvent = msg.events.find(
            (e) => e.type === "SHOT_ACCEPTED" || e.type === "CELL_DESTROYED"
          );
          if (shotEvent && shotEvent.actorPlayerId && shotEvent.targetPlayerId) {
            const shooter = msg.matchState.players.find(
              (p) => p.playerId === shotEvent.actorPlayerId
            );
            const victim = msg.matchState.players.find(
              (p) => p.playerId === shotEvent.targetPlayerId
            );
            if (shooter && victim && shotEvent.cellValue !== undefined) {
              const shooterChar =
                characterConfig?.playerCharacters[shooter.playerId]?.characterAssignments[
                  shotEvent.cellValue
                ] ?? "barnaby";
              const victimChar =
                characterConfig?.playerCharacters[victim.playerId]?.characterAssignments[
                  shotEvent.cellValue
                ] ?? "clover";

              setIsShaking(true);
              setTimeout(() => setIsShaking(false), 380);
              setCombatData({
                shooterName: shooter.username,
                shooterPosition: shooter.position,
                shooterCharacterId: shooterChar,
                victimName: victim.username,
                victimPosition: victim.position,
                victimCharacterId: victimChar,
                targetCellValue: shotEvent.cellValue
              });
            }
          }
        }
      } else if (msg.type === "ERROR" && msg.code !== "MUTED") {
        setIsPendingRoll(false);
        setErrorBanner(msg.message || "An authoritative server error occurred.");
      }
    });

    return () => unsubscribe();
  }, [webSocketClient, syncStore, characterConfig]);

  const currentUserId = currentUser?.id ?? null;
  const isSpectator = selectIsSpectator(syncState, currentUserId);
  const canRoll = selectCanRoll(syncState, currentUserId);
  const canShoot = selectCanShoot(syncState, currentUserId);

  // Brief non-blocking "YOUR TURN!" comic splash whenever it becomes this player's turn to roll
  useEffect(() => {
    if (canRoll && !prevCanRollRef.current && match?.phase === "ACTIVE") {
      setShowYourTurnSplash(true);
      soundManager.playTurnChime();
      const timer = setTimeout(() => setShowYourTurnSplash(false), 1500);
      prevCanRollRef.current = canRoll;
      return () => clearTimeout(timer);
    }
    prevCanRollRef.current = canRoll;
  }, [canRoll, match?.phase]);

  const handleRoll = useCallback(() => {
    if (!webSocketClient || !match || !canRoll || isPendingRoll) return;
    setErrorBanner(null);
    setIsPendingRoll(true);
    try {
      webSocketClient.roll(room.roomCode, match.version);
    } catch (err) {
      setIsPendingRoll(false);
      setErrorBanner(err instanceof Error ? err.message : "Failed to send roll command.");
    }
  }, [webSocketClient, match, canRoll, isPendingRoll, room.roomCode]);

  const handleSelectTarget = useCallback(
    (targetPlayerId: string, cellValue: CellValue) => {
      if (!webSocketClient || !match || !canShoot) return;
      setErrorBanner(null);
      try {
        webSocketClient.shoot(room.roomCode, targetPlayerId, cellValue, match.version);
      } catch (err) {
        setErrorBanner(err instanceof Error ? err.message : "Failed to send shot command.");
      }
    },
    [webSocketClient, match, canShoot, room.roomCode]
  );

  const handleLeave = useCallback(() => {
    try {
      if (webSocketClient && webSocketClient.isConnected) {
        webSocketClient.leaveRoom(room.roomCode);
      }
    } catch {
      // Ignore if already disconnected
    }
    onLeaveMatch();
  }, [webSocketClient, room.roomCode, onLeaveMatch]);

  const handleCinematicComplete = useCallback(() => {
    setCinematicData(null);
    soundManager.playTurnChime();
  }, []);

  const handleCombatComplete = useCallback(() => {
    setCombatData(null);
  }, []);

  // Server restart termination modal takes precedence
  if (syncState.matchTerminatedReason) {
    return (
      <ServerRestartModal
        reason={syncState.matchTerminatedReason}
        onReturnToLobby={onLeaveMatch}
      />
    );
  }

  if (!match) {
    return (
      <div className="w-full max-w-md mx-auto p-8 text-center text-[#f5ede0]">
        <div className="text-3xl animate-spin inline-block mb-3">⏳</div>
        <p className="text-sm text-[#a394b3]">Synchronizing authoritative match state...</p>
      </div>
    );
  }

  // Victory screen when match completes
  if (match.phase === "COMPLETED") {
    return (
      <VictoryModal
        matchState={match}
        characterConfig={characterConfig}
        onPlayAgain={handleLeave}
        onNewMatch={handleLeave}
      />
    );
  }

  return (
    <div className="w-full flex-1 flex flex-col justify-between pb-16">
      {/* Disconnect / Reconnect / Supersession Overlays */}
      <DisconnectOverlay
        matchState={match}
        connectionStatus={connectionStatus}
        onReturnToLobby={onLeaveMatch}
      />

      {/* Authoritative Turn HUD */}
      <OnlineTurnHUD
        matchState={match}
        roomCode={room.roomCode}
        currentUserId={currentUserId}
        isSpectator={isSpectator}
        isRolling={isPendingRoll || cinematicData !== null || combatData !== null}
        canRoll={canRoll}
        canShoot={canShoot}
        activeCommitmentHash={syncState.activeCommitment?.commitmentHash ?? null}
        connectionStatus={connectionStatus}
        transportMode={webSocketClient?.transportMode ?? "WS"}
        onReconnect={() => webSocketClient?.reconnectNow()}
        onRoll={handleRoll}
        onLeaveMatch={handleLeave}
      />

      {/* Non-blocking "YOUR TURN!" Comic Splash Banner */}
      {showYourTurnSplash && !cinematicData && !combatData && (
        <div
          aria-live="assertive"
          data-testid="your-turn-splash"
          className="pointer-events-none fixed top-24 left-1/2 -translate-x-1/2 z-40"
        >
          <div className="animate-comic-turn-splash bg-[#E5C467] text-[#1C1917] border-4 border-[#1C1917] shadow-[6px_6px_0_#C85A48] px-6 py-2 font-bangers text-2xl sm:text-3xl tracking-widest uppercase">
            ⚡ YOUR TURN! FLIP THE FOLIO! 📖
          </div>
        </div>
      )}

      {/* Error / Verification Failure Banner */}
      {(errorBanner || syncState.verificationErrors.length > 0) && (
        <div
          role="alert"
          data-testid="arena-error-banner"
          className="max-w-5xl mx-auto mt-3 px-4 py-2.5 bg-red-950/90 border-2 border-red-500 rounded-xl text-red-100 text-xs flex items-center justify-between gap-3 shadow-lg"
        >
          <span className="font-bold">
            ⚠️ {errorBanner || syncState.verificationErrors[syncState.verificationErrors.length - 1]}
          </span>
          <button
            onClick={() => setErrorBanner(null)}
            className="text-red-300 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Main Authoritative Battlefield Matrix & Combat Log */}
      <main
        className={`flex-1 w-full max-w-7xl mx-auto px-2 sm:px-4 py-3 flex flex-col overflow-hidden ${
          isShaking ? "animate-comic-shake" : ""
        }`}
      >
        <Battlefield
          matchState={match}
          characterConfig={characterConfig}
          interactiveTargeting={canShoot}
          onSelectTarget={canShoot ? handleSelectTarget : undefined}
        />
        <EventFeed events={syncState.events} />
      </main>

      {/* Verifiable 4-6s Storybook Roll Cinematic (visible to ALL players & spectators) */}
      {cinematicData && (
        <BookCinematic
          pageNumber={cinematicData.pageNumber}
          outcome={cinematicData.outcome}
          actorName={cinematicData.actorName}
          consequenceText={cinematicData.consequenceText}
          onComplete={handleCinematicComplete}
        />
      )}

      {/* Katana Combat Animation */}
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

      {/* Chat & 6-Emoji Reaction HUD */}
      <ChatAndEmojiHUD
        roomCode={room.roomCode}
        chatMessages={syncState.chatMessages}
        webSocketClient={webSocketClient}
        participants={[...room.players, ...room.spectators]}
      />
    </div>
  );
};
