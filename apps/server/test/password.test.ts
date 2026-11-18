import { describe, it, expect } from "vitest";
import { hashPassword, verifyPassword, dummyVerify, ARGON2_OPTIONS } from "../src/services/password.js";

describe("Password Hashing & Verification (Argon2id)", () => {
  it("uses the exact tuned parameters for 0.1 vCPU (memoryCost: 19MB, timeCost: 2, parallelism: 1)", () => {
    expect(ARGON2_OPTIONS.memoryCost).toBe(19456);
    expect(ARGON2_OPTIONS.timeCost).toBe(2);
    expect(ARGON2_OPTIONS.parallelism).toBe(1);
    expect(ARGON2_OPTIONS.type).toBe(2); // argon2id
  });

  it("hashes password and generates valid Argon2id hash", async () => {
    const raw = "SuperSecret123!";
    const hash = await hashPassword(raw);

    expect(hash).toContain("$argon2id$");
    expect(hash).toContain("m=19456,t=2,p=1");
    expect(hash).not.toContain(raw); // Never exposes plaintext
  });

  it("verifies correct password returns true", async () => {
    const raw = "P@ssword123";
    const hash = await hashPassword(raw);
    const isValid = await verifyPassword(hash, raw);
    expect(isValid).toBe(true);
  });

  it("verifies incorrect password returns false without throwing", async () => {
    const raw = "P@ssword123";
    const hash = await hashPassword(raw);
    const isValid = await verifyPassword(hash, "WrongPassword999");
    expect(isValid).toBe(false);
  });

  it("executes dummyVerify without throwing to prevent timing attacks", async () => {
    await expect(dummyVerify()).resolves.toBeUndefined();
  });
});
