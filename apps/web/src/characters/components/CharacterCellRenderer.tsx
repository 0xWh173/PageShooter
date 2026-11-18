import React from "react";
import type { CellProgress } from "@pageshooter/shared";
import { HandDrawnStickman, type HandDrawnStickmanProps } from "./HandDrawnStickman.js";

interface CharacterCellRendererProps {
  characterId: string;
  progress: CellProgress;
  isDestroyed?: boolean;
  hasActiveBullet?: boolean;
  pose?: HandDrawnStickmanProps["pose"];
  animationState?: HandDrawnStickmanProps["pose"];
  className?: string;
}

/**
 * High-level cell renderer connecting folio cell state to the Hand-Drawn Stickman.
 */
export const CharacterCellRenderer: React.FC<CharacterCellRendererProps> = ({
  characterId,
  progress,
  isDestroyed = false,
  hasActiveBullet = false,
  pose = "idle",
  animationState,
  className = "w-full h-full"
}) => {
  const effectivePose = animationState || pose;

  return (
    <HandDrawnStickman
      characterId={characterId}
      progress={progress}
      isDestroyed={isDestroyed}
      pose={effectivePose}
      className={className}
      showWeapon={hasActiveBullet || progress >= 5}
    />
  );
};
