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
      <header className="w-full bg-[#FAF4E6] border-b-4 border-[#1C1917] z-30 px-3 sm:px-6 py-2.5 shadow-[0_4px_0_#1C1917] select-none flex-shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          {/* Logo & Turn Information */}
          <div className="flex items-center gap-3 flex-shrink-0">
            <span className="text-2xl bg-[#E5C467] border-2 border-[#1C1917] px-2 py-0.5 shadow-[3px_3px_0_#1C1917] -rotate-3">📖</span>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-bangers text-[#1C1917] text-xl tracking-wider uppercase">
                  PageShooter
                </h1>
                <span className="text-xs font-bangers tracking-wider bg-[#1C1917] px-2.5 py-0.5 text-[#E5C467] -skew-x-6">
                  Turn #{matchState.turn.turnNumber}
                </span>
              </div>
              <div className="text-[11px] font-bold text-[#1C1917]/80">
                {matchState.totalTurns} Total Turns • {matchState.players.filter((p) => p.status === "ACTIVE").length} of {matchState.players.length} Active
              </div>
            </div>
          </div>

          {/* Current Turn Focus Banner (Warm Vintage Comic Action Panel) */}
          {currentPlayer && (
            <div className="flex items-center gap-2.5 bg-[#E5C467] border-3 border-[#1C1917] px-4 py-1.5 shadow-[4px_4px_0_#1C1917] -skew-x-3 flex-shrink-0">
              <span className="font-bangers tracking-wider text-sm bg-[#1C1917] text-[#E5C467] px-2.5 py-0.5">
                {currentPlayer.position}
              </span>
              <div className="text-left">
                <div className="text-sm font-bangers tracking-wider text-[#1C1917] truncate max-w-[140px] sm:max-w-[180px] uppercase">
                  {currentPlayer.username}
                </div>
                <div className="text-[11px] font-bold leading-tight">
                  {isAwaitingShot ? (
                    <span className="text-[#9E3526] font-extrabold uppercase">
                      🎯 Click an opponent cell to shoot!
                    </span>
                  ) : (
                    <span className="text-[#1C1917]">Your turn to roll the book</span>
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
                className="cartoon-btn flex items-center gap-1.5 px-4 py-2 bg-[#E5C467] hover:bg-[#EDD07A] text-[#1C1917] font-bangers tracking-wider text-sm sm:text-base uppercase disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer flex-shrink-0"
              >
                <span>📖</span>
                <span>Open Storybook</span>
              </button>
            )}

            {isAwaitingShot && (
              <div className="px-3.5 py-1.5 bg-[#C85A48] border-2 border-[#1C1917] shadow-[3px_3px_0_#1C1917] text-[#FAF4E6] font-bangers tracking-wider text-sm uppercase -skew-x-6 flex-shrink-0">
                ⚔️ Aiming at opponent...
              </div>
            )}

            {/* Sound Controls */}
            <div className="flex items-center gap-1.5 bg-[#EFE6D0] border-2 border-[#1C1917] shadow-[3px_3px_0_#1C1917] px-2.5 py-1 flex-shrink-0">
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
                className="w-14 h-1.5 accent-[#C85A48] cursor-pointer"
                title={`Volume: ${Math.round(soundSettings.volume * 100)}%`}
              />
            </div>

            {/* Reset / Abandon Button */}
            <button
              onClick={() => setShowConfirmReset(true)}
              className="cartoon-btn text-xs font-bangers tracking-wider uppercase text-[#FAF4E6] bg-[#C85A48] hover:bg-[#D66A59] px-3 py-1.5 cursor-pointer flex-shrink-0"
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
