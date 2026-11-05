import React, { useEffect, useState, useRef, useCallback } from "react";
import type { CellValue } from "@pageshooter/shared";
import type { AnimePackId } from "../anime/types.js";
import { getCharacter } from "../anime/registry.js";
import { soundManager } from "../audio/soundManager.js";
import { CharacterCellRenderer } from "../anime/components/CharacterCellRenderer.js";

interface CombatAnimationProps {
  shooterName: string;
  shooterPosition: string;
  shooterPackId?: AnimePackId;
  shooterCharacterId?: string;
  victimName: string;
  victimPosition: string;
  victimPackId?: AnimePackId;
  victimCharacterId?: string;
  targetCellValue: CellValue;
  onComplete: () => void;
}

export const CombatAnimation: React.FC<CombatAnimationProps> = ({
  shooterName,
  shooterPosition,
  shooterPackId = "dragon-ball",
  shooterCharacterId = "goku",
  victimName,
  victimPosition,
  victimPackId = "dragon-ball",
  victimCharacterId = "vegeta",
  targetCellValue,
  onComplete
}) => {
  // Phase sequence: STANCE -> ACCUMULATING -> SPHERE -> RELEASE -> BEAM_TRAVEL -> IMPACT -> DESTROYED -> RESOLVE
  const [phase, setPhase] = useState<
    "STANCE" | "ACCUMULATING" | "SPHERE" | "RELEASE" | "BEAM_TRAVEL" | "IMPACT" | "DESTROYED" | "RESOLVE"
  >("STANCE");

  const [frame, setFrame] = useState(0);
  const completedRef = useRef(false);

  const shooterChar = getCharacter(shooterPackId, shooterCharacterId);
  const isDragonBall = shooterPackId === "dragon-ball";

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // Animation frame ticker for breathing/aura flicker
  useEffect(() => {
    const frameInterval = setInterval(() => {
      setFrame((f) => (f + 1) % 60);
    }, 100);
    return () => clearInterval(frameInterval);
  }, []);

  // Strict Phase Sequence (Total ~2.2s)
  useEffect(() => {
    // 0.0s: 1. Character takes an attack stance.
    setPhase("STANCE");

    // 0.35s: 2. Energy starts accumulating (Aura gathering)
    const t1 = setTimeout(() => {
      setPhase("ACCUMULATING");
      if (isDragonBall) {
        soundManager.playKiCharge();
      }
    }, 350);

    // 0.8s: 3. Energy sphere grows between the character's hands
    const t2 = setTimeout(() => {
      setPhase("SPHERE");
    }, 800);

    // 1.25s: 4. Character releases the attack & 5. Energy beam travels towards target
    const t3 = setTimeout(() => {
      setPhase("RELEASE");
      if (isDragonBall) {
        soundManager.playBeamBlast();
      } else {
        soundManager.playGunshot();
      }
    }, 1250);

    const t4 = setTimeout(() => {
      setPhase("BEAM_TRAVEL");
    }, 1450);

    // 1.75s: 6. Target receives the impact
    const t5 = setTimeout(() => {
      setPhase("IMPACT");
      if (isDragonBall) {
        soundManager.playEnergyImpact();
      } else {
        soundManager.playCellDestroyed();
      }
    }, 1750);

    // 2.05s: 7. Target character is destroyed (disintegration/poof)
    const t6 = setTimeout(() => {
      setPhase("DESTROYED");
    }, 2050);

    // 2.25s: 8. Destruction applied & 9. Continue becomes available
    const t7 = setTimeout(() => {
      setPhase("RESOLVE");
    }, 2250);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearTimeout(t5);
      clearTimeout(t6);
      clearTimeout(t7);
    };
  }, [isDragonBall]);

  // Map combat phase to sprite animation mode
  const shooterAnimMode: "stance" | "charge" | "fire" | "idle" =
    phase === "STANCE"
      ? "stance"
      : phase === "ACCUMULATING" || phase === "SPHERE"
      ? "charge"
      : phase === "RELEASE" || phase === "BEAM_TRAVEL"
      ? "fire"
      : "idle";

  const victimAnimMode: "idle" | "hit" | "defeat" =
    phase === "IMPACT"
      ? "hit"
      : phase === "DESTROYED" || phase === "RESOLVE"
      ? "defeat"
      : "idle";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2118]/85 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in duration-300 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-xl bg-[#FFFDF9] border-2 border-cozy-parchment rounded-3xl p-5 sm:p-8 text-center shadow-2xl relative my-auto animate-in zoom-in-95 duration-200">
        {/* Skip button in corner */}
        {phase !== "RESOLVE" && (
          <button
            onClick={finish}
            className="absolute top-4 right-4 text-xs font-fredoka font-medium text-cozy-brown hover:text-cozy-brown-dark bg-cozy-parchment/40 hover:bg-cozy-parchment px-3 py-1 rounded-full border border-cozy-cell-border transition-colors cursor-pointer"
          >
            Skip ⏩
          </button>
        )}

        {/* Combat Header with Attack Name */}
        <div className="mb-2">
          <span className="inline-block text-[10px] sm:text-xs font-fredoka font-bold text-cozy-brown uppercase tracking-widest px-3 py-0.5 rounded-full bg-cozy-parchment/40">
            {isDragonBall ? `⚡ Folio Ki Clash • ${shooterChar.attack.attackName}` : "📖 Folio Duel"}
          </span>
        </div>

        {/* Central Arena: Shooter -> Projectile/Beam -> Target */}
        <div className="flex items-center justify-between px-2 sm:px-6 py-4 my-2 min-h-[170px] relative overflow-hidden bg-[#FAF7F0] border border-cozy-cell-border rounded-2xl">
          {/* SHOOTER FIGHTER */}
          <div className="flex flex-col items-center w-28 sm:w-32 z-10">
            <span className="font-fredoka text-xs font-bold text-cozy-brown-dark truncate max-w-full">
              {shooterPosition} ({shooterName})
            </span>
            <span className="text-[10px] font-fredoka font-semibold text-cozy-amber-dark">
              {shooterChar.name}
            </span>

            <div className="w-18 h-22 sm:w-20 sm:h-24 mt-1 relative flex items-center justify-center">
              <CharacterCellRenderer
                packId={shooterPackId}
                characterId={shooterCharacterId}
                progress={5}
                isDestroyed={false}
                animationState={shooterAnimMode}
                frame={frame}
                showAura={phase === "ACCUMULATING" || phase === "SPHERE"}
              />
            </div>
          </div>

          {/* INDEPENDENT VFX LAYER: PROJECTILE / BEAM / EXPLOSION */}
          <div className="flex-1 flex items-center justify-center relative h-28 mx-2 overflow-visible">
            {/* 1. Stance Aim Indicator */}
            {phase === "STANCE" && (
              <div className="text-cozy-brown/40 text-xs font-mono tracking-widest animate-pulse">
                • • • 🎯 • • •
              </div>
            )}

            {/* 2 & 3. Ki Gathering Sparks */}
            {(phase === "ACCUMULATING" || phase === "SPHERE") && (
              <div className="flex flex-col items-center">
                <div
                  className="w-10 h-10 rounded-full animate-ping opacity-75"
                  style={{ backgroundColor: shooterChar.attack.auraColor }}
                />
                <span className="text-[11px] font-fredoka font-bold text-cozy-amber-dark mt-1">
                  Gathering Ki...
                </span>
              </div>
            )}

            {/* 4 & 5. Massive Energy Beam Travel */}
            {(phase === "RELEASE" || phase === "BEAM_TRAVEL") && isDragonBall && (
              <div className="w-full flex items-center relative overflow-visible">
                {/* Radiant Surge Beam */}
                <div
                  className={`h-8 sm:h-10 rounded-full w-full shadow-lg transition-all duration-300 ${
                    phase === "BEAM_TRAVEL" ? "scale-x-100 opacity-100" : "scale-x-50 opacity-90"
                  }`}
                  style={{
                    background: `linear-gradient(90deg, #FFFFFF 0%, ${shooterChar.attack.beamColor} 60%, ${shooterChar.attack.auraColor} 100%)`,
                    boxShadow: `0 0 20px ${shooterChar.attack.beamColor}`
                  }}
                />
                {/* Energy Rings along beam */}
                <div
                  className="absolute right-0 w-8 h-12 rounded-full border-4 animate-ping"
                  style={{ borderColor: shooterChar.attack.impactColor }}
                />
              </div>
            )}

            {/* Classic Stickman Projectile */}
            {(phase === "RELEASE" || phase === "BEAM_TRAVEL") && !isDragonBall && (
              <div
                className={`text-3xl transition-all duration-300 ease-out ${
                  phase === "BEAM_TRAVEL" ? "translate-x-12 scale-125" : "-translate-x-8 scale-90"
                }`}
              >
                ⭐
              </div>
            )}

            {/* 6. Impact Explosion & Shockwaves */}
            {phase === "IMPACT" && (
              <div className="flex flex-col items-center animate-in zoom-in-90 duration-150 relative">
                <div
                  className="w-20 h-20 rounded-full animate-ping absolute"
                  style={{ backgroundColor: shooterChar.attack.impactColor, opacity: 0.8 }}
                />
                <span className="text-5xl z-10">💥</span>
                <span className="font-fredoka text-xs font-black text-cozy-brown-dark mt-1 z-10">
                  {isDragonBall ? "DIRECT HIT!" : "POOF!"}
                </span>
              </div>
            )}

            {/* 7. Destroyed Dust Cloud */}
            {(phase === "DESTROYED" || phase === "RESOLVE") && (
              <div className="flex flex-col items-center animate-in fade-in duration-300">
                <span className="text-3xl">💨</span>
                <span className="text-[10px] font-fredoka font-bold text-cozy-brown">
                  Cell Vaporized
                </span>
              </div>
            )}
          </div>

          {/* TARGET FIGHTER */}
          <div className="flex flex-col items-center w-28 sm:w-32 z-10">
            <span className="font-fredoka text-xs font-bold text-cozy-brown-dark truncate max-w-full">
              {victimPosition} ({victimName})
            </span>
            <span className="text-[10px] font-fredoka font-semibold text-cozy-brown/80">
              Cell #{targetCellValue}
            </span>

            <div
              className={`w-18 h-22 sm:w-20 sm:h-24 mt-1 relative flex items-center justify-center transition-transform duration-200 ${
                phase === "IMPACT" ? "scale-95 translate-x-1" : "scale-100"
              }`}
            >
              <CharacterCellRenderer
                packId={victimPackId}
                characterId={victimCharacterId}
                progress={3}
                isDestroyed={phase === "DESTROYED" || phase === "RESOLVE"}
                animationState={victimAnimMode}
                frame={frame}
              />
            </div>
          </div>
        </div>

        {/* Informative Status Banner */}
        <div className="mt-3 py-2.5 px-4 rounded-xl bg-cozy-parchment/30 border border-cozy-cell-border text-center">
          <p className="font-fredoka text-xs sm:text-sm font-semibold text-cozy-brown-dark">
            {phase === "RESOLVE" || phase === "DESTROYED" || phase === "IMPACT" ? (
              <span>
                ⚡ <strong>{shooterName}</strong> unleashed <strong>{shooterChar.attack.attackName}</strong>, vaporizing{" "}
                <strong>{victimName}</strong>'s Cell #{targetCellValue}!
              </span>
            ) : (
              <span>
                🔥 <strong>{shooterName}</strong> is charging {shooterChar.attack.attackName} at{" "}
                <strong>{victimName}</strong>'s Cell #{targetCellValue}...
              </span>
            )}
          </p>
        </div>

        {/* Continue Action Button: ONLY enabled after destruction state completes */}
        {phase === "RESOLVE" && (
          <button
            onClick={finish}
            className="mt-4 px-8 py-2.5 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-sm sm:text-base rounded-full shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer"
          >
            Continue ➔
          </button>
        )}
      </div>
    </div>
  );
};
