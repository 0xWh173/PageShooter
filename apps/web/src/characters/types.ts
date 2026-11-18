import type { CellValue } from "@pageshooter/shared";

export type HatType =
  | "detective"
  | "pirate"
  | "chef"
  | "tophat"
  | "viking"
  | "beret"
  | "safari"
  | "wizard"
  | "baseball_back"
  | "graduate"
  | "none";

export type HairStyle =
  | "spiky"
  | "afro_curly"
  | "straight_part"
  | "messy"
  | "ponytail"
  | "mohawk"
  | "bob_bangs"
  | "bald"
  | "short_neat"
  | "side_part"
  | "wavy_long";

export type EyewearType =
  | "round_glasses"
  | "rect_glasses"
  | "monocle"
  | "eyepatch"
  | "aviator_goggles"
  | "domino_mask"
  | "none";

export type FacialHairType =
  | "goatee"
  | "beard_full"
  | "moustache_curl"
  | "pencil_moustache"
  | "braided_beard"
  | "none";

export type ClothingType =
  | "trenchcoat"
  | "tie"
  | "bowtie"
  | "scarf"
  | "apron"
  | "vest"
  | "leather_jacket"
  | "turtleneck"
  | "hoodie"
  | "sweater_stripes"
  | "none";

export type AccessoryType =
  | "magnifying_glass"
  | "bandaid"
  | "pencil_ear"
  | "earmuffs"
  | "headband"
  | "whistle"
  | "none";

export type CartoonWeaponType =
  | "popgun"
  | "peashooter"
  | "slingshot"
  | "blunderbuss"
  | "raygun";

export interface CharacterDefinition {
  id: string;
  name: string;
  title: string;
  personality: string;
  hat: HatType;
  hair: HairStyle;
  eyewear: EyewearType;
  facialHair: FacialHairType;
  clothing: ClothingType;
  accessory: AccessoryType;
  weapon: CartoonWeaponType;
  tintColor?: string; // Subtle warm accent (e.g. ribbon/scarf/hat band)
}

export interface PlayerCharacterConfig {
  playerId: string;
  /**
   * Mapping of each folio cell value (0, 2, 4, 6, 8) to a distinct character ID.
   */
  characterAssignments: Record<CellValue, string>;
}

export interface MatchCharacterConfig {
  matchId: string;
  playerCharacters: Record<string, PlayerCharacterConfig>;
}

