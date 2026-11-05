import React, { useEffect, useState } from "react";
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

  useEffect(() => {
    soundManager.playRuneHum();

    // 0s - 1.0s: Tome opens
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
      onComplete();
    }, 5200);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
      clearInterval(pageInterval);
    };
  }, [pageNumber, onComplete]);

  const handleSkip = () => {
    onComplete();
  };

  const tensAndHundreds = Math.floor(pageNumber / 10);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      {/* Skip Button */}
      <button
        onClick={handleSkip}
        className="absolute top-6 right-6 text-xs font-mono uppercase text-fantasy-parchment/60 hover:text-fantasy-gold bg-fantasy-card/80 border border-fantasy-border px-3 py-1.5 rounded-lg transition-colors cursor-pointer"
      >
        Fast Forward ⏭
      </button>

      <div className="relative max-w-lg w-full flex flex-col items-center">
        {/* Ancient Tome Container */}
        <div className="relative w-80 sm:w-96 h-64 sm:h-72 bg-[#1A120B] rounded-2xl border-4 border-[#3D2817] shadow-[0_20px_50px_rgba(0,0,0,0.9),0_0_30px_rgba(229,169,60,0.2)] flex overflow-hidden">
          {/* Leather spine */}
          <div className="w-8 h-full bg-gradient-to-r from-[#120C06] via-[#2D1B0F] to-[#140D07] border-r-2 border-[#4A321E] shadow-inner flex flex-col items-center justify-around py-4">
            <span className="w-2 h-2 rounded-full bg-fantasy-gold/60" />
            <span className="w-2 h-2 rounded-full bg-fantasy-gold/60" />
            <span className="w-2 h-2 rounded-full bg-fantasy-gold/60" />
          </div>

          {/* Left Parchment Page */}
          <div className="flex-1 bg-[#E8DCB8] p-4 border-r border-[#D4C39B] flex flex-col justify-between select-none shadow-inner">
            <div className="text-[10px] font-serif text-[#6B5A40] uppercase tracking-widest text-center border-b border-[#D4C39B] pb-1">
              Grimoire of Fates
            </div>
            <div className="flex flex-col items-center justify-center my-auto opacity-70">
              <span className="text-3xl text-[#5C4D37] font-serif">✧ ✦ ✧</span>
              <p className="text-[9px] font-serif text-[#6B5A40] text-center mt-2 italic px-2">
                "The ink binds flesh and bone. Destiny turns upon the numbered leaf."
              </p>
            </div>
            <div className="text-[9px] font-mono text-[#8C7A5D] text-center">
              Liber Noctis
            </div>
          </div>

          {/* Right Parchment Page (Flipping Page) */}
          <div
            className={`
              flex-1 bg-[#F4E8C1] p-4 flex flex-col justify-between select-none shadow-[-5px_0_15px_rgba(0,0,0,0.15)]
              ${phase === "FLIPPING" ? "animate-pulse" : ""}
            `}
          >
            <div className="text-[10px] font-serif text-[#6B5A40] uppercase tracking-widest text-center border-b border-[#D4C39B] pb-1">
              {phase === "FLIPPING" ? "Turning Leaf..." : "Destined Folio"}
            </div>

            {/* Revealed Page Number */}
            <div className="flex flex-col items-center justify-center my-auto">
              <div className="text-xs uppercase font-serif tracking-widest text-[#7C6949] mb-1">
                Page
              </div>
              <div className="flex items-baseline font-serif">
                {phase === "REVEAL" || phase === "CONSEQUENCE" ? (
                  <>
                    <span className="text-4xl sm:text-5xl font-black text-[#382B1B]">
                      {tensAndHundreds}
                    </span>
                    <span className="text-5xl sm:text-6xl font-black text-fantasy-crimson animate-bounce inline-block ml-0.5 filter drop-shadow">
                      {outcome}
                    </span>
                  </>
                ) : (
                  <span className="text-4xl sm:text-5xl font-black text-[#5C4B35] font-mono">
                    {displayPage}
                  </span>
                )}
              </div>

              {(phase === "REVEAL" || phase === "CONSEQUENCE") && (
                <div className="mt-2 px-2.5 py-0.5 bg-fantasy-gold/20 border border-fantasy-gold/60 rounded-full text-[11px] font-mono font-bold text-[#4A3816]">
                  Target Cell #{outcome}
                </div>
              )}
            </div>

            <div className="text-[9px] font-mono text-[#8C7A5D] text-center">
              Page {phase === "REVEAL" || phase === "CONSEQUENCE" ? pageNumber : displayPage} of 500
            </div>
          </div>
        </div>

        {/* Consequence Subtitle */}
        <div className="mt-6 text-center max-w-md px-4">
          <p
            className={`
              font-serif text-lg sm:text-xl font-bold tracking-wide transition-all duration-500
              ${phase === "CONSEQUENCE"
                ? "opacity-100 text-fantasy-gold-light scale-100 drop-shadow-[0_0_10px_rgba(229,169,60,0.5)]"
                : "opacity-0 scale-95"
              }
            `}
          >
            {consequenceText}
          </p>
        </div>
      </div>
    </div>
  );
};
