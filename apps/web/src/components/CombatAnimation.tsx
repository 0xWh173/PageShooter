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
  const [stage, setStage] = useState<"AIM" | "FIRE" | "FLY" | "IMPACT" | "RESOLVE">("AIM");
  const completedRef = useRef(false);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    // 0.0s: Aim & Focus
    const t1 = setTimeout(() => {
      setStage("FIRE");
      soundManager.playGunshot();
    }, 450);

    // 0.45s: Projectile Flies
    const t2 = setTimeout(() => {
      setStage("FLY");
    }, 850);

    // 0.85s: Impact Burst & Cell Poof
    const t3 = setTimeout(() => {
      setStage("IMPACT");
      soundManager.playCellDestroyed();
    }, 1300);

    // 1.8s: Resolve & Notification
    const t4 = setTimeout(() => {
      setStage("RESOLVE");
    }, 1800);

    // 2.5s: Complete
    const t5 = setTimeout(() => {
      finish();
    }, 2500);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#462B18]/65 backdrop-blur-sm p-4 animate-in fade-in select-none cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-md w-full bg-[#FFFDF9] border-4 border-[#7C5335] rounded-3xl p-6 text-center shadow-[0_20px_50px_rgba(70,43,24,0.3)] relative overflow-hidden"
      >
        {/* Skip note */}
        <button
          onClick={finish}
          className="absolute top-3 right-3 text-[11px] font-fredoka font-semibold text-cozy-brown-light hover:text-cozy-brown bg-cozy-parchment/60 hover:bg-cozy-gold-light px-2.5 py-1 rounded-full border border-[#D8C7B0] transition-colors"
        >
          Skip ⏩
        </button>

        {/* Title Badge */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-cozy-peach/25 border-2 border-cozy-coral rounded-full text-xs font-fredoka font-bold text-cozy-coral mb-3">
          <span>🎯</span>
          <span>STAR SHOT CHALLENGE!</span>
        </div>

        {/* Combat Scene Stage */}
        <div className="relative w-full h-40 bg-[#FAF5EB] border-2 border-[#E2D3BE] rounded-2xl flex items-center justify-between px-6 my-3 overflow-hidden shadow-inner">
          {/* Shooter Side */}
          <div className="flex flex-col items-center">
            <span className="font-fredoka text-xs font-bold text-cozy-brown">
              {shooterPosition} ({shooterName})
            </span>
            <div className={`mt-2 transition-transform duration-200 ${stage === "FIRE" ? "scale-110" : "scale-100"}`}>
              {/* Shooter stickman with blaster */}
              <svg viewBox="0 0 60 70" className="w-14 h-16">
                <circle cx="30" cy="18" r="10" fill="#FFFDF9" stroke="#4A2E1B" strokeWidth="2.5" />
                <circle cx="27" cy="17" r="1.2" fill="#4A2E1B" />
                <circle cx="33" cy="17" r="1.2" fill="#4A2E1B" />
                <path d="M 28 21 Q 30 23 32 21" stroke="#4A2E1B" strokeWidth="1.5" fill="none" />
                <line x1="30" y1="28" x2="30" y2="50" stroke="#4A2E1B" strokeWidth="3" />
                <line x1="30" y1="50" x2="20" y2="68" stroke="#4A2E1B" strokeWidth="2.5" />
                <line x1="30" y1="50" x2="40" y2="68" stroke="#4A2E1B" strokeWidth="2.5" />
                {/* Arm with Blaster */}
                <line x1="30" y1="36" x2="48" y2="34" stroke="#4A2E1B" strokeWidth="3" />
                <line x1="48" y1="34" x2="56" y2="30" stroke="#F2B84B" strokeWidth="4" />
                {stage === "FIRE" && (
                  <path d="M 57 28 Q 63 24 60 30 Q 64 34 57 32" fill="#F2B84B" />
                )}
              </svg>
            </div>
            {stage === "FIRE" && (
              <span className="text-xs font-fredoka font-black text-cozy-coral animate-ping">
                POP! 💨
              </span>
            )}
          </div>

          {/* Flying Projectile */}
          {(stage === "FLY" || stage === "FIRE") && (
            <div
              className={`text-2xl transition-all duration-400 ease-out ${
                stage === "FLY" ? "translate-x-12 scale-125" : "translate-x-0 scale-90"
              }`}
            >
              ⭐
            </div>
          )}

          {/* Impact Burst in center */}
          {stage === "IMPACT" && (
            <div className="absolute inset-0 flex items-center justify-center bg-cozy-peach/20 animate-pop z-10">
              <div className="flex flex-col items-center">
                <span className="text-4xl">💥</span>
                <span className="font-fredoka text-xl font-black text-cozy-coral drop-shadow">
                  POOF!!
                </span>
                <span className="text-sm">✨ 🌸 ✨</span>
              </div>
            </div>
          )}

          {/* Target/Victim Side */}
          <div className="flex flex-col items-center">
            <span className="font-fredoka text-xs font-bold text-cozy-brown">
              {victimPosition} ({victimName})
            </span>
            <div className="mt-2 relative">
              {/* Target stickman */}
              <svg viewBox="0 0 60 70" className="w-14 h-16">
                <circle cx="30" cy="18" r="10" fill="#FFFDF9" stroke="#4A2E1B" strokeWidth="2.5" />
                {stage === "IMPACT" || stage === "RESOLVE" ? (
                  // Dizzy eyes
                  <g stroke="#E76F51" strokeWidth="1.5">
                    <line x1="24" y1="15" x2="28" y2="19" />
                    <line x1="28" y1="15" x2="24" y2="19" />
                    <line x1="32" y1="15" x2="36" y2="19" />
                    <line x1="36" y1="15" x2="32" y2="19" />
                    <path d="M 27 22 Q 30 20 33 22" fill="none" />
                  </g>
                ) : (
                  // Normal surprised eyes
                  <g>
                    <circle cx="27" cy="17" r="1.5" fill="#4A2E1B" />
                    <circle cx="33" cy="17" r="1.5" fill="#4A2E1B" />
                    <circle cx="30" cy="22" r="1.5" fill="#E76F51" />
                  </g>
                )}
                <line x1="30" y1="28" x2="30" y2="50" stroke="#4A2E1B" strokeWidth="3" />
                <line x1="30" y1="50" x2="20" y2="68" stroke="#4A2E1B" strokeWidth="2.5" />
                <line x1="30" y1="50" x2="40" y2="68" stroke="#4A2E1B" strokeWidth="2.5" />
                <line x1="30" y1="36" x2="16" y2="44" stroke="#4A2E1B" strokeWidth="2.5" />
                <line x1="30" y1="36" x2="44" y2="44" stroke="#4A2E1B" strokeWidth="2.5" />

                {(stage === "IMPACT" || stage === "RESOLVE") && (
                  // Big cartoon crayon cross mark
                  <g stroke="#E76F51" strokeWidth="3.5" strokeLinecap="round">
                    <line x1="12" y1="10" x2="48" y2="62" />
                    <line x1="48" y1="10" x2="12" y2="62" />
                  </g>
                )}
              </svg>
            </div>
            <span className="text-[10px] font-fredoka font-bold text-cozy-coral">
              Cell #{targetCellValue}
            </span>
          </div>
        </div>

        {/* Public Notification Announcement */}
        <div className="bg-[#FAF5EB] border-2 border-[#D8C7B0] rounded-2xl p-3 shadow-xs">
          <p className="font-fredoka text-sm sm:text-base font-bold text-cozy-brown">
            {stage === "RESOLVE" || stage === "IMPACT" ? (
              <span>
                ⭐ <strong className="text-cozy-gold-dark">{shooterName}</strong> popped{" "}
                <strong className="text-cozy-coral">{victimName}</strong>'s Cell #{targetCellValue}!
              </span>
            ) : (
              <span>
                🎯 <strong>{shooterName}</strong> took aim at <strong>{victimName}</strong>'s Cell #{targetCellValue}!
              </span>
            )}
          </p>
          <div className="text-[11px] font-hand text-cozy-brown-light mt-0.5">
            The pencil ink fades from the folio leaf.
          </div>
        </div>

        <button
          onClick={finish}
          className="mt-4 px-6 py-2 bg-cozy-gold hover:bg-cozy-gold-dark text-cozy-brown font-fredoka font-bold text-xs rounded-full shadow-sm transition-all"
        >
          Continue Turn ➔
        </button>
      </div>
    </div>
  );
};
