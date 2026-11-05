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
      <header className="w-full bg-[#FFFDF9]/95 border-b-2 border-[#E2D3BE] sticky top-0 z-40 backdrop-blur-md px-4 py-2.5 shadow-sm select-none">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-2.5">
          {/* Logo & Turn Information */}
          <div className="flex items-center gap-3">
            <span className="text-2xl animate-float">📖</span>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-fredoka font-bold text-cozy-brown text-base sm:text-lg tracking-tight">
                  PageShooter
                </h1>
                <span className="text-[10px] font-fredoka bg-cozy-peach/30 text-cozy-coral px-2 py-0.5 rounded-full font-bold">
                  Storybook Edition
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs font-hand text-cozy-brown-light">
                <span>Page #{matchState.turn.turnNumber}</span>
                <span>•</span>
                <span>{matchState.totalTurns} Turns Elapsed</span>
              </div>
            </div>
          </div>

          {/* Current Turn Focus Banner */}
          {currentPlayer && (
            <div className="flex items-center gap-3 bg-[#FAF5EB] border-2 border-cozy-gold/60 px-4 py-1.5 rounded-2xl shadow-xs">
              <span className="font-fredoka text-xs font-bold bg-cozy-gold text-cozy-brown px-2 py-0.5 rounded-full shadow-xs">
                {currentPlayer.position}
              </span>
              <div className="text-left">
                <div className="text-xs font-fredoka font-bold text-cozy-brown truncate max-w-[140px] sm:max-w-[200px]">
                  {currentPlayer.username}
                </div>
                <div className="text-[10px] font-hand">
                  {isAwaitingShot ? (
                    <span className="text-cozy-coral font-bold animate-pulse">
                      Tap any enemy cell to shoot! 🎯
                    </span>
                  ) : (
                    <span className="text-cozy-brown-light">Ready to turn the page... 🍃</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Action Button & Sound Settings */}
          <div className="flex items-center gap-3">
            {/* Primary Action Button: Open Storybook */}
            {isAwaitingRoll && (
              <button
                onClick={onRoll}
                disabled={isRolling}
                className="flex items-center gap-2 px-5 py-2.5 bg-cozy-gold hover:bg-cozy-gold-dark text-cozy-brown font-fredoka font-bold text-sm rounded-full transition-all shadow-md active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none cursor-pointer"
              >
                <span>📖</span>
                <span>Open Storybook</span>
              </button>
            )}

            {isAwaitingShot && (
              <div className="px-4 py-2 bg-cozy-peach/25 border-2 border-cozy-coral text-cozy-coral font-fredoka font-bold text-xs rounded-full animate-pulse shadow-xs">
                Aim at an opponent cell below 🎯
              </div>
            )}

            {/* Sound Controls */}
            <div className="flex items-center gap-1.5 bg-[#FAF5EB] border-2 border-[#E2D3BE] px-2.5 py-1.5 rounded-full shadow-xs">
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
                className="w-16 h-1.5 accent-cozy-gold cursor-pointer"
                title={`Volume: ${Math.round(soundSettings.volume * 100)}%`}
              />
            </div>

            {/* Reset / Abandon Button */}
            <button
              onClick={() => setShowConfirmReset(true)}
              className="text-xs font-fredoka font-semibold text-cozy-brown-light hover:text-cozy-coral border-2 border-[#E2D3BE] hover:border-cozy-coral/40 px-3 py-1.5 rounded-full transition-colors cursor-pointer bg-[#FAF5EB]"
              title="Reset match and return to setup"
            >
              Reset
            </button>
          </div>
        </div>
      </header>

      {/* Confirmation Modal for Reset */}
      {showConfirmReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#462B18]/60 backdrop-blur-xs p-4 select-none">
          <div className="max-w-sm w-full bg-[#FFFDF9] border-3 border-[#D8C7B0] rounded-3xl p-6 text-center shadow-cozy-lg">
            <div className="text-3xl mb-2">🍃</div>
            <h3 className="font-fredoka text-lg font-bold text-cozy-brown mb-1">
              Leave Current Story?
            </h3>
            <p className="text-xs font-hand text-cozy-brown-light mb-5">
              This will close the active match from your browser and let you start fresh.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowConfirmReset(false)}
                className="px-4 py-2 bg-[#FAF5EB] hover:bg-[#F3E8D8] text-cozy-brown text-xs font-fredoka font-bold rounded-full border border-[#D8C7B0] cursor-pointer"
              >
                Keep Playing
              </button>
              <button
                onClick={() => {
                  setShowConfirmReset(false);
                  onResetMatch();
                }}
                className="px-4 py-2 bg-cozy-coral hover:bg-[#D45D3F] text-white text-xs font-fredoka font-bold rounded-full cursor-pointer shadow-xs"
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
