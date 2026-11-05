# Master Build Prompt for Google Antigravity

**Project:** Ancient Magical Book Multiplayer Game  
**Document:** `prompt.md`  
**Version:** 1.0  
**Purpose:** Primary project instruction file for Google Antigravity  

---

## 1. Your role

Act as the lead software architect, senior full-stack engineer, multiplayer game engineer, security engineer, UI/UX designer, and test engineer for this project.

Build a polished browser-based multiplayer game based on the product rules in this repository. Use the existing project documentation as the source of truth:

1. `techstack.md` — approved technology direction and implementation constraints.
2. `arch.md` — system architecture, service boundaries, and deployment topology.
3. `systemdesign.md` — detailed game state, workflows, APIs, data models, and failure handling.

If one of these documents does not exist yet, do not invent its contents or block all work. Use this prompt and `techstack.md` as the current baseline, and ask for or create the missing design document before implementing architecture-dependent features.

Do not silently change confirmed game rules. If two documents conflict, identify the conflict and ask for a decision rather than guessing.

## 2. Product objective

Build an ancient-fantasy-themed multiplayer stickman combat game that recreates the user's pen-and-paper game digitally.

The game must support:
- Offline local multiplayer on one shared device, without internet or account.
- Online private rooms joined by room code.
- 5–10 active human players per match.
- External spectators who do not consume player slots.
- Responsive desktop and mobile browser layouts.
- Installable Progressive Web App (PWA).
- English-only interface.
- Dark ancient-fantasy visual theme.

There are no AI opponents.

## 3. Non-negotiable engineering principles

1. **Correct rules before visual polish.** Implement the rules engine and tests before elaborate animations.
2. **Server authority online.** The server decides all online outcomes and state transitions. Never trust the browser to decide rolls, turns, bullets, targets, eliminations, or winners.
3. **Deterministic rules engine.** Keep game rules in a pure, independently testable package shared where appropriate by offline and online modes.
4. **Minimal persistent storage.** Persist only essential account/profile and progression data. Keep match data temporary and delete it according to the room lifecycle.
5. **Security by default.** Validate all commands, authenticate online users, authorize room membership, rate-limit sensitive actions, and protect secrets.
6. **Accessible and responsive UI.** Controls must work with mouse, touch, and keyboard where practical.
7. **Animation is presentation, not authority.** Commit game state before playing an animation. Refreshing or reconnecting must never duplicate a game action.
8. **No fabricated functionality.** Do not display controls that do nothing or claim a feature is implemented when it is not.
9. **No premature complexity.** Avoid microservices, unnecessary dependencies, persistent analytics, replay systems, and expensive media infrastructure unless the architecture documents justify them.
10. **Test every important rule and failure path.** A feature is not complete merely because its happy path works.

## 4. Confirmed game rules

### 4.1 Players and turns
- A match requires at least 5 active players and supports at most 10.
- At match start, the server randomly assigns fixed positions P1 through Pn.
- Turn order is P1 → P2 → ... → Pn, then repeats.
- Player positions do not change during a match.
- Eliminated players are skipped automatically.
- The match ends immediately when only one active player remains. Do not finish the round.
- There is no match time limit.

### 4.2 Five independent cells per player
Every player has five independent cells labelled:
`0`, `2`, `4`, `6`, `8`

Each cell has its own character progression and weapon state. Progress in one cell must never affect another cell.

### 4.3 Cell progression
For a live cell, each time its matching number is rolled:

| Matching roll count | Cell state |
|---|---|
| 1 | Face |
| 2 | Body |
| 3 | Legs |
| 4 | Hands/arms |
| 5 | Gun with zero bullets |
| 6 | Award one bullet and immediately require a shot |
| 7+ | Award one bullet and immediately require a shot |

Important:
- The fifth matching roll creates the gun but does not fire.
- A later matching roll awards exactly one bullet and requires an immediate shot.
- Bullets cannot be stored or accumulated.
- A cell with a gun does not progress beyond the gun; each later matching roll creates one immediate shot.
- If the rolled cell is destroyed, the turn is wasted. No progression, bullet, or shot occurs.

### 4.4 Shooting and destruction
- A player can target any undestroyed cell belonging to any other active player.
- The shooter cannot target their own column.
- Empty cells and partially or fully progressed cells are all valid targets if not destroyed.
- Destroying a cell removes that entire cell regardless of its progression.
- Destroyed cells cannot be targeted or used again.
- The shooter selects a target by clicking/tapping the opponent's undestroyed cell.
- Target selection fires immediately. There is no confirmation or cancellation.
- A shot destroys exactly one target cell.
- A player is eliminated when all five of their cells are destroyed.
- If a player must shoot but no valid opponent cell remains, declare that player the winner immediately.

### 4.5 Book outcome
- Valid outcomes are exactly `0`, `2`, `4`, and `8`.
- Each outcome has equal probability: 20%.
- The book displays a fictional page number between 1 and 500 whose final digit is the selected outcome.
- Generate the valid outcome directly. Do not generate arbitrary page numbers and reroll odd endings.
- The book-opening cinematic lasts 4–6 seconds.
- Animation: cover opens, pages flip rapidly, the book stops, page number is highlighted in gold, and the final digit is revealed.
- The game automatically processes the result after reveal.
- Online outcomes must be server-generated and verifiable using the documented cryptographic commit-and-reveal design.

### 4.6 Visual progression and combat
- Character parts are drawn with animated pencil-like strokes.
- General UI and gameplay animations should be approximately one second unless a special cinematic is specified.
- Book opening is the special 4–6 second animation.
- Ordinary cell destruction uses a shorter bullet-impact and paper-destruction effect.
- Destroying a player's final cell uses a special full-screen elimination cinematic.
- Combat cinematics may take inspiration from the dramatic pacing of social-deduction game kill scenes, but all characters, artwork, sound, staging, and animation must be original. Do not copy protected characters or exact sequences.
- A successful shot generates a public kill notification.
- Maintain a live event log of rolls, progression, shots, destructions, eliminations, disconnects, host transfers, and victory.

### 4.7 Victory and post-match
- Use a cinematic victory sequence.
- Showcase the surviving character and winner's username and player position.
- Show match-only statistics: kills, surviving cells, total turns, and match duration.
- After the match, players can choose Play Again or Leave Arena.
- A rematch uses the same room code but reshuffles player positions.
- The host alone can download a temporary match report containing usernames, positions, final results, and event history.
- Do not persist completed match history.

## 5. Offline mode
- Offline mode uses one shared screen/device.
- No authentication or internet is required.
- The active player operates the roll control.
- Only the current active player should be able to trigger the roll in the UI.
- Since the device is shared, offline mode relies on local turn flow rather than account identity.
- Save local match state automatically after each accepted action using IndexedDB.
- Restore the exact local match after refresh or browser reopening.
- Local recovery data remains on the device and is not uploaded.
- Provide a clear way to start a new match and clear the prior local match.

## 6. Online rooms and lobby
- Host creates a private arena and receives a unique room code.
- Players join using the room code and authenticated profile.
- The host starts the match manually only when 5–10 active players have joined.
- The start action is disabled below five players.
- The host can kick players only in the waiting lobby.
- The host has no gameplay advantage and participates under the same rules.
- External spectators can join using the room code during an active match.
- Spectators do not occupy active-player slots and cannot become players mid-match.
- Same room code remains in use for rematches.

## 7. Online disconnect and leaving rules
- If any active player disconnects, pause the entire match.
- Give the disconnected player 60 seconds to reconnect.
- Successful reconnection restores the exact previous state and resumes the match.
- If the player does not reconnect within 60 seconds, eliminate them and destroy all five cells.
- If the host disconnects, apply the same 60-second pause.
- If the host fails to reconnect, eliminate the host and transfer host privileges to the lowest-numbered surviving player position. Player positions never change.
- The host cannot voluntarily leave an active match.
- A regular active player may voluntarily leave; immediately eliminate them and destroy all five cells.
- Eliminated players become spectators and may leave at any time.
- External spectators may leave and rejoin with the room code while the match remains active.
- Online matches cannot be manually paused. Only the defined disconnect flow pauses a match.

## 8. Spectator permissions
Spectators, including eliminated players, may:
- Watch the live battlefield.
- View book animations and results at the same time as players.
- View the live event log.
- Use voice chat and text chat.
- React using both standard and game-themed emoji sets.
- Display reactions as temporary floating effects visible to everyone.

Spectators may not:
- Roll.
- Shoot.
- Progress cells.
- Select targets.
- Vote on or otherwise influence gameplay.
- Become active players after a match starts.

## 9. Accounts, profiles, and progression
Online authentication:
- Google sign-in.
- Username and password.

Profile requirements:
- Globally unique username.
- Username can be changed once every 30 days.
- Built-in fantasy avatars only; no image uploads.
- Limited customization using predefined variants.
- No public profile statistics.
- No leaderboard.

Cosmetics:
- Cosmetic items are free.
- Unlocks are earned through achievements and experience progression.
- Cosmetics must not change gameplay mechanics or provide competitive advantages.
- Keep progression storage compact. Persist only the minimum experience/unlock identifiers needed to preserve earned cosmetics. Do not store match histories to calculate profile pages.
- If progression cannot be implemented without violating the minimal-storage objective, ask for a product decision rather than silently storing detailed match records.

## 10. Tutorial and UI
- Show a short interactive tutorial automatically for first-time players, with a skip option.
- No AI practice match.
- Ancient magical dark theme only; no light-mode toggle.
- English only.
- Responsive desktop, tablet, and mobile layouts.
- Installable PWA.
- Offline mode must work without internet; online mode requires internet.
- Use touch-friendly target cells and controls.
- Provide clear loading, reconnecting, eliminated, spectator, and error states.

## 11. Audio and communication
Provide online voice chat and text chat throughout the match, including for eliminated players and external spectators.

Provide separate volume controls for:
- Background music.
- Book opening and page flipping.
- Shooting and destruction effects.
- UI interaction sounds.
- Voice chat.

Provide individual mute controls. Do not record or persist voice audio.

## 12. Storage lifecycle
Ultra-minimal persistent storage is a hard requirement.

Persist only:
- Account identity and authentication references.
- Unique username.
- Avatar selection and compact cosmetic customization state.
- Username-change timestamp.
- Minimal progression state needed for earned cosmetic unlocks, if enabled.

Temporary data only:
- Waiting room state.
- Active match state.
- Event log.
- Randomness verification material needed for the active match.
- Temporary match report.

Room lifecycle:
- Inactive waiting rooms expire after 10 minutes.
- Waiting-room expiry is fixed and cannot be extended.
- Completed rooms remain available for up to 10 minutes for Play Again, Leave Arena, and host report download.
- If everyone leaves, delete the room and temporary data immediately.
- When the 10-minute post-match period expires, delete all temporary room and match data.
- Do not retain match history, replays, screenshots, gameplay video, voice recordings, or analytics that identify individual matches.
- Use explicit cleanup plus TTL as a safety net. Never rely on TTL alone for immediate deletion.

## 13. Security and anti-cheat
- Online game state is server-authoritative.
- Verify authentication tokens on the backend.
- Authorize every action based on room membership, player identity, role, current turn, and current state.
- Validate every incoming command using runtime schemas.
- Use cryptographically secure server-side randomness.
- Implement a documented verifiable commit-and-reveal protocol.
- Reject out-of-turn, duplicate, stale, forged, or invalid commands.
- Prevent clients from setting roll outcomes, player positions, bullets, cell state, eliminations, or winner.
- Rate-limit authentication attempts, room creation, room joining, chat, reactions, and gameplay commands.
- Sanitize and length-limit usernames and chat.
- Use TLS and managed secret storage.
- Do not expose service credentials in frontend code.

## 14. Development workflow — mandatory

Work in small, reviewable phases. Do not attempt to generate the entire application in one giant change.

### Required implementation phases
- **Phase 0 — Repository inspection and plan**
- **Phase 1 — Rules engine**
- **Phase 2 — Offline game**
- **Phase 3 — Online identity and rooms**
- **Phase 4 — Authoritative online gameplay**
- **Phase 5 — Spectators and communication**
- **Phase 6 — Visual polish and progression**
- **Phase 7 — Hardening and release**

## 15. Definition of done
A feature is complete only when:
- Its behavior matches the product rules.
- Its UI works on desktop and mobile.
- Its server-side authorization is implemented where applicable.
- Its success and failure states are handled.
- Relevant automated tests pass.
- No critical lint, type, or build errors remain.
- It does not introduce unapproved persistent data.
- Documentation reflects the implemented behavior.

## 16. First instruction to Antigravity
Start with **Phase 0 only**.
Inspect the repository. Read `techstack.md`, `arch.md`, and `systemdesign.md` if present. Report:
- Current repository structure.
- Existing implementation, if any.
- Missing documents or dependencies.
- Conflicts or unresolved requirements.
- Proposed implementation phases and acceptance tests.

Do not start Phase 1 until the inspection report and implementation plan are presented for review.

