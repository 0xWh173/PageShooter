# PageShooter — Phase 6.7 Milestone 1.1 Final Security & Compliance Audit
## Zero-Token Client Authentication, Session Recovery & Concurrency Audit

**Audit Date:** November 10, 2026  
**Auditor:** Antigravity (Google DeepMind)  
**Target Milestone:** Phase 6.7 Milestone 1.1 (Zero-Token Client Authentication & Session Recovery)  
**Authoritative Documents:**
- `docs/phase6_7_milestone1_1_session_recovery_design.md` — v2.3.0
- `docs/phase6_7_milestone1_1_security_review.md` — v3.1.0
- `docs/phase6_1_multiplayer_backend_architecture.md` — Frozen v3.2.0
- `docs/phase6_7_milestone1_1_implementation_report.md` — v1.0.0

---

## 1. Executive Verdict

### **VERDICT: PASS**

All six review discrepancies identified during Milestone 1.1 review and audit have been thoroughly investigated, reconciled at the source level, remediated, and verified with dedicated regression tests. 

- **JWT Issuer & Claims (F-01):** Verified and confirmed as `pageshooter-server`. Algorithm strictly pinned to `HS256`. All claims (`sub`, `iss`, `aud`, `jti`, `iat`, `exp`) verified.
- **WebSocket Handshake Rejection (F-02):** Remedied to strictly return **HTTP 403 Forbidden** before HTTP 101 Switching Protocols. Eliminates the erroneous HTTP 500 status code. Handshake origin validation occurs before connection establishment.
- **Logout Concurrency & TOCTOU (F-03):** Exact synchronization boundaries established and tested for paused REST mutations (`changeUsername`), paused room creation (`createRoom`), paused room joining (`joinRoom`), and queued WebSocket commands. Documented the exact boundary between in-memory single-thread atomicity and async I/O.
- **Room Participation States (F-04):** Reconciled the 6 lifecycle states (`DISCONNECTED_PLAYER`, `CONNECTED_PLAYER`, `WAITING_PLAYER`, `SPECTATOR`, `ELIMINATED`, `COMPLETED_PARTICIPANT`) and the 8 concrete client situations. Tested and verified seat reclamation and non-reclamation rules.
- **Production Cookie Configuration (F-05):** Tested and verified that production strictly issues `__Host-pageshooter_session` with `Secure`, `HttpOnly`, `Path=/`, `SameSite=Lax`, no `Domain`, and no `Max-Age` / `Expires`.
- **Single-Room Invariant & Active Match Participation (F-06):** Resolved the conflation between `canReconnectMatch` (client countdown UI) and active match commitment by introducing `hasActiveMatchParticipation: boolean`. Connected and disconnected active players in an active or paused match are authoritatively blocked from creating, joining, or spectating another room across REST and WebSocket APIs.
- **Quality Gates:** 100% PASS across all 4 gates (34/34 test files, 276/276 tests passing, 0 TypeScript errors, 0 linter errors, clean production build).
- **Milestone 2 & Git Invariants:** Milestone 2 has **NOT** been started. Zero git commits, zero git pushes, and zero branch operations were performed.

---

## 2. Findings Classified by Severity

| ID | Area | Severity | Status | Description |
|---|---|:---:|:---:|---|
| **F-01** | JWT Issuer Claim | **Medium** | **RESOLVED** | Narrative in implementation report reported `iss: "pageshooter"`. Verified that code in `token.ts` uses approved `iss: "pageshooter-server"`. Added regression tests for `HS256` algorithm pinning and `"none"` algorithm rejection. |
| **F-02** | WebSocket Origin Rejection | **High** | **RESOLVED** | Fastify CORS error originally lacked `statusCode: 403`, causing Fastify's default error handler to return HTTP 500 on unauthorized Origin. Fixed by assigning `statusCode = 403` to CORS error and adding a `/ws` `preHandler` hook enforcing Origin validation before HTTP 101. |
| **F-03** | Logout Race Synchronization | **High** | **RESOLVED** | Verified TOCTOU boundaries. Enhanced `logoutRace.test.ts` to test paused in-flight operations for room creation, room join, and username mutation. Documented in-memory atomicity vs database asynchronous commit boundary. |
| **F-04** | Room Lifecycle States | **Low** | **RESOLVED** | Narrative text used informal labels (`ACTIVE_DISCONNECTED` etc.). Code in `roomManager.ts` and `UserActiveRoomResolution` already implemented the approved 6 states (`DISCONNECTED_PLAYER` through `COMPLETED_PARTICIPANT`). Reconciled definitions and verified all 8 situations. |
| **F-05** | Production Cookie Environment | **Medium** | **RESOLVED** | Route handler originally referenced static `config.NODE_ENV` rather than server instance config. Updated routes and middleware to read instance config. Added explicit production cookie tests in `cookieAuth.test.ts`. |
| **F-06** | Single-Room Invariant Bypass | **High** | **RESOLVED** | Connected active player (`CONNECTED_PLAYER`) originally had `canReconnectMatch = false`. Mutating room routes checked `existing?.canReconnectMatch`, allowing connected active players to create, join, or spectate another room. Resolved by introducing `hasActiveMatchParticipation: boolean`, setting it to `true` for `DISCONNECTED_PLAYER` and `CONNECTED_PLAYER`, enforcing it on `POST /api/rooms`, `POST /api/rooms/:roomCode/join`, `POST /api/rooms/:roomCode/spectate`, and WebSocket `JOIN_ROOM` / `JOIN_AS_SPECTATOR`. |

---

## 3. Exact Source Files & Functions Inspected

### Server Implementation
1. `apps/server/src/services/token.ts`:
   - `JWT_ISSUER` constant (`"pageshooter-server"`).
   - `JWT_AUDIENCE` constant (`"pageshooter-client"`).
   - `generateToken()`: Signs with `HS256`, `jwtid: jti`, `issuer`, `audience`.
   - `verifyToken()`: Validates with `algorithms: ["HS256"]`, `issuer`, `audience`.
2. `apps/server/src/server.ts`:
   - `buildServer()`: Fastify CORS registration, decorating instance with `pageshooterConfig`, assigning `corsError.statusCode = 403`.
3. `apps/server/src/middleware/auth.ts`:
   - `requireAuth()`: Dual cookie lookup (`__Host-pageshooter_session` / `pageshooter_session`), JTI revocation check.
   - `verifyMutatingOrigin()`: Dual-layer CSRF check (`X-PageShooter-Client: web` + trusted Origin check).
   - `checkPreCommitRevocation()`: In-flight pre-commit revocation check.
4. `apps/server/src/ws/gateway.ts`:
   - `register()`: Added `preHandler` hook rejecting untrusted Origin with HTTP 403 before HTTP 101.
   - `handleConnection()`: Cookie extraction, JWT verification, revocation check, `AUTH_SUCCESS` with active room resolution.
   - `terminateUserSockets()`: Cascading socket closure on logout with close code `4401`.
5. `apps/server/src/ws/dispatcher.ts`:
   - `dispatch()`: Liveness and session revocation check discarding queued turn commands.
6. `apps/server/src/rooms/roomManager.ts`:
   - `resolveUserRoomParticipation()`: 6-tier participation resolution with lexicographical `roomId` tie-breaking.
7. `apps/server/src/routes/auth.ts`:
   - `POST /register-password`, `POST /login-password`, `POST /google`: Environment-aware session cookie issuance (`__Host-` in prod).
   - `POST /logout`: Fail-closed 503 check, user socket cascade termination, cookie clearing with `Max-Age=0`.
   - `GET /session`: Cookie validation and session restoration.
8. `apps/server/src/routes/rooms.ts`:
   - `GET /my-active`: Server-assisted room discovery endpoint.
   - `POST /api/rooms`, `POST /:roomCode/join`: 409 active match conflict guard and pre-commit revocation check.
9. `apps/server/src/services/revocation.ts`:
   - `RevocationManager`: Bounded capacity (10,000 entries), fail-closed overflow handling, unexpired entry retention, periodic sweep.

### Test Suites
1. `apps/server/test/token.test.ts`: Added tests for approved claims and `none` algorithm rejection.
2. `apps/server/test/server.test.ts`: Updated CORS rejection test to expect 403 Forbidden.
3. `apps/server/test/csrfProtection.test.ts`: Added tests for untrusted, missing, and malformed WebSocket Origin returning 403.
4. `apps/server/test/cookieAuth.test.ts`: Added dedicated `Production Environment Cookie Specification` test block.
5. `apps/server/test/logoutRace.test.ts`: Added paused interleaving tests for room creation, room joining, and username mutation.
6. `apps/server/test/serverRoomRecovery.test.ts`: Added host vs guest distinction and verified all 6 tiers.

---

## 4. Approved-Design vs. Implementation Comparison

| Item | Approved Design (v2.3.0 & v3.1.0) | Implementation State | Verdict |
|---|---|---|:---:|
| **JWT Issuer (`iss`)** | `pageshooter-server` | `pageshooter-server` in `token.ts` | **MATCH** |
| **JWT Audience (`aud`)** | `pageshooter-client` | `pageshooter-client` in `token.ts` | **MATCH** |
| **Algorithm Pinning** | `HS256` strictly | Pinned to `algorithms: ["HS256"]` in `verifyToken` | **MATCH** |
| **WebSocket CSWSH Rejection** | Rejection before connection | HTTP 403 Forbidden in `preHandler` before HTTP 101 | **MATCH** |
| **WebSocket Cookie Auth** | Natively forwarded HttpOnly cookie | Handshake extracts cookie; query string forbidden in prod | **MATCH** |
| **Production Cookie** | `__Host-pageshooter_session; Secure; HttpOnly; Path=/; SameSite=Lax` | Verified in `apps/server/src/config.ts` and `routes/auth.ts` | **MATCH** |
| **Development Cookie** | `pageshooter_session; HttpOnly; Path=/; SameSite=Lax` (no Secure over HTTP) | Verified in `apps/server/src/config.ts` and `routes/auth.ts` | **MATCH** |
| **Cookie Lifetime** | Option B: Browser-session cookie (no Max-Age/Expires on issue, Max-Age=0 on logout) | Verified in `apps/server/src/config.ts` | **MATCH** |
| **Zero-Token Client** | No JWT in React memory, localStorage, or REST JSON | Verified in `apiClient.ts`, `AuthContext.tsx`, `auth.ts` | **MATCH** |
| **6-State Participation** | 6 tiers: DISCONNECTED_PLAYER, CONNECTED_PLAYER, WAITING_PLAYER, SPECTATOR, ELIMINATED, COMPLETED_PARTICIPANT | Verified in `roomManager.ts` & `UserActiveRoomResolution` | **MATCH** |
| **Tie-Breaker Rule** | Tier ascending, stable lexicographical `roomId` | Verified in `roomManager.ts` line 423 | **MATCH** |
| **Single Room Invariant** | Active participant cannot create/join/spectate other rooms (HTTP 409) | Enforced in `routes/rooms.ts` and `ws/dispatcher.ts` via `hasActiveMatchParticipation` guard | **MATCH** |
| **Revocation Capacity** | 10,000 entries bounded in RAM; fail-closed 503 on overflow | Enforced in `revocation.ts` and `routes/auth.ts` | **MATCH** |
| **ADR-01 Compliance** | Exactly 1 table (`users`), zero DB session tables | 100% compliant; zero migrations or session tables | **MATCH** |
| **₹0 Budget Constraint** | 100% free-tier compliant | In-memory RAM stores only; no paid add-ons or Redis | **MATCH** |

---

## 5. Detailed Investigation & Remediation Evidence

### 5.1. Investigation Area 1: JWT Issuer & Claims

**Review Finding:** Report claimed `iss: "pageshooter"` while approved design specifies `iss: "pageshooter-server"`.

**Source Inspection:**
Inspection of `apps/server/src/services/token.ts` confirmed:
```ts
export const JWT_ISSUER = "pageshooter-server";
export const JWT_AUDIENCE = "pageshooter-client";
```
The discrepancy was an error in the narrative report text; the code was already using `pageshooter-server`.

**Remediation & Tests Added:**
In `apps/server/test/token.test.ts`, added explicit assertions confirming:
1. `it("verifies approved claims structure (iss: pageshooter-server, aud: pageshooter-client, jti, sub)")` passes.
2. `it("strictly pins algorithm HS256 and rejects 'none' algorithm token")` passes.
3. Verification rejects tokens with mismatched issuer, mismatched audience, mismatched signature, or expired timestamps.

### 5.2. Investigation Area 2: WebSocket Origin Rejection (Elimination of HTTP 500)

**Review Finding:** Report stated WebSocket untrusted Origin rejection resulted in close code `4401` / HTTP `500`. Rejection should not be an internal server error.

**Root Cause:**
1. In `apps/server/src/server.ts`, Fastify CORS called `cb(new Error("CORS origin not allowed"), false)`. Because the error lacked a `statusCode` property, Fastify's default error handler defaulted to **HTTP 500**.
2. Route `/ws` in `gateway.ts` did not have a `preHandler` hook, meaning Fastify CORS was the only pre-upgrade interceptor.

**Remediation:**
1. In `apps/server/src/server.ts`:
   ```ts
   const corsError = new Error("CORS origin not allowed");
   (corsError as { statusCode?: number }).statusCode = 403;
   cb(corsError, false);
   ```
2. In `apps/server/src/ws/gateway.ts`:
   Added a `preHandler` hook on the `/ws` route that validates the `Origin` header before upgrade. If the origin is untrusted (or missing in production), Fastify immediately replies with **HTTP 403 Forbidden** (`FORBIDDEN_ORIGIN`) before HTTP 101 Switching Protocols.
3. Updated `apps/server/test/server.test.ts` to assert `expect(response.statusCode).toBe(403)`.
4. In `apps/server/test/csrfProtection.test.ts`, added explicit tests:
   - `rejects WebSocket upgrade when Origin is untrusted` -> HTTP 403.
   - `rejects WebSocket upgrade with malformed Origin header` -> HTTP 403.
   - `rejects WebSocket upgrade when Origin is missing in production environment` -> HTTP 403.

### 5.3. Investigation Area 3: Logout Concurrency & TOCTOU Audit

**Review Finding:** A second check before commit does not eliminate race conditions if an operation pauses between check and commit.

**Source Inspection & Synchronization Boundaries:**
We audited every authenticated mutating route and WebSocket command:

1. **In-Memory Operations (`RoomManager`):**
   - Node.js executes JavaScript on a single-threaded event loop.
   - `roomManager.createRoom()`, `roomManager.joinAsPlayer()`, `roomManager.joinAsSpectator()`, `roomManager.leaveRoom()`, `roomManager.kickPlayer()` are **100% synchronous JavaScript functions**.
   - In `routes/rooms.ts`:
     ```ts
     if (!checkPreCommitRevocation(request, reply)) return;
     const room = roomManager.createRoom(...);
     ```
     Between `checkPreCommitRevocation` and `roomManager.createRoom`, there are **zero `await` points**. Because execution is synchronous and run-to-completion, no concurrent event (including logout) can slip between the check and the mutation. This provides **complete in-memory race immunity**.
2. **WebSocket Command Dispatcher (`WSDispatcher`):**
   - In `apps/server/src/ws/dispatcher.ts`, `dispatch()` synchronously verifies `if (context.jti && this.revocationManager.isRevoked(context.jti))` immediately before calling `roomManager.executeRoll()` or `roomManager.executeShot()`.
   - Furthermore, `wsGateway.terminateUserSockets(userId, "LOGOUT")` closes all active sockets on logout with close code `4401`, preventing future command processing.
3. **Asynchronous REST Mutations (Database I/O in `authService.changeUsername`):**
   - `changeUsername` executes asynchronous SQL queries (`await this.db.select()`, `await this.db.update()`).
   - If logout occurs while the initial select is in flight, `checkPreCommitRevocation` before the update blocks the mutation and returns HTTP 401 `SESSION_REVOKED`.

**Tests Added in `apps/server/test/logoutRace.test.ts`:**
We implemented paused interleaving tests simulating in-flight pauses:
1. `Race-1`: Paused `PATCH /api/users/me/username` (paused 60ms; concurrent logout at t=10ms) -> Pre-commit guard returned 401 `SESSION_REVOKED`, database username was unchanged.
2. `Race-2`: Queued WebSocket roll command vs concurrent logout -> Socket closed with 4401, command discarded.
3. `Race-3`: Paused `POST /api/rooms` (paused 50ms inside `getCurrentUser`; concurrent logout at t=10ms) -> Pre-commit guard returned 401 `SESSION_REVOKED`, zero rooms created in `RoomManager`.
4. `Race-4`: Paused `POST /api/rooms/:roomCode/join` (paused 50ms inside `getCurrentUser`; concurrent logout at t=10ms) -> Pre-commit guard returned 401 `SESSION_REVOKED`, user never added to `room.players`.
5. `Race-5`: Multi-Tab Logout Cascade -> Tab 1 logout closed both Tab 1 and Tab 2 sockets with 4401 immediately.

**Documented Limitation (Accepted Boundary):**
If logout occurs while PostgreSQL is actively executing the SQL `UPDATE` statement over the network wire (a ~1ms window), the database row is committed by Postgres before Node receives the wire response. Because ADR-01 forbids persistent session tables or `token_version` database reads on every query, this microsecond window is an accepted design constraint. Complete elimination of this window would require distributed database transactions on session state, violating ADR-01 and the ₹0 budget constraint.

### 5.4. Investigation Area 4: Room Participation Recovery Reconciliation

**Review Finding:** Reconcile the approved 6 lifecycle states with the resolver tiers, and clarify how `ELIMINATED`, `COMPLETED_PARTICIPANT`, and the 8 concrete situations are represented.

**Reconciliation Table:**

| # | Concrete Situation | Room Phase | Participant Status | Resolver Tier & Participation Enum | Reclaim Seat? | Can Reconnect Match? | Active Match Participation? | Expected Client Behavior |
|---|---|---|---|---|:---:|:---:|:---:|---|
| **1** | Disconnected active player | `ACTIVE` / `PAUSED` | In `room.players`, `connected === false` (or in `disconnectedPlayers`) | **Tier 1: `DISCONNECTED_PLAYER`** | **YES** | **`true`** | **`true`** | Prompts user to rejoin with countdown (`reconnectDeadlineMs`). Automatically restores turn when reconnected. Blocked from other rooms (409). |
| **2** | Connected active player | `ACTIVE` / `PAUSED` | In `room.players`, `connected === true` (new tab opened) | **Tier 2: `CONNECTED_PLAYER`** | **YES (Transfer)** | `false` | **`true`** | New tab connects and takes over session; old tab socket closed with code 4409. Authoritatively blocked from creating/joining/spectating other rooms (409). |
| **3** | Waiting-room host | `WAITING` | In `room.players`, `role === "HOST"` | **Tier 3: `WAITING_PLAYER`** (`role: "HOST"`) | **YES** | `false` | `false` | Client transitions directly into waiting room UI with host controls enabled. |
| **4** | Waiting-room guest | `WAITING` | In `room.players`, `role === "PLAYER"` | **Tier 3: `WAITING_PLAYER`** (`role: "PLAYER"`) | **YES** | `false` | `false` | Client transitions directly into waiting room UI in guest mode. |
| **5** | Spectator | `WAITING`, `ACTIVE`, `PAUSED` | In `room.spectators` | **Tier 4: `SPECTATOR`** (`role: "SPECTATOR"`) | **NO** | `false` | `false` | Client opens game in read-only observation mode. User cannot roll or shoot. Allowed to create/join rooms. |
| **6** | Eliminated participant | `ACTIVE` / `PAUSED` | In `room.players`, `matchState.players.status === "ELIMINATED"` | **Tier 5: `ELIMINATED`** (`role: "SPECTATOR"`) | **NO** | `false` | `false` | Client opens game in eliminated spectator mode (cannot roll). Allowed to create/join other rooms. |
| **7** | Completed-match participant | `COMPLETED` | In `room.players` or `room.spectators` | **Tier 6: `COMPLETED_PARTICIPANT`** | **N/A** | `false` | `false` | Client displays post-match summary report and option to return to lobby or rematch. |
| **8** | User with no room association | Any / None | Not present in any room | **`null`** | **N/A** | `false` | `false` | Client renders standard multiplayer lobby screen. |

**Code & Test Evidence:**
In `apps/server/src/rooms/roomManager.ts` (lines 305–427) and `packages/shared/src/index.ts` (lines 245–260), all 6 tiers and participation states are strictly typed and implemented. In `apps/server/test/serverRoomRecovery.test.ts`, all 8 situations are covered by unit tests.

### 5.5. Investigation Area 5: Cookie Behavior & Production Environment Verification

**Review Finding:** Implementation report examples showed `pageshooter_session`; verify that production uses `__Host-pageshooter_session` with `Secure`, `HttpOnly`, `Path=/`, no `Domain`, and no `Max-Age` / `Expires`.

**Source Fix:**
In `apps/server/src/server.ts`, decorated Fastify instance with `app.decorate("pageshooterConfig", currentConfig)`. Updated `apps/server/src/routes/auth.ts` and `apps/server/src/middleware/auth.ts` to read `currentConfig.NODE_ENV` rather than the module-level fallback.

**Production Cookie Verification in `cookieAuth.test.ts`:**
Added explicit test suite `Production Environment Cookie Specification (__Host- Prefix & Security)`:
1. `POST /api/auth/register-password`:
   - Set-Cookie header contains `__Host-pageshooter_session=...`.
   - Contains `Secure; HttpOnly; Path=/; SameSite=Lax`.
   - Contains **NO `Domain`** (conforming to RFC 6265bis `__Host-` specification).
   - Contains **NO `Max-Age` or `Expires`** (browser-session cookie, destroyed when browser is closed).
2. `POST /api/auth/login-password`:
   - Sets `__Host-pageshooter_session=...` and authenticates subsequent `GET /api/auth/session`.
3. `POST /api/auth/logout`:
   - Clears `__Host-pageshooter_session` with `Max-Age=0; Path=/; Secure; HttpOnly`.

### 5.6. Investigation Area 6: Finding F-06 — Connected Active Player Single-Room Invariant Enforcement

**Review Finding:** In the recovery table, disconnected active players had `canReconnectMatch = true` while connected active players had `canReconnectMatch = false`. The single-room guard was enforced using `canReconnectMatch`, allowing connected active players (`CONNECTED_PLAYER`) to bypass the guard and create, join, or spectate other rooms during an active match.

**Root Cause:**
Two distinct architectural concepts were conflated into a single boolean `canReconnectMatch`:
1. **Reconnection Countdown UI:** Whether a client should display a "Rejoin Match (XXs remaining)" banner to reclaim a disconnected seat (`canReconnectMatch = true` ONLY for `DISCONNECTED_PLAYER`).
2. **Active Match Participation Commitment:** Whether the user is currently an active participant in an ongoing match (`ACTIVE` or `PAUSED`) and must be strictly blocked from creating, joining, or spectating another room.

Because `CONNECTED_PLAYER` had `canReconnectMatch = false`, checking `existing?.canReconnectMatch` in mutating routes allowed connected players to create or join another room simultaneously. Furthermore, `POST /api/rooms/:roomCode/spectate` and WebSocket `JOIN_ROOM` / `JOIN_AS_SPECTATOR` lacked single-room invariant enforcement entirely.

**Source Remediation:**
1. **Shared Type System (`packages/shared/src/index.ts` & `wsSchemas.ts`):**
   - Added `hasActiveMatchParticipation: boolean` to `UserActiveRoomResolution`.
   - Added `hasActiveMatchParticipation?: boolean` to `WSServerAuthSuccess`.
2. **Room Manager (`apps/server/src/rooms/roomManager.ts`):**
   - In `resolveUserRoomParticipation()`:
     - Tier 1 (`DISCONNECTED_PLAYER`): `canReconnectMatch: true`, `hasActiveMatchParticipation: true`.
     - Tier 2 (`CONNECTED_PLAYER`): `canReconnectMatch: false`, `hasActiveMatchParticipation: true`.
     - Tier 3 (`WAITING_PLAYER`): `canReconnectMatch: false`, `hasActiveMatchParticipation: false`.
     - Tier 4 (`SPECTATOR`): `canReconnectMatch: false`, `hasActiveMatchParticipation: false`.
     - Tier 5 (`ELIMINATED`): `canReconnectMatch: false`, `hasActiveMatchParticipation: false`.
     - Tier 6 (`COMPLETED_PARTICIPANT`): `canReconnectMatch: false`, `hasActiveMatchParticipation: false`.
3. **WebSocket Gateway (`apps/server/src/ws/gateway.ts`):**
   - Included `hasActiveMatchParticipation: activeResolution?.hasActiveMatchParticipation` in `AUTH_SUCCESS` message payload.
4. **REST Routes (`apps/server/src/routes/rooms.ts`):**
   - `POST /api/rooms`:
     ```ts
     const existing = roomManager.resolveUserRoomParticipation(user.id);
     if (existing?.hasActiveMatchParticipation) {
       throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot create a new room while an active match is in progress");
     }
     ```
   - `POST /api/rooms/:roomCode/join`:
     ```ts
     const existing = roomManager.resolveUserRoomParticipation(user.id);
     if (existing?.hasActiveMatchParticipation && existing.roomCode !== roomCode) {
       throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot join another room while an active match is in progress");
     }
     ```
   - `POST /api/rooms/:roomCode/spectate`:
     ```ts
     const existing = roomManager.resolveUserRoomParticipation(user.id);
     if (existing?.hasActiveMatchParticipation && existing.roomCode !== roomCode) {
       throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot spectate another room while an active match is in progress");
     }
     ```
5. **WebSocket Dispatcher (`apps/server/src/ws/dispatcher.ts`):**
   - In `JOIN_ROOM` and `JOIN_AS_SPECTATOR`:
     ```ts
     const activeRes = this.roomManager.resolveUserRoomParticipation(context.userId);
     if (activeRes?.hasActiveMatchParticipation && activeRes.roomCode !== message.roomCode) {
       throw new RoomError(409, "ACTIVE_MATCH_IN_PROGRESS", "Cannot join/spectate another room while an active match is in progress");
     }
     ```

**Test Evidence:**
- Added 6 dedicated tests in `apps/server/test/serverRoomRecovery.test.ts` (`Finding F-06: Connected Active Player Single-Room Invariant Enforcement`):
  1. `rejects POST /api/rooms with 409 ACTIVE_MATCH_IN_PROGRESS if user is a CONNECTED active player` -> PASS.
  2. `rejects POST /api/rooms/:code/join with 409 ACTIVE_MATCH_IN_PROGRESS if user is a CONNECTED active player` -> PASS.
  3. `rejects POST /api/rooms/:code/spectate with 409 ACTIVE_MATCH_IN_PROGRESS if user is a CONNECTED active player` -> PASS.
  4. `rejects POST /api/rooms/:code/spectate with 409 ACTIVE_MATCH_IN_PROGRESS if user is a DISCONNECTED active player` -> PASS.
  5. `allows an ELIMINATED player to join another room without 409 ACTIVE_MATCH_IN_PROGRESS` -> PASS.
  6. `allows a SPECTATOR to join another room without 409 ACTIVE_MATCH_IN_PROGRESS` -> PASS.
- Added 1 dedicated WebSocket integration test in `apps/server/test/wsRoomSync.test.ts`:
  1. `Finding F-06: rejects WS JOIN_ROOM and JOIN_AS_SPECTATOR with ACTIVE_MATCH_IN_PROGRESS if user is an active participant in another match` -> PASS.

---

## 6. Quality Gate Verification

All four quality gates passed cleanly with zero compilation errors, zero linter errors, and 100% test passage.

### Quality Gate 1: Full Monorepo Test Suite (`npm.cmd test`)
```
> pageshooter-monorepo@1.0.0 test
> vitest run

Test Files  34 passed (34)
     Tests  276 passed (276)
  Duration  4.55s
```
- **34 out of 34 test files passed.**
- **276 out of 276 tests passed** (14 new regression tests added across test suites; 7 specifically for F-06).
- **Exit Code: 0**

### Quality Gate 2: Full TypeScript Compilation (`npm.cmd run typecheck`)
```
> pageshooter-monorepo@1.0.0 typecheck
> tsc -b && npm run typecheck --workspace=@pageshooter/web && npm run typecheck --workspace=@pageshooter/server

> @pageshooter/web@1.0.0 typecheck
> tsc --noEmit

> @pageshooter/server@1.0.0 typecheck
> tsc --noEmit
```
- **Status: PASS**
- **0 errors** across root, shared, game-engine, web, and server workspaces.
- **Exit Code: 0**

### Quality Gate 3: Linter Verification (`npm.cmd run lint`)
```
> pageshooter-monorepo@1.0.0 lint
> eslint "packages/**/src/**/*.ts" "tools/**/src/**/*.ts" "apps/**/src/**/*.{ts,tsx}"
```
- **Status: PASS**
- **0 errors, 0 warnings.**
- **Exit Code: 0**

### Quality Gate 4: Production Build (`npm.cmd run build`)
```
> pageshooter-monorepo@1.0.0 build
> tsc -b && npm run build:web && npm run build:server

> @pageshooter/web@1.0.0 build
> tsc -b && vite build
✓ 57 modules transformed.
dist/index.html                   1.24 kB │ gzip:   0.70 kB
dist/assets/index-ExyDYpOP.css   44.50 kB │ gzip:   7.98 kB
dist/assets/index-DPjdAZwJ.js   433.09 kB │ gzip: 121.49 kB
✓ built in 3.37s

> @pageshooter/server@1.0.0 build
> tsc -b
```
- **Status: PASS**
- **Exit Code: 0**

---

## 7. Remaining Limitations & Accepted Risks (ADR-01 & ₹0 Budget)

1. **Stateless Server Restart Invalidation (ADR-01 Accepted Limitation):**
   - In-memory `RevocationManager` and room states exist solely in server RAM.
   - If the backend server restarts (e.g. Render container sleep/wake cycle or deployment), the revocation blocklist is cleared. A stolen JWT copied before restart remains cryptographically valid until its 24h expiration unless the server secret is rotated.
   - Match states are destroyed on restart, so stolen tokens cannot hijack in-progress games.
   - This limitation is accepted under ADR-01 to avoid persistent database session tables.
2. **Database In-Flight Wire Execution Race:**
   - Pre-commit revocation checks catch in-flight paused mutations prior to query dispatch.
   - If logout occurs while PostgreSQL is actively committing the `UPDATE` query on the wire (~1ms window), the database update succeeds.
   - This microsecond window is accepted under ADR-01 to avoid database-level distributed transactions.

---

## 8. Explicit Boundary Statement

Antigravity explicitly confirms:
- **Phase 6.7 Milestone 2 has NOT been started.**
- **No waiting-room UI or host controls have been implemented.**
- **No gameplay UI, cinematics, chat, or voice features were touched.**
- **No deployment or cloud provisioning was performed.**
- **No git commits, git pushes, branch creation, or Git configuration modifications were performed.**
- **The single `users` database table constraint (ADR-01) and ₹0 budget constraint remain 100% preserved.**

Antigravity is stopped and awaits your review and explicit authorization before proceeding to Phase 6.7 Milestone 2.
