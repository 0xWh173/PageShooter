import React from "react";
import type { CellState, CellValue } from "@pageshooter/shared";
import { CELL_PROGRESS_LABELS } from "@pageshooter/shared";

interface StickmanCellProps {
  cell: CellState;
  cellValue: CellValue;
  isShooter?: boolean;
  hasActiveBullet?: boolean;
  isTargetable?: boolean;
  onTargetSelect?: (cellValue: CellValue) => void;
}

export const StickmanCell: React.FC<StickmanCellProps> = ({
  cell,
  cellValue,
  hasActiveBullet = false,
  isTargetable = false,
  onTargetSelect
}) => {
  const { progress, destroyed, hasGun } = cell;

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
        relative flex flex-col items-center justify-between p-1.5 sm:p-2 rounded-lg border transition-all duration-200 select-none min-w-0 w-full min-h-[94px] sm:min-h-[104px]
        ${destroyed
          ? "bg-black/60 border-fantasy-border/40 opacity-40 grayscale"
          : isTargetable
          ? "bg-fantasy-crimson/15 border-fantasy-crimson hover:bg-fantasy-crimson/30 hover:scale-105 active:scale-95 cursor-pointer touch-manipulation shadow-[0_0_12px_rgba(232,58,58,0.4)] animate-pulse"
          : "bg-fantasy-card/80 border-fantasy-border/70 hover:border-fantasy-gold/50 shadow-sm"
        }
        ${hasActiveBullet ? "ring-2 ring-fantasy-gold shadow-[0_0_15px_rgba(229,169,60,0.6)]" : ""}
      `}
    >
      {/* Cell Value Header */}
      <div className="flex items-center justify-between w-full px-1">
        <span className="font-mono text-xs font-bold text-fantasy-gold">
          #{cellValue}
        </span>
        {hasActiveBullet && (
          <span className="inline-flex items-center text-[10px] bg-fantasy-gold text-black font-bold px-1 rounded animate-bounce shadow">
            BULLET
          </span>
        )}
        {destroyed && (
          <span className="text-[10px] text-fantasy-crimson font-mono font-bold">
            DEAD
          </span>
        )}
      </div>

      {/* Stickman SVG Canvas */}
      <div className="relative w-14 h-16 my-1 flex items-center justify-center">
        <svg
          viewBox="0 0 100 120"
          className="w-full h-full overflow-visible"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Base Pedestal / Empty Rune */}
          <ellipse
            cx="50"
            cy="110"
            rx="22"
            ry="6"
            fill="none"
            stroke="currentColor"
            className="text-fantasy-border/40 stroke-1"
          />

          {!destroyed && (
            <g className="stroke-[3.5] stroke-fantasy-parchment">
              {/* STAGE 1: FACE & HEAD */}
              {progress >= 1 && (
                <g className="transition-opacity duration-300">
                  {/* Head outline */}
                  <circle cx="50" cy="24" r="14" fill="#14161D" />
                  {/* Eyes */}
                  <circle cx="45" cy="22" r="1.8" fill="#E5A93C" />
                  <circle cx="55" cy="22" r="1.8" fill="#E5A93C" />
                  {/* Mouth ink curve */}
                  <path d="M 46 29 Q 50 33 54 29" fill="none" stroke="#E5A93C" strokeWidth="1.5" />
                </g>
              )}

              {/* STAGE 2: BODY (Spine) */}
              {progress >= 2 && (
                <line
                  x1="50"
                  y1="38"
                  x2="50"
                  y2="76"
                  className="transition-all duration-300"
                />
              )}

              {/* STAGE 3: LEGS */}
              {progress >= 3 && (
                <g className="transition-opacity duration-300">
                  {/* Left Leg */}
                  <line x1="50" y1="76" x2="32" y2="108" />
                  {/* Right Leg */}
                  <line x1="50" y1="76" x2="68" y2="108" />
                </g>
              )}

              {/* STAGE 4: ARMS */}
              {progress >= 4 && (
                <g className="transition-opacity duration-300">
                  {/* Left Arm */}
                  <line x1="50" y1="48" x2="26" y2="64" />
                  {/* Right Arm */}
                  <line x1="50" y1="48" x2="74" y2="64" />
                </g>
              )}

              {/* STAGE 5: GUN (Blunderbuss) */}
              {progress >= 5 && hasGun && (
                <g className="stroke-[2.5] stroke-fantasy-gold text-fantasy-gold transition-all duration-300">
                  {/* Blunderbuss barrel */}
                  <line x1="74" y1="64" x2="94" y2="52" strokeWidth="4" />
                  {/* Muzzle flare ring */}
                  <circle cx="95" cy="51" r="3.5" fill="#E5A93C" />
                  {/* Stock */}
                  <line x1="68" y1="68" x2="74" y2="64" strokeWidth="3" />
                  {/* Trigger loop */}
                  <path d="M 72 65 Q 75 70 77 66" fill="none" strokeWidth="1.5" />
                </g>
              )}
            </g>
          )}

          {/* DESTROYED OVERLAY: Broken Ink & Crimson X */}
          {destroyed && (
            <g className="stroke-fantasy-crimson stroke-[4] animate-in fade-in">
              <line x1="20" y1="20" x2="80" y2="100" />
              <line x1="80" y1="20" x2="20" y2="100" />
              {/* Ash splatter marks */}
              <circle cx="50" cy="60" r="16" fill="#A82020" fillOpacity="0.2" stroke="none" />
            </g>
          )}

          {/* TARGETING CROSSHAIRS */}
          {isTargetable && !destroyed && (
            <g className="stroke-fantasy-crimson-light stroke-[2]">
              <circle cx="50" cy="55" r="28" fill="none" strokeDasharray="4 3" />
              <line x1="50" y1="22" x2="50" y2="34" />
              <line x1="50" y1="76" x2="50" y2="88" />
              <line x1="17" y1="55" x2="29" y2="55" />
              <line x1="71" y1="55" x2="83" y2="55" />
            </g>
          )}
        </svg>
      </div>

      {/* Progress Label */}
      <div className="w-full text-center mt-1">
        <span
          className={`text-[10px] font-mono tracking-tight ${
            destroyed
              ? "text-fantasy-crimson line-through"
              : progress === 5
              ? "text-fantasy-gold-light font-bold"
              : "text-fantasy-parchment/70"
          }`}
        >
          {CELL_PROGRESS_LABELS[progress]}
        </span>
      </div>

      {/* Target Button Prompt */}
      {isTargetable && !destroyed && (
        <span className="mt-1 text-[9px] uppercase font-bold text-fantasy-crimson-light bg-fantasy-crimson/20 px-1 py-0.5 rounded tracking-wider">
          FIRE HERE
        </span>
      )}
    </div>
  );
};

