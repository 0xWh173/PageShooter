import React, { useEffect } from "react";
import type { MatchState, PlayerState, CellValue } from "@pageshooter/shared";
import { CELL_VALUES } from "@pageshooter/shared";
import { soundManager } from "../audio/soundManager.js";
import { StickmanCell } from "./StickmanCell.js";

interface VictoryModalProps {
  matchState: MatchState;
  onPlayAgain: () => void;
  onNewMatch: () => void;
}

export const VictoryModal: React.FC<VictoryModalProps> = ({
  matchState,
  onPlayAgain,
  onNewMatch
}) => {
  const winner: PlayerState | undefined = matchState.players.find(
    (p) => p.playerId === matchState.winnerPlayerId
  );

  useEffect(() => {
    soundManager.playVictory();
  }, []);

  if (!winner) return null;

  const aliveCellsCount = Object.values(winner.cells).filter((c) => !c.destroyed).length;
  const winReasonLabel =
    matchState.winReason === "NO_VALID_TARGETS"
      ? "Sole Armed Storyteller"
      : "Last Player Standing";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#241A12]/85 backdrop-blur-md p-2.5 sm:p-6 overflow-y-auto overflow-x-hidden select-none animate-in fade-in duration-300"
      role="dialog"
      aria-modal="true"
      aria-labelledby="victory-title"
    >
      {/* Central Victory Panel */}
      <div className="w-full max-w-[340px] sm:max-w-xl min-w-0 bg-[#FFFDF9] border-2 border-cozy-parchment rounded-3xl p-3.5 sm:p-7 md:p-8 text-center shadow-2xl relative my-auto max-h-[96vh] overflow-y-auto overflow-x-hidden mx-auto animate-in zoom-in-95 duration-400 ease-out">
        {/* A. Champion Emblem */}
        <div className="mb-1.5 sm:mb-2">
          <div className="w-12 h-12 sm:w-16 sm:h-16 mx-auto flex items-center justify-center rounded-2xl bg-[#FAF1DF] border-2 border-[#D9AA61] shadow-xs">
            <svg
              viewBox="0 0 48 48"
              className="w-7 h-7 sm:w-10 sm:h-10 text-cozy-amber-dark"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {/* Crown Base & Spikes */}
              <path
                d="M 8 36 L 40 36 L 42 16 L 31 24 L 24 10 L 17 24 L 6 16 Z"
                fill="#D9AA61"
                fillOpacity="0.3"
                stroke="#B88636"
              />
              {/* Crown Jewels */}
              <circle cx="24" cy="10" r="2" fill="#B88636" stroke="none" />
              <circle cx="6" cy="16" r="1.8" fill="#B88636" stroke="none" />
              <circle cx="42" cy="16" r="1.8" fill="#B88636" stroke="none" />
              <circle cx="17" cy="24" r="1.5" fill="#B88636" stroke="none" />
              <circle cx="31" cy="24" r="1.5" fill="#B88636" stroke="none" />
              {/* Headband line */}
              <line x1="11" y1="32" x2="37" y2="32" stroke="#B88636" strokeWidth="1.5" />
            </svg>
          </div>
        </div>

        {/* B. Victory Heading */}
        <div className="mb-3 sm:mb-4">
          <div className="text-[10px] sm:text-xs font-fredoka font-bold text-cozy-brown uppercase tracking-widest">
            Storybook Grand Champion
          </div>

          <h1
            id="victory-title"
            className="font-fredoka text-2xl sm:text-4xl md:text-5xl font-black text-cozy-brown-dark mt-0.5 sm:mt-1 mb-0.5 sm:mb-1 tracking-tight"
          >
            {winner.username} Wins!
          </h1>

          <p className="text-[11px] sm:text-sm font-fredoka font-medium text-cozy-brown/80">
            Seat {winner.position} • {winReasonLabel}
          </p>
        </div>

        {/* C. Surviving Warrior Cells */}
        <div className="bg-[#FAF7F0] border border-cozy-cell-border rounded-2xl p-2 sm:p-4 mb-3 sm:mb-4 w-full min-w-0 overflow-hidden">
          <div className="text-[11px] sm:text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown mb-1.5 sm:mb-2 text-center">
            Surviving Warrior Cells
          </div>

          <div className="grid grid-cols-5 gap-0.5 sm:gap-2 max-w-lg mx-auto border border-cozy-cell-border rounded-xl bg-[#FFFDF9] p-0.5 sm:p-1 shadow-inner w-full min-w-0">
            {CELL_VALUES.map((val: CellValue) => (
              <div
                key={val}
                className="h-20 sm:h-34 border-r last:border-r-0 border-cozy-cell-border flex items-center justify-center overflow-hidden min-w-0"
              >
                <StickmanCell
                  cell={winner.cells[val]}
                  cellValue={val}
                />
              </div>
            ))}
          </div>
        </div>

        {/* D. Match Statistics */}
        <div className="grid grid-cols-3 gap-1 sm:gap-3 bg-[#FAF7F0] border border-cozy-cell-border rounded-xl p-2 sm:p-3.5 mb-3.5 sm:mb-5 text-center font-fredoka w-full min-w-0">
          <div className="border-r border-cozy-cell-border/60 px-1 min-w-0">
            <div className="text-[9px] sm:text-[11px] text-cozy-brown uppercase font-bold tracking-tight truncate">
              Total Turns
            </div>
            <div className="text-base sm:text-2xl font-black text-cozy-brown-dark mt-0.5">
              {matchState.totalTurns}
            </div>
          </div>
          <div className="border-r border-cozy-cell-border/60 px-1 min-w-0">
            <div className="text-[9px] sm:text-[11px] text-cozy-brown uppercase font-bold tracking-tight truncate">
              Winner Kills
            </div>
            <div className="text-base sm:text-2xl font-black text-cozy-amber-dark mt-0.5">
              {winner.kills} ⭐
            </div>
          </div>
          <div className="px-1 min-w-0">
            <div className="text-[9px] sm:text-[11px] text-cozy-brown uppercase font-bold tracking-tight truncate">
              Surviving Cells
            </div>
            <div className="text-base sm:text-2xl font-black text-cozy-brown-dark mt-0.5">
              {aliveCellsCount} / 5
            </div>
          </div>
        </div>

        {/* E. Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-3.5 w-full">
          <button
            onClick={onPlayAgain}
            className="w-full sm:w-auto px-6 sm:px-7 py-2.5 sm:py-3 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-xs sm:text-base rounded-full shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            Play Again / Rematch ➔
          </button>
          <button
            onClick={onNewMatch}
            className="w-full sm:w-auto px-5 sm:px-6 py-2.5 sm:py-3 bg-[#FFFDF9] hover:bg-cozy-parchment/40 text-cozy-brown hover:text-cozy-brown-dark border border-cozy-parchment font-fredoka font-bold text-xs sm:text-base rounded-full transition-all active:scale-95 cursor-pointer"
          >
            New Match Setup
          </button>
        </div>
      </div>
    </div>
  );
};
