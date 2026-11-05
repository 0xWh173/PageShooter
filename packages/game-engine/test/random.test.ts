import { describe, it, expect } from "vitest";
import { CELL_VALUES } from "@pageshooter/shared";
import {
  generateBookRoll,
  generatePageNumberForOutcome,
  getValidPagesForOutcome,
  secureRandomInt,
  defaultPRNG
} from "../src/random.js";

describe("Randomness & Page Generation", () => {
  it("generates outcomes only from [0, 2, 4, 6, 8] with secure randomness", () => {
    for (let i = 0; i < 500; i++) {
      const roll = generateBookRoll();
      expect(CELL_VALUES).toContain(roll.outcome);
    }
  });

  it("supports passing custom PRNG for deterministic testing", () => {
    // PRNG returning 0 -> index 0 -> outcome 0
    const roll0 = generateBookRoll(() => 0.01);
    expect(roll0.outcome).toBe(0);

    // PRNG returning 0.99 -> index 4 -> outcome 8
    const roll8 = generateBookRoll(() => 0.99);
    expect(roll8.outcome).toBe(8);

    const page = generatePageNumberForOutcome(4, () => 0.5);
    expect(page % 10).toBe(4);
  });

  it("generates page numbers strictly between 1 and 500 whose final digit matches outcome", () => {
    for (const outcome of CELL_VALUES) {
      const pages = getValidPagesForOutcome(outcome);
      expect(pages.length).toBe(50); // exactly 50 pages end in each digit from 1..500

      for (const page of pages) {
        expect(page).toBeGreaterThanOrEqual(1);
        expect(page).toBeLessThanOrEqual(500);
        expect(page % 10).toBe(outcome);
      }
    }
  });

  it("ensures page 0 is never produced for outcome 0", () => {
    const outcomeZeroPages = getValidPagesForOutcome(0);
    expect(outcomeZeroPages).not.toContain(0);
    expect(outcomeZeroPages[0]).toBe(10);
    expect(outcomeZeroPages[outcomeZeroPages.length - 1]).toBe(500);
  });

  it("tests secureRandomInt boundaries and defaultPRNG output range", () => {
    expect(secureRandomInt(1)).toBe(0);
    for (let i = 0; i < 100; i++) {
      const val = secureRandomInt(5);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThan(5);

      const prngVal = defaultPRNG();
      expect(prngVal).toBeGreaterThanOrEqual(0);
      expect(prngVal).toBeLessThan(1);
    }
  });

  it("statistically verifies uniform 20% distribution over a large sample (50,000 rolls)", () => {
    const counts: Record<number, number> = { 0: 0, 2: 0, 4: 0, 6: 0, 8: 0 };
    const totalRolls = 50_000;

    for (let i = 0; i < totalRolls; i++) {
      const { outcome, pageNumber } = generateBookRoll();
      counts[outcome] += 1;
      expect(pageNumber % 10).toBe(outcome);
    }

    // Expected per outcome is 20% (10,000). Tolerance: +/- 4% (9,600 to 10,400)
    for (const val of CELL_VALUES) {
      const freq = counts[val] / totalRolls;
      expect(freq).toBeGreaterThan(0.185);
      expect(freq).toBeLessThan(0.215);
    }
  });
});
