import React from "react";
import type { MatchState } from "@pageshooter/shared";
import type { ConnectionStatus } from "../../network/index.js";

interface OnlineTurnHUDProps {
  matchState: MatchState;
  roomCode: string;
  currentUserId: string | null;
  isSpectator: boolean;
  isRolling: boolean;
  canRoll: boolean;
  canShoot: boolean;
  activeCommitmentHash?: string | null;
  connectionStatus?: ConnectionStatus;
  transportMode?: "WS" | "HTTP_POLLING";
  onReconnect?: () => void;
  onRoll: () => void;
  onLeaveMatch: () => void;
}

export const OnlineTurnHUD: React.FC<OnlineTurnHUDProps> = ({
  matchState,
  roomCode,
  currentUserId,
  isSpectator,
  isRolling,
  canRoll,
  canShoot,
  activeCommitmentHash,
  connectionStatus = "CONNECTED",
  transportMode = "WS",
  onReconnect,
  onRoll,
  onLeaveMatch
}) => {
  const currentPlayer = matchState.players.find(
    (p) => p.playerId === matchState.turn.currentPlayerId
  );
  const isCurrentTurn = !isSpectator && currentPlayer?.playerId === currentUserId;
  const activeCount = matchState.players.filter((p) => p.status === "ACTIVE").length;
  const isPaused = matchState.phase === "PAUSED";

  return (
    <header
      className="w-full bg-[#241938] border-b-[3px] border-[#1E1410] shadow-[0_4px_0_#1E1410] px-3 sm:px-6 py-2.5 text-[#FFFDF7]"
      data-testid="online-turn-hud"
    >
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
        {/* Left: Room & Turn Meta */}
        <div className="flex items-center space-x-3">
          <div className="flex items-center space-x-2">
            <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-[#120f18] border border-[#443358] text-[#f59e0b]">
              {roomCode}
            </span>
            <span className="text-xs font-bold text-[#c4b58a]">
              Turn #{matchState.turn.turnNumber}
            </span>
          </div>

          <span className="hidden sm:inline text-[#533e6b]">•</span>

          <span className="text-xs text-[#a394b3]">
            <strong className="text-[#f5ede0]">{activeCount}</strong>/{matchState.players.length} Standing
          </span>

          {isSpectator && (
            <span
              data-testid="hud-spectator-badge"
              className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/60 text-cyan-300 border border-cyan-500/40"
            >
              👁 Spectator Mode
            </span>
          )}

          {activeCommitmentHash && (
            <span
              title={`Turn Commitment: ${activeCommitmentHash}`}
              className="hidden md:inline-flex items-center space-x-1 px-2 py-0.5 rounded-md bg-emerald-950/40 border border-emerald-600/30 text-[10px] font-mono text-emerald-300"
            >
              <span>🔒</span>
              <span>SHA-256 Committed</span>
            </span>
          )}

          {/* Connection Health Pill */}
          <button
            type="button"
            onClick={() => {
              if (connectionStatus !== "CONNECTED" && onReconnect) onReconnect();
            }}
            title={
              connectionStatus === "CONNECTED"
                ? transportMode === "WS"
                  ? "Connected via real-time WebSocket"
                  : "Connected via HTTP live sync"
                : "Click to reconnect now"
            }
            data-testid="connection-health-pill"
            className={`hidden sm:inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md border text-[10px] font-mono font-bold ${
              connectionStatus === "CONNECTED"
                ? transportMode === "WS"
                  ? "bg-emerald-950/50 border-emerald-500/40 text-emerald-300"
                  : "bg-amber-950/50 border-amber-500/40 text-amber-300"
                : "bg-red-950/70 border-red-500/60 text-red-200 animate-pulse cursor-pointer"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                connectionStatus === "CONNECTED"
                  ? transportMode === "WS"
                    ? "bg-emerald-400"
                    : "bg-amber-400"
                  : "bg-red-400"
              }`}
            />
            <span>
              {connectionStatus === "CONNECTED"
                ? transportMode === "WS"
                  ? "Live"
                  : "Sync"
                : "Reconnect ↻"}
            </span>
          </button>
        </div>

        {/* Center: Authoritative Turn Status & Action */}
        <div className="flex items-center space-x-3">
          <div
            aria-live="polite"
            className="text-xs sm:text-sm font-fredoka flex items-center space-x-2"
          >
            {isPaused ? (
              <span className="text-amber-400 font-bold">⏸ Match Paused</span>
            ) : matchState.turn.phase === "AWAITING_ROLL" ? (
              isCurrentTurn ? (
                <span className="text-[#f59e0b] font-bold">✨ Your Turn — Roll the Storybook!</span>
              ) : (
                <span className="text-[#c9bdd9]">
                  Waiting for <strong className="text-[#f5ede0]">{currentPlayer?.username || "Player"}</strong> to roll...
                </span>
              )
            ) : matchState.turn.phase === "AWAITING_SHOT" ? (
              isCurrentTurn ? (
                <span className="text-red-400 font-bold animate-pulse">
                  🎯 Select Target Cell (Armed: Cell #{matchState.turn.rolledCell})
                </span>
              ) : (
                <span className="text-amber-300">
                  ⚔️ <strong className="text-[#f5ede0]">{currentPlayer?.username || "Player"}</strong> is aiming weapon...
                </span>
              )
            ) : (
              <span className="text-[#a394b3]">Resolving turn...</span>
            )}
          </div>

          {!isSpectator && matchState.turn.phase === "AWAITING_ROLL" && (
            <button
              onClick={onRoll}
              disabled={!canRoll || isRolling || isPaused}
              data-testid="online-roll-button"
              className={`cartoon-btn px-4 py-2 rounded-2xl font-bold text-xs uppercase tracking-wider ${
                canRoll && !isRolling && !isPaused
                  ? "bg-[#FFB703] hover:bg-[#FFC933] text-[#1E1410] cursor-pointer"
                  : "bg-[#34264D] text-[#8E809E] cursor-not-allowed opacity-60"
              }`}
            >
              {isRolling ? "Opening Folio..." : "📖 Roll Storybook"}
            </button>
          )}

          {canShoot && (
            <span
              data-testid="targeting-active-badge"
              className="px-3 py-1.5 rounded-xl bg-red-950/60 border border-red-500/50 text-red-200 text-xs font-bold"
            >
              Click an opponent&apos;s cell
            </span>
          )}
        </div>

        {/* Right: Leave / Exit */}
        <div>
          <button
            onClick={onLeaveMatch}
            className="cartoon-btn px-3 py-1.5 rounded-xl bg-[#34264D] hover:bg-[#433163] text-[#FFFDF7] text-xs font-bold"
          >
            Leave Arena
          </button>
        </div>
      </div>
    </header>
  );
};
