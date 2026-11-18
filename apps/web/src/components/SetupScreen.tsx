import React, { useState } from "react";
import type { MatchState } from "@pageshooter/shared";

export interface PlayerSetupInput {
  name: string;
}

interface SetupScreenProps {
  savedMatch: MatchState | null;
  onResumeSavedMatch: () => void;
  onDiscardSavedMatch: () => void;
  onStartMatch: (players: PlayerSetupInput[]) => void;
}

const DEFAULT_COZY_NAMES = [
  "Barnaby",
  "Clover",
  "Pip",
  "Hazel",
  "Oliver",
  "Rowan",
  "Milo",
  "Fern",
  "Bramble",
  "Willow"
];

const BACKUP_COZY_NAMES = [
  "Jasper",
  "Luna",
  "Otis",
  "Poppy",
  "Finley",
  "Rosie",
  "Sprout",
  "Twig",
  "Waffles",
  "Ziggy"
];

export const SetupScreen: React.FC<SetupScreenProps> = ({
  savedMatch,
  onResumeSavedMatch,
  onDiscardSavedMatch,
  onStartMatch
}) => {
  const [playerCount, setPlayerCount] = useState<number>(5);
  const [playerNames, setPlayerNames] = useState<string[]>(() =>
    DEFAULT_COZY_NAMES.slice(0, 5)
  );

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setPlayerNames((prev) => {
      const next = [...prev];
      while (next.length < count) {
        const candidate =
          DEFAULT_COZY_NAMES[next.length] ||
          BACKUP_COZY_NAMES[next.length - DEFAULT_COZY_NAMES.length] ||
          `Player ${next.length + 1}`;
        next.push(candidate);
      }
      return next.slice(0, count);
    });
  };

  const handleNameChange = (idx: number, newName: string) => {
    setPlayerNames((prev) => {
      const next = [...prev];
      next[idx] = newName;
      return next;
    });
  };

  const handleRandomizeNames = () => {
    const pool = [...DEFAULT_COZY_NAMES, ...BACKUP_COZY_NAMES].sort(() => Math.random() - 0.5);
    setPlayerNames(pool.slice(0, playerCount));
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const result: PlayerSetupInput[] = [];
    for (let i = 0; i < playerCount; i++) {
      result.push({
        name: playerNames[i]?.trim() || `Player ${i + 1}`
      });
    }
    onStartMatch(result);
  };

  return (
    <div className="min-h-screen comic-split-bg text-[#1C1917] flex flex-col items-center justify-center p-3 sm:p-6 select-none">
      <div className="cartoon-card-lg max-w-2xl w-full bg-[#FAF4E6] overflow-hidden relative">
        {/* Warm Charcoal Graphic-Novel Panel Header (Reference 3 Style) */}
        <div className="bg-[#1C1917] text-[#FAF4E6] px-5 py-4 border-b-4 border-[#1C1917] flex items-center justify-between">
          <div>
            <div className="inline-block bg-[#C85A48] text-[#FAF4E6] border-2 border-[#FAF4E6] px-2.5 py-0.5 text-[10px] font-mono font-bold uppercase tracking-widest mb-1 -skew-x-6">
              COMIC ISSUE #1 • LOCAL ARENA
            </div>
            <h1 className="font-bangers text-3xl sm:text-5xl tracking-wider text-[#E5C467] comic-title-3d leading-none">
              PageShooter
            </h1>
            <p className="text-xs sm:text-sm font-bold text-[#FAF4E6]/90 mt-1">
              Hand-Drawn Illustrated Folio Game for 5 to 10 players
            </p>
          </div>
          <div className="hidden sm:flex flex-col items-center justify-center bg-[#E5C467] text-[#1C1917] border-3 border-[#FAF4E6] px-3 py-2 -rotate-3 shadow-[4px_4px_0_#C85A48]">
            <span className="text-2xl leading-none">📖⚡</span>
            <span className="font-bangers text-xs tracking-wider uppercase mt-0.5">5-10 SCRIBES</span>
          </div>
        </div>

        <div className="p-5 sm:p-8">
          {/* Saved Match Notice (If Active Match Exists in IndexedDB) */}
          {savedMatch && savedMatch.phase === "ACTIVE" && (
            <div className="mb-6 p-4 bg-[#E5C467] border-4 border-[#1C1917] shadow-[6px_6px_0_#1C1917] flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-left">
                <div className="flex items-center gap-2">
                  <span className="text-xl">🔖</span>
                  <span className="font-bangers tracking-wider text-[#1C1917] text-lg uppercase">
                    Active Game Discovered!
                  </span>
                </div>
                <p className="text-xs font-bold text-[#1C1917]/80 mt-0.5">
                  Turn {savedMatch.turn.turnNumber} • {savedMatch.players.length} players
                </p>
              </div>
              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={onResumeSavedMatch}
                  className="cartoon-btn flex-1 sm:flex-none px-4 py-2 bg-[#688B9A] hover:bg-[#7A9DAB] text-[#FAF4E6] font-bangers tracking-wider text-sm uppercase cursor-pointer"
                >
                  ▶ Resume Game!
                </button>
                <button
                  type="button"
                  onClick={onDiscardSavedMatch}
                  className="cartoon-btn flex-1 sm:flex-none px-3.5 py-2 bg-[#C85A48] hover:bg-[#D66A59] text-[#FAF4E6] font-bangers tracking-wider text-sm uppercase cursor-pointer"
                >
                  ✕ Discard
                </button>
              </div>
            </div>
          )}

          {/* Setup Form */}
          <form onSubmit={handleStart} className="space-y-5">
            {/* Player Count Selector */}
            <div className="bg-[#EFE6D0] border-3 border-[#1C1917] p-4 shadow-[4px_4px_0_#1C1917]">
              <div className="flex items-center justify-between mb-2.5">
                <label className="block text-xs font-bangers tracking-wider uppercase bg-[#1C1917] text-[#FAF4E6] px-2.5 py-0.5">
                  Number of Players (5 – 10)
                </label>
                <span className="text-[11px] font-bold text-[#1C1917]/80">
                  All seats share equal folio columns
                </span>
              </div>
              <div className="flex items-center justify-between gap-2">
                {[5, 6, 7, 8, 9, 10].map((num) => (
                  <button
                    type="button"
                    key={num}
                    onClick={() => handlePlayerCountChange(num)}
                    className={`
                      cartoon-btn flex-1 py-2 sm:py-2.5 font-bangers text-base sm:text-lg tracking-wider cursor-pointer
                      ${playerCount === num
                        ? "bg-[#C85A48] text-[#FAF4E6]"
                        : "bg-[#FAF4E6] text-[#1C1917] hover:bg-[#E5C467]"
                      }
                    `}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>

            {/* Player Names & Seats */}
            <div className="bg-[#FAF4E6] border-3 border-[#1C1917] p-4 shadow-[4px_4px_0_#1C1917]">
              <div className="flex items-center justify-between mb-3">
                <label className="text-xs font-bangers tracking-wider uppercase bg-[#1C1917] text-[#FAF4E6] px-2.5 py-0.5">
                  Player Seats & Custom Names
                </label>
                <button
                  type="button"
                  onClick={handleRandomizeNames}
                  className="cartoon-btn px-3 py-1 bg-[#688B9A] hover:bg-[#7A9DAB] text-[#FAF4E6] text-xs font-bangers tracking-wider uppercase cursor-pointer flex items-center gap-1"
                >
                  <span>🎲</span>
                  <span>Randomize Names</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                {Array.from({ length: playerCount }).map((_, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-[#EFE6D0] border-2 border-[#1C1917] shadow-[3px_3px_0_#1C1917] px-2.5 py-1.5 focus-within:bg-[#E5C467]/45 transition-colors"
                  >
                    <span className="font-bangers tracking-wider text-xs text-[#FAF4E6] bg-[#1C1917] px-2 py-0.5 min-w-[30px] text-center">
                      P{idx + 1}
                    </span>
                    <input
                      type="text"
                      maxLength={20}
                      value={playerNames[idx] || ""}
                      onChange={(e) => handleNameChange(idx, e.target.value)}
                      placeholder={`Player ${idx + 1}`}
                      className="w-full bg-transparent text-sm font-bold text-[#1C1917] focus:outline-none placeholder:text-[#1C1917]/40"
                    />
                    <span className="text-base flex-shrink-0" title="Comic duellist cell">
                      ✏️
                    </span>
                  </div>
                ))}
              </div>

              {/* Editor's Note Comic Caption Box (Reference 3 Style) */}
              <div className="comic-editors-note mt-3 p-2.5">
                * Editor&apos;s note: Seats & turn order shuffle automatically! Each player commands 5 goofy comic duellists across cells #0, #2, #4, #6, and #8.
              </div>
            </div>

            {/* Start Battle Skewed Comic Ribbon Button */}
            <button
              type="submit"
              className="cartoon-btn w-full py-3.5 sm:py-4 bg-[#E5C467] hover:bg-[#EDD07A] text-[#1C1917] font-bangers tracking-widest text-xl uppercase cursor-pointer flex items-center justify-center gap-2"
            >
              <span>☛</span>
              <span>Begin Folio Match ➔</span>
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
