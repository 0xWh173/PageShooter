import React, { useState, useEffect, useMemo } from "react";
import type {
  PublicRoomState,
  PublicUserProfile,
  RoomParticipant,
  MatchState
} from "@pageshooter/shared";
import { MIN_PLAYERS, MAX_PLAYERS } from "@pageshooter/shared";
import { HandDrawnStickman } from "../../characters/components/HandDrawnStickman.js";
import { apiClient, ApiError } from "../../network/apiClient.js";
import type { WebSocketClient } from "../../network/websocketClient.js";
import type { SyncStore } from "../../network/syncStore.js";

export interface WaitingRoomScreenProps {
  room: PublicRoomState;
  currentUser: PublicUserProfile | null;
  syncStore?: SyncStore;
  webSocketClient?: WebSocketClient | null;
  onLeaveRoom: () => void;
  onMatchStarted?: (matchState: MatchState) => void;
}

export const WaitingRoomScreen: React.FC<WaitingRoomScreenProps> = ({
  room: initialRoom,
  currentUser,
  syncStore,
  webSocketClient,
  onLeaveRoom,
  onMatchStarted
}) => {
  // Live room state synced via SyncStore or updated from props
  const [currentRoom, setCurrentRoom] = useState<PublicRoomState>(initialRoom);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [isStarting, setIsStarting] = useState<boolean>(false);
  const [isLeaving, setIsLeaving] = useState<boolean>(false);
  const [kickingUserId, setKickingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [wasKicked, setWasKicked] = useState<boolean>(false);

  // Synchronize state with SyncStore if available
  useEffect(() => {
    setCurrentRoom(initialRoom);
  }, [initialRoom]);

  useEffect(() => {
    const store = syncStore ?? webSocketClient?.syncStore;
    if (!store) return;

    // Apply snapshot if room is present in store
    const storeState = store.getState();
    if (storeState.room && storeState.room.roomCode === currentRoom.roomCode) {
      setCurrentRoom(storeState.room);
      if (storeState.room.phase === "ACTIVE" && storeState.match && onMatchStarted) {
        onMatchStarted(storeState.match);
      }
    }

    const unsubscribe = store.subscribe(() => {
      const updated = store.getState();
      if (updated.room && updated.room.roomCode === currentRoom.roomCode) {
        setCurrentRoom(updated.room);

        // Check if the current user was kicked
        if (currentUser) {
          const isStillPlayer = updated.room.players.some((p) => p.userId === currentUser.id);
          const isStillSpectator = updated.room.spectators.some((s) => s.userId === currentUser.id);
          if (!isStillPlayer && !isStillSpectator && currentRoom.players.some((p) => p.userId === currentUser.id)) {
            setWasKicked(true);
          }
        }

        // Check if match started
        if (updated.room.phase === "ACTIVE" && updated.match && onMatchStarted) {
          onMatchStarted(updated.match);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [syncStore, webSocketClient, currentRoom.roomCode, currentUser, onMatchStarted]);

  // Listen directly to WebSocket message events if client provided
  useEffect(() => {
    if (!webSocketClient) return;

    const unsubscribe = webSocketClient.onMessage((message) => {
      if (message.type === "PLAYER_KICKED") {
        if (currentUser && message.targetUserId === currentUser.id) {
          setWasKicked(true);
        }
      } else if (message.type === "MATCH_STARTED") {
        if (onMatchStarted) {
          onMatchStarted(message.matchState);
        }
      } else if (message.type === "ERROR") {
        setErrorMessage(message.message || "A room error occurred.");
      }
    });

    const unsubscribeError = webSocketClient.onError((err) => {
      setIsStarting(false);
      setErrorMessage(err instanceof Error ? err.message : "A room error occurred.");
    });

    return () => {
      unsubscribe();
      unsubscribeError();
    };
  }, [webSocketClient, currentUser, onMatchStarted]);

  // Derive Host status
  const isHost = useMemo(() => {
    if (!currentUser) return false;
    return currentRoom.hostUserId === currentUser.id;
  }, [currentRoom.hostUserId, currentUser]);

  // Derive Spectator status
  const isSpectator = useMemo(() => {
    if (!currentUser) return false;
    return currentRoom.spectators.some((s) => s.userId === currentUser.id);
  }, [currentRoom.spectators, currentUser]);

  // Host player object for name display
  const hostPlayer = useMemo(() => {
    return currentRoom.players.find((p) => p.userId === currentRoom.hostUserId);
  }, [currentRoom.players, currentRoom.hostUserId]);

  // Start match eligibility: strictly 5 to 10 players
  const canStartMatch = useMemo(() => {
    return isHost && currentRoom.playerCount >= MIN_PLAYERS && currentRoom.playerCount <= MAX_PLAYERS;
  }, [isHost, currentRoom.playerCount]);

  // Copy Room Code to Clipboard
  const handleCopyCode = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(currentRoom.roomCode);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = currentRoom.roomCode;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch {
      // Fallback
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    }
  };

  // Leave Room
  const handleLeaveRoom = async () => {
    setIsLeaving(true);
    setErrorMessage(null);
    try {
      if (webSocketClient && webSocketClient.isConnected) {
        webSocketClient.leaveRoom(currentRoom.roomCode);
      } else {
        await apiClient.leaveRoom(currentRoom.roomCode);
      }
    } catch {
      // Best-effort leave: proceed to callback even if network fails
    } finally {
      setIsLeaving(false);
      onLeaveRoom();
    }
  };

  // Kick Player (Host Only)
  const handleKickPlayer = async (targetUserId: string, targetUsername: string) => {
    if (!isHost) return;
    setKickingUserId(targetUserId);
    setErrorMessage(null);
    try {
      if (webSocketClient && webSocketClient.isConnected) {
        webSocketClient.kickPlayer(currentRoom.roomCode, targetUserId);
      } else {
        await apiClient.kickPlayer(currentRoom.roomCode, targetUserId);
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : `Failed to kick ${targetUsername}`;
      setErrorMessage(msg);
    } finally {
      setKickingUserId(null);
    }
  };

  // Start Match (Host Only)
  const handleStartMatch = async () => {
    if (!isHost || !canStartMatch) return;
    setIsStarting(true);
    setErrorMessage(null);
    try {
      if (webSocketClient && webSocketClient.isConnected) {
        webSocketClient.startMatch(currentRoom.roomCode);
      } else {
        const { match } = await apiClient.startMatch(currentRoom.roomCode);
        if (onMatchStarted) {
          onMatchStarted(match);
        }
      }
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to launch match. Verify player requirements.";
      setErrorMessage(msg);
      setIsStarting(false);
    }
  };

  // Build the 10 Player Slots Grid
  const slots: Array<{
    position: string;
    index: number;
    isRequired: boolean;
    player: RoomParticipant | null;
  }> = useMemo(() => {
    const list = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      list.push({
        position: `Seat ${i + 1}`,
        index: i + 1,
        isRequired: i < MIN_PLAYERS,
        player: currentRoom.players[i] || null
      });
    }
    return list;
  }, [currentRoom.players]);

  return (
    <div className="w-full max-w-5xl mx-auto px-3 sm:px-6 py-6 animate-fadeIn text-[#f5ede0]">
      {/* Kicked Modal */}
      {wasKicked && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="bg-[#1c1626] border-2 border-red-500/60 rounded-2xl p-6 max-w-md w-full shadow-2xl text-center space-y-4">
            <div className="text-4xl">🚪</div>
            <h3 className="text-xl font-bold font-fredoka text-red-400">
              Chamber Departure
            </h3>
            <p className="text-xs text-[#c9bdd9] leading-relaxed">
              You were removed from Chamber <strong className="text-[#f5ede0]">{currentRoom.roomCode}</strong> by the room host.
            </p>
            <button
              onClick={onLeaveRoom}
              className="w-full py-2.5 bg-red-600 hover:bg-red-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-colors shadow-lg"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      )}

      {/* Top Chamber Header Bar */}
      <div className="cartoon-card bg-[#241938] p-4 sm:p-6 mb-6 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-36 h-36 bg-[#FFB703]/10 rounded-bl-full pointer-events-none" />

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {/* Chamber Title & Code */}
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-[#34264D] border-[3px] border-[#1E1410] shadow-[3px_3px_0_#1E1410] flex items-center justify-center text-2xl">
              🏰
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs uppercase tracking-widest text-[#C9BDD9] font-bold">
                  Chamber
                </span>
                <span
                  data-testid="room-code-badge"
                  className="font-mono text-xl sm:text-2xl font-bold text-[#FFB703] tracking-widest bg-[#191128] px-3 py-0.5 rounded-xl border-[3px] border-[#1E1410] shadow-[2px_2px_0_#1E1410]"
                >
                  {currentRoom.roomCode}
                </span>
                <button
                  onClick={handleCopyCode}
                  title="Copy chamber code"
                  className="cartoon-btn px-3 py-1 bg-[#34264D] hover:bg-[#433163] text-[#FFFDF7] text-xs font-bold rounded-xl flex items-center space-x-1"
                >
                  {isCopied ? (
                    <span className="text-[#38B000] font-bold">✓ Copied!</span>
                  ) : (
                    <span>📋 Copy</span>
                  )}
                </button>
              </div>
              <div className="flex items-center space-x-3 text-xs text-[#a394b3] mt-1">
                <span className="flex items-center space-x-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span className="text-amber-300 font-medium">{currentRoom.phase}</span>
                </span>
                <span>•</span>
                <span>
                  Host: <strong className="text-[#f5ede0]">{hostPlayer?.username || "Host Scribe"}</strong>
                </span>
                {isHost && (
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 px-2 py-0.2 rounded-md text-[10px] font-bold">
                    You are Host
                  </span>
                )}
                {isSpectator && (
                  <span className="bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 px-2 py-0.2 rounded-md text-[10px] font-bold">
                    Spectator Mode
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action: Leave Chamber */}
          <div className="flex items-center space-x-3">
            <button
              onClick={handleLeaveRoom}
              disabled={isLeaving}
              className="cartoon-btn px-4 py-2 bg-[#34264D] hover:bg-[#433163] text-[#FFFDF7] text-xs font-bold rounded-2xl disabled:opacity-50"
            >
              {isLeaving ? "Departing..." : "Leave Chamber"}
            </button>
          </div>
        </div>
      </div>

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="mb-6 p-4 bg-red-950/80 border-2 border-red-500/50 rounded-xl text-red-200 text-xs flex items-center space-x-3 shadow-lg">
          <span className="text-xl">⚠️</span>
          <span className="flex-1 font-semibold">{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-300 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>
      )}

      {/* Player Seats Section (5 to 10 Seats) */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg font-bold font-fredoka text-[#f5ede0] flex items-center space-x-2">
              <span>⚔️ Scribe Seats</span>
              <span className="text-xs font-normal text-[#a394b3]">
                ({currentRoom.playerCount}/{MAX_PLAYERS} Players)
              </span>
            </h2>
            <p className="text-xs text-[#a394b3]">
              Minimum 5 players required to commence the Folio ritual. Up to 10 players maximum. Battle positions (P1–Pn) are randomly assigned when the match begins.
            </p>
          </div>

          <div className="flex items-center space-x-2 text-xs">
            <div className="flex items-center space-x-1">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="text-[#a394b3]">Seats 1–5: Required</span>
            </div>
            <div className="flex items-center space-x-1 ml-3">
              <span className="w-2.5 h-2.5 rounded-full bg-[#443358]" />
              <span className="text-[#a394b3]">Seats 6–10: Optional</span>
            </div>
          </div>
        </div>

        {/* 10 Seats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3.5">
          {slots.map((slot) => {
            const { position, index, isRequired, player } = slot;
            const isSelf = currentUser && player?.userId === currentUser.id;
            const isSeatHost = player && player.userId === currentRoom.hostUserId;

            if (player) {
              return (
                <div
                  key={player.userId}
                  data-testid={`player-seat-${index}`}
                  className={`border-[3px] border-[#1E1410] rounded-2xl p-3 flex flex-col justify-between shadow-[4px_4px_0_#1E1410] relative transition-transform hover:-translate-y-0.5 ${
                    isSeatHost
                      ? "bg-[#31234A] ring-2 ring-[#FFB703]"
                      : isSelf
                      ? "bg-[#242847] ring-2 ring-[#21D4FD]"
                      : "bg-[#241938]"
                  }`}
                >
                  {/* Position Badge & Role Tag */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[11px] font-mono font-bold px-2 py-0.5 rounded bg-[#100c16] text-[#a394b3] border border-[#2d223c]">
                      {position}
                    </span>
                    {isSeatHost ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center space-x-1">
                        <span>👑</span>
                        <span>Host</span>
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-cyan-950/40 text-cyan-300 border border-cyan-800/30">
                        Player
                      </span>
                    )}
                  </div>

                  {/* Character Avatar Representation */}
                  <div className="w-full h-24 my-1 flex items-center justify-center bg-[#100d16] rounded-lg border border-[#281f33] overflow-hidden p-1 relative">
                    <HandDrawnStickman
                      characterId={player.avatarId || "barnaby"}
                      progress={5}
                      pose="idle"
                      className="w-full h-full max-h-20"
                    />
                    <div
                      title={player.connected ? "Connected" : "Disconnected"}
                      className={`absolute top-1 right-1 w-2 h-2 rounded-full ${
                        player.connected ? "bg-emerald-400" : "bg-neutral-500"
                      }`}
                    />
                  </div>

                  {/* Username & Identifiers */}
                  <div className="mt-2 text-center">
                    <div className="text-xs font-bold text-[#f5ede0] truncate" title={player.username}>
                      {player.username}
                      {isSelf && <span className="ml-1 text-[10px] text-cyan-300 font-semibold">(You)</span>}
                    </div>
                    <div className="text-[10px] text-[#7a6d88] capitalize">
                      {player.avatarId || "scribe"}
                    </div>
                  </div>

                  {/* Host Kick Control */}
                  {isHost && !isSeatHost && (
                    <div className="mt-2 pt-2 border-t border-[#2d223c]">
                      <button
                        onClick={() => handleKickPlayer(player.userId, player.username)}
                        disabled={kickingUserId === player.userId}
                        data-testid={`kick-button-${player.userId}`}
                        className="cartoon-btn w-full py-1.5 text-[10px] font-bold text-[#FFFDF7] bg-[#FF4D6D] hover:bg-[#FF6B85] rounded-xl flex items-center justify-center space-x-1 disabled:opacity-50"
                      >
                        {kickingUserId === player.userId ? (
                          <span>Kicking...</span>
                        ) : (
                          <>
                            <span>🚫</span>
                            <span>Kick Scribe</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              );
            }

            // Empty Slot
            return (
              <div
                key={position}
                data-testid={`empty-seat-${index}`}
                className={`border-2 border-dashed rounded-xl p-3 flex flex-col justify-between items-center text-center min-h-[190px] ${
                  isRequired
                    ? "border-amber-700/40 bg-[#16121d]/40"
                    : "border-[#382b4a]/60 bg-[#120e17]/30"
                }`}
              >
                <div className="w-full flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#6c5e7b] font-semibold">
                    {position}
                  </span>
                  <span
                    className={`text-[9px] uppercase tracking-wider font-semibold px-1.5 py-0.5 rounded ${
                      isRequired ? "text-amber-400/80 bg-amber-950/30" : "text-[#7a6d88] bg-[#1a1424]"
                    }`}
                  >
                    {isRequired ? "Required" : "Open"}
                  </span>
                </div>

                <div className="my-auto py-2 space-y-1">
                  <div className="text-2xl opacity-30">👤</div>
                  <div className="text-[11px] font-semibold text-[#8e809e]">
                    {isRequired ? "Waiting for scribe..." : "Optional seat"}
                  </div>
                  <div className="text-[9px] text-[#5e516e]">
                    {isRequired ? "Must assemble" : "Open slot"}
                  </div>
                </div>

                <div className="text-[10px] text-[#554766]">Seat {index}</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Host Controls & Match Launch Bar */}
      <div className="cartoon-card bg-[#241938] p-5 mb-6">
        {isHost ? (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-2xl drop-shadow-[2px_2px_0_#1E1410]">👑</span>
                <h3 className="text-base font-bold font-fredoka text-[#FFB703] drop-shadow-[1px_1px_0_#1E1410]">
                  Host Command Authority
                </h3>
              </div>
              <p className="text-xs text-[#E2D9F3] mt-1">
                {canStartMatch
                  ? `Chamber requirements satisfied (${currentRoom.playerCount} scribes). You may now launch the ritual.`
                  : `Requires at least ${MIN_PLAYERS} scribes to begin ritual (currently ${currentRoom.playerCount}/${MIN_PLAYERS}).`}
              </p>
            </div>

            <button
              onClick={handleStartMatch}
              disabled={!canStartMatch || isStarting}
              data-testid="start-match-button"
              className={`cartoon-btn px-8 py-3 rounded-2xl font-bold text-xs uppercase tracking-wider flex items-center justify-center space-x-2 ${
                canStartMatch
                  ? "bg-[#FFB703] hover:bg-[#FFC933] text-[#1E1410] cursor-pointer"
                  : "bg-[#34264D] text-[#8E809E] cursor-not-allowed opacity-60"
              }`}
            >
              {isStarting ? (
                <>
                  <span className="animate-spin">⏳</span>
                  <span>Commencing Match...</span>
                </>
              ) : (
                <>
                  <span>⚔️</span>
                  <span>
                    {canStartMatch
                      ? `Start Match (${currentRoom.playerCount} Scribes)`
                      : `Awaiting Players (${currentRoom.playerCount}/${MIN_PLAYERS})`}
                  </span>
                </>
              )}
            </button>
          </div>
        ) : (
          <div className="flex items-center space-x-3 text-xs text-[#c4b58a]">
            <span className="text-2xl animate-spin">⏳</span>
            <div>
              <span className="font-semibold text-[#f5ede0]">
                Awaiting Room Host ({hostPlayer?.username || "Host Scribe"})
              </span>
              <p className="text-[11px] text-[#a394b3]">
                The host will commence the ritual once at least 5 scribes assemble (currently {currentRoom.playerCount}/{MIN_PLAYERS}).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Spectator Section */}
      <div className="bg-[#141019] border border-[#2d223c] rounded-2xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center space-x-2">
            <span className="text-lg">👁️</span>
            <h3 className="text-sm font-bold font-fredoka text-[#f5ede0]">
              Spectator Chamber
            </h3>
            <span className="text-xs text-[#22d3ee] font-semibold">
              ({currentRoom.spectatorCount} Spectators)
            </span>
          </div>
          <span className="text-[10px] text-[#7a6d88]">
            Zero gameplay authority • Real-time observation
          </span>
        </div>

        {currentRoom.spectators.length > 0 ? (
          <div className="flex flex-wrap gap-2 pt-1">
            {currentRoom.spectators.map((spec) => {
              const isSelf = currentUser && spec.userId === currentUser.id;
              return (
                <div
                  key={spec.userId}
                  data-testid={`spectator-badge-${spec.userId}`}
                  className="flex items-center space-x-2 bg-[#1c1626] border border-[#3e2e52] px-3 py-1.5 rounded-xl text-xs"
                >
                  <span className="w-5 h-5 rounded-full bg-[#2a2039] flex items-center justify-center text-[10px] font-bold text-[#22d3ee]">
                    👁
                  </span>
                  <span className="font-semibold text-[#f5ede0]">{spec.username}</span>
                  {isSelf && <span className="text-[10px] text-cyan-300 font-bold">(You)</span>}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-xs text-[#6e5d80] italic">
            No spectators currently observing this chamber. Anyone joining with the code as a spectator will appear here.
          </p>
        )}
      </div>
    </div>
  );
};
