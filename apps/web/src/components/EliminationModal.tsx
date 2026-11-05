import React, { useEffect } from "react";
import type { PlayerState } from "@pageshooter/shared";
import { soundManager } from "../audio/soundManager.js";

interface EliminationModalProps {
  eliminatedPlayer: PlayerState;
  onDismiss: () => void;
}

export const EliminationModal: React.FC<EliminationModalProps> = ({
  eliminatedPlayer,
  onDismiss
}) => {
  useEffect(() => {
    soundManager.playElimination();

    const timer = setTimeout(() => {
      onDismiss();
    }, 3800);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-brown-dark/50 backdrop-blur-xs p-4 animate-in fade-in select-none cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-cozy-white border-2 border-cozy-peach rounded-3xl p-6 sm:p-8 text-center shadow-modal relative"
      >
        <div className="w-16 h-16 mx-auto mb-3 flex items-center justify-center rounded-full bg-cozy-peach-light border border-cozy-peach">
          <span className="text-3xl">😴</span>
        </div>

        <div className="inline-block px-3 py-0.5 bg-cozy-peach-light border border-cozy-peach rounded-full text-xs font-fredoka font-bold text-cozy-brown-dark mb-2">
          Out of Ink
        </div>

        <h2 className="font-fredoka text-2xl sm:text-3xl font-bold text-cozy-brown-dark mt-1 mb-1">
          {eliminatedPlayer.username}
        </h2>

        <div className="inline-block px-3 py-0.5 bg-[#FAF7F0] rounded-full border border-cozy-parchment text-xs font-fredoka text-cozy-brown mb-4">
          Seat {eliminatedPlayer.position} • All 5 Folio Cells Poofed
        </div>

        <p className="text-xs sm:text-sm font-fredoka text-cozy-brown/80 mb-6 px-4">
          Their pencil ran soft and their folio gently rests. Better luck in the next chapter!
        </p>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="px-6 py-2.5 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-xs sm:text-sm rounded-full shadow-xs transition-colors"
        >
          Resume Tournament ➔
        </button>
      </div>
    </div>
  );
};
