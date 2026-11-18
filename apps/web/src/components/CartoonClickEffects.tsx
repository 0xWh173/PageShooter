import React, { useEffect, useState } from "react";
import { soundManager } from "../audio/soundManager.js";

interface ClickBurst {
  id: number;
  x: number;
  y: number;
  color: string;
}

const BURST_COLORS = ["#FFB703", "#21D4FD", "#FF4D6D", "#38B000", "#FFFDF7"];
const SPARK_ANGLES = [0, 60, 120, 180, 240, 300];

let nextBurstId = 1;

/**
 * Global Cartoon Click Effect Overlay:
 * Spawns an ephemeral comic starburst & radial sparks whenever the user clicks
 * any interactive button, role="button", or [data-cartoon-click] target.
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
        'button:not(:disabled), [role="button"], [data-cartoon-click]'
      );
      if (!interactive) return;

      soundManager.playCartoonPop();

      if (prefersReducedMotion) return;

      const id = nextBurstId++;
      const color = BURST_COLORS[id % BURST_COLORS.length];
      setBursts((prev) => [...prev.slice(-6), { id, x: event.clientX, y: event.clientY, color }]);

      setTimeout(() => {
        setBursts((prev) => prev.filter((b) => b.id !== id));
      }, 480);
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
          {/* Comic Starburst Outline */}
          <svg
            width="54"
            height="54"
            viewBox="0 0 60 60"
            className="animate-cartoon-burst"
          >
            <polygon
              points="30,2 37,20 56,16 42,30 56,44 37,40 30,58 23,40 4,44 18,30 4,16 23,20"
              fill={burst.color}
              fillOpacity="0.32"
              stroke="#1E1410"
              strokeWidth="3"
              strokeLinejoin="round"
            />
          </svg>

          {/* Radial Comic Sparks */}
          {SPARK_ANGLES.map((angle, idx) => (
            <span
              key={angle}
              style={
                {
                  "--spark-angle": `${angle}deg`,
                  backgroundColor: BURST_COLORS[(burst.id + idx) % BURST_COLORS.length]
                } as React.CSSProperties
              }
              className="animate-cartoon-spark absolute left-0 top-0 w-2.5 h-2.5 rounded-full border-2 border-[#1E1410]"
            />
          ))}
        </div>
      ))}
    </div>
  );
};
