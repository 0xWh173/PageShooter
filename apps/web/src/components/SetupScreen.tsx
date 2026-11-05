import React, { useState } from "react";
import type { MatchState } from "@pageshooter/shared";

interface SetupScreenProps {
  savedMatch: MatchState | null;
  onResumeSavedMatch: () => void;
  onDiscardSavedMatch: () => void;
  onStartMatch: (playerNames: string[]) => void;
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
        const candidate = DEFAULT_COZY_NAMES[next.length] || BACKUP_COZY_NAMES[next.length - DEFAULT_COZY_NAMES.length] || `Player ${next.length + 1}`;
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
    const finalNames = playerNames.map((n, i) => n.trim() || `Player ${i + 1}`);
    onStartMatch(finalNames);
  };

  return (
    <div className="min-h-screen bg-cozy-ivory text-cozy-brown-dark flex flex-col items-center justify-center p-4 select-none">
      <div className="max-w-2xl w-full bg-cozy-white border-2 border-cozy-parchment rounded-3xl p-6 sm:p-10 shadow-card relative">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-4xl mb-2">📖 ✏️</div>
          <h1 className="font-fredoka text-3xl sm:text-4xl font-bold text-cozy-brown-dark tracking-tight">
            PageShooter
          </h1>
          <p className="text-sm font-fredoka text-cozy-brown/80 mt-1">
            A turn-based illustrated paper game for 5 to 10 players
          </p>
        </div>

        {/* Saved Match Notice (If Active Match Exists in IndexedDB) */}
        {savedMatch && savedMatch.phase === "ACTIVE" && (
          <div className="mb-6 p-4 rounded-2xl bg-cozy-amber-light border border-cozy-amber/70 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xs">
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔖</span>
                <span className="font-fredoka font-bold text-cozy-brown-dark text-sm sm:text-base">
                  Active Game Discovered
                </span>
              </div>
              <p className="text-xs font-fredoka text-cozy-brown/80 mt-0.5">
                {savedMatch.players.length} Players • Page #{savedMatch.turn.turnNumber} • In Progress
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onResumeSavedMatch}
                className="flex-1 sm:flex-none px-4 py-2 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-xs rounded-full shadow-xs transition-all cursor-pointer"
              >
                Resume Game ➔
              </button>
              <button
                type="button"
                onClick={onDiscardSavedMatch}
                className="px-3 py-2 bg-cozy-white hover:bg-cozy-peach/20 text-cozy-brown hover:text-cozy-brown-dark border border-cozy-parchment text-xs font-fredoka font-medium rounded-full transition-colors cursor-pointer"
                title="Discard saved match"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Setup Form */}
        <form onSubmit={handleStart} className="space-y-6">
          {/* Player Count Selector */}
          <div>
            <label className="block text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown mb-2">
              Number of Players (5 – 10)
            </label>
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              {[5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => handlePlayerCountChange(num)}
                  className={`
                    flex-1 py-2 sm:py-2.5 rounded-xl font-fredoka text-sm sm:text-base font-bold transition-all cursor-pointer border
                    ${playerCount === num
                      ? "bg-cozy-amber text-cozy-brown-dark border-cozy-amber-dark shadow-xs"
                      : "bg-[#FAF7F0] border-cozy-parchment text-cozy-brown hover:border-cozy-amber"
                    }
                  `}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>

          {/* Player Names Configuration */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown">
                Player Names
              </label>
              <button
                type="button"
                onClick={handleRandomizeNames}
                className="text-xs font-fredoka font-semibold text-cozy-amber-dark hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>🎲</span>
                <span>Randomize Names</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-[#FAF7F0] border border-cozy-parchment rounded-xl px-3 py-1.5 focus-within:border-cozy-amber transition-colors"
                >
                  <span className="font-fredoka text-xs font-bold text-cozy-brown-dark bg-cozy-parchment/60 px-1.5 py-0.5 rounded-md min-w-[28px] text-center">
                    P{idx + 1}
                  </span>
                  <input
                    type="text"
                    maxLength={20}
                    value={playerNames[idx] || ""}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    placeholder={`Player ${idx + 1}`}
                    className="w-full bg-transparent text-sm font-fredoka font-semibold text-cozy-brown-dark focus:outline-none placeholder:text-cozy-brown/40"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] font-fredoka text-cozy-brown/70 mt-2">
              Seats P1 to P{playerCount} and initial turn order are randomly shuffled at match creation.
            </p>
          </div>

          {/* Start Battle Button */}
          <button
            type="submit"
            className="w-full py-3.5 sm:py-4 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-base rounded-2xl transition-all shadow-xs active:scale-[0.99] cursor-pointer border border-cozy-amber-dark"
          >
            Enter the Storybook Arena ➔
          </button>
        </form>
      </div>
    </div>
  );
};
