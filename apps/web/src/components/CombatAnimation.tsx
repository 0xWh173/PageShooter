import React, { useEffect, useState, useRef, useCallback } from "react";
import type { CellValue } from "@pageshooter/shared";
import { getCharacter } from "../characters/registry.js";
import { soundManager } from "../audio/soundManager.js";
import { HandDrawnStickman } from "../characters/components/HandDrawnStickman.js";

export type CartoonCombatPhase =
  | "FOCUS"
  | "KATANA_DASH"
  | "SLASH_FLASH"
  | "BLOOD_SPLASH"
  | "STAND_UP"
  | "CHIBURUI"
  | "SHEATHE_LOCK"
  | "KNOCKOUT_CROSS"
  | "RESOLVE"
  // Legacy aliases for backwards compatibility
  | "NOTICE"
  | "AIM_ANTICIPATION"
  | "POP_FIRE"
  | "PROJECTILE_TRAVEL"
  | "COMIC_IMPACT";

interface CombatAnimationProps {
  shooterName: string;
  shooterPosition: string;
  shooterCharacterId?: string;
  shooterPackId?: string;
  victimName: string;
  victimPosition: string;
  victimCharacterId?: string;
  victimPackId?: string;
  targetCellValue: CellValue;
  onComplete: () => void;
  fixedPhase?: CartoonCombatPhase;
}

/**
 * Cinematic accelerating dash easing curve:
 * Starts with crouching anticipation, violently accelerates across center,
 * and settles into the sweeping post-slash stance on the right.
 */
function easeDash(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

export const CombatAnimation: React.FC<CombatAnimationProps> = ({
  shooterName,
  shooterPosition,
  shooterCharacterId = "barnaby",
  victimName,
  victimPosition,
  victimCharacterId = "clover",
  targetCellValue,
  onComplete,
  fixedPhase
}) => {
  const [phase, setPhase] = useState<CartoonCombatPhase>(fixedPhase || "FOCUS");
  const [dashProgress, setDashProgress] = useState<number>(0);
  const completedRef = useRef(false);

  const shooterChar = getCharacter(shooterCharacterId);
  const victimChar = getCharacter(victimCharacterId);

  const finish = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // Check prefers-reduced-motion
  const prefersReducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const urlParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
  const fixedTimeParam = urlParams?.get("time") ? parseInt(urlParams.get("time")!, 10) : null;
  const fixedProgParam = urlParams?.get("dash_prog") ? parseFloat(urlParams.get("dash_prog")!) : null;

  // Calibrated Cinematic Katana Execution Timeline (~2.5 seconds total)
  // Character position is rock-solid still at the right end; ONLY the arm/scythe animates!
  useEffect(() => {
    const T_LOCK = 240;        // 0 - 240ms: Target Lock, unsheathe draw sound
    const T_DASH = 580;        // 240 - 580ms: Rapid dash across, physical blade intersection @ ~460ms
    const T_SLASH = 720;       // 580 - 720ms: Razor impact flash, localized hit spark, realistic flesh slice sound
    const T_BLOOD = 1100;      // 720 - 1100ms: Screen-space blood splatter overlay, wet slap sound. Killer is completely still at X=680.
    const T_CHIBURUI = 1580;   // 1100 - 1580ms: Killer position completely still! Right arm swings to flick blood off scythe.
    const T_SHEATHE = 1920;    // 1580 - 1920ms: Killer position completely still! Weapon slides into hip sheath (*CLACK*).
    const T_KNOCKOUT = 2220;   // 1920 - 2220ms: Target buckles and collapses in defeat with spiral eyes and red K.O. stamp!
    const T_RESOLVE = 2500;    // 2220 - 2500ms: Duel resolved

    if (fixedTimeParam !== null && !isNaN(fixedTimeParam)) {
      const elapsed = fixedTimeParam;
      if (elapsed < T_LOCK) {
        setPhase("FOCUS");
        setDashProgress(0);
      } else if (elapsed < T_DASH) {
        setPhase("KATANA_DASH");
        const rawProg = (elapsed - T_LOCK) / (T_DASH - T_LOCK);
        const clamped = Math.min(1.0, Math.max(0.0, rawProg));
        setDashProgress(fixedProgParam !== null ? fixedProgParam : easeDash(clamped));
      } else if (elapsed < T_SLASH) {
        setPhase("SLASH_FLASH");
        setDashProgress(1.0);
      } else if (elapsed < T_BLOOD) {
        setPhase("BLOOD_SPLASH");
        setDashProgress(1.0);
      } else if (elapsed < T_CHIBURUI) {
        setPhase("CHIBURUI");
        setDashProgress(1.0);
      } else if (elapsed < T_SHEATHE) {
        setPhase("SHEATHE_LOCK");
        setDashProgress(1.0);
      } else if (elapsed < T_KNOCKOUT) {
        setPhase("KNOCKOUT_CROSS");
        setDashProgress(1.0);
      } else {
        setPhase("RESOLVE");
        setDashProgress(1.0);
      }
      return;
    }

    if (fixedPhase) {
      setPhase(fixedPhase);
      setDashProgress(
        fixedProgParam !== null
          ? fixedProgParam
          : fixedPhase === "KATANA_DASH" || fixedPhase === "AIM_ANTICIPATION"
          ? 0.6
          : 1.0
      );
      return;
    }

    const startTime = Date.now();
    let animId: number;

    let triggeredUnsheathe = false;
    let triggeredSlice = false;
    let triggeredBlood = false;
    let triggeredChiburui = false;
    let triggeredSheathe = false;

    const tick = () => {
      const elapsed = Date.now() - startTime;

      if (elapsed < T_LOCK) {
        setPhase("FOCUS");
        setDashProgress(0);
        if (!triggeredUnsheathe) {
          triggeredUnsheathe = true;
          soundManager.playKatanaUnsheathe();
        }
      } else if (elapsed < T_DASH) {
        setPhase("KATANA_DASH");
        const rawProg = (elapsed - T_LOCK) / (T_DASH - T_LOCK);
        const clamped = Math.min(1.0, Math.max(0.0, rawProg));
        setDashProgress(easeDash(clamped));
      } else if (elapsed < T_SLASH) {
        setPhase("SLASH_FLASH");
        setDashProgress(1.0);

        if (!triggeredSlice) {
          triggeredSlice = true;
          soundManager.playRealisticFleshSlice();
        }
      } else if (elapsed < T_BLOOD) {
        setPhase("BLOOD_SPLASH");
        if (!triggeredBlood) {
          triggeredBlood = true;
          soundManager.playScreenBloodSlap();
        }
      } else if (elapsed < T_CHIBURUI) {
        setPhase("CHIBURUI");
        if (!triggeredChiburui) {
          triggeredChiburui = true;
          soundManager.playChiburuiFlick();
        }
      } else if (elapsed < T_SHEATHE) {
        setPhase("SHEATHE_LOCK");
        if (!triggeredSheathe) {
          triggeredSheathe = true;
          soundManager.playKatanaSheathe();
        }
      } else if (elapsed < T_KNOCKOUT) {
        setPhase("KNOCKOUT_CROSS");
      } else if (elapsed < T_RESOLVE) {
        setPhase("RESOLVE");
      } else {
        finish();
        return;
      }

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [fixedPhase, finish, prefersReducedMotion]);

  // Normalized phase flags
  const isFocus = phase === "FOCUS" || phase === "NOTICE";
  const isDash = phase === "KATANA_DASH" || phase === "AIM_ANTICIPATION";
  const isSlash = phase === "SLASH_FLASH" || phase === "POP_FIRE";
  const isBlood = phase === "BLOOD_SPLASH" || phase === "PROJECTILE_TRAVEL" || phase === "COMIC_IMPACT";
  const isChiburui = phase === "CHIBURUI";
  const isSheathe = phase === "SHEATHE_LOCK";
  const isKnockout = phase === "KNOCKOUT_CROSS";
  const isResolve = phase === "RESOLVE";

  // Target Pose: starts idle, recoils upon slash/blood/chiburui, collapses on sheathe/knockout
  const victimPose =
    isKnockout || isResolve
      ? "defeat"
      : isBlood || isSlash || isChiburui || isSheathe
      ? "recoil"
      : "idle";

  // Killer Pose across the complete choreography:
  // Post-dash stance is 100% STILL and UNMOVING at the right end.
  // ONLY the right arm and weapon animate for Chiburui and sheathing!
  const killerPose =
    isDash
      ? "dash"
      : isChiburui
      ? "chiburui"
      : isSheathe
      ? "sheathe"
      : isKnockout || isResolve
      ? "sheathed"
      : "ready";

  // Killer horizontal X coordinate across the 800px arena
  // Focus: X=80. Dash: X=80 -> 680 (crossing center X=400). After-slash: X=680
  const killerX = isFocus
    ? 80
    : isDash
    ? 80 + dashProgress * 600
    : 680;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#15110E]/85 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in duration-200 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-3xl bg-[#1C1713] border-2 border-[#4A3A2D] rounded-3xl p-4 sm:p-7 text-center shadow-2xl relative my-auto animate-in zoom-in-95 duration-200 text-[#FFFDF8]">
        {/* Skip button in corner */}
        {!isResolve && (
          <button
            onClick={finish}
            className="absolute top-4 right-4 text-xs font-fredoka font-semibold text-[#D4C5B3] hover:text-[#FFFDF8] bg-[#2C241E] hover:bg-[#3D3025] px-3.5 py-1 rounded-full border border-[#5A4839] transition-colors cursor-pointer z-30"
          >
            Skip ⏩
          </button>
        )}

        {/* Duel Execution Header */}
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 text-[11px] sm:text-xs font-fredoka font-bold uppercase tracking-widest px-3.5 py-1 rounded-full bg-red-950/70 border border-red-700/60 text-red-300 shadow-xs">
            <span>🗡️</span>
            <span>Katana Execution • Swift Shadow Dash</span>
          </span>
        </div>

        {/* Subtitle */}
        <p className="text-xs sm:text-sm font-fredoka text-[#D4C5B3]/90 mb-3 px-4">
          <strong className="text-red-400 font-bold">{shooterName}</strong> ({shooterPosition}) unleashes swift katana slice on{" "}
          <strong className="text-amber-200 font-bold">{victimName}</strong> ({victimPosition} • Cell #{targetCellValue} - {victimChar.name})!
        </p>

        {/* CINEMATIC ARENA CANVAS */}
        <div className="relative w-full aspect-[8/3.8] max-h-[380px] bg-[#1E1712] border-2 border-[#4A392A] rounded-2xl overflow-hidden shadow-inner flex items-center justify-center">
          {/* Atmospheric Stage Illumination & Spotlight Beam on Center Target */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                "radial-gradient(ellipse 700px 320px at 50% 65%, rgba(190, 150, 120, 0.22) 0%, rgba(120, 80, 60, 0.12) 50%, rgba(20, 15, 12, 0.95) 100%)"
            }}
          />

          {/* SVG CINEMATIC STAGE */}
          <svg
            viewBox="0 0 800 360"
            className="w-full h-full overflow-visible"
            style={{ shapeRendering: "geometricPrecision" }}
          >
            <defs>
              {/* Localized White-Red Impact Flash Glow (No full-screen washout) */}
              <radialGradient id="localizedFlashGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
                <stop offset="30%" stopColor="#FFF1F2" stopOpacity="0.85" />
                <stop offset="60%" stopColor="#FF4D6D" stopOpacity="0.55" />
                <stop offset="85%" stopColor="#D90429" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#D90429" stopOpacity="0" />
              </radialGradient>

              {/* Razor Katana Slash Trail Gradient */}
              <linearGradient id="slashTrailGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                <stop offset="25%" stopColor="#FFFFFF" stopOpacity="0.95" />
                <stop offset="60%" stopColor="#FF0054" stopOpacity="0.8" />
                <stop offset="100%" stopColor="#D90429" stopOpacity="0" />
              </linearGradient>

              {/* Katana Dash Speed Motion Blur */}
              <linearGradient id="dashTrail" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#D90429" stopOpacity="0" />
                <stop offset="60%" stopColor="#FF0054" stopOpacity="0.35" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.75" />
              </linearGradient>
            </defs>

            {/* Floor Baseline & Stage Floor */}
            <rect x="0" y="280" width="800" height="80" fill="#16110D" />
            <line x1="20" y1="280" x2="780" y2="280" stroke="#7A6048" strokeWidth="2.5" />
            <line x1="100" y1="282" x2="700" y2="282" stroke="#E63946" strokeWidth="1.2" opacity="0.6" />

            {/* Dash Ghost Afterimages & Directional Speed Lines */}
            {isDash && !prefersReducedMotion && (
              <g id="dash-afterimages-and-speedlines">
                {/* Motion Blur Trail Beam */}
                <rect
                  x={Math.max(40, killerX - 180)}
                  y="190"
                  width={Math.min(180, Math.max(20, killerX - 40))}
                  height="85"
                  fill="url(#dashTrail)"
                  opacity="0.65"
                />

                {/* Directional Horizontal Speed Lines */}
                <line x1={Math.max(30, killerX - 160)} y1="210" x2={killerX - 20} y2="210" stroke="#E63946" strokeWidth="2.5" strokeDasharray="16 8" opacity="0.6" />
                <line x1={Math.max(30, killerX - 220)} y1="230" x2={killerX - 35} y2="230" stroke="#FFFFFF" strokeWidth="2" strokeDasharray="24 10" opacity="0.75" />
                <line x1={Math.max(30, killerX - 180)} y1="250" x2={killerX - 25} y2="250" stroke="#FF0054" strokeWidth="2.5" strokeDasharray="20 10" opacity="0.6" />
                <line x1={Math.max(30, killerX - 130)} y1="268" x2={killerX - 15} y2="268" stroke="#E63946" strokeWidth="1.8" strokeDasharray="12 6" opacity="0.5" />

                {/* Multiple Fading Ghost Afterimages */}
                {killerX - 110 > 40 && (
                  <g transform={`translate(${killerX - 110}, 160) scale(0.92)`} opacity="0.14">
                    <HandDrawnStickman
                      characterId={shooterChar.id}
                      progress={5}
                      pose="dash"
                      showWeapon={true}
                    />
                  </g>
                )}
                {killerX - 75 > 40 && (
                  <g transform={`translate(${killerX - 75}, 160) scale(0.95)`} opacity="0.26">
                    <HandDrawnStickman
                      characterId={shooterChar.id}
                      progress={5}
                      pose="dash"
                      showWeapon={true}
                    />
                  </g>
                )}
                {killerX - 45 > 40 && (
                  <g transform={`translate(${killerX - 45}, 160) scale(0.97)`} opacity="0.42">
                    <HandDrawnStickman
                      characterId={shooterChar.id}
                      progress={5}
                      pose="dash"
                      showWeapon={true}
                    />
                  </g>
                )}
                {killerX - 20 > 40 && (
                  <g transform={`translate(${killerX - 20}, 160) scale(0.99)`} opacity="0.64">
                    <HandDrawnStickman
                      characterId={shooterChar.id}
                      progress={5}
                      pose="dash"
                      showWeapon={true}
                    />
                  </g>
                )}
              </g>
            )}

            {/* ======================================================== */}
            {/* SHARP DIAGONAL KATANA TRAIL ACROSS THE ARENA             */}
            {/* ======================================================== */}
            {(isSlash || isBlood) && (
              <g id="sharp-katana-trail" pointerEvents="none">
                <path
                  d="M 290 165 Q 400 215 510 265"
                  stroke="url(#slashTrailGlow)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity={isSlash ? 0.95 : 0.55}
                />
                <path
                  d="M 300 168 L 500 262"
                  stroke="#FFFFFF"
                  strokeWidth="3.2"
                  strokeLinecap="round"
                  opacity={isSlash ? 1.0 : 0.45}
                  filter="drop-shadow(0 0 3px #FF0054)"
                />
              </g>
            )}

            {/* ======================================================== */}
            {/* CENTER TARGET (VICTIM) - EXACT CENTER (X=400, Y=160..280) */}
            {/* ======================================================== */}
            <g id="center-target-area" transform="translate(350, 160)">
              {/* Target Character Shadow */}
              <ellipse cx="50" cy="116" rx="28" ry="4" fill="rgba(0, 0, 0, 0.45)" />

              {/* Target Figure with Contact Recoil & Collapse */}
              <g
                transform={
                  isBlood
                    ? "translate(10, -5) rotate(6, 50, 60)"
                    : isSlash
                    ? "translate(6, -3) rotate(3, 50, 60)"
                    : isKnockout || isResolve
                    ? "translate(0, 8)"
                    : ""
                }
                className="transition-transform duration-150"
              >
                <svg x="0" y="0" width="100" height="120">
                  <HandDrawnStickman
                    characterId={victimChar.id}
                    progress={victimPose === "defeat" ? 1 : 4}
                    isDestroyed={victimPose === "defeat"}
                    pose={victimPose}
                  />
                </svg>
              </g>

              {/* DIAGONAL RAZOR CUT LINE ACROSS TARGET */}
              {(isSlash || isBlood || isKnockout || isResolve) && (
                <g id="katana-cut-line">
                  {/* Glowing White Core */}
                  <line
                    x1="-25"
                    y1="28"
                    x2="125"
                    y2="88"
                    stroke="#FFFFFF"
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    filter="drop-shadow(0 0 4px #FF0054)"
                  />
                  {/* Vivid Crimson Razor Edge */}
                  <line
                    x1="-27"
                    y1="28"
                    x2="127"
                    y2="88"
                    stroke="#D90429"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </g>
              )}

              {/* VISCERAL INK & BLOOD SPLASH PARTICLES (From contact point) */}
              {(isBlood || isChiburui || isSheathe || isKnockout || isResolve) && (
                <g id="visceral-blood-splash">
                  {/* Primary Blood spray arcs bursting outward along the diagonal cut */}
                  <path
                    d="M 50 55 Q 90 28 140 38 Q 185 48 215 32"
                    stroke="#D90429"
                    strokeWidth="5.5"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M 50 55 Q 95 18 150 22"
                    stroke="#FF0054"
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    fill="none"
                  />
                  <path
                    d="M 50 60 Q 85 90 125 100"
                    stroke="#800F2F"
                    strokeWidth="4.2"
                    strokeLinecap="round"
                    fill="none"
                  />

                  {/* Dark Ink Droplets (#141210) & Red Blood Droplets */}
                  <circle cx="140" cy="36" r="6" fill="#D90429" />
                  <circle cx="165" cy="26" r="4.5" fill="#FF0054" />
                  <circle cx="190" cy="44" r="5" fill="#800F2F" />
                  <circle cx="215" cy="30" r="3.5" fill="#D90429" />
                  <circle cx="115" cy="96" r="5.5" fill="#D90429" />
                  <circle cx="135" cy="106" r="4" fill="#800F2F" />

                  {/* Deep Ink Droplets matching hand-drawn pen aesthetic */}
                  <circle cx="120" cy="48" r="4.5" fill="#141210" />
                  <circle cx="155" cy="62" r="3.5" fill="#141210" />
                  <circle cx="95" cy="80" r="4" fill="#141210" />
                  <circle cx="175" cy="75" r="3" fill="#141210" />

                  {/* Impact Floor Splatter */}
                  <ellipse cx="140" cy="116" rx="22" ry="4.5" fill="#D90429" opacity="0.85" />
                  <ellipse cx="170" cy="118" rx="14" ry="3.5" fill="#800F2F" opacity="0.75" />
                  <ellipse cx="115" cy="117" rx="8" ry="2.5" fill="#141210" opacity="0.6" />

                  {/* "SHING!" Comic Label */}
                  <g transform="translate(60, 8)">
                    <rect
                      x="0"
                      y="-18"
                      width="68"
                      height="22"
                      rx="4"
                      fill="#D90429"
                      stroke="#FFFFFF"
                      strokeWidth="2"
                    />
                    <text
                      x="34"
                      y="-3"
                      fontSize="12"
                      fontWeight="black"
                      fontFamily="sans-serif"
                      fill="#FFFFFF"
                      textAnchor="middle"
                    >
                      SHING!
                    </text>
                  </g>
                </g>
              )}
            </g>

            {/* ======================================================== */}
            {/* LOCALIZED WHITE-RED IMPACT FLASH AT CONTACT POINT        */}
            {/* Centered directly at blade intersection (400, 220)       */}
            {/* Background and characters remain 100% visible throughout  */}
            {/* ======================================================== */}
            {isSlash && (
              <g id="localized-impact-flash" transform="translate(400, 220)" pointerEvents="none">
                {/* Radial Flash Core */}
                <circle cx="0" cy="0" r="85" fill="url(#localizedFlashGlow)" />
                {/* Starburst Impact Sparks */}
                <line x1="-55" y1="-26" x2="55" y2="26" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" />
                <line x1="-42" y1="32" x2="42" y2="-32" stroke="#FF4D6D" strokeWidth="2.5" strokeLinecap="round" />
                <line x1="-24" y1="-50" x2="24" y2="50" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
                {/* Central hot white diamond spark */}
                <polygon points="0,-16 5,-3 18,0 5,3 0,16 -5,3 -18,0 -5,-3" fill="#FFFFFF" />
                {/* Red and dark ink particles emerging from contact */}
                <circle cx="30" cy="-22" r="3.5" fill="#141210" />
                <circle cx="-34" cy="18" r="3" fill="#141210" />
                <circle cx="38" cy="15" r="3.2" fill="#D90429" />
                <circle cx="-25" cy="-28" r="2.5" fill="#FF0054" />
              </g>
            )}

            {/* ======================================================== */}
            {/* THE KILLER (SHADOW WARRIOR WITH KATANA & REAPER SCYTHE)  */}
            {/* ======================================================== */}
            <g id="killer-warrior" transform={`translate(${killerX - 50}, 160)`}>
              {/* Killer Ground Shadow */}
              <ellipse cx="50" cy="116" rx="26" ry="4" fill="rgba(220, 20, 60, 0.35)" />

              {/* Shadow Warrior Figure with dynamic pose */}
              <svg x="0" y="0" width="100" height="120">
                <HandDrawnStickman
                  characterId={shooterChar.id}
                  progress={5}
                  pose={killerPose}
                  showWeapon={true}
                />
              </svg>

              {/* Notice Exclamation Balloon (in focus phase) */}
              {isFocus && (
                <g transform="translate(40, -10)">
                  <polygon points="5,5 15,5 10,12" fill="#D90429" />
                  <rect x="-10" y="-12" width="30" height="18" rx="4" fill="#D90429" stroke="#FFFDF8" strokeWidth="1.5" />
                  <text x="5" y="1" fontSize="11" fontWeight="bold" fill="#FFFDF8" textAnchor="middle">
                    !
                  </text>
                </g>
              )}
            </g>

            {/* ======================================================== */}
            {/* SCREEN-SPACE BLOOD SPLATTER OVERLAY (Blood on Lens)     */}
            {/* Visceral splashes on camera glass with dripping drops   */}
            {/* ======================================================== */}
            {(isBlood || isChiburui || isSheathe || isKnockout || isResolve) && (
              <g
                id="screen-space-blood-overlay"
                pointerEvents="none"
                opacity={isResolve ? 0.72 : 0.95}
                className="transition-opacity duration-300"
              >
                <defs>
                  <linearGradient id="lensBloodDripGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                    <stop offset="0%" stopColor="#800F2F" stopOpacity="0.9" />
                    <stop offset="60%" stopColor="#D90429" stopOpacity="0.95" />
                    <stop offset="100%" stopColor="#FF0054" stopOpacity="0.85" />
                  </linearGradient>
                </defs>

                {/* 1. UPPER-LEFT LENS SPLATTER WITH RUNNING DRIPS */}
                <g id="lens-splatter-left" transform="translate(50, 15)">
                  {/* Heavy viscous impact blotch on lens */}
                  <path
                    d="M 50 35 
                       Q 75 18 105 32 
                       Q 135 20 148 50 
                       Q 162 78 135 94 
                       Q 110 108 80 90 
                       Q 45 100 40 70 
                       Q 35 48 50 35 Z"
                    fill="#B80D2D"
                    opacity="0.9"
                  />
                  {/* Dark viscous core */}
                  <ellipse cx="90" cy="58" rx="32" ry="20" fill="#6B0014" opacity="0.92" />
                  {/* Glossy specular white gleam on glass */}
                  <ellipse cx="78" cy="46" rx="12" ry="4.5" fill="#FFFFFF" opacity="0.65" transform="rotate(-15, 78, 46)" />

                  {/* Dripping blood trickling down the glass */}
                  <path d="M 68 84 Q 66 125 67 160" stroke="url(#lensBloodDripGrad)" strokeWidth="4.2" strokeLinecap="round" fill="none" />
                  <circle cx="67" cy="162" r="4.2" fill="#D90429" />
                  <ellipse cx="66" cy="161" rx="1.5" ry="0.8" fill="#FFFFFF" opacity="0.85" />

                  {/* Main Long Drip */}
                  <path d="M 104 88 Q 106 145 105 210" stroke="url(#lensBloodDripGrad)" strokeWidth="5.5" strokeLinecap="round" fill="none" />
                  <circle cx="105" cy="212" r="5.5" fill="#D90429" />
                  <ellipse cx="104" cy="211" rx="2" ry="1" fill="#FFFFFF" opacity="0.88" />

                  {/* Drip 3 */}
                  <path d="M 134 78 Q 132 118 135 148" stroke="url(#lensBloodDripGrad)" strokeWidth="3.2" strokeLinecap="round" fill="none" />
                  <circle cx="135" cy="150" r="3.2" fill="#FF0054" />

                  {/* Satellite drops on lens */}
                  <circle cx="28" cy="25" r="4.5" fill="#D90429" opacity="0.85" />
                  <circle cx="14" cy="48" r="3" fill="#FF0054" opacity="0.8" />
                  <circle cx="42" cy="115" r="3.8" fill="#B80D2D" opacity="0.85" />
                  <circle cx="155" cy="35" r="4" fill="#D90429" opacity="0.8" />
                  <circle cx="170" cy="65" r="2.8" fill="#800F2F" opacity="0.8" />
                </g>

                {/* 2. UPPER-RIGHT LENS SPRAY */}
                <g id="lens-splatter-right" transform="translate(530, 15)">
                  <path
                    d="M 45 25 Q 75 12 105 28 Q 128 44 108 64 Q 78 78 50 60 Q 30 45 45 25 Z"
                    fill="#B80D2D"
                    opacity="0.85"
                  />
                  <ellipse cx="75" cy="44" rx="22" ry="12" fill="#6B0014" opacity="0.9" />
                  <ellipse cx="68" cy="36" rx="8" ry="3" fill="#FFFFFF" opacity="0.6" transform="rotate(-10, 68, 36)" />

                  {/* Running drip */}
                  <path d="M 80 58 Q 82 105 81 155" stroke="url(#lensBloodDripGrad)" strokeWidth="4.2" strokeLinecap="round" fill="none" />
                  <circle cx="81" cy="157" r="4.2" fill="#D90429" />
                  <ellipse cx="80" cy="156" rx="1.5" ry="0.8" fill="#FFFFFF" opacity="0.8" />

                  {/* Diagonal streak drops */}
                  <circle cx="135" cy="20" r="3.8" fill="#FF0054" opacity="0.85" />
                  <circle cx="158" cy="40" r="2.8" fill="#D90429" opacity="0.8" />
                  <circle cx="125" cy="80" r="4.6" fill="#B80D2D" opacity="0.85" />
                  <circle cx="25" cy="80" r="3.2" fill="#FF0054" opacity="0.8" />
                </g>

                {/* 3. CENTER DIAGONAL IMPACT MIST & STREAKS ACROSS GLASS */}
                <g id="lens-splatter-center">
                  <line x1="360" y1="180" x2="260" y2="240" stroke="#D90429" strokeWidth="2.8" strokeDasharray="18 10" opacity="0.85" />
                  <line x1="380" y1="160" x2="450" y2="110" stroke="#FF0054" strokeWidth="2.4" strokeDasharray="14 8" opacity="0.8" />
                  <circle cx="280" cy="230" r="5" fill="#D90429" opacity="0.9" />
                  <circle cx="250" cy="250" r="6" fill="#800F2F" opacity="0.85" />
                  <circle cx="430" cy="120" r="4.5" fill="#FF0054" opacity="0.85" />
                  <circle cx="465" cy="95" r="3.8" fill="#D90429" opacity="0.8" />
                </g>
              </g>
            )}
          </svg>
        </div>

        {/* Combat Status Footer */}
        <div className="mt-3 flex items-center justify-between px-2 text-xs font-fredoka text-[#D4C5B3]">
          <div>
            <span>Execution Stage: </span>
            <span className="font-bold text-red-400 uppercase tracking-wider">
              {isFocus
                ? "🎯 Target Locked"
                : isDash
                ? "⚡ Lightning Dash"
                : isSlash
                ? "⚔️ Razor Katana Slice"
                : isBlood
                ? "🩸 Visceral Screen Blood Splash"
                : isChiburui
                ? "🌀 Chiburui (Blood Flick from Scythe)"
                : isSheathe
                ? "🗡️ Sheathe Lock (*CLACK*)"
                : isKnockout
                ? "🏆 K.O. Confirmed"
                : "✨ Execution Complete"}
            </span>
          </div>

          {isResolve && (
            <button
              onClick={finish}
              className="px-5 py-2 bg-red-600 hover:bg-red-700 text-white font-fredoka font-bold rounded-xl shadow-md transition-all active:scale-95 cursor-pointer"
            >
              Continue Folio Battle ➔
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
