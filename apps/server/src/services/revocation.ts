/**
 * Phase 6.7 Milestone 1.1: Stateless Session In-Memory Revocation Blocklist
 * Authoritative Reference: docs/phase6_7_milestone1_1_session_recovery_design.md v2.3.0
 *
 * Implements a bounded, fail-closed in-memory revocation blocklist for session JWT JTIs.
 * Maintains ADR-01 compliance (zero database tables added).
 */

export const DEFAULT_REVOCATION_CAPACITY = 10_000;
export const DEFAULT_SWEEP_INTERVAL_MS = 300_000; // 5 minutes

export class RevocationManager {
  private readonly revokedJtis = new Map<string, number>();
  private readonly capacity: number;
  private sweepTimer: NodeJS.Timeout | null = null;

  constructor(
    capacity: number = DEFAULT_REVOCATION_CAPACITY,
    sweepIntervalMs: number = DEFAULT_SWEEP_INTERVAL_MS,
    enableSweep: boolean = true
  ) {
    this.capacity = capacity;

    if (enableSweep && sweepIntervalMs > 0) {
      this.sweepTimer = setInterval(() => {
        this.sweep();
      }, sweepIntervalMs);

      if (typeof this.sweepTimer.unref === "function") {
        this.sweepTimer.unref();
      }
    }
  }

  get size(): number {
    return this.revokedJtis.size;
  }

  get maxCapacity(): number {
    return this.capacity;
  }

  /**
   * Attempts to revoke a JWT JTI until its expiration timestamp.
   * Fail-Closed Policy: If capacity is exhausted and sweep cannot reclaim expired entries,
   * returns false. Unexpired revoked entries are NEVER evicted.
   */
  revoke(jti: string, expMs: number): boolean {
    if (this.revokedJtis.has(jti)) {
      // Already revoked, update expiration if longer
      const existing = this.revokedJtis.get(jti)!;
      if (expMs > existing) {
        this.revokedJtis.set(jti, expMs);
      }
      return true;
    }

    if (this.revokedJtis.size >= this.capacity) {
      // Attempt to reclaim expired entries
      this.sweep();

      // If still at capacity, fail closed
      if (this.revokedJtis.size >= this.capacity) {
        return false;
      }
    }

    this.revokedJtis.set(jti, expMs);
    return true;
  }

  /**
   * Checks whether a JTI is revoked. Prunes the entry if its expiration has elapsed.
   */
  isRevoked(jti: string): boolean {
    const exp = this.revokedJtis.get(jti);
    if (exp === undefined) {
      return false;
    }

    if (Date.now() > exp) {
      this.revokedJtis.delete(jti);
      return false;
    }

    return true;
  }

  /**
   * Prunes all expired revocation records.
   */
  sweep(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [jti, exp] of this.revokedJtis.entries()) {
      if (now > exp) {
        this.revokedJtis.delete(jti);
        pruned++;
      }
    }
    return pruned;
  }

  /**
   * Clears all revocation records (primarily for test resets).
   */
  clear(): void {
    this.revokedJtis.clear();
  }

  /**
   * Cleans up timers and memory for server shutdown / test teardown.
   */
  close(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
    this.revokedJtis.clear();
  }
}

export const revocationManager = new RevocationManager();
