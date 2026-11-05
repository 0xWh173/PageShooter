import React from "react";
import type { CellProgress } from "@pageshooter/shared";
import type { AnimePackId } from "../types.js";
import { DragonBallSprite } from "../sprites/DragonBallSprite.js";

interface CharacterCellRendererProps {
  packId: AnimePackId;
  characterId: string;
  progress: CellProgress;
  isDestroyed?: boolean;
  hasActiveBullet?: boolean;
  animationState?: "idle" | "stance" | "charge" | "fire" | "hit" | "defeat";
  frame?: number;
  className?: string;
  showAura?: boolean;
}

export const CharacterCellRenderer: React.FC<CharacterCellRendererProps> = ({
  packId,
  characterId,
  progress,
  isDestroyed = false,
  hasActiveBullet = false,
  animationState = "idle",
  frame = 0,
  className = "w-full h-full",
  showAura = false
}) => {
  try {
    if (packId === "dragon-ball") {
      return (
        <DragonBallSprite
          characterId={characterId}
          progress={progress}
          isDestroyed={isDestroyed}
          animationState={animationState}
          frame={frame}
          className={className}
          showAura={showAura || hasActiveBullet}
        />
      );
    }
  } catch (err) {
    console.warn("Error rendering anime sprite, falling back to classic stickman:", err);
  }

  // Fallback: Classic Storybook Stickman
  return (
    <svg
      viewBox="0 0 100 120"
      className={`${className} overflow-visible`}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
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

      {!isDestroyed && (
        <g stroke="#75685C" strokeWidth="3.5" fill="none">
          {progress >= 1 && (
            <g>
              <circle cx="50" cy="28" r="16" fill="#FDFBF7" stroke="#75685C" strokeWidth="3.5" />
              <circle cx="39" cy="32" r="2.5" fill="#E8B5A5" stroke="none" />
              <circle cx="61" cy="32" r="2.5" fill="#E8B5A5" stroke="none" />
              <circle cx="43" cy="26" r="2" fill="#75685C" stroke="none" />
              <circle cx="57" cy="26" r="2" fill="#75685C" stroke="none" />
              <path d="M 45 34 Q 50 38 55 34" stroke="#75685C" strokeWidth="2.5" />
            </g>
          )}
          {progress >= 2 && <line x1="50" y1="44" x2="50" y2="82" />}
          {progress >= 3 && (
            <g>
              <line x1="50" y1="82" x2="34" y2="110" />
              <line x1="50" y1="82" x2="66" y2="110" />
            </g>
          )}
          {progress >= 4 && (
            <g>
              <line x1="50" y1="56" x2="26" y2="70" />
              <line x1="50" y1="56" x2="74" y2="70" />
            </g>
          )}
          {progress >= 5 && (
            <g stroke="#D9AA61" strokeWidth="2.5" fill="#FAF1DF">
              <rect x="70" y="60" width="16" height="8" rx="2" />
              <line x1="74" y1="68" x2="74" y2="76" stroke="#75685C" strokeWidth="2.5" />
            </g>
          )}
        </g>
      )}

      {isDestroyed && (
        <g stroke="#BFA89B" strokeWidth="3" strokeDasharray="4 4" fill="none">
          <ellipse cx="50" cy="60" rx="20" ry="24" opacity="0.4" />
          <line x1="30" y1="36" x2="70" y2="84" stroke="#E28E75" strokeWidth="4" />
          <line x1="70" y1="36" x2="30" y2="84" stroke="#E28E75" strokeWidth="4" />
        </g>
      )}
    </svg>
  );
};
