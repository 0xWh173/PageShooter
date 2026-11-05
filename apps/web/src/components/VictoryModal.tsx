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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 backdrop-blur-lg p-4 overflow-y-auto">
      <div className="max-w-xl w-full bg-fantasy-card border-2 border-fantasy-gold rounded-3xl p-6 sm:p-8 text-center shadow-[0_0_60px_rgba(229,169,60,0.5)] my-auto animate-in zoom-in-95 duration-400">
        {/* Crown Emblem */}
        <div className="w-20 h-20 mx-auto mb-3 text-5xl flex items-center justify-center rounded-full bg-fantasy-gold/20 border-2 border-fantasy-gold/60 shadow-inner">
          👑
        </div>

        <span className="text-xs font-mono font-bold tracking-widest uppercase text-fantasy-gold">
          Victory of the Ancient Tome
        </span>

        <h1 className="font-serif text-3xl sm:text-4xl font-black text-fantasy-gold-light mt-1 mb-2">
          {winner.username} Prevails!
        </h1>

        <div className="inline-block px-3 py-1 bg-black/60 rounded-full border border-fantasy-gold/50 text-xs font-mono text-fantasy-parchment mb-6">
          Seat {winner.position} • {matchState.winReason === "NO_VALID_TARGETS" ? "No Valid Opponents Remained" : "Sole Survivor"}
        </div>

        {/* Surviving Cells Showcase */}
        <div className="bg-black/40 border border-fantasy-border/60 rounded-2xl p-4 mb-6">
          <div className="text-xs font-serif uppercase tracking-wider text-fantasy-parchment/70 mb-3">
            Surviving Warrior Cells
          </div>
          <div className="grid grid-cols-5 gap-2 max-w-sm mx-auto">
            {CELL_VALUES.map((val: CellValue) => (
              <StickmanCell
                key={val}
                cell={winner.cells[val]}
                cellValue={val}
              />
            ))}
          </div>
        </div>

        {/* Match Statistics */}
        <div className="grid grid-cols-3 gap-3 bg-fantasy-bg/60 border border-fantasy-border/50 rounded-xl p-3 mb-6 font-mono text-center">
          <div>
            <div className="text-[10px] text-fantasy-parchment/60 uppercase">Total Turns</div>
            <div className="text-lg font-bold text-fantasy-parchment">{matchState.totalTurns}</div>
          </div>
          <div>
            <div className="text-[10px] text-fantasy-parchment/60 uppercase">Winner Kills</div>
            <div className="text-lg font-bold text-fantasy-gold">{winner.kills} ☠️</div>
          </div>
          <div>
            <div className="text-[10px] text-fantasy-parchment/60 uppercase">Surviving Cells</div>
            <div className="text-lg font-bold text-fantasy-parchment">
              {Object.values(winner.cells).filter((c) => !c.destroyed).length} / 5
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onPlayAgain}
            className="w-full sm:w-auto px-6 py-3 bg-fantasy-gold hover:bg-fantasy-gold-light text-black font-serif font-black text-sm rounded-xl transition-all shadow hover:shadow-[0_0_15px_rgba(229,169,60,0.6)] cursor-pointer"
          >
            Play Again (Same Roster)
          </button>
          <button
            onClick={onNewMatch}
            className="w-full sm:w-auto px-6 py-3 bg-fantasy-card hover:bg-fantasy-border/50 text-fantasy-parchment border border-fantasy-border font-serif font-semibold text-sm rounded-xl transition-colors cursor-pointer"
          >
            New Match Setup
          </button>
        </div>
      </div>
    </div>
  );
};
