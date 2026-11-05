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
        relative w-full h-full flex flex-col justify-between items-center p-2 transition-colors duration-150 select-none
        ${destroyed
          ? "bg-[#F4EDE2]/50 text-cozy-brown/40"
          : isTargetable
          ? "bg-cozy-peach-light hover:bg-[#F2DCD3] cursor-pointer touch-manipulation focus:outline-none focus:ring-2 focus:ring-cozy-peach"
          : "bg-transparent text-cozy-brown-dark"
        }
      `}
    >
      {/* Top Bar: Cell Number & Bullet Badge */}
      <div className="w-full flex items-center justify-between px-1 text-[11px] leading-none">
        <span className="font-mono font-bold text-cozy-brown/70">
          #{cellValue}
        </span>

        {hasActiveBullet && (
          <span className="inline-flex items-center gap-1 font-fredoka font-semibold text-[10px] bg-cozy-amber text-cozy-brown-dark px-1.5 py-0.5 rounded-full shadow-xs">
            <span>⭐</span>
            <span>Bullet</span>
          </span>
        )}

        {destroyed && (
          <span className="text-[10px] font-fredoka font-medium text-cozy-brown/50">
            Poofed
          </span>
        )}
      </div>

      {/* Center: Scaled Stickman Artwork (occupies 45-55% of cell height) */}
      <div className="w-full flex-1 flex items-center justify-center my-0.5">
        <div className="relative w-16 h-18 sm:w-20 sm:h-20 flex items-center justify-center">
          <svg
            viewBox="0 0 100 120"
            className="w-full h-full overflow-visible"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Base Pedestal / Ground Line */}
            <ellipse
              cx="50"
              cy="112"
              rx="24"
              ry="4"
              fill="none"
              stroke="#D4C5B3"
              strokeWidth="2"
              strokeDasharray="3 3"
            />

            {!destroyed && (
              <g stroke="#75685C" strokeWidth="3.5" fill="none">
                {/* STAGE 1: HEAD & SWEET EXPRESSIVE FACE */}
                {progress >= 1 && (
                  <g>
                    {/* Head circle with soft ivory fill */}
                    <circle cx="50" cy="28" r="16" fill="#FDFBF7" stroke="#75685C" strokeWidth="3.5" />
                    
                    {/* Blushing peach cheeks */}
                    <circle cx="39" cy="32" r="2.5" fill="#E8B5A5" stroke="none" />
                    <circle cx="61" cy="32" r="2.5" fill="#E8B5A5" stroke="none" />

                    {/* Smiling eyes */}
                    <circle cx="43" cy="26" r="2" fill="#75685C" stroke="none" />
                    <circle cx="57" cy="26" r="2" fill="#75685C" stroke="none" />

                    {/* Gentle smile */}
                    <path d="M 45 32 Q 50 36 55 32" stroke="#75685C" strokeWidth="2" fill="none" />

                    {/* Hair tuft */}
                    <path d="M 48 12 Q 50 7 52 12" stroke="#75685C" strokeWidth="2.5" fill="none" />
                  </g>
                )}

                {/* STAGE 2: TORSO & COZY SCARF */}
                {progress >= 2 && (
                  <g>
                    {/* Torso spine */}
                    <line x1="50" y1="44" x2="50" y2="80" strokeWidth="4" />
                    {/* Soft amber scarf */}
                    <path
                      d="M 42 44 C 46 48, 54 48, 58 44 C 59 49, 53 53, 47 51 Z"
                      fill="#D9AA61"
                      stroke="#75685C"
                      strokeWidth="2"
                    />
                    <line x1="51" y1="49" x2="56" y2="58" stroke="#D9AA61" strokeWidth="3" />
                  </g>
                )}

                {/* STAGE 3: LEGS */}
                {progress >= 3 && (
                  <g>
                    {/* Left Leg */}
                    <line x1="50" y1="80" x2="35" y2="110" strokeWidth="3.5" />
                    <line x1="35" y1="110" x2="29" y2="110" strokeWidth="3.5" />

                    {/* Right Leg */}
                    <line x1="50" y1="80" x2="65" y2="110" strokeWidth="3.5" />
                    <line x1="65" y1="110" x2="71" y2="110" strokeWidth="3.5" />
                  </g>
                )}

                {/* STAGE 4: ARMS */}
                {progress >= 4 && (
                  <g>
                    {/* Left Arm waving */}
                    <path d="M 50 54 Q 35 45 24 36" strokeWidth="3.5" />
                    {/* Right Arm */}
                    <line x1="50" y1="54" x2="75" y2="66" strokeWidth="3.5" />
                  </g>
                )}

                {/* STAGE 5: PLAYFUL BLUNDERBUSS / CORK BLASTER */}
                {progress >= 5 && hasGun && (
                  <g>
                    {/* Barrel */}
                    <line x1="73" y1="66" x2="94" y2="56" stroke="#8C6548" strokeWidth="4.5" />
                    {/* Brass Muzzle */}
                    <path d="M 92 51 L 98 54 L 98 58 L 92 61 Z" fill="#D9AA61" stroke="#75685C" strokeWidth="1.5" />
                    {/* Stock */}
                    <line x1="67" y1="70" x2="73" y2="66" stroke="#8C6548" strokeWidth="3.5" />
                    {/* Dangling cork */}
                    <path d="M 98 56 Q 102 64 100 70" stroke="#C4B097" strokeWidth="1.5" strokeDasharray="2 2" fill="none" />
                    <ellipse cx="100" cy="72" rx="3" ry="2" fill="#E8B5A5" stroke="#75685C" strokeWidth="1" />
                  </g>
                )}
              </g>
            )}

            {/* DESTROYED STATE */}
            {destroyed && (
              <g>
                {/* Faint head outline */}
                <circle cx="50" cy="28" r="15" fill="#F4EDE2" stroke="#B0A08E" strokeWidth="2" strokeDasharray="3 3" />
                {/* Dizzy X eyes */}
                <g stroke="#A77B59" strokeWidth="2">
                  <line x1="41" y1="24" x2="45" y2="28" />
                  <line x1="45" y1="24" x2="41" y2="28" />
                  <line x1="55" y1="24" x2="59" y2="28" />
                  <line x1="59" y1="24" x2="55" y2="28" />
                  <path d="M 45 33 Q 50 31 55 33" fill="none" />
                </g>
                {/* Soft pencil poof cloud */}
                <path
                  d="M 32 75 Q 26 65 36 58 Q 32 46 46 48 Q 52 38 62 44 Q 74 38 76 52 Q 86 58 80 70 Q 84 82 72 86 Q 66 96 52 90 Q 40 94 36 84 Z"
                  fill="#EDE3D5"
                  fillOpacity="0.6"
                  stroke="#C4B097"
                  strokeWidth="1.5"
                />
                {/* Crayon Cross-out Lines */}
                <line x1="22" y1="18" x2="78" y2="104" stroke="#A77B59" strokeWidth="3" strokeLinecap="round" />
                <line x1="78" y1="18" x2="22" y2="104" stroke="#A77B59" strokeWidth="3" strokeLinecap="round" />
              </g>
            )}

            {/* TARGETING RETICLE */}
            {isTargetable && !destroyed && (
              <g stroke="#E8B5A5" strokeWidth="2">
                <circle cx="50" cy="56" r="34" fill="none" strokeDasharray="4 4" />
                <line x1="50" y1="16" x2="50" y2="24" />
                <line x1="50" y1="88" x2="50" y2="96" />
                <line x1="10" y1="56" x2="18" y2="56" />
                <line x1="82" y1="56" x2="90" y2="56" />
              </g>
            )}
          </svg>
        </div>
      </div>

      {/* Bottom Bar: Progression Label or Target Prompt */}
      <div className="w-full text-center py-0.5">
        {isTargetable && !destroyed ? (
          <span className="inline-block text-[10px] font-fredoka font-semibold text-cozy-brown-dark bg-[#F2D0C6] px-2 py-0.5 rounded-full border border-cozy-peach">
            Target
          </span>
        ) : (
          <span
            className={`text-[11px] font-fredoka font-medium tracking-tight ${
              destroyed
                ? "text-cozy-brown/40 line-through"
                : progress === 5
                ? "text-cozy-amber-dark font-bold"
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
