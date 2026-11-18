# Phase 6.7 Milestone 2 — Final Independent Code & Security Audit

**Audit Date:** 2026-11-11  
**Target Milestone:** Phase 6.7 Milestone 2 — Waiting Room & Host Controls  
**Auditor:** Antigravity (Independent Verification Agent)  
**Status:** **CONDITIONALLY APPROVED — 2 NON-BLOCKING FINDINGS IDENTIFIED**  
**Read-Only Boundary:** STRICTLY MAINTAINED (Zero code modifications, zero Git operations, Milestone 3 NOT started)

---

## Executive Summary

An exhaustive, read-only code and architectural audit of Phase 6.7 Milestone 2 (Waiting Room & Host Controls) was conducted across the monorepo (`@pageshooter/game-engine`, `@pageshooter/server`, `@pageshooter/web`, and `@pageshooter/shared`).

All 4 quality gates were executed and verified clean:
- **Test Suite:** 288/288 unit and integration tests passing across 35 test files.
- **TypeScript:** 0 type errors across all workspaces (`tsc -b`, web, server).
- **ESLint:** 0 errors, 0 warnings.
- **Production Build:** Web bundle (Vite) and server (`tsc`) built cleanly.

All 7 mandatory audit areas were systematically investigated. 5 areas received unconditional **PASS** verdicts, while 2 areas received **CONDITIONAL PASS** due to low-severity UX/synchronization findings (F-M2-01 and F-M2-02). Neither finding represents a security vulnerability or blocker for Milestone 2 acceptance. Concrete remediations are documented below for user authorization prior to starting Milestone 3.

---

## Quality Gates Baseline Execution

| Quality Gate | Command | Result | Details |
|---|---|---|---|
| **Unit & Integration Tests** | `npm.cmd test` | **PASS** | 288 passed / 0 failed (35 test files, 8.60s) |
| **TypeScript Typecheck** | `npm.cmd run typecheck` | **PASS** | 0 errors across root, `@pageshooter/web`, `@pageshooter/server` |
| **Code Style & Linting** | `npm.cmd run lint` | **PASS** | 0 errors, 0 warnings across all workspaces |
| **Production Build** | `npm.cmd run build` | **PASS** | Vite web assets + server compiled cleanly |

---

## Detailed Audit of the 7 Mandatory Areas

### 1. Player Positions: Waiting Room Presentation vs. Match Randomization
- **Status:** **CONDITIONAL PASS (Finding F-M2-01)**
- **Code References:**
  - `packages/game-engine/src/engine.ts`: Lines 166–182 (`createInitialMatchState`)
  - `apps/server/src/rooms/roomManager.ts`: Lines 74–77 (`sanitizeRoom`)
  - `apps/web/src/components/online/WaitingRoomScreen.tsx`: Lines 211–227, 363–397, 452–486
- **Verification Details:**
  1. *Backend Engine Invariant:* In `packages/game-engine/src/engine.ts` lines 166–182, `createInitialMatchState` uses a cryptographically secure Fisher-Yates shuffle (`secureRandomInt(i + 1)`) over `playerInputs`. Positions `P1..Pn` are generated dynamically upon match start and permanently bound to `PlayerState.position`. Once assigned, positions remain immutable throughout the entire match.
  2. *Waiting Room Ordering:* In `apps/server/src/rooms/roomManager.ts` line 74, `sanitizeRoom` sorts waiting room participants strictly by `a.joinSequence - b.joinSequence`.
  3. *Frontend Display Ambiguity (Finding F-M2-01):* In `apps/web/src/components/online/WaitingRoomScreen.tsx`, lines 211–227 build 10 slots labeled `position: 'P' + (i + 1)`. In line 385, seat cards render badges showing `P1`, `P2`, etc., based purely on join sequence. Because of this labeling, a player occupying Seat 1 sees a badge `P1` and may expect to play as position `P1` in the battle, whereas the server engine will randomly reassign battle positions upon match start.
- **Finding F-M2-01 (Severity: Low / UX):**
  - *Description:* Waiting room seats are badged as `P1` through `P10`, implying deterministic match positioning.
  - *Remediation:* Update `WaitingRoomScreen.tsx` to badge waiting slots as `Seat 1` through `Seat 10` (or `Slot 1..10`), and add an explicit subtitle/disclaimer: *"Battle positions (P1–Pn) are randomly assigned when the match begins."*

---

### 2. Host Authority and Migration
- **Status:** **PASS**
- **Code References:**
  - `apps/server/src/rooms/roomManager.ts`: Lines 265–267 (`kickPlayer`), Lines 501–503 (`startMatch`), Lines 465–478 (`leaveRoom`)
  - `apps/server/src/ws/dispatcher.ts`: Lines 184–207 (`LEAVE_ROOM`), Lines 210–235 (`KICK_PLAYER`), Lines 237–251 (`START_MATCH`)
  - `apps/server/src/ws/reconnectManager.ts`: Lines 44–49 (`onSocketDisconnect`)
- **Verification Details:**
  1. *Server-Enforced Authority:* All privileged room actions (`startMatch`, `kickPlayer`) verify `room.hostUserId === requesterUserId` directly in RAM. Non-hosts are immediately rejected with HTTP 403 `NOT_HOST`.
  2. *Deterministic Migration Rule:* When a host departs via `leaveRoom` during the `WAITING` phase (`roomManager.ts:465-478`), the room selects the remaining player with the smallest `joinSequence`:
     ```ts
     const remainingPlayers = Array.from(room.players.values()).sort(
       (a, b) => a.joinSequence - b.joinSequence
     );
     const newHost = remainingPlayers[0];
     newHost.role = "HOST";
     room.hostUserId = newHost.userId;
     ```
  3. *Instant Authority Transition:* Because `room.hostUserId` and `player.role` are updated synchronously in memory, the newly promoted host immediately possesses server-side execution rights for `startMatch` and `kickPlayer`.
  4. *Broadcast Propagation:* `WSDispatcher` broadcasts `HOST_MIGRATED` with `{ newHostUserId, reason: "HOST_LEFT" }` to all clients, allowing the web frontend (`syncStore.applyHostMigrated`) to update the UI without needing a page refresh.
  5. *Raw Disconnect vs. Explicit Leave:* If the host drops their socket connection (e.g. browser refresh or network flicker) without an explicit `LEAVE_ROOM`, `reconnectManager.ts` (lines 44–49) marks `player.connected = false` but does not trigger migration. This protects the host from losing their room if they refresh their browser. If the host never returns, the room expires naturally via its 10-minute TTL (`WAITING_ROOM_TTL_MS`).

---

### 3. Kick Functionality and Participant Eviction
- **Status:** **PASS (with Minor Synchronization Observation F-M2-02)**
- **Code References:**
  - `apps/server/src/rooms/roomManager.ts`: Lines 259–290 (`kickPlayer`)
  - `apps/server/src/ws/dispatcher.ts`: Lines 210–235 (`KICK_PLAYER`)
  - `apps/web/src/components/online/WaitingRoomScreen.tsx`: Lines 88–92, 171–187, 232–250, 427–445
  - `apps/web/src/network/syncStore.ts`: Lines 100–108 (`applyPlayerKicked`)
- **Verification Details:**
  1. *Host-Only Validation:* Verified server-side check `if (room.hostUserId !== requesterUserId) throw new RoomError(403, "NOT_HOST", ...)`.
  2. *Host Self-Kick Guard:* Verified server-side check `if (targetUserId === room.hostUserId) throw new RoomError(400, "CANNOT_KICK_HOST", ...)`.
  3. *Waiting-Phase Only:* Verified server-side check `if (room.phase !== "WAITING") throw new RoomError(400, "ROOM_NOT_WAITING", ...)`.
  4. *Socket Revocation & Eviction:* When kicked via WebSocket, `WSDispatcher` (lines 223–227) unbinds and unsubscribes the target participant's socket:
     ```ts
     const targetCtx = this.broadcaster.getContextByUserId(message.targetUserId);
     if (targetCtx && targetCtx.roomCode === message.roomCode) {
       this.broadcaster.unsubscribeFromRoom(targetCtx.socketId);
     }
     ```
  5. *Client Eviction UX:* The kicked client receives `PLAYER_KICKED`, displays an unclosable full-screen departure modal (`WaitingRoomScreen.tsx:232-250`), and redirects the user back to the lobby.
  6. *Stale Command Rejection:* Once evicted from `room.players`, any further command sent by the kicked user is rejected with HTTP 403 `NOT_A_PLAYER` or `PARTICIPANT_NOT_FOUND`.
  7. *Finding F-M2-02 (Severity: Low / Sync):* In `apps/web/src/network/syncStore.ts` lines 100–108, `applyPlayerKicked` filters `state.room.players`, but does not filter `state.room.spectators`. Although the UI currently only allows kicking player seats, if a spectator is kicked via backend API, `syncStore` would not remove them from the spectator list until the next full snapshot.
  - *Remediation:* Update `applyPlayerKicked` in `syncStore.ts` to filter both `players` and `spectators`.

---

### 4. Match Start Validation and Synchronization
- **Status:** **PASS**
- **Code References:**
  - `apps/server/src/rooms/roomManager.ts`: Lines 483–550 (`startMatch`)
  - `packages/game-engine/src/engine.ts`: Lines 150–165 (`createInitialMatchState`)
  - `apps/server/src/ws/dispatcher.ts`: Lines 237–251 (`START_MATCH`)
  - `apps/web/src/components/online/WaitingRoomScreen.tsx`: Lines 124–128, 190–208, 509–535
- **Verification Details:**
  1. *Capacity Enforcement (5–10 Players):*
     - `roomManager.ts` lines 505–519 verifies `room.players.size >= MIN_PLAYERS (5)` and `<= MAX_PLAYERS (10)`. Attempting to start with < 5 players throws HTTP 400 `NOT_ENOUGH_PLAYERS`.
     - `engine.ts` lines 153–164 enforces the exact same rule at the pure game engine level (`GameRuleError("INVALID_COMMAND")`).
  2. *Host Authority:* Verified server check `if (room.hostUserId !== requesterUserId) throw new RoomError(403, "NOT_HOST", ...)`.
  3. *Concurrency & Idempotency:* `roomManager.ts` line 497 checks `if (room.phase !== "WAITING") throw new RoomError(400, "MATCH_ALREADY_STARTED", ...)`. The phase is set to `ACTIVE` synchronously in the same event tick, preventing race conditions or duplicate initializations.
  4. *Turn 1 Cryptographic Commitment:* Synchronously generates the Turn 1 secret seed and commitment hash (`roomManager.ts:534-541`).
  5. *Dual Broadcast:* `WSDispatcher` broadcasts both `MATCH_STARTED` and `ROLL_COMMITMENT` to all room sockets simultaneously.
  6. *Zero Optimistic Transition:* The client button (`handleStartMatch`) sets a loading state (`isStarting = true`) and awaits the server's authoritative WebSocket broadcast before transitioning the view (`onMatchStarted(message.matchState)`).

---

### 5. Spectator Isolation and Privilege Escalation Protection
- **Status:** **PASS**
- **Code References:**
  - `apps/server/src/rooms/roomManager.ts`: Lines 56–57, 206–209, 226–257, 612–614, 698–700
  - `apps/server/src/ws/dispatcher.ts`: Lines 149–180 (`JOIN_AS_SPECTATOR`)
  - `apps/web/src/components/online/WaitingRoomScreen.tsx`: Lines 114–117, 551–592
- **Verification Details:**
  1. *Seat Isolation:* Spectators are stored in a dedicated `room.spectators: Map<string, RoomParticipant>` completely isolated from `room.players`. The player count check (`room.players.size < MAX_PLAYERS`) is unaffected by spectator joins.
  2. *Zero Gameplay Authority:*
     - Roll attempts by spectators are rejected with HTTP 403 `SPECTATOR_FORBIDDEN` (`roomManager.ts:612-614`).
     - Shot attempts by spectators are rejected with HTTP 403 `SPECTATOR_FORBIDDEN` (`roomManager.ts:698-700`).
     - Start match attempts by spectators are rejected with HTTP 403 `NOT_HOST`.
  3. *Privilege Escalation Prevention:*
     - `joinAsSpectator` checks `if (room.players.has(user.id)) throw new RoomError(400, "ALREADY_PLAYER")`.
     - `joinAsPlayer` checks `if (room.phase !== "WAITING") throw new RoomError(400, "ROOM_NOT_WAITING")`, preventing spectators from converting into players after match launch.
  4. *Active-Match Invariant Protection:* In `resolveUserRoomParticipation`, spectators resolve to State 5: `ACTIVE_SPECTATOR` with `hasActiveMatchParticipation: false`. This ensures spectators are never trapped by active match invariants and can freely leave or spectate without breaking single-room constraints.

---

### 6. Session Recovery and Synchronization
- **Status:** **PASS**
- **Code References:**
  - `apps/server/src/rooms/roomManager.ts`: Lines 297–434 (`resolveUserRoomParticipation`)
  - `apps/server/src/routes/rooms.ts`: Lines 81–90 (`GET /api/rooms/my-active`)
  - `apps/server/src/ws/reconnectManager.ts`: Lines 145–254 (`handleReconnect`)
  - `apps/web/src/App.tsx`: Lines 110–140
  - `apps/web/src/network/websocketClient.ts`: Lines 80–120
- **Verification Details:**
  1. *F5 Refresh Recovery:*
     - On browser refresh in the `WAITING` phase, the frontend calls `GET /api/rooms/my-active`.
     - The server returns `activeRoom` with `phase: "WAITING"` and the user's role (`HOST` or `PLAYER`).
     - The frontend fetches `GET /api/rooms/:roomCode` to retrieve the authoritative `PublicRoomState`, mounts `WaitingRoomScreen`, and establishes a WebSocket connection.
  2. *Role & Permission Restoration:* In `WaitingRoomScreen.tsx`, `isHost` is dynamically computed as `currentRoom.hostUserId === currentUser.id`. If a host refreshes, they immediately retain host controls; guests remain in player view.
  3. *Idempotent Reconnect & Seat Retention:* When reconnecting via WebSocket, `handleReconnect` calls `roomManager.bindParticipantSocket`, re-associating the new socket ID with the existing `RoomParticipant` record. No duplicate player slots are created.
  4. *Snapshot Consistency:* Upon reconnecting to a `WAITING` room, the server emits a complete `ROOM_SNAPSHOT` (`reconnectManager.ts:247-253`), guaranteeing that any player joins or leaves that occurred during the refresh are synchronized.

---

### 7. Security and Architecture Standards Compliance
- **Status:** **PASS**
- **Code References:**
  - `apps/server/src/services/token.ts`: Signed JWT with `iss: "pageshooter-server"`
  - `apps/server/src/middleware/auth.ts`: `requireAuth`, `verifyMutatingOrigin`
  - `apps/server/src/db/schema.ts`: Single `users` table definition (ADR-01)
  - `apps/web/src/network/apiClient.ts`: HttpOnly cookies with `credentials: "include"`
- **Verification Details:**
  1. *Zero-Token JavaScript Architecture:* Verified that no JWT is stored in `localStorage`, `sessionStorage`, cookies readable by script, or React state. All authentication is strictly handled via `ps_auth_token` HttpOnly cookie.
  2. *Origin Verification:* All mutating REST routes enforce `verifyMutatingOrigin` (`Origin` header matching allowed CORS list).
  3. *ADR-01 Single Database Table Invariant:* Inspected `apps/server/src/db/schema.ts`. Exactly one database table exists: `users`.
  4. *RAM-Only Room State:* All rooms and match states exist solely in memory inside `RoomManager` (`roomsById` and `roomsByCode`). No room or match tables exist in the database.
  5. *₹0 Budget Invariant:* Entire system runs on local/self-hosted Node.js + SQLite/PostgreSQL with zero paid cloud dependencies.

---

## Tests Inspected & Tests Executed

### Tests Inspected
1. `apps/web/test/waitingRoom.test.tsx` (12 tests) — UI rendering of 10 seats, host kick buttons, start match threshold, copy room code, leave room, spectator list, and kick modal.
2. `apps/server/test/rooms.test.ts` (22 tests) — REST room creation, join player, join spectator, kick player, leave room, and host migration.
3. `apps/server/test/serverRoomRecovery.test.ts` (18 tests) — 6-state recovery model, `/api/rooms/my-active`, single-room invariant enforcement.
4. `apps/server/test/gameExecution.test.ts` (27 tests) — Match start with 5–10 players, turn execution, cryptographic commitment verification.
5. `apps/server/test/wsReconnect.test.ts` (5 tests) — Socket disconnect, reconnect, multi-tab replacement, and server restart handling.
6. `packages/game-engine/test/rules.test.ts` (34 tests) — Engine validation rules, min/max players, turn lifecycle, cell rules.

### Tests Executed
- **Command:** `npm.cmd test`
- **Output:** 288 passed across 35 test files (8.60s execution time). 0 failures.

---

## Findings Summary & Remediations

| ID | Area | Severity | Description | Remediation Plan |
|---|---|---|---|---|
| **F-M2-01** | UI / Presentation | Low | Waiting room seats are badged with `P1..P10`, which could mislead users into believing seat order determines match battle position. | Change seat badges in `WaitingRoomScreen.tsx` to `Seat 1..10` and add disclaimer text: *"Battle positions (P1–Pn) are randomly assigned when the match begins."* |
| **F-M2-02** | State Sync | Low | `syncStore.applyPlayerKicked` filters `state.room.players` but does not filter `state.room.spectators` if a spectator is kicked. | Update `applyPlayerKicked` in `syncStore.ts` to also filter `state.room.spectators` and adjust `spectatorCount`. |

---

## Recommendation & Next Step

**Verdict:** **APPROVE Phase 6.7 Milestone 2.**

Milestone 2 fulfills all security, architectural, and lifecycle requirements:
- Host migration reliably preserves room continuity.
- Kicked participants are server-evicted, socket-unsubscribed, and blocked from stale reconnects.
- Match start strictly enforces the 5–10 player constraint, host authority, and cryptographic commitment generation.
- Spectators are completely isolated with zero gameplay/host privileges.
- HttpOnly cookie authentication and single-table database invariants are strictly maintained.

Findings F-M2-01 and F-M2-02 are low-severity enhancements that can be addressed either as a quick pre-Milestone 3 polish step or incorporated directly.

**Milestone 3 has NOT been started. Awaiting user authorization.**
