import type { CellValue } from "@pageshooter/shared";

export type AnimePackId =
  | "dragon-ball"
  | "classic-stickman"
  | "naruto"
  | "one-piece"
  | "bleach"
  | "jujutsu-kaisen";

export interface CharacterAttackDetails {
  attackName: string;
  beamColor: string;
  auraColor: string;
  impactColor: string;
  type: "beam" | "disc" | "sphere" | "pierce";
}

export interface CharacterDefinition {
  id: string;
  name: string;
  packId: AnimePackId;
  title: string;
  primaryColor: string;
  secondaryColor: string;
  skinColor: string;
  attack: CharacterAttackDetails;
}

export interface AnimePackManifest {
  id: AnimePackId;
  name: string;
  tagline: string;
  status: "available" | "coming_soon";
  themeColor: string;
  badge: string;
  description: string;
  roster: CharacterDefinition[];
}

export interface PlayerVisualConfig {
  playerId: string;
  animePackId: AnimePackId;
  /**
   * Mapping of each cell value (0, 2, 4, 6, 8) to an assigned character ID.
   */
  characterAssignments: Record<CellValue, string>;
}

export interface MatchVisualConfig {
  matchId: string;
  playerVisuals: Record<string, PlayerVisualConfig>;
  version: number;
}
