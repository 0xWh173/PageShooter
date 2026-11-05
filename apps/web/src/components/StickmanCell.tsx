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
        relative flex flex-col items-center justify-between p-1.5 sm:p-2 rounded-2xl border-2 transition-all duration-200 select-none w-full h-full min-h-[110px]
        ${destroyed
          ? "bg-[#F3ECE0]/60 border-[#D4C3AC] opacity-60 grayscale-[30%]"
          : isTargetable
          ? "bg-cozy-peach/25 border-cozy-coral hover:bg-cozy-peach/40 hover:scale-105 active:scale-95 cursor-pointer touch-manipulation shadow-md animate-pulse"
          : "bg-[#FFFDF9] border-[#E2D3BE] hover:border-[#C4A887] shadow-sm"
        }
        ${hasActiveBullet ? "ring-3 ring-cozy-gold bg-cozy-gold-light/40 shadow-cozy" : ""}
      `}
    >
      {/* Top Header: Badge & Status */}
      <div className="flex items-center justify-between w-full px-1">
        <span className="font-hand text-sm font-bold text-cozy-brown-light">
          #{cellValue}
        </span>
        {hasActiveBullet && (
          <span className="inline-flex items-center gap-0.5 text-[10px] font-fredoka font-bold bg-cozy-gold text-cozy-brown px-1.5 py-0.5 rounded-full shadow-sm animate-bounce">
            <span>⭐</span>
            <span>BULLET</span>
          </span>
        )}
        {destroyed && (
          <span className="text-[10px] font-hand font-bold text-cozy-coral bg-cozy-coral/15 px-1 rounded">
            POOFED
          </span>
        )}
      </div>

      {/* Cozy Hand-drawn Stickman SVG */}
      <div className="relative w-16 h-18 my-0.5 flex items-center justify-center">
        <svg
          viewBox="0 0 100 120"
          className="w-full h-full overflow-visible"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* Base Sketch Pad / Ground Line */}
          <ellipse
            cx="50"
            cy="110"
            rx="20"
            ry="4"
            fill="none"
            stroke="#D8C7B0"
            strokeWidth="2"
            strokeDasharray="3 3"
          />

          {!destroyed && (
            <g stroke="#4A2E1B" strokeWidth="3.5" fill="none">
              {/* STAGE 1: HEAD & SWEET EXPRESSIVE FACE */}
              {progress >= 1 && (
                <g>
                  {/* Head circle with soft pencil fill */}
                  <circle cx="50" cy="28" r="15" fill="#FFFDF9" stroke="#4A2E1B" strokeWidth="3.5" />
                  
                  {/* Blushing peach cheeks */}
                  <circle cx="40" cy="32" r="2.5" fill="#F9A887" stroke="none" />
                  <circle cx="60" cy="32" r="2.5" fill="#F9A887" stroke="none" />

                  {/* Smiling eyes */}
                  <circle cx="43" cy="26" r="1.8" fill="#4A2E1B" stroke="none" />
                  <circle cx="57" cy="26" r="1.8" fill="#4A2E1B" stroke="none" />

                  {/* Happy hand-drawn smile */}
                  <path d="M 45 32 Q 50 36 55 32" stroke="#4A2E1B" strokeWidth="2" fill="none" />

                  {/* Cute hair tuft */}
                  <path d="M 48 13 Q 50 8 52 13" stroke="#4A2E1B" strokeWidth="2.5" fill="none" />
                </g>
              )}

              {/* STAGE 2: TORSO & COZY SCARF */}
              {progress >= 2 && (
                <g>
                  {/* Torso spine */}
                  <line x1="50" y1="43" x2="50" y2="78" strokeWidth="4" />
                  {/* Cute golden scarf / neckerchief */}
                  <path
                    d="M 43 43 C 47 47, 53 47, 57 43 C 58 48, 52 52, 47 50 Z"
                    fill="#F2B84B"
                    stroke="#4A2E1B"
                    strokeWidth="2"
                  />
                  <line x1="51" y1="48" x2="56" y2="56" stroke="#F2B84B" strokeWidth="3" />
                </g>
              )}

              {/* STAGE 3: LEGS */}
              {progress >= 3 && (
                <g>
                  {/* Left Leg with little foot */}
                  <line x1="50" y1="78" x2="36" y2="108" strokeWidth="3.5" />
                  <line x1="36" y1="108" x2="31" y2="108" strokeWidth="3.5" />

                  {/* Right Leg with little foot */}
                  <line x1="50" y1="78" x2="64" y2="108" strokeWidth="3.5" />
                  <line x1="64" y1="108" x2="69" y2="108" strokeWidth="3.5" />
                </g>
              )}

              {/* STAGE 4: ARMS */}
              {progress >= 4 && (
                <g>
                  {/* Left Arm waving happily */}
                  <path d="M 50 52 Q 36 44 26 36" strokeWidth="3.5" />
                  {/* Right Arm */}
                  <line x1="50" y1="52" x2="74" y2="64" strokeWidth="3.5" />
                </g>
              )}

              {/* STAGE 5: PLAYFUL CARTOON BLUNDERBUSS / CORK BLASTER */}
              {progress >= 5 && hasGun && (
                <g>
                  {/* Gun Barrel */}
                  <line x1="72" y1="64" x2="92" y2="54" stroke="#7C5335" strokeWidth="4.5" />
                  {/* Brass Muzzle bell */}
                  <path d="M 90 49 L 96 52 L 96 56 L 90 59 Z" fill="#F2B84B" stroke="#4A2E1B" strokeWidth="1.5" />
                  {/* Wooden stock */}
                  <line x1="66" y1="68" x2="72" y2="64" stroke="#7C5335" strokeWidth="3.5" />
                  {/* Cork string dangle */}
                  <path d="M 96 54 Q 100 62 98 68" stroke="#D8C7B0" strokeWidth="1.5" strokeDasharray="2 2" fill="none" />
                  <ellipse cx="98" cy="70" rx="3" ry="2" fill="#E76F51" stroke="#4A2E1B" strokeWidth="1" />
                </g>
              )}
            </g>
          )}

          {/* DESTROYED STATE: DIZZY EYES & CARTOON CROSSOUT */}
          {destroyed && (
            <g>
              {/* Ghostly pencil outline */}
              <circle cx="50" cy="28" r="14" fill="#FAF5EB" stroke="#A8947E" strokeWidth="2.5" strokeDasharray="3 2" />
              {/* Dizzy X eyes */}
              <g stroke="#E76F51" strokeWidth="2">
                <line x1="41" y1="24" x2="45" y2="28" />
                <line x1="45" y1="24" x2="41" y2="28" />
                <line x1="55" y1="24" x2="59" y2="28" />
                <line x1="59" y1="24" x2="55" y2="28" />
                {/* Wobbly mouth */}
                <path d="M 44 33 Q 47 30 50 33 Q 53 36 56 33" fill="none" />
              </g>
              {/* Playful cartoon poof smoke cloud */}
              <path
                d="M 30 75 Q 24 65 34 58 Q 30 46 44 48 Q 50 38 60 44 Q 72 38 74 52 Q 84 58 78 70 Q 82 82 70 86 Q 64 96 50 90 Q 38 94 34 84 Z"
                fill="#EAE0D0"
                fillOpacity="0.5"
                stroke="#C4B097"
                strokeWidth="2"
              />
              {/* Big friendly crayon cross */}
              <line x1="24" y1="20" x2="76" y2="100" stroke="#E76F51" strokeWidth="3.5" strokeLinecap="round" />
              <line x1="76" y1="20" x2="24" y2="100" stroke="#E76F51" strokeWidth="3.5" strokeLinecap="round" />
            </g>
          )}

          {/* TARGETING RETICLE OVERLAY */}
          {isTargetable && !destroyed && (
            <g className="animate-pulse">
              <circle cx="50" cy="55" r="32" fill="none" stroke="#E76F51" strokeWidth="2" strokeDasharray="4 4" />
              {/* Corner crosshairs */}
              <line x1="50" y1="18" x2="50" y2="26" stroke="#E76F51" strokeWidth="2.5" />
              <line x1="50" y1="84" x2="50" y2="92" stroke="#E76F51" strokeWidth="2.5" />
              <line x1="13" y1="55" x2="21" y2="55" stroke="#E76F51" strokeWidth="2.5" />
              <line x1="79" y1="55" x2="87" y2="55" stroke="#E76F51" strokeWidth="2.5" />
            </g>
          )}
        </svg>
      </div>

      {/* Progress Label */}
      <div className="w-full text-center mt-0.5">
        <span
          className={`text-[11px] font-fredoka font-medium tracking-tight ${
            destroyed
              ? "text-cozy-coral line-through"
              : progress === 5
              ? "text-cozy-gold-dark font-bold"
              : "text-cozy-brown-light"
          }`}
        >
          {CELL_PROGRESS_LABELS[progress]}
        </span>
      </div>

      {/* Target Button Prompt */}
      {isTargetable && !destroyed && (
        <span className="mt-1 text-[10px] font-fredoka font-bold text-white bg-cozy-coral px-2 py-0.5 rounded-full shadow-sm">
          TARGET 🎯
        </span>
      )}
    </div>
  );
};
