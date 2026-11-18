import React from "react";
import type { CellState, CellValue } from "@pageshooter/shared";
import { CELL_PROGRESS_LABELS } from "@pageshooter/shared";
import { getCharacter } from "../characters/registry.js";
import { CharacterCellRenderer } from "../characters/components/CharacterCellRenderer.js";

interface StickmanCellProps {
  cell: CellState;
  cellValue: CellValue;
  isShooter?: boolean;
  hasActiveBullet?: boolean;
  isTargetable?: boolean;
  characterId?: string;
  packId?: string;
  onTargetSelect?: (cellValue: CellValue) => void;
}

export const StickmanCell: React.FC<StickmanCellProps> = ({
  cell,
  cellValue,
  hasActiveBullet = false,
  isTargetable = false,
  characterId = "barnaby",
  onTargetSelect
}) => {
  const { progress, destroyed } = cell;
  const character = getCharacter(characterId);

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
      aria-label={`Cell ${cellValue}: ${destroyed ? "Destroyed" : `${character.name} - ${CELL_PROGRESS_LABELS[progress]}`}`}
      className={`
        relative w-full h-full flex flex-col justify-between items-center p-1 sm:p-2 transition-all duration-150 select-none min-w-0
        ${destroyed
          ? "bg-[#F4EDE2]/50 text-cozy-brown/40 cursor-default pointer-events-none"
          : isTargetable
          ? "bg-[#FFE5EC] hover:bg-[#FFCCD5] ring-2 ring-inset ring-[#FF4D6D] hover:scale-[0.98] active:scale-95 cursor-pointer touch-manipulation focus:outline-none focus:ring-4 focus:ring-[#FF4D6D]"
          : hasActiveBullet
          ? "bg-[#FFF3CD] ring-2 ring-inset ring-[#FFB703] text-[#1E1410]"
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
          <span className="inline-flex items-center gap-0.5 font-fredoka font-bold text-[7px] sm:text-[10px] bg-red-100 text-red-700 border border-red-300 px-1 sm:px-1.5 py-0.5 rounded-full shadow-xs flex-shrink-0 animate-pulse">
            <span>🗡️</span>
            <span className="hidden sm:inline">Armed</span>
          </span>
        )}

        {destroyed && (
          <span className="text-[7px] sm:text-[10px] font-fredoka font-bold text-[#C0392B] truncate">
            Poofed (K.O.)
          </span>
        )}
      </div>

      {/* Center: Scaled Hand-Drawn Character SVG */}
      <div className="w-full flex-1 flex items-center justify-center my-0.5 min-h-0">
        <div className="relative w-12 h-16 sm:w-16 sm:h-20 md:w-20 md:h-24 flex items-center justify-center max-w-full">
          <CharacterCellRenderer
            characterId={characterId}
            progress={progress}
            isDestroyed={destroyed}
            hasActiveBullet={hasActiveBullet}
          />
        </div>
      </div>

      {/* Bottom Bar: Character Name + Progression Label */}
      <div className="w-full text-center py-0.5 overflow-hidden">
        <div className="flex flex-col items-center leading-tight">
          <span className="text-[9px] sm:text-[11px] font-fredoka font-bold text-cozy-brown-dark truncate max-w-full">
            {character.name}
          </span>
          <span
            className={`text-[8px] sm:text-[10px] font-fredoka tracking-tight truncate max-w-full ${
              destroyed
                ? "text-cozy-brown/40 line-through"
                : progress === 5
                ? "text-cozy-amber-dark font-bold"
                : isTargetable
                ? "text-cozy-brown-dark font-semibold"
                : "text-cozy-brown/70"
            }`}
          >
            {destroyed ? "Defeated" : CELL_PROGRESS_LABELS[progress]}
          </span>
        </div>
      </div>
    </div>
  );
};
