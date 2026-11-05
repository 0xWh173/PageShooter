import React, { useState } from "react";
import type { MatchState } from "@pageshooter/shared";

interface SetupScreenProps {
  savedMatch: MatchState | null;
  onResumeSavedMatch: () => void;
  onDiscardSavedMatch: () => void;
  onStartMatch: (playerNames: string[]) => void;
}

const DEFAULT_FANTASY_NAMES = [
  "Aethelgard",
  "Balthazar",
  "Cassian",
  "Darius",
  "Elspeth",
  "Faustina",
  "Grimbold",
  "Heliodor",
  "Ignatius",
  "Janus"
];

const BACKUP_FANTASY_NAMES = [
  "Lysander",
  "Morgath",
  "Nyx",
  "Orion",
  "Pendelton",
  "Quintus",
  "Ravena",
  "Sylvana",
  "Theron",
  "Ulric",
  "Valerius",
  "Zephyra"
];

export const SetupScreen: React.FC<SetupScreenProps> = ({
  savedMatch,
  onResumeSavedMatch,
  onDiscardSavedMatch,
  onStartMatch
}) => {
  const [playerCount, setPlayerCount] = useState<number>(5);
  const [playerNames, setPlayerNames] = useState<string[]>(() =>
    DEFAULT_FANTASY_NAMES.slice(0, 5)
  );

  const handlePlayerCountChange = (count: number) => {
    setPlayerCount(count);
    setPlayerNames((prev) => {
      const next = [...prev];
      while (next.length < count) {
        const candidate = DEFAULT_FANTASY_NAMES[next.length] || BACKUP_FANTASY_NAMES[next.length - DEFAULT_FANTASY_NAMES.length] || `Player ${next.length + 1}`;
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
    const pool = [...DEFAULT_FANTASY_NAMES, ...BACKUP_FANTASY_NAMES].sort(() => Math.random() - 0.5);
    setPlayerNames(pool.slice(0, playerCount));
  };

  const handleStart = (e: React.FormEvent) => {
    e.preventDefault();
    const finalNames = playerNames.map((n, i) => n.trim() || `Player ${i + 1}`);
    onStartMatch(finalNames);
  };

  return (
    <div className="min-h-screen bg-fantasy-bg text-fantasy-parchment flex flex-col items-center justify-center p-4">
      <div className="max-w-2xl w-full bg-fantasy-card border border-fantasy-border/80 rounded-3xl p-6 sm:p-10 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-4xl sm:text-5xl mb-2">📖 ⚔️</div>
          <h1 className="font-serif text-3xl sm:text-4xl font-black text-fantasy-gold tracking-wide">
            PAGE SHOOTER
          </h1>
          <p className="text-xs sm:text-sm font-serif italic text-fantasy-parchment/70 mt-1">
            "An Ancient Magical Book Multiplayer Game • Offline Pass & Play"
          </p>
        </div>

        {/* Saved Match Notice (If Active Match Exists in IndexedDB) */}
        {savedMatch && savedMatch.phase === "ACTIVE" && (
          <div className="mb-8 p-4 rounded-2xl bg-fantasy-gold/10 border-2 border-fantasy-gold/50 flex flex-col sm:flex-row items-center justify-between gap-4 animate-in fade-in">
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-base">💾</span>
                <span className="font-serif font-bold text-fantasy-gold text-sm">
                  Active Match Discovered in Storage
                </span>
              </div>
              <p className="text-xs text-fantasy-parchment/80 mt-1 font-mono">
                {savedMatch.players.length} Players • Turn #{savedMatch.turn.turnNumber} • Phase: {savedMatch.phase}
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onResumeSavedMatch}
                className="flex-1 sm:flex-none px-4 py-2 bg-fantasy-gold hover:bg-fantasy-gold-light text-black font-serif font-bold text-xs rounded-xl transition-all shadow cursor-pointer"
              >
                Resume Match ➔
              </button>
              <button
                type="button"
                onClick={onDiscardSavedMatch}
                className="px-3 py-2 bg-fantasy-bg hover:bg-fantasy-crimson/30 text-fantasy-parchment/60 hover:text-fantasy-crimson border border-fantasy-border text-xs rounded-xl transition-colors cursor-pointer"
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
            <label className="block text-xs font-mono uppercase tracking-wider text-fantasy-parchment/80 mb-2">
              Select Combatant Count (5 – 10 Players)
            </label>
            <div className="flex items-center justify-between gap-1.5 sm:gap-2">
              {[5, 6, 7, 8, 9, 10].map((num) => (
                <button
                  type="button"
                  key={num}
                  onClick={() => handlePlayerCountChange(num)}
                  className={`
                    flex-1 py-2 sm:py-2.5 rounded-xl font-mono text-sm sm:text-base font-bold transition-all cursor-pointer
                    ${playerCount === num
                      ? "bg-fantasy-gold text-black shadow-[0_0_15px_rgba(229,169,60,0.4)] scale-105"
                      : "bg-fantasy-bg border border-fantasy-border/60 text-fantasy-parchment/70 hover:border-fantasy-gold/50"
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
              <label className="text-xs font-mono uppercase tracking-wider text-fantasy-parchment/80">
                Combatant Names & Seats
              </label>
              <button
                type="button"
                onClick={handleRandomizeNames}
                className="text-xs font-mono text-fantasy-gold hover:underline cursor-pointer"
              >
                🎲 Randomize Names
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
              {Array.from({ length: playerCount }).map((_, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 bg-fantasy-bg/60 border border-fantasy-border/60 rounded-xl px-3 py-1.5 focus-within:border-fantasy-gold/60"
                >
                  <span className="font-mono text-xs font-bold text-fantasy-gold min-w-[28px]">
                    P{idx + 1}
                  </span>
                  <input
                    type="text"
                    maxLength={20}
                    value={playerNames[idx] || ""}
                    onChange={(e) => handleNameChange(idx, e.target.value)}
                    placeholder={`Player ${idx + 1}`}
                    className="w-full bg-transparent text-sm font-serif text-fantasy-parchment focus:outline-none placeholder:text-fantasy-parchment/30"
                  />
                </div>
              ))}
            </div>
            <p className="text-[11px] text-fantasy-parchment/50 italic mt-2">
              Positions P1 through P{playerCount} and initial turn order will be randomly assigned at match creation according to the ancient rules.
            </p>
          </div>

          {/* Start Battle Button */}
          <button
            type="submit"
            className="w-full py-4 bg-gradient-to-r from-fantasy-gold via-fantasy-gold-light to-fantasy-gold hover:from-fantasy-gold-light hover:to-fantasy-gold text-black font-serif font-black text-base sm:text-lg rounded-2xl transition-all shadow-[0_0_25px_rgba(229,169,60,0.5)] active:scale-[0.98] cursor-pointer"
          >
            Enter the Ancient Arena ⚔️
          </button>
        </form>
      </div>
    </div>
  );
};
