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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#462B18]/70 backdrop-blur-sm p-4 overflow-y-auto select-none">
      <div className="max-w-xl w-full bg-[#FFFDF9] border-4 border-cozy-gold rounded-3xl p-6 sm:p-8 text-center shadow-[0_20px_60px_rgba(242,184,75,0.35)] my-auto animate-in zoom-in-95 duration-300 relative overflow-hidden">
        {/* Decorative corner leaves and sparkles */}
        <div className="absolute top-3 left-4 text-2xl animate-float">🌿</div>
        <div className="absolute top-3 right-4 text-2xl animate-float" style={{ animationDelay: "1s" }}>🌸</div>
        <div className="absolute bottom-3 left-4 text-2xl">✨</div>
        <div className="absolute bottom-3 right-4 text-2xl">🍃</div>

        {/* Illustrated Crown */}
        <div className="w-20 h-20 mx-auto mb-2 text-5xl flex items-center justify-center rounded-full bg-cozy-gold-light border-3 border-cozy-gold shadow-sm animate-bounce">
          👑
        </div>

        <div className="inline-block px-3 py-1 bg-cozy-gold-light border-2 border-cozy-gold rounded-full text-xs font-fredoka font-bold text-cozy-brown mb-2 shadow-xs">
          STORYBOOK GRAND CHAMPION!
        </div>

        <h1 className="font-fredoka text-3xl sm:text-4xl font-black text-cozy-brown mt-1 mb-1">
          {winner.username} Wins!
        </h1>

        <div className="inline-block px-3 py-1 bg-[#FAF5EB] rounded-full border border-[#D8C7B0] text-xs font-hand text-cozy-brown-light mb-5">
          Seat {winner.position} • {matchState.winReason === "NO_VALID_TARGETS" ? "Sole Armed Storyteller" : "Last Stickman Standing"}
        </div>

        {/* Surviving Cells Shelf */}
        <div className="bg-[#FAF5EB] border-2 border-[#D8C7B0] rounded-2xl p-4 mb-5 shadow-inner">
          <div className="text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown-light mb-3 flex items-center justify-center gap-1.5">
            <span>📚</span>
            <span>Surviving Folio Warriors</span>
          </div>
          <div className="grid grid-cols-5 gap-2 max-w-sm mx-auto">
            {CELL_VALUES.map((val: CellValue) => (
              <div key={val} className="h-28">
                <StickmanCell
                  cell={winner.cells[val]}
                  cellValue={val}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Match Statistics */}
        <div className="grid grid-cols-3 gap-3 bg-[#FAF5EB] border-2 border-[#E2D3BE] rounded-2xl p-3 mb-6 text-center font-fredoka">
          <div>
            <div className="text-[10px] text-cozy-brown-light uppercase font-bold">Total Pages</div>
            <div className="text-lg font-bold text-cozy-brown">{matchState.totalTurns}</div>
          </div>
          <div>
            <div className="text-[10px] text-cozy-brown-light uppercase font-bold">Champion Kills</div>
            <div className="text-lg font-bold text-cozy-gold-dark">{winner.kills} ⭐</div>
          </div>
          <div>
            <div className="text-[10px] text-cozy-brown-light uppercase font-bold">Alive Cells</div>
            <div className="text-lg font-bold text-cozy-brown">
              {Object.values(winner.cells).filter((c) => !c.destroyed).length} / 5
            </div>
          </div>
        </div>

        {/* Rematch & Setup Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={onPlayAgain}
            className="w-full sm:w-auto px-6 py-3 bg-cozy-gold hover:bg-cozy-gold-dark text-cozy-brown font-fredoka font-bold text-sm rounded-full shadow-md transition-all hover:scale-105 active:scale-95 cursor-pointer flex items-center justify-center gap-2"
          >
            <span>Play Rematch</span>
            <span>⭐</span>
          </button>
          <button
            onClick={onNewMatch}
            className="w-full sm:w-auto px-6 py-3 bg-[#FAF5EB] hover:bg-[#F3E8D8] text-cozy-brown border-2 border-[#D8C7B0] font-fredoka font-semibold text-sm rounded-full transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span>New Tournament</span>
            <span>📜</span>
          </button>
        </div>
      </div>
    </div>
  );
};
