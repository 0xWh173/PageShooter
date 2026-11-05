import React from "react";
import type { CellProgress } from "@pageshooter/shared";
import { getCharacter } from "../registry.js";

interface DragonBallSpriteProps {
  characterId: string;
  progress: CellProgress;
  isDestroyed?: boolean;
  animationState?: "idle" | "stance" | "charge" | "fire" | "hit" | "defeat";
  frame?: number;
  className?: string;
  showAura?: boolean;
}

export const DragonBallSprite: React.FC<DragonBallSpriteProps> = ({
  characterId,
  progress,
  isDestroyed = false,
  animationState = "idle",
  frame = 0,
  className = "w-full h-full",
  showAura = false
}) => {
  const character = getCharacter("dragon-ball", characterId);
  const primary = character.primaryColor;
  const secondary = character.secondaryColor;
  const skin = character.skinColor;
  const attack = character.attack;

  // If destroyed and in defeat animation
  if (isDestroyed || animationState === "defeat") {
    return (
      <svg
        viewBox="0 0 64 80"
        className={`${className} overflow-visible`}
        style={{ imageRendering: "pixelated" }}
      >
        {/* Disintegration Pixel Dust / Cloud */}
        <g fill="#A89F91" opacity="0.6">
          <rect x="28" y="24" width="4" height="4" />
          <rect x="20" y="32" width="6" height="4" />
          <rect x="38" y="28" width="5" height="5" />
          <rect x="14" y="44" width="5" height="4" />
          <rect x="44" y="40" width="6" height="5" />
          <rect x="24" y="52" width="4" height="4" />
          <rect x="36" y="54" width="5" height="4" />
          <rect x="18" y="60" width="3" height="3" />
          <rect x="42" y="62" width="4" height="3" />
        </g>
        {/* Soft Smoke Puff */}
        <ellipse cx="32" cy="50" rx="18" ry="12" fill="#E8DEC8" opacity="0.4" />
        {/* Red X Cross-out Marker */}
        <line x1="18" y1="20" x2="46" y2="60" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" />
        <line x1="46" y1="20" x2="18" y2="60" stroke="#DC2626" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="32" cy="74" rx="20" ry="3" fill="#D4C5B3" opacity="0.5" />
      </svg>
    );
  }

  // Cell Stage 0: Empty Pedestal
  if (progress === 0 && animationState === "idle") {
    return (
      <svg
        viewBox="0 0 64 80"
        className={`${className} overflow-visible`}
        style={{ imageRendering: "pixelated" }}
      >
        <ellipse
          cx="32"
          cy="74"
          rx="18"
          ry="3.5"
          fill="none"
          stroke="#D4C5B3"
          strokeWidth="2"
          strokeDasharray="3 3"
        />
        <text
          x="32"
          y="44"
          textAnchor="middle"
          fontSize="8"
          fill="#B0A396"
          fontFamily="monospace"
        >
          [Vacant]
        </text>
      </svg>
    );
  }

  // Subtle breathing offset for idle animation
  const idleOffsetY = animationState === "idle" ? (frame % 2 === 0 ? 0 : 1) : 0;
  const isCharging = animationState === "charge" || animationState === "stance" || (progress === 5 && showAura);
  const isFiring = animationState === "fire";

  return (
    <svg
      viewBox="0 0 64 80"
      className={`${className} overflow-visible`}
      style={{ imageRendering: "pixelated" }}
    >
      <defs>
        {/* Radiant Ki Aura Filter & Gradient */}
        <linearGradient id={`aura-${characterId}`} x1="0" y1="1" x2="0" y2="0">
          <stop offset="0%" stopColor={attack.auraColor} stopOpacity="0.8" />
          <stop offset="70%" stopColor={attack.beamColor} stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.9" />
        </linearGradient>

        <radialGradient id={`sphere-${characterId}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="40%" stopColor={attack.beamColor} />
          <stop offset="100%" stopColor={attack.auraColor} stopOpacity="0.9" />
        </radialGradient>
      </defs>

      {/* Ground Pedestal / Shadow */}
      <ellipse
        cx="32"
        cy="74"
        rx={isCharging ? "22" : "18"}
        ry="3.5"
        fill="#75685C"
        opacity="0.15"
      />

      {/* ACTIVE KI AURA LAYER (For Stage 5 or Charging) */}
      {isCharging && (
        <g opacity={frame % 2 === 0 ? "0.9" : "0.75"}>
          {/* Flame-like jagged Ki aura polygons */}
          <polygon
            points="32,4 46,20 54,46 50,72 14,72 10,46 18,20"
            fill={`url(#aura-${characterId})`}
          />
          {/* Spark Particles */}
          <circle cx="20" cy="30" r="1.5" fill="#FFFFFF" />
          <circle cx="44" cy="24" r="1.5" fill="#FFFFFF" />
          <circle cx="14" cy="50" r="1.5" fill={attack.beamColor} />
          <circle cx="50" cy="54" r="1.5" fill={attack.beamColor} />
        </g>
      )}

      {/* MAIN CHARACTER SPRITE (Transformed by Idle & Stance) */}
      <g transform={`translate(0, ${idleOffsetY})`}>
        {/* ======================================================== */}
        {/* STAGE 3, 4, 5: LEGS & BOOTS                               */}
        {/* ======================================================== */}
        {progress >= 3 && (
          <g id="legs-layer">
            {/* Pants / Lower Gi */}
            <rect x="24" y="52" width="6" height="14" fill={primary} rx="1" />
            <rect x="34" y="52" width="6" height="14" fill={primary} rx="1" />
            {/* Belt / Sash Ties hanging down */}
            <rect x="30" y="50" width="4" height="8" fill={secondary} />

            {/* Martial Arts Boots */}
            <rect x="23" y="66" width="8" height="6" fill={secondary} rx="1" />
            <rect x="33" y="66" width="8" height="6" fill={secondary} rx="1" />
            {/* Boot trim / laces */}
            <rect x="25" y="68" width="4" height="1.5" fill="#DC2626" />
            <rect x="35" y="68" width="4" height="1.5" fill="#DC2626" />
          </g>
        )}

        {/* ======================================================== */}
        {/* STAGE 2, 3, 4, 5: BODY / TORSO                           */}
        {/* ======================================================== */}
        {progress >= 2 && (
          <g id="body-layer">
            {/* Chest / Gi Outer Vest */}
            <rect x="22" y="32" width="20" height="20" fill={primary} rx="2" />
            {/* Undershirt / Chest Inset */}
            <polygon points="28,32 36,32 34,42 30,42" fill={secondary} />
            <polygon points="30,34 34,34 32,38" fill={skin} />

            {/* Belt / Sash */}
            <rect x="22" y="48" width="20" height="4" fill={secondary} />

            {/* Character Special Armor Details */}
            {characterId === "vegeta" && (
              <g>
                {/* White Saiyan Chestplate with gold straps */}
                <rect x="22" y="32" width="20" height="17" fill="#F3F4F6" rx="2" />
                <rect x="26" y="38" width="12" height="3" fill="#EAB308" />
                <rect x="26" y="43" width="12" height="3" fill="#EAB308" />
              </g>
            )}

            {characterId === "piccolo" && (
              <g>
                {/* Purple Gi & White Cape Crest */}
                <rect x="20" y="30" width="24" height="5" fill="#F9FAFB" rx="2" />
              </g>
            )}

            {characterId === "frieza" && (
              <g>
                {/* Glossy Purple Chest Jewel */}
                <ellipse cx="32" cy="40" rx="4" ry="5" fill="#7E22CE" />
                {/* Tail */}
                <path d="M 42 50 Q 56 56 50 68" stroke="#F3F4F6" strokeWidth="4" fill="none" />
              </g>
            )}

            {characterId === "cell" && (
              <g>
                {/* Black Wings */}
                <polygon points="20,34 8,46 16,56 22,46" fill="#18181B" />
                <polygon points="44,34 56,46 48,56 42,46" fill="#18181B" />
                {/* Spotted Chest */}
                <circle cx="26" cy="38" r="1.5" fill="#14532D" />
                <circle cx="38" cy="42" r="1.5" fill="#14532D" />
              </g>
            )}

            {characterId === "majin-buu" && (
              <g>
                {/* Round Belly & Black Vest with gold trim */}
                <rect x="20" y="32" width="24" height="18" fill="#F472B6" rx="6" />
                <rect x="20" y="32" width="6" height="14" fill="#18181B" />
                <rect x="38" y="32" width="6" height="14" fill="#18181B" />
                <line x1="26" y1="32" x2="26" y2="46" stroke="#FACC15" strokeWidth="1.5" />
                <line x1="38" y1="32" x2="38" y2="46" stroke="#FACC15" strokeWidth="1.5" />
              </g>
            )}

            {characterId === "beerus" && (
              <g>
                {/* Egyptian deity collar */}
                <ellipse cx="32" cy="34" rx="10" ry="4" fill="#1E293B" stroke="#F59E0B" strokeWidth="1" />
              </g>
            )}

            {characterId === "whis" && (
              <g>
                {/* Angelic floating neck ring */}
                <ellipse cx="32" cy="30" rx="14" ry="4" fill="none" stroke="#22D3EE" strokeWidth="2" />
              </g>
            )}
          </g>
        )}

        {/* ======================================================== */}
        {/* STAGE 4, 5: ARMS, HANDS & ATTACK POSES                  */}
        {/* ======================================================== */}
        {progress >= 4 && (
          <g id="arms-layer">
            {!isCharging && !isFiring ? (
              // Normal Ready Stance Arms
              <g>
                {/* Left Arm & Wristband */}
                <rect x="16" y="34" width="6" height="14" fill={skin} rx="2" />
                <rect x="15" y="44" width="7" height="4" fill={secondary} rx="1" />
                <circle cx="18.5" cy="50" r="3" fill={skin} />

                {/* Right Arm & Wristband */}
                <rect x="42" y="34" width="6" height="14" fill={skin} rx="2" />
                <rect x="42" y="44" width="7" height="4" fill={secondary} rx="1" />
                <circle cx="45.5" cy="50" r="3" fill={skin} />
              </g>
            ) : isCharging ? (
              // Charging Kamehameha Stance (Cupped Hands at Hip)
              <g>
                <path d="M 22 36 Q 30 42 38 46" stroke={skin} strokeWidth="5" strokeLinecap="round" fill="none" />
                <path d="M 42 36 Q 44 42 40 48" stroke={skin} strokeWidth="5" strokeLinecap="round" fill="none" />
                {/* Energy Sphere growing between palms */}
                <circle
                  cx="42"
                  cy="46"
                  r={animationState === "charge" ? (8 + (frame % 3) * 2) : 6}
                  fill={`url(#sphere-${characterId})`}
                />
              </g>
            ) : (
              // Firing Attack Stance (Hands Thrust Forward)
              <g>
                <rect x="24" y="36" width="18" height="5" fill={skin} rx="2" />
                <rect x="36" y="35" width="4" height="7" fill={secondary} />
                <circle cx="44" cy="38.5" r="4" fill={skin} />
              </g>
            )}
          </g>
        )}

        {/* ======================================================== */}
        {/* STAGE 1, 2, 3, 4, 5: HEAD, HAIR & EXPRESSION              */}
        {/* ======================================================== */}
        {progress >= 1 && (
          <g id="head-layer">
            {/* Character Specific Hair / Horns / Ears Behind Head */}
            {characterId === "goku" && (
              <polygon
                points="32,4 20,8 12,16 10,24 18,22 14,30 22,26 24,12 36,8 44,14 52,18 48,24 54,26 44,30 42,22"
                fill="#18181B"
              />
            )}

            {characterId === "vegeta" && (
              <polygon
                points="32,2 24,10 16,14 14,24 22,22 24,16 32,8 40,16 42,22 50,24 48,14 40,10"
                fill="#18181B"
              />
            )}

            {characterId === "gohan" && (
              <polygon
                points="32,6 22,12 16,20 22,22 26,16 36,10 46,16 50,22 44,24 40,14"
                fill="#18181B"
              />
            )}

            {characterId === "piccolo" && (
              <g>
                {/* Pointed Ears & Antennae */}
                <polygon points="18,22 10,20 18,26" fill={skin} />
                <polygon points="46,22 54,20 46,26" fill={skin} />
                <line x1="28" y1="14" x2="22" y2="8" stroke={skin} strokeWidth="2" strokeLinecap="round" />
                <line x1="36" y1="14" x2="42" y2="8" stroke={skin} strokeWidth="2" strokeLinecap="round" />
              </g>
            )}

            {characterId === "trunks" && (
              <polygon
                points="32,8 20,12 14,20 16,28 22,26 22,18 32,14 42,18 42,26 48,28 50,20 44,12"
                fill="#A78BFA"
              />
            )}

            {characterId === "cell" && (
              <polygon
                points="32,6 18,4 22,18 32,14 42,18 46,4"
                fill="#15803D"
              />
            )}

            {characterId === "majin-buu" && (
              <path
                d="M 32 14 Q 30 4 40 2 Q 44 4 36 10"
                stroke={skin}
                strokeWidth="4"
                strokeLinecap="round"
                fill="none"
              />
            )}

            {characterId === "beerus" && (
              <g>
                {/* Large pointed feline deity ears */}
                <polygon points="22,16 12,2 26,12" fill={skin} />
                <polygon points="42,16 52,2 38,12" fill={skin} />
              </g>
            )}

            {characterId === "whis" && (
              <path
                d="M 28 16 Q 32 0 38 2 Q 40 10 36 16"
                fill="#FFFFFF"
              />
            )}

            {/* Base Face Circle / Oval */}
            <circle cx="32" cy="22" r="10" fill={skin} />

            {/* Krillin Forehead Dots */}
            {characterId === "krillin" && (
              <g fill="#B45309">
                <circle cx="30" cy="16" r="0.8" />
                <circle cx="34" cy="16" r="0.8" />
                <circle cx="30" cy="18" r="0.8" />
                <circle cx="34" cy="18" r="0.8" />
                <circle cx="30" cy="20" r="0.8" />
                <circle cx="34" cy="20" r="0.8" />
              </g>
            )}

            {/* Frieza Head Jewel */}
            {characterId === "frieza" && (
              <ellipse cx="32" cy="16" rx="4" ry="2.5" fill="#7E22CE" />
            )}

            {/* Eyes & Intense Expression */}
            <circle cx="28" cy="22" r="1.2" fill="#18181B" />
            <circle cx="36" cy="22" r="1.2" fill="#18181B" />
            {/* Determined eyebrows */}
            <line x1="26" y1="19" x2="30" y2="21" stroke="#18181B" strokeWidth="1.2" />
            <line x1="38" y1="21" x2="34" y2="19" stroke="#18181B" strokeWidth="1.2" />

            {/* Confident / Smirking Mouth */}
            <path d="M 30 27 Q 32 29 34 27" stroke="#18181B" strokeWidth="1" fill="none" />
          </g>
        )}
      </g>
    </svg>
  );
};
