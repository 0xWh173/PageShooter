# Tech Stack
**Project:** Ancient Magical Book Multiplayer Game  
**Document:** `techstack.md`  
**Version:** 1.0  
**Status:** Proposed implementation baseline  

## 1. Stack decisions
The stack below is a practical starting point for a browser-first multiplayer game built with Google Antigravity. Keep the first release small: implement and validate the game engine before adding voice chat, cosmetics, and cinematic polish.

| Layer | Technology | Responsibility |
|---|---|---|
| AI-assisted development | Google Antigravity | Repository-aware development, implementation, testing, and debugging |
| Language | TypeScript | Shared types and safer client/server code |
| Frontend | React + Vite | Browser application and PWA |
| UI styling | Tailwind CSS | Responsive dark-fantasy interface |
| UI animation | CSS animations + Framer Motion | Menus, transitions, character drawing, and lightweight effects |
| 2D game visuals | SVG and Canvas where appropriate | Stickman cells, battlefield, and effects |
| Backend API | Node.js + TypeScript | Authenticated application and room APIs |
| Realtime transport | WebSocket (Socket.IO or native WebSocket) | Live room events and synchronized match state |
| Authentication | Firebase Authentication | Google sign-in and email/password accounts |
| Persistent account data | Cloud Firestore | Minimal user profile records |
| Ephemeral room data | Cloud Firestore initially, or in-memory room state with durable recovery snapshots | Waiting rooms and temporary match metadata |
| Authoritative game service | Cloud Run | Server-side rules, turn validation, random outcomes, and room lifecycle |
| Offline persistence | IndexedDB | Local match recovery without internet |
| PWA | Web App Manifest + Service Worker | Installability and application shell caching |
| Voice | WebRTC with a managed SFU if required | Real-time voice communication |
| Static assets | Firebase Hosting / CDN | Application bundle and static art/audio |
| Monitoring | Cloud Logging and Error Reporting | Operational errors and service health |
| Tests | Vitest, React Testing Library, Playwright | Unit, component, and end-to-end tests |

## 2. Recommended deployment shape
- **Frontend:** Build the React/Vite application and deploy static assets to Firebase Hosting.
- **Backend:** Deploy a TypeScript service to Cloud Run. It owns online match state transitions and validates every gameplay command.
- **Authentication:** Use Firebase Authentication. The backend verifies Firebase ID tokens before accepting player actions.
- **Database:** Store only account/profile data persistently. Store room and match data temporarily, with explicit expiry and cleanup.
- **Realtime:** Use authenticated WebSocket connections for match events. Do not treat client-side state as authoritative.
- **Offline:** Run the same deterministic game rules locally in the browser and persist the current local match in IndexedDB.

## 3. Important implementation choices
### 3.1 Server-authoritative gameplay
The server is the source of truth for online matches. The browser sends commands such as `ROLL`, `SHOOT`, `LEAVE_MATCH`, and `RECONNECT`; the server validates them against the current state and broadcasts accepted events.

Never accept a client-supplied result, target validity, bullet count, turn owner, elimination status, or winner declaration.

### 3.2 Realtime transport
Use WebSockets for low-latency room events. Socket.IO is a reasonable initial choice because it provides reconnection and room abstractions. Keep transport logic behind an interface so it can be replaced if deployment constraints require it.

Cloud Run instances are ephemeral and can scale horizontally. Do not rely on process memory as the only copy of an active online match. Use a shared state store or persistence layer and design for reconnects across instances. Evaluate Firestore transaction limits, contention, and cost before using it for high-frequency event traffic.

### 3.3 Voice chat
WebRTC peer-to-peer may work for small rooms but can become unreliable or bandwidth-heavy as participant count grows. A Selective Forwarding Unit (SFU) is generally more suitable for group voice. Choose a managed voice provider or deploy an SFU only after the core game is stable. Voice infrastructure and TURN relaying can become a significant cost.

Do not record voice. Provide per-user mute controls and clear microphone permission handling.

### 3.4 Randomness and verifiability
Generate outcomes on the trusted server using a cryptographically secure random number generator. The valid outcome set is exactly `[0, 2, 4, 6, 8]`, each with probability 20%.

For verifiable outcomes, implement a documented commit-and-reveal protocol. Define the commitment format, nonce/seed lifecycle, reveal timing, and verification algorithm before implementation. Do not claim that a roll is independently verifiable until clients can reproduce and validate the proof. Protect future outcomes from being inferred or selectively withheld.

### 3.5 Animation and game state
Animations are presentation only. The game state transition must be committed before the cinematic plays. If a player refreshes during an animation, reconnecting clients must render the already-committed result rather than replaying the action as a new command.

Keep animation assets lightweight. Prefer SVG/CSS and short compressed audio files over video backgrounds or large 3D assets.

## 4. Storage and cost controls
The product requirement is ultra-minimal persistent storage.

- **Persist only:**
  - User ID / authentication provider reference.
  - Unique username.
  - Selected built-in avatar and cosmetic variant, if applicable.
  - Username-change timestamp.
  - Minimal account metadata required for security and account operation.

- **Temporary data:**
  - Waiting room membership and configuration.
  - Active match state.
  - Current turn and cell state.
  - Temporary event log.
  - Randomness commitment/reveal data required to verify the active match.
  - Temporary downloadable match report.

- **Deletion rules:**
  - Waiting rooms expire after 10 minutes.
  - Completed rooms remain available for up to 10 minutes.
  - Delete the room immediately when everyone has left.
  - Delete all temporary match data when the room expires or is deleted.
  - Do not retain match history, replays, screenshots, recordings, or voice data.
  - Offline match recovery is stored locally in IndexedDB and can be cleared by the user.

Use TTL only as a backstop, not as the sole cleanup mechanism. Implement explicit cleanup on room closure and scheduled expiry. Avoid storing large binary assets in Firestore.

## 5. Security baseline
- Verify Firebase ID tokens on the backend.
- Authorize every room and match action against server-side membership and role.
- Validate all commands with runtime schemas (for example, Zod).
- Enforce server-side rate limits for authentication attempts, room creation/joining, chat, reactions, and gameplay actions.
- Use cryptographic randomness on the server.
- Use TLS for all network traffic.
- Sanitize and length-limit usernames and chat messages.
- Prevent clients from choosing player positions, roll results, bullet counts, or winners.
- Protect WebSocket connections against unauthorized room subscriptions.
- Keep secrets in managed secret storage; never commit secrets to the repository.
- Add abuse reporting and moderation controls before public launch.

## 6. Testing stack
- **Unit:** Vitest for rules engine, state transitions, random-result mapping, and cleanup logic.
- **Component:** React Testing Library for controls, lobby, board, and settings.
- **Integration:** Test backend authorization, room lifecycle, reconnection, and event ordering.
- **End-to-end:** Playwright for offline and online browser flows.
- **Load:** Simulate 5–10 active players plus spectators per room; test concurrent rooms and reconnect storms.
- **Security:** Test forged commands, replayed commands, out-of-turn actions, invalid targets, rate-limit bypass attempts, and unauthorized room access.

## 7. Suggested repository layout
```
/
├── apps/
│   ├── web/                 # React + Vite PWA
│   └── server/              # Node.js + TypeScript service
├── packages/
│   ├── game-engine/         # Pure rules and state transitions
│   ├── shared/              # Shared types and validation schemas
│   └── ui/                  # Reusable UI components (optional)
├── infra/                   # Deployment and infrastructure configuration
├── docs/                    # Product and technical documents
├── tests/
│   ├── integration/
│   └── e2e/
├── package.json
└── README.md
```

## 8. Implementation order
1. Build the pure TypeScript game engine and comprehensive unit tests.
2. Build the offline local multiplayer mode and IndexedDB recovery.
3. Build the online room API and authoritative match service.
4. Add authentication, WebSocket synchronization, and reconnection.
5. Add spectator permissions, event log, and chat.
6. Add voice using a managed SFU or provider after cost evaluation.
7. Add book, combat, and victory animations.
8. Add avatars, cosmetics, tutorial, PWA polish, monitoring, and deployment hardening.

## 9. Decisions to validate before production
These are implementation choices, not confirmed product requirements:
- Whether Cloud Firestore can support the selected realtime event rate economically, or whether Redis/Memorystore or another shared state store is needed.
- Which managed SFU/voice provider best fits expected concurrent rooms and budget.
- Whether the commit-and-reveal scheme meets the desired fairness model.
- Exact retention behavior for account deletion and security audit records.
- Spectator capacity per room and global concurrent-room targets.

**Guiding principle:** keep the game rules deterministic and independently testable; keep online authority on the server; persist as little user data as possible; and defer expensive realtime voice infrastructure until the core game works.

