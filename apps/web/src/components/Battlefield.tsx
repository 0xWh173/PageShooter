import React from "react";
import type { MatchState, CellValue } from "@pageshooter/shared";
import { CELL_VALUES } from "@pageshooter/shared";
import type { MatchCharacterConfig } from "../characters/types.js";
import { StickmanCell } from "./StickmanCell.js";

interface BattlefieldProps {
  matchState: MatchState;
  characterConfig?: MatchCharacterConfig | null;
  onSelectTarget?: (targetPlayerId: string, cellValue: CellValue) => void;
  interactiveTargeting?: boolean;
}

export const Battlefield: React.FC<BattlefieldProps> = ({
  matchState,
  characterConfig,
  onSelectTarget,
  interactiveTargeting = true
}) => {
  const currentTurnPlayerId = matchState.turn.currentPlayerId;
  const isAwaitingShot = matchState.turn.phase === "AWAITING_SHOT" && matchState.turn.pendingShot;
  const activeBulletCell = isAwaitingShot ? matchState.turn.rolledCell : null;

  const numPlayers = matchState.players.length;

  return (
    <div className="w-full max-w-7xl mx-auto px-2 sm:px-4 py-2">
      {/* Outer Graphic-Novel Comic Page Grid Frame (Warm Vintage Newsprint) */}
      <div className="cartoon-card-lg bg-[#FAF4E6] overflow-hidden">
        {/* Scrollable Container for 5-10 players */}
        <div className="overflow-x-auto w-full">
          {/* Unified CSS Grid Table */}
          <div
            className="grid min-w-full"
            style={{
              gridTemplateColumns: `84px repeat(${numPlayers}, minmax(134px, 1fr))`
            }}
          >
            {/* ======================================================== */}
            {/* ROW 0: HEADERS (Row Label Corner + Player Headers)       */}
            {/* ======================================================== */}
            
            {/* Pinned Left Corner Header */}
            <div className="sticky left-0 z-20 bg-[#1C1917] border-b-4 border-r-4 border-[#1C1917] flex flex-col items-center justify-center p-2 text-center h-[74px] min-h-[74px] max-h-[74px]">
              <span className="font-bangers text-sm text-[#E5C467] uppercase tracking-widest">
                Folio
              </span>
              <span className="text-[10px] font-mono font-bold text-[#FAF4E6]/80 uppercase">
                Panel
              </span>
            </div>

            {/* Player Column Headers */}
            {matchState.players.map((player) => {
              const isCurrentTurn = player.playerId === currentTurnPlayerId;
              const isEliminated = player.status === "ELIMINATED";

              return (
                <div
                  key={player.playerId}
                  className={`
                    border-b-4 border-r-2 border-[#1C1917] px-2 py-1.5 flex flex-col items-center justify-center text-center transition-colors duration-150 h-[74px] min-h-[74px] max-h-[74px]
                    ${isEliminated
                      ? "bg-[#D8CFC0] text-[#1C1917]/45"
                      : isCurrentTurn
                      ? "bg-[#E5C467] text-[#1C1917]"
                      : "bg-[#EFE6D0] text-[#1C1917]"
                    }
                  `}
                >
                  <div className="flex items-center justify-center gap-1.5 mb-0.5">
                    <span
                      className={`
                        font-bangers tracking-wider text-xs px-2 py-0.5 -skew-x-6 border border-[#1C1917]
                        ${isCurrentTurn
                          ? "bg-[#1C1917] text-[#E5C467]"
                          : "bg-[#C85A48] text-[#FAF4E6]"
                        }
                      `}
                    >
                      {player.position}
                    </span>
                    {isCurrentTurn && !isEliminated && (
                      <span className="text-xs font-bold" title="Current Turn">
                        ⭐
                      </span>
                    )}
                    {isEliminated && (
                      <span className="text-[10px] font-bangers tracking-wider text-[#FAF4E6] bg-[#1C1917] px-1.5">
                        Out
                      </span>
                    )}
                    {!isEliminated && player.connected === false && (
                      <span
                        className="text-[10px] font-bangers tracking-wider text-[#1C1917] bg-[#E5C467] px-1.5"
                        title="Player disconnected"
                      >
                        Offline
                      </span>
                    )}
                  </div>

                  <div
                    className={`font-bangers tracking-wider text-sm sm:text-base truncate w-full px-1 text-center uppercase ${
                      isEliminated
                        ? "text-[#1C1917]/45 line-through"
                        : "text-[#1C1917]"
                    }`}
                    title={player.username}
                  >
                    {player.username}
                  </div>

                  <div className="text-[10px] font-mono font-bold mt-0.5 text-[#1C1917]/75">
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
                      sticky left-0 z-10 bg-[#1C1917] border-r-4 border-[#1C1917] flex flex-col items-center justify-center p-2 text-center h-[144px] min-h-[144px] max-h-[144px]
                      ${!isLastRow ? "border-b-2 border-[#FAF4E6]/20" : ""}
                    `}
                  >
                    <span className="inline-flex items-center justify-center w-8 h-8 bg-[#E5C467] border-2 border-[#FAF4E6] shadow-[2px_2px_0_#C85A48] font-bangers text-base text-[#1C1917] -rotate-3">
                      {val}
                    </span>
                    <span className="text-[10px] font-bangers tracking-wider text-[#FAF4E6] mt-1.5 uppercase">
                      Cell #{val}
                    </span>
                  </div>

                  {/* Player Cells for this Row */}
                  {matchState.players.map((player) => {
                    const isCurrentTurn = player.playerId === currentTurnPlayerId;
                    const isEliminated = player.status === "ELIMINATED";
                    const canBeTargeted =
                      interactiveTargeting && isAwaitingShot && !isCurrentTurn && !isEliminated;
                    const cell = player.cells[val];
                    const hasBullet = isCurrentTurn && activeBulletCell === val;
                    const targetable = canBeTargeted && !cell.destroyed;

                    const playerConfig = characterConfig?.playerCharacters[player.playerId];
                    const characterId = playerConfig?.characterAssignments[val] || "barnaby";

                    return (
                      <div
                        key={player.playerId + "_" + val}
                        className={`
                          border-r-2 border-[#1C1917] h-[144px] min-h-[144px] max-h-[144px] flex items-center justify-center transition-colors duration-150
                          ${!isLastRow ? "border-b-2 border-[#1C1917]" : ""}
                          ${isEliminated
                            ? "bg-[#DFD7C8]/60"
                            : isCurrentTurn
                            ? "bg-[#F3E8C6]/65"
                            : "bg-[#FAF4E6]"
                          }
                        `}
                      >
                        <StickmanCell
                          cell={cell}
                          cellValue={val}
                          isShooter={isCurrentTurn}
                          hasActiveBullet={hasBullet}
                          isTargetable={targetable}
                          characterId={characterId}
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
