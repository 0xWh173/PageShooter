import React, { useEffect, useState, useRef, useCallback } from "react";
import type { CellValue } from "@pageshooter/shared";
import { soundManager } from "../audio/soundManager.js";

interface BookCinematicProps {
  pageNumber: number;
  outcome: CellValue;
  consequenceText: string;
  onComplete: () => void;
}

export const BookCinematic: React.FC<BookCinematicProps> = ({
  pageNumber,
  outcome,
  consequenceText,
  onComplete
}) => {
  const [phase, setPhase] = useState<"OPENING" | "FLIPPING" | "REVEAL" | "CONSEQUENCE">("OPENING");
  const [displayPage, setDisplayPage] = useState<number>(1);
  const completedRef = useRef(false);

  const finishCinematic = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  useEffect(() => {
    soundManager.playRuneHum();

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (prefersReducedMotion) {
      setDisplayPage(pageNumber);
      setPhase("CONSEQUENCE");
      soundManager.playTurnChime();
      const fastTimer = setTimeout(() => {
        finishCinematic();
      }, 1200);
      return () => clearTimeout(fastTimer);
    }

    // 0s - 0.9s: Storybook opens
    const t1 = setTimeout(() => {
      setPhase("FLIPPING");
      soundManager.playPageFlip();
    }, 900);

    // Page flipping interval during FLIPPING phase
    const pageInterval = setInterval(() => {
      setDisplayPage(() => Math.floor(Math.random() * 500) + 1);
      soundManager.playPageFlip();
    }, 180);

    // 2.7s: Settle on exact page number & climax reveal
    const t2 = setTimeout(() => {
      clearInterval(pageInterval);
      setDisplayPage(pageNumber);
      setPhase("REVEAL");
      soundManager.playTurnChime();
    }, 2700);

    // 3.8s: Reveal consequence text
    const t3 = setTimeout(() => {
      setPhase("CONSEQUENCE");
    }, 3800);

    // 5.2s: Complete animation
    const t4 = setTimeout(() => {
      finishCinematic();
    }, 5200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearInterval(pageInterval);
    };
  }, [pageNumber, finishCinematic]);

  const handleSkip = () => {
    finishCinematic();
  };

  const tensAndHundreds = Math.floor(pageNumber / 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#2B2118]/80 backdrop-blur-sm p-4 animate-in fade-in select-none">
      {/* Fast Forward Skip Button */}
      <button
        onClick={handleSkip}
        className="absolute top-6 right-6 text-xs font-fredoka font-semibold text-cozy-brown-dark bg-[#FFFDF9] border border-cozy-parchment hover:border-cozy-amber px-3.5 py-1.5 rounded-full shadow-subtle transition-all cursor-pointer flex items-center gap-1.5"
      >
        <span>Turn Leaf Fast</span>
        <span>⏩</span>
      </button>

      <div className="relative max-w-lg w-full flex flex-col items-center">
        {/* Storybook Tome Container */}
        <div className="relative w-84 sm:w-96 h-64 sm:h-72 bg-[#8A5B38] rounded-2xl border-2 border-[#5C3B20] shadow-2xl flex overflow-hidden p-2">
          {/* Leather spine with gold bookmark ribbon */}
          <div className="w-7 h-full bg-[#5C3B20] border-r border-[#4A2D17] flex flex-col items-center justify-between py-4 rounded-l-xl flex-shrink-0">
            <span className="w-1.5 h-16 bg-cozy-amber rounded-full" />
          </div>

          {/* Left Parchment Page */}
          <div className="flex-1 bg-[#FAF7F0] p-4 sm:p-5 border-r border-cozy-parchment flex flex-col justify-between">
            <div className="text-[11px] font-fredoka font-bold text-cozy-brown-dark uppercase tracking-wider text-center border-b border-cozy-parchment pb-1">
              The Grand Storybook
            </div>
            <div className="flex flex-col items-center justify-center my-auto">
              <span className="text-xl text-cozy-amber">✦ ✦ ✦</span>
              <p className="text-xs font-fredoka text-cozy-brown-dark/80 text-center mt-2 italic px-2">
                "A turn of the leaf, a destined number, a stickman awakes."
              </p>
            </div>
            <div className="text-[10px] font-fredoka text-cozy-brown/60 text-center">
              PageShooter Tales
            </div>
          </div>

          {/* Right Parchment Page (Identical Light Parchment Background) */}
          <div
            className={`
              flex-1 bg-[#FAF7F0] p-4 sm:p-5 flex flex-col justify-between rounded-r-xl
              ${phase === "FLIPPING" ? "animate-pulse" : ""}
            `}
          >
            <div className="text-[11px] font-fredoka font-bold text-cozy-brown-dark uppercase tracking-wider text-center border-b border-cozy-parchment pb-1">
              {phase === "FLIPPING" ? "Turning Page..." : "Destined Leaf"}
            </div>

            {/* Revealed Page Number */}
            <div className="flex flex-col items-center justify-center my-auto">
              <div className="text-[10px] uppercase font-fredoka font-bold tracking-widest text-cozy-brown/80 mb-0.5">
                Folio
              </div>
              <div className="flex items-baseline font-fredoka">
                {phase === "REVEAL" || phase === "CONSEQUENCE" ? (
                  <>
                    <span className="text-4xl sm:text-5xl font-black text-cozy-brown-dark">
                      {tensAndHundreds}
                    </span>
                    <span className="text-5xl sm:text-6xl font-black text-[#B87A28] inline-block ml-0.5">
                      {outcome}
                    </span>
                  </>
                ) : (
                  <span className="text-4xl sm:text-5xl font-black text-cozy-brown-dark/70 font-mono">
                    {displayPage}
                  </span>
                )}
              </div>

              {(phase === "REVEAL" || phase === "CONSEQUENCE") && (
                <div className="mt-2 px-3 py-0.5 bg-[#F9EED9] border border-cozy-amber/80 rounded-full text-xs font-fredoka font-bold text-cozy-brown-dark flex items-center gap-1 shadow-xs">
                  <span>⭐</span>
                  <span>Target Cell #{outcome}</span>
                </div>
              )}
            </div>

            <div className="text-[10px] font-fredoka text-cozy-brown/60 text-center">
              Page {phase === "REVEAL" || phase === "CONSEQUENCE" ? pageNumber : displayPage} of 500
            </div>
          </div>
        </div>

        {/* Consequence Banner Subtitle */}
        <div className="mt-4 text-center max-w-md px-4">
          <div
            className={`
              bg-[#FFFDF9] border-2 border-cozy-amber px-5 py-2.5 rounded-2xl shadow-subtle transition-all duration-300
              ${phase === "CONSEQUENCE"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95"
              }
            `}
          >
            <p className="font-fredoka text-sm sm:text-base font-bold text-cozy-brown-dark">
              {consequenceText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
