import {
  CELL_VALUES,
  type CellValue
} from "@pageshooter/shared";
import { getValidPagesForOutcome } from "@pageshooter/game-engine";

function bufferToHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let hex = "";
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Computes the public SHA-256 hash commitment in browser/Node via Web Crypto:
 * C_turn = SHA256(seed || matchId || turnNumber)
 */
export async function computeCommitmentWeb(
  seed: string,
  matchId: string,
  turnNumber: number
): Promise<string> {
  const data = new TextEncoder().encode(`${seed}${matchId}${turnNumber}`);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  return bufferToHex(hashBuffer);
}

/**
 * Deterministically derives the roll outcome (0, 2, 4, 6, 8) and page number (1..500)
 * from the secret seed using Web Crypto HMAC-SHA256 and rejection sampling.
 */
export async function deriveRollFromSeedWeb(
  seed: string,
  matchId: string,
  turnNumber: number
): Promise<{ outcome: CellValue; pageNumber: number }> {
  const enc = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    "raw",
    enc.encode(seed),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const message = enc.encode(`${matchId}:${turnNumber}`);
  const signature = await globalThis.crypto.subtle.sign("HMAC", key, message);
  const view = new DataView(signature);

  // 1. Outcome Selection via Rejection Sampling
  let outcomeIndex: number;
  const I1 = view.getUint32(0, false);
  const maxDivisibleBy5 = 4294967295; // floor(2^32 / 5) * 5

  if (I1 < maxDivisibleBy5) {
    outcomeIndex = I1 % 5;
  } else {
    // Extreme edge fallback
    const fallbackBuf = await globalThis.crypto.subtle.digest("SHA-256", signature);
    const fallbackView = new DataView(fallbackBuf);
    outcomeIndex = fallbackView.getUint32(0, false) % 5;
  }
  const outcome = CELL_VALUES[outcomeIndex];

  // 2. Page Number Selection via Rejection Sampling
  let pageIndex: number;
  const I2 = view.getUint32(4, false);
  const maxDivisibleBy50 = 4294967250; // floor(2^32 / 50) * 50

  if (I2 < maxDivisibleBy50) {
    pageIndex = I2 % 50;
  } else {
    // Extreme edge fallback
    const fallbackBuf = await globalThis.crypto.subtle.digest("SHA-256", signature);
    const fallbackView = new DataView(fallbackBuf);
    pageIndex = fallbackView.getUint32(4, false) % 50;
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
export async function verifyRollCommitmentClient(
  seed: string,
  matchId: string,
  turnNumber: number,
  expectedCommitment: string,
  expectedOutcome: CellValue,
  expectedPageNumber: number
): Promise<boolean> {
  // 1. Check SHA-256 commitment hash match
  const actualCommitment = await computeCommitmentWeb(seed, matchId, turnNumber);
  if (actualCommitment !== expectedCommitment) {
    return false;
  }

  // 2. Check deterministic derivation match
  const derived = await deriveRollFromSeedWeb(seed, matchId, turnNumber);
  return derived.outcome === expectedOutcome && derived.pageNumber === expectedPageNumber;
}

/**
 * Asserts that revealed roll parameters are valid; throws if verification fails.
 * Failed verifications must never be silently accepted.
 */
export async function assertRollCommitmentValid(
  seed: string,
  matchId: string,
  turnNumber: number,
  expectedCommitment: string,
  expectedOutcome: CellValue,
  expectedPageNumber: number
): Promise<void> {
  const isValid = await verifyRollCommitmentClient(
    seed,
    matchId,
    turnNumber,
    expectedCommitment,
    expectedOutcome,
    expectedPageNumber
  );

  if (!isValid) {
    throw new Error(
      `Cryptographic verification failed for turn ${turnNumber}: revealed seed does not match commitment ${expectedCommitment} or derived outcome (${expectedOutcome}, p.${expectedPageNumber})`
    );
  }
}
