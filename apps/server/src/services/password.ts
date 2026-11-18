import argon2 from "argon2";

/**
 * Argon2id configuration tuned for low-memory, single vCPU free containers (0.1 vCPU / 512 MB RAM)
 * while providing high resistance to GPU-based password cracking.
 * Parameters: timeCost=2, memoryCost=19456 (19 MB), parallelism=1.
 */
export const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19456, // 19 MB
  timeCost: 2,
  parallelism: 1
};

// Pre-computed dummy hash to prevent timing attacks / user enumeration when user does not exist
const DUMMY_HASH = "$argon2id$v=19$m=19456,t=2,p=1$ZHVtbXlzYWx0MTIzNDU2Nw$4O+e5iR8OaM0eQ6b6jD9gX4Qp0F8eH0N7kY6qW2rZ1s";

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    ...ARGON2_OPTIONS,
    raw: false
  });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}

/**
 * Runs a dummy verification of identical computational cost to neutralize timing attacks.
 */
export async function dummyVerify(): Promise<void> {
  try {
    await argon2.verify(DUMMY_HASH, "dummy_password_timing_defense");
  } catch {
    // Ignore dummy verification failure
  }
}
