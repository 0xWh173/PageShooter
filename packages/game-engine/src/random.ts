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
 * Standard uniform pseudo-random generator wrapper.
 * Uses Math.random by default, or accepts a custom PRNG (e.g., crypto-based).
 */
export function defaultPRNG(): number {
  return Math.random();
}

/**
 * Uniformly selects an outcome from [0, 2, 4, 6, 8] (20% each)
 * and generates a fictional page number between 1 and 500 ending in that digit.
 */
export function generateBookRoll(prng: PRNG = defaultPRNG): BookRollResult {
  const randVal = prng();
  // Bound to index 0..4 uniformly
  const index = Math.min(Math.floor(randVal * CELL_VALUES.length), CELL_VALUES.length - 1);
  const outcome = CELL_VALUES[index];

  const pageNumber = generatePageNumberForOutcome(outcome, prng);

  return {
    outcome,
    pageNumber
  };
}

/**
 * Constructs the exact set of valid page numbers from 1 to 500 ending in the given outcome,
 * and picks one uniformly.
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

export function generatePageNumberForOutcome(outcome: CellValue, prng: PRNG = defaultPRNG): number {
  const validPages = getValidPagesForOutcome(outcome);
  const randIndex = Math.min(Math.floor(prng() * validPages.length), validPages.length - 1);
  return validPages[randIndex];
}

