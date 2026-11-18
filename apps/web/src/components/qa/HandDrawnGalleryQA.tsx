import React from "react";
import { HAND_DRAWN_CHARACTERS } from "../../characters/roster.js";
import { HandDrawnStickman } from "../../characters/components/HandDrawnStickman.js";

export const HandDrawnGalleryQA: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2B2118] p-4 sm:p-8 font-fredoka selection:bg-amber-200">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <header className="text-center mb-8">
          <div className="inline-block bg-[#F5EDE0] border border-[#D4C5B3] px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-[#7C2D12] mb-2 shadow-xs">
            ✏️ Original Hand-Drawn Stickman Roster (20 Characters)
          </div>
          <h1 className="text-2xl sm:text-4xl font-extrabold text-[#2B2118]">
            PageShooter — Hand-Drawn Character Roster
          </h1>
          <p className="text-xs sm:text-sm text-[#786C5E] max-w-2xl mx-auto mt-1">
            Expressive black pen ink outlines, distinctive hats, hairstyles, eyewear, facial hair, accessories, and cartoon popguns. Vector SVG rendering with uniform proportions and ground baseline Y=110.
          </p>
        </header>

        {/* 20-Character Responsive Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {HAND_DRAWN_CHARACTERS.map((char) => (
            <div
              key={char.id}
              id={`qa-character-${char.id}`}
              className="bg-[#FFFDF9] border-2 border-[#E8DEC8] hover:border-[#D4B895] rounded-2xl p-3 sm:p-4 flex flex-col items-center text-center shadow-xs transition-all hover:shadow-md"
            >
              {/* Stickman SVG Box */}
              <div className="w-28 h-32 relative flex items-center justify-center bg-[#FAF6EE] border border-[#EFE5D5] rounded-xl overflow-hidden mb-2 p-1">
                <HandDrawnStickman
                  characterId={char.id}
                  progress={5}
                  isDestroyed={false}
                  pose="ready"
                />
              </div>

              {/* Character Details */}
              <h2 className="text-sm sm:text-base font-bold text-[#2B2118] leading-tight">
                {char.name}
              </h2>
              <span className="text-[10px] font-medium text-[#8C7A6B] mb-2">
                {char.title}
              </span>

              {/* Trait Tags */}
              <div className="flex flex-wrap gap-1 justify-center mb-2">
                {char.hat !== "none" && (
                  <span className="text-[8px] bg-[#FAF1DF] border border-[#E2CEAE] text-[#8C5D23] px-1.5 py-0.5 rounded capitalize">
                    🧢 {char.hat.replace("-", " ")}
                  </span>
                )}
                {char.hair !== "bald" && (
                  <span className="text-[8px] bg-[#EBF3E8] border border-[#C5DDBB] text-[#3D632F] px-1.5 py-0.5 rounded capitalize">
                    ✂️ {char.hair.replace("-", " ")}
                  </span>
                )}
                {char.eyewear !== "none" && (
                  <span className="text-[8px] bg-[#EBF2F7] border border-[#BDD4E7] text-[#2C5779] px-1.5 py-0.5 rounded capitalize">
                    👓 {char.eyewear.replace("-", " ")}
                  </span>
                )}
              </div>

              {/* Weapon Badge */}
              <div className="w-full bg-[#FAF3E8] border border-[#E5DAC6] rounded-lg py-1 px-2 text-center mt-auto">
                <span className="text-[8px] uppercase tracking-wider font-bold text-[#B45309] block">
                  Folio Weapon
                </span>
                <span className="text-[11px] font-extrabold text-[#7C2D12] truncate block capitalize">
                  🎯 {char.weapon.replace("-", " ")}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

