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

    // 0s - 1.0s: Storybook opens
    const t1 = setTimeout(() => {
      setPhase("FLIPPING");
      soundManager.playPageFlip();
    }, 1000);

    // Page flipping interval during FLIPPING phase
    const pageInterval = setInterval(() => {
      setDisplayPage(() => Math.floor(Math.random() * 500) + 1);
      soundManager.playPageFlip();
    }, 180);

    // 2.8s: Settle on exact page number
    const t2 = setTimeout(() => {
      clearInterval(pageInterval);
      setDisplayPage(pageNumber);
      setPhase("REVEAL");
      soundManager.playTurnChime();
    }, 2800);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#462B18]/60 backdrop-blur-sm p-4 animate-in fade-in duration-300 select-none">
      {/* Fast Forward Skip Button */}
      <button
        onClick={handleSkip}
        className="absolute top-6 right-6 text-xs font-fredoka font-semibold text-cozy-brown bg-[#FFFDF9] border-2 border-[#D8C7B0] hover:border-cozy-gold hover:bg-cozy-gold-light px-3.5 py-2 rounded-2xl shadow-cozy transition-all cursor-pointer flex items-center gap-1.5"
      >
        <span>Turn Leaf Fast</span>
        <span>⏩</span>
      </button>

      <div className="relative max-w-lg w-full flex flex-col items-center">
        {/* Floating sparkles */}
        <div className="absolute -top-6 -left-4 text-2xl animate-float">✨</div>
        <div className="absolute -bottom-6 -right-4 text-2xl animate-float" style={{ animationDelay: "1.2s" }}>🌸</div>

        {/* Storybook Tome Container */}
        <div className="relative w-84 sm:w-96 h-64 sm:h-72 bg-[#5C3A21] rounded-3xl border-4 border-[#3D2310] shadow-[0_20px_40px_rgba(70,43,24,0.35)] flex overflow-hidden p-1.5">
          {/* Leather spine with gold bookmark ribbon */}
          <div className="w-9 h-full bg-gradient-to-r from-[#4A2D17] via-[#6B4527] to-[#4A2D17] border-r-2 border-[#3D2310] flex flex-col items-center justify-between py-3 rounded-l-2xl shadow-inner">
            <span className="text-xs">🌿</span>
            <span className="w-1.5 h-16 bg-cozy-gold rounded-full shadow-xs" />
            <span className="text-xs">🌿</span>
          </div>

          {/* Left Parchment Page */}
          <div className="flex-1 bg-[#FBF5E8] p-4 border-r-2 border-[#E8DAC5] flex flex-col justify-between shadow-inner">
            <div className="text-[11px] font-fredoka font-bold text-[#8C6D4F] uppercase tracking-wider text-center border-b border-[#E8DAC5] pb-1 flex items-center justify-center gap-1">
              <span>📖</span>
              <span>The Grand Storybook</span>
            </div>
            <div className="flex flex-col items-center justify-center my-auto">
              <span className="text-2xl text-cozy-gold">✧ ✦ ✧</span>
              <p className="text-[11px] font-hand text-[#6D533B] text-center mt-2 italic px-2">
                "A turn of the leaf, a destined number, a stickman awakes."
              </p>
              <div className="mt-2 text-xs text-[#A88C70]">❧ ❦ ❧</div>
            </div>
            <div className="text-[10px] font-fredoka text-[#A88C70] text-center">
              PageShooter Tales
            </div>
          </div>

          {/* Right Parchment Page (Flipping Page) */}
          <div
            className={`
              flex-1 bg-[#FFFDF9] p-4 flex flex-col justify-between shadow-[-5px_0_15px_rgba(70,43,24,0.08)] rounded-r-xl
              ${phase === "FLIPPING" ? "animate-pulse" : ""}
            `}
          >
            <div className="text-[11px] font-fredoka font-bold text-[#8C6D4F] uppercase tracking-wider text-center border-b border-[#E8DAC5] pb-1">
              {phase === "FLIPPING" ? "Turning Page..." : "Destined Leaf"}
            </div>

            {/* Revealed Page Number */}
            <div className="flex flex-col items-center justify-center my-auto">
              <div className="text-[11px] uppercase font-fredoka tracking-widest text-[#8C6D4F] mb-0.5">
                Folio
              </div>
              <div className="flex items-baseline font-fredoka">
                {phase === "REVEAL" || phase === "CONSEQUENCE" ? (
                  <>
                    <span className="text-4xl sm:text-5xl font-black text-cozy-brown">
                      {tensAndHundreds}
                    </span>
                    <span className="text-5xl sm:text-6xl font-black text-cozy-coral animate-bounce inline-block ml-0.5 drop-shadow-sm">
                      {outcome}
                    </span>
                  </>
                ) : (
                  <span className="text-4xl sm:text-5xl font-black text-[#A68767] font-mono">
                    {displayPage}
                  </span>
                )}
              </div>

              {(phase === "REVEAL" || phase === "CONSEQUENCE") && (
                <div className="mt-2 px-3 py-0.5 bg-cozy-gold-light border-2 border-cozy-gold rounded-full text-xs font-fredoka font-bold text-cozy-brown shadow-xs flex items-center gap-1">
                  <span>⭐</span>
                  <span>Target Cell #{outcome}</span>
                </div>
              )}
            </div>

            <div className="text-[10px] font-fredoka text-[#A88C70] text-center">
              Page {phase === "REVEAL" || phase === "CONSEQUENCE" ? pageNumber : displayPage} of 500
            </div>
          </div>
        </div>

        {/* Consequence Banner Subtitle */}
        <div className="mt-5 text-center max-w-md px-4">
          <div
            className={`
              bg-[#FFFDF9] border-2 border-cozy-gold px-5 py-2.5 rounded-2xl shadow-cozy transition-all duration-500
              ${phase === "CONSEQUENCE"
                ? "opacity-100 scale-100"
                : "opacity-0 scale-95"
              }
            `}
          >
            <p className="font-fredoka text-base sm:text-lg font-bold text-cozy-brown">
              {consequenceText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
