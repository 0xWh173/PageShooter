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
    }, 3500);

    return () => clearTimeout(timer);
  }, [onDismiss]);

  return (
    <div
      onClick={onDismiss}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-md p-4 animate-in fade-in duration-300 cursor-pointer"
    >
      <div className="max-w-md w-full bg-fantasy-card border-2 border-fantasy-crimson rounded-2xl p-6 text-center shadow-[0_0_50px_rgba(168,32,32,0.6)]">
        {/* Skull Icon */}
        <div className="w-20 h-20 mx-auto mb-4 text-5xl flex items-center justify-center rounded-full bg-fantasy-crimson/20 border border-fantasy-crimson/50 animate-pulse">
          ☠️
        </div>

        <span className="text-xs font-mono font-bold uppercase tracking-widest text-fantasy-crimson">
          Mortality Claimed
        </span>

        <h2 className="font-serif text-2xl sm:text-3xl font-black text-fantasy-parchment mt-1 mb-2">
          {eliminatedPlayer.username}
        </h2>

        <div className="inline-block px-3 py-1 bg-black/60 rounded border border-fantasy-border/60 text-xs font-mono text-fantasy-gold mb-4">
          Seat {eliminatedPlayer.position} • All 5 Cells Obliterated
        </div>

        <p className="text-sm text-fantasy-parchment/70 italic mb-6">
          "The grimoire erased their name from the field of combat."
        </p>

        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="px-6 py-2 bg-fantasy-crimson hover:bg-fantasy-crimson-light text-white font-serif font-bold text-sm rounded-lg transition-colors shadow"
        >
          Continue Match ➔
        </button>
      </div>
    </div>
  );
};

