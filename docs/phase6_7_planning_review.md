# PageShooter — Phase 6.7 Planning Review & Compliance Gate

**Review Date:** 2026-11-08  
**Review Type:** STRICT READ-ONLY COMPLIANCE AUDIT & SCOPE VERIFICATION  
**Author:** Antigravity (Google DeepMind pair programming assistant)  
**Authoritative Reference:** `docs/phase6_1_multiplayer_backend_architecture.md` (Frozen v3.2.0)  
**Evaluated Document:** `docs/phase6_7_implementation_plan.md`  

---

## Executive Summary

This planning review evaluates the proposed implementation plan for **Phase 6.7: Web Client Integration & UI** against the frozen backend architecture (v3.2.0) and the completed implementations of Phase 6.5 (Authoritative Game Engine) and Phase 6.6 (WebSocket Connection & Real-Time Sync).

**Verdict: PASS — FULLY COMPLIANT WITH ZERO ARCHITECTURAL CONFLICTS**

The proposed plan accurately scopes the React UI integration without modifying or compromising frozen backend contracts, preserves offline gameplay in complete isolation, maintains the strict single `users` database table (ADR-01), keeps online match state strictly in RAM, enforces the exact 6 authorized emoji IDs, gates voice chat behind empirical Metered.ca quota verification, and strictly upholds the ₹0 budget constraint.

---

## 1. Compliance with Frozen Architecture (v3.2.0)

| Specification Area | Architecture Requirement (§ reference) | Phase 6.7 Plan Alignment | Audit Verdict |
|---|---|---|---|
| **Storage Architecture** | Single `users` table; no match snapshots or event logs in DB (ADR-01, §3, §4.1) | Preserved 100%. No new tables, migrations, or database queries are proposed. | **PASS** |
| **In-Memory Volatility** | All active rooms, sockets, and matches exist solely in RAM (ADR-01, §3.1) | Preserved. Online UI states are held in React state/SyncStore; server restart displays termination banner. | **PASS** |
| **Host Migration** | Waiting room: earliest `joinSequence` (ADR-02); Active: 60s timeout to lowest player number | Preserved. Plan integrates backend `HOST_MIGRATED` events directly into UI badges and controls. | **PASS** |
| **Voice Traversal (Gated)** | Google STUN + Metered.ca TURN fallback with fail-closed shutdown (ADR-03, §9) | Preserved. Voice is separately gated behind empirical validation; TURN remains disabled if untrusted. | **PASS** |
| **Commitment-Reveal** | Web Crypto SHA-256 and HMAC outcome derivation before animation (§10) | Preserved. `BookCinematic` requires `assertRollCommitmentValid()` before playing. | **PASS** |
| **Emoji Whitelist** | Exactly 6 authorized IDs: `thumb`, `fire`, `skull`, `scream`, `sword`, `cheer` (§8.2) | Preserved. UI floating action bar strictly exposes these 6 IDs; matches Phase 6.6.1 protocol fix. | **PASS** |
| **4 KB Frame Limit** | Max payload 4096 bytes; close code 1009 on breach (§8.1) | Preserved. Client messages are lightweight and well within 4 KB frame budget. | **PASS** |
| **Multi-Tab Supersession** | Atomic socket replacement with close code 4409 (§8.1) | Preserved. UI renders an unambiguous *"Session opened in another window"* banner. | **PASS** |
| **Zero-Cost Constraint** | Free-tier services only; no credit card or paid add-ons (§14) | Preserved. Absolutely zero recurring expenditure (₹0.00). | **PASS** |

---

## 2. Cross-Phase Boundary & Compatibility Analysis

### 2.1 Compatibility with Phase 6.5 (Authoritative Game Engine)
- The plan treats `@pageshooter/game-engine` as the sole arbiter of gameplay transitions.
- Client UI performs **no local state mutations or optimistic calculations** for online games.
- Valid targeting calculations (`selectValidTargets`) read directly from authoritative `MatchState` properties (`cell.progress === 5`, `cell.hasGun === true`, `targetCell.destroyed === false`).

### 2.2 Compatibility with Phase 6.6 (WebSocket Connection & Real-Time Sync)
- Reuses the existing `WebSocketClient`, `SyncStore`, and `clientVerification` modules without altering their tested interfaces.
- The 12 client-to-server and 24 server-to-client message types match `packages/shared/src/wsSchemas.ts` with 100% type fidelity.
- Uses existing 60s disconnect handling, `RECONNECT_MATCH` payloads, and `serverInstanceId` restart detection.

### 2.3 Strict Isolation of Offline Pass-and-Play Mode
- **No Shared State:** Offline matches continue to run the local game engine and persist directly to IndexedDB (`apps/web/src/storage/db.ts`).
- **Mode Isolation:** Mode toggle at the top level selects between `OfflineGameView` and `OnlineGameView`. Online actions never read from or write to IndexedDB.
- **Autosave Safety:** Offline match recovery remains functional even if the user engages in online multiplayer in another tab or session.

### 2.4 Prevention of Phase 6.8 Scope Creep
- Verified that the plan contains **no Phase 6.8 work**:
  - No 10-client headless load-testing scripts.
  - No automated multi-client concurrency harnesses.
  - No empirical voice ceiling benchmarks (105-peer mesh tests).
- Phase 6.7 focuses strictly on the single-client React browser UI and user experience.

---

## 3. Assumptions and Unresolved Questions

The plan explicitly surfaces four assumptions that will be verified or adapted during implementation:

1. **Metered.ca TURN Reporting Latency:**
   - *Assumption:* The Metered.ca management API provides accurate byte consumption within rolling 15-minute windows.
   - *Plan Mitigation:* Voice chat remains **strictly disabled** until an empirical spike verifies reporting delay. If delayed or untrusted, voice relay is permanently omitted in favor of text and emojis.
2. **Render Free Tier Cold Starts:**
   - *Assumption:* Render free instances spin down after 15 minutes of inactivity, taking 30–50s to boot on the first connection.
   - *Plan Mitigation:* The UI will display an engaging "Waking the server..." loading state rather than treating the latency as a network failure.
3. **Mobile Screen Density for 10 Players:**
   - *Assumption:* Displaying 10 player seats simultaneously on mobile portrait view requires specialized layout.
   - *Plan Mitigation:* A responsive two-column or paginated seat view is designed for screens $< 640\text{px}$.
4. **Pre-reveal Server Abort Limitation:**
   - *Documented Reality:* If the server process restarts between commitment broadcast and seed reveal, clients cannot mathematically distinguish between an infrastructure crash and an intentional operator abort.
   - *Plan Mitigation:* Accepted per Section 10.2 of the frozen architecture as an in-memory volatility constraint.

---

## 4. Proposed Milestone Breakdown & Risk Summary

| Milestone | Core Deliverables | Risk Level | Mitigation |
|---|---|---|---|
| **Milestone 1** | AuthContext, AuthModal, MultiplayerLobbyScreen, Mode Switch | **Low** | Standard REST & JWT integration; offline mode remains default fallback. |
| **Milestone 2** | WaitingRoomScreen, 5–10 seat grid, Host Controls, Host Migration | **Low** | Reuses existing tested RoomManager endpoints and WS room events. |
| **Milestone 3** | useSyncStore, OnlineTurnHUD, Battlefield integration, Cinematics | **Medium** | Ensure simultaneous 4–6s book animations do not de-sync action locks. |
| **Milestone 4** | Chat & 6-Emoji HUD, Floating animations, 5-Channel SoundManager | **Low** | Server already enforces emoji whitelist and rate limits; purely visual. |
| **Milestone 5** | ReconnectOverlay, RECONNECT_MATCH re-sync, ServerRestartModal, Quality Gates | **Medium** | Verify multi-tab session supersession and 60s pause countdown in browser. |

---

## 5. Compliance Verdict & Stop Condition

- **Plan Review Status:** APPROVED FOR PLANNING COMPLIANCE.
- **Repository State:** Clean. No application source code, configuration files, or database schemas have been altered.
- **Action Required:** STOP and present this review and the implementation plan to the user. Do not begin implementation of Milestone 1 until explicit authorization is granted.
