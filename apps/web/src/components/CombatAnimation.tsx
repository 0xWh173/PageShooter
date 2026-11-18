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
  const [videoPlaying, setVideoPlaying] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
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
  const isLivePlayback = !fixedPhase && fixedTimeParam === null && !prefersReducedMotion;

  // Sync HTML5 video volume with SoundManager combat channel
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid || !isLivePlayback) return;

    const effectiveVol = soundManager.getEffectiveVolume("combat");
    vid.volume = Math.max(0, Math.min(1, effectiveVol));
    vid.muted = effectiveVol <= 0;

    const playPromise = vid.play();
    if (playPromise && typeof playPromise.then === "function") {
      playPromise
        .then(() => {
          setVideoPlaying(true);
        })
        .catch(() => {
          setVideoPlaying(false);
        });
    }
  }, [isLivePlayback]);

  const handleVideoTimeUpdate = () => {
    const vid = videoRef.current;
    if (!vid) return;
    const t = vid.currentTime;
    if (t < 0.85) {
      setPhase("FOCUS");
    } else if (t < 1.15) {
      setPhase("KATANA_DASH");
    } else if (t < 1.85) {
      setPhase("SLASH_FLASH");
    } else if (t < 3.8) {
      setPhase("BLOOD_SPLASH");
    } else if (t < 6.6) {
      setPhase("CHIBURUI");
    } else if (t < 8.6) {
      setPhase("SHEATHE_LOCK");
    } else {
      setPhase("KNOCKOUT_CROSS");
    }
  };

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

    // If the live HTML5 katana execution video is playing, let its onTimeUpdate & onEnded drive the timeline
    if (videoPlaying) {
      return;
    }

    const startTime = Date.now();
    let animId: number;

    let triggeredUnsheathe = false;
    let triggeredDash = false;
    let triggeredSlice = false;
    let triggeredBlood = false;
    let triggeredChiburui = false;
    let triggeredSheathe = false;
    let triggeredKnockout = false;

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
        if (!triggeredDash) {
          triggeredDash = true;
          soundManager.playThunderDashBurst();
        }
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
        if (!triggeredKnockout) {
          triggeredKnockout = true;
          soundManager.playKnockoutStampSlam();
        }
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
  }, [fixedPhase, finish, prefersReducedMotion, videoPlaying]);

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/85 backdrop-blur-md p-3 sm:p-6 select-none animate-in fade-in duration-200 overflow-y-auto"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl bg-[#FAF4E6] border-4 border-[#1C1917] shadow-[10px_10px_0_#1C1917] p-4 sm:p-6 text-center relative my-auto animate-in zoom-in-95 duration-200 text-[#1C1917]">
        {/* Skip button in corner */}
        {!isResolve && (
          <button
            onClick={finish}
            className="cartoon-btn absolute top-3 right-3 text-xs font-bangers tracking-wider uppercase text-[#1C1917] bg-[#E5C467] hover:bg-[#EDD07A] px-3.5 py-1 cursor-pointer z-30"
          >
            Skip ⏩
          </button>
        )}

        {/* Duel Execution Comic Header Ribbon */}
        <div className="mb-2 flex items-center justify-center">
          <span className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-bangers uppercase tracking-widest px-4 py-1 bg-[#1C1917] border-2 border-[#1C1917] shadow-[3px_3px_0_#C85A48] text-[#E5C467] -skew-x-6">
            <span>🗡️</span>
            <span>Katana Execution • Manga Samurai Finisher</span>
          </span>
        </div>

        {/* Subtitle */}
        <p className="text-xs sm:text-sm font-bold text-[#1C1917] mb-3 px-4">
          <strong className="bg-[#1C1917] text-[#E5C467] px-1.5 py-0.5 font-bangers tracking-wider uppercase">{shooterName}</strong> ({shooterPosition}) executes katana slash on{" "}
          <strong className="bg-[#C85A48] text-[#FAF4E6] px-1.5 py-0.5 font-bangers tracking-wider uppercase">{victimName}</strong> ({victimPosition} • Cell #{targetCellValue} - {victimChar.name})!
        </p>

        {/* CINEMATIC MANGA SAMURAI ARENA CANVAS */}
        <div className="relative w-full aspect-video max-h-[420px] bg-[#161B1F] border-4 border-[#1C1917] shadow-[6px_6px_0_#1C1917] overflow-hidden flex items-center justify-center">
          {/* Primary Reference Video Playback (/sfx/katana-execution.mp4 = gemini_generated_video_b4b6dfd9.mp4) */}
          {isLivePlayback && (
            <video
              ref={videoRef}
              src="/sfx/katana-execution.mp4"
              autoPlay
              playsInline
              onTimeUpdate={handleVideoTimeUpdate}
              onEnded={finish}
              onError={() => setVideoPlaying(false)}
              data-testid="katana-execution-video"
              className="absolute inset-0 w-full h-full object-cover z-20"
            />
          )}

          {/* Moody Smoky Dojo Stage / Stark White Manga Impact Frame (00:01 of Video) */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: isSlash
                ? "#F5F5F5"
                : "radial-gradient(ellipse 720px 340px at 50% 65%, rgba(56, 68, 78, 0.38) 0%, rgba(30, 37, 43, 0.72) 55%, rgba(15, 19, 23, 0.98) 100%)"
            }}
          />

          {/* SVG CINEMATIC STAGE (Visible in QA phase views or before video frame renders) */}
          <svg
            viewBox="0 0 800 360"
            className="w-full h-full overflow-visible relative z-10"
            style={{ shapeRendering: "geometricPrecision" }}
          >
            {/* Stark White Manga Speed-Line Impact Frame & Katakana (Matching Frame 00:01 of Video) */}
            {isSlash && (
              <g id="manga-white-impact-frame">
                <rect x="0" y="0" width="800" height="360" fill="#F5F5F5" />
                {/* Radiating Black Manga Speed Lines from Impact Center (420, 195) */}
                {Array.from({ length: 28 }).map((_, idx) => {
                  const angle = (idx / 28) * Math.PI * 2;
                  const rInner = 95 + (idx % 3) * 20;
                  const x1 = 420 + Math.cos(angle) * rInner;
                  const y1 = 195 + Math.sin(angle) * rInner;
                  const x2 = 420 + Math.cos(angle) * 520;
                  const y2 = 195 + Math.sin(angle) * 520;
                  return (
                    <line
                      key={idx}
                      x1={x1}
                      y1={y1}
                      x2={x2}
                      y2={y2}
                      stroke="#0F1215"
                      strokeWidth={idx % 2 === 0 ? "4.5" : "2.2"}
                    />
                  );
                })}
                {/* Bold Black Manga Katakana SFX ("ドッ" / "ズバァ" Matching Frame 00:01) */}
                <text
                  x="110"
                  y="145"
                  fontSize="74"
                  fontWeight="900"
                  fill="#0F1215"
                  transform="rotate(-14 110 145)"
                >
                  ドッ
                </text>
                <text
                  x="650"
                  y="305"
                  fontSize="58"
                  fontWeight="900"
                  fill="#0F1215"
                  transform="rotate(-10 650 305)"
                >
                  ッ!!
                </text>
              </g>
            )}
            <defs>
              {/* Localized White-Red Impact Flash Glow */}
              <radialGradient id="localizedFlashGlow" cx="50%" cy="50%" r="50%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.98" />
                <stop offset="28%" stopColor="#FFD000" stopOpacity="0.9" />
                <stop offset="58%" stopColor="#FF0054" stopOpacity="0.65" />
                <stop offset="85%" stopColor="#D90429" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#D90429" stopOpacity="0" />
              </radialGradient>

              {/* Delayed Knockout Shockwave Pillar Gradient */}
              <linearGradient id="shockwavePillarGrad" x1="0%" y1="100%" x2="0%" y2="0%">
                <stop offset="0%" stopColor="#FFD000" stopOpacity="0.85" />
                <stop offset="45%" stopColor="#E62E2D" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#FF0054" stopOpacity="0" />
              </linearGradient>

              {/* Razor Katana Slash Trail Gradient */}
              <linearGradient id="slashTrailGlow" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
                <stop offset="20%" stopColor="#FFD000" stopOpacity="0.95" />
                <stop offset="50%" stopColor="#FFFFFF" stopOpacity="1" />
                <stop offset="75%" stopColor="#FF0054" stopOpacity="0.9" />
                <stop offset="100%" stopColor="#D90429" stopOpacity="0" />
              </linearGradient>

              {/* Katana Dash Speed Motion Blur */}
              <linearGradient id="dashTrail" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#D90429" stopOpacity="0" />
                <stop offset="45%" stopColor="#FFD000" stopOpacity="0.4" />
                <stop offset="75%" stopColor="#FF0054" stopOpacity="0.65" />
                <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.9" />
              </linearGradient>
            </defs>

            {/* Radial Comic Action Speed Lines in Background */}
            <g id="comic-background-speed-lines" opacity={isSlash || isDash ? "0.42" : "0.16"}>
              <line x1="0" y1="20" x2="260" y2="140" stroke="#FFD000" strokeWidth="2" />
              <line x1="0" y1="90" x2="220" y2="175" stroke="#FF0054" strokeWidth="1.5" />
              <line x1="800" y1="30" x2="540" y2="145" stroke="#00D4FF" strokeWidth="2" />
              <line x1="800" y1="110" x2="570" y2="185" stroke="#FFD000" strokeWidth="1.5" />
              <line x1="0" y1="260" x2="240" y2="225" stroke="#FFFFFF" strokeWidth="1.5" />
              <line x1="800" y1="250" x2="560" y2="215" stroke="#FF0054" strokeWidth="2" />
            </g>

            {/* Floor Baseline & Stage Floor */}
            <rect x="0" y="280" width="800" height="80" fill="#0B0807" />
            <line x1="10" y1="280" x2="790" y2="280" stroke="#FFD000" strokeWidth="3" />
            <line x1="60" y1="284" x2="740" y2="284" stroke="#E62E2D" strokeWidth="2" opacity="0.85" />

            {/* ======================================================== */}
            {/* PHASE 1 (FOCUS): DIAGONAL COMIC EYE CUT-IN BANNER        */}
            {/* ======================================================== */}
            {isFocus && (
              <g id="comic-focus-eye-cutin">
                {/* Skewed Black & Crimson Cut-In Strip Across Top Stage */}
                <polygon
                  points="40,14 520,14 495,68 15,68"
                  fill="#0A0A0A"
                  stroke="#FFD000"
                  strokeWidth="3"
                />
                <polygon
                  points="46,18 280,18 265,64 25,64"
                  fill="#D90429"
                />
                {/* Menacing Close-Up Glowing Slitted Warrior Eyes */}
                <path d="M 75 45 Q 100 50 125 34 Q 100 32 75 45 Z" fill="#FFFFFF" />
                <path d="M 145 41 Q 170 46 198 29 Q 170 28 145 41 Z" fill="#FFFFFF" />
                <line x1="185" y1="31" x2="235" y2="19" stroke="#00D4FF" strokeWidth="2.5" strokeLinecap="round" />
                {/* Cut-In Callout Lettering */}
                <text
                  x="380"
                  y="49"
                  textAnchor="middle"
                  fill="#FFD000"
                  stroke="#0A0A0A"
                  strokeWidth="2"
                  paintOrder="stroke"
                  fontSize="22"
                  fontWeight="900"
                  fontFamily="Bangers, Impact, sans-serif"
                  letterSpacing="2"
                >
                  ⚡ TARGET LOCKED: CELL #{targetCellValue}!
                </text>
              </g>
            )}

            {/* ======================================================== */}
            {/* PHASE 2 (KATANA_DASH): SUPERSONIC LIGHTNING TELEPORT     */}
            {/* ======================================================== */}
            {isDash && !prefersReducedMotion && (
              <g id="dash-afterimages-and-speedlines">
                {/* Launch Sonic Boom Ring at X=80 */}
                <ellipse
                  cx="85"
                  cy="220"
                  rx="18"
                  ry="48"
                  fill="none"
                  stroke="#FFD000"
                  strokeWidth="3"
                  strokeDasharray="8 4"
                  opacity="0.75"
                />

                {/* Motion Blur Trail Beam */}
                <rect
                  x={Math.max(40, killerX - 220)}
                  y="185"
                  width={Math.min(220, Math.max(20, killerX - 40))}
                  height="90"
                  fill="url(#dashTrail)"
                  opacity="0.78"
                />

                {/* Crackling Golden & Cyan Lightning Bolts Along Dash Vector */}
                <polyline
                  points={`${Math.max(45, killerX - 200)},205 ${Math.max(60, killerX - 145)},192 ${Math.max(75, killerX - 95)},214 ${killerX - 25},198`}
                  fill="none"
                  stroke="#FFD000"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="miter"
                />
                <polyline
                  points={`${Math.max(45, killerX - 180)},248 ${Math.max(65, killerX - 120)},262 ${Math.max(80, killerX - 70)},240 ${killerX - 20},254`}
                  fill="none"
                  stroke="#00D4FF"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="miter"
                />

                {/* Directional Horizontal Speed Lines */}
                <line x1={Math.max(30, killerX - 160)} y1="210" x2={killerX - 20} y2="210" stroke="#E63946" strokeWidth="2.5" strokeDasharray="16 8" opacity="0.75" />
                <line x1={Math.max(30, killerX - 220)} y1="230" x2={killerX - 35} y2="230" stroke="#FFFFFF" strokeWidth="2.4" strokeDasharray="24 10" opacity="0.88" />
                <line x1={Math.max(30, killerX - 180)} y1="250" x2={killerX - 25} y2="250" stroke="#FFD000" strokeWidth="2.5" strokeDasharray="20 10" opacity="0.8" />
                <line x1={Math.max(30, killerX - 130)} y1="268" x2={killerX - 15} y2="268" stroke="#E63946" strokeWidth="1.8" strokeDasharray="12 6" opacity="0.65" />

                {/* Skewed Comic "ZWHAM!!" Onomatopoeia Callout */}
                <g transform={`translate(${Math.min(540, Math.max(120, killerX - 90))}, 135) rotate(-8)`}>
                  <polygon
                    points="0,0 118,-6 110,28 -8,28"
                    fill="#FFD000"
                    stroke="#0A0A0A"
                    strokeWidth="3"
                  />
                  <text
                    x="55"
                    y="20"
                    textAnchor="middle"
                    fill="#E62E2D"
                    stroke="#0A0A0A"
                    strokeWidth="1.5"
                    paintOrder="stroke"
                    fontSize="20"
                    fontWeight="900"
                    fontFamily="Bangers, Impact, sans-serif"
                    letterSpacing="1.5"
                  >
                    ZWHAM!!
                  </text>
                </g>

                {/* Multiple Fading Ghost Afterimages */}
                {killerX - 110 > 40 && (
                  <g transform={`translate(${killerX - 110}, 160) scale(0.92)`} opacity="0.18">
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
            {/* DIMENSION-CLEAVING X-SLASH & COMIC ONOMATOPOEIA          */}
            {/* ======================================================== */}
            {(isSlash || isBlood) && (
              <g id="sharp-katana-trail" pointerEvents="none">
                {/* Primary Arena-Spanning Diagonal Cleave */}
                <path
                  d="M 160 110 Q 400 215 640 305"
                  stroke="url(#slashTrailGlow)"
                  strokeWidth="12"
                  strokeLinecap="round"
                  opacity={isSlash ? 0.98 : 0.65}
                />
                <path
                  d="M 180 118 L 620 298"
                  stroke="#FFFFFF"
                  strokeWidth="4.5"
                  strokeLinecap="round"
                  opacity={isSlash ? 1.0 : 0.5}
                />
                {/* Secondary Cross-Dimension Shear Beam */}
                <path
                  d="M 260 290 Q 400 215 545 125"
                  stroke="url(#slashTrailGlow)"
                  strokeWidth="8"
                  strokeLinecap="round"
                  opacity={isSlash ? 0.92 : 0.45}
                />
                <path
                  d="M 275 282 L 530 132"
                  stroke="#FFD000"
                  strokeWidth="3"
                  strokeLinecap="round"
                  opacity={isSlash ? 0.95 : 0.4}
                />

                {/* Giant Extruded 3D Comic Sound-Effect Lettering ("KRA-SLASH!!") */}
                {isSlash && (
                  <g transform="translate(400, 72) rotate(-5)">
                    <polygon
                      points="-145,-34 145,-40 135,16 -155,14"
                      fill="#0A0A0A"
                      transform="translate(5, 5)"
                    />
                    <polygon
                      points="-145,-34 145,-40 135,16 -155,14"
                      fill="#FFD000"
                      stroke="#0A0A0A"
                      strokeWidth="3.5"
                    />
                    <text
                      x="0"
                      y="2"
                      textAnchor="middle"
                      fill="#E62E2D"
                      stroke="#0A0A0A"
                      strokeWidth="4"
                      paintOrder="stroke"
                      fontSize="34"
                      fontWeight="900"
                      fontFamily="Bangers, Impact, sans-serif"
                      letterSpacing="3"
                    >
                      KRA-SLASH!!
                    </text>
                  </g>
                )}
              </g>
            )}

            {/* ======================================================== */}
            {/* DELAYED FINISHER SHOCKWAVE PILLAR (ON KNOCKOUT_CROSS)    */}
            {/* ======================================================== */}
            {(isKnockout || isResolve) && (
              <g id="delayed-finisher-shockwave-pillar" pointerEvents="none">
                <rect
                  x="335"
                  y="20"
                  width="130"
                  height="260"
                  fill="url(#shockwavePillarGrad)"
                  opacity={isKnockout ? "0.85" : "0.45"}
                />
                <ellipse cx="400" cy="280" rx="95" ry="14" fill="none" stroke="#FFD000" strokeWidth="3.5" />
                <ellipse cx="400" cy="280" rx="65" ry="8" fill="#E62E2D" opacity="0.6" />
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
                  {/* Skewed Comic "OBLITERATED! K.O.!" Finisher Stamp on Knockout */}
                  {(isKnockout || isResolve) && (
                    <g transform="translate(50, -32) rotate(-7)">
                      <rect x="-82" y="-22" width="168" height="36" fill="#0A0A0A" transform="translate(4, 4)" />
                      <rect
                        x="-82"
                        y="-22"
                        width="168"
                        height="36"
                        fill="#E62E2D"
                        stroke="#FFD000"
                        strokeWidth="3"
                      />
                      <text
                        x="2"
                        y="3"
                        fontSize="20"
                        fontWeight="900"
                        fontFamily="Bangers, Impact, sans-serif"
                        letterSpacing="2"
                        fill="#FFFDF5"
                        stroke="#0A0A0A"
                        strokeWidth="3"
                        paintOrder="stroke"
                        textAnchor="middle"
                      >
                        💥 OBLITERATED! K.O.!
                      </text>
                    </g>
                  )}
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

              {/* Chiburui "SWISH!" Comic Callout */}
              {isChiburui && (
                <g transform="translate(45, -18) rotate(-6)">
                  <rect x="-38" y="-14" width="76" height="22" fill="#FFD000" stroke="#0A0A0A" strokeWidth="2.5" />
                  <text x="0" y="2" fontSize="13" fontWeight="900" fontFamily="Bangers, Impact, sans-serif" letterSpacing="1" fill="#0A0A0A" textAnchor="middle">
                    SWISH!
                  </text>
                </g>
              )}

              {/* Sheathe Lock "*CLACK!*" & Blinding Golden Star-Flare */}
              {isSheathe && (
                <g transform="translate(45, -18) rotate(5)">
                  <rect x="-42" y="-14" width="84" height="22" fill="#00D4FF" stroke="#0A0A0A" strokeWidth="2.5" />
                  <text x="0" y="2" fontSize="13" fontWeight="900" fontFamily="Bangers, Impact, sans-serif" letterSpacing="1" fill="#0A0A0A" textAnchor="middle">
                    *CLACK!*
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

        {/* Combat Status Footer & Comic "TO BE CONTINUED..." Ribbon */}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-2 text-xs font-bold text-[#0A0A0A]">
          <div className="flex items-center gap-2">
            <span className="bg-[#0A0A0A] text-[#FFFDF5] font-mono text-[10px] px-2 py-0.5 uppercase">
              EXECUTION PANEL
            </span>
            <span className="font-bangers text-base text-[#E62E2D] uppercase tracking-wider">
              {isFocus
                ? "🎯 Target Locked — Awakening"
                : isDash
                ? "⚡ God-Speed Thunder Dash"
                : isSlash
                ? "⚔️ Dimension-Cleaving Katana Slash!"
                : isBlood
                ? "🩸 Crimson Ink Geyser & Lens Splatter"
                : isChiburui
                ? "🌀 Chiburui (Master Blood Flick)"
                : isSheathe
                ? "🗡️ Sheathe Lock (*KLICK-CLACK—TING!*)"
                : isKnockout
                ? "💥 Delayed Shockwave — K.O. Confirmed!"
                : "✨ Majestic Execution Complete"}
            </span>
          </div>

          {isResolve ? (
            <button
              onClick={finish}
              className="cartoon-btn px-5 py-2 bg-[#FFD000] hover:bg-[#FFE033] text-[#0A0A0A] font-bangers tracking-wider text-base uppercase cursor-pointer"
            >
              Continue Folio Battle ➔
            </button>
          ) : (
            <span className="bg-[#E91E63] text-[#FFFDF5] border-2 border-[#0A0A0A] px-2.5 py-0.5 font-bangers tracking-widest text-xs uppercase -skew-x-6">
              TO BE CONTINUED...
            </span>
          )}
        </div>
      </div>
    </div>
  );
};
