import {
  CELL_VALUES,
  CellValue,
  MAX_PAGE_NUMBER,
  MIN_PAGE_NUMBER
} from "@pageshooter/shared";

export interface BookRollResult {
  outcome: CellValue;
  pageNumber: number;
}

export type PRNG = () => number;

/**
 * Generates an unbiased cryptographically secure 32-bit unsigned integer.
 * Uses globalThis.crypto (standard in modern Node.js and browsers).
 */
function getCryptoUint32(): number {
  const gCrypto = (globalThis as unknown as { crypto?: { getRandomValues(buf: Uint32Array): Uint32Array } }).crypto;
  if (gCrypto && typeof gCrypto.getRandomValues === "function") {
    const buffer = new Uint32Array(1);
    gCrypto.getRandomValues(buffer);
    return buffer[0];
  }
  // Fallback to Math.random only if crypto is completely unavailable
  return Math.floor(Math.random() * 4294967296);
}

/**
 * Returns a uniform integer in [0, maxExclusive - 1] using rejection sampling
 * to eliminate modulo bias.
 */
export function secureRandomInt(maxExclusive: number): number {
  if (maxExclusive <= 1) return 0;
  // 2^32 = 4294967296
  const limit = Math.floor(4294967296 / maxExclusive) * maxExclusive;
  while (true) {
    const rand = getCryptoUint32();
    if (rand < limit) {
      return rand % maxExclusive;
    }
  }
}

/**
 * Standard uniform pseudo-random generator wrapper returning [0, 1).
 */
export function defaultPRNG(): number {
  return getCryptoUint32() / 4294967296;
}

/**
 * Uniformly selects an outcome from [0, 2, 4, 6, 8] (20% each)
 * and generates a fictional page number between 1 and 500 ending in that digit.
 * Uses cryptographically secure random generation by default, or accepts a custom PRNG.
 */
export function generateBookRoll(prng?: PRNG): BookRollResult {
  let outcome: CellValue;
  if (prng) {
    const randVal = prng();
    const index = Math.min(Math.floor(randVal * CELL_VALUES.length), CELL_VALUES.length - 1);
    outcome = CELL_VALUES[index];
  } else {
    // Unbiased cryptographic selection
    const index = secureRandomInt(CELL_VALUES.length);
    outcome = CELL_VALUES[index];
  }

  const pageNumber = generatePageNumberForOutcome(outcome, prng);

  return {
    outcome,
    pageNumber
  };
}

/**
 * Constructs the exact set of valid page numbers from 1 to 500 ending in the given outcome.
 * Outcome 0: 10, 20, ..., 500 (page 0 is invalid as range is 1..500)
 * Outcome 2: 2, 12, ..., 492
 * Outcome 4: 4, 14, ..., 494
 * Outcome 6: 6, 16, ..., 496
 * Outcome 8: 8, 18, ..., 498
 */
export function getValidPagesForOutcome(outcome: CellValue): number[] {
  const pages: number[] = [];
  for (let page = MIN_PAGE_NUMBER; page <= MAX_PAGE_NUMBER; page++) {
    if (page % 10 === outcome) {
      pages.push(page);
    }
  }
  return pages;
}

export function generatePageNumberForOutcome(outcome: CellValue, prng?: PRNG): number {
  const validPages = getValidPagesForOutcome(outcome);
  if (prng) {
    const randIndex = Math.min(Math.floor(prng() * validPages.length), validPages.length - 1);
    return validPages[randIndex];
  }
  const randIndex = secureRandomInt(validPages.length);
  return validPages[randIndex];
}
