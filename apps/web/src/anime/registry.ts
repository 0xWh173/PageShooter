import type { CellValue } from "@pageshooter/shared";
import { CELL_VALUES } from "@pageshooter/shared";
import type {
  AnimePackId,
  AnimePackManifest,
  CharacterDefinition,
  MatchVisualConfig,
  PlayerVisualConfig
} from "./types.js";
import { DRAGON_BALL_MANIFEST, DRAGON_BALL_CHARACTERS } from "./packs/dragonBall.js";

export const CLASSIC_STICKMAN_MANIFEST: AnimePackManifest = {
  id: "classic-stickman",
  name: "Classic Storybook Stickman",
  tagline: "The original hand-drawn cozy stickman champions",
  status: "available",
  themeColor: "#D9AA61",
  badge: "✏️ Storybook",
  description: "Hand-drawn paper illustrations with sweet blushing cheeks and paper-folded pistols.",
  roster: [
    {
      id: "classic-stickman",
      name: "Storybook Stickman",
      packId: "classic-stickman",
      title: "Hand-Drawn Champion",
      primaryColor: "#75685C",
      secondaryColor: "#E8B5A5",
      skinColor: "#FDFBF7",
      attack: {
        attackName: "Folio Pop Gun",
        beamColor: "#E28E75",
        auraColor: "#FAF1DF",
        impactColor: "#F2DCD3",
        type: "sphere"
      }
    }
  ]
};

export const UPCOMING_PACKS: AnimePackManifest[] = [
  {
    id: "naruto",
    name: "Naruto: Shinobi Chronicles",
    tagline: "Shinobi scrolls, Rasengan vortexes, and Shadow Clone jutsu",
    status: "coming_soon",
    themeColor: "#F97316",
    badge: "🍥 Hidden Leaf",
    description: "Coming in next expansion: Ninjas of Konoha with chakra swirls and hand-seal jutsu.",
    roster: []
  },
  {
    id: "one-piece",
    name: "One Piece: Grand Voyage",
    tagline: "Straw Hat pirates, Devil Fruit powers, and high seas adventures",
    status: "coming_soon",
    themeColor: "#0284C7",
    badge: "☠️ Grand Line",
    description: "Coming in next expansion: Rubber pistols, three-sword style slashes, and weather tacts.",
    roster: []
  },
  {
    id: "bleach",
    name: "Bleach: Soul Reapers",
    tagline: "Zanpakuto spiritual blades and crescent Getsuga Tensho waves",
    status: "coming_soon",
    themeColor: "#4F46E5",
    badge: "⚔️ Soul Society",
    description: "Coming in next expansion: Bankai awakenings and high-speed spiritual combat.",
    roster: []
  },
  {
    id: "jujutsu-kaisen",
    name: "Jujutsu Kaisen: Cursed Clash",
    tagline: "Cursed energy manipulation, Hollow Purple, and domain expansions",
    status: "coming_soon",
    themeColor: "#9333EA",
    badge: "👁️ Jujutsu High",
    description: "Coming in next expansion: Special grade sorcerers and catastrophic cursed techniques.",
    roster: []
  }
];

export const ANIME_PACK_REGISTRY: Record<AnimePackId, AnimePackManifest> = {
  "dragon-ball": DRAGON_BALL_MANIFEST,
  "classic-stickman": CLASSIC_STICKMAN_MANIFEST,
  "naruto": UPCOMING_PACKS[0],
  "one-piece": UPCOMING_PACKS[1],
  "bleach": UPCOMING_PACKS[2],
  "jujutsu-kaisen": UPCOMING_PACKS[3]
};

export function getAnimePack(packId: AnimePackId): AnimePackManifest {
  return ANIME_PACK_REGISTRY[packId] || CLASSIC_STICKMAN_MANIFEST;
}

export function getAllAnimePacks(): AnimePackManifest[] {
  return Object.values(ANIME_PACK_REGISTRY);
}

export function getAvailableAnimePacks(): AnimePackManifest[] {
  return Object.values(ANIME_PACK_REGISTRY).filter((p) => p.status === "available");
}

export function getCharacter(packId: AnimePackId, characterId: string): CharacterDefinition {
  const pack = getAnimePack(packId);
  const found = pack.roster.find((c) => c.id === characterId);
  if (found) return found;

  // Fallback to Goku if in Dragon Ball, or Classic Stickman
  if (packId === "dragon-ball" && DRAGON_BALL_CHARACTERS.length > 0) {
    return DRAGON_BALL_CHARACTERS[0];
  }
  return CLASSIC_STICKMAN_MANIFEST.roster[0];
}

/**
 * Assigns distinct characters to the 5 cells for each player based on their selected pack.
 * Characters assigned remain FIXED for the match.
 */
export function assignMatchVisuals(
  matchId: string,
  players: Array<{ playerId: string; animePackId?: AnimePackId }>
): MatchVisualConfig {
  const playerVisuals: Record<string, PlayerVisualConfig> = {};

  for (const p of players) {
    const packId: AnimePackId = p.animePackId || "dragon-ball";
    const pack = getAnimePack(packId);

    const characterAssignments: Record<CellValue, string> = {} as Record<CellValue, string>;

    if (pack.roster.length >= 5) {
      // Shuffle roster randomly to pick 5 distinct characters
      const shuffled = [...pack.roster].sort(() => Math.random() - 0.5);
      CELL_VALUES.forEach((val, idx) => {
        characterAssignments[val] = shuffled[idx].id;
      });
    } else if (pack.roster.length > 0) {
      CELL_VALUES.forEach((val) => {
        characterAssignments[val] = pack.roster[0].id;
      });
    } else {
      CELL_VALUES.forEach((val) => {
        characterAssignments[val] = "classic-stickman";
      });
    }

    playerVisuals[p.playerId] = {
      playerId: p.playerId,
      animePackId: packId,
      characterAssignments
    };
  }

  return {
    matchId,
    playerVisuals,
    version: 1
  };
}

/**
 * Validates or fills in fallback visual configuration if missing.
 */
export function ensureMatchVisuals(
  config: MatchVisualConfig | null | undefined,
  matchId: string,
  playerIds: string[]
): MatchVisualConfig {
  if (config && config.matchId === matchId && config.playerVisuals) {
    let valid = true;
    for (const pid of playerIds) {
      if (!config.playerVisuals[pid] || !config.playerVisuals[pid].characterAssignments) {
        valid = false;
        break;
      }
    }
    if (valid) return config;
  }

  return assignMatchVisuals(
    matchId,
    playerIds.map((pid) => ({ playerId: pid, animePackId: "dragon-ball" }))
  );
}
