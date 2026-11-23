import React, { useEffect, useState, useRef, useCallback } from "react";
import type { CellValue } from "@pageshooter/shared";
import { soundManager } from "../audio/soundManager.js";

interface BookCinematicProps {
  pageNumber: number;
  outcome: CellValue;
  consequenceText: string;
  actorName?: string;
  onComplete: () => void;
}

const COMIC_FLIP_SFX_WORDS = ["FLIP!", "WHOOSH!", "SWISH!", "FLAP!", "ZAP!"];

export const BookCinematic: React.FC<BookCinematicProps> = ({
  pageNumber,
  outcome,
  consequenceText,
  actorName,
  onComplete
}) => {
  const [phase, setPhase] = useState<"OPENING" | "FLIPPING" | "REVEAL" | "CONSEQUENCE">("OPENING");
  const [displayPage, setDisplayPage] = useState<number>(1);
  const [sfxWordIndex, setSfxWordIndex] = useState<number>(0);
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

    // 0s - 0.65s: Storybook opens with comical anticipation
    const t1 = setTimeout(() => {
      setPhase("FLIPPING");
      soundManager.playPageFlip();
    }, 650);

    // Page flipping interval during FLIPPING phase
    const pageInterval = setInterval(() => {
      setDisplayPage(() => Math.floor(Math.random() * 500) + 1);
      setSfxWordIndex((i) => (i + 1) % COMIC_FLIP_SFX_WORDS.length);
      soundManager.playPageFlip();
    }, 170);

    // 2.6s: Settle on exact page number & climax starburst reveal
    const t2 = setTimeout(() => {
      clearInterval(pageInterval);
      setDisplayPage(pageNumber);
      setPhase("REVEAL");
      soundManager.playTurnChime();
    }, 2600);

    // 3.55s: Reveal consequence speech bubble
    const t3 = setTimeout(() => {
      setPhase("CONSEQUENCE");
    }, 3550);

    // 5.0s: Complete animation
    const t4 = setTimeout(() => {
      finishCinematic();
    }, 5000);

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
  const currentSfxWord = COMIC_FLIP_SFX_WORDS[sfxWordIndex];

  return (
    <div
      data-testid="book-cinematic-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#1C1917]/80 backdrop-blur-sm p-4 animate-in fade-in select-none"
    >
      {/* Fast Forward Skip Button (Comic Ribbon) */}
      <button
        onClick={handleSkip}
        data-testid="book-cinematic-skip"
        className="cartoon-btn absolute top-6 right-6 text-xs sm:text-sm font-bangers tracking-wider uppercase text-[#1C1917] bg-[#E5C467] hover:bg-[#EDD07A] px-4 py-1.5 cursor-pointer flex items-center gap-1.5"
      >
        <span>Turn Leaf Fast</span>
        <span>⏩</span>
      </button>

      <div className="relative max-w-2xl w-full flex flex-col items-center">
        {/* Top Comic Issue Banner showing WHO is flipping */}
        <div className="mb-3 bg-[#1C1917] text-[#FAF4E6] border-3 border-[#1C1917] shadow-[5px_5px_0_#C85A48] px-4 py-1.5 -skew-x-6 flex items-center gap-2">
          <span className="text-base">📖</span>
          <span className="font-bangers tracking-widest text-sm sm:text-base text-[#E5C467] uppercase">
            {actorName
              ? `${actorName} IS FLIPPING THE FOLIO • ISSUE #${
                  phase === "REVEAL" || phase === "CONSEQUENCE" ? pageNumber : displayPage
                }!`
              : `COMIC FOLIO ISSUE #${
                  phase === "REVEAL" || phase === "CONSEQUENCE" ? pageNumber : displayPage
                } • DESTINY ROLL!`}
          </span>
        </div>

        {/* Open Two-Page Vintage Comic Book Spread with 3D Flipping Leaves */}
        <div className="comic-book-stage relative w-full max-w-xl bg-[#1C1917] border-4 border-[#1C1917] shadow-[10px_10px_0_#1C1917] p-2 sm:p-2.5 grid grid-cols-1 sm:grid-cols-2 gap-1.5">
          {/* Center Stapled Comic Spine Accent (Desktop) */}
          <div
            aria-hidden="true"
            className="hidden sm:flex absolute inset-y-2 left-1/2 -translate-x-1/2 w-3 z-30 flex-col items-center justify-around pointer-events-none"
          >
            <span className="w-1.5 h-5 bg-[#A99B82] border border-[#1C1917] rounded-xs" />
            <span className="w-1.5 h-5 bg-[#A99B82] border border-[#1C1917] rounded-xs" />
          </div>

          {/* Floating Comic Onomatopoeia Burst during FLIPPING */}
          {phase === "FLIPPING" && (
            <div
              aria-hidden="true"
              className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 z-40 animate-comic-onomatopoeia"
            >
              <span className="inline-block bg-[#C85A48] text-[#FAF4E6] border-3 border-[#1C1917] shadow-[4px_4px_0_#1C1917] px-3 py-0.5 font-bangers text-lg tracking-widest -rotate-6">
                {currentSfxWord}
              </span>
            </div>
          )}

          {/* 3D Animated Turning Comic Pages (Right -> Left across the Spine) */}
          {phase === "FLIPPING" && (
            <div
              aria-hidden="true"
              className="hidden sm:block pointer-events-none absolute inset-y-2.5 right-2.5 w-[calc(50%-0.75rem)] z-25"
            >
              {[0, 210, 420].map((delayMs, idx) => (
                <div
                  key={delayMs}
                  style={{ animationDelay: `${delayMs}ms` }}
                  className="comic-flipping-leaf absolute inset-0 bg-[#FAF4E6] border-3 border-[#1C1917] p-3 flex flex-col justify-between overflow-hidden"
                >
                  <div className="comic-halftone-dots absolute inset-0 opacity-35" />
                  <div className="relative z-10 h-5 bg-[#E5C467] border-2 border-[#1C1917] flex items-center justify-center font-bangers text-[10px] tracking-widest text-[#1C1917]">
                    PAGE #{((displayPage + idx * 37) % 500) + 1}
                  </div>
                  <div className="relative z-10 my-2 flex-1 border-2 border-[#1C1917] bg-[#EFE6D0] flex items-center justify-center">
                    <span className="font-bangers text-3xl text-[#C85A48] -rotate-6">
                      {idx === 0 ? "FLIP!" : idx === 1 ? "WHOOSH!" : "POW!"}
                    </span>
                  </div>
                  <div className="relative z-10 h-3 bg-[#1C1917]/15 rounded-xs" />
                </div>
              ))}
            </div>
          )}

          {/* LEFT COMIC PAGE: 2 Stacked Graphic-Novel Story Panels */}
          <div className="bg-[#FAF4E6] border-3 border-[#1C1917] p-3 flex flex-col justify-between gap-2.5 relative overflow-hidden">
            {/* Top Header Strip */}
            <div className="bg-[#1C1917] text-[#E5C467] font-bangers tracking-wider text-xs uppercase px-2.5 py-1 text-center">
              THE GRAND COMICBOOK
            </div>

            {/* Comic Panel 1: Goofy Scribe Flipping Pages SVG Illustration */}
            <div className="border-2 border-[#1C1917] bg-[#EFE6D0] p-2 flex flex-col items-center justify-center relative">
              {/* Speech Bubble */}
              <div className="bg-[#FAF4E6] border-2 border-[#1C1917] shadow-[2px_2px_0_#1C1917] px-2.5 py-0.5 text-[10px] font-bold text-[#1C1917] mb-1 -rotate-2">
                {phase === "OPENING"
                  ? '"CRACKING OPEN THE FOLIO!"'
                  : phase === "FLIPPING"
                  ? '"FLIP-FLAP-WHOOSH!!"'
                  : '"BEHOLD! THE SACRED PAGE!"'}
              </div>

              <svg viewBox="0 0 160 86" className="w-36 h-20 overflow-visible">
                {/* Goofy Comic Scribe Head & Big Glasses */}
                <circle cx="52" cy="40" r="16" fill="#FAF4E6" stroke="#1C1917" strokeWidth="2.6" />
                {/* Silly Wizard/Scribe Beret */}
                <ellipse
                  cx="50"
                  cy="24"
                  rx="18"
                  ry="6"
                  fill="#C85A48"
                  stroke="#1C1917"
                  strokeWidth="2.2"
                  transform="rotate(-10 50 24)"
                />
                {/* Big Comical Goggle Glasses */}
                <circle cx="46" cy="39" r="6" fill="#FFFFFF" stroke="#1C1917" strokeWidth="2.2" />
                <circle cx="59" cy="39" r="6" fill="#FFFFFF" stroke="#1C1917" strokeWidth="2.2" />
                <circle cx="47" cy="39" r="2.2" fill="#1C1917" />
                <circle cx="60" cy="39" r="2.2" fill="#1C1917" />
                {/* Excited Open Grin */}
                <path d="M 46 49 Q 53 56 60 49 Z" fill="#C85A48" stroke="#1C1917" strokeWidth="1.8" />
                {/* Mini Comic Book Flipping Pages on Desk */}
                <path d="M 88 64 L 116 54 L 144 64 L 116 72 Z" fill="#E5C467" stroke="#1C1917" strokeWidth="2.2" />
                <path d="M 116 70 L 116 42 L 140 48 L 140 64 Z" fill="#FAF4E6" stroke="#1C1917" strokeWidth="2" />
                <path d="M 116 70 L 116 42 L 92 48 L 92 64 Z" fill="#FAF4E6" stroke="#1C1917" strokeWidth="2" />
                {/* Motion Flip Arcs */}
                <path d="M 96 36 Q 116 20 136 36" fill="none" stroke="#C85A48" strokeWidth="2" strokeDasharray="4 3" />
                <text x="116" y="24" textAnchor="middle" fontSize="10" fontFamily="Bangers, sans-serif" fill="#1C1917">
                  {phase === "FLIPPING" ? currentSfxWord : "TA-DA!!"}
                </text>
              </svg>
            </div>

            {/* Comic Panel 2: Caption Strip */}
            <div className="bg-[#E5C467] border-2 border-[#1C1917] p-2 text-center shadow-[2px_2px_0_#1C1917]">
              <p className="text-[11px] font-bold text-[#1C1917] leading-snug italic">
                &ldquo;A turn of the comic leaf, a destined number, a goofy duellist awakes!&rdquo;
              </p>
            </div>

            <div className="text-[10px] font-mono font-bold text-[#1C1917]/70 text-center uppercase">
              PageShooter Comic Tales
            </div>
          </div>

          {/* RIGHT COMIC PAGE: Destined Leaf & Jagged Starburst Number Reveal */}
          <div className="bg-[#FAF4E6] border-3 border-[#1C1917] p-3 flex flex-col justify-between relative overflow-hidden">
            {/* Halftone Dot Backdrop */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 comic-halftone-dots opacity-40"
            />

            <div className="relative z-10 bg-[#C85A48] text-[#FAF4E6] border-2 border-[#1C1917] font-bangers tracking-wider text-xs uppercase px-2.5 py-1 text-center">
              {phase === "FLIPPING" ? "⚡ Turning Comic Pages..." : "★ Destined Comic Panel ★"}
            </div>

            {/* Revealed Page Number inside a Comic Starburst Medallion */}
            <div className="relative z-10 flex flex-col items-center justify-center my-auto py-2">
              <div
                className={`relative flex items-center justify-center ${
                  phase === "REVEAL" || phase === "CONSEQUENCE" ? "animate-comic-pop-slam" : ""
                }`}
              >
                {/* Jagged Comic Burst Behind Page Number */}
                <svg viewBox="0 0 180 120" className="w-44 h-28">
                  <polygon
                    points="90,4 108,22 136,10 132,35 166,34 146,58 174,78 142,84 152,110 118,98 98,116 80,98 46,112 54,84 20,80 46,58 24,34 60,36 56,10 82,22"
                    fill="#1C1917"
                    transform="translate(4, 4)"
                  />
                  <polygon
                    points="90,4 108,22 136,10 132,35 166,34 146,58 174,78 142,84 152,110 118,98 98,116 80,98 46,112 54,84 20,80 46,58 24,34 60,36 56,10 82,22"
                    fill="#E5C467"
                    stroke="#1C1917"
                    strokeWidth="3.5"
                  />
                </svg>

                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className="text-[10px] uppercase font-bangers tracking-widest text-[#1C1917]">
                    FOLIO
                  </span>
                  <div className="flex items-baseline font-bangers leading-none">
                    {phase === "REVEAL" || phase === "CONSEQUENCE" ? (
                      <>
                        <span className="text-3xl sm:text-4xl text-[#1C1917]">
                          {tensAndHundreds}
                        </span>
                        <span className="text-4xl sm:text-5xl text-[#C85A48] inline-block ml-0.5 underline decoration-2">
                          {outcome}
                        </span>
                      </>
                    ) : (
                      <span className="text-3xl sm:text-4xl text-[#1C1917] font-mono font-extrabold">
                        {displayPage}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {(phase === "REVEAL" || phase === "CONSEQUENCE") && (
                <div className="mt-1.5 px-3.5 py-1 bg-[#1C1917] text-[#E5C467] border-2 border-[#1C1917] shadow-[3px_3px_0_#C85A48] -skew-x-6 text-xs font-bangers tracking-wider uppercase flex items-center gap-1.5 animate-comic-pop-slam">
                  <span>🎯</span>
                  <span>Target Cell #{outcome}</span>
                </div>
              )}
            </div>

            <div className="relative z-10 text-[10px] font-mono font-bold text-[#1C1917]/75 text-center uppercase">
              Page {phase === "REVEAL" || phase === "CONSEQUENCE" ? pageNumber : displayPage} of 500
            </div>
          </div>
        </div>

        {/* Comic Speech-Bubble Consequence Banner */}
        <div className="mt-4 text-center max-w-md w-full px-4">
          <div
            className={`
              bg-[#FAF4E6] border-3 border-[#1C1917] shadow-[6px_6px_0_#1C1917] px-5 py-3 transition-all duration-300 relative
              ${phase === "CONSEQUENCE" ? "opacity-100 scale-100" : "opacity-0 scale-95"}
            `}
          >
            <div className="text-[10px] font-mono font-bold uppercase text-[#C85A48] mb-0.5">
              * Comic Narration:
            </div>
            <p className="font-bangers tracking-wider text-base sm:text-lg text-[#1C1917]">
              {consequenceText}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
