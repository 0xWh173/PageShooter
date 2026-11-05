import React from "react";
import type { CellState, CellValue } from "@pageshooter/shared";
import { CELL_PROGRESS_LABELS } from "@pageshooter/shared";
import type { AnimePackId } from "../anime/types.js";
import { getCharacter } from "../anime/registry.js";
import { CharacterCellRenderer } from "../anime/components/CharacterCellRenderer.js";

interface StickmanCellProps {
  cell: CellState;
  cellValue: CellValue;
  isShooter?: boolean;
  hasActiveBullet?: boolean;
  isTargetable?: boolean;
  packId?: AnimePackId;
  characterId?: string;
  frame?: number;
  onTargetSelect?: (cellValue: CellValue) => void;
}

export const StickmanCell: React.FC<StickmanCellProps> = ({
  cell,
  cellValue,
  hasActiveBullet = false,
  isTargetable = false,
  packId,
  characterId,
  frame = 0,
  onTargetSelect
}) => {
  const activePackId: AnimePackId = packId || (characterId ? "dragon-ball" : "classic-stickman");
  const { progress, destroyed } = cell;

  const character = characterId ? getCharacter(activePackId, characterId) : null;

  const handleClick = () => {
    if (isTargetable && !destroyed && onTargetSelect) {
      onTargetSelect(cellValue);
    }
  };

  return (
    <div
      onClick={handleClick}
      role={isTargetable ? "button" : undefined}
      tabIndex={isTargetable ? 0 : undefined}
      aria-label={`Cell ${cellValue}: ${destroyed ? "Destroyed" : CELL_PROGRESS_LABELS[progress]}`}
      className={`
        relative w-full h-full flex flex-col justify-between items-center p-1 sm:p-2 transition-all duration-150 select-none min-w-0
        ${destroyed
          ? "bg-[#F4EDE2]/50 text-cozy-brown/40 cursor-default pointer-events-none"
          : isTargetable
          ? "bg-transparent hover:bg-[#FAF1EC] hover:ring-2 hover:ring-inset hover:ring-cozy-peach/70 cursor-pointer touch-manipulation focus:outline-none focus:ring-2 focus:ring-inset focus:ring-cozy-peach active:bg-[#F2DCD3]"
          : "bg-transparent text-cozy-brown-dark"
        }
      `}
    >
      {/* Top Bar: Cell Number & Bullet Badge */}
      <div className="w-full flex items-center justify-between px-0.5 sm:px-1 text-[8px] sm:text-[11px] leading-none min-w-0">
        <span className="font-mono font-bold text-cozy-brown/70 flex-shrink-0">
          #{cellValue}
        </span>

        {hasActiveBullet && (
          <span className="inline-flex items-center gap-0.5 font-fredoka font-semibold text-[7px] sm:text-[10px] bg-cozy-amber text-cozy-brown-dark px-1 sm:px-1.5 py-0.5 rounded-full shadow-xs flex-shrink-0">
            <span>⭐</span>
            <span className="hidden sm:inline">Bullet</span>
          </span>
        )}

        {destroyed && (
          <span className="text-[7px] sm:text-[10px] font-fredoka font-medium text-cozy-brown/50 truncate">
            {activePackId === "dragon-ball" ? "KO" : "Poofed"}
          </span>
        )}
      </div>

      {/* Center: Scaled Character Artwork */}
      <div className="w-full flex-1 flex items-center justify-center my-0.5 min-h-0">
        <div className="relative w-10 h-14 sm:w-16 sm:h-20 md:w-20 md:h-24 flex items-center justify-center max-w-full">
          <CharacterCellRenderer
            packId={activePackId}
            characterId={characterId || "classic-stickman"}
            progress={progress}
            isDestroyed={destroyed}
            hasActiveBullet={hasActiveBullet}
            frame={frame}
            showAura={hasActiveBullet || progress === 5}
          />
        </div>
      </div>

      {/* Bottom Bar: Character Name + Progression Label */}
      <div className="w-full text-center py-0.5 overflow-hidden">
        {character && activePackId === "dragon-ball" ? (
          <div className="flex flex-col items-center leading-tight">
            <span className="text-[9px] sm:text-[10px] font-fredoka font-bold text-cozy-brown-dark truncate max-w-full">
              {character.name}
            </span>
            <span
              className={`text-[8px] sm:text-[10px] font-fredoka tracking-tight truncate max-w-full ${
                destroyed
                  ? "text-cozy-brown/40 line-through"
                  : progress === 5
                  ? "text-cozy-amber-dark font-bold"
                  : "text-cozy-brown/70"
              }`}
            >
              {destroyed ? "Defeated" : CELL_PROGRESS_LABELS[progress]}
            </span>
          </div>
        ) : (
          <span
            className={`text-[9px] sm:text-[11px] font-fredoka font-medium tracking-tight truncate block px-0.5 ${
              destroyed
                ? "text-cozy-brown/40 line-through"
                : progress === 5
                ? "text-cozy-amber-dark font-bold"
                : isTargetable
                ? "text-cozy-brown-dark font-semibold"
                : "text-cozy-brown/80"
            }`}
          >
            {CELL_PROGRESS_LABELS[progress]}
          </span>
        )}
      </div>
    </div>
  );
};
