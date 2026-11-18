import crypto from "node:crypto";
import { CELL_VALUES, CellValue } from "@pageshooter/shared";
import { getValidPagesForOutcome } from "@pageshooter/game-engine";

export interface CommitmentDetails {
  turnNumber: number;
  seed: string;
  commitmentHash: string;
}

export interface PublicCommitment {
  turnNumber: number;
  commitmentHash: string;
}

export interface DerivedRoll {
  outcome: CellValue;
  pageNumber: number;
}

export interface RevealedRoll extends DerivedRoll {
  turnNumber: number;
  seed: string;
  commitmentHash: string;
}

/**
 * Generates a cryptographically secure 256-bit (32 bytes) hex seed.
 */
export function generateSecretSeed(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Computes the public SHA-256 hash commitment:
 * C_turn = SHA256(S_turn || matchId || turnNumber)
 * Published to all participants before roll execution to prevent post-commit outcome substitution.
 */
export function computeCommitment(seed: string, matchId: string, turnNumber: number): string {
  return crypto
    .createHash("sha256")
    .update(`${seed}${matchId}${turnNumber}`)
    .digest("hex");
}

/**
 * Derives the deterministic roll outcome (0, 2, 4, 6, 8) and page number (1..500)
 * using HMAC-SHA256 and rejection sampling to strictly eliminate modulo bias.
 *
 * Mathematical derivation (Architecture v3.2.0 Section 10.1):
 * 1. Entropy = HMAC_SHA256(seed, matchId + ":" + turnNumber)
 * 2. Outcome selection:
 *    - Take first 4 bytes as unsigned 32-bit big-endian integer I1.
 *    - Rejection threshold for mod 5 = floor(2^32 / 5) * 5 = 4,294,967,295.
 *    - Index = I1 % 5 -> outcome in {0, 2, 4, 6, 8}.
 * 3. Page selection:
 *    - Take next 4 bytes as unsigned 32-bit big-endian integer I2.
 *    - Rejection threshold for mod 50 = floor(2^32 / 50) * 50 = 4,294,967,250.
 *    - Valid pages ending in outcome D: Pages_D = { D + 10k | 0 <= k <= 49 }.
 *    - PageNumber = Pages_D[I2 % 50].
 */
export function deriveRollFromSeed(seed: string, matchId: string, turnNumber: number): DerivedRoll {
  const entropy = crypto
    .createHmac("sha256", seed)
    .update(`${matchId}:${turnNumber}`)
    .digest();

  // 1. Outcome Selection via Rejection Sampling
  let outcomeIndex: number;
  const I1 = entropy.readUInt32BE(0);
  const maxDivisibleBy5 = 4294967295; // floor(2^32 / 5) * 5

  if (I1 < maxDivisibleBy5) {
    outcomeIndex = I1 % 5;
  } else {
    // Extreme edge fallback (< 1 in 4.29 billion)
    const fallback = crypto.createHash("sha256").update(entropy).digest();
    outcomeIndex = fallback.readUInt32BE(0) % 5;
  }
  const outcome = CELL_VALUES[outcomeIndex];

  // 2. Page Number Selection via Rejection Sampling
  let pageIndex: number;
  const I2 = entropy.readUInt32BE(4);
  const maxDivisibleBy50 = 4294967250; // floor(2^32 / 50) * 50

  if (I2 < maxDivisibleBy50) {
    pageIndex = I2 % 50;
  } else {
    // Extreme edge fallback (< 46 in 4.29 billion)
    const fallback = crypto.createHash("sha256").update(entropy).digest();
    pageIndex = fallback.readUInt32BE(4) % 50;
  }

  const validPages = getValidPagesForOutcome(outcome);
  const pageNumber = validPages[pageIndex];

  return {
    outcome,
    pageNumber
  };
}

/**
 * Validates that revealed roll parameters strictly match the initial commitment and derivation.
 */
export function verifyRollCommitment(
  seed: string,
  matchId: string,
  turnNumber: number,
  expectedCommitment: string,
  expectedOutcome: CellValue,
  expectedPageNumber: number
): boolean {
  // 1. Verify hash commitment matches seed
  const actualCommitment = computeCommitment(seed, matchId, turnNumber);
  if (actualCommitment !== expectedCommitment) {
    return false;
  }

  // 2. Re-derive outcome and page number from seed
  const derived = deriveRollFromSeed(seed, matchId, turnNumber);
  return derived.outcome === expectedOutcome && derived.pageNumber === expectedPageNumber;
}
