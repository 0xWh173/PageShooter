import crypto from "node:crypto";

/**
 * Section 7: Room Code Specification (Base-32)
 * Digits (8): 2 through 9 (excluding confusing 0 and 1)
 * Letters (24): A through Z (excluding confusing I and O)
 * Total: 32 characters (2^5)
 * Collision space: 32^6 = 1,073,741,824 unique combinations.
 */
export const BASE32_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
export const ROOM_CODE_LENGTH = 6;

const VALID_CODE_REGEX = new RegExp(`^[${BASE32_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

/**
 * Generates a cryptographically random 6-character Base-32 room code.
 */
export function generateRoomCode(): string {
  const bytes = crypto.randomBytes(ROOM_CODE_LENGTH);
  let code = "";
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const index = bytes[i] % BASE32_ALPHABET.length;
    code += BASE32_ALPHABET[index];
  }
  return code;
}

/**
 * Normalizes input code by trimming and converting to uppercase.
 */
export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Validates that code is strictly 6 valid Base-32 characters.
 */
export function isValidRoomCode(code: string): boolean {
  return VALID_CODE_REGEX.test(normalizeRoomCode(code));
}
