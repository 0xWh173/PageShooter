# PageShooter — Milestone 1.1 Security Review: Final Security Assessment (v3.1.0)

**Document Version:** 3.1.0  
**Status:** COMPLETED FINAL SECURITY AUDIT (READ-ONLY)  
**Author:** Antigravity (Google DeepMind pair programming assistant)  
**Reference Document:** `docs/phase6_7_milestone1_1_session_recovery_design.md` (v2.3.0)  
**Authoritative Backend Spec:** `docs/phase6_1_multiplayer_backend_architecture.md` (Frozen v3.2.0)  
**Scope Boundary:** Read-Only Security Review — No Code or Infrastructure Altered  

---

## Executive Security Assessment

| Review Dimension | Status | Assessment Summary |
| :--- | :---: | :--- |
| **XSS Credential Resistance** | **PASS** | No JWT is exposed to JavaScript-accessible storage or application memory. The browser internal cookie store manages `HttpOnly` cookies. Injected scripts cannot exfiltrate persistent credentials. |
| **Fail-Closed Revocation** | **PASS (CONDITIONAL RISK)** | In-memory blocklist (`RevocationManager`) never evicts unexpired tokens. Fails closed (HTTP 503) if 10,000 capacity is reached. Revocation is cleared on server restart; this is an accepted residual risk under ADR-01 and ₹0 constraints. |
| **Cryptographic Precision** | **PASS** | Single HS256 JWT stored in `__Host-` prefixed cookie. Redundant double signing eliminated. Strict `exp` (24h max), `iss`, and `aud` claims enforced. `username` is informational only. |
| **Transport-Appropriate CSRF/CSWSH** | **PASS** | REST mutators enforce strict `Origin` + custom `X-PageShooter-Client: web` header. WebSocket upgrades enforce strict `Origin` check without custom headers (respecting browser API limits). |
| **Active Socket Logout Termination** | **PASS** | `POST /api/auth/logout` explicitly revokes `jti` first, terminates all active WebSockets owned by the user with close code 4401 (`WS_CLOSE_CODE_UNAUTHORIZED`), and clears the cookie. |
| **Single-Room Invariant & Recovery** | **PASS** | `resolveUserRoomParticipation` enforces single recoverable room invariant across 6 states with deterministic `roomId` tie-breaking. Spectators cannot acquire player seats. |
| **ADR-01 & ₹0 Budget Invariance** | **PASS** | Zero database migrations, zero session tables, zero external paid services. 100% free-tier memory and CPU compliant. |

**Audit Recommendation:** **FULL SECURITY APPROVAL FOR IMPLEMENTATION.**  
All technical transport inconsistencies, eviction risks, tie-breaker ambiguities, and credential phrasing details have been resolved.

---

## 1. Deep Dive: Corrections & Threat Analysis

### 1.1 Stateless Session Revocation Across Server Restarts
- **The Reality & Correction:**
  - A copied or stolen JWT remains cryptographically valid after a server restart if `JWT_SECRET` is unchanged and its `exp` has not elapsed.
  - The attacker can still authenticate to account endpoints, create rooms, join rooms, or alter profile data after the restart.
  - **Losing in-memory match state does NOT neutralize general authentication replay.**
- **Formal Accepted Risk Documentation:**
  - The in-memory revocation blocklist (`RevocationManager`) is effective **only while the current server process remains alive**.
  - If the server restarts (e.g., Render free-tier container sleep/wake cycle, deployment, or crash), a previously revoked but unexpired JWT will become valid again until its `exp` passes.
  - This is an **explicit, accepted residual risk** under the strict ADR-01 invariant (single `users` table, no session tables) and ₹0 hosting constraint (no external Redis instance).
  - *Emergency Containment:* If a severe credential compromise occurs, rotating `JWT_SECRET` in the environment configuration immediately invalidates **all** outstanding session JWTs globally.

### 1.2 Bounded Operational Limits & Fail-Closed Behavior of `RevocationManager`
To ensure that the in-memory blocklist cannot be abused to cause memory exhaustion (OOM) or prematurely validate revoked tokens:
- **Data Structure:** `Map<string, number>` mapping `jti` $\rightarrow$ `expMs`.
- **Hard Cap:** Bounded at **10,000 entries**.
- **Fail-Closed Policy (No Unexpired Eviction):**
  - Unexpired revoked `jti` entries must **never** be evicted merely to make room for new entries. Evicting an unexpired token would restore validity to a previously revoked token.
  - If the map reaches 10,000 entries and background sweeps cannot reclaim expired entries, `RevocationManager` **fails closed**. New logout operations are rejected with HTTP `503 Service Unavailable` (`REVOCATION_CAPACITY_EXHAUSTED`).
  - The logout endpoint **does not report success or delete the cookie** if the revocation entry could not be recorded in the blocklist.
- **TTL Pruning:** Automatic sweep runs every 5 minutes (`sweepIntervalMs = 300_000`) pruning entries where `Date.now() > expMs`.
- **Continuous Enforcement:** All authentication paths (every REST request and WebSocket upgrade) must consult `RevocationManager.isRevoked(jti)`. Revocation checks are **never bypassed or cleared** to recover capacity.
- **Race Safety:** Map operations within Node.js are synchronous within the event loop tick, preventing race conditions between concurrent requests.

### 1.3 XSS Threat Model Precision: Extraction vs. Authenticated Execution
It is critical to distinguish between credential extraction and in-session script execution:

```
[Attacker with Injected XSS in PageShooter Tab]
      │
      ├─── Cannot access document.cookie (HttpOnly enforced)
      ├─── Cannot read JWT from React state or /api/auth/session (No JWT in JS)
      ├─── CANNOT exfiltrate persistent credentials for offline replay
      │
      ├───! CAN issue same-origin fetch('/api/rooms') or new WebSocket('/ws')
      │     (Browser automatically attaches HttpOnly cookie for same-origin requests)
      │
      └───! CAN read accessible DOM data or JSON responses and attempt
            external exfiltration (subject to CSP and browser sandboxing)
```

1. **Credential Theft:** **ELIMINATED.** No JWT is exposed to JavaScript-accessible storage or application memory. The browser's internal cookie store retains the `HttpOnly` cookie and automatically attaches it to eligible requests. An XSS payload has no credential to extract. The attacker cannot impersonate the user from an external machine or maintain persistence after the tab closes.
2. **Authenticated In-Session Actions:** **ACTIVE RESIDUAL RISK.** An active XSS script executing in the victim's open tab can make same-origin requests because the browser attaches cookies automatically. `HttpOnly` does **not** prevent in-session execution.
3. **External Data Exfiltration:** An injected script can inspect DOM elements or parse JSON responses from authenticated `GET` endpoints, and attempt to exfiltrate them via external HTTP requests, WebRTC channels, or DNS prefetch queries.
4. **Defense Layers:** Content Security Policy (CSP via `@fastify/helmet` with strict `connect-src 'self'`) is a **defense-in-depth measure**, not an absolute guarantee against all exfiltration vectors. Complete client protection relies on:
   - Output encoding and safe React JSX rendering (zero usage of `dangerouslySetInnerHTML`).
   - Strict input sanitization on chat, player names, and room codes.
   - Server-authoritative validation and rate limits on all mutations.
   - Ongoing npm dependency hygiene to prevent supply-chain injection.

### 1.4 Transport-Appropriate CSRF & CSWSH Protections
- **REST State-Changing Protection (CSRF):**
  - Fastify `preHandler` hook verifies `request.headers.origin` (or `referer`) against `config.CORS_ORIGIN`. Missing or untrusted origins are rejected with HTTP `403 Forbidden` (`CSRF_ORIGIN_REJECTED`).
  - Request must attach custom header `X-PageShooter-Client: web`. Missing or invalid headers are rejected with HTTP `403 Forbidden` (`CSRF_INVALID_CLIENT_HEADER`).
  - *Mechanism:* Cross-origin `<form>`, `<img>`, and `<iframe>` requests cannot attach custom headers without triggering CORS preflights, which fail on unwhitelisted origins.
  - *Safe Methods (`GET`, `HEAD`, `OPTIONS`):* Strictly read-only; they do not mutate server state and do not require the custom header.
- **WebSocket Upgrade Protection (CSWSH):**
  - **Transport Boundary:** The browser's native `WebSocket` API cannot set arbitrary request headers. Therefore, `X-PageShooter-Client` is **never required or checked on WebSocket upgrades**.
  - In `apps/server/src/ws/gateway.ts`, the upgrade handler strictly validates `request.headers.origin` against `config.CORS_ORIGIN` **before** accepting the HTTP 101 Upgrade. If missing or untrusted, the connection is closed immediately (`WS_CLOSE_CODE_UNAUTHORIZED`).

### 1.5 Exact Cookie & JWT Lifecycle Details
- **Production Cookie Configuration:**
  - **Name:** `__Host-pageshooter_session`  
    *(The `__Host-` prefix enforces that the cookie must be `Secure`, set from an HTTPS host, contain `Path=/`, and omit the `Domain` attribute, eliminating subdomain injection vulnerabilities).*
  - **Attributes:** `Path=/`, no `Domain`, `Secure: true`, `HttpOnly: true`, `SameSite: "lax"`, no `Max-Age` or `Expires`.
- **Local Development Policy (HTTP):**
  - In development (`NODE_ENV !== "production"`): cookie name falls back to `pageshooter_session` (without `__Host-`) and `Secure` is `false` if over HTTP, but `HttpOnly: true`, `SameSite: "lax"`, and `Path=/` remain strictly enforced.
- **Validation Checks on Every REST Request & WebSocket Upgrade:**
  - Pinned `HS256` algorithm.
  - Signature verification using `JWT_SECRET` (min 32 chars).
  - Strict `iss` (`"pageshooter-server"`) and `aud` (`"pageshooter-client"`) matching.
  - Strict `exp` validation (hard 24-hour maximum lifetime).
  - Format verification of `jti` and revocation check against `RevocationManager`.
  - Verified stable `sub` (user ID).
  - **Username Claim is Informational Only:** All authorization, room ownership, seat assignment, and game actions strictly use the verified `sub` and authoritative server-side state.
- **Browser Session Restoration Limitation:**
  - Omitting `Max-Age` and `Expires` does not guarantee cookie deletion on browser exit if the user has enabled browser session restoration ("Continue where you left off").

### 1.6 WebSocket Authentication Paths & Logout Synchronization
- **Separation of Authentication Paths:**
  - **Browser WebSockets:** Authenticate **exclusively** via the `__Host-pageshooter_session` cookie during the HTTP 101 Upgrade. In production, browser requests containing `?token=...` query parameters are rejected, preventing token exposure in proxy and server logs.
  - **Headless Test Clients:** The `?token=` path is strictly gated for non-browser testing/CLI environments (`NODE_ENV === "test"`).
  - **Pre-Upgrade Validation:** The gateway performs `Origin` check, cookie extraction, algorithm pinning, signature verification, `exp` check, `iss`/`aud` matching, and revocation check **prior** to accepting the HTTP 101 Upgrade.
- **Logout Sequence & Synchronization Boundaries:**
  When a user logs out (`POST /api/auth/logout`):
  1. Revoke `jti` in `RevocationManager`. If capacity is full, fail closed with HTTP 503 (do not proceed).
  2. Clear cookie with `Max-Age=0`.
  3. **Active WebSocket Termination:** Fastify executes `wsGateway.terminateUserSockets(userId, reason: "LOGOUT")`. All active sockets for that `userId` are closed immediately with close code `4401` (`WS_CLOSE_CODE_UNAUTHORIZED`).
  4. If in a `WAITING` room, the user is removed from the lobby. If in an `ACTIVE` match, closing the socket initiates normal 60-second disconnect handling.
  5. **Synchronization Boundary:** No new application operation is authorized after the logout/revocation check completes. Any in-flight upgrade checking revocation after step 1 is rejected. Accepted packets already being executed by the server engine prior to revocation cannot be retroactively cancelled, but subsequent actions are blocked.

---

## 2. Six-State Room Recovery Decision Table

The `RoomManager.resolveUserRoomParticipation(userId)` method classifies user participation across six distinct states, enforcing the single recoverable room invariant:

| Participation State | Reclaim Player Seat? | Reconnect Timer? | Precedence | Gateway Action | Client Action |
| :--- | :---: | :---: | :---: | :--- | :--- |
| **`DISCONNECTED_PLAYER`** | **YES** | Active (60s) | 1 (Highest) | Returns `activeRoomCode`, `canReconnectMatch: true` | Prompts player; sends `RECONNECT_MATCH`. |
| **`CONNECTED_PLAYER`** | **YES (Transfer)** | None | 2 | Closes old tab (code 4409); binds new tab | Assumes active game view; old tab shows alert. |
| **`WAITING_PLAYER`** | **YES (Lobby Slot)** | None | 3 | Returns `activeRoomCode`, `phase: "WAITING"` | Opens waiting room; receives `ROOM_SNAPSHOT`. |
| **`SPECTATOR`** | **STRICTLY NO** | None | 4 | Returns `activeRoomCode`, `role: "SPECTATOR"` | Opens read-only spectator view. |
| **`ELIMINATED`** | **STRICTLY NO** | None | 5 | Returns `activeRoomCode`, `role: "SPECTATOR"` | Opens eliminated spectator view. |
| **`COMPLETED_PARTICIPANT`** | **N/A** | None (10m TTL) | 6 (Lowest) | Returns `activeRoomCode`, `phase: "COMPLETED"` | Displays post-match victory/summary screen. |

- **Single Recoverable Room Invariant:** A user can only be associated with one active room. Spectators and completed participants **never** supersede a disconnected active player.
- **Deterministic Tie-Breaker:** If an inconsistent state produces multiple rooms in the same tier, candidates are sorted lexicographically by `roomId` (e.g. `roomA.roomId.localeCompare(roomB.roomId) < 0`), selecting the first deterministically, and an anomaly is logged.

---

## 3. Comprehensive Security Decision Table

| # | Security Decision | Implementation Detail | Rationale | Accepted Residual Limitation |
| :-: | :--- | :--- | :--- | :--- |
| **D-1** | **Zero-Token Client Architecture** | Cookies are `HttpOnly; Secure; SameSite=Lax`. REST endpoints return only `PublicUserProfile`. No JWT in JS storage or heap. | Prevents XSS token exfiltration; no JWT exposed to JavaScript-accessible storage or application memory. | Browser internal cookie store retains cookie; active in-session XSS payloads can still execute actions while tab is open. |
| **D-2** | **Single HS256 JWT in Cookie** | Compact JWT stored in cookie; verified via `jsonwebtoken`. Double signing eliminated. | Avoids redundant cryptographic overhead while enforcing strict `iss`, `aud`, and `exp` claims. | Symmetric key (`JWT_SECRET`) must be protected on the server. |
| **D-3** | **`__Host-` Prefix & Session Cookie** | `__Host-pageshooter_session`, `Path=/`, no `Domain`, `Secure`, no `Max-Age`/`Expires`. | Eliminates subdomain hijacking; drops on browser exit. | Browsers with "Continue where you left off" enabled may restore session cookies across restarts. |
| **D-4** | **Fail-Closed Revocation Blocklist** | Bounded RAM map (10,000 entries max) of revoked `jti`. Unexpired entries never evicted; rejects new logouts if full. | Prevents replay of copied/stolen cookies after logout without adding database tables (ADR-01). | Blocklist clears on server restart. Unexpired copied JWTs become valid again after restart if `JWT_SECRET` unchanged. |
| **D-5** | **Separated REST & WS Controls** | REST mutators enforce strict `Origin` + `X-PageShooter-Client: web`. WS upgrade enforces strict `Origin` only. | Native browser WebSocket API cannot set custom headers. Neutralizes CSRF and CSWSH on their respective transports. | Headless test runners must supply valid test origins or tokens. Neither control blocks in-session XSS. |
| **D-6** | **Active WebSocket Logout Termination** | `POST /api/auth/logout` explicitly closes all active sockets owned by `userId`. | Ensures logging out terminates existing real-time gameplay and chat channels immediately. | In-flight network packets already accepted by server engine prior to revocation cannot be retroactively cancelled. |
| **D-7** | **Role-Aware Server Room Discovery** | `resolveUserRoomParticipation` classifies 6 distinct participation states with stable `roomId` tie-breaker. | Eliminates fragile `sessionStorage`; prevents spectators from acquiring player seats. | Cannot recover matches if backend server crashes or restarts (ADR-01 invariant). |

---

## 4. Final Consistency Checklist against Frozen Architecture (v3.2.0)

| Requirement / Invariant | Frozen Architecture Spec | Milestone 1.1 Specification Status | Compliance Notes |
| :--- | :--- | :---: | :--- |
| **ADR-01 Single Table** | Section 3.1: Only `users` table exists. | **COMPLIANT** | Zero session tables, zero migrations. Revocation lives in bounded RAM. |
| **ADR-01 Ephemeral State** | Section 3.1: All rooms, matches, and sockets exist in server RAM only. | **COMPLIANT** | Server restart terminates rooms and matches. Documented limitation. |
| **ADR-02 Waiting Migration** | Section 6.1: Host migration to lowest `joinSequence`. | **COMPLIANT** | Preserved without modification. |
| **60s Disconnect Timer** | Section 6.2: Exact 60,000 ms timer per disconnected player. | **COMPLIANT** | Maintained by `ReconnectManager`; unpaused upon `RECONNECT_MATCH`. |
| **WebSocket Query Token** | Section 2.1: `Client connects to /ws?token=<JWT>`. | **COMPLIANT (DUAL PATH)** | Preserved for headless automated tests; browser clients authenticate via cookie to prevent log leakage. |
| **₹0 Budget Constraint** | Section 1.1: Free-tier Render/Neon. Zero paid add-ons. | **COMPLIANT** | Native Fastify cookies, zero external cache/Redis dependencies. |

---

## 5. Final Audit Verdict

The revised **Zero-Token Client & Session Recovery Architecture** (v2.3.0 / Security Review v3.1.0):
1. **Respects transport limits:** Removes the invalid requirement for custom headers on native browser WebSocket handshakes while preserving strict Origin validation and cookie authentication.
2. **Fails closed at revocation capacity:** Unexpired tokens are never evicted, preventing token resurrection.
3. **Enforces single-room membership:** Establishes strict role precedence and deterministic lexicographical `roomId` tie-breaking.
4. **Precisely frames credential exposure:** Clarifies that while no JWT is exposed to JavaScript memory or storage, the browser cookie store automatically attaches the credential.
5. **Defines logout synchronization boundaries:** Terminates active WebSocket connections and blocks subsequent actions immediately.
6. **Maintains 100% compliance** with ADR-01 (single `users` table) and the ₹0 operational budget.

**FINAL AUDIT VERDICT:** **APPROVED WITHOUT RESERVATIONS.**  
The design is structurally complete, technically accurate, and ready for implementation authorization under Milestone 1.1.
