import React from "react";
import type { CellProgress } from "@pageshooter/shared";
import type { CharacterDefinition } from "../types.js";
import { getCharacter } from "../registry.js";

export interface HandDrawnStickmanProps {
  characterId: string;
  progress: CellProgress;
  isDestroyed?: boolean;
  pose?:
    | "idle"
    | "ready"
    | "aim"
    | "fire"
    | "recoil"
    | "defeat"
    | "dash"
    | "slash"
    | "stand_up"
    | "chiburui"
    | "sheathe"
    | "sheathed";
  className?: string;
  showWeapon?: boolean;
}

/**
 * Universal Hand-Drawn Stick-Figure SVG Component
 * - 100x120 viewBox coordinate system
 * - Consistent ground baseline at Y=110
 * - Organic black pen ink outlines (#1F1A16) with hand-drawn aesthetic
 * - Strict 5-stage progression with 100% character identity continuity
 * - Armed State (Bullet / Stage 5): Transforms into the Shadow Scythe/Katana Warrior
 *   inspired directly by the user's reference drawing.
 */
export const HandDrawnStickman: React.FC<HandDrawnStickmanProps> = ({
  characterId,
  progress,
  isDestroyed = false,
  pose = "idle",
  className = "w-full h-full",
  showWeapon = false
}) => {
  const char: CharacterDefinition = getCharacter(characterId);
  const tint = char.tintColor || "#D9822B";

  const isDead = isDestroyed || pose === "defeat";
  const isAimed = pose === "aim" || pose === "fire";
  const hasGun =
    progress >= 5 ||
    showWeapon ||
    isAimed ||
    pose === "dash" ||
    pose === "slash" ||
    pose === "stand_up" ||
    pose === "chiburui" ||
    pose === "sheathe" ||
    pose === "sheathed";

  return (
    <svg
      viewBox="0 0 100 120"
      className={`${className} overflow-visible select-none`}
      style={{ shapeRendering: "geometricPrecision" }}
      aria-label={`${char.name} (${char.title}) - Stage ${progress} ${isDead ? "(Eliminated)" : ""}`}
    >
      {/* 1. Smoky Dojo Ground Shadow (Baseline Y=111) */}
      <ellipse
        cx="50"
        cy="111"
        rx={progress >= 3 ? "25" : "18"}
        ry="3.5"
        fill="rgba(15, 18, 21, 0.25)"
      />

      {/* 2. Stage 0: Uninked Manga Panel Silhouette */}
      {progress === 0 && !isDead && (
        <g id="manga-samurai-stage-0" opacity="0.35">
          <circle cx="50" cy="27" r="13.5" stroke="#1C1917" strokeWidth="1.8" strokeDasharray="3 3" fill="none" />
          {/* Ghosted Headband Tails */}
          <path d="M 37 23 Q 24 20 16 25" stroke="#1C1917" strokeWidth="1.5" strokeDasharray="3 2" fill="none" />
          <ellipse cx="50" cy="109" rx="16" ry="2.8" stroke="#1C1917" strokeWidth="1.5" strokeDasharray="3 3" fill="none" />
        </g>
      )}

      {/* 3. STAGE 5 / ARMED STATE: Manga Samurai with Gleaming Silver Katana (Matching Video Frame 00:00 & 00:06) */}
      {hasGun && !isDead ? (
        renderMangaSamuraiArmed(char, pose, tint)
      ) : progress > 0 && !isDead ? (
        /* 4. STAGES 1–4: PROGRESSIVE MANGA SAMURAI STICKMAN (Matching Video Protagonist) */
        <g id={`manga-samurai-stage-${progress}`}>
          {/* STAGE 4 COMPONENT (At Waist): Ornate Black & Gold Filigree Scabbard (Saya) */}
          {progress >= 4 && renderOrnateGoldScabbard(42, 66, 14, 96)}

          {/* STAGE 3: Wide Flowing Samurai Hakama Trousers & Planted Stance */}
          {progress >= 3 && (
            <g id="manga-samurai-hakama">
              {pose === "recoil" ? (
                <g>
                  <path d="M 41 68 L 24 102 L 34 105 L 47 72 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="1" />
                  <path d="M 49 68 L 58 103 L 68 101 L 55 70 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="1" />
                </g>
              ) : (
                <g>
                  {/* Wide Left Hakama Leg */}
                  <path
                    d="M 39 67 L 23 103 L 38 105 L 47 73 Z"
                    fill="#0F1215"
                    stroke="#2A323B"
                    strokeWidth="1.1"
                    strokeLinejoin="round"
                  />
                  {/* Wide Right Hakama Leg */}
                  <path
                    d="M 48 67 L 54 105 L 70 103 L 57 67 Z"
                    fill="#0F1215"
                    stroke="#2A323B"
                    strokeWidth="1.1"
                    strokeLinejoin="round"
                  />
                  {/* Hakama Cloth Pleat Highlights */}
                  <line x1="39" y1="72" x2="30" y2="101" stroke="#36404A" strokeWidth="1" />
                  <line x1="53" y1="72" x2="61" y2="101" stroke="#36404A" strokeWidth="1" />
                  {/* Planted Feet */}
                  <path d="M 21 108 L 32 108 L 30 104 L 24 104 Z" fill="#0F1215" />
                  <path d="M 61 108 L 72 108 L 68 104 L 62 104 Z" fill="#0F1215" />
                </g>
              )}
            </g>
          )}

          {/* STAGE 2: Sleeveless Black Samurai Gi / Haori with V-Neck Lapel & Grey Obi Sash */}
          {progress >= 2 && (
            <g id="manga-samurai-torso">
              {/* Sleeveless Gi Torso Silhouette */}
              <path
                d="M 37 40 L 58 40 L 56 67 L 39 67 Z"
                fill="#0F1215"
                stroke="#2A323B"
                strokeWidth="1.1"
                strokeLinejoin="round"
              />
              {/* Sharp Shoulder Caps (Matching Video Frame 00:00) */}
              <polygon points="34,39 43,39 40,46" fill="#0F1215" stroke="#36404A" strokeWidth="1" />
              <polygon points="52,39 61,39 56,46" fill="#0F1215" stroke="#36404A" strokeWidth="1" />
              {/* V-Neck Gi Crossover Lapel Lines */}
              <line x1="42" y1="40" x2="49" y2="57" stroke="#3E4852" strokeWidth="1.5" />
              <line x1="53" y1="40" x2="46" y2="52" stroke="#3E4852" strokeWidth="1.5" />
              {/* Grey Waist Sash (Obi) with Subtle Character Tint Thread */}
              <rect x="38" y="61" width="19" height="6.5" rx="1" fill="#3B434C" stroke="#1C1917" strokeWidth="1" />
              <line x1="39" y1="64" x2="56" y2="64" stroke={tint} strokeWidth="1.3" opacity="0.85" />
              {renderClothing(char.clothing, tint)}
            </g>
          )}

          {/* STAGE 4: Sleek Black Martial Arms & Diamond-Wrapped Katana Hilt Grip */}
          {progress >= 4 && (
            <g id="manga-samurai-arms">
              {pose === "recoil" ? (
                <g stroke="#0F1215" strokeWidth="4" strokeLinecap="round">
                  <line x1="38" y1="43" x2="22" y2="32" />
                  <line x1="57" y1="43" x2="72" y2="30" />
                </g>
              ) : (
                <g>
                  {/* Left Arm holding ornate scabbard */}
                  <path
                    d="M 38 43 Q 29 54 36 65"
                    fill="none"
                    stroke="#0F1215"
                    strokeWidth="4.2"
                    strokeLinecap="round"
                  />
                  {/* Sheathed Diamond-Wrapped Katana Hilt (Tsuka) & Golden Tsuba Guard */}
                  <line x1="42" y1="66" x2="55" y2="53" stroke="#1C1917" strokeWidth="4.2" strokeLinecap="round" />
                  <line x1="44" y1="64" x2="54" y2="54" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="1.8 1.8" />
                  {/* Golden Square Tsuba Guard */}
                  <rect
                    x="40"
                    y="63"
                    width="5.5"
                    height="2.5"
                    fill="#D4AF37"
                    stroke="#1C1917"
                    strokeWidth="0.6"
                    transform="rotate(45 42 65)"
                  />
                  {/* Right Arm poised on Katana Hilt */}
                  <path
                    d="M 57 43 Q 66 50 53 56"
                    fill="none"
                    stroke="#0F1215"
                    strokeWidth="4.2"
                    strokeLinecap="round"
                  />
                  {/* 4-Point White Star Glint at Tsuba (Teasing Stage 5 Draw) */}
                  <g transform="translate(43, 64)">
                    <polygon points="0,-6 1.5,-1.5 6,0 1.5,1.5 0,6 -1.5,1.5 -6,0 -1.5,-1.5" fill="#FFFFFF" />
                  </g>
                </g>
              )}
            </g>
          )}

          {/* STAGE 1+: Pitch-Black Manga Samurai Head, Flowing Headband Tails & Glowing White Eyes */}
          <g id="stickman-head">
            {/* Flowing Black Headband Tails (Hachimaki) Streaming Behind Head */}
            <path
              d="M 36 22 Q 20 17 9 22 Q 19 26 35 25 Z"
              fill="#0F1215"
              stroke="#2A323B"
              strokeWidth="0.9"
            />
            <path
              d="M 35 26 Q 21 27 12 34 Q 23 34 36 29 Z"
              fill="#0F1215"
              stroke="#2A323B"
              strokeWidth="0.9"
            />

            {/* Pitch-Black Round Samurai Head with Subtle Rim Contour */}
            <circle
              cx="48"
              cy="25"
              r="13.5"
              fill="#0F1215"
              stroke="#36404A"
              strokeWidth="1.2"
            />

            {/* Headband Brow Band */}
            <path
              d="M 35 21 Q 48 18 61 21"
              fill="none"
              stroke="#262E36"
              strokeWidth="2.8"
            />

            {/* Sharp Glowing White Angular Samurai Eyes (Exact Match to Video Frame 00:00 & 00:09) */}
            {pose === "recoil" ? (
              <g fill="#FFFFFF">
                <circle cx="44" cy="25" r="2.8" />
                <circle cx="53" cy="25" r="2.8" />
              </g>
            ) : (
              <g fill="#FFFFFF">
                <polygon points="41,25 47,27 46,24" />
                <polygon points="50,26 57,24 52,23" />
              </g>
            )}

            {/* Subtle Character Identity Overlays */}
            {char.hair !== "bald" && renderHair(char.hair, 48, 25, 13.5, tint)}
            {char.hat !== "none" && renderHat(char.hat, 48, 23, 13.5, tint)}
            {char.eyewear !== "none" && renderEyewear(char.eyewear, 48, 25)}
            {char.facialHair !== "none" && renderFacialHair(char.facialHair, 48, 25)}
            {char.accessory !== "none" && renderAccessory(char.accessory, 48, 25, 13.5, tint)}
          </g>
        </g>
      ) : null}

      {/* 5. DEFEATED / DESTROYED STATE: Collapsed Black Stickman in Crimson Splatter (Video Frame 00:03) */}
      {isDead && (
        <g id="stickman-defeated">
          {/* Crimson Ground Pool */}
          <ellipse cx="50" cy="106" rx="30" ry="4.5" fill="#8B0000" opacity="0.85" />
          <circle cx="26" cy="96" r="2.2" fill="#B91C1C" />
          <circle cx="72" cy="98" r="1.8" fill="#B91C1C" />

          {/* Collapsed Black Stickman Silhouette Lying on Ground (Matching Video Frame 00:03) */}
          <circle cx="26" cy="86" r="10.5" fill="#0F1215" stroke="#2A323B" strokeWidth="1" />
          {/* Torso & Limbs Slumped on Floor */}
          <line x1="33" y1="92" x2="54" y2="102" stroke="#0F1215" strokeWidth="6.5" strokeLinecap="round" />
          <line x1="54" y1="102" x2="76" y2="96" stroke="#0F1215" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="54" y1="102" x2="78" y2="104" stroke="#0F1215" strokeWidth="5.5" strokeLinecap="round" />
          <line x1="38" y1="94" x2="48" y2="82" stroke="#0F1215" strokeWidth="4.5" strokeLinecap="round" />

          {/* Crimson Slash Line Across Defeated Panel */}
          <line x1="18" y1="22" x2="82" y2="96" stroke="#B91C1C" strokeWidth="3.5" strokeLinecap="round" />

          {/* Manga K.O. Stamp */}
          <g transform="rotate(-5, 50, 52)">
            <rect x="24" y="42" width="52" height="18" rx="2" fill="#0F1215" stroke="#B91C1C" strokeWidth="2" />
            <text
              x="50"
              y="55"
              fontSize="11"
              fontWeight="900"
              fontFamily="Bangers, Impact, sans-serif"
              letterSpacing="1.5"
              fill="#FAF4E6"
              textAnchor="middle"
            >
              SLAIN • K.O.
            </text>
          </g>
        </g>
      )}
    </svg>
  );
};

/**
 * Ornate Black Lacquered Scabbard (Saya) with Gold Filigree Scrollwork
 * Modeled directly after Frame 00:07-00:09 of gemini_generated_video_b4b6dfd9.mp4
 */
function renderOrnateGoldScabbard(x1 = 42, y1 = 66, x2 = 14, y2 = 96) {
  return (
    <g id="ornate-gold-filigree-scabbard">
      {/* Black Lacquered Saya Body */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#0F1215"
        strokeWidth="5.2"
        strokeLinecap="round"
      />
      {/* Gold Filigree Scrollwork Highlight along Scabbard */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#D4AF37"
        strokeWidth="1.5"
        strokeDasharray="4 2.5"
        strokeLinecap="round"
      />
      {/* Ornate Golden Koiguchi Collar */}
      <ellipse
        cx={x1}
        cy={y1}
        rx="3.4"
        ry="2.2"
        fill="#D4AF37"
        stroke="#1C1917"
        strokeWidth="0.8"
      />
    </g>
  );
}

/**
 * Stage 5 / Armed State:
 * Manga Samurai Stickman with Gleaming Silver Steel Katana, Diamond-Wrapped Hilt,
 * Flowing Black Headband Tails, and 4-Point White Star Blade Glint
 * Modeled directly after Frames 00:00, 00:01, 00:06, and 00:08 of gemini_generated_video_b4b6dfd9.mp4
 */
function renderMangaSamuraiArmed(char: CharacterDefinition, pose: string, tint: string) {
  const isDash = pose === "dash";
  const isChiburui = pose === "chiburui";
  const isSheathe = pose === "sheathe";
  const isSheathed = pose === "sheathed";

  const defs = (
    <defs>
      <linearGradient id="silverKatanaBlade" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#94A3B8" />
        <stop offset="50%" stopColor="#F8FAFC" />
        <stop offset="100%" stopColor="#FFFFFF" />
      </linearGradient>
    </defs>
  );

  // 1. DASH / SLASH POSE (Frame 00:01 of video: Low lunging horizontal katana thrust)
  if (isDash) {
    return (
      <g id="manga-samurai-dash">
        {defs}
        {/* Flowing Headband Tails Streaming Back */}
        <path d="M 46 28 Q 22 22 4 28 Q 20 33 44 32 Z" fill="#0F1215" />
        <path d="M 44 33 Q 20 34 8 42 Q 24 40 45 36 Z" fill="#0F1215" />

        {/* Low Lunging Hakama & Gi Silhouette */}
        <path d="M 38 64 L 10 98 L 24 102 L 48 72 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="1" />
        <path d="M 48 64 L 64 100 L 78 98 L 58 64 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="1" />
        <path d="M 40 40 L 62 38 L 56 68 L 36 68 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="1" />

        {/* Ornate Scabbard at Hip */}
        {renderOrnateGoldScabbard(38, 66, 8, 76)}

        {/* Forward Head & Glowing White Eye */}
        <circle cx="56" cy="27" r="13" fill="#0F1215" stroke="#36404A" strokeWidth="1.1" />
        <polygon points="55,27 64,25 58,23" fill="#FFFFFF" />

        {/* Extended Arm & Horizontal Piercing Silver/Crimson Katana */}
        <line x1="54" y1="45" x2="72" y2="45" stroke="#0F1215" strokeWidth="4.8" strokeLinecap="round" />
        {/* Diamond-Wrapped Hilt & Gold Tsuba */}
        <line x1="64" y1="45" x2="78" y2="45" stroke="#1C1917" strokeWidth="4.2" strokeLinecap="round" />
        <line x1="66" y1="45" x2="76" y2="45" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="1.8 1.8" />
        <rect x="78" y="40" width="2.5" height="10" fill="#D4AF37" />
        {/* Gleaming Silver Katana Blade */}
        <path d="M 80 43 L 122 42 L 128 45 L 122 47 L 80 47 Z" fill="url(#silverKatanaBlade)" stroke="#E2E8F0" strokeWidth="0.8" />
      </g>
    );
  }

  // 2. ARMED CROUCH / CHIBURUI / NOTO SHEATHE STANCE (Frames 00:00, 00:06, 00:07, 00:08, 00:09)
  return (
    <g id="manga-samurai-armed-stance">
      {defs}
      {/* Ground Shadow */}
      <ellipse cx="50" cy="111" rx="26" ry="3.5" fill="rgba(15, 18, 21, 0.3)" />

      {/* Ornate Gold-Filigree Scabbard at Hip */}
      {renderOrnateGoldScabbard(42, 66, 14, 96)}

      {/* Wide Samurai Hakama Trousers (Matching Frame 00:00 & 00:03) */}
      <path
        d="M 38 66 L 20 103 L 36 105 L 47 73 Z"
        fill="#0F1215"
        stroke="#2A323B"
        strokeWidth="1.1"
      />
      <path
        d="M 48 66 L 56 105 L 73 103 L 58 66 Z"
        fill="#0F1215"
        stroke="#2A323B"
        strokeWidth="1.1"
      />
      <line x1="38" y1="72" x2="28" y2="101" stroke="#36404A" strokeWidth="1" />
      <line x1="54" y1="72" x2="63" y2="101" stroke="#36404A" strokeWidth="1" />
      <path d="M 17 108 L 29 108 L 27 104 L 20 104 Z" fill="#0F1215" />
      <path d="M 63 108 L 75 108 L 71 104 L 64 104 Z" fill="#0F1215" />

      {/* Sleeveless Samurai Gi Torso & Grey Obi Sash */}
      <path d="M 37 40 L 58 40 L 56 67 L 39 67 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="1.1" />
      <polygon points="34,39 43,39 40,46" fill="#0F1215" stroke="#36404A" strokeWidth="1" />
      <polygon points="52,39 61,39 56,46" fill="#0F1215" stroke="#36404A" strokeWidth="1" />
      <line x1="42" y1="40" x2="49" y2="57" stroke="#3E4852" strokeWidth="1.5" />
      <line x1="53" y1="40" x2="46" y2="52" stroke="#3E4852" strokeWidth="1.5" />
      <rect x="38" y="61" width="19" height="6.5" rx="1" fill="#3B434C" stroke="#1C1917" strokeWidth="1" />
      <line x1="39" y1="64" x2="56" y2="64" stroke={tint} strokeWidth="1.3" opacity="0.85" />

      {/* Left Arm on Scabbard */}
      <path d="M 38 43 Q 29 54 36 65" fill="none" stroke="#0F1215" strokeWidth="4.2" strokeLinecap="round" />

      {/* KATANA & RIGHT ARM BY PHASE */}
      {isSheathe || isSheathed ? (
        /* Frame 00:08-00:09: Katana Locked into Ornate Gold Scabbard with Golden Metal Sparks */
        <g id="manga-katana-sheathed-lock">
          <line x1="42" y1="66" x2="55" y2="53" stroke="#1C1917" strokeWidth="4.4" strokeLinecap="round" />
          <line x1="44" y1="64" x2="54" y2="54" stroke="#CBD5E1" strokeWidth="2.2" strokeDasharray="1.8 1.8" />
          <rect x="40" y="63" width="6" height="2.6" fill="#D4AF37" transform="rotate(45 42 65)" />
          <path d="M 57 43 Q 65 50 53 55" fill="none" stroke="#0F1215" strokeWidth="4.2" strokeLinecap="round" />
          {isSheathe && (
            <g id="golden-sheathe-sparks" transform="translate(42, 65)">
              <line x1="-2" y1="-3" x2="-9" y2="-10" stroke="#F59E0B" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="3" y1="-4" x2="9" y2="-12" stroke="#FDE047" strokeWidth="1.6" strokeLinecap="round" />
              <line x1="-4" y1="2" x2="-11" y2="6" stroke="#F59E0B" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="0" cy="0" r="2.5" fill="#FEF08A" />
            </g>
          )}
        </g>
      ) : isChiburui ? (
        /* Frame 00:06: Close-Up Chiburui Whipping Blood Arc Off Spotless Silver Blade */
        <g id="manga-katana-chiburui">
          <path d="M 56 43 Q 42 52 32 58" fill="none" stroke="#0F1215" strokeWidth="4.2" strokeLinecap="round" />
          {/* Diamond-Wrapped Hilt & Gold Tsuba */}
          <line x1="36" y1="60" x2="26" y2="53" stroke="#1C1917" strokeWidth="4.2" strokeLinecap="round" />
          <line x1="35" y1="59" x2="27" y2="54" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="1.8 1.8" />
          <rect x="24" y="49" width="2.5" height="8" fill="#D4AF37" transform="rotate(35 25 53)" />
          {/* Gleaming Silver Katana Blade Pointed Forward-Left */}
          <path
            d="M 25 51 L -6 31 L -10 27 L -4 28 L 27 48 Z"
            fill="url(#silverKatanaBlade)"
            stroke="#FFFFFF"
            strokeWidth="0.9"
          />
          {/* 4-Point White Star Glint on Silver Blade (Matching Frame 00:06) */}
          <g transform="translate(8, 39)">
            <polygon points="0,-7 1.5,-1.5 7,0 1.5,1.5 0,7 -1.5,1.5 -7,0 -1.5,-1.5" fill="#FFFFFF" />
          </g>
          {/* Flinging Crimson Droplets Arc */}
          <circle cx="-8" cy="44" r="2.2" fill="#DC2626" />
          <circle cx="-14" cy="52" r="1.8" fill="#B91C1C" />
          <circle cx="-4" cy="56" r="1.5" fill="#DC2626" />
        </g>
      ) : (
        /* Frame 00:00: Iconic Low-Stance Silver Katana Held Across with 4-Point White Star Glint */
        <g id="manga-katana-drawn-glint">
          <path d="M 56 43 Q 46 53 36 55" fill="none" stroke="#0F1215" strokeWidth="4.2" strokeLinecap="round" />
          {/* Diamond-Wrapped Hilt (Tsuka-ito) */}
          <line x1="26" y1="50" x2="39" y2="56" stroke="#1C1917" strokeWidth="4.4" strokeLinecap="round" />
          <line x1="28" y1="51" x2="38" y2="55" stroke="#CBD5E1" strokeWidth="2" strokeDasharray="1.8 1.8" />
          {/* Golden Tsuba Guard */}
          <rect x="38" y="51" width="2.4" height="9" fill="#D4AF37" transform="rotate(22 39 55)" />
          {/* Curved Gleaming Silver Katana Blade */}
          <path
            d="M 40 54 Q 64 64 88 68 L 93 67 Q 66 60 41 51 Z"
            fill="url(#silverKatanaBlade)"
            stroke="#FFFFFF"
            strokeWidth="0.9"
          />
          {/* 4-Point Bright White Star Glint on Blade Tip (Exact Match to Video Frame 00:00) */}
          <g transform="translate(76, 65)">
            <polygon points="0,-8 1.6,-1.6 8,0 1.6,1.6 0,8 -1.6,1.6 -8,0 -1.6,-1.6" fill="#FFFFFF" />
            <circle cx="0" cy="0" r="2" fill="#FFFFFF" />
          </g>
        </g>
      )}

      {/* Pitch-Black Samurai Head, Flowing Headband Tails & Glowing White Angular Eyes */}
      <g id="manga-samurai-head">
        {/* Flowing Headband Tails */}
        <path d="M 36 22 Q 18 16 6 21 Q 18 26 35 25 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="0.9" />
        <path d="M 35 26 Q 19 27 10 35 Q 22 34 36 29 Z" fill="#0F1215" stroke="#2A323B" strokeWidth="0.9" />

        <circle cx="48" cy="25" r="13.5" fill="#0F1215" stroke="#36404A" strokeWidth="1.2" />
        <path d="M 35 21 Q 48 18 61 21" fill="none" stroke="#262E36" strokeWidth="2.8" />

        {/* Glowing White Angular Samurai Eyes */}
        <g fill="#FFFFFF">
          <polygon points="41,25 47,27 46,24" />
          <polygon points="50,26 57,24 52,23" />
        </g>

        {/* Character Identity Traits */}
        {char.hair !== "bald" && renderHair(char.hair, 48, 25, 13.5, tint)}
        {char.hat !== "none" && renderHat(char.hat, 48, 23, 13.5, tint)}
        {char.eyewear !== "none" && renderEyewear(char.eyewear, 48, 25)}
        {char.facialHair !== "none" && renderFacialHair(char.facialHair, 48, 25)}
        {char.accessory !== "none" && renderAccessory(char.accessory, 48, 25, 13.5, tint)}
      </g>
    </g>
  );
}

function renderHair(hair: string, x: number, y: number, r: number, tint: string) {
  switch (hair) {
    case "spiky":
      return (
        <g id="hair-spiky" stroke="#1F1A16" strokeWidth="2.8" fill="#1F1A16">
          <polygon points={`${x - 12},${y - 10} ${x - 16},${y - 24} ${x - 6},${y - 14} ${x},${y - 28} ${x + 8},${y - 14} ${x + 16},${y - 22} ${x + 12},${y - 10}`} />
        </g>
      );
    case "afro_curly":
      return (
        <g id="hair-afro" stroke="#1F1A16" strokeWidth="2.5" fill="#1F1A16">
          <circle cx={x - 12} cy={y - 8} r="6" />
          <circle cx={x - 14} cy={y - 15} r="6" />
          <circle cx={x - 7} cy={y - 20} r="6" />
          <circle cx={x} cy={y - 22} r="6.5" />
          <circle cx={x + 7} cy={y - 20} r="6" />
          <circle cx={x + 14} cy={y - 15} r="6" />
          <circle cx={x + 12} cy={y - 8} r="6" />
        </g>
      );
    case "straight_part":
      return (
        <g id="hair-part" stroke="#1F1A16" strokeWidth="2.5" fill="#1F1A16">
          <path d={`M ${x - 14} ${y - 4} Q ${x - 10} ${y - 16} ${x - 2} ${y - 16} Q ${x - 4} ${y - 6} ${x - 14} ${y - 4} Z`} />
          <path d={`M ${x - 2} ${y - 16} Q ${x + 10} ${y - 16} ${x + 14} ${y - 4} Q ${x + 4} ${y - 6} ${x - 2} ${y - 16} Z`} />
        </g>
      );
    case "messy":
      return (
        <g id="hair-messy" stroke="#1F1A16" strokeWidth="2.5" fill="none">
          <path d={`M ${x - 13} ${y - 8} Q ${x - 10} ${y - 22} ${x - 4} ${y - 14} Q ${x + 2} ${y - 24} ${x + 7} ${y - 14} Q ${x + 13} ${y - 20} ${x + 13} ${y - 8}`} />
        </g>
      );
    case "ponytail":
      return (
        <g id="hair-ponytail" stroke="#1F1A16" strokeWidth="2.8" fill="#1F1A16">
          <path d={`M ${x - 12} ${y - 8} Q ${x} ${y - 18} ${x + 12} ${y - 8} Z`} />
          <circle cx={x + 14} cy={y - 8} r="3" fill={tint} stroke="#1F1A16" strokeWidth="1.5" />
          <path d={`M ${x + 16} ${y - 8} Q ${x + 26} ${y - 4} ${x + 24} ${y + 12}`} fill="none" strokeWidth="3" />
        </g>
      );
    case "mohawk":
      return (
        <g id="hair-mohawk" fill={tint} stroke="#1F1A16" strokeWidth="2.5">
          <polygon points={`${x - 4},${y - 14} ${x - 3},${y - 30} ${x + 3},${y - 30} ${x + 4},${y - 14}`} />
        </g>
      );
    case "bob_bangs":
      return (
        <g id="hair-bob" stroke="#1F1A16" strokeWidth="2.5" fill="#1F1A16">
          <path d={`M ${x - 15} ${y + 2} L ${x - 15} ${y - 12} Q ${x} ${y - 20} ${x + 15} ${y - 12} L ${x + 15} ${y + 2} L ${x + 11} ${y - 2} Q ${x} ${y - 8} ${x - 11} ${y - 2} Z`} />
        </g>
      );
    case "short_neat":
      return (
        <g id="hair-short" stroke="#1F1A16" strokeWidth="2.5" fill="#1F1A16">
          <path d={`M ${x - 14} ${y - 6} Q ${x} ${y - 20} ${x + 14} ${y - 6} Q ${x} ${y - 12} ${x - 14} ${y - 6} Z`} />
        </g>
      );
    case "side_part":
      return (
        <g id="hair-side-part" stroke="#1F1A16" strokeWidth="2.5" fill="#1F1A16">
          <path d={`M ${x - 14} ${y - 4} Q ${x - 5} ${y - 20} ${x + 14} ${y - 8} Q ${x} ${y - 10} ${x - 14} ${y - 4} Z`} />
        </g>
      );
    case "wavy_long":
      return (
        <g id="hair-wavy" stroke="#1F1A16" strokeWidth="2.5" fill="none">
          <path d={`M ${x - 13} ${y - 4} Q ${x - 18} ${y + 8} ${x - 15} ${y + 18}`} />
          <path d={`M ${x + 13} ${y - 4} Q ${x + 18} ${y + 8} ${x + 15} ${y + 18}`} />
        </g>
      );
    case "bald":
    default:
      return null;
  }
}

function renderHat(hat: string, x: number, y: number, r: number, tint: string) {
  switch (hat) {
    case "detective":
      return (
        <g id="hat-detective">
          <ellipse cx={x} cy={y - 10} rx="22" ry="5.5" fill="#4A3728" stroke="#1F1A16" strokeWidth="2.5" />
          <path d={`M ${x - 13} ${y - 10} L ${x - 10} ${y - 24} Q ${x} ${y - 26} ${x + 10} ${y - 24} L ${x + 13} ${y - 10} Z`} fill="#5C4533" stroke="#1F1A16" strokeWidth="2.5" />
          <rect x={x - 13} y={y - 14} width="26" height="4" fill={tint} />
        </g>
      );
    case "pirate":
      return (
        <g id="hat-pirate">
          <path d={`M ${x - 22} ${y - 6} Q ${x} ${y - 10} ${x + 22} ${y - 6} Q ${x + 16} ${y - 28} ${x} ${y - 22} Q ${x - 16} ${y - 28} ${x - 22} ${y - 6} Z`} fill="#1F1A16" stroke="#1F1A16" strokeWidth="2.5" />
          <circle cx={x} cy={y - 14} r="3" fill="#FFFDF8" stroke="none" />
        </g>
      );
    case "chef":
      return (
        <g id="hat-chef">
          <circle cx={x - 8} cy={y - 24} r="7" fill="#FFFDF8" stroke="#1F1A16" strokeWidth="2.5" />
          <circle cx={x + 8} cy={y - 24} r="7" fill="#FFFDF8" stroke="#1F1A16" strokeWidth="2.5" />
          <circle cx={x} cy={y - 28} r="8" fill="#FFFDF8" stroke="#1F1A16" strokeWidth="2.5" />
          <rect x={x - 12} y={y - 18} width="24" height="8" fill="#FFFDF8" stroke="#1F1A16" strokeWidth="2.5" />
        </g>
      );
    case "tophat":
      return (
        <g id="hat-tophat">
          <ellipse cx={x} cy={y - 10} rx="20" ry="4.5" fill="#1F1A16" stroke="#1F1A16" strokeWidth="2" />
          <rect x={x - 11} y={y - 32} width="22" height="22" fill="#1F1A16" stroke="#1F1A16" strokeWidth="2.5" />
          <rect x={x - 11} y={y - 16} width="22" height="5" fill={tint} stroke="none" />
        </g>
      );
    case "viking":
      return (
        <g id="hat-viking">
          <path d={`M ${x - 15} ${y - 4} Q ${x} ${y - 22} ${x + 15} ${y - 4} Z`} fill="#D4B895" stroke="#1F1A16" strokeWidth="3" />
          <path d={`M ${x - 13} ${y - 12} Q ${x - 26} ${y - 24} ${x - 22} ${y - 32} Q ${x - 17} ${y - 20} ${x - 11} ${y - 15}`} fill="#FFFDF8" stroke="#1F1A16" strokeWidth="2.5" />
          <path d={`M ${x + 13} ${y - 12} Q ${x + 26} ${y - 24} ${x + 22} ${y - 32} Q ${x + 17} ${y - 20} ${x + 11} ${y - 15}`} fill="#FFFDF8" stroke="#1F1A16" strokeWidth="2.5" />
        </g>
      );
    case "beret":
      return (
        <g id="hat-beret">
          <ellipse cx={x - 2} cy={y - 13} rx="18" ry="8" fill={tint} stroke="#1F1A16" strokeWidth="3" transform={`rotate(-12, ${x}, ${y})`} />
          <line x1={x - 2} y1={y - 21} x2={x - 2} y2={y - 24} stroke="#1F1A16" strokeWidth="2.5" />
        </g>
      );
    case "safari":
      return (
        <g id="hat-safari">
          <ellipse cx={x} cy={y - 8} rx="22" ry="6" fill="#B5A17D" stroke="#1F1A16" strokeWidth="3" />
          <path d={`M ${x - 13} ${y - 10} L ${x - 10} ${y - 22} L ${x + 10} ${y - 22} L ${x + 13} ${y - 10} Z`} fill="#C5B18D" stroke="#1F1A16" strokeWidth="2.5" />
        </g>
      );
    case "wizard":
      return (
        <g id="hat-wizard">
          <path d={`M ${x - 20} ${y - 8} Q ${x} ${y - 14} ${x + 20} ${y - 8} L ${x + 6} ${y - 26} Q ${x + 14} ${y - 36} ${x + 4} ${y - 40} L ${x - 6} ${y - 24} Z`} fill="#3A3859" stroke="#1F1A16" strokeWidth="3" />
          <text x={x - 4} y={y - 16} fontSize="9" fill={tint} stroke="none">⭐</text>
        </g>
      );
    case "baseball_back":
      return (
        <g id="hat-baseball-back">
          <path d={`M ${x - 14} ${y - 4} Q ${x} ${y - 22} ${x + 14} ${y - 4} Z`} fill={tint} stroke="#1F1A16" strokeWidth="3" />
          <path d={`M ${x - 14} ${y - 4} Q ${x - 22} ${y + 2} ${x - 20} ${y + 6}`} stroke="#1F1A16" strokeWidth="3.5" fill="none" />
        </g>
      );
    case "graduate":
      return (
        <g id="hat-graduate">
          <polygon points={`${x},${y - 24} ${x + 22},${y - 14} ${x},${y - 8} ${x - 22},${y - 14}`} fill="#1F1A16" stroke="#1F1A16" strokeWidth="2" />
          <line x1={x} y1={y - 16} x2={x + 18} y2={y - 14} stroke={tint} strokeWidth="2" />
          <line x1={x + 18} y1={y - 14} x2={x + 18} y2={y - 2} stroke={tint} strokeWidth="2.5" />
        </g>
      );
    default:
      return null;
  }
}

function renderEyewear(eyewear: string, x: number, y: number) {
  switch (eyewear) {
    case "round_glasses":
      return (
        <g id="eyewear-round" stroke="#1F1A16" strokeWidth="2.2" fill="none">
          <circle cx={x - 5} cy={y - 1} r="4" fill="#FFFFFF" fillOpacity="0.4" />
          <circle cx={x + 5} cy={y - 1} r="4" fill="#FFFFFF" fillOpacity="0.4" />
          <line x1={x - 1} y1={y - 1} x2={x + 1} y2={y - 1} />
        </g>
      );
    case "rect_glasses":
      return (
        <g id="eyewear-rect" stroke="#1F1A16" strokeWidth="2.2" fill="none">
          <rect x={x - 9} y={y - 4} width="7" height="6" rx="1" fill="#FFFFFF" fillOpacity="0.4" />
          <rect x={x + 2} y={y - 4} width="7" height="6" rx="1" fill="#FFFFFF" fillOpacity="0.4" />
          <line x1={x - 2} y1={y - 1} x2={x + 2} y2={y - 1} />
        </g>
      );
    case "monocle":
      return (
        <g id="eyewear-monocle" stroke="#B88636" strokeWidth="2" fill="none">
          <circle cx={x + 5} cy={y - 1} r="4.5" fill="#FAF6EE" fillOpacity="0.5" />
          <line x1={x + 9} y1={y + 2} x2={x + 13} y2={y + 16} stroke="#B88636" strokeWidth="1.5" />
        </g>
      );
    case "eyepatch":
      return (
        <g id="eyewear-eyepatch" stroke="#1F1A16" strokeWidth="2" fill="#1F1A16">
          <polygon points={`${x + 1},${y - 4} ${x + 9},${y - 4} ${x + 8},${y + 4} ${x + 2},${y + 4}`} />
          <line x1={x - 14} y1={y - 8} x2={x + 14} y2={y + 4} strokeWidth="1.8" />
        </g>
      );
    case "aviator_goggles":
      return (
        <g id="eyewear-goggles" stroke="#1F1A16" strokeWidth="2.5" fill="#8B5A2B">
          <ellipse cx={x - 5} cy={y - 1} rx="5" ry="4" fill="#A8D5E5" />
          <ellipse cx={x + 5} cy={y - 1} rx="5" ry="4" fill="#A8D5E5" />
          <line x1={x - 14} y1={y - 1} x2={x - 10} y2={y - 1} strokeWidth="3" />
          <line x1={x + 10} y1={y - 1} x2={x + 14} y2={y - 1} strokeWidth="3" />
        </g>
      );
    case "domino_mask":
      return (
        <g id="eyewear-mask" fill="#1F1A16" stroke="none">
          <path d={`M ${x - 14} ${y - 4} Q ${x} ${y - 8} ${x + 14} ${y - 4} Q ${x + 10} ${y + 5} ${x} ${y + 2} Q ${x - 10} ${y + 5} ${x - 14} ${y - 4} Z`} />
          <ellipse cx={x - 5} cy={y - 1} rx="2.5" ry="1.8" fill="#FFFDF8" />
          <ellipse cx={x + 5} cy={y - 1} rx="2.5" ry="1.8" fill="#FFFDF8" />
        </g>
      );
    default:
      return null;
  }
}

function renderFacialHair(facialHair: string, x: number, y: number) {
  switch (facialHair) {
    case "goatee":
      return (
        <g id="facial-goatee" fill="#1F1A16">
          <polygon points={`${x - 3},${y + 11} ${x + 3},${y + 11} ${x},${y + 15}`} />
        </g>
      );
    case "beard_full":
      return (
        <g id="facial-beard" stroke="#1F1A16" strokeWidth="2.5" fill="#1F1A16">
          <path d={`M ${x - 12} ${y + 6} Q ${x - 8} ${y + 18} ${x} ${y + 20} Q ${x + 8} ${y + 18} ${x + 12} ${y + 6} Q ${x} ${y + 12} ${x - 12} ${y + 6} Z`} />
        </g>
      );
    case "moustache_curl":
      return (
        <g id="facial-moustache" stroke="#1F1A16" strokeWidth="2.8" fill="none">
          <path d={`M ${x - 10} ${y + 4} Q ${x - 5} ${y + 1} ${x} ${y + 4} Q ${x + 5} ${y + 1} ${x + 10} ${y + 4}`} />
        </g>
      );
    case "pencil_moustache":
      return (
        <line x1={x - 6} y1={y + 4} x2={x + 6} y2={y + 4} stroke="#1F1A16" strokeWidth="1.8" />
      );
    case "braided_beard":
      return (
        <g id="facial-braid" stroke="#1F1A16" strokeWidth="2.5" fill="#1F1A16">
          <path d={`M ${x - 8} ${y + 8} L ${x - 3} ${y + 24} L ${x + 3} ${y + 24} L ${x + 8} ${y + 8} Z`} />
          <circle cx={x} cy={y + 20} r="2" fill="#D9822B" stroke="none" />
        </g>
      );
    default:
      return null;
  }
}

function renderClothing(clothing: string, tint: string) {
  switch (clothing) {
    case "tie":
      return (
        <g id="cloth-tie" fill={tint} stroke="#1F1A16" strokeWidth="1.8">
          <polygon points="50,44 48,47 52,47" />
          <polygon points="48,47 52,47 53,62 50,65 47,62" />
        </g>
      );
    case "bowtie":
      return (
        <g id="cloth-bowtie" fill={tint} stroke="#1F1A16" strokeWidth="1.8">
          <polygon points="50,44 45,41 45,47" />
          <polygon points="50,44 55,41 55,47" />
          <circle cx="50" cy="44" r="1.5" fill="#1F1A16" />
        </g>
      );
    case "scarf":
      return (
        <g id="cloth-scarf" stroke="#1F1A16" strokeWidth="2">
          <rect x="42" y="42" width="16" height="5" rx="2" fill={tint} />
          <path d="M 45 47 L 44 60 L 48 59 L 49 47" fill={tint} />
        </g>
      );
    case "trenchcoat":
      return (
        <g id="cloth-trench" stroke="#1F1A16" strokeWidth="2" fill="#5C4533">
          <path d="M 43 45 L 38 68 L 47 70 L 48 45 Z" fillOpacity="0.8" />
          <path d="M 57 45 L 62 68 L 53 70 L 52 45 Z" fillOpacity="0.8" />
        </g>
      );
    case "apron":
      return (
        <g id="cloth-apron" stroke="#1F1A16" strokeWidth="2" fill="#FFFDF8">
          <polygon points="46,46 54,46 56,70 44,70" />
          <line x1="44" y1="56" x2="42" y2="58" />
          <line x1="56" y1="56" x2="58" y2="58" />
        </g>
      );
    case "vest":
      return (
        <g id="cloth-vest" stroke="#1F1A16" strokeWidth="2" fill={tint}>
          <path d="M 46 45 L 43 65 L 48 67 L 48 45 Z" />
          <path d="M 54 45 L 57 65 L 52 67 L 52 45 Z" />
        </g>
      );
    case "sweater_stripes":
      return (
        <g id="cloth-stripes" stroke={tint} strokeWidth="2">
          <line x1="47" y1="52" x2="53" y2="52" />
          <line x1="47" y1="58" x2="53" y2="58" />
          <line x1="47" y1="64" x2="53" y2="64" />
        </g>
      );
    case "hoodie":
      return (
        <g id="cloth-hoodie" stroke="#1F1A16" strokeWidth="2" fill="#6B7280">
          <circle cx="50" cy="45" r="4" fill="none" />
          <rect x="46" y="58" width="8" height="6" rx="2" fill="#4B5563" />
        </g>
      );
    default:
      return null;
  }
}

function renderAccessory(acc: string, x: number, y: number, r: number, tint: string) {
  switch (acc) {
    case "bandaid":
      return (
        <rect
          x={x - 4}
          y={y + 2}
          width="8"
          height="3"
          rx="1"
          fill="#E5C39E"
          stroke="#1F1A16"
          strokeWidth="1.2"
          transform={`rotate(-15, ${x}, ${y + 3})`}
        />
      );
    case "pencil_ear":
      return (
        <line
          x1={x + 10}
          y1={y - 8}
          x2={x + 18}
          y2={y - 2}
          stroke="#E06B52"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      );
    case "earmuffs":
      return (
        <g id="acc-earmuffs">
          <circle cx={x - 14} cy={y} r="5" fill={tint} stroke="#1F1A16" strokeWidth="2.2" />
          <circle cx={x + 14} cy={y} r="5" fill={tint} stroke="#1F1A16" strokeWidth="2.2" />
          <path d={`M ${x - 14} ${y} Q ${x} ${y - 18} ${x + 14} ${y}`} stroke="#1F1A16" strokeWidth="2.8" fill="none" />
        </g>
      );
    case "whistle":
      return (
        <g id="acc-whistle" stroke="#1F1A16" strokeWidth="1.5">
          <line x1="50" y1="44" x2="48" y2="54" />
          <rect x="46" y="54" width="4" height="6" rx="1" fill="#D4AF37" />
        </g>
      );
    default:
      return null;
  }
}
