# PageShooter — Phase 6.1: Online Multiplayer Backend Foundation Architecture Document

**Document Version:** 3.2.0 (Final Frozen Architecture Specification)  
**Status:** Architecture Specification — Phase 6.1 Frozen & Approved (Prerequisite for Phase 6.2 Scaffolding)  
**Author:** Pair Programming Agent & Engine Architect  
**Target Monorepo:** `pageshooter-monorepo` (`packages/shared`, `packages/game-engine`, `apps/web`, `apps/server`)  

---

### Document Change Log & Audit History
| Version | Date | Key Architectural Changes & Approvals |
| :--- | :--- | :--- |
| **1.0.0** | Nov 5, 2026 | Initial multiplayer architecture draft. |
| **2.0.0** | Nov 6, 2026 | Applied ultra-minimal storage policy; removed match history, match events, and participant tables. |
| **3.0.0** | Nov 6, 2026 | Incorporated locked ADRs: ADR-01 (In-Memory Only Crash Recovery), ADR-02 (Earliest `joinSequence` Waiting Host Migration), ADR-03 (Google STUN + Metered.ca TURN fallback). |
| **3.1.0** | Nov 6, 2026 | Consistency audit: corrected Supabase quotas (5GB+5GB egress, insufficient project activity pausing), Render 744h/750h as quota constraint without uptime guarantee, EphemeralRoom `expiresAt: number \| null`, quadratic mesh scaling. |
| **3.2.0** | Nov 6, 2026 | **Final Freeze:** Resolved schema inconsistency (single `users` table strictly locked; no `auth_accounts`); clarified randomness guarantee boundary (prevents outcome substitution, cannot prevent pre-reveal aborts); gated TURN verification as a prerequisite for voice in Phase 6.7 with permanent disable fallback. Phase 6.1 formally frozen. |

---

## Table of Contents
1. [Architecture Decision Record (ADR) — Locked Decisions](#1-architecture-decision-record-adr--locked-decisions)
2. [Executive Summary & Core Directives](#2-executive-summary--core-directives)
3. [Mandatory Ultra-Minimal Storage Policy](#3-mandatory-ultra-minimal-storage-policy)
4. [Database Schema & Migrations (PostgreSQL / Drizzle ORM)](#4-database-schema--migrations-postgresql--drizzle-orm)
5. [Authentication & Account Management Design](#5-authentication--account-management-design)
6. [Room Lifecycle, Rematch & Host Migration Rules](#6-room-lifecycle-rematch--host-migration-rules)
7. [Room Code Specification (Base-32)](#7-room-code-specification-base-32)
8. [Spectator Architecture & Real-Time Communication](#8-spectator-architecture--real-time-communication)
9. [Voice Chat Architecture: STUN, TURN & Scaling Constraints](#9-voice-chat-architecture-stun-turn--scaling-constraints)
10. [Verifiable Randomness Protocol (Commitment-Reveal)](#10-verifiable-randomness-protocol-commitment-reveal)
11. [WebSocket Event & Wire Protocol Specification](#11-websocket-event--wire-protocol-specification)
12. [Server-Authoritative Game Command Execution](#12-server-authoritative-game-command-execution)
13. [Security, Rate-Limiting & Authorization Model](#13-security-rate-limiting--authorization-model)
14. [Zero-Cost Hosting Architecture (₹0 Budget / Free Tiers Only)](#14-zero-cost-hosting-architecture-0-budget--free-tiers-only)
15. [Environment Variables & Secrets Strategy](#15-environment-variables--secrets-strategy)
16. [Preservation of Offline Mode & Parity Strategy](#16-preservation-of-offline-mode--parity-strategy)
17. [Phase 6 Implementation Roadmap (6.2 → 6.8)](#17-phase-6-implementation-roadmap-62--68)
18. [Remaining Risks, Limitations & Consistency Checklist](#18-remaining-risks-limitations--consistency-checklist)

---

## 1. Architecture Decision Record (ADR) — Locked Decisions

This specification formally locks the three architectural decisions established for PageShooter Phase 6:

### ADR-01: Online Crash Recovery Strategy — Option B (In-Memory Only)
- **Decision:** Active multiplayer room and match state resides exclusively in Node.js server RAM (`RoomManager`).
- **Database Non-Involvement:** No database tables (`ephemeral_rooms` or equivalent), database snapshots, event-log persistence, or match recovery mechanisms are permitted in Supabase PostgreSQL.
- **Accepted Limitation:** If the backend server process restarts, crashes, or is migrated by Render, active online matches are **terminated immediately and cannot be resumed**.
- **User Communication:** Reconnecting clients receive an explicit error (`MATCH_TERMINATED_SERVER_RESTART`: *"The match ended because the game server restarted or became unavailable. Please create or join a new room."*) and return to the main lobby flow. No stale commands or silent restorations are allowed.
- **Ordinary Disconnect Preservation:** The standard 60-second player reconnection window remains active for individual network disconnects while the server process stays alive.
- **Offline Invariance:** Offline pass-and-play mode continues saving and restoring local matches via browser IndexedDB, completely unaffected by this online decision.

### ADR-02: Waiting-Room Host Disconnect Policy — Option B (Host Migration)
- **Decision:** If the host disconnects or leaves during the pre-match `WAITING` phase, host privileges transfer deterministically to the **earliest-joined remaining player**.
- **Tie-Breaker:** Join order is tracked by server-assigned monotonic sequence (`joinSequence: number`), eliminating ambiguity and ignoring untrusted client clocks.
- **Permissions:** The new host receives full waiting-room permissions (starting the match, kicking players).
- **Invariance:** Migration does not alter player slot assignments, prospective match positions, or room codes. If no eligible player remains, the room is deleted immediately.
- **Contrast with Active Match:** 
  - *Waiting Room:* Immediate transfer to earliest-joined player.
  - *Active Match:* 60-second grace pause; if host times out, host player is eliminated and host transfers to the lowest-numbered surviving player ($P1 \dots Pn$). The host cannot voluntarily quit an active match.

### ADR-03: Voice Chat NAT Traversal — Option B (Google STUN + Metered.ca TURN)
- **Decision:** WebRTC voice chat utilizes Google Public STUN as the primary candidate discovery mechanism and Metered.ca Free TURN relay as a secondary fallback for symmetric NAT traversal.
- **Participant Access:** Both active players and spectators can participate in voice chat. Spectators join muted by default with push-to-talk / unmute toggle support.
- **Non-Mandatory Voice & Text Fallback:** Voice is strictly optional. In-game text chat and animated emoji reactions remain 100% functional over WebSocket if voice fails to connect.
- **Ephemeral Credentials:** Short-lived TURN credentials are generated on-demand by the backend. No permanent API keys or secrets are ever exposed in frontend client code.
- **Usage Control & Zero-Billing Shutdown:** The backend monitors TURN allocation. Conservative warning and shutoff thresholds disable TURN relay before free quotas are reached, falling back to STUN/text chat to guarantee **zero financial charges**.
- **Quadratic Mesh Limitation:** Voice chat uses P2P full mesh ($N \times (N-1)/2$). At 15 participants, up to 105 bidirectional peer streams are required. Voice capacity is explicitly subject to device hardware limits and will be benchmarked in Phase 6.8.

---

## 2. Executive Summary & Core Directives

PageShooter expands to online multiplayer while preserving its offline storybook mode under a strict **₹0 recurring budget**.

### 2.1 Non-Negotiable Directives
1. **Server Authority:** The server is the single source of truth for online matches. Clients transmit validated player intent (commands); they never directly mutate match state.
2. **Pure TypeScript Engine Reuse:** [`packages/game-engine`](file:///c:/Games/PageShooter/packages/game-engine/src/engine.ts) executes directly on the server without game rule modifications.
3. **Offline Preservation:** Offline play via IndexedDB ([`apps/web/src/storage/db.ts`](file:///c:/Games/PageShooter/apps/web/src/storage/db.ts)) remains independent, local, and fully functional.
4. **Zero Client Trust:** Identity is strictly verified through database-backed JWT authentication. Client-reported usernames or player IDs are rejected.
5. **Private Rooms:** Rooms enforce 5–10 active players (`MIN_PLAYERS = 5`, `MAX_PLAYERS = 10`), controlled by 6-character Base-32 room codes.
6. **Spectator Separation:** Spectators join rooms without consuming active player slots, observe matches, and participate in chat, voice, and reactions without gameplay authority.
7. **Verifiable Randomness:** Cryptographic commitment-reveal protocol guarantees fair 20% distribution over $\{0, 2, 4, 6, 8\}$ and valid pages $1 \dots 500$, preventing post-hoc manipulation.
8. **Ultra-Minimal Storage:** The database stores **only** user credentials and profiles. Match history, replays, events, and match statistics are **never persisted**.
9. **Zero-Cost Hosting (₹0 / $0.00):** Operating without credit cards, without paid plans, without automatic top-ups, and without keep-alive pingers.

---

## 3. Mandatory Ultra-Minimal Storage Policy

### 3.1 What is Stored in the Database
Only essential account credentials and profile attributes:
- User UUID, verified email, globally unique username, avatar identifier.
- Password hash (Argon2id) for password accounts, or Google subject identifier (`googleSub`) for Google accounts.
- Timestamp of last username change (`usernameUpdatedAt`) to enforce the 30-day cooldown.
- Account creation and last update timestamps.

### 3.2 What is NEVER Stored in the Database
- **No match history:** The database has no `matches` table.
- **No match events, replays, or turn logs:** No `match_events` table.
- **No participant records:** No `match_participants` table.
- **No gameplay statistics:** `matchesPlayed`, `matchesWon`, and `totalKills` are **explicitly forbidden** and removed from user profiles.
- **No active match state:** In accordance with ADR-01, active matches exist strictly in server RAM. No `ephemeral_rooms` or snapshot tables exist.
- **No voice recordings or chat logs:** Communication streams are ephemeral and unrecorded.

### 3.3 Ephemeral Room & Report Lifecycle
- **Active Rooms:** Exist strictly in Node.js server process memory (`RoomManager`).
- **Waiting Room Expiry:** Waiting rooms expire after exactly 10 minutes (`WAITING_ROOM_TTL_MS = 600_000`). This expiry **cannot be extended**.
- **Completed Room Expiry:** A completed room and its in-memory temporary match report are retained for up to 10 minutes (`COMPLETED_ROOM_TTL_MS = 600_000`).
- **Immediate Teardown:** If all players and spectators leave a room (waiting or completed), the room and its temporary data are **deleted immediately**.
- **Host Report Download Access:** **Only the host** is authorized to download the temporary match report (JSON).
- **Expiry Invariance:** Downloading the temporary match report **must not extend** the 10-minute expiry deadline.
- **Match Duration:** The 10-minute expiry applies strictly to `WAITING` and `COMPLETED` lobbies; active matches have no artificial 10-minute match timeout.

---

## 4. Database Schema & Migrations (PostgreSQL / Drizzle ORM)

The persistent database schema consists of a **single, minimal `users` table**.

```typescript
import { pgTable, uuid, varchar, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * The ONLY persistent table in PageShooter.
 * Stores strictly account credentials and profile identity.
 * NO match history, statistics, active state, or event logs are persisted.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: varchar("email", { length: 255 }).notNull(),
    username: varchar("username", { length: 32 }).notNull(),
    passwordHash: text("password_hash"), // Nullable for Google OAuth users
    googleSub: varchar("google_sub", { length: 128 }), // Nullable for password users
    avatarId: varchar("avatar_id", { length: 64 }).default("barnaby").notNull(),
    usernameUpdatedAt: timestamp("username_updated_at", { withTimezone: true })
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull()
  },
  (table) => [
    uniqueIndex("users_email_idx").on(sql`LOWER(${table.email})`),
    uniqueIndex("users_username_lower_idx").on(sql`LOWER(${table.username})`),
    uniqueIndex("users_google_sub_idx").on(table.googleSub)
  ]
);
```

### 4.1 Schema Resolution: Single `users` Table vs Multi-Table Architecture
- **Locked Architecture Decision:** Authentication credentials and player identity are consolidated **exclusively within the single `users` table**. There is **no separate `auth_accounts` table**.
- **Rationale for Single-Table Design:**
  1. **Strict Minimal Footprint:** A single flat table minimizes PostgreSQL disk pages, schema catalog footprint, and index bloat, guaranteeing optimal use of Supabase's 500 MB free allocation.
  2. **Zero-Join Fast Authentication:** Login, token issuance, and profile queries require only a single primary-key or indexed lookup (`LOWER(email)` or `google_sub`), eliminating multi-table relational joins (`JOIN auth_accounts ON ...`) and keeping database queries lightning fast on Supabase's 0.1 vCPU pool.
  3. **Atomic Profile Updates:** Username changes and password resets occur in a single atomic row update without distributed transaction locking or foreign-key cascade overhead.
  4. **Scaffolding Simplicity:** Eliminates foreign key relations and multi-file migration sequencing in Phase 6.2, allowing the Fastify server and Drizzle ORM setup to be lean, robust, and easily verified.

### 4.2 Storage Footprint & Free-Tier Suitability
With each user record averaging $\approx 250\text{ bytes}$, Supabase's 500 MB free quota can accommodate **over 1.5 million user accounts** without exceeding free-tier limits or requiring storage upgrades.

---

## 5. Authentication & Account Management Design

### 5.1 Endpoints (REST API)

```
POST /api/auth/register-password
  Body: { email, username, password }
  Validations:
    • email: RFC 5322 format
    • username: 3-20 chars, alphanumeric + underscores, unique (case-insensitive)
    • password: min 8 chars, 1 uppercase, 1 lowercase, 1 number
  Returns: { user: PublicUserProfile, token: string }

POST /api/auth/login-password
  Body: { identifier (email or username), password }
  Returns: { user: PublicUserProfile, token: string }

POST /api/auth/google
  Body: { idToken: string, requestedUsername?: string }
  Validations:
    • Validated with Google's public certs via google-auth-library
    • If googleSub exists -> Login
    • If new -> Register with validated requestedUsername
  Returns: { user: PublicUserProfile, token: string }

GET /api/users/me
  Headers: { Authorization: "Bearer <token>" }
  Returns: { user: PublicUserProfile }

PATCH /api/users/me/username
  Headers: { Authorization: "Bearer <token>" }
  Body: { newUsername: string }
  Returns: 200 OK or 429 Too Many Requests (Cooldown active)
```

### 5.2 30-Day Username Cooldown Enforcement
The 30-day cooldown requirement is enforced atomically in SQL:
```sql
UPDATE users
SET username = $1, username_updated_at = NOW(), updated_at = NOW()
WHERE id = $2
  AND username_updated_at <= NOW() - INTERVAL '30 days'
RETURNING id, username, username_updated_at;
```
If 0 rows are updated, the query inspects `username_updated_at` and returns HTTP 429 with the exact ISO date when the next rename is permitted.

---

## 6. Room Lifecycle, Rematch & Host Migration Rules

### 6.1 Waiting-Room Host Migration (ADR-02)
1. **Trigger:** Host drops connection or leaves while the room is in `WAITING` phase.
2. **Deterministic Selection:** Host status transfers to the remaining player with the lowest `joinSequence` (earliest server-recorded join order).
3. **Privileges:** The new host receives full waiting-room permissions (starting the match, kicking players).
4. **Broadcast:** Server broadcasts `HOST_MIGRATED { newHostUserId, reason: "WAITING_ROOM_TRANSFER" }`.
5. **Empty Room Teardown:** If all players leave, the room is deleted immediately.

### 6.2 Active-Match Host Migration
1. **Host Disconnect Pause:** If the host drops connection during an active match, the match enters the standard **60-second reconnection window** (`RECONNECT_WINDOW_MS = 60_000`). The match is paused.
2. **Host Reconnect Within 60s:** If the host reconnects within 60 seconds, exact match state resumes.
3. **Host Elimination on Expiry:** If the host does not reconnect before 60 seconds expire, the host player is **eliminated** (`status = "ELIMINATED"`).
4. **Host Privilege Transfer:** Host privileges transfer to the **lowest-numbered surviving active player position**:
   - Check `P1` $\rightarrow$ if alive, becomes host.
   - Else check `P2` $\rightarrow$ if alive, becomes host.
   - Continues cyclically through `Pn`.
5. **Position Invariance:** Surviving players' assigned positions ($P1 \dots P10$) **never change**.
6. **No Voluntary Host Abandonment:** The host **cannot voluntarily leave** an active match. Closing the client triggers the 60-second disconnect pause.

### 6.3 Rematches & In-Memory Room Lifecycle
- **Same Room Code:** When a match completes, players return to the room lobby using the **same 6-character room code**.
- **Position Randomization:** For every new match or rematch, player positions ($P1 \dots Pn$) are **randomly reassigned afresh** using cryptographic shuffle.
- **Completed Room Retention:** The room and its temporary match report remain in server memory for up to 10 minutes (`COMPLETED_ROOM_TTL_MS = 600_000`).
- **Immediate Cleanup:** If all participants leave, the room is deleted immediately.
- **Host Report Download:** Only the host can download the temporary match report (JSON). Downloading does not extend the 10-minute expiry.

---

## 7. Room Code Specification (Base-32)

### 7.1 Character Set & Base-32 Math
The room code alphabet contains exactly **32 characters**:
```
Alphabet: 2 3 4 5 6 7 8 9 A B C D E F G H J K L M N P Q R S T U V W X Y Z
Digits:   8 (2 through 9; excluding confusing digits 0 and 1)
Letters:  24 (excluding confusing letters I and O)
Total:    8 + 24 = 32 characters (2^5 = Base-32)
```

### 7.2 Code Length & Collision Space
- **Length:** Exactly **6 characters**.
- **Combinations:** $32^6 = (2^5)^6 = 2^{30} = 1,073,741,824$ combinations (over **1.073 billion** unique codes).
- **Collision Handling:** The server checks in-memory `rooms.has(code)` and re-rolls on collision before returning the code.

---

## 8. Spectator Architecture & Real-Time Communication

### 8.1 Spectator Role Modeling
Spectators are explicitly modeled separately from active players:
- **No Slot Consumption:** Spectators do **not** occupy any of the 5–10 active player slots.
- **Mid-Match Joining:** Spectators may join at any time (waiting, active, or completed) via the room code.
- **Observation:** Spectators receive the live battlefield state and event stream.
- **Communication Channels:** Spectators can participate in text chat, send emoji reactions, and participate in WebRTC voice chat.
- **Gameplay Authority:** Spectators are **strictly prohibited** from performing gameplay actions (`ROLL_REQUEST`, `SHOOT_REQUEST`). Any gameplay attempt returns `SPECTATOR_FORBIDDEN`.
- **Rejoining:** Spectators can leave and rejoin freely while the room exists.

```typescript
export interface RoomParticipant {
  userId: string;
  username: string;
  avatarId: string;
  role: "HOST" | "PLAYER" | "SPECTATOR";
  connected: boolean;
  socketId: string | null;
  joinSequence: number; // Server-assigned monotonic sequence for tie-breaking
  joinedAt: number;     // Server timestamp
}

export interface EphemeralRoom {
  roomId: string;
  roomCode: string; // Exactly 6 base-32 chars
  hostUserId: string;
  phase: "WAITING" | "ACTIVE" | "COMPLETED";
  players: Map<string, RoomParticipant>; // Max 10 players
  spectators: Map<string, RoomParticipant>; // Separate spectator registry
  matchState: MatchState | null; // In-memory engine state (ADR-01)
  createdAt: number;
  expiresAt: number | null; // 10-minute deadline for WAITING and COMPLETED phases; null during ACTIVE matches
  temporaryReport: object | null; // Downloadable only by host (COMPLETED phase)
}
```

**Room Expiry Semantics:**
- `expiresAt` is set strictly during the `WAITING` phase (`createdAt + WAITING_ROOM_TTL_MS`, 10 minutes) and `COMPLETED` phase (`completedAt + COMPLETED_ROOM_TTL_MS`, 10 minutes).
- During `ACTIVE` matches, `expiresAt` is strictly `null`. Active matches have no artificial time limit and run until a player achieves victory or all opponents are eliminated/disconnected.
- Active matches terminate if the server process restarts or crashes (ADR-01), but they are never terminated by an arbitrary 10-minute timer.

### 8.2 Communication Protocols & Rate Limits
1. **Text Chat:** Max 200 characters, trimmed, HTML stripped. Rate limit: 1 message every 2 seconds per user.
2. **Emoji Reactions:** Whitelisted emoji IDs (`[thumb, fire, skull, scream, sword, cheer]`). Rate limit: 2 reactions per second.
3. **Voice Signaling:** Relays SDP offers, answers, and ICE candidates via WebSocket.

---

## 9. Voice Chat Architecture: STUN, TURN & Scaling Constraints

### 9.1 Multi-Tier NAT Traversal (ADR-03)
Voice chat operates on a dual-tier strategy designed for ₹0 operation:
1. **Tier 1 (Direct P2P via Google STUN):**
   - STUN server: `stun:stun.l.google.com:19302`.
   - Resolves public endpoints for clients on non-symmetric NATs. Direct browser-to-browser media exchange requires zero server bandwidth.
2. **Tier 2 (Relay Fallback via Metered.ca Free TURN):**
   - When both peers are behind Symmetric NAT (standard on mobile CGNAT, corporate networks, and campus Wi-Fi), direct P2P audio fails completely.
   - The backend requests ephemeral, short-lived TURN credentials from Metered.ca's API on-demand.
   - **No Secret Exposure:** Permanent Metered.ca API keys are stored in backend environment variables (`METERED_API_KEY`) and are never exposed to clients.
3. **Tier 3 (Graceful Fallback to Text Chat):**
   - If WebRTC negotiation fails or TURN quotas are shut off, the voice module displays a clear status notice (*"Voice connection unavailable on this network"*) and falls back seamlessly to **in-game text chat and animated emoji reactions**.

### 9.2 Usage-Control & Zero-Billing Shutdown Policy
- **Absolute Zero-Billing Guarantee:** No credit card, debit card, or payment method will ever be attached to Metered.ca. Automatic top-up, auto-billing, and paid tier upgrades are strictly disabled.
- **Provider-Controlled Quota:** Free TURN bandwidth is provided at the discretion of the provider and is subject to fair-use allocation without permanent SLAs.
- **Authoritative Relay Metering & Quota Polling:**
  1. **Authoritative Metric:** The backend monitors relayed bandwidth consumption using Metered.ca's authoritative usage metric: `totalBandwidthBytes` (cumulative relayed byte volume).
  2. **Polling Frequency:** The backend polls the Metered.ca Management API (`GET /api/v1/reports/usage` or credentials usage endpoint) every **15 minutes**.
  3. **Conservative Warning Threshold (70%):** When verified relayed usage reaches **70%** of the free monthly allowance, the backend logs a high-priority system warning and prepares fallback notifications.
  4. **Conservative Shutdown Threshold (85%):** When relayed usage reaches **85%** of the free monthly allowance, the backend immediately **shuts down TURN credential issuance**.
  5. **Fail-Closed Behavior on API Failure:** If the Metered.ca usage API is unreachable, times out, returns HTTP 4xx/5xx errors, or returns unparseable data, the backend **fails closed**: it temporarily stops issuing new TURN credentials and issues only STUN candidates until API connectivity and quota safety can be re-verified.
  6. **Backend Credential Denial:** Once shutdown is triggered, the backend returns only the public STUN server (`stun:stun.l.google.com:19302`) in ICE server lists. Clients behind Symmetric NAT receive an in-app banner (*"Voice relay reached free monthly capacity — voice disabled on this network"*) and fall back to in-game text chat and emoji reactions.
  7. **Session Counter Inadequacy Disclaimer:** An in-memory session or allocation counter alone is **not** a reliable substitute for actual byte tracking, as a single long match with high packet throughput can consume gigabytes while dozens of short sessions consume megabytes. Real byte metering via API is mandatory.
  8. **Unresolved Implementation Assumption:** The exact JSON schema, pagination, and rate limits of Metered.ca's usage reporting endpoint are subject to provider API updates and will be empirically validated during the Phase 6.3/6.5 integration spikes.

### 9.3 Quadratic Mesh Scaling Limitations & Empirical Voice Ceiling
- **Product Requirement Preserved:** Both active players (up to 10) and spectators (up to 5) are permitted to join voice chat.
- **Spectator Controls:** Spectators join voice chat **muted by default** and must use Push-to-Talk or explicit unmute to transmit audio, keeping simultaneous active audio streams low.
- **Quadratic P2P Mesh Growth:** P2P mesh audio requires $N \times (N - 1) / 2$ connections across the room:
  - 5 participants = 10 peer connections.
  - 10 participants = 45 peer connections.
  - 15 participants (10 players + 5 spectators) = 105 peer connections!
- **No Claim of Unlimited Voice Capacity:** Because PageShooter operates without a paid Selective Forwarding Unit (SFU) media server, the architecture **does not claim unlimited voice participants**. Each browser client must encode and transmit audio to every other peer in the mesh, which can cause CPU throttling and audio packet drops on mobile devices at high participant counts.
- **Practical Voice Participant Ceiling Deferred to Phase 6.8:** Rather than arbitrarily restricting room spectator voice in this architecture document, the practical ceiling for concurrent active voice peers on mobile and desktop browsers is deferred to the **Phase 6.8 multi-client empirical benchmark**. If Phase 6.8 testing demonstrates packet degradation beyond $M$ active peers, an empirical cap (`MAX_ACTIVE_VOICE_PEERS`) will be applied at the signaling level. In all scenarios, in-game text chat and animated emoji reactions serve as the zero-overhead fallback.

### 9.4 TURN Verification Safeguard & Voice Integration Gating (Pre-Voice Prerequisite)
- **Voice Deferred to Phase 6.7 / 6.8:** Voice chat is **strictly deferred** to the later client integration and benchmarking phases. Early backend phases (6.2, 6.3, 6.4, 6.5, 6.6) do NOT scaffold WebRTC media, call Metered.ca APIs, or establish voice signaling.
- **Mandatory Empirical Verification Prerequisite:** Before enabling WebRTC TURN relay in Phase 6.7, the engineering team must conduct an isolated diagnostic spike to empirically verify:
  1. Metered.ca's authoritative REST endpoints for reporting usage and active sessions.
  2. The exact reporting delay (latency between byte relay and counter increment in provider telemetry).
  3. Quota measurement accuracy (`totalBandwidthBytes`).
  4. Ephemeral credential expiration lifetimes (`ttl` parameter).
- **Hard Fail-Safe: Voice Disabled if Quota Enforcement Untrusted:** If Metered.ca's usage API cannot be verified, exhibits unreliable reporting delays, or cannot provide trustworthy automated quota enforcement, **voice relay (TURN) will remain permanently disabled**. In that scenario, voice will operate strictly on direct P2P (Google STUN) where network topology allows, or voice will be disabled entirely, with all players and spectators relying exclusively on the zero-cost in-game text chat and animated emoji reactions. Under no circumstances will unmonitored TURN relay be deployed.

---

## 10. Verifiable Randomness Protocol (Commitment-Reveal)

PageShooter implements a **per-roll cryptographic commitment-reveal scheme** to prevent server manipulation while preserving pure game engine rules.

> [!IMPORTANT]
> **Randomness Cryptographic Guarantee & Exact Boundary:**
> 1. **What It Prevents:** The commitment-reveal protocol mathematically prevents **post-commit outcome substitution**. Once the server computes and broadcasts the hash commitment $C_{\text{turn}} = \text{SHA256}(S_{\text{turn}} \parallel \text{matchId} \parallel \text{turnNumber})$, the server **cannot substitute, bias, or alter the outcome** after the client initiates a roll. Any post-commit alteration of $S_{\text{turn}}$ or the resulting outcome will immediately fail client-side SHA256 verification and trigger a cryptographic fault error.
> 2. **What It CANNOT Prevent:** The protocol **cannot prevent a rogue server operator from aborting or restarting the server before revealing the seed**. If an operator previews the pre-committed roll and finds the outcome unfavorable, they could intentionally terminate or restart the server process. Under ADR-01 (In-Memory Only), all active matches are destroyed on process restart. Clients hold the unverified commitment $C_{\text{turn}}$ but never receive $S_{\text{turn}}$, and cannot mathematically prove whether the abort was an infrastructure restart or an intentional abort. This is an explicitly documented and accepted trust boundary of in-memory volatility in our ₹0 hosting architecture.

```mermaid
sequenceDiagram
    autonumber
    participant Server
    participant Client as Active Player & Spectators

    Note over Server: 1. Turn starts (Phase: AWAITING_ROLL)
    Server->>Server: Generate 256-bit Secret Seed (S_turn)
    Server->>Server: Compute Hash Commitment: C_turn = SHA256(S_turn || matchId || turnNumber)
    Server-->>Client: ROLL_COMMITMENT { turnNumber, commitmentHash: C_turn }
    Note over Client: Client holds locked commitment C_turn BEFORE rolling

    Client->>Server: ROLL_REQUEST { roomCode, expectedStateVersion }
    
    Server->>Server: Compute Entropy = HMAC_SHA256(S_turn, matchId || ":" || turnNumber)
    Server->>Server: Derive Outcome (0,2,4,6,8) via Rejection Sampling (mod 5)
    Server->>Server: Derive Page (1..500 ending in outcome) via Rejection Sampling (mod 50)
    Server->>Server: Apply roll to @pageshooter/game-engine

    Server-->>Client: ROLL_REVEALED { turnNumber, outcome, pageNumber, seed: S_turn }
    
    Note over Client: 2. Immediate Client-Side Verification:
    Note over Client: A) Verify SHA256(S_turn || matchId || turnNumber) == C_turn
    Note over Client: B) Recompute Entropy and verify exact outcome & pageNumber
```

### 10.1 Mathematical Derivation
1. **Entropy:** $\text{Entropy} = \text{HMAC-SHA256}(S_{\text{turn}}, \text{matchId} \parallel \text{":"} \parallel \text{turnNumber})$.
2. **Outcome Selection (Exact 20% Uniform Probability):**
   - Take the first 4 bytes as unsigned 32-bit integer $I_1 \in [0, 2^{32}-1]$.
   - Apply rejection sampling: discard if $I_1 \ge \lfloor 2^{32} / 5 \rfloor \times 5 = 4,294,967,295$.
   - $\text{Index} = I_1 \pmod 5 \rightarrow \text{Outcome} \in \{0, 2, 4, 6, 8\}$.
3. **Page Number Selection:**
   - Take next 4 bytes as unsigned 32-bit integer $I_2 \in [0, 2^{32}-1]$.
   - Rejection sampling: discard if $I_2 \ge \lfloor 2^{32} / 50 \rfloor \times 50 = 4,294,967,250$.
   - Valid pages ending in digit $D$: $\text{Pages}_D = \{ D + 10k \mid 0 \le k \le 49 \}$.
   - $\text{PageNumber} = \text{Pages}_D[I_2 \pmod{50}]$.
4. **Client Verification:** Immediately upon roll reveal, clients verify that $C_{\text{turn}}$ matches $\text{SHA256}(S_{\text{turn}} \dots)$ and that the mathematical formula matches the outcome and page number.

### 10.2 Commitment-Reveal Abort Limitation (Accepted Volatility Trade-Off)
- **Scenario:** The server broadcasts `ROLL_COMMITMENT { turnNumber, commitmentHash: C_turn }` to all clients, but crashes, restarts, or is terminated by the operator before the active player sends `ROLL_REQUEST` or before `ROLL_REVEALED { seed: S_turn }` is broadcast.
- **Fairness Boundary:** Under ADR-01 (In-Memory Only), a server restart aborts the match and clears all ephemeral state. In this scenario, clients hold $C_{\text{turn}}$ but never receive $S_{\text{turn}}$. Consequently, clients **cannot cryptographically verify** whether the abort was an involuntary infrastructure event (e.g. Render free container restart) or a malicious server operator intentionally terminating the process because the pre-generated seed would produce an unfavorable roll outcome for an allied player.
- **Accepted Trust Assumption:** In a server-authoritative casual web game with zero-cost hosting, this vulnerability to operator aborts is an accepted limitation of in-memory volatility.
- **Future Mitigation Item:** If competitive tournaments or high-stakes play are introduced in future milestones, a two-party or multi-party coin flipping protocol (e.g. client entropy combined with server entropy: $\text{Entropy} = \text{HMAC}(S_{\text{server}} \oplus S_{\text{client}})$) can be scheduled for security review to eliminate single-party seed bias. For Phase 6, the current commitment-reveal protocol provides strong protection against silent client-side tampering and mid-turn server manipulation while keeping the game rules and engine purely deterministic.

---

## 11. WebSocket Event & Wire Protocol Specification

### 11.1 Client → Server Discriminated Union
```typescript
export type WSClientMessage =
  | { type: "JOIN_ROOM"; correlationId: string; roomCode: string }
  | { type: "JOIN_AS_SPECTATOR"; correlationId: string; roomCode: string }
  | { type: "LEAVE_ROOM"; correlationId: string; roomCode: string }
  | { type: "KICK_PLAYER"; correlationId: string; roomCode: string; targetUserId: string }
  | { type: "START_MATCH"; correlationId: string; roomCode: string }
  | { type: "ROLL_REQUEST"; correlationId: string; roomCode: string; expectedStateVersion: number }
  | { type: "SHOOT_REQUEST"; correlationId: string; roomCode: string; targetPlayerId: string; targetCellValue: CellValue; expectedStateVersion: number }
  | { type: "RECONNECT_MATCH"; correlationId: string; roomCode: string; lastKnownVersion: number }
  | { type: "DOWNLOAD_MATCH_REPORT"; correlationId: string; roomCode: string } // Host only
  | { type: "SEND_CHAT_MESSAGE"; correlationId: string; roomCode: string; message: string }
  | { type: "SEND_EMOJI_REACTION"; correlationId: string; roomCode: string; emojiId: string }
  | { type: "VOICE_SIGNAL"; correlationId: string; roomCode: string; targetUserId: string; signal: object }
  | { type: "GET_TURN_CREDENTIALS"; correlationId: string; roomCode: string }
  | { type: "PING" };
```

### 11.2 Server → Client Discriminated Union
```typescript
export type WSServerMessage =
  | { type: "AUTH_SUCCESS"; userId: string; username: string }
  | { type: "ERROR"; code: string; message: string; correlationId?: string }
  | { type: "ROOM_SNAPSHOT"; room: object }
  | { type: "PLAYER_JOINED"; player: object }
  | { type: "PLAYER_LEFT"; userId: string }
  | { type: "PLAYER_KICKED"; userId: string }
  | { type: "SPECTATOR_JOINED"; spectator: object }
  | { type: "SPECTATOR_LEFT"; userId: string }
  | { type: "MATCH_STARTED"; matchState: MatchState }
  | { type: "ROLL_COMMITMENT"; turnNumber: number; commitmentHash: string }
  | { type: "ROLL_REVEALED"; turnNumber: number; outcome: CellValue; pageNumber: number; seed: string }
  | { type: "MATCH_STATE_SYNC"; matchState: MatchState; events: MatchEvent[] }
  | { type: "MATCH_PAUSED"; disconnectedPlayerId: string; deadline: number }
  | { type: "MATCH_RESUMED"; reconnectedPlayerId: string }
  | { type: "HOST_MIGRATED"; newHostUserId: string; reason: string }
  | { type: "MATCH_COMPLETED"; winnerPlayerId: string; winReason: string }
  | { type: "MATCH_TERMINATED_SERVER_RESTART"; message: string } // ADR-01 Restart notice
  | { type: "TEMPORARY_REPORT_READY"; expiresAt: number }
  | { type: "TEMPORARY_REPORT_DATA"; report: object } // Sent only to host
  | { type: "CHAT_BROADCAST"; senderId: string; username: string; role: string; message: string; timestamp: number }
  | { type: "EMOJI_BROADCAST"; senderId: string; emojiId: string; timestamp: number }
  | { type: "VOICE_SIGNAL_RELAY"; senderUserId: string; signal: object }
  | { type: "TURN_CREDENTIALS"; iceServers: object[] }
  | { type: "PONG" };
```

---

## 12. Server-Authoritative Game Command Execution

```mermaid
sequenceDiagram
    autonumber
    actor Host as Player A (Host - P1)
    actor Target as Player B (P2)
    participant Server as Game Server (Authoritative)
    participant Engine as @pageshooter/game-engine

    Note over Server: Host starts match (5-10 players)
    Host->>Server: START_MATCH { roomCode: "K7M9PX" }
    Server->>Engine: createInitialMatchState(matchId, roomId, randomizedPlayers)
    Engine-->>Server: Returns initial MatchState (v1)
    Server-->>Host: MATCH_STARTED { matchState }
    Server-->>Target: MATCH_STARTED { matchState }

    Note over Server: Turn 1 starts -> Publish Commitment
    Server-->>Host: ROLL_COMMITMENT { turnNumber: 1, commitmentHash: C1 }
    Server-->>Target: ROLL_COMMITMENT { turnNumber: 1, commitmentHash: C1 }

    Host->>Server: ROLL_REQUEST { roomCode: "K7M9PX", expectedVersion: 1 }
    Server->>Server: Verify sender is currentPlayer & version == 1
    Server->>Server: Derive outcome=4, page=24 from S1
    Server->>Engine: applyRoll(state, "p_1", 4, 24)
    Engine-->>Server: Returns nextState (v2) & events
    Server-->>Host: ROLL_REVEALED { turn: 1, outcome: 4, page: 24, seed: S1 }
    Server-->>Host: MATCH_STATE_SYNC { state: nextState, events }
    Server-->>Target: ROLL_REVEALED { turn: 1, outcome: 4, page: 24, seed: S1 }
    Server-->>Target: MATCH_STATE_SYNC { state: nextState, events }
```

---

## 13. Security, Rate-Limiting & Authorization Model

| Category | Policy | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Authentication** | Mandatory JWT on `/ws?token=` | Unauthenticated connections closed with WS code `4401`. |
| **Identity Spoofing** | Reject client-supplied IDs | Commands derive `userId` solely from verified socket token. |
| **Spectator Abuse** | Zero gameplay privileges | `ROLL_REQUEST` or `SHOOT_REQUEST` from spectator yields `SPECTATOR_FORBIDDEN`. |
| **Chat Spam** | Max 1 msg / 2s, max 200 chars | Token-bucket rate limiter; violators muted for 30s. |
| **Emoji Spam** | Max 2 reactions / s | Dropped silently if threshold exceeded. |
| **State Tampering** | Server-authoritative engine | State modified only through pure `applyRoll` / `applyShot` outputs. |
| **RNG Manipulation** | Verifiable commitment-reveal | Hash committed before roll action; seed verified on reveal. |
| **Host Privilege Esc.** | Host-only start, kick, report | Verified against `ephemeralRoom.hostUserId`. |

---

## 14. Zero-Cost Hosting Architecture (₹0 Budget / Free Tiers Only)

PageShooter has an absolute, non-negotiable operational budget of **₹0 per month (0 INR / $0.00)**. Every layer operates within free tiers without payment card registration, trial credits, or billing risk.

### 14.1 Recommended Providers & Free-Plan Limits Matrix

Official documentation verified as of **November 2026**:

| Component | Recommended Provider & Plan | Official Documentation Link | Verified Documented Free Quotas | Estimated Free-Tier Operational Constraints | Credit Card Required? | Inactivity & Sleep Policy |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend & PWA** | **Cloudflare Pages** (Free Plan) | [Cloudflare Pages Limits](https://developers.cloudflare.com/pages/platform/limits/) | • Unlimited monthly bandwidth<br>• Unlimited requests<br>• 500 builds / month<br>• Free custom domain & SSL | Up to 20,000 files / deployment | **NO** | Never sleeps (Global CDN edge) |
| **Real-Time Backend & WS** | **Render** (Free Web Service) | [Render Free Plans](https://render.com/docs/free) | • 750 free instance-hours / month (workspace pool)<br>• 512 MB RAM, 0.1 vCPU<br>• 100 GB outbound bandwidth / month | Usable RAM ~350 MB<br>Ephemeral filesystem | **NO** (via GitHub login) | Spins down after 15 min idle; cold start is 30–50s |
| **PostgreSQL Database** | **Supabase** (Free Tier) | [Supabase Pricing](https://supabase.com/pricing) & [Managing Projects](https://supabase.com/docs/guides/platform/managing-projects#pausing-free-projects) | • 500 MB database storage<br>• 5 GB monthly uncached egress + 5 GB cached egress<br>• 50,000 Monthly Active Users<br>• 2 direct / 15 pooled connections (`pgbouncer`) | Connection pooling required (`pgbouncer` port 6543) | **NO** | **Pauses on insufficient project activity** (unpause via 1-click dashboard) |
| **Authentication (Google)** | **Google Cloud** (OAuth 2.0 Web Client) | [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2) | • Free Client ID & Token Verification<br>• Standard API rate quotas | 10,000+ token verifications / min | **NO** (No billing account needed for OAuth Client ID) | Permanent |
| **Authentication (Password)** | **Self-Hosted Backend** (Native Argon2id) | Local to Fastify | • Unlimited user logins<br>• Zero external service dependency | Tuned for 0.1 vCPU (`timeCost=2, memory=19MB`) | **N/A** | Local to Fastify backend |
| **Voice Media NAT (STUN)** | **Google Public STUN** | `stun:stun.l.google.com:19302` | • Free public STUN server cluster | Fails on Symmetric-to-Symmetric NAT | **NO** | Permanent global infrastructure |
| **Voice Media NAT (TURN Fallback)** | **Metered.ca Open Relay** (Free Tier) | [Metered Open Relay](https://www.metered.ca/tools/openrelay/) | • Provider-controlled free TURN allocation | Subject to provider fair-use bandwidth caps | **NO** (No credit card needed) | Quota stops when monthly allocation reached |
| **DNS & Edge Security** | **Cloudflare** (Free DNS) | [Cloudflare DNS](https://www.cloudflare.com/application-services/products/dns/) | • Unlimited DNS queries<br>• Free DDoS mitigation & TLS certs | Zero latency edge routing | **NO** | Permanent |

---

### 14.2 Render Monthly Instance-Hours & Availability Realities

1. **Workspace-Wide Pool as a Quota Constraint (Not an Uptime Guarantee):**
   - Render allocates **750 instance-hours per calendar month**, and this quota is **shared across the entire workspace**, not per service.
   - A single service running continuously in a 31-day month consumes:
     $$31 \text{ days} \times 24 \text{ hours/day} = 744 \text{ instance-hours}$$
   - This leaves an absolute margin of only **6 hours**.
   - **No Uptime Guarantee:** This calculation defines a **hard quota constraint, NOT a promise of uninterrupted uptime**. Free Render services are explicitly designated for hobby, experimentation, and testing purposes without SLA. Free instances can restart, experience container migration, or suffer temporary downtime at any time.
   - If a second service, a test container, or an abandoned preview deployment exists in the same workspace, or if overlapping rolling builds run, the 750-hour budget will be depleted before month-end, causing Render to **suspend all free services until the next month**.
2. **Operational Rules to Manage Workspace Quota Constraints:**
   - **Strictly One Web Service:** The Render free workspace must contain **only one single active service** (`pageshooter-server`).
   - **Embrace Idle Spin-Down:** External keep-alive pingers (such as UptimeRobot or cron jobs pinging every 5 minutes) **must NOT be used**. Allowing the service to sleep after 15 minutes of inactivity when no games are running is **essential** to conserve instance-hours (e.g. sleeping 8 hours overnight saves 240+ hours per month, providing a massive safety buffer).
   - **In-Game WebSocket Traffic Keeps It Alive:** While a game is active, bidirectional 15-second heartbeat ping/pong frames (`PING`/`PONG`) keep the WebSocket connection active, **preventing the container from spinning down during matches**.

---

### 14.3 Absolute Billing Protection & Zero-Payment Policy

1. **Zero-Payment-Method Policy:**
   - **No credit card, debit card, or payment method will ever be attached to Render, Supabase, Cloudflare, Google Cloud, or Metered.ca.**
2. **Behavior on Quota Exhaustion:**
   - If Render outbound bandwidth (100 GB/month) or instance-hours (750 hours/month) are exhausted:
     - Render automatically **suspends** the free service until the next calendar month.
     - It **cannot charge** because no payment method exists.
     - The web client gracefully detects the HTTP 503 / connection failure and displays:
       > *"The free community game server has reached its monthly bandwidth limit. Matches will resume on the 1st of next month!"*
3. **Third-Party Policy Disclaimer:**
   - While PageShooter guarantees zero recurring cost by attaching no payment details, provider free-tier terms, quotas, and availability are controlled by third parties and may change over time.

---

### 14.4 Supabase Availability & Inactivity Pausing Realities

1. **Insufficient Project Activity Pausing Realities:**
   - Official Supabase documentation defines project pausing in terms of **insufficient project activity** over a rolling window. It is not governed strictly by an absolute 7-day zero-request timer, nor does sending a periodic automated request guarantee immunity from project pausing.
   - If community match activity is dormant for extended periods, Supabase **will pause the database project**.
   - *Recovery Procedure:* Restoring a paused Supabase project requires an administrator to log into the Supabase web dashboard and click "Restore Project" (typically restores in ~1–2 minutes).
   - *Diagnostic Handling:* The backend `/api/health` endpoint detects database connection failures and reports `DATABASE_INACTIVE_OR_PAUSED` with actionable guidance to restore.
2. **Supabase Resource Constraints:**
   - **Storage:** 500 MB (sufficient for ~1.5 million user rows under our ultra-minimal storage policy).
   - **Egress Bandwidth:** **5 GB uncached egress + 5 GB cached egress per month** (10 GB total). With user profile payloads averaging $\approx 300\text{ bytes}$, 5 GB uncached egress supports over 15 million login/auth queries per month.
   - **Connection Pool:** Free tier allows 2 direct connections and 15 pooled connections. All backend database access must use the **pooled connection string (port 6543 via `pgbouncer`)** to prevent connection exhaustion.

---

### 14.5 Capacity: Empirical Phase 6.8 Load Benchmark Plan

Rather than making unverified theoretical claims (such as "20–35 concurrent rooms" or "400,000 matches"), PageShooter defines an **empirical benchmarking milestone in Phase 6.8**:

1. **Benchmark Tool (`tools/multiplayer-load-benchmark.js`):**
   - Headless automated multi-client load generator using Node.js WebSockets.
   - Simulates 1, 5, 10, 15, and 20 concurrent rooms, each populated with 10 simulated active players making rolls and shots, plus 2 spectators sending chat and emoji reactions.
2. **Empirical Metrics to Measure on Live Render Free Deployment:**
   - Container RAM consumption (Resident Set Size vs V8 Heap used) against the 512 MB ceiling.
   - CPU throttling and event-loop lag on Render's 0.1 vCPU.
   - WebSocket message round-trip time (RTT) under concurrency.
   - Connection drop rate under concurrent heartbeat loads.
3. **Dynamic Operational Ceiling:**
   - The server configuration variable `MAX_ACTIVE_ROOMS` will be established based strictly on the empirical threshold where memory remains safely below 400 MB (leaving a 112 MB buffer to prevent OOM termination).

---

## 15. Environment Variables & Secrets Strategy

### 15.1 Backend (`apps/server/.env.example`)
```ini
# Fastify Server
PORT=4000
HOST=0.0.0.0
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173,http://localhost:5175

# Free PostgreSQL (Supabase / Local Docker)
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/pageshooter

# Authentication
JWT_SECRET=super_secret_cryptographic_key_min_32_characters_long
JWT_EXPIRES_IN=7d

# Google OAuth 2.0 Credentials (Free Google Cloud Console)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Metered.ca Free TURN Relay API (Backend Only - Never Exposed to Client)
METERED_API_KEY=your-metered-api-key

# In-Memory Room Limits
WAITING_ROOM_TTL_MS=600000
COMPLETED_ROOM_TTL_MS=600000
RECONNECT_WINDOW_MS=60000
```

### 15.2 Frontend (`apps/web/.env.example`)
```ini
# API & WebSocket Gateways
VITE_API_URL=http://localhost:4000
VITE_WS_URL=ws://localhost:4000/ws

# Google OAuth Client ID
VITE_GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
```

---

## 16. Preservation of Offline Mode & Parity Strategy

1. **Independent IndexedDB:** Offline matches continue using `pageshooter_offline_db` (`current_match`, `current_match_characters`) via [`apps/web/src/storage/db.ts`](file:///c:/Games/PageShooter/apps/web/src/storage/db.ts). It has **zero network dependencies**.
2. **Mode Navigation:** App header/menu will offer:
   - **Offline Storybook Mode:** Instant local play, pass-and-play, offline IndexedDB persistence.
   - **Online Multiplayer (Private Rooms):** Sign-in required, join room via 6-character code.
3. **Identical Visual Assets:** Hand-drawn stickmen, katana/reaper animations, and Web Audio synthesizers are 100% shared.

---

## 17. Phase 6 Implementation Roadmap (6.2 → 6.8)

| Milestone | Title | Scope & Deliverables |
| :--- | :--- | :--- |
| **Phase 6.1 (Done)** | **Backend Architecture Foundation** | Revised architecture spec, ultra-minimal DB schema, base-32 codes, verifiable randomness, zero-cost topology. |
| **Phase 6.2** | **Server Scaffolding & DB Setup** | Create `apps/server`, Fastify server, Drizzle ORM `users` schema, migrations, local/free-tier connection. |
| **Phase 6.3** | **Authentication Service** | Google OAuth verification, Argon2id passwords, JWT issuance, case-insensitive usernames, 30-day rename cooldown. |
| **Phase 6.4** | **Room & Spectator System** | In-memory `RoomManager`, 6-char base-32 codes, 5–10 player limits, host controls, spectator separation, 10-min TTL. |
| **Phase 6.5** | **Authoritative Game Loop & Verifiable RNG** | Wire `@pageshooter/game-engine`, commitment-reveal protocol, roll & shoot validation, state broadcasting. |
| **Phase 6.6** | **Reconnection & Host Migration** | 60s disconnect pause, waiting-room and active-match host migration, temporary report download for host. |
| **Phase 6.7** | **Web Client Integration & UI** | Online mode switch, auth modal, lobby room screen, chat/emoji HUD, WebRTC voice mesh signaling + TURN fallback. |
| **Phase 6.8** | **Multi-Client Verification & Load Acceptance** | Automated headless 10-client simulation, host migration test, spectator test, empirical capacity benchmarking. |

---

## 18. Remaining Risks, Limitations & Consistency Checklist

### 18.1 Accepted Operational Limitations & Risks
1. **Render Free-Tier Volatility & Quota Constraint (ADR-01):** The 744-hour monthly calculation is a workspace-wide quota limit, not an uptime guarantee. Free Render services can restart, migrate, or experience downtime without SLA. Active online matches are terminated on restart; reconnecting clients receive `MATCH_TERMINATED_SERVER_RESTART` and must start a new room. This is accepted in exchange for strict compliance with the ultra-minimal storage policy.
2. **Cold Starts on Inactive Lobbies:** When no matches have run for >15 minutes, initial connection experiences a 30–50s cold start while Render boots the free container.
3. **Supabase Inactivity Pausing:** Supabase pauses free-tier database projects based on platform telemetry of insufficient project activity over rolling windows (sending an occasional ping does not guarantee immunity). An administrator must log into the Supabase dashboard to unpause it.
4. **Voice Mesh Device Scaling & Practical Ceiling:** Quadratic P2P WebRTC growth ($N \times (N-1)/2 \rightarrow 105$ connections across 15 participants) may degrade audio quality or throttle CPU on lower-end mobile devices. The practical participant ceiling is deferred to the Phase 6.8 empirical benchmark. Text chat remains the primary zero-overhead channel.
5. **Commitment-Reveal Abort Limitation (Section 10.2):** If the server restarts between commitment broadcast and seed reveal, clients cannot mathematically verify whether the abort was an infrastructure restart or an operator abort. Accepted as an in-memory volatility constraint.
6. **Provider Terms Subject to Change:** Free-tier quotas on Render, Supabase, Cloudflare, and Metered.ca are controlled by external vendors and are not permanent guarantees. Zero recurring cost is enforced by attaching **no payment methods**.

### 18.2 Consistency Checklist & Final Freeze Sign-Off
- [x] All references to `ephemeral_rooms` or database match snapshots deleted.
- [x] In-memory only storage policy for active matches enforced (ADR-01).
- [x] Database schema inconsistency resolved: strictly single `users` table (Section 4.1); no `auth_accounts` table.
- [x] Waiting-room host migration to earliest-joined player specified (ADR-02).
- [x] Active-match host migration preserved under existing 60-second rule (ADR-02).
- [x] Google STUN + Metered.ca TURN fallback specified with ephemeral credentials (ADR-03).
- [x] Voice available to both active players and spectators (spectators muted by default).
- [x] Metered.ca TURN quota enforcement specified (`totalBandwidthBytes`, 15-min polling, 70% warn, 85% shutdown, fail-closed on API error, no top-up/card).
- [x] TURN verification safeguard gating voice until Phase 6.7 specified (Section 9.4); voice relay remains permanently disabled if API quota enforcement cannot be trusted.
- [x] Quadratic voice mesh scaling documented (105 connections at 15 participants) and practical ceiling deferred to Phase 6.8 benchmark.
- [x] EphemeralRoom expiry semantics clarified (`expiresAt: number | null`; 10-minute TTL strictly for WAITING and COMPLETED, null for ACTIVE).
- [x] Randomness guarantee boundary clarified (Section 10): prevents post-commit outcome substitution, cannot prevent pre-reveal operator aborts.
- [x] Commitment-reveal abort limitation documented in Section 10.2 as accepted in-memory volatility constraint.
- [x] Supabase free-tier limits updated to 5 GB uncached + 5 GB cached egress; pausing defined by insufficient project activity.
- [x] Render 744h/750h constraint documented as workspace quota limit, not uptime guarantee; idle spin-down embraced; external pingers forbidden.
- [x] Unverified capacity claims replaced with Phase 6.8 empirical benchmark plan.
- [x] Strict zero-payment-method policy documented for absolute billing protection.
- [x] Offline IndexedDB persistence preserved without modification.
- [x] Phase 6.1 formally frozen under Version 3.2.0.
- [x] Zero application source code modified; Phase 6.2 has not started.
