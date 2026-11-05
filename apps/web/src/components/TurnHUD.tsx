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
    setSoundSettings(soundManager.getSettings());
  };

  return (
    <>
      <header className="w-full bg-cozy-white border-b-2 border-cozy-parchment z-30 px-3 sm:px-6 py-2.5 shadow-subtle select-none flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo & Turn Information */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-2xl">📖</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-fredoka font-bold text-cozy-brown-dark text-base tracking-tight">
                  PageShooter
                </h1>
                <span className="text-[10px] font-fredoka bg-cozy-parchment px-2 py-0.5 rounded-full text-cozy-brown font-semibold">
                  Turn #{matchState.turn.turnNumber}
                </span>
              </div>
              <div className="text-[11px] font-fredoka text-cozy-brown/70">
                {matchState.totalTurns} Total Turns • {matchState.players.filter((p) => p.status === "ACTIVE").length} of {matchState.players.length} Active
              </div>
            </div>
          </div>

          {/* Current Turn Focus Banner */}
          {currentPlayer && (
            <div className="flex items-center gap-2.5 bg-cozy-amber-light border border-cozy-amber/60 px-3.5 py-1.5 rounded-xl shadow-xs flex-shrink-0">
              <span className="font-fredoka text-xs font-bold bg-cozy-amber text-cozy-brown-dark px-2 py-0.5 rounded-full">
                {currentPlayer.position}
              </span>
              <div className="text-left">
                <div className="text-xs font-fredoka font-bold text-cozy-brown-dark truncate max-w-[140px] sm:max-w-[180px]">
                  {currentPlayer.username}
                </div>
                <div className="text-[10px] font-fredoka leading-tight">
                  {isAwaitingShot ? (
                    <span className="text-cozy-brown-dark font-bold">
                      Click an opponent cell to shoot!
                    </span>
                  ) : (
                    <span className="text-cozy-brown/80">Your turn to roll the book</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Button & Sound Settings */}
          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0">
            {/* Primary Action Button: Open Storybook */}
            {isAwaitingRoll && (
              <button
                onClick={onRoll}
                disabled={isRolling}
                className="flex items-center gap-1.5 px-4 py-2 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-xs sm:text-sm rounded-full transition-all shadow-xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer flex-shrink-0"
              >
                <span>📖</span>
                <span>Open Storybook</span>
              </button>
            )}

            {isAwaitingShot && (
              <div className="px-3.5 py-1.5 bg-[#F6EBE5] border border-cozy-peach text-cozy-brown-dark font-fredoka font-bold text-xs rounded-full flex-shrink-0">
                Aiming at opponent...
              </div>
            )}

            {/* Sound Controls */}
            <div className="flex items-center gap-1.5 bg-cozy-parchment/40 border border-cozy-parchment px-2 py-1.5 rounded-full flex-shrink-0">
              <button
                onClick={handleToggleMute}
                aria-label={soundSettings.muted ? "Unmute audio" : "Mute audio"}
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
                className="w-14 h-1.5 accent-cozy-amber cursor-pointer"
                title={`Volume: ${Math.round(soundSettings.volume * 100)}%`}
              />
            </div>

            {/* Reset / Abandon Button */}
            <button
              onClick={() => setShowConfirmReset(true)}
              className="text-xs font-fredoka font-semibold text-cozy-brown hover:text-cozy-brown-dark border border-cozy-parchment hover:border-cozy-brown/40 px-2.5 py-1.5 rounded-full transition-colors cursor-pointer bg-cozy-parchment/30 flex-shrink-0"
              title="Reset match and return to setup"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Confirmation Modal for Reset */}
      {showConfirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-brown-dark/40 backdrop-blur-xs p-4 select-none">
          <div className="max-w-sm w-full bg-cozy-white border-2 border-cozy-parchment rounded-2xl p-5 text-center shadow-modal">
            <h3 className="font-fredoka text-base font-bold text-cozy-brown-dark mb-1">
              Reset Current Game?
            </h3>
            <p className="text-xs font-fredoka text-cozy-brown/80 mb-4">
              This will discard the saved match state and return to match setup.
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-4 py-1.5 bg-cozy-parchment/50 hover:bg-cozy-parchment text-cozy-brown-dark text-xs font-fredoka font-semibold rounded-full cursor-pointer"
              >
                Keep Playing
              </button>
              <button
                onClick={() => {
                  setShowConfirmReset(false);
                  onResetMatch();
                }}
                className="px-4 py-1.5 bg-cozy-peach hover:bg-cozy-peach/80 text-cozy-brown-dark text-xs font-fredoka font-bold rounded-full cursor-pointer shadow-xs"
              >
                Yes, Reset Game
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
