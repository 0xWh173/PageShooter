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
        const candidate = DEFAULT_COZY_NAMES[next.length] || BACKUP_COZY_NAMES[next.length - DEFAULT_COZY_NAMES.length] || `Hero ${next.length + 1}`;
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
    <div className="min-h-screen bg-notebook-pattern text-cozy-brown flex flex-col items-center justify-center p-4 select-none">
      <div className="max-w-2xl w-full bg-[#FFFDF9] border-3 border-[#D8C7B0] rounded-3xl p-6 sm:p-10 shadow-cozy-lg relative overflow-hidden">
        {/* Decorative corner illustrations */}
        <div className="absolute top-3 left-4 text-2xl animate-float">🌸</div>
        <div className="absolute top-3 right-4 text-2xl animate-float" style={{ animationDelay: "1.5s" }}>🌿</div>
        <div className="absolute bottom-3 left-4 text-xl">✦</div>
        <div className="absolute bottom-3 right-4 text-xl">✨</div>

        {/* Header */}
        <div className="text-center mb-6">
          <div className="text-5xl mb-2 animate-float">📖 ✏️</div>
          <h1 className="font-fredoka text-3xl sm:text-4xl font-black text-cozy-brown tracking-tight">
            PageShooter
          </h1>
          <p className="text-sm font-hand text-cozy-brown-light mt-1 text-base">
            "A warm, hand-drawn paper battlefield for 5 to 10 friends."
          </p>
        </div>

        {/* Saved Match Notice (If Active Match Exists in IndexedDB) */}
        {savedMatch && savedMatch.phase === "ACTIVE" && (
          <div className="mb-6 p-4 rounded-2xl bg-cozy-gold-light/60 border-2 border-cozy-gold flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm animate-in fade-in">
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-xl">🔖</span>
                <span className="font-fredoka font-bold text-cozy-brown text-sm sm:text-base">
                  Active Adventure Discovered!
                </span>
              </div>
              <p className="text-xs font-hand text-cozy-brown-light mt-0.5">
                {savedMatch.players.length} Players • Page #{savedMatch.turn.turnNumber} • In Progress
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onResumeSavedMatch}
                className="flex-1 sm:flex-none px-4 py-2 bg-cozy-gold hover:bg-cozy-gold-dark text-cozy-brown font-fredoka font-bold text-xs rounded-full shadow-sm transition-all cursor-pointer"
              >
                Resume Game ➔
              </button>
              <button
                type="button"
                onClick={onDiscardSavedMatch}
                className="px-3 py-2 bg-[#FAF5EB] hover:bg-cozy-coral/20 text-cozy-brown-light hover:text-cozy-coral border border-[#D8C7B0] text-xs font-fredoka font-medium rounded-full transition-colors cursor-pointer"
                title="Discard saved match"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* New Match Setup Form */}
        <form onSubmit={handleStart} className="space-y-6">
          {/* Player Count Selector */}
          <div>
            <label className="block text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown-light mb-2">
              Number of Storytellers (5 – 10 Players)
            </label>
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              {[5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => handlePlayerCountChange(num)}
                  className={`
                    flex-1 py-2 sm:py-2.5 rounded-2xl font-fredoka text-sm sm:text-base font-bold transition-all cursor-pointer
                    ${playerCount === num
                      ? "bg-cozy-gold text-cozy-brown shadow-cozy scale-105 border-2 border-cozy-gold-dark"
                      : "bg-[#FAF5EB] border-2 border-[#E2D3BE] text-cozy-brown-light hover:border-cozy-gold"
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
              <label className="text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown-light">
                Storyteller Names
              </label>
              <button
                type="button"
                onClick={handleRandomizeNames}
                className="text-xs font-fredoka font-semibold text-cozy-gold-dark hover:underline cursor-pointer flex items-center gap-1"
              >
                <span>🎲</span>
                <span>Randomize Names</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-56 overflow-y-auto pr-1">
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-[#FAF5EB] border-2 border-[#E2D3BE] rounded-2xl px-3 py-1.5 focus-within:border-cozy-gold transition-colors"
                >
                  <span className="font-fredoka text-xs font-bold text-cozy-brown bg-cozy-gold/30 px-1.5 py-0.5 rounded-md min-w-[28px] text-center">
                    P{idx + 1}
                  </span>
                  <input
                    type="text"
                    maxLength={20}
                    value={playerNames[idx] || ""}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    placeholder={`Player ${idx + 1}`}
                    className="w-full bg-transparent text-sm font-fredoka font-semibold text-cozy-brown focus:outline-none placeholder:text-cozy-brown-light/40"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] font-hand text-cozy-brown-light mt-2">
              Seats P1 to P{playerCount} and initial turn order will be randomly shuffled when the story begins!
            </p>
          </div>

          {/* Start Battle Button */}
          <button
            type="submit"
            className="w-full py-3.5 sm:py-4 bg-cozy-gold hover:bg-cozy-gold-dark text-cozy-brown font-fredoka font-black text-base sm:text-lg rounded-full transition-all shadow-md hover:scale-[1.01] active:scale-[0.98] cursor-pointer flex items-center justify-center gap-2 border-2 border-cozy-gold-dark"
          >
            <span>Enter the Storybook Arena</span>
            <span>✨</span>
          </button>
        </form>
      </div>
    </div>
  );
};
