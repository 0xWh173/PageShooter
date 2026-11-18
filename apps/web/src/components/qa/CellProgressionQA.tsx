import React from "react";
import { HandDrawnStickman } from "../../characters/components/HandDrawnStickman.js";
import { HAND_DRAWN_CHARACTERS } from "../../characters/roster.js";
import type { CellProgress } from "@pageshooter/shared";

const STAGES: { stage: CellProgress; label: string; desc: string }[] = [
  { stage: 1, label: "Stage 1: Face", desc: "Head, hair, glasses & hat" },
  { stage: 2, label: "Stage 2: Body", desc: "Ink torso & clothing" },
  { stage: 3, label: "Stage 3: Legs", desc: "Legs on baseline Y=110" },
  { stage: 4, label: "Stage 4: Arms", desc: "Expressive stick arms" },
  { stage: 5, label: "Stage 5: Armed", desc: "Shadow Scythe / Katana" }
];

export const CellProgressionQA: React.FC = () => {
  return (
    <div className="min-h-screen bg-[#FDFBF7] text-[#2B2118] p-4 sm:p-8 font-fredoka selection:bg-amber-200">
      <div className="max-w-6xl mx-auto">
        <header className="text-center mb-8">
          <div className="inline-block bg-[#F5EDE0] border border-[#D4C5B3] px-4 py-1 rounded-full text-xs font-bold uppercase tracking-widest text-[#7C2D12] mb-2 shadow-xs">
            ✏️ 20-Character 5-Stage Cell Progression & Defeat Verification
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#2B2118]">
            Character Continuity Across All Cell Progression Stages
          </h1>
          <p className="text-xs sm:text-sm text-[#786C5E] max-w-2xl mx-auto mt-1">
            Verifying strict character visual continuity across all 20 hand-drawn fighters: each stickman visibly progresses from their distinct head/hat to full folio warrior and defeated K.O. state with zero identity switching.
          </p>
        </header>

        <div className="space-y-8">
          {HAND_DRAWN_CHARACTERS.map((char) => (
            <div
              key={char.id}
              id={`character-progression-${char.id}`}
              className="bg-[#FFFDF9] border-2 border-[#E8DEC8] rounded-2xl p-4 sm:p-6 shadow-xs"
            >
              <div className="flex items-center justify-between border-b border-[#EFE5D5] pb-3 mb-4">
                <div>
                  <h2 className="text-lg font-bold text-[#2B2118]">{char.name}</h2>
                  <span className="text-xs text-[#8C7A6B]">
                    Title: {char.title} • Weapon: 🎯 {char.weapon.replace("-", " ")} • Traits: {char.hat !== "none" ? char.hat : ""}{char.hair !== "bald" ? `, ${char.hair}` : ""}{char.eyewear !== "none" ? `, ${char.eyewear}` : ""}
                  </span>
                </div>
                <span className="text-xs font-mono bg-[#FAF3E8] px-3 py-1 rounded-full text-[#B45309] font-bold">
                  ID: {char.id}
                </span>
              </div>

              {/* 5 Stages + KO Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
                {STAGES.map((st) => (
                  <div
                    key={st.stage}
                    className="flex flex-col items-center bg-[#FAF6EE] border border-[#EBE1D0] rounded-xl p-2 text-center"
                    data-character={char.id}
                    data-stage={st.stage}
                  >
                    <div className="w-24 h-28 relative flex items-center justify-center overflow-hidden mb-1">
                      <HandDrawnStickman
                        characterId={char.id}
                        progress={st.stage}
                        isDestroyed={false}
                        pose={st.stage === 5 ? "ready" : "idle"}
                      />
                    </div>
                    <span className="text-xs font-bold text-[#2B2118] leading-tight">
                      {st.label}
                    </span>
                    <span className="text-[10px] text-[#8C7A6B]">
                      {st.desc}
                    </span>
                  </div>
                ))}

                {/* Destroyed / KO State */}
                <div
                  className="flex flex-col items-center bg-[#F5EDE0]/60 border border-[#E5DAC6] rounded-xl p-2 text-center"
                  data-character={char.id}
                  data-stage="defeated"
                >
                  <div className="w-24 h-28 relative flex items-center justify-center overflow-hidden mb-1">
                    <HandDrawnStickman
                      characterId={char.id}
                      progress={3}
                      isDestroyed={true}
                      pose="defeat"
                    />
                  </div>
                  <span className="text-xs font-bold text-[#B91C1C] leading-tight">
                    Destroyed (K.O.)
                  </span>
                  <span className="text-[10px] text-[#8C7A6B]">
                    Spiral Eyes & Pencil X
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
