import React from "react";
import type { MatchState, CellValue } from "@pageshooter/shared";
import { CELL_VALUES } from "@pageshooter/shared";
import { StickmanCell } from "./StickmanCell.js";

interface BattlefieldProps {
  matchState: MatchState;
  onSelectTarget?: (targetPlayerId: string, cellValue: CellValue) => void;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
  matchState,
  onSelectTarget
}) => {
  const currentTurnPlayerId = matchState.turn.currentPlayerId;
  const isAwaitingShot = matchState.turn.phase === "AWAITING_SHOT" && matchState.turn.pendingShot;
  const activeBulletCell = isAwaitingShot ? matchState.turn.rolledCell : null;

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2">
      {/* Battlefield Frame */}
      <div className="bg-[#FFFDF9] border-2 border-[#D8C7B0] rounded-3xl p-3 sm:p-5 shadow-cozy-lg relative overflow-hidden">
        {/* Decorative corner leaves / doodles */}
        <div className="absolute top-2 left-3 text-xs opacity-40 select-none">🌿 ✦</div>
        <div className="absolute top-2 right-3 text-xs opacity-40 select-none">✦ 🌸</div>

        {/* Header subtitle */}
        <div className="flex items-center justify-between mb-3 px-2 border-b border-[#EADCC9] pb-2">
          <div className="flex items-center gap-2">
            <span className="text-lg">📋</span>
            <span className="font-fredoka font-semibold text-cozy-brown text-sm sm:text-base">
              The Grand Stickman Matrix
            </span>
          </div>
          <div className="text-xs font-hand text-cozy-brown-light">
            ← Scroll horizontally to view all seats →
          </div>
        </div>

        {/* Scrollable Matrix Table */}
        <div className="overflow-x-auto pb-3 pt-1">
          <div className="inline-block min-w-full align-middle">
            <table className="border-collapse table-fixed select-none">
              <thead>
                <tr>
                  {/* Top-Left Corner Header (Row Index Header) */}
                  <th className="sticky left-0 z-20 bg-[#F5ECDC] border-2 border-[#D8C7B0] rounded-tl-2xl p-2 w-20 sm:w-24 text-center shadow-sm">
                    <span className="font-fredoka font-bold text-xs text-cozy-brown uppercase tracking-wider block">
                      Folio #
                    </span>
                    <span className="text-[10px] font-hand text-cozy-brown-light block">
                      (Row)
                    </span>
                  </th>

                  {/* Player Column Headers */}
                  {matchState.players.map((player) => {
                    const isCurrentTurn = player.playerId === currentTurnPlayerId;
                    const isEliminated = player.status === "ELIMINATED";

                    return (
                      <th
                        key={player.playerId}
                        className={`
                          border-2 p-2 sm:p-2.5 transition-all duration-300 w-32 sm:w-36 text-center
                          ${isEliminated
                            ? "bg-[#F0E6D6]/60 border-[#D8C7B0] opacity-50"
                            : isCurrentTurn
                            ? "bg-cozy-gold-light border-cozy-gold shadow-md"
                            : "bg-[#FAF5EB] border-[#D8C7B0]"
                          }
                        `}
                      >
                        {/* Position Badge & Status */}
                        <div className="flex items-center justify-center gap-1.5 mb-1">
                          <span
                            className={`
                              font-fredoka text-xs font-bold px-2 py-0.5 rounded-full shadow-xs
                              ${isCurrentTurn
                                ? "bg-cozy-gold text-cozy-brown"
                                : "bg-[#E6D7C3] text-cozy-brown"
                              }
                            `}
                          >
                            {player.position}
                          </span>
                          {isCurrentTurn && !isEliminated && (
                            <span className="text-xs animate-bounce" title="Active turn">
                              ⭐
                            </span>
                          )}
                          {isEliminated && (
                            <span className="text-[10px] font-fredoka font-bold text-cozy-coral bg-cozy-coral/15 px-1.5 py-0.2 rounded">
                              OUT
                            </span>
                          )}
                        </div>

                        {/* Player Name */}
                        <div
                          className={`font-fredoka text-xs sm:text-sm font-semibold truncate px-1 ${
                            isEliminated
                              ? "text-cozy-brown-light line-through"
                              : isCurrentTurn
                              ? "text-cozy-brown font-bold"
                              : "text-cozy-brown"
                          }`}
                          title={player.username}
                        >
                          {player.username}
                        </div>

                        {/* Kills Counter */}
                        <div className="text-[10px] font-hand text-cozy-brown-light mt-0.5">
                          {player.kills} {player.kills === 1 ? "poof" : "poofs"} ⭐
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>

              <tbody>
                {CELL_VALUES.map((val) => (
                  <tr key={val} className="h-32 sm:h-36">
                    {/* Fixed Left Header for Row (Cell 0, 2, 4, 6, 8) */}
                    <th className="sticky left-0 z-10 bg-[#F5ECDC] border-2 border-[#D8C7B0] p-2 text-center align-middle shadow-sm">
                      <div className="flex flex-col items-center justify-center">
                        <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-cozy-gold/25 border-2 border-cozy-gold/50 font-fredoka font-bold text-sm text-cozy-brown shadow-xs">
                          {val}
                        </span>
                        <span className="text-[10px] font-hand font-bold text-cozy-brown-light mt-1 uppercase tracking-tight">
                          Cell #{val}
                        </span>
                      </div>
                    </th>

                    {/* Matrix Cells Across All Players */}
                    {matchState.players.map((player) => {
                      const isCurrentTurn = player.playerId === currentTurnPlayerId;
                      const isEliminated = player.status === "ELIMINATED";
                      const canBeTargeted = isAwaitingShot && !isCurrentTurn && !isEliminated;
                      const cell = player.cells[val];
                      const hasBullet = isCurrentTurn && activeBulletCell === val;
                      const targetable = canBeTargeted && !cell.destroyed;

                      return (
                        <td
                          key={player.playerId + "_" + val}
                          className={`
                            border-2 p-1.5 sm:p-2 align-middle transition-colors duration-200
                            ${isEliminated
                              ? "bg-[#F3EAE0]/40 border-[#E2D4C2]"
                              : isCurrentTurn
                              ? "bg-cozy-gold-light/25 border-cozy-gold/50"
                              : "bg-[#FFFDF9] border-[#E8DAC8]"
                            }
                          `}
                        >
                          <StickmanCell
                            cell={cell}
                            cellValue={val}
                            isShooter={isCurrentTurn}
                            hasActiveBullet={hasBullet}
                            isTargetable={targetable}
                            onTargetSelect={() => {
                              if (onSelectTarget && targetable) {
                                onSelectTarget(player.playerId, val);
                              }
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
