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
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-4">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {matchState.players.map((player) => {
          const isCurrentTurn = player.playerId === currentTurnPlayerId;
          const isEliminated = player.status === "ELIMINATED";
          const canBeTargeted = isAwaitingShot && !isCurrentTurn && !isEliminated;

          return (
            <div
              key={player.playerId}
              className={`
                relative flex flex-col rounded-xl border p-3 transition-all duration-300
                ${isEliminated
                  ? "bg-black/50 border-fantasy-border/30 opacity-45"
                  : isCurrentTurn
                  ? "bg-fantasy-card border-fantasy-gold shadow-[0_0_20px_rgba(229,169,60,0.3)] ring-1 ring-fantasy-gold/50"
                  : "bg-fantasy-card/90 border-fantasy-border/60 hover:border-fantasy-border"
                }
              `}
            >
              {/* Player Header */}
              <div className="flex items-center justify-between border-b border-fantasy-border/50 pb-2 mb-3">
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className={`
                      font-mono text-xs font-black px-2 py-0.5 rounded
                      ${isCurrentTurn
                        ? "bg-fantasy-gold text-black shadow-sm font-bold"
                        : "bg-fantasy-border/60 text-fantasy-parchment"
                      }
                    `}
                  >
                    {player.position}
                  </span>
                  <span
                    className={`font-serif text-sm font-semibold truncate ${
                      isEliminated
                        ? "text-fantasy-parchment/40 line-through"
                        : isCurrentTurn
                        ? "text-fantasy-gold-light"
                        : "text-fantasy-parchment"
                    }`}
                    title={player.username}
                  >
                    {player.username}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Kills Badge */}
                  <span
                    className="text-[11px] font-mono text-fantasy-parchment/70 bg-fantasy-bg/80 px-1.5 py-0.5 rounded border border-fantasy-border/40"
                    title="Destroyed opponent cells"
                  >
                    {player.kills} ☠️
                  </span>

                  {/* Status Indicator */}
                  {isEliminated && (
                    <span className="text-[10px] font-mono font-bold text-fantasy-crimson bg-fantasy-crimson/15 px-1.5 py-0.5 rounded border border-fantasy-crimson/30">
                      FALLEN
                    </span>
                  )}
                  {isCurrentTurn && !isEliminated && (
                    <span className="text-[10px] font-mono font-bold text-black bg-fantasy-gold px-1.5 py-0.5 rounded animate-pulse">
                      ACTIVE
                    </span>
                  )}
                </div>
              </div>

              {/* Stickman Cells Row */}
              <div className="grid grid-cols-5 gap-1.5">
                {CELL_VALUES.map((val) => {
                  const cell = player.cells[val];
                  const hasBullet = isCurrentTurn && activeBulletCell === val;
                  const targetable = canBeTargeted && !cell.destroyed;

                  return (
                    <StickmanCell
                      key={val}
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
                  );
                })}
              </div>

              {/* Eliminated Overlay Banner */}
              {isEliminated && (
                <div className="absolute inset-0 bg-black/60 rounded-xl flex items-center justify-center pointer-events-none">
                  <div className="text-center px-4 py-2 border border-fantasy-crimson/40 bg-black/85 rounded-lg shadow-lg">
                    <span className="text-fantasy-crimson font-serif font-black tracking-widest text-sm uppercase">
                      ELIMINATED
                    </span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
