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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-brown-dark/50 backdrop-blur-xs p-4 overflow-y-auto select-none">
      <div className="max-w-xl w-full bg-cozy-white border-2 border-cozy-amber rounded-3xl p-6 sm:p-8 text-center shadow-modal my-auto relative">
        {/* Crown Badge */}
        <div className="w-16 h-16 mx-auto mb-2 text-4xl flex items-center justify-center rounded-full bg-cozy-amber-light border border-cozy-amber shadow-xs">
          👑
        </div>

        <div className="inline-block px-3 py-0.5 bg-cozy-amber-light border border-cozy-amber rounded-full text-xs font-fredoka font-bold text-cozy-brown-dark mb-2">
          Storybook Grand Champion
        </div>

        <h1 className="font-fredoka text-3xl sm:text-4xl font-bold text-cozy-brown-dark mt-1 mb-1">
          {winner.username} Wins!
        </h1>

        <div className="inline-block px-3 py-0.5 bg-[#FAF7F0] rounded-full border border-cozy-parchment text-xs font-fredoka text-cozy-brown mb-5">
          Seat {winner.position} • {matchState.winReason === "NO_VALID_TARGETS" ? "Sole Armed Storyteller" : "Last Stickman Standing"}
        </div>

        {/* Surviving Cells Shelf */}
        <div className="bg-[#FAF7F0] border border-cozy-cell-border rounded-2xl p-3.5 mb-4">
          <div className="text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown mb-2">
            Surviving Folio Warriors
          </div>
          <div className="grid grid-cols-5 gap-1 max-w-md mx-auto border border-cozy-cell-border rounded-xl bg-cozy-white p-1">
            {CELL_VALUES.map((val: CellValue) => (
              <div key={val} className="h-32 border-r last:border-r-0 border-cozy-cell-border">
                <StickmanCell
                  cell={winner.cells[val]}
                  cellValue={val}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Match Statistics */}
        <div className="grid grid-cols-3 gap-3 bg-[#FAF7F0] border border-cozy-cell-border rounded-xl p-3 mb-6 text-center font-fredoka">
          <div>
            <div className="text-[10px] text-cozy-brown uppercase font-bold">Total Pages</div>
            <div className="text-lg font-bold text-cozy-brown-dark">{matchState.totalTurns}</div>
          </div>
          <div>
            <div className="text-[10px] text-cozy-brown uppercase font-bold">Champion Kills</div>
            <div className="text-lg font-bold text-cozy-amber-dark">{winner.kills} ⭐</div>
          </div>
          <div>
            <div className="text-[10px] text-cozy-brown uppercase font-bold">Alive Cells</div>
            <div className="text-lg font-bold text-cozy-brown-dark">
              {Object.values(winner.cells).filter((c) => !c.destroyed).length} / 5
            </div>
          </div>
        </div>

        {/* Rematch & Setup Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onPlayAgain}
            className="w-full sm:w-auto px-6 py-2.5 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-sm rounded-full shadow-xs transition-colors cursor-pointer"
          >
            Play Rematch ➔
          </button>
          <button
            onClick={onNewMatch}
            className="w-full sm:w-auto px-6 py-2.5 bg-cozy-white hover:bg-[#FAF7F0] text-cozy-brown border border-cozy-parchment font-fredoka font-semibold text-sm rounded-full transition-colors cursor-pointer"
          >
            New Tournament
          </button>
        </div>
      </div>
    </div>
  );
};
