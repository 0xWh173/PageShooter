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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#462B18]/70 backdrop-blur-sm p-4 animate-in fade-in duration-300 cursor-pointer select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-[#FFFDF9] border-4 border-cozy-coral rounded-3xl p-6 sm:p-8 text-center shadow-[0_20px_50px_rgba(231,111,81,0.25)] relative overflow-hidden"
      >
        {/* Floating cozy decorations */}
        <div className="absolute top-3 left-4 text-xl">🎈</div>
        <div className="absolute top-3 right-4 text-xl">✨</div>

        {/* Cute illustrated icon: Sleepy stickman floating on a balloon */}
        <div className="w-20 h-20 mx-auto mb-3 flex items-center justify-center rounded-full bg-cozy-peach/30 border-2 border-cozy-coral shadow-inner">
          <span className="text-4xl animate-bounce">😴</span>
        </div>

        <div className="inline-block px-3 py-1 bg-cozy-coral/15 border border-cozy-coral/40 rounded-full text-xs font-fredoka font-bold text-cozy-coral mb-2">
          OUT OF INK!
        </div>

        <h2 className="font-fredoka text-2xl sm:text-3xl font-black text-cozy-brown mt-1 mb-1">
          {eliminatedPlayer.username}
        </h2>

        <div className="inline-block px-3 py-1 bg-[#FAF5EB] rounded-full border border-[#D8C7B0] text-xs font-hand text-cozy-brown-light mb-4">
          Seat {eliminatedPlayer.position} • All 5 Folio Cells Poofed
        </div>

        <p className="text-xs sm:text-sm font-hand text-cozy-brown-light italic mb-6 px-4">
          "Their pencil ran soft, and their story gently rests. Better luck in the next chapter!"
        </p>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="px-6 py-2.5 bg-cozy-coral hover:bg-[#D45D3F] text-white font-fredoka font-bold text-sm rounded-full shadow-sm transition-all"
        >
          Resume Tournament ➔
        </button>
      </div>
    </div>
  );
};
