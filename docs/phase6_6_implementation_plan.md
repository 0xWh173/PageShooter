# PageShooter — Phase 6.6 Implementation Plan: WebSocket Connection & Real-Time Sync (Final Hardened Specification)

**Specification Source:** `docs/phase6_1_multiplayer_backend_architecture.md` (Frozen v3.2.0)  
**Target Milestone:** Phase 6.6 — WebSocket Connection & Real-Time Sync  
**Document Status:** Final Pre-Implementation Gate Specification (Pending Authorization)  
**Author:** Antigravity (Google DeepMind pair programming assistant)  
**Operating Budget:** ₹0 (Preserved Zero-Cost Guarantee)

---

## 1. Executive Summary & Objective

Phase 6.6 transitions PageShooter from a request/response REST model to an **authoritative, real-time, event-driven WebSocket architecture**.

It establishes:
1. **Persistent Full-Duplex Connection:** Authenticated bidirectional communication on `/ws?token=<JWT>` via `@fastify/websocket`, preserving the existing 7-day JWT authentication policy (`JWT_EXPIRES_IN=7d`).
2. **Deterministic Server Restart vs Missing-Room Detection:** Reliable process-generation tracking (`serverInstanceId`) distinguishing confirmed server restarts (ADR-01) from normal room expirations or deletions without persistent database state.
3. **Application Log Redaction:** Strict query-string token redaction in Fastify Pino logs and `Referrer-Policy: no-referrer`.
4. **Deterministic Multi-Player Disconnection Lifecycle:** Independent 60-second timers per disconnected player, pause coordination, mandatory pending shot cancellation with zero bullet retention, turn advancement, host migration, and victory evaluation.
5. **Multi-Tab Socket Ownership:** Atomic socket re-binding preventing phantom disconnects or race conditions when duplicate tabs connect.
6. **Real-Time State Synchronization:** Broadcast of room snapshots, player joins/leaves, roll commitments, roll revelations, and match state updates to all room participants.
7. **Connection Liveness Heartbeat:** Bidirectional 15-second heartbeat (`PING`/`PONG`) for TCP dead-peer detection and connection health (explicitly decoupled from hosting availability).
8. **Headless Client Transport Layer:** A modular, headless client transport in `@pageshooter/web` capable of socket management, typed dispatch, state synchronization, and client-side cryptographic verification, completely decoupled from React presentation UI.

All real-time state remains **RAM-only (ADR-01)**, preserving the single `users` database table invariant and the ₹0 budget.

---

## 2. Architecture Review: Protocol & State Integration

```mermaid
sequenceDiagram
    autonumber
    actor Client as Headless Client Transport
    participant Gateway as WS Gateway (/ws?token)
    participant Broadcaster as Room Broadcaster
    participant ReconnectMgr as Reconnect Manager
    participant RoomMgr as RoomManager & Phase 6.5 Engine

    Client->>Gateway: Connect /ws?token=<JWT>
    Gateway->>Gateway: Verify JWT (7-day policy) & Redact URL in Logs
    alt Invalid or Expired Token at Handshake
        Gateway-->>Client: Close socket (Code 4401: Unauthorized)
    else Valid Token
        Gateway-->>Client: AUTH_SUCCESS { userId, username, serverInstanceId }
    end

    Client->>Gateway: JOIN_ROOM { correlationId, roomCode }
    Gateway->>RoomMgr: joinAsPlayer(roomCode, user)
    RoomMgr-->>Gateway: EphemeralRoom & Participant
    Gateway->>Broadcaster: Subscribe socket to roomCode
    Gateway-->>Client: ROOM_SNAPSHOT { room, serverInstanceId }
    Broadcaster-->>Room Participants: PLAYER_JOINED { player }

    opt Gameplay Action (Roll Request)
        Client->>Gateway: ROLL_REQUEST { correlationId, roomCode, expectedStateVersion }
        Gateway->>RoomMgr: executeRoll(roomCode, userId, options)
        RoomMgr-->>Gateway: { state, events, rollResult, nextCommitment }
        Broadcaster-->>Room Participants: ROLL_REVEALED { turnNumber, outcome, pageNumber, seed }
        Broadcaster-->>Room Participants: MATCH_STATE_SYNC { matchState, events }
        opt If Next Turn Awaiting Roll
            Broadcaster-->>Room Participants: ROLL_COMMITMENT { turnNumber, commitmentHash }
        end
    end

    opt Unexpected Socket Disconnection
        Gateway->>ReconnectMgr: onSocketDisconnect(socketId, userId, roomCode)
        alt Socket is obsolete (superseded by multi-tab connection)
            ReconnectMgr-->>Gateway: Ignore (No-op; active socket remains intact)
        else Disconnected participant is Spectator
            ReconnectMgr->>RoomMgr: removeSpectator(userId)
            Broadcaster-->>Room Participants: SPECTATOR_LEFT { userId }
        else Disconnected participant is Active Player
            ReconnectMgr->>RoomMgr: pauseMatch(matchState, disconnectedPlayerId)
            Broadcaster-->>Room Participants: MATCH_PAUSED { disconnectedPlayerId, deadline: now + 60s }
            Note over ReconnectMgr: Arm individual 60s timer for disconnectedPlayerId
            alt Player Reconnects Within 60s
                Client->>Gateway: RECONNECT_MATCH { correlationId, roomCode, lastKnownVersion, serverInstanceId }
                ReconnectMgr->>RoomMgr: resumeMatch(matchState, reconnectedPlayerId)
                Broadcaster-->>Room Participants: MATCH_RESUMED { reconnectedPlayerId }
                Gateway-->>Client: MATCH_STATE_SYNC { matchState, events }
            else 60s Timer Expires
                ReconnectMgr->>RoomMgr: eliminatePlayer & checkTransitions()
                Note over RoomMgr: Cancel pending shot, 0 bullets retained, advance turn, migrate host, eval win
                Broadcaster-->>Room Participants: HOST_MIGRATED or MATCH_COMPLETED
            end
        end
    end
```

### 2.1 Complete Wire Protocol (Discriminated Unions)

#### Client -> Server Messages (`WSClientMessage`)
Defined in Section 11.1 of Architecture v3.2.0:

| Message Type | Required Fields | Authorization | Purpose |
|---|---|---|---|
| `JOIN_ROOM` | `correlationId`, `roomCode` | Authenticated Player | Joins waiting room as active player (up to 10) |
| `JOIN_AS_SPECTATOR` | `correlationId`, `roomCode` | Authenticated Spectator | Joins room as spectator (unlimited slots) |
| `LEAVE_ROOM` | `correlationId`, `roomCode` | Any Room Member | Voluntarily leaves room; triggers host migration if host in waiting room |
| `KICK_PLAYER` | `correlationId`, `roomCode`, `targetUserId` | Host Only | Kicks participant from waiting room |
| `START_MATCH` | `correlationId`, `roomCode` | Host Only | Starts match with 5–10 players; broadcasts Turn 1 commitment |
| `ROLL_REQUEST` | `correlationId`, `roomCode`, `expectedStateVersion` | Current Player Only | Triggers authoritative roll; reveals turn seed |
| `SHOOT_REQUEST` | `correlationId`, `roomCode`, `targetPlayerId`, `targetCellValue`, `expectedStateVersion` | Current Player (Pending Shot) | Fires at opponent cell; consumes bullet |
| `RECONNECT_MATCH` | `correlationId`, `roomCode`, `lastKnownVersion`, `serverInstanceId?` | Disconnected Player | Reclaims player slot within 60s disconnect window |
| `DOWNLOAD_MATCH_REPORT`| `correlationId`, `roomCode` | Host Only | Downloads temporary match report during 10-minute post-match window |
| `SEND_CHAT_MESSAGE` | `correlationId`, `roomCode`, `message` | Any Room Member | Sends text message (max 200 chars, rate-limited) |
| `SEND_EMOJI_REACTION` | `correlationId`, `roomCode`, `emojiId` | Any Room Member | Sends animated emoji reaction (whitelisted, rate-limited) |
| `PING` | *(None)* | Any Connected Socket | 15s connection liveness heartbeat frame |

*(Note: `VOICE_SIGNAL` and `GET_TURN_CREDENTIALS` are declared in the protocol type union but their signaling and relay logic is explicitly gated and deferred to Phase 6.7 per Section 9.4).*

#### Server -> Client Messages (`WSServerMessage`)
Defined in Section 11.2 of Architecture v3.2.0:

| Message Type | Payload Fields | Recipient | Trigger Event |
|---|---|---|---|
| `AUTH_SUCCESS` | `userId`, `username`, `serverInstanceId` | Connecting Socket | Sent immediately upon handshake verification |
| `ERROR` | `code`, `message`, `correlationId?` | Requesting Socket | Invalid command, auth failure, rate limit, rule error |
| `ROOM_SNAPSHOT` | `room: PublicRoomState`, `serverInstanceId: string` | Requesting Socket | Sent upon joining room or reconnecting |
| `PLAYER_JOINED` | `player: RoomParticipant` | All Room Members | New player joins waiting room |
| `PLAYER_LEFT` | `userId: string` | All Room Members | Player leaves room |
| `PLAYER_KICKED` | `userId: string` | All Room Members | Host kicks participant |
| `SPECTATOR_JOINED`| `spectator: RoomParticipant` | All Room Members | Spectator joins room |
| `SPECTATOR_LEFT` | `userId: string` | All Room Members | Spectator leaves room |
| `MATCH_STARTED` | `matchState: MatchState` | All Room Members | Match transitions to `ACTIVE` |
| `ROLL_COMMITMENT` | `turnNumber: number`, `commitmentHash: string` | All Room Members | Pre-roll SHA-256 commitment published |
| `ROLL_REVEALED` | `turnNumber`, `outcome`, `pageNumber`, `seed` | All Room Members | Roll executed; secret seed revealed |
| `MATCH_STATE_SYNC`| `matchState: MatchState`, `events: MatchEvent[]` | All Room Members | Full state sync after roll, shot, or reconnect |
| `MATCH_PAUSED` | `disconnectedPlayerId`, `deadline: number` | All Room Members | Active player disconnects; 60s countdown starts |
| `MATCH_RESUMED` | `reconnectedPlayerId: string` | All Room Members | Player reconnects within 60s; match unpauses |
| `HOST_MIGRATED` | `newHostUserId: string`, `reason: string` | All Room Members | Host drops or is eliminated; host privileges migrate |
| `MATCH_COMPLETED` | `winnerPlayerId: string`, `winReason: string` | All Room Members | Victory condition reached (`LAST_PLAYER_STANDING` or `NO_VALID_TARGETS`) |
| `MATCH_TERMINATED_SERVER_RESTART` | `message: string` | Reconnecting Sockets | ADR-01 confirmed process restart notification |
| `TEMPORARY_REPORT_READY` | `expiresAt: number` | All Room Members | Post-match 10-minute report window open |
| `TEMPORARY_REPORT_DATA` | `report: object` | Host Socket Only | Full match summary data |
| `CHAT_BROADCAST` | `senderId`, `username`, `role`, `message`, `timestamp` | All Room Members | Valid chat message delivered |
| `EMOJI_BROADCAST` | `senderId`, `emojiId`, `timestamp` | All Room Members | Valid emoji reaction delivered |
| `PONG` | *(None)* | Requesting Socket | Connection liveness response |

---

## 3. Detailed Technical Resolutions

### 3.1 Preserving Existing Phase 6.3 JWT Policy & Authentication Boundaries

1. **Policy Preservation:** Phase 6.3 established a **7-day JWT expiry** (`JWT_EXPIRES_IN=7d`), configured in [`apps/server/src/config.ts`](file:///c:/Games/PageShooter/apps/server/src/config.ts#L20) and Section 15 of Architecture v3.2.0. This 7-day policy is strictly preserved. No 15-minute token change is introduced.
2. **Handshake Verification Model:**
   - In accordance with Architecture Section 13, WebSocket authentication occurs **at connection handshake time** via `/ws?token=<JWT>`.
   - The token must be valid, unexpired (within 7 days of issuance), and signed with `config.JWT_SECRET`.
   - If the token is expired, tampered, or missing at handshake time, the connection is rejected immediately with WebSocket close code `4401` (`Unauthorized`).
3. **Mid-Connection Lifetime Behavior:**
   - Once successfully established, an active WebSocket connection is persistent and authenticated for its lifetime.
   - The server **does not** terminate an active in-game WebSocket simply because the token expires while a match is ongoing.
   - We explicitly do not claim that token expiry limits an already-established open socket.
   - If an active socket disconnects and attempts to reconnect after 7 days, the handshake will fail with code `4401`, requiring the client to re-authenticate or refresh its session.
4. **Log Redaction & Infrastructure Exposure Boundaries:**
   - **Application Logging:** Fastify's Pino logger is configured with a serializer that redacts the token query parameter: `url.replace(/([?&])token=[^&]*/, "$1token=[REDACTED]")`. Raw query strings are never logged by server application code.
   - **Infrastructure Exposure Disclosure:** Because browser W3C `WebSocket` APIs do not support custom request headers, the query string is transmitted during the initial HTTP upgrade. Third-party reverse proxies or platform ingress layers (Render, Cloudflare) may record URLs if full access path logging is enabled on their edge. This is an accepted platform characteristic of browser-native WebSocket handshakes, mitigated by strict `Referrer-Policy: no-referrer` via `@fastify/helmet`.

---

### 3.2 Server Restart Detection vs Missing-Room Handling

A missing room (`roomManager.getRoomByCode(roomCode) === null`) alone **does not prove that the server restarted**. It can also indicate:
- The room expired naturally (10-minute waiting or completed TTL sweeper).
- The host manually left, triggering empty room deletion.
- All players left.
- An invalid or mistyped room code.

To reliably identify true server restarts under ADR-01 without adding persistent database tables, Phase 6.6 introduces an in-memory **Process Generation Identifier**:

#### 1. Server Process Generation Tracking
- When the Fastify server boots, it generates an ephemeral in-memory UUID:
  ```typescript
  export const serverInstanceId = crypto.randomUUID();
  ```
- This value lives solely in RAM. It resets whenever the container restarts or redeploys.
- The server includes `serverInstanceId` in `AUTH_SUCCESS` and `ROOM_SNAPSHOT`.
- The client's `WebSocketClient` stores the current `serverInstanceId` alongside its active room session.

#### 2. Deterministic Reconnection Branching
When a client sends `RECONNECT_MATCH { correlationId, roomCode, lastKnownVersion, serverInstanceId }` and the room is missing in memory:
1. **Branch A — Confirmed Server Restart (`client.serverInstanceId !== currentServerInstanceId`):**
   - The client connected to a server instance with a different boot ID than the one it was playing on.
   - A server restart/container redeployment is mathematically confirmed.
   - Server returns:
     ```json
     {
       "type": "MATCH_TERMINATED_SERVER_RESTART",
       "message": "The match ended because the game server restarted or was redeployed. Please create or join a new room."
     }
     ```
2. **Branch B — Unavailable Match / Expired Room (`client.serverInstanceId === currentServerInstanceId` or untracked):**
   - The server did not restart (the boot ID is identical).
   - The room was removed due to TTL expiration, abandonment, or deletion.
   - Server returns:
     ```json
     {
       "type": "ERROR",
       "code": "MATCH_UNAVAILABLE",
       "message": "This match is no longer available. The room has expired or ended.",
       "correlationId": "..."
     }
     ```

#### 3. Client Recovery Flow
In both Branch A and Branch B, the client transport layer:
- Wipes the local active match state replica.
- Halts all reconnection retry loops.
- Emits an unrecoverable match event (`matchTerminated` or `matchUnavailable`).
- Returns the player cleanly to the main lobby flow with an accurate, unambiguous user notification.

---

### 3.3 Multiple Simultaneous Disconnects & Mandatory Pending Shot Handling

The multi-player disconnect lifecycle preserves all Phase 6.5 engine rules and handles complex edge cases deterministically.

```
Scenario:
1. P2 disconnects (match pauses, deadline_P2 armed).
2. P4 disconnects while paused (deadline_P4 armed independently).
3. P2 had a pending mandatory shot when disconnecting.
4. P2's 60s timer expires.
5. P4 remains disconnected.
6. P4's 60s timer expires later.
```

#### Step-by-Step Resolution Rules

1. **Initial Disconnect (P2 drops):**
   - Match transitions from `ACTIVE` to `PAUSED`.
   - `P2.connected = false`.
   - `deadline_P2 = now + 60_000` is computed.
   - In-memory tracker records: `room.disconnectedPlayers.set(P2.id, { deadline: deadline_P2, timer: timer_P2 })`.
   - Server broadcasts `MATCH_PAUSED { disconnectedPlayerId: P2.id, deadline: deadline_P2 }`.
2. **Second Disconnect (P4 drops while paused):**
   - Match **remains PAUSED**.
   - `P4.connected = false`.
   - `deadline_P4 = now + 60_000` is computed independently.
   - In-memory tracker records: `room.disconnectedPlayers.set(P4.id, { deadline: deadline_P4, timer: timer_P4 })`.
   - Server broadcasts `MATCH_PAUSED { disconnectedPlayerId: P4.id, deadline: deadline_P4 }`.
3. **P2's 60-Second Timer Expires (P4 still disconnected):**
   - P2's timer callback fires.
   - **Elimination:** P2 is marked `status = "ELIMINATED"`. All 5 of P2's cells are marked `destroyed = true`. Server emits `PLAYER_ELIMINATED { targetPlayerId: P2.id }`.
   - **Pending Shot Cancellation & Zero Bullet Retention:**
     - If P2 had a pending mandatory shot (`turn.pendingShot === true`, `currentPlayerId === P2.id`), the shot entitlement is **atomically cancelled**:
       `state.turn.pendingShot = false;`
       `state.turn.rolledCell = null;`
     - P2 is eliminated and **cannot execute a shot** (`applyShot` rejects eliminated players with `INVALID_TARGET`).
     - **No bullet is retained or banked** by P2 or transferred to any other player.
   - **Turn Advancement:**
     - Because it was P2's turn (`currentPlayerId === P2.id`), the turn advances cyclically via `advanceToNextPlayer()` to the next active player (e.g. P3), resetting turn phase to `AWAITING_ROLL` with `pendingShot = false`.
     - If it was not P2's turn, `currentPlayerId` remains unchanged.
   - **Host Migration:**
     - If P2 was the room host, host privileges transfer cyclically to the lowest-numbered surviving player position ($P1 \dots Pn$), broadcasting `HOST_MIGRATED { newHostUserId, reason: "ACTIVE_MATCH_TIMEOUT" }`.
   - **Victory Check:**
     - Count surviving active players (`status === "ACTIVE"`):
       - If $\le 1$ player survives: Declare `LAST_PLAYER_STANDING` victory immediately. Clear all remaining timers (including P4's timer). Complete the match (`phase = "COMPLETED"`, 10-minute TTL set), and broadcast `MATCH_COMPLETED`.
   - **Pause State Invariant:**
     - If $\ge 2$ players survive, check `room.disconnectedPlayers`. Since P4 is still disconnected, the match **REMAINS PAUSED**.
     - Broadcast updated `MATCH_STATE_SYNC` detailing P2's elimination and the updated turn.
4. **P4's 60-Second Timer Later Expires:**
   - P4's timer callback fires.
   - **Elimination:** P4 marked `status = "ELIMINATED"`, cells destroyed.
   - **Turn & Host Check:** If it was P4's turn, advance turn. If P4 was host, migrate host.
   - **Victory Check:**
     - If $\le 1$ player survives: Declare `LAST_PLAYER_STANDING` victory immediately and complete match.
   - **Match Resumption:**
     - If $\ge 2$ active players survive, check `room.disconnectedPlayers`.
     - With both P2 and P4 resolved, `room.disconnectedPlayers.size === 0`.
     - The match transitions to `ACTIVE`, clearing `disconnectDeadline`.
     - If current turn is `AWAITING_ROLL`, generate fresh turn commitment.
     - Server broadcasts `MATCH_RESUMED { reconnectedPlayerId: "TIMEOUT_RESOLVED" }`.
     - Server broadcasts `MATCH_STATE_SYNC` and `ROLL_COMMITMENT`.
     - Gameplay proceeds normally with remaining players.
5. **Alternative Branch: P4 Reconnects Before Timer Expires:**
   - P4 sends `RECONNECT_MATCH`.
   - Clear P4's timer handle and remove from `room.disconnectedPlayers`.
   - `P4.connected = true`.
   - Since P2 is already eliminated and P4 reconnected, `room.disconnectedPlayers.size === 0`.
   - The match transitions to `ACTIVE`. Server broadcasts `MATCH_RESUMED { reconnectedPlayerId: P4.id }` and `MATCH_STATE_SYNC`.

---

### 3.4 Multi-Tab Socket Replacement: Atomic Ownership

#### 1. The Race Condition Threat
A player on Tab 1 (`Socket_A`) opens Tab 2 (`Socket_B`) on the same room.
If `Socket_B` connects and supersedes `Socket_A`, the server closes `Socket_A`.
When `Socket_A`'s `close` event fires asynchronously in the event loop, a naive close handler would observe a disconnect for that user and mistakenly mark the player disconnected, arming a 60-second pause timer despite Tab 2 being active and healthy.

#### 2. Atomic Re-Binding Protocol
To prevent phantom disconnects, socket ownership is bound explicitly via unique socket IDs:

```typescript
// 1. In RoomParticipant:
export interface RoomParticipant {
  userId: string;
  socketId: string | null;
  connected: boolean;
  ...
}

// 2. On New Connection (Socket_B):
function bindParticipantSocket(room: EphemeralRoom, userId: string, newSocketId: string, newSocket: WebSocket) {
  const participant = room.players.get(userId) || room.spectators.get(userId);
  if (!participant) return;

  const oldSocketId = participant.socketId;
  participant.socketId = newSocketId;
  participant.connected = true;

  if (oldSocketId && oldSocketId !== newSocketId) {
    const oldSocket = roomBroadcaster.getSocket(oldSocketId);
    if (oldSocket && oldSocket.readyState === WebSocket.OPEN) {
      // Mark old socket as superseded before closing so its close handler is a no-op
      roomBroadcaster.markSocketSuperseded(oldSocketId);
      oldSocket.close(4409, "Session Overwritten by Newer Tab");
    }
  }
}

// 3. On Socket Close (Socket_A):
function handleSocketClose(socketId: string, userId: string, roomCode: string) {
  // Check if this socket was superseded by a newer tab
  if (roomBroadcaster.isSocketSuperseded(socketId)) {
    roomBroadcaster.cleanupSuperseded(socketId);
    return; // NO-OP: Do not mark participant disconnected! Do not pause match!
  }

  const room = roomManager.getRoomByCode(roomCode);
  const participant = room?.players.get(userId) || room?.spectators.get(userId);

  // Strict ownership check: Only process disconnect if closing socket is CURRENT registered socket
  if (participant && participant.socketId === socketId) {
    participant.socketId = null;
    participant.connected = false;
    // Initiate normal disconnect / 60s pause handling
  }
}
```

This guarantees that:
- Closing an obsolete socket never pauses a match or marks a player disconnected.
- Duplicate disconnect timers are impossible.
- Exactly one socket holds ownership of the player slot at any given time.

---

## 4. Minimum Client Transport Requirements (Phase 6.6 vs Phase 6.7)

Phase 6.6 implements a **headless client transport module** in `@pageshooter/web`:

```
apps/web/src/network/
  ├── websocketClient.ts       (Headless WS client: connection, auth, typed send/receive, liveness)
  ├── syncStore.ts             (In-memory state store applying ROOM_SNAPSHOT and MATCH_STATE_SYNC)
  └── clientVerification.ts    (Client-side cryptographic verification of revealed seeds vs commitments)
```

### Decoupling Boundary

| Capability | Phase 6.6 (Headless Transport) | Phase 6.7 (React UI Integration) |
|---|---|---|
| **Socket Connection** | `WebSocketClient.connect(url, token)` | `useWebSocket()` React hook & connection status badge |
| **Authentication** | Handshake query token & `AUTH_SUCCESS` handling | Login modal, Google Sign-In button, auth state persistence |
| **Room Synchronization** | Receives `ROOM_SNAPSHOT`, parses with Zod | Lobby screen, player grid, ready buttons, kick buttons |
| **Gameplay Messaging** | `sendRollRequest()`, `sendShootRequest()` | 3D book flip animation, target click handlers, crosshairs |
| **Cryptographic Proofs** | Immediate client-side SHA-256 & HMAC verification | "Fair Play Verified" UI checkmark & proof inspection modal |
| **Reconnection Handling** | Auto-reconnect backoff & `RECONNECT_MATCH` dispatch | 60-second countdown timer bar & "Reconnecting..." overlay |
| **Chat & Emoji** | `sendChatMessage()`, `sendEmojiReaction()` | Floating emoji animation canvas, slide-out chat drawer |
| **Voice Signaling** | *Not implemented (Phase 6.7)* | WebRTC peer mesh, mic capture, push-to-talk button |

---

## 5. File Manifest & Implementation Plan

### 5.1 Dependencies
- **`@fastify/websocket` (`^11.0.2`):** Fastify v5 official WebSocket plugin.

### 5.2 File Structure

```
packages/shared/
  └── src/
      ├── index.ts                          (Add WSClientMessage, WSServerMessage, Zod schemas)
      └── wsSchemas.ts                      (Strict Zod validation schemas for all wire messages)

apps/server/
  ├── package.json                          (Add @fastify/websocket)
  ├── src/
  │   ├── server.ts                         (Register @fastify/websocket, logger redaction, serverInstanceId)
  │   ├── rooms/
  │   │   └── roomManager.ts                (Add socket binding, multi-timer tracking, host migration)
  │   └── ws/
  │       ├── gateway.ts                    (/ws connection handler, token auth, close codes, heartbeat)
  │       ├── roomBroadcaster.ts            (In-memory socket subscriptions, supersession tracking, broadcasts)
  │       ├── dispatcher.ts                 (Zod message validation, rate limiting, routing to roomManager)
  │       └── reconnectManager.ts           (60s timers, multi-player disconnect coordination, restart notice)
  └── test/
      ├── wsConnection.test.ts              (WS handshake, JWT validation, 4401 rejection, PING/PONG, frame limits)
      ├── wsRoomSync.test.ts                (JOIN_ROOM, SPECTATOR, KICK, LEAVE, chat/emoji rate limits)
      ├── wsGameplay.test.ts                (START_MATCH, ROLL_REQUEST, SHOOT_REQUEST, commitment reveal broadcast)
      └── wsReconnect.test.ts               (60s pause, pending shot cancellation, multi-disconnect, multi-tab, restart detect)

apps/web/
  └── src/
      └── network/
          ├── websocketClient.ts            (Headless client transport: connect, auth, typed send, liveness)
          ├── syncStore.ts                  (In-memory state sync store applying snapshots and events)
          └── clientVerification.ts         (Client-side verification of revealed seeds vs commitments)
```

---

## 6. Acceptance Criteria & Test Matrix

The test suite will execute against live Fastify WebSocket servers using real WebSocket clients:

### 1. `wsConnection.test.ts` (Handshake, Auth & Liveness)
- Connect without token $\implies$ socket closed with code `4401`.
- Connect with expired or tampered token $\implies$ socket closed with code `4401`.
- Connect with valid 7-day JWT $\implies$ receives `AUTH_SUCCESS { userId, username, serverInstanceId }`.
- Verify server logs do not contain raw JWT strings (Pino URL redaction test).
- Send `PING` $\implies$ receives `PONG`.
- Send frame $> 4\text{ KB}$ $\implies$ socket closed with code `1009`.

### 2. `wsRoomSync.test.ts` (Room Actions, Authorization & Rate Limits)
- `JOIN_ROOM` with valid code $\implies$ sender receives `ROOM_SNAPSHOT`, others receive `PLAYER_JOINED`.
- `JOIN_AS_SPECTATOR` $\implies$ sender receives `ROOM_SNAPSHOT`, others receive `SPECTATOR_JOINED`.
- Spectator attempts `KICK_PLAYER` $\implies$ rejected with `NOT_HOST`.
- Non-host player attempts `START_MATCH` $\implies$ rejected with `NOT_HOST`.
- `SEND_CHAT_MESSAGE` $\implies$ broadcasts `CHAT_BROADCAST`.
- Send message $> 200$ chars $\implies$ rejected with `VALIDATION_ERROR`.
- Send $> 1$ message per 2s $\implies$ 30-second mute applied (`MUTED`).
- `SEND_EMOJI_REACTION` with valid ID $\implies$ broadcasts `EMOJI_BROADCAST`.
- Send invalid emoji ID $\implies$ rejected with `VALIDATION_ERROR`.
- Send $> 2$ emojis per 1s $\implies$ dropped silently.

### 3. `wsGameplay.test.ts` (Authoritative Game Loop & Commitment)
- Host sends `START_MATCH` with 5 players $\implies$ broadcasts `MATCH_STARTED` and initial `ROLL_COMMITMENT`.
- Non-active player sends `ROLL_REQUEST` $\implies$ rejected with `NOT_YOUR_TURN`.
- Spectator sends `ROLL_REQUEST` $\implies$ rejected with `SPECTATOR_FORBIDDEN`.
- Current player sends `ROLL_REQUEST` $\implies$ broadcasts `ROLL_REVEALED` (with seed), `MATCH_STATE_SYNC`, and next `ROLL_COMMITMENT`.
- Client verifies cryptographic proof locally using `clientVerification.ts` $\implies$ verification succeeds.
- Current player sends `SHOOT_REQUEST` with invalid target $\implies$ rejected with `INVALID_TARGET`.
- Valid `SHOOT_REQUEST` $\implies$ broadcasts target cell destroyed, kills incremented, turn advanced.
- Victory detection $\implies$ broadcasts `MATCH_COMPLETED`.

### 4. `wsReconnect.test.ts` (Disconnects, Multi-Tab, Multi-Disconnect, Shot Cancel & Server Restart)
- Active player drops $\implies$ match pauses, broadcasts `MATCH_PAUSED { deadline }`.
- Spectator drops $\implies$ match does **not** pause; broadcasts `SPECTATOR_LEFT`.
- Player reconnects within 60s with `RECONNECT_MATCH` $\implies$ match resumes, broadcasts `MATCH_RESUMED`, syncs state.
- **Multi-Tab Replacement Test:** Opening Tab 2 re-binds player socket; closing Tab 1 does **not** trigger disconnect or pause match.
- **Pending Mandatory Shot Cancellation Regression Test:**
  - Player with pending mandatory shot disconnects.
  - 60s timeout expires $\implies$ player eliminated, `pendingShot` is cancelled (`pendingShot === false`), 0 bullets retained.
  - Turn advances cyclically to next active player.
  - Eliminated player cannot shoot; no subsequent player receives or retains the bullet.
- **Multiple Simultaneous Disconnects Test:**
  - P2 and P4 disconnect simultaneously $\implies$ two independent 60s timers armed; match stays paused.
  - P2's timer expires $\implies$ P2 eliminated, turn advanced, P4 timer remains active; match remains paused.
  - P4's timer expires $\implies$ P4 eliminated, match resumes with remaining active players if $\ge 2$ survive.
  - If P2 was host $\implies$ host migrates to lowest surviving player position ($P1 \dots Pn$), emitting `HOST_MIGRATED`.
- **Server Restart vs Missing-Room Test:**
  - Client attempts `RECONNECT_MATCH` with an old `serverInstanceId` on a restarted server $\implies$ receives `MATCH_TERMINATED_SERVER_RESTART`.
  - Client attempts `RECONNECT_MATCH` with the current `serverInstanceId` for an expired room $\implies$ receives `ERROR { code: "MATCH_UNAVAILABLE" }`.
  - In both cases, client transport cleanly clears match state and transitions to lobby without infinite reconnect loops.
- **Timer Cleanup Test:** Closing rooms clears all active disconnect timer handles without memory leaks.

---

## 7. Architecture Compliance Checklist

- [x] Conforms to frozen architecture specification `docs/phase6_1_multiplayer_backend_architecture.md` (v3.2.0).
- [x] Preserves single `users` database table; zero new tables introduced.
- [x] Preserves Phase 6.3 7-day JWT expiry policy (`JWT_EXPIRES_IN=7d`).
- [x] In-memory only (ADR-01) for all room, match, socket, and timer states.
- [x] Strict ₹0 operational budget preserved; no external pingers.
- [x] Connection-liveness heartbeat decoupled from hosting uptime guarantees.
- [x] Server restart detection protocol reliably distinguishes true process generation changes from expired rooms.
- [x] Query-string JWT authenticated with server log redaction and strict referrer policy.
- [x] Headless client transport layer specified for Phase 6.6; React visual UI cleanly deferred to Phase 6.7.
- [x] Independent multi-player disconnect timers, pending shot cancellation with zero bullet retention, and host migration explicitly detailed.
- [x] Multi-tab socket re-binding prevents phantom disconnects.
- [x] All game transitions originate strictly from server-authoritative `@pageshooter/game-engine`.
- [x] Cryptographic commitment-reveal protocol preserved and integrated into real-time broadcasts.
- [x] Offline pass-and-play and IndexedDB persistence remain untouched.

---

## 8. Final Planning Verdict & Readiness

- **Specification Completeness:** Phase 6.6 is **100% specified, hardened, and verified for compatibility**.
- **Unresolved Architectural Decisions:** None.
- **Readiness:** Implementation can safely begin upon user authorization.
- **Implementation Status:** **STOPPED.** Awaiting explicit authorization.
