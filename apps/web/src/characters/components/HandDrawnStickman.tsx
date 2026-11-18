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

  // Head center and scale
  const hx = 50;
  const hy = 26;
  const hr = 15;

  return (
    <svg
      viewBox="0 0 100 120"
      className={`${className} overflow-visible select-none`}
      style={{ shapeRendering: "geometricPrecision" }}
      aria-label={`${char.name} (${char.title}) - Stage ${progress} ${isDead ? "(Eliminated)" : ""}`}
    >
      {/* 1. Ground Shadow (Baseline Y=110) */}
      <ellipse
        cx="50"
        cy="112"
        rx="22"
        ry="3.5"
        fill="rgba(117, 104, 92, 0.22)"
      />

      {/* 2. Empty Stage Placeholder (Stage 0) */}
      {progress === 0 && !isDead && (
        <g stroke="#C4B5A5" strokeWidth="2" strokeDasharray="3 3" fill="none">
          <ellipse cx="50" cy="110" rx="16" ry="3" />
          <circle cx="50" cy="26" r="14" opacity="0.4" />
        </g>
      )}

      {/* 3. SHADOW SCYTHE ARMED STATE (When cell gets a bullet / Stage 5) */}
      {hasGun && !isDead ? (
        renderShadowScytheArmed(char, pose, tint)
      ) : progress > 0 && !isDead ? (
        <g
          stroke="#1F1A16"
          strokeWidth="3.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        >
          {/* LEGS (Stage 3 onwards) */}
          {progress >= 3 && (
            <g>
              {isAimed ? (
                // Wide solid shooting stance
                <g>
                  <line x1="50" y1="76" x2="34" y2="108" />
                  <ellipse cx="32" cy="109" rx="5" ry="2.5" fill="#1F1A16" />
                  <line x1="50" y1="76" x2="68" y2="108" />
                  <ellipse cx="70" cy="109" rx="5" ry="2.5" fill="#1F1A16" />
                </g>
              ) : pose === "recoil" ? (
                // Knocked back legs
                <g>
                  <line x1="46" y1="76" x2="28" y2="106" />
                  <ellipse cx="26" cy="107" rx="5" ry="2.5" fill="#1F1A16" />
                  <line x1="46" y1="76" x2="54" y2="104" />
                  <ellipse cx="56" cy="105" rx="5" ry="2.5" fill="#1F1A16" />
                </g>
              ) : (
                // Standard standing legs
                <g>
                  <line x1="50" y1="76" x2="38" y2="108" />
                  <ellipse cx="36" cy="109" rx="5" ry="2.5" fill="#1F1A16" />
                  <line x1="50" y1="76" x2="62" y2="108" />
                  <ellipse cx="64" cy="109" rx="5" ry="2.5" fill="#1F1A16" />
                </g>
              )}
            </g>
          )}

          {/* TORSO / SPINE (Stage 2 onwards) */}
          {progress >= 2 && (
            <g>
              {pose === "recoil" ? (
                <line x1="46" y1="42" x2="44" y2="76" strokeWidth="3.4" />
              ) : isAimed ? (
                <line x1="50" y1="42" x2="48" y2="76" strokeWidth="3.4" />
              ) : (
                <line x1="50" y1="42" x2="50" y2="76" strokeWidth="3.4" />
              )}

              {/* Clothing Details */}
              {renderClothing(char.clothing, tint)}
            </g>
          )}

          {/* ARMS & HANDS (Stage 4 onwards) */}
          {progress >= 4 && (
            <g>
              {isAimed ? (
                // Both arms extended forward holding weapon
                <g>
                  <line x1="50" y1="48" x2="68" y2="52" />
                  <line x1="50" y1="48" x2="66" y2="58" />
                  {renderCartoonWeapon(char.weapon, 68, 52, tint)}
                </g>
              ) : pose === "recoil" ? (
                // Arms thrown back in surprise
                <g>
                  <line x1="46" y1="48" x2="28" y2="38" />
                  <circle cx="26" cy="36" r="2.5" fill="#1F1A16" />
                  <line x1="46" y1="48" x2="60" y2="34" />
                  <circle cx="62" cy="32" r="2.5" fill="#1F1A16" />
                </g>
              ) : (
                // Relaxed / expressive casual arms
                <g>
                  <line x1="50" y1="48" x2="36" y2="64" />
                  <circle cx="34" cy="66" r="2.5" fill="#1F1A16" />
                  <line x1="50" y1="48" x2="64" y2="64" />
                  <circle cx="66" cy="66" r="2.5" fill="#1F1A16" />
                </g>
              )}
            </g>
          )}

          {/* HEAD & FACIAL FEATURES (Stage 1 onwards) */}
          <g id="stickman-head">
            {/* White parchment fill head circle with organic outline */}
            <circle
              cx={hx}
              cy={hy}
              r={hr}
              fill="#FFFDF8"
              stroke="#1F1A16"
              strokeWidth="3.2"
            />

            {/* Hairstyle */}
            {renderHair(char.hair, hx, hy, hr, tint)}

            {/* Hat */}
            {renderHat(char.hat, hx, hy, hr, tint)}

            {/* Eyewear */}
            {renderEyewear(char.eyewear, hx, hy)}

            {/* Eyes & Brows (Expressive) */}
            {char.eyewear !== "domino_mask" && char.eyewear !== "eyepatch" && (
              <g fill="#1F1A16" stroke="none">
                <circle cx={hx - 5} cy={hy - 1} r="2" />
                <circle cx={hx + 5} cy={hy - 1} r="2" />
              </g>
            )}

            {/* Eyebrows */}
            <g stroke="#1F1A16" strokeWidth="2.2" fill="none">
              {isAimed ? (
                <g>
                  <line x1={hx - 8} y1={hy - 6} x2={hx - 2} y2={hy - 4} />
                  <line x1={hx + 2} y1={hy - 4} x2={hx + 8} y2={hy - 6} />
                </g>
              ) : pose === "recoil" ? (
                <g>
                  <path d={`M ${hx - 8} ${hy - 6} Q ${hx - 5} ${hy - 9} ${hx - 2} ${hy - 6}`} />
                  <path d={`M ${hx + 2} ${hy - 6} Q ${hx + 5} ${hy - 9} ${hx + 8} ${hy - 6}`} />
                </g>
              ) : (
                <g>
                  <line x1={hx - 7} y1={hy - 5} x2={hx - 3} y2={hy - 5} />
                  <line x1={hx + 3} y1={hy - 5} x2={hx + 7} y2={hy - 5} />
                </g>
              )}
            </g>

            {/* Mouth */}
            <path
              d={
                pose === "recoil"
                  ? `M ${hx - 4} ${hy + 8} Q ${hx} ${hy + 12} ${hx + 4} ${hy + 8}`
                  : isAimed
                  ? `M ${hx - 4} ${hy + 7} L ${hx + 4} ${hy + 7}`
                  : `M ${hx - 5} ${hy + 6} Q ${hx} ${hy + 10} ${hx + 5} ${hy + 6}`
              }
              stroke="#1F1A16"
              strokeWidth="2.2"
              fill="none"
            />

            {/* Facial Hair */}
            {renderFacialHair(char.facialHair, hx, hy)}

            {/* Accessory (Bandaid, whistle, etc.) */}
            {renderAccessory(char.accessory, hx, hy, hr, tint)}
          </g>
        </g>
      ) : null}

      {/* 4. DEFEATED / DESTROYED STATE: Comic Knockout & Cross-Out */}
      {isDead && (
        <g id="stickman-defeated">
          {/* Dazed Stickman Silhouette */}
          <circle
            cx={hx}
            cy={hy + 6}
            r={hr}
            fill="#F7EFE5"
            stroke="#75685C"
            strokeWidth="2.8"
            strokeDasharray="4 2"
          />
          {/* Dazed Spiral/X Eyes */}
          <line x1={hx - 8} y1={hy + 2} x2={hx - 2} y2={hy + 8} stroke="#75685C" strokeWidth="2.5" />
          <line x1={hx - 2} y1={hy + 2} x2={hx - 8} y2={hy + 8} stroke="#75685C" strokeWidth="2.5" />
          <line x1={hx + 2} y1={hy + 2} x2={hx + 8} y2={hy + 8} stroke="#75685C" strokeWidth="2.5" />
          <line x1={hx + 8} y1={hy + 2} x2={hx + 2} y2={hy + 8} stroke="#75685C" strokeWidth="2.5" />
          {/* Wavy Dazed Mouth */}
          <path
            d={`M ${hx - 6} ${hy + 13} Q ${hx - 3} ${hy + 10} ${hx} ${hy + 13} T ${hx + 6} ${hy + 13}`}
            stroke="#75685C"
            strokeWidth="2"
            fill="none"
          />
          {/* Hair/Hat hint to retain character identity even in defeat */}
          {char.hat !== "none"
            ? renderHat(char.hat, hx, hy + 6, hr, tint)
            : char.hair !== "bald"
            ? renderHair(char.hair, hx, hy + 6, hr, tint)
            : null}

          {/* Slumped Body */}
          <line x1="50" y1="48" x2="46" y2="80" stroke="#75685C" strokeWidth="2.8" strokeDasharray="4 2" />
          <line x1="46" y1="80" x2="30" y2="106" stroke="#75685C" strokeWidth="2.8" strokeDasharray="4 2" />
          <line x1="46" y1="80" x2="64" y2="108" stroke="#75685C" strokeWidth="2.8" strokeDasharray="4 2" />

          {/* Comic Little Stars floating above head */}
          <text x={hx - 14} y={hy - 4} fontSize="11" fill="#D9822B">✨</text>
          <text x={hx + 8} y={hy - 6} fontSize="9" fill="#D9822B">⭐</text>

          {/* Bold Red Comic Cross-Out Lines */}
          <line x1="20" y1="16" x2="80" y2="108" stroke="#C0392B" strokeWidth="4.5" strokeLinecap="round" />
          <line x1="80" y1="16" x2="20" y2="108" stroke="#C0392B" strokeWidth="4.5" strokeLinecap="round" />

          {/* Hand-drawn comic K.O. Stamp */}
          <rect
            x="32"
            y="94"
            width="36"
            height="16"
            rx="4"
            fill="#C0392B"
            stroke="#FFFDF8"
            strokeWidth="1.5"
          />
          <text
            x="50"
            y="106"
            fontSize="10"
            fontWeight="bold"
            fontFamily="sans-serif"
            fill="#FFFDF8"
            textAnchor="middle"
          >
            K.O.
          </text>
        </g>
      )}
    </svg>
  );
};

/**
 * Signature Flat Cap matching the user's uploaded reference image (media_1793946245613_892ac98f.png):
 * - Flat reddish-brown circular crown
 * - Vibrant glowing neon crimson/magenta brim
 * - Tilted slightly over the slitted glowing white eyes
 */
function renderWarriorCap(hx: number, hy: number, hr: number, angle = -8) {
  return (
    <g id="shadow-warrior-cap" transform={`rotate(${angle}, ${hx}, ${hy})`}>
      {/* Crown base */}
      <ellipse
        cx={hx}
        cy={hy - hr + 4}
        rx={hr * 1.35}
        ry={hr * 0.65}
        fill="#A83232"
        stroke="#161413"
        strokeWidth="1.2"
      />
      {/* Glowing Neon Crimson Brim */}
      <ellipse
        cx={hx}
        cy={hy - hr + 4}
        rx={hr * 1.4}
        ry={hr * 0.7}
        fill="none"
        stroke="#FF0054"
        strokeWidth="2.6"
      />
      {/* Inner shadow crease */}
      <path
        d={`M ${hx - hr * 1.1} ${hy - hr + 4} Q ${hx} ${hy - hr + 8} ${hx + hr * 1.1} ${hy - hr + 4}`}
        stroke="#7A1818"
        strokeWidth="1.8"
        fill="none"
      />
    </g>
  );
}

/**
 * Hip Sheath / Scabbard (Saya) matching the user's reference image:
 * Attached at left hip, angled downwards to the back, charcoal body with crimson contour and gold collar.
 */
function renderHipSheath(x1 = 43, y1 = 64, x2 = 18, y2 = 98) {
  return (
    <g id="hip-sheath-scabbard">
      {/* Outer Glow / Contour */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#D90429"
        strokeWidth="4.6"
        strokeLinecap="round"
      />
      {/* Dark Lacquered Body */}
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        stroke="#141210"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
      {/* Koiguchi (Scabbard Collar / Mouth) */}
      <ellipse
        cx={x1}
        cy={y1}
        rx="3.2"
        ry="2.2"
        fill="#D4AF37"
        stroke="#FF0054"
        strokeWidth="0.8"
      />
      {/* Kojiri (Scabbard End Tip) */}
      <circle cx={x2} cy={y2} r="2" fill="#D90429" />
    </g>
  );
}

/**
 * Renders the sleek Shadow Scythe / Katana Warrior silhouette
 * modeled directly after the user's reference drawing:
 * - Solid charcoal-black stylized body with crimson contours
 * - Menacing glowing white slitted eyes
 * - Signature flat cap with neon crimson brim
 * - Hip sheath / scabbard attached at waist
 * - Reaper Grim Scythe with curved red blade and white cutting edge
 * - Post-dash stance is 100% STILL and UNMOVING at the right end.
 *   ONLY the arm and weapon animate for the Chiburui blood flick and sheathing!
 */
function renderShadowScytheArmed(char: CharacterDefinition, pose: string, tint: string) {
  const isDash = pose === "dash";
  const isChiburui = pose === "chiburui";
  const isSheathe = pose === "sheathe";
  const isSheathed = pose === "sheathed";

  // Shared Reaper Blade Gradient
  const defs = (
    <defs>
      <linearGradient id="scytheRedGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#800F2F" />
        <stop offset="45%" stopColor="#D90429" />
        <stop offset="100%" stopColor="#FF4D6D" />
      </linearGradient>
    </defs>
  );

  // 1. DASH POSE: Ultra-fast low horizontal sliding dash
  if (isDash) {
    return (
      <g id="shadow-katana-dash">
        {defs}
        {/* Trailing speed blur lines */}
        <line x1="-30" y1="65" x2="10" y2="65" stroke="#E63946" strokeWidth="2.5" strokeDasharray="6 4" opacity="0.8" />
        <line x1="-25" y1="85" x2="20" y2="85" stroke="#E63946" strokeWidth="2" strokeDasharray="4 4" opacity="0.6" />

        {/* Leaning Shadow Figure */}
        <g transform="skewX(-25) translate(10, 0)">
          {/* Hip Sheath trailing behind */}
          {renderHipSheath(42, 68, 14, 88)}

          {/* Shadow body leaning sharply forward */}
          <path d="M 35 60 L 65 48 L 70 54 L 38 72 Z" fill="#141210" stroke="#800F2F" strokeWidth="1" />
          {/* Trailing legs */}
          <path d="M 35 68 L 10 95 L 15 98 L 42 74 Z" fill="#141210" stroke="#800F2F" strokeWidth="0.8" />
          <path d="M 38 72 L 20 106 L 26 108 L 46 76 Z" fill="#141210" stroke="#800F2F" strokeWidth="0.8" />

          {/* Forward Head */}
          <circle cx="72" cy="44" r="13" fill="#141210" stroke="#800F2F" strokeWidth="1" />
          {/* Glowing White Eye */}
          <path d="M 68 44 Q 73 45 78 41 Q 74 40 68 44 Z" fill="#FFFFFF" />

          {/* Flat Cap with Neon Brim */}
          {renderWarriorCap(72, 44, 13, -15)}

          {/* Extended Katana/Scythe Blade with curved razor edge */}
          <rect x="58" y="47" width="4" height="10" rx="1.5" fill="#D4AF37" stroke="#161413" strokeWidth="1" />
          <path
            d="M 62 51 L 102 37 Q 108 34 114 30 L 108 36 L 62 53 Z"
            fill="#FFFFFF"
            stroke="#D90429"
            strokeWidth="1.2"
          />
          <line x1="62" y1="53" x2="112" y2="31" stroke="#FFFFFF" strokeWidth="2.8" strokeLinecap="round" />
          <line x1="62" y1="53" x2="112" y2="31" stroke="#FF0054" strokeWidth="1.2" strokeLinecap="round" opacity="0.8" />

          {/* Character Identity accessories if present */}
          {char.eyewear !== "none" && renderEyewear(char.eyewear, 72, 44)}
        </g>
      </g>
    );
  }

  // 2. POST-DASH STANCE: ROCK-SOLID STILL BODY (No shaking, no jumping, no position shift!)
  // Feet, Legs, Torso, Head, Eyes, Hat, and Hip Sheath remain 100% IDENTICAL across all right-side states.
  return (
    <g id="shadow-scythe-armed-still-stance">
      {defs}
      {/* Subtle crimson shadow on ground - Fixed */}
      <ellipse cx="50" cy="112" rx="24" ry="4" fill="rgba(220, 20, 60, 0.35)" />

      {/* Hip Sheath (Saya / Scabbard) - Fixed on Left Hip */}
      {renderHipSheath(43, 64, 18, 98)}

      {/* Left Leg - Planted firmly on ground */}
      <path
        d="M 40 70 Q 35 90 32 108 L 22 109 L 24 105 L 34 105 Q 38 88 43 70 Z"
        fill="#141210"
        stroke="#800F2F"
        strokeWidth="0.8"
      />
      {/* Right Leg - Planted firmly on ground */}
      <path
        d="M 47 70 Q 52 88 58 108 L 68 109 L 66 105 L 56 105 Q 50 88 47 70 Z"
        fill="#141210"
        stroke="#800F2F"
        strokeWidth="0.8"
      />

      {/* Torso - Upright and still */}
      <path
        d="M 41 40 Q 36 54 39 72 L 48 72 Q 47 54 47 40 Z"
        fill="#141210"
        stroke="#800F2F"
        strokeWidth="0.8"
      />

      {/* Left Arm - Resting calmly and still on hip sheath */}
      <path
        d="M 41 42 Q 28 58 26 74 Q 28 80 32 76 Q 32 70 41 62"
        fill="#141210"
        stroke="#141210"
        strokeWidth="2"
        strokeLinejoin="round"
      />

      {/* ======================================================== */}
      {/* ONLY THE WEAPON & RIGHT ARM ANIMATE                     */}
      {/* ======================================================== */}

      {/* A. CHIBURUI: Blood-Flicking Swing */}
      {isChiburui && (
        <g id="weapon-chiburui-swing">
          {/* Right Arm swinging weapon */}
          <path d="M 47 42 Q 62 46 74 58 Q 70 62 62 55 L 46 48" fill="#141210" stroke="#800F2F" strokeWidth="1" />
          {/* Scythe shaft during blood-flicking swing */}
          <line x1="72" y1="56" x2="22" y2="88" stroke="#161413" strokeWidth="4.5" strokeLinecap="round" />
          {/* Scythe curved blade swept down-across */}
          <path
            d="M 22 88 L 18 96 L 24 99 L 38 101 L 52 97 L 62 86 Q 40 94 22 88 Z"
            fill="url(#scytheRedGradient)"
            stroke="#161413"
            strokeWidth="2.2"
          />
          <path d="M 62 86 Q 40 94 22 88" stroke="#FF0054" strokeWidth="2.4" fill="none" />
          <path d="M 54 89 Q 38 95 24 90" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" fill="none" />
          {/* SWIFT MOTION BLUR ARC (Blade Swing) */}
          <path
            d="M 72 30 Q 56 60 22 88"
            stroke="#FF0054"
            strokeWidth="3.2"
            strokeDasharray="8 4"
            strokeLinecap="round"
            fill="none"
            opacity="0.85"
          />
          <path
            d="M 74 32 Q 58 62 24 90"
            stroke="#FFFFFF"
            strokeWidth="1.6"
            strokeDasharray="6 6"
            strokeLinecap="round"
            fill="none"
            opacity="0.9"
          />
          {/* BLOOD DROPLETS FLICKING / FLYING OFF THE BLADE */}
          <g id="blood-flick-droplets">
            <circle cx="12" cy="94" r="3.2" fill="#D90429" />
            <circle cx="6" cy="100" r="2.6" fill="#FF0054" />
            <circle cx="2" cy="107" r="2" fill="#800F2F" />
            <circle cx="16" cy="103" r="2.2" fill="#D90429" />
            <ellipse cx="14" cy="113" rx="10" ry="2.2" fill="#D90429" opacity="0.8" />
          </g>
        </g>
      )}

      {/* B. SHEATHE: Guiding weapon into the hip sheath */}
      {isSheathe && (
        <g id="weapon-sheathe-guide">
          <line x1="52" y1="46" x2="44" y2="60" stroke="#161413" strokeWidth="3.8" strokeLinecap="round" />
          <circle cx="52" cy="46" r="3.2" fill="#141210" stroke="#D90429" strokeWidth="0.8" />
          {/* Golden-white metallic gleam spark at sheath entrance */}
          <g transform="translate(43, 61)">
            <polygon points="0,-7 2,-2 7,0 2,2 0,7 -2,2 -7,0 -2,-2" fill="#FFFFFF" />
            <circle cx="0" cy="0" r="2.2" fill="#D4AF37" />
          </g>
        </g>
      )}

      {/* C. SHEATHED: Weapon locked into hip scabbard */}
      {isSheathed && (
        <g id="sheathed-hilt-lock">
          <line x1="43" y1="64" x2="52" y2="52" stroke="#161413" strokeWidth="4.2" strokeLinecap="round" />
          <ellipse cx="43" cy="64" rx="3.5" ry="2.2" fill="#D4AF37" stroke="#FF0054" strokeWidth="1" />
          <line x1="40" y1="63" x2="46" y2="65" stroke="#FFFFFF" strokeWidth="1" />
        </g>
      )}

      {/* D. POST-DASH STILL HOLD (Bloody Scythe held at side/back before Chiburui) */}
      {!isChiburui && !isSheathe && !isSheathed && (
        <g id="weapon-bloody-hold">
          {/* Right arm gripping scythe */}
          <path
            d="M 47 42 Q 54 48 58 52 Q 62 56 60 60 Q 56 60 52 54 L 46 48"
            fill="#141210"
            stroke="#141210"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          {/* Scythe shaft */}
          <line
            x1="28"
            y1="98"
            x2="72"
            y2="22"
            stroke="#161413"
            strokeWidth="4.8"
            strokeLinecap="round"
          />
          <polygon points="70,24 75,18 78,22 73,28" fill="#161413" />
          {/* Scythe blade */}
          <path
            d="M 72 22 L 75 15 L 68 13 L 59 6 L 53 8 L 42 5 L 35 8 L 24 13 L 12 26 Q 42 15 72 22 Z"
            fill="url(#scytheRedGradient)"
            stroke="#161413"
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <path d="M 12 26 Q 42 15 72 22" stroke="#FF0054" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          <path d="M 20 22 Q 44 13 65 17" stroke="#FFFFFF" strokeWidth="2.6" strokeLinecap="round" strokeOpacity="0.92" fill="none" />
          {/* Blood droplets on blade tip before Chiburui */}
          <circle cx="12" cy="28" r="2.8" fill="#D90429" />
          <circle cx="10" cy="34" r="2.2" fill="#FF0054" />
          <circle cx="8" cy="40" r="1.6" fill="#800F2F" />
        </g>
      )}

      {/* Head - Rock solid and still at (43, 28) */}
      <circle cx="43" cy="28" r="14.5" fill="#141210" stroke="#800F2F" strokeWidth="1" />

      {/* Slanted Glowing White Eyes */}
      <g fill="#FFFFFF" stroke="none">
        <path d="M 35 29 Q 39 31 43 27 Q 39 26 35 29 Z" />
        <path d="M 45 27 Q 49 28 53 25 Q 49 24 45 27 Z" />
      </g>

      {/* Signature Flat Cap with Neon Crimson Brim */}
      {renderWarriorCap(43, 28, 14.5, -8)}

      {/* Character Identity Traits */}
      {char.eyewear !== "none" && renderEyewear(char.eyewear, 43, 28)}
      {char.facialHair !== "none" && renderFacialHair(char.facialHair, 43, 28)}
      {char.accessory !== "none" && renderAccessory(char.accessory, 43, 28, 14.5, tint)}
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

function renderCartoonWeapon(weapon: string, wx: number, wy: number, tint: string) {
  switch (weapon) {
    case "popgun":
      return (
        <g id="weapon-popgun" stroke="#1F1A16" strokeWidth="2.2">
          {/* Wooden stock */}
          <path d={`M ${wx - 2} ${wy + 4} L ${wx + 6} ${wy} L ${wx + 6} ${wy - 4} L ${wx - 2} ${wy - 1} Z`} fill="#8B5A2B" />
          {/* Barrel */}
          <line x1={wx + 6} y1={wy - 2} x2={wx + 20} y2={wy - 2} stroke="#555" strokeWidth="3" strokeLinecap="round" />
          {/* Cork tether */}
          <path d={`M ${wx + 16} ${wy - 2} Q ${wx + 18} ${wy + 6} ${wx + 22} ${wy + 3}`} stroke="#B45309" strokeWidth="1.2" fill="none" />
          <rect x={wx + 20} y={wy + 2} width="4" height="3" fill="#D4A373" />
        </g>
      );
    case "peashooter":
      return (
        <g id="weapon-peashooter" stroke="#1F1A16" strokeWidth="2.2">
          {/* Blowpipe */}
          <line x1={wx - 2} y1={wy} x2={wx + 22} y2={wy - 2} stroke="#4A8B6F" strokeWidth="3.2" />
          {/* Little green pea */}
          <circle cx={wx + 26} cy={wy - 2} r="2.5" fill="#22C55E" stroke="#1F1A16" strokeWidth="1.5" />
        </g>
      );
    case "slingshot":
      return (
        <g id="weapon-slingshot" stroke="#1F1A16" strokeWidth="2.2">
          {/* Y-frame wooden fork */}
          <path d={`M ${wx} ${wy + 6} L ${wx + 6} ${wy} L ${wx + 12} ${wy - 6}`} stroke="#8B5A2B" strokeWidth="3" />
          <path d={`M ${wx + 6} ${wy} L ${wx + 14} ${wy + 4}`} stroke="#8B5A2B" strokeWidth="3" />
          {/* Rubber band pulled */}
          <line x1={wx + 12} y1={wy - 6} x2={wx - 2} y2={wy - 1} stroke="#E06B52" strokeWidth="1.8" />
          <line x1={wx + 14} y1={wy + 4} x2={wx - 2} y2={wy - 1} stroke="#E06B52" strokeWidth="1.8" />
        </g>
      );
    case "blunderbuss":
      return (
        <g id="weapon-blunderbuss" stroke="#1F1A16" strokeWidth="2.2">
          {/* Stock */}
          <path d={`M ${wx - 4} ${wy + 4} L ${wx + 8} ${wy} L ${wx + 8} ${wy - 4} L ${wx - 4} ${wy - 1} Z`} fill="#8B5A2B" />
          {/* Flared bell muzzle */}
          <polygon points={`${wx + 8},${wy - 3} ${wx + 18},${wy - 6} ${wx + 18},${wy + 3} ${wx + 8},${wy}`} fill="#D4AF37" />
        </g>
      );
    case "raygun":
      return (
        <g id="weapon-raygun" stroke="#1F1A16" strokeWidth="2.2" fill={tint}>
          {/* Sleek retro sci-fi body */}
          <ellipse cx={wx + 8} cy={wy - 1} rx="8" ry="4.5" />
          {/* Concentric transmitter rings */}
          <circle cx={wx + 17} cy={wy - 1} r="3" fill="none" strokeWidth="1.8" />
          <circle cx={wx + 21} cy={wy - 1} r="4.5" fill="none" strokeWidth="1.8" />
        </g>
      );
    default:
      return null;
  }
}
