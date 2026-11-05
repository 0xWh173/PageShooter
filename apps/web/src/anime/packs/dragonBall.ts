import type { CharacterDefinition, AnimePackManifest } from "../types.js";

export const DRAGON_BALL_CHARACTERS: CharacterDefinition[] = [
  {
    id: "goku",
    name: "Goku",
    packId: "dragon-ball",
    title: "Saiyan Raised on Earth",
    primaryColor: "#FF6600",
    secondaryColor: "#1B3A6B",
    skinColor: "#FFD1A4",
    attack: {
      attackName: "Kamehameha",
      beamColor: "#00E5FF",
      auraColor: "#00B0FF",
      impactColor: "#80D8FF",
      type: "beam"
    }
  },
  {
    id: "vegeta",
    name: "Vegeta",
    packId: "dragon-ball",
    title: "Prince of All Saiyans",
    primaryColor: "#1E3A8A",
    secondaryColor: "#F3F4F6",
    skinColor: "#FFCCA0",
    attack: {
      attackName: "Galick Gun",
      beamColor: "#A855F7",
      auraColor: "#9333EA",
      impactColor: "#C084FC",
      type: "beam"
    }
  },
  {
    id: "gohan",
    name: "Gohan",
    packId: "dragon-ball",
    title: "Latent Power Scholar",
    primaryColor: "#6B21A8",
    secondaryColor: "#DC2626",
    skinColor: "#FFD1A4",
    attack: {
      attackName: "Masenko",
      beamColor: "#FBBF24",
      auraColor: "#F59E0B",
      impactColor: "#FDE68A",
      type: "beam"
    }
  },
  {
    id: "piccolo",
    name: "Piccolo",
    packId: "dragon-ball",
    title: "Namekian Guardian",
    primaryColor: "#581C87",
    secondaryColor: "#22C55E",
    skinColor: "#4ADE80",
    attack: {
      attackName: "Special Beam Cannon",
      beamColor: "#F59E0B",
      auraColor: "#EC4899",
      impactColor: "#FDE047",
      type: "pierce"
    }
  },
  {
    id: "krillin",
    name: "Krillin",
    packId: "dragon-ball",
    title: "Earth's Bravest Martial Artist",
    primaryColor: "#EA580C",
    secondaryColor: "#1D4ED8",
    skinColor: "#FCD34D",
    attack: {
      attackName: "Destructo Disc",
      beamColor: "#FACC15",
      auraColor: "#F59E0B",
      impactColor: "#FEF08A",
      type: "disc"
    }
  },
  {
    id: "trunks",
    name: "Trunks",
    packId: "dragon-ball",
    title: "Warrior from the Future",
    primaryColor: "#3B4252",
    secondaryColor: "#818CF8",
    skinColor: "#FED7AA",
    attack: {
      attackName: "Burning Attack",
      beamColor: "#F97316",
      auraColor: "#FBBF24",
      impactColor: "#FED7AA",
      type: "sphere"
    }
  },
  {
    id: "frieza",
    name: "Frieza",
    packId: "dragon-ball",
    title: "Emperor of the Universe",
    primaryColor: "#F3F4F6",
    secondaryColor: "#7E22CE",
    skinColor: "#E5E7EB",
    attack: {
      attackName: "Death Beam",
      beamColor: "#E11D48",
      auraColor: "#BE185D",
      impactColor: "#FDA4AF",
      type: "pierce"
    }
  },
  {
    id: "cell",
    name: "Cell",
    packId: "dragon-ball",
    title: "The Ultimate Perfection",
    primaryColor: "#15803D",
    secondaryColor: "#18181B",
    skinColor: "#86EFAC",
    attack: {
      attackName: "Perfect Kamehameha",
      beamColor: "#06B6D4",
      auraColor: "#EAB308",
      impactColor: "#67E8F9",
      type: "beam"
    }
  },
  {
    id: "majin-buu",
    name: "Majin Buu",
    packId: "dragon-ball",
    title: "Innocent Chaos",
    primaryColor: "#F472B6",
    secondaryColor: "#18181B",
    skinColor: "#F9A8D4",
    attack: {
      attackName: "Chocolate Beam",
      beamColor: "#EC4899",
      auraColor: "#DB2777",
      impactColor: "#FBCFE8",
      type: "beam"
    }
  },
  {
    id: "goten",
    name: "Goten",
    packId: "dragon-ball",
    title: "Playful Prodigy",
    primaryColor: "#F97316",
    secondaryColor: "#2563EB",
    skinColor: "#FFD1A4",
    attack: {
      attackName: "Kamehameha",
      beamColor: "#38BDF8",
      auraColor: "#60A5FA",
      impactColor: "#BAE6FD",
      type: "beam"
    }
  },
  {
    id: "beerus",
    name: "Beerus",
    packId: "dragon-ball",
    title: "God of Destruction",
    primaryColor: "#7C3AED",
    secondaryColor: "#D97706",
    skinColor: "#A78BFA",
    attack: {
      attackName: "Sphere of Destruction",
      beamColor: "#F97316",
      auraColor: "#7C3AED",
      impactColor: "#FED7AA",
      type: "sphere"
    }
  },
  {
    id: "whis",
    name: "Whis",
    packId: "dragon-ball",
    title: "Angelic Guide",
    primaryColor: "#881337",
    secondaryColor: "#06B6D4",
    skinColor: "#67E8F9",
    attack: {
      attackName: "Angelic Symphony",
      beamColor: "#22D3EE",
      auraColor: "#E0E7FF",
      impactColor: "#A5F3FC",
      type: "beam"
    }
  }
];

export const DRAGON_BALL_MANIFEST: AnimePackManifest = {
  id: "dragon-ball",
  name: "Dragon Ball Z",
  tagline: "Unleash Ki blasts and martial arts legends across the folio matrix",
  status: "available",
  themeColor: "#FF6600",
  badge: "🔥 Saiyan Saga",
  description: "Play as legendary fighters with unique energy auras, Ki-gathering charge phases, and signature beam attacks.",
  roster: DRAGON_BALL_CHARACTERS
};
