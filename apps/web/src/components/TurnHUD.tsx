import React, { useState } from "react";
import type { MatchState, PlayerState } from "@pageshooter/shared";
import { soundManager } from "../audio/soundManager.js";

interface TurnHUDProps {
  matchState: MatchState;
  isRolling: boolean;
  onRoll: () => void;
  onResetMatch: () => void;
}

export const TurnHUD: React.FC<TurnHUDProps> = ({
  matchState,
  isRolling,
  onRoll,
  onResetMatch
}) => {
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [soundSettings, setSoundSettings] = useState(() => soundManager.getSettings());

  const currentPlayer: PlayerState | undefined = matchState.players.find(
    (p) => p.playerId === matchState.turn.currentPlayerId
  );

  const isAwaitingRoll = matchState.turn.phase === "AWAITING_ROLL";
  const isAwaitingShot = matchState.turn.phase === "AWAITING_SHOT" && matchState.turn.pendingShot;

  const handleToggleMute = () => {
    const isMuted = soundManager.toggleMute();
    setSoundSettings((prev) => ({ ...prev, muted: isMuted }));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    soundManager.setVolume(vol);
    setSoundSettings((prev) => ({ ...prev, volume: vol }));
  };

  return (
    <>
      <header className="w-full bg-fantasy-card/95 border-b border-fantasy-border/80 sticky top-0 z-40 backdrop-blur-md px-4 py-3 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-3">
          {/* Title & Turn Indicator */}
          <div className="flex items-center gap-3">
            <span className="text-2xl">📜</span>
            <div>
              <h1 className="font-serif font-black text-fantasy-gold tracking-wide text-base sm:text-lg">
                PAGE SHOOTER
              </h1>
              <div className="flex items-center gap-2 text-xs font-mono text-fantasy-parchment/80">
                <span>Turn #{matchState.turn.turnNumber}</span>
                <span>•</span>
                <span className="text-fantasy-parchment/60">Total {matchState.totalTurns}</span>
              </div>
            </div>
          </div>

          {/* Current Turn Focus */}
          {currentPlayer && (
            <div className="flex items-center gap-3 bg-fantasy-bg/80 border border-fantasy-border px-4 py-1.5 rounded-xl">
              <span className="font-mono text-xs font-black bg-fantasy-gold text-black px-2 py-0.5 rounded shadow">
                {currentPlayer.position}
              </span>
              <div className="text-left">
                <div className="text-xs font-serif font-bold text-fantasy-gold-light truncate max-w-[140px] sm:max-w-[200px]">
                  {currentPlayer.username}
                </div>
                <div className="text-[10px] font-mono">
                  {isAwaitingShot ? (
                    <span className="text-fantasy-crimson-light font-bold animate-pulse">
                      TARGET OPPONENT CELL!
                    </span>
                  ) : (
                    <span className="text-fantasy-parchment/70">Consulting Grimoire...</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Controls: Roll Button & Sound & Reset */}
          <div className="flex items-center gap-3">
            {/* Primary Action Button */}
            {isAwaitingRoll && (
              <button
                onClick={onRoll}
                disabled={isRolling}
                className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-fantasy-gold via-fantasy-gold-light to-fantasy-gold hover:from-fantasy-gold-light hover:to-fantasy-gold text-black font-serif font-black text-sm rounded-xl transition-all shadow-[0_0_15px_rgba(229,169,60,0.5)] active:scale-95 disabled:opacity-50 cursor-pointer"
              >
                <span>📖</span>
                <span>Open Ancient Book</span>
              </button>
            )}

            {isAwaitingShot && (
              <div className="px-4 py-2 bg-fantasy-crimson/20 border border-fantasy-crimson text-fantasy-crimson-light font-serif font-bold text-xs rounded-xl animate-pulse">
                Click any enemy cell to fire!
              </div>
            )}

            {/* Sound Controls */}
            <div className="flex items-center gap-1.5 bg-fantasy-bg/60 border border-fantasy-border/60 px-2 py-1.5 rounded-lg">
              <button
                onClick={handleToggleMute}
                aria-label={soundSettings.muted ? "Unmute" : "Mute"}
                className="text-sm hover:scale-110 transition-transform cursor-pointer"
                title={soundSettings.muted ? "Unmute audio" : "Mute audio"}
              >
                {soundSettings.muted ? "🔇" : "🔊"}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={soundSettings.muted ? 0 : soundSettings.volume}
                onChange={handleVolumeChange}
                className="w-16 h-1 accent-fantasy-gold cursor-pointer"
                title={`Volume: ${Math.round(soundSettings.volume * 100)}%`}
              />
            </div>

            {/* Abandon/Reset Button */}
            <button
              onClick={() => setShowConfirmReset(true)}
              className="text-xs font-mono text-fantasy-parchment/50 hover:text-fantasy-crimson border border-fantasy-border/40 hover:border-fantasy-crimson/50 px-2 py-1.5 rounded-lg transition-colors cursor-pointer"
              title="Reset match and start over"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Confirmation Modal for Reset */}
      {showConfirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-sm p-4">
          <div className="max-w-sm w-full bg-fantasy-card border border-fantasy-border rounded-2xl p-6 text-center">
            <h3 className="font-serif text-lg font-bold text-fantasy-parchment mb-2">
              Abandon Current Match?
            </h3>
            <p className="text-xs text-fantasy-parchment/70 mb-5">
              This will discard the saved match state from IndexedDB and return to the match setup screen.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-4 py-2 bg-fantasy-border/40 hover:bg-fantasy-border/60 text-fantasy-parchment text-xs font-serif rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowConfirmReset(false);
                  onResetMatch();
                }}
                className="px-4 py-2 bg-fantasy-crimson hover:bg-fantasy-crimson-light text-white text-xs font-serif font-bold rounded-lg cursor-pointer"
              >
                Yes, Abandon Match
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
