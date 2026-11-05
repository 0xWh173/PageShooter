import React from "react";
import type { MatchState, CellValue } from "@pageshooter/shared";
import { CELL_VALUES } from "@pageshooter/shared";
import type { MatchVisualConfig } from "../anime/types.js";
import { StickmanCell } from "./StickmanCell.js";

interface BattlefieldProps {
  matchState: MatchState;
  visualConfig?: MatchVisualConfig | null;
  frame?: number;
  onSelectTarget?: (targetPlayerId: string, cellValue: CellValue) => void;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
  matchState,
  visualConfig,
  frame = 0,
  onSelectTarget
}) => {
  const currentTurnPlayerId = matchState.turn.currentPlayerId;
  const isAwaitingShot = matchState.turn.phase === "AWAITING_SHOT" && matchState.turn.pendingShot;
  const activeBulletCell = isAwaitingShot ? matchState.turn.rolledCell : null;

  const numPlayers = matchState.players.length;

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2">
      {/* Outer Gameboard Frame */}
      <div className="bg-cozy-white border-2 border-cozy-parchment rounded-2xl shadow-card overflow-hidden">
        {/* Scrollable Container for 5-10 players */}
        <div className="overflow-x-auto w-full">
          {/* Unified CSS Grid Table */}
          <div
            className="grid min-w-full"
            style={{
              gridTemplateColumns: `80px repeat(${numPlayers}, minmax(130px, 1fr))`
            }}
          >
            {/* ======================================================== */}
            {/* ROW 0: HEADERS (Row Label Corner + Player Headers)       */}
            {/* ======================================================== */}
            
            {/* Pinned Left Corner Header */}
            <div className="sticky left-0 z-20 bg-cozy-parchment border-b-2 border-r-2 border-cozy-brown/30 flex flex-col items-center justify-center p-2 text-center shadow-xs h-[72px] min-h-[72px] max-h-[72px]">
              <span className="font-fredoka font-bold text-xs text-cozy-brown-dark uppercase tracking-wider">
                Folio
              </span>
              <span className="text-[10px] font-fredoka text-cozy-brown">
                Row
              </span>
            </div>

            {/* Player Column Headers */}
            {matchState.players.map((player) => {
              const isCurrentTurn = player.playerId === currentTurnPlayerId;
              const isEliminated = player.status === "ELIMINATED";
              const playerVisual = visualConfig?.playerVisuals[player.playerId];
              const packId = playerVisual?.animePackId || "dragon-ball";

              return (
                <div
                  key={player.playerId}
                  className={`
                    border-b-2 border-r border-cozy-cell-border px-2 py-1.5 flex flex-col items-center justify-center text-center transition-colors duration-150 h-[72px] min-h-[72px] max-h-[72px]
                    ${isEliminated
                      ? "bg-[#EDE4D5]/40 text-cozy-brown/40"
                      : isCurrentTurn
                      ? "bg-cozy-amber-light border-b-cozy-amber"
                      : "bg-[#FAF7F0] text-cozy-brown-dark"
                    }
                  `}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <span
                      className={`
                        font-fredoka text-xs font-bold px-2 py-0.5 rounded-full
                        ${isCurrentTurn
                          ? "bg-cozy-amber text-cozy-brown-dark"
                          : "bg-cozy-parchment text-cozy-brown-dark"
                        }
                      `}
                    >
                      {player.position}
                    </span>
                    {packId === "dragon-ball" && (
                      <span className="text-[9px] font-fredoka bg-orange-100 text-orange-800 font-bold px-1.5 py-0.2 rounded border border-orange-200">
                        DBZ
                      </span>
                    )}
                    {isCurrentTurn && !isEliminated && (
                      <span className="text-xs text-cozy-amber-dark font-bold" title="Current Turn">
                        ⭐
                      </span>
                    )}
                    {isEliminated && (
                      <span className="text-[10px] font-fredoka font-semibold text-cozy-brown/50 bg-[#E8D8C3]/50 px-1.5 rounded">
                        Out
                      </span>
                    )}
                  </div>

                  <div
                    className={`font-fredoka text-xs sm:text-sm font-semibold truncate w-full px-1 text-center ${
                      isEliminated
                        ? "text-cozy-brown/40 line-through"
                        : isCurrentTurn
                        ? "text-cozy-brown-dark font-bold"
                        : "text-cozy-brown-dark"
                    }`}
                    title={player.username}
                  >
                    {player.username}
                  </div>

                  <div className="text-[10px] font-fredoka text-cozy-brown/70 mt-0.5">
                    {player.kills} {player.kills === 1 ? "poof" : "poofs"}
                  </div>
                </div>
              );
            })}

            {/* ======================================================== */}
            {/* ROWS 1 TO 5: THE FIVE CELL VALUES (0, 2, 4, 6, 8)       */}
            {/* ======================================================== */}
            {CELL_VALUES.map((val, rowIdx) => {
              const isLastRow = rowIdx === CELL_VALUES.length - 1;

              return (
                <React.Fragment key={val}>
                  {/* Pinned Left Header for Row Value */}
                  <div
                    className={`
                      sticky left-0 z-10 bg-cozy-parchment border-r-2 border-cozy-brown/30 flex flex-col items-center justify-center p-2 text-center shadow-xs h-[140px] min-h-[140px] max-h-[140px]
                      ${!isLastRow ? "border-b border-cozy-brown/20" : ""}
                    `}
                  >
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-cozy-white/80 border border-cozy-brown/30 font-fredoka font-bold text-xs text-cozy-brown-dark">
                      {val}
                    </span>
                    <span className="text-[10px] font-fredoka font-medium text-cozy-brown/70 mt-1 uppercase">
                      Cell #{val}
                    </span>
                  </div>

                  {/* Player Cells for this Row */}
                  {matchState.players.map((player) => {
                    const isCurrentTurn = player.playerId === currentTurnPlayerId;
                    const isEliminated = player.status === "ELIMINATED";
                    const canBeTargeted = isAwaitingShot && !isCurrentTurn && !isEliminated;
                    const cell = player.cells[val];
                    const hasBullet = isCurrentTurn && activeBulletCell === val;
                    const targetable = canBeTargeted && !cell.destroyed;

                    const playerVisual = visualConfig?.playerVisuals[player.playerId];
                    const packId = playerVisual?.animePackId || "dragon-ball";
                    const characterId = playerVisual?.characterAssignments[val];

                    return (
                      <div
                        key={player.playerId + "_" + val}
                        className={`
                          border-r border-cozy-cell-border h-[140px] min-h-[140px] max-h-[140px] flex items-center justify-center transition-colors duration-150
                          ${!isLastRow ? "border-b border-cozy-cell-border" : ""}
                          ${isEliminated
                            ? "bg-[#EDE4D5]/20"
                            : isCurrentTurn
                            ? "bg-cozy-amber-light/30"
                            : "bg-[#FDFBF7]"
                          }
                        `}
                      >
                        <StickmanCell
                          cell={cell}
                          cellValue={val}
                          isShooter={isCurrentTurn}
                          hasActiveBullet={hasBullet}
                          isTargetable={targetable}
                          packId={packId}
                          characterId={characterId}
                          frame={frame}
                          onTargetSelect={() => {
                            if (onSelectTarget && targetable) {
                              onSelectTarget(player.playerId, val);
                            }
                          }}
                        />
                      </div>
                    );
                  })}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
