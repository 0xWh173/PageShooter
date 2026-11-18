import { CellValue } from "@pageshooter/shared";
export interface BookRollResult {
    outcome: CellValue;
    pageNumber: number;
}
export type PRNG = () => number;
/**
 * Returns a uniform integer in [0, maxExclusive - 1] using rejection sampling
 * to eliminate modulo bias.
 */
export declare function secureRandomInt(maxExclusive: number): number;
/**
 * Standard uniform pseudo-random generator wrapper returning [0, 1).
 */
export declare function defaultPRNG(): number;
/**
 * Uniformly selects an outcome from [0, 2, 4, 6, 8] (20% each)
 * and generates a fictional page number between 1 and 500 ending in that digit.
 * Uses cryptographically secure random generation by default, or accepts a custom PRNG.
 */
export declare function generateBookRoll(prng?: PRNG): BookRollResult;
/**
 * Constructs the exact set of valid page numbers from 1 to 500 ending in the given outcome.
 * Outcome 0: 10, 20, ..., 500 (page 0 is invalid as range is 1..500)
 * Outcome 2: 2, 12, ..., 492
 * Outcome 4: 4, 14, ..., 494
 * Outcome 6: 6, 16, ..., 496
 * Outcome 8: 8, 18, ..., 498
 */
export declare function getValidPagesForOutcome(outcome: CellValue): number[];
export declare function generatePageNumberForOutcome(outcome: CellValue, prng?: PRNG): number;
//# sourceMappingURL=random.d.ts.map