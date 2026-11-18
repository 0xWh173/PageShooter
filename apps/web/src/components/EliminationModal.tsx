import React, { useEffect } from "react";
import type { PlayerState } from "@pageshooter/shared";
import type { MatchCharacterConfig } from "../characters/types.js";
import { soundManager } from "../audio/soundManager.js";
import { CharacterCellRenderer } from "../characters/components/CharacterCellRenderer.js";

interface EliminationModalProps {
  eliminatedPlayer: PlayerState;
  characterConfig?: MatchCharacterConfig | null;
  visualConfig?: MatchCharacterConfig | null;
  onDismiss: () => void;
}

export const EliminationModal: React.FC<EliminationModalProps> = ({
  eliminatedPlayer,
  characterConfig,
  visualConfig,
  onDismiss
}) => {
  const config = characterConfig || visualConfig;
  const playerConfig = config?.playerCharacters[eliminatedPlayer.playerId];
  // Sample their first cell character as representative
  const characterId = playerConfig?.characterAssignments[0] || "barnaby";

  useEffect(() => {
    soundManager.playElimination();

    const timer = setTimeout(() => {
      onDismiss();
    }, 4000);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2118]/80 backdrop-blur-sm p-4 animate-in fade-in select-none cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-[#FFFDF9] border-2 border-cozy-parchment rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative"
      >
        <div className="w-24 h-28 mx-auto mb-2 flex items-center justify-center relative">
          <CharacterCellRenderer
            characterId={characterId}
            progress={3}
            isDestroyed={true}
            pose="defeat"
          />
        </div>

        <div className="inline-block px-3 py-0.5 bg-orange-100 border border-orange-200 rounded-full text-xs font-fredoka font-bold text-orange-900 mb-2">
          ✏️ Out of Ink
        </div>

        <h2 className="font-fredoka text-2xl sm:text-3xl font-bold text-cozy-brown-dark mt-1 mb-1">
          {eliminatedPlayer.username}
        </h2>

        <div className="inline-block px-3 py-0.5 bg-[#FAF7F0] rounded-full border border-cozy-parchment text-xs font-fredoka text-cozy-brown mb-4">
          Seat {eliminatedPlayer.position} • All 5 Folio Cells Defeated
        </div>

        <p className="text-xs sm:text-sm font-fredoka text-cozy-brown/80 mb-6 px-4">
          All hand-drawn stick characters have fallen in battle. Better luck in the next folio chapter!
        </p>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="px-6 py-2.5 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-xs sm:text-sm rounded-full shadow-xs transition-colors cursor-pointer"
        >
          Resume Folio Battle ➔
        </button>
      </div>
    </div>
  );
};
