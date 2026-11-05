import React, { useEffect, useState, useRef, useCallback } from "react";
import type { CellValue } from "@pageshooter/shared";
import { soundManager } from "../audio/soundManager.js";

interface CombatAnimationProps {
  shooterName: string;
  shooterPosition: string;
  victimName: string;
  victimPosition: string;
  targetCellValue: CellValue;
  onComplete: () => void;
}

export const CombatAnimation: React.FC<CombatAnimationProps> = ({
  shooterName,
  shooterPosition,
  victimName,
  victimPosition,
  targetCellValue,
  onComplete
}) => {
  const [phase, setPhase] = useState<"AIM" | "FIRE" | "FLY" | "IMPACT" | "RESOLVE">("AIM");
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    // 0.0s - 0.4s: Aim & Target Lock
    const t1 = setTimeout(() => {
      setPhase("FIRE");
      soundManager.playGunshot();
    }, 450);

    // 0.45s - 0.9s: Projectile Flies
    const t2 = setTimeout(() => {
      setPhase("FLY");
    }, 850);

    // 0.9s - 1.4s: Impact Burst & Pencil Particles
    const t3 = setTimeout(() => {
      setPhase("IMPACT");
      soundManager.playCellDestroyed();
    }, 1300);

    // 1.4s - 2.0s: Resolution & Toast
    const t4 = setTimeout(() => {
      setPhase("RESOLVE");
    }, 1750);

    // 2.2s: Complete
    const t5 = setTimeout(() => {
      finish();
    }, 2200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
    };
  }, [finish]);

  return (
    <div
      onClick={finish}
      className="fixed inset-0 z-50 flex items-center justify-center bg-cozy-brown-dark/50 backdrop-blur-xs p-4 animate-in fade-in select-none cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-cozy-white border-2 border-cozy-brown/40 rounded-3xl p-5 sm:p-6 text-center shadow-modal relative overflow-hidden"
      >
        {/* Skip button */}
        <button
          onClick={finish}
          className="absolute top-3 right-3 text-xs font-fredoka font-semibold text-cozy-brown/70 hover:text-cozy-brown-dark bg-cozy-parchment/60 hover:bg-cozy-parchment px-2.5 py-1 rounded-full border border-cozy-brown/20 transition-colors"
        >
          Skip ⏩
        </button>

        {/* Phase Header Pill */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cozy-peach-light border border-cozy-peach rounded-full text-xs font-fredoka font-bold text-cozy-brown-dark mb-3">
          <span>🎯</span>
          <span>
            {phase === "AIM" && "Target Locked"}
            {phase === "FIRE" && "Blaster Firing!"}
            {phase === "FLY" && "Star Shot Traveling..."}
            {(phase === "IMPACT" || phase === "RESOLVE") && "Direct Hit!"}
          </span>
        </div>

        {/* Dynamic Continuous Stage */}
        <div className="relative w-full h-36 bg-[#FDFBF7] border border-cozy-cell-border rounded-2xl flex items-center justify-between px-5 my-2 overflow-hidden shadow-inner">
          {/* Shooter Stickman */}
          <div className="flex flex-col items-center">
            <span className="font-fredoka text-xs font-bold text-cozy-brown-dark">
              {shooterPosition} ({shooterName})
            </span>
            <div
              className={`mt-1 transition-transform duration-200 ${
                phase === "FIRE" ? "scale-110" : "scale-100"
              }`}
            >
              <svg viewBox="0 0 60 70" className="w-14 h-16">
                <circle cx="30" cy="18" r="10" fill="#FDFBF7" stroke="#75685C" strokeWidth="2.5" />
                <circle cx="27" cy="17" r="1.2" fill="#75685C" />
                <circle cx="33" cy="17" r="1.2" fill="#75685C" />
                <path d="M 28 21 Q 30 23 32 21" stroke="#75685C" strokeWidth="1.5" fill="none" />
                <line x1="30" y1="28" x2="30" y2="50" stroke="#75685C" strokeWidth="3" />
                <line x1="30" y1="50" x2="20" y2="68" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="50" x2="40" y2="68" stroke="#75685C" strokeWidth="2.5" />
                {/* Arm & Blaster */}
                <line x1="30" y1="36" x2="48" y2="33" stroke="#75685C" strokeWidth="3" />
                <line x1="48" y1="33" x2="56" y2="29" stroke="#D9AA61" strokeWidth="4" />
                {phase === "FIRE" && (
                  <path d="M 57 28 Q 63 24 60 30 Q 64 34 57 32" fill="#D9AA61" />
                )}
              </svg>
            </div>
            {phase === "FIRE" && (
              <span className="text-[11px] font-fredoka font-bold text-cozy-amber-dark animate-ping">
                POP! 💨
              </span>
            )}
          </div>

          {/* Flying Projectile */}
          {(phase === "FLY" || phase === "FIRE") && (
            <div
              className={`text-2xl transition-all duration-400 ease-out ${
                phase === "FLY" ? "translate-x-14 scale-125" : "translate-x-0 scale-90"
              }`}
            >
              ⭐
            </div>
          )}

          {/* Impact Burst Overlay */}
          {phase === "IMPACT" && (
            <div className="absolute inset-0 flex items-center justify-center bg-cozy-peach-light/40 animate-pop z-10">
              <div className="flex flex-col items-center">
                <span className="text-3xl">💥</span>
                <span className="font-fredoka text-lg font-black text-cozy-brown-dark">
                  POOF!
                </span>
                <span className="text-xs text-cozy-brown">✦ ✧ ✦</span>
              </div>
            </div>
          )}

          {/* Target Stickman */}
          <div className="flex flex-col items-center">
            <span className="font-fredoka text-xs font-bold text-cozy-brown-dark">
              {victimPosition} ({victimName})
            </span>
            <div className="mt-1 relative">
              <svg viewBox="0 0 60 70" className="w-14 h-16">
                <circle cx="30" cy="18" r="10" fill="#FDFBF7" stroke="#75685C" strokeWidth="2.5" />
                {phase === "IMPACT" || phase === "RESOLVE" ? (
                  // Dizzy X eyes
                  <g stroke="#A77B59" strokeWidth="1.5">
                    <line x1="24" y1="15" x2="28" y2="19" />
                    <line x1="28" y1="15" x2="24" y2="19" />
                    <line x1="32" y1="15" x2="36" y2="19" />
                    <line x1="36" y1="15" x2="32" y2="19" />
                    <path d="M 27 22 Q 30 20 33 22" fill="none" />
                  </g>
                ) : (
                  // Normal eyes
                  <g>
                    <circle cx="27" cy="17" r="1.5" fill="#75685C" />
                    <circle cx="33" cy="17" r="1.5" fill="#75685C" />
                  </g>
                )}
                <line x1="30" y1="28" x2="30" y2="50" stroke="#75685C" strokeWidth="3" />
                <line x1="30" y1="50" x2="20" y2="68" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="50" x2="40" y2="68" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="36" x2="16" y2="44" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="36" x2="44" y2="44" stroke="#75685C" strokeWidth="2.5" />

                {(phase === "IMPACT" || phase === "RESOLVE") && (
                  <g stroke="#A77B59" strokeWidth="3" strokeLinecap="round">
                    <line x1="12" y1="10" x2="48" y2="62" />
                    <line x1="48" y1="10" x2="12" y2="62" />
                  </g>
                )}
              </svg>
            </div>
            <span className="text-[10px] font-fredoka font-semibold text-cozy-brown">
              Cell #{targetCellValue}
            </span>
          </div>
        </div>

        {/* Public Toast Notification */}
        <div className="bg-[#FAF7F0] border border-cozy-cell-border rounded-xl p-2.5 mt-2">
          <p className="font-fredoka text-xs sm:text-sm font-semibold text-cozy-brown-dark">
            {phase === "RESOLVE" || phase === "IMPACT" ? (
              <span>
                ⭐ <strong>{shooterName}</strong> popped{" "}
                <strong>{victimName}</strong>'s Cell #{targetCellValue}!
              </span>
            ) : (
              <span>
                🎯 <strong>{shooterName}</strong> is aiming at{" "}
                <strong>{victimName}</strong>'s Cell #{targetCellValue}...
              </span>
            )}
          </p>
        </div>

        <button
          onClick={finish}
          className="mt-3.5 px-6 py-2 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-xs rounded-full shadow-xs transition-colors"
        >
          Continue ➔
        </button>
      </div>
    </div>
  );
};
