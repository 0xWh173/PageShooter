# PageShooter — Phase 8.1 Interactive Browser QA Report

**Date:** 2026-11-18  
**Phase:** Phase 8.1 — Local Interactive Browser QA  
**Browser Engine:** Google Chrome (via Playwright CDP, headless)  
**Viewports Tested:**
- Mobile: `375 × 812`
- Tablet: `768 × 1024`
- Desktop: `1920 × 1080` & `1280 × 800`
**Local Stack:**
- PostgreSQL 16 (ephemeral local Docker `postgres:16-alpine` on `127.0.0.1:5432`, migrated via `db:migrate`, removed post-QA)
- Fastify Backend (`npm run dev:server` on `http://127.0.0.1:4000`)
- Vite Frontend (`npm run dev:web` on `http://localhost:3234`)

---

## 1. Defects Found & Fixed During Phase 8.1

Real multi-session browser testing uncovered **4 genuine defects** (3 blocking/functional, 1 mobile UI layout) that were missed by mocked unit tests:

| ID | Severity | Component / File | Reproduction & Root Cause | Fix Applied |
|---|---|---|---|---|
| **QA-01** | **High (Blocking)** | [`apps/server/src/config.ts`](file:///c:/Games/PageShooter/apps/server/src/config.ts) | Vite runs on `http://localhost:3234` (`vite.config.ts`), whereas server default `CORS_ORIGIN` only listed `5173,5175`. All browser `fetch` preflights and WS upgrades from `:3234` failed with CORS `403`. | Added `http://localhost:3234` to default `CORS_ORIGIN` (`http://localhost:5173,http://localhost:5175,http://localhost:3234`) and updated [`config.test.ts`](file:///c:/Games/PageShooter/apps/server/test/config.test.ts). |
| **QA-02** | **Critical (Blocking)** | [`apps/web/src/network/apiClient.ts`](file:///c:/Games/PageShooter/apps/web/src/network/apiClient.ts) | `request()` unconditionally set `Content-Type: application/json` even when `options.body` was `undefined` (`POST /api/rooms`, `/join`, `/spectate`, `/logout`). Fastify rejected bodyless `POST` requests with `400 FST_ERR_CTP_EMPTY_JSON_BODY`. | Set `Content-Type: application/json` only when `options.body !== undefined`. |
| **QA-03** | **Medium (Layout)** | [`apps/web/src/App.tsx`](file:///c:/Games/PageShooter/apps/web/src/App.tsx) | On `375 × 812` mobile, the top `<header>` placed the title, mode switcher, audio button, and profile pill in a non-wrapping flex row, causing the mode switcher to wrap to 4 lines and clipping the profile pill on the right edge (`05_arena_mobile.png`). | Added `flex-wrap gap-2`, `whitespace-nowrap` on mode buttons, and `max-w-[70px] truncate` on mobile username pill; visually re-verified clean wrapping on `375 × 812`. |
| **QA-04** | **High (Functional)** | [`apps/web/src/components/online/MultiplayerLobbyScreen.tsx`](file:///c:/Games/PageShooter/apps/web/src/components/online/MultiplayerLobbyScreen.tsx) | Backend `BASE32_ALPHABET` (`roomCode.ts`) includes `L` and `U` (excluding only `0, 1, I, O`), but frontend input sanitizer stripped `L` and `U` (`[^A-HJ-KM-NP-TV-Z2-9]`). Any room code containing `L` or `U` (e.g., `ULT5LT`) could not be entered to enable Join/Spectate. | Updated sanitizer to `[^A-HJ-NP-Z2-9]` matching backend `BASE32_ALPHABET`, and updated [`multiplayerLobby.test.tsx`](file:///c:/Games/PageShooter/apps/web/test/multiplayerLobby.test.tsx). |

### Non-Phase-8.1 Legacy Test Observation
- When live PostgreSQL was running on `:5432`, legacy Phase 6.3 tests [`authRoutes.test.ts`](file:///c:/Games/PageShooter/apps/server/test/authRoutes.test.ts) and [`usernameCooldown.test.ts`](file:///c:/Games/PageShooter/apps/server/test/usernameCooldown.test.ts) ran instead of skipping and failed with `403 CSRF_INVALID_CLIENT_HEADER` because those Phase 6.3 test files pre-date Milestone 1.1's `X-PageShooter-Client: web` header requirement (while Milestone 1.1's [`cookieAuth.test.ts`](file:///c:/Games/PageShooter/apps/server/test/cookieAuth.test.ts) and [`csrfProtection.test.ts`](file:///c:/Games/PageShooter/apps/server/test/csrfProtection.test.ts) verify the live auth/CSRF behavior). Left untouched per Phase 8.1 scope; recommended for test-helper alignment in a future maintenance pass.

---

## 2. Browser QA Checklist Results

| Category | Test Case | Verdict | Evidence / Notes |
|---|---|---|---|
| **Authentication** | Register via username/password | **PASS** | Created `Host_42289` in Chrome; profile pill rendered |
| **Authentication** | Log out & log in | **PASS** | Session cleared on logout; re-authenticated via username + password |
| **Authentication** | Browser F5 refresh recovery | **PASS** | Reloaded page; session restored via `HttpOnly` cookie |
| **Authentication** | Unauthenticated protected route rejection | **PASS** | `POST /api/rooms` from unauthenticated browser context returned `401` |
| **Authentication** | `HttpOnly` cookie & zero JWT in JS | **PASS** | Playwright `context.cookies()` confirmed `httpOnly: true`; `document.cookie`, `localStorage`, and `sessionStorage` contained zero JWTs |
| **Waiting Room** | Create room & 6-char Base-32 code | **PASS** | Generated `2K32HV` (and tested `ULT5LT` after QA-04 fix) |
| **Waiting Room** | Multi-session join (5 players + 1 spectator) | **PASS** | 6 independent Chrome `BrowserContext`s connected simultaneously |
| **Waiting Room** | Player count vs spectator count isolation | **PASS** | `(5/10 Players)` and `(1 Spectators)` tracked separately |
| **Waiting Room** | Kick guest & min-5-player Start gate | **PASS** | Kicking 5th player showed `"Chamber Departure"` modal and disabled `Start Match` at 4 players |
| **Waiting Room** | F5 refresh recovery (Host & Guest) | **PASS** | Both Host and Guest recovered into Waiting Room with correct authority |
| **Waiting Room** | Host migration on Host leave | **PASS** | Original Host left; `P2` promoted to Host with active `Start Match` button |
| **Gameplay** | Start match (5+ players), randomized positions, spectator isolation | **PASS** | All 6 contexts transitioned to `MultiplayerArenaScreen`; Spectator saw `Spectator Mode` badge and zero `Roll` button |
| **Gameplay** | Active turn Roll & `BookCinematic` | **PASS** | Active turn player (`P5_68793`) rolled; `BookCinematic` rendered and resolved across peers |
| **Gameplay** | 5 cell progression stages, 5th/6th+ roll rules, invalid targets, commitment-reveal tampering | **PASS (via E2E + UI)** | Core turn/roll/shoot & commitment-reveal verified in real browser (`Turn #1` → `Turn #2`, `SHA-256 Committed` badge) + [`phase6_8_e2e_multi_client.test.ts`](file:///c:/Games/PageShooter/apps/server/test/phase6_8_e2e_multi_client.test.ts) & [`onlineArena.test.tsx`](file:///c:/Games/PageShooter/apps/web/test/onlineArena.test.tsx) |
| **Disconnect & Recovery** | Disconnect active player → 60s pause & countdown | **PASS** | Closing player page triggered `Match Paused` banner with live `01:00` countdown |
| **Disconnect & Recovery** | Reconnect before timeout restores state | **PASS** | Re-opening page restored match and dismissed pause banner |
| **Disconnect & Recovery** | F5 refresh during active match | **PASS** | Reloaded active arena; recovered seamlessly via `/api/rooms/my-active` + `RECONNECT_MATCH` |
| **Disconnect & Recovery** | Timeout elimination, host timeout migration, server restart | **PASS (via Server/UI Tests)** | Verified in [`wsReconnect.test.ts`](file:///c:/Games/PageShooter/apps/server/test/wsReconnect.test.ts) & [`onlineArena.test.tsx`](file:///c:/Games/PageShooter/apps/web/test/onlineArena.test.tsx) |
| **Chat, Audio & a11y** | Room chat broadcast & 6 permitted emojis | **PASS** | `"Hello QA Chamber!"` broadcast between contexts; all 6 emoji buttons (`thumb`, `fire`, `skull`, `scream`, `sword`, `cheer`) present and interactive |
| **Chat, Audio & a11y** | 5-channel `AudioSettingsModal`, `Escape` key & persistence | **PASS** | Muted `book` channel, closed modal with `Escape`, verified `pageshooter_audio_v2_settings` in `localStorage` |
| **PWA** | `manifest.webmanifest` (`display: standalone`) | **PASS** | Verified HTTP `200` and `"display": "standalone"` |
| **PWA** | Offline Pass-and-Play with network disabled | **PASS** | `context.setOffline(true)` → started 5-player local pass-and-play match cleanly |
| **Responsive** | Mobile `375 × 812`, Tablet `768 × 1024`, Desktop `1920 × 1080` | **PASS** | `scrollWidth === innerWidth` across all 3 viewports after QA-03 fix; visually verified via screenshots |

---

## 3. Quality Gates After Final Phase 8.1 Fixes

| Gate | Command | Result |
|---|---|---|
| **Tests** | `npm.cmd test` | **PASS** — **304/304 passed** across **39 test files** |
| **TypeScript** | `npm.cmd run typecheck` | **PASS** — **0 errors** |
| **Lint** | `npm.cmd run lint` | **PASS** — **0 errors, 0 warnings** |
| **Build** | `npm.cmd run build` | **PASS** — Web & Server built cleanly |

---

## 4. Phase 8.1 Acceptance Recommendation

**Verdict:** **PASS — Phase 8.1 Approved.**  
All 4 real-browser defects discovered during interactive testing (`QA-01` through `QA-04`) have been fixed and re-verified in both live multi-session Chrome and the automated quality gates. Zero cloud resources, zero paid services, and zero Git operations were performed.

**Stopped after Phase 8.1. Awaiting user authorization before proceeding to Phase 8.2.**
