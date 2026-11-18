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
        relative w-full h-full flex flex-col justify-between items-center p-1 sm:p-1.5 transition-all duration-150 select-none min-w-0 overflow-hidden
        ${destroyed
          ? "bg-[#DFD7C8] text-[#1C1917]/45 cursor-default pointer-events-none"
          : isTargetable
          ? "bg-[#F5D6D2] hover:bg-[#EFC1BB] ring-3 ring-inset ring-[#C85A48] hover:scale-[0.98] active:scale-95 cursor-pointer touch-manipulation focus:outline-none"
          : hasActiveBullet
          ? "bg-[#E5C467]/75 ring-3 ring-inset ring-[#1C1917] text-[#1C1917]"
          : progress === 5
          ? "bg-[#EFE3B8] ring-2 ring-inset ring-[#C85A48] text-[#1C1917]"
          : "bg-transparent text-[#1C1917]"
        }
      `}
    >
      {/* Subtle Ben-Day Halftone Corner Texture for Active Inked Panels */}
      {!destroyed && progress > 0 && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-[0.06]"
          style={{
            backgroundImage: "radial-gradient(#1C1917 1.3px, transparent 1.4px)",
            backgroundSize: "9px 9px"
          }}
        />
      )}

      {/* Top Comic Panel Strip: Skewed Issue Number Tag & Status Callout */}
      <div className="relative z-10 w-full flex items-center justify-between px-0.5 sm:px-1 text-[8px] sm:text-[11px] leading-none min-w-0">
        <span className="font-bangers tracking-wider text-[10px] sm:text-xs bg-[#1C1917] text-[#E5C467] px-1.5 py-0.5 -skew-x-6 border border-[#1C1917] flex-shrink-0">
          #{cellValue}
        </span>

        {hasActiveBullet && (
          <span className="inline-flex items-center gap-0.5 font-bangers tracking-wider text-[9px] sm:text-[11px] bg-[#C85A48] text-[#FAF4E6] border-2 border-[#1C1917] shadow-[2px_2px_0_#1C1917] px-1.5 py-0.5 -skew-x-6 flex-shrink-0 animate-pulse">
            <span>🗡️</span>
            <span className="hidden sm:inline">Armed!</span>
          </span>
        )}

        {!hasActiveBullet && isTargetable && !destroyed && (
          <span className="inline-flex items-center gap-0.5 font-bangers tracking-wider text-[9px] sm:text-[10px] bg-[#C85A48] text-[#FAF4E6] border border-[#1C1917] px-1.5 py-0.5 -skew-x-6 flex-shrink-0">
            🎯 HIT!
          </span>
        )}

        {destroyed && (
          <span className="text-[8px] sm:text-[10px] font-bangers tracking-wider bg-[#C85A48] text-[#FAF4E6] border border-[#1C1917] px-1.5 py-0.5 -skew-x-6 truncate">
            Poofed (K.O.)
          </span>
        )}
      </div>

      {/* Center: Comical Graphic-Novel Duellist Character SVG */}
      <div className="relative z-10 w-full flex-1 flex items-center justify-center my-0.5 min-h-0">
        <div className="relative w-12 h-16 sm:w-16 sm:h-20 md:w-20 md:h-24 flex items-center justify-center max-w-full">
          <CharacterCellRenderer
            characterId={characterId}
            progress={progress}
            isDestroyed={destroyed}
            hasActiveBullet={hasActiveBullet}
          />
        </div>
      </div>

      {/* Bottom Comic Caption Strip: Character Name + Progression Stage */}
      <div className="relative z-10 w-full text-center pt-0.5 overflow-hidden">
        <div className="flex flex-col items-center leading-tight bg-[#EFE6D0] text-[#1C1917] px-1 py-0.5 border border-[#1C1917]">
          <span className="text-[9px] sm:text-[11px] font-bangers tracking-wider text-[#1C1917] truncate max-w-full uppercase">
            {character.name}
          </span>
          <span
            className={`text-[8px] sm:text-[10px] font-mono font-bold tracking-tight truncate max-w-full uppercase ${
              destroyed
                ? "text-[#C85A48] line-through"
                : progress === 5
                ? "text-[#9E3526]"
                : isTargetable
                ? "text-[#9E3526]"
                : "text-[#1C1917]/75"
            }`}
          >
            {destroyed ? "Defeated" : CELL_PROGRESS_LABELS[progress]}
          </span>
        </div>
      </div>
    </div>
  );
};
