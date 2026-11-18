# PageShooter — Phase 6.8 Multi-Client Verification & Empirical Load Report

**Date:** 2026-11-18  
**Status:** **COMPLETE — ALL VERIFICATION & BENCHMARK TARGETS PASSED**

---

## 1. Multi-Client E2E Verification (`apps/server/test/phase6_8_e2e_multi_client.test.ts`)

Executed against a live in-process Fastify + WebSocket Gateway (`buildServer`) with real `ws` clients authenticating via `pageshooter_session` HttpOnly cookies:

1. **10-Player + 2-Spectator Match Simulation:**
   - 10 active players and 2 spectators joined via `JOIN_ROOM` and `JOIN_AS_SPECTATOR`.
   - Host initiated `START_MATCH`; all 12 sockets received `MATCH_STARTED` and Turn 1 `ROLL_COMMITMENT`.
   - Spectator `ROLL_REQUEST` was strictly rejected with `ERROR (SPECTATOR_FORBIDDEN)`.
   - Executed 12 authoritative turns with `ROLL_REQUEST` and `SHOOT_REQUEST`: every client cryptographically verified `ROLL_REVEALED` seeds against the turn's `ROLL_COMMITMENT` via `assertRollCommitmentValid`.
2. **Waiting-Room Host Migration & Active-Match Disconnect/Reconnect:**
   - Original host exited via `LEAVE_ROOM` with 6 players present; server deterministically promoted the earliest `joinSequence` player (`HOST_MIGRATED`), who immediately launched the match (`START_MATCH`).
   - An active player abruptly terminated their socket (`ws.terminate()`); server broadcast `MATCH_PAUSED` with disconnect deadline.
   - The disconnected player reconnected via `RECONNECT_MATCH`, receiving `ROOM_SNAPSHOT` and triggering `MATCH_RESUMED` across the room.

---

## 2. Empirical Multi-Room Load Benchmark (`tools/multiplayer-load-benchmark.js`)

Executed across 5 concurrency stages (1, 5, 10, 15, and 20 concurrent rooms; **10 active players + 2 spectators per room**), executing `START_MATCH`, `ROLL_REQUEST`, and `EMOJI_BROADCAST` across all rooms:

| Concurrent Rooms | Total WS Clients | Process RSS (MB) | V8 Heap Used (MB) | Event Loop Lag Mean (ms) | Event Loop Lag P99 (ms) | Avg RTT (ms) | P95 RTT (ms) | Drops |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| **1** | 12 | 169.96 | 34.21 | 10.42 | 11.71 | 2.13 | 3.10 | 0 |
| **5** | 60 | 171.73 | 26.88 | 10.00 | 10.73 | 1.08 | 2.59 | 0 |
| **10** | 120 | 172.45 | 28.41 | 10.02 | 10.85 | 0.85 | 1.84 | 0 |
| **15** | 180 | 174.15 | 40.58 | 10.09 | 11.13 | 0.98 | 2.58 | 0 |
| **20** | 240 | 176.27 | 43.39 | 10.18 | 11.94 | 0.88 | 2.28 | 0 |

### Capacity Assessment
- At **20 concurrent rooms (240 WebSocket connections)**, Process RSS measured **176.27 MB**—well within the **400 MB operational ceiling** (leaving > 335 MB headroom under Render Free Tier's 512 MB limit) with **0 dropped connections**.
- Recommended initial `MAX_ACTIVE_ROOMS` for Phase 7.1 production hardening: **20** (conservative, empirically verified ceiling).
