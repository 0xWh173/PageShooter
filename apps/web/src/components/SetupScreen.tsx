import React, { useState } from "react";
import type { MatchState } from "@pageshooter/shared";
import type { AnimePackId } from "../anime/types.js";
import { getAllAnimePacks } from "../anime/registry.js";

export interface PlayerSetupInput {
  name: string;
  animePackId: AnimePackId;
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
  const [playerPacks, setPlayerPacks] = useState<AnimePackId[]>(() =>
    Array(5).fill("dragon-ball")
  );
  const [globalPack, setGlobalPack] = useState<AnimePackId>("dragon-ball");

  const allPacks = getAllAnimePacks();

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
    setPlayerPacks((prev) => {
      const next = [...prev];
      while (next.length < count) {
        next.push(globalPack);
      }
      return next.slice(0, count);
    });
  };

  const handleGlobalPackChange = (newPack: AnimePackId) => {
    setGlobalPack(newPack);
    setPlayerPacks((prev) => prev.map(() => newPack));
  };

  const handlePlayerPackChange = (idx: number, newPack: AnimePackId) => {
    setPlayerPacks((prev) => {
      const next = [...prev];
      next[idx] = newPack;
      return next;
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
        name: playerNames[i]?.trim() || `Player ${i + 1}`,
        animePackId: playerPacks[i] || "dragon-ball"
      });
    }
    onStartMatch(result);
  };

  return (
    <div className="min-h-screen bg-cozy-ivory text-cozy-brown-dark flex flex-col items-center justify-center p-3 sm:p-6 select-none">
      <div className="max-w-2xl w-full bg-cozy-white border-2 border-cozy-parchment rounded-3xl p-5 sm:p-9 shadow-card relative">
        {/* Header */}
        <div className="text-center mb-5">
          <div className="text-3xl sm:text-4xl mb-1">📖 ⚡ ✏️</div>
          <h1 className="font-fredoka text-2xl sm:text-4xl font-bold text-cozy-brown-dark tracking-tight">
            PageShooter
          </h1>
          <p className="text-xs sm:text-sm font-fredoka text-cozy-brown/80 mt-1">
            Illustrated anime folio shooter for 5 to 10 players
          </p>
        </div>

        {/* Saved Match Notice (If Active Match Exists in IndexedDB) */}
        {savedMatch && savedMatch.phase === "ACTIVE" && (
          <div className="mb-5 p-3.5 rounded-2xl bg-cozy-amber-light border border-cozy-amber/70 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="text-left">
              <div className="flex items-center gap-2">
                <span className="text-lg">🔖</span>
                <span className="font-fredoka font-bold text-cozy-brown-dark text-sm sm:text-base">
                  Active Game Discovered
                </span>
              </div>
              <p className="text-xs font-fredoka text-cozy-brown mt-0.5">
                Turn {savedMatch.turn.turnNumber} • {savedMatch.players.length} players
              </p>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <button
                type="button"
                onClick={onResumeSavedMatch}
                className="flex-1 sm:flex-none px-4 py-2 bg-cozy-amber hover:bg-cozy-amber-dark text-cozy-brown-dark font-fredoka font-bold text-xs sm:text-sm rounded-xl transition-all shadow-xs active:scale-95 cursor-pointer"
              >
                Resume Game ➔
              </button>
              <button
                type="button"
                onClick={onDiscardSavedMatch}
                className="flex-1 sm:flex-none px-3 py-2 bg-cozy-white hover:bg-red-50 text-red-600 border border-red-200 font-fredoka font-semibold text-xs sm:text-sm rounded-xl transition-all active:scale-95 cursor-pointer"
              >
                Discard
              </button>
            </div>
          </div>
        )}

        {/* Setup Form */}
        <form onSubmit={handleStart} className="space-y-5">
          {/* Featured Anime Pack Selector */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown">
                Anime Character Pack
              </label>
              <span className="text-[10px] font-fredoka text-cozy-amber-dark font-semibold">
                Modular Asset Pipeline
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {allPacks.map((pack) => {
                const isAvailable = pack.status === "available";
                const isSelected = globalPack === pack.id;

                return (
                  <button
                    type="button"
                    key={pack.id}
                    disabled={!isAvailable}
                    onClick={() => handleGlobalPackChange(pack.id)}
                    className={`
                      p-2.5 rounded-xl border text-left transition-all relative flex flex-col justify-between
                      ${isSelected
                        ? "bg-amber-50 border-amber-500 shadow-xs ring-1 ring-amber-500"
                        : isAvailable
                        ? "bg-[#FAF7F0] border-cozy-parchment hover:border-cozy-amber cursor-pointer"
                        : "bg-[#F3EFEA] border-gray-200 opacity-60 cursor-not-allowed"
                      }
                    `}
                  >
                    <div>
                      <div className="flex items-center justify-between">
                        <span className="font-fredoka text-xs font-bold text-cozy-brown-dark truncate">
                          {pack.name}
                        </span>
                      </div>
                      <span className="text-[10px] font-fredoka text-cozy-brown/80 block mt-0.5 truncate">
                        {pack.badge}
                      </span>
                    </div>

                    <div className="mt-2 flex items-center justify-between">
                      {isAvailable ? (
                        <span className="text-[9px] font-fredoka font-bold px-1.5 py-0.5 rounded bg-amber-200 text-amber-900">
                          {isSelected ? "Active Pack" : "Available"}
                        </span>
                      ) : (
                        <span className="text-[9px] font-fredoka font-semibold px-1.5 py-0.5 rounded bg-gray-200 text-gray-700">
                          Coming Soon
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
            <p className="text-[11px] font-fredoka text-cozy-brown/70 mt-1.5">
              Dragon Ball Z prototype includes 12 fighters (Goku, Vegeta, Piccolo, Cell, etc.) with custom Ki charge & attack sequences.
            </p>
          </div>

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

          {/* Player Names & Per-Player Anime Pack */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-fredoka font-bold uppercase tracking-wider text-cozy-brown">
                Player Seats & Character Packs
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
                  className="flex items-center gap-2 bg-[#FAF7F0] border border-cozy-parchment rounded-xl px-2.5 py-1.5 focus-within:border-cozy-amber transition-colors"
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
                  {/* Per-Player Pack Selector */}
                  <select
                    value={playerPacks[idx] || "dragon-ball"}
                    onChange={(e) => handlePlayerPackChange(idx, e.target.value as AnimePackId)}
                    className="bg-cozy-white text-[11px] font-fredoka font-bold text-cozy-brown-dark border border-cozy-parchment rounded-lg px-1.5 py-0.5 cursor-pointer focus:outline-none"
                    aria-label={`Player ${idx + 1} Anime Pack`}
                  >
                    <option value="dragon-ball">🔥 DBZ</option>
                    <option value="classic-stickman">✏️ Classic</option>
                  </select>
                </div>
              ))}
            </div>
            <p className="text-[11px] font-fredoka text-cozy-brown/70 mt-2">
              Seats and initial turn order are randomly shuffled at match creation. 5 distinct anime warriors will be randomly assigned to each player's cells and remain fixed.
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
