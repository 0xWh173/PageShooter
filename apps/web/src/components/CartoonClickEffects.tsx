import React, { useEffect, useState } from "react";
import { soundManager } from "../audio/soundManager.js";

interface ClickBurst {
  id: number;
  x: number;
  y: number;
  color: string;
  word: string;
}

const BURST_COLORS = ["#E5C467", "#688B9A", "#C85A48", "#FAF4E6"];
const COMIC_WORDS = ["POW!", "WHAM!", "BAM!", "ZAP!"];
const SPARK_ANGLES = [0, 60, 120, 180, 240, 300];

let nextBurstId = 1;

/**
 * Targeted Comic-Book Onomatopoeia Click Effect Overlay:
 * Triggers strictly on elements marked with [data-cartoon-click] (specifically
 * the Local Pass & Play and Online Multiplayer mode selection buttons).
 */
export const CartoonClickEffects: React.FC = () => {
  const [bursts, setBursts] = useState<ClickBurst[]>([]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const interactive = target.closest(
        "[data-cartoon-click]:not(:disabled)"
      );
      if (!interactive) return;

      soundManager.playCartoonPop();

      if (prefersReducedMotion) return;

      const id = nextBurstId++;
      const color = BURST_COLORS[id % BURST_COLORS.length];
      const word = COMIC_WORDS[id % COMIC_WORDS.length];
      setBursts((prev) => [
        ...prev.slice(-6),
        { id, x: event.clientX, y: event.clientY, color, word }
      ]);

      setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 520);
    };

    document.addEventListener("pointerdown", handlePointerDown, { passive: true });
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
    };
  }, []);

  if (bursts.length === 0) return null;

  return (
    <div
      aria-hidden="true"
      data-testid="cartoon-click-layer"
      className="pointer-events-none fixed inset-0 z-[9999] overflow-hidden"
    >
      {bursts.map((burst) => (
        <div
          key={burst.id}
          style={{ left: burst.x, top: burst.y }}
          className="absolute"
        >
          {/* Jagged 16-Point Comic Action Starburst + Onomatopoeia Text */}
          <svg
            width="86"
            height="86"
            viewBox="0 0 86 86"
            className="animate-cartoon-burst overflow-visible"
          >
            {/* Solid Black Offset Comic Ink Shadow */}
            <polygon
              points="43,4 51,21 68,10 61,28 81,27 66,41 83,53 63,56 71,74 52,66 47,83 38,67 21,77 26,58 7,60 21,45 4,33 24,30 16,12 35,21"
              fill="#0A0A0A"
              transform="translate(3, 3)"
            />
            {/* Main Vivid Comic Starburst */}
            <polygon
              points="43,4 51,21 68,10 61,28 81,27 66,41 83,53 63,56 71,74 52,66 47,83 38,67 21,77 26,58 7,60 21,45 4,33 24,30 16,12 35,21"
              fill={burst.color}
              stroke="#0A0A0A"
              strokeWidth="3.2"
              strokeLinejoin="miter"
            />
            {/* Comic Onomatopoeia Word ("POW!", "WHAM!", "SLASH!") */}
            <text
              x="43"
              y="49"
              textAnchor="middle"
              fill="#FFFDF5"
              stroke="#0A0A0A"
              strokeWidth="3.5"
              paintOrder="stroke"
              fontSize="16"
              fontWeight="900"
              fontFamily="Bangers, Impact, Fredoka, sans-serif"
              letterSpacing="1"
              transform="rotate(-8, 43, 43)"
            >
              {burst.word}
            </text>
          </svg>

          {/* Radial Comic Ink Speed Sparks */}
          {SPARK_ANGLES.map((angle, idx) => (
            <span
              key={angle}
              style={
                {
                  "--spark-angle": `${angle}deg`,
                  backgroundColor: BURST_COLORS[(burst.id + idx) % BURST_COLORS.length]
                } as React.CSSProperties
              }
              className="animate-cartoon-spark absolute left-0 top-0 w-2 h-3.5 border-2 border-[#0A0A0A]"
            />
          ))}
        </div>
      ))}
    </div>
  );
};
