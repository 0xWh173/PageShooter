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
    // 0.0s - 0.5s: Aim & Target Lock
    const t1 = setTimeout(() => {
      setPhase("FIRE");
      soundManager.playGunshot();
    }, 500);

    // 0.5s - 1.0s: Star Projectile Flies
    const t2 = setTimeout(() => {
      setPhase("FLY");
    }, 1000);

    // 1.0s - 1.6s: Impact Burst & Starburst
    const t3 = setTimeout(() => {
      setPhase("IMPACT");
      soundManager.playCellDestroyed();
    }, 1500);

    // 1.6s: Resolution reached (Continue button appears)
    const t4 = setTimeout(() => {
      setPhase("RESOLVE");
    }, 2000);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, []);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2118]/80 backdrop-blur-sm p-4 select-none animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      {/* Single Modal Frame (No nested outer/inner boxes) */}
      <div className="w-full max-w-lg bg-[#FFFDF9] border-2 border-cozy-parchment rounded-3xl p-6 sm:p-8 text-center shadow-2xl relative">
        {/* Skip button in corner */}
        {phase !== "RESOLVE" && (
          <button
            onClick={finish}
            className="absolute top-4 right-4 text-xs font-fredoka font-medium text-cozy-brown hover:text-cozy-brown-dark bg-cozy-parchment/40 hover:bg-cozy-parchment px-2.5 py-1 rounded-full border border-cozy-cell-border transition-colors cursor-pointer"
          >
            Skip ⏩
          </button>
        )}

        {/* Header Indicator */}
        <div className="text-xs font-fredoka font-bold text-cozy-brown uppercase tracking-wider mb-4">
          Folio Duel
        </div>

        {/* Central Combat Arena: Shooter -> Projectile -> Target */}
        <div className="flex items-center justify-between px-4 sm:px-8 py-3 my-2 min-h-[140px] relative">
          {/* Shooter Stickman */}
          <div className="flex flex-col items-center w-28">
            <span className="font-fredoka text-xs font-bold text-cozy-brown-dark truncate max-w-full">
              {shooterPosition} ({shooterName})
            </span>
            <div
              className={`mt-2 transition-transform duration-200 ${
                phase === "FIRE" ? "scale-110" : "scale-100"
              }`}
            >
              <svg viewBox="0 0 60 70" className="w-16 h-18">
                {/* Head */}
                <circle cx="30" cy="18" r="10" fill="#FAF6EE" stroke="#75685C" strokeWidth="2.5" />
                <circle cx="27" cy="17" r="1.2" fill="#75685C" />
                <circle cx="33" cy="17" r="1.2" fill="#75685C" />
                <path d="M 28 21 Q 30 23 32 21" stroke="#75685C" strokeWidth="1.5" fill="none" />
                {/* Spine & Legs */}
                <line x1="30" y1="28" x2="30" y2="50" stroke="#75685C" strokeWidth="3" />
                <line x1="30" y1="50" x2="20" y2="68" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="50" x2="40" y2="68" stroke="#75685C" strokeWidth="2.5" />
                {/* Blaster Arm */}
                <line x1="30" y1="36" x2="48" y2="33" stroke="#75685C" strokeWidth="3" />
                <line x1="48" y1="33" x2="56" y2="29" stroke="#D9AA61" strokeWidth="4" />
                {phase === "FIRE" && (
                  <path d="M 57 28 Q 63 24 60 30 Q 64 34 57 32" fill="#D9AA61" />
                )}
              </svg>
            </div>
            {phase === "FIRE" && (
              <span className="text-[11px] font-fredoka font-bold text-cozy-amber-dark">
                POP! 💨
              </span>
            )}
          </div>

          {/* Projectile Flight Path / Impact Burst */}
          <div className="flex-1 flex items-center justify-center relative h-16">
            {phase === "AIM" && (
              <div className="text-cozy-brown/40 text-xs font-mono tracking-widest">
                - - - - 🎯
              </div>
            )}

            {(phase === "FIRE" || phase === "FLY") && (
              <div
                className={`text-3xl transition-all duration-500 ease-out ${
                  phase === "FLY" ? "translate-x-12 scale-125" : "-translate-x-12 scale-90"
                }`}
              >
                ⭐
              </div>
            )}

            {(phase === "IMPACT" || phase === "RESOLVE") && (
              <div className="flex flex-col items-center animate-in zoom-in-75 duration-200">
                <span className="text-4xl">💥</span>
                <span className="font-fredoka text-sm font-bold text-cozy-brown-dark mt-0.5">
                  POOF!
                </span>
              </div>
            )}
          </div>

          {/* Target Stickman */}
          <div className="flex flex-col items-center w-28">
            <span className="font-fredoka text-xs font-bold text-cozy-brown-dark truncate max-w-full">
              {victimPosition} ({victimName})
            </span>
            <div className="mt-2 relative">
              <svg viewBox="0 0 60 70" className="w-16 h-18">
                {/* Head */}
                <circle cx="30" cy="18" r="10" fill="#FAF6EE" stroke="#75685C" strokeWidth="2.5" />
                {phase === "IMPACT" || phase === "RESOLVE" ? (
                  // Dizzy X eyes on hit
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
                    <path d="M 27 22 Q 30 24 33 22" stroke="#75685C" strokeWidth="1" fill="none" />
                  </g>
                )}
                {/* Spine & Limbs */}
                <line x1="30" y1="28" x2="30" y2="50" stroke="#75685C" strokeWidth="3" />
                <line x1="30" y1="50" x2="20" y2="68" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="50" x2="40" y2="68" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="36" x2="16" y2="44" stroke="#75685C" strokeWidth="2.5" />
                <line x1="30" y1="36" x2="44" y2="44" stroke="#75685C" strokeWidth="2.5" />

                {/* Pencil scribble cross-out on hit */}
                {(phase === "IMPACT" || phase === "RESOLVE") && (
                  <g stroke="#A77B59" strokeWidth="3" strokeLinecap="round">
                    <line x1="10" y1="10" x2="50" y2="62" />
                    <line x1="50" y1="10" x2="10" y2="62" />
                  </g>
                )}
              </svg>
            </div>
            <span className="text-[11px] font-fredoka font-medium text-cozy-brown mt-0.5">
              Cell #{targetCellValue}
            </span>
          </div>
        </div>

        {/* Result Message Banner */}
        <div className="mt-4 py-2.5 px-4 rounded-xl bg-cozy-parchment/30 border border-cozy-cell-border text-center">
          <p className="font-fredoka text-sm sm:text-base font-semibold text-cozy-brown-dark">
            {phase === "RESOLVE" || phase === "IMPACT" ? (
              <span>
                ⭐ <strong>{shooterName}</strong> popped{" "}
                <strong>{victimName}</strong>'s Cell #{targetCellValue}!
              </span>
            ) : (
              <span>
                🎯 <strong>{shooterName}</strong> is aiming cork blaster at{" "}
                <strong>{victimName}</strong>'s Cell #{targetCellValue}...
              </span>
            )}
          </p>
        </div>

        {/* Continue Button: ONLY appears after animation completes */}
        {phase === "RESOLVE" && (
          <button
            onClick={finish}
            className="mt-5 px-8 py-2.5 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-sm rounded-full shadow-md transition-all active:scale-95 cursor-pointer"
          >
            Continue ➔
          </button>
        )}
      </div>
    </div>
  );
};
