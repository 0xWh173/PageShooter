# PageShooter — Phase 7 Implementation Plan: Hardening & Release

**Document Version:** 1.0.0  
**Status:** PLANNING COMPLETE (Ready for Authorization)  
**Prerequisite:** Phase 6 (Phases 6.1 – 6.8) Complete  
**Budget Constraint:** ₹0.00 (Strictly Free-Tier & Self-Contained)

---

## 1. Executive Summary

With Phase 6 complete—delivering the authoritative Fastify + WebSocket backend, commitment-reveal RNG, HttpOnly zero-token authentication, full React multiplayer UI, 5-channel audio, reconnection recovery, and multi-client verification—**Phase 7** hardens PageShooter for public production release under the strict **₹0 operational budget** and **ADR-01 single-`users`-table** invariants.

Phase 7 is structured into **4 sequential milestones (7.1 → 7.4)** covering security hardening, database & capacity protection, PWA/accessibility/mobile polish, and zero-cost deployment & release verification.

---

## 2. Phase 7 Scope & Workstreams

### 2.1 Security & Capacity Hardening (Milestone 7.1)
1. **Production HTTP Security Headers & TLS:**
   - Enforce `Strict-Transport-Security` (HSTS), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, and strict `Content-Security-Policy` (allowing only self, Google OAuth, and configured `VITE_API_URL`/`VITE_WS_URL`).
   - Verify `ps_auth_token` cookie flags in production (`HttpOnly; Secure; SameSite=Lax; Path=/`).
2. **Startup Environment & Secret Validation:**
   - Fail fast on boot if `NODE_ENV=production` and `JWT_SECRET` is missing, shorter than 32 bytes, or uses a default/placeholder string.
   - Verify zero backend secrets (`JWT_SECRET`, `DATABASE_URL`, `METERED_API_KEY`) are referenced anywhere in `apps/web`.
3. **Operational Capacity Guard (`MAX_ACTIVE_ROOMS`):**
   - Configure `MAX_ACTIVE_ROOMS` in `apps/server/src/config.ts` and enforce it in `RoomManager.createRoom(...)`, returning HTTP `503 SERVER_CAPACITY_REACHED` when the empirical free-tier RAM ceiling is reached (maintaining ≥ 112 MB headroom under Render's 512 MB limit).
4. **Abuse & Rate-Limit Verification:**
   - Audit per-IP WebSocket connection limits, 4 KB frame ceiling (`1009`), auth brute-force rate limits, and room-creation rate limits.

### 2.2 Database, Health & Cold-Start Resilience (Milestone 7.2)
1. **Live PostgreSQL Migration & Pool Sizing:**
   - Verify `apps/server/src/db/migrate.ts` against a live PostgreSQL instance (Supabase free tier / local Docker).
   - Cap Drizzle/pg connection pool (`max: 5`, idle timeout `30s`) to respect free-tier connection limits.
   - Confirm ADR-01 compliance: strictly 1 table (`users`).
2. **Health & Readiness Probes:**
   - Harden `GET /health` (liveness) and `GET /ready` (DB connectivity + RAM headroom check) without leaking internal stack traces or secrets.
3. **Render Free-Tier Cold-Start UX:**
   - Add a friendly cold-start detection notice in `apps/web` when initial `/api/auth/me` or `/api/rooms` requests take > 3 seconds: *"Summoning game server from its slumber (cold start)..."*.

### 2.3 Accessibility, Responsive QA & PWA Offline Shell (Milestone 7.3)
1. **Accessibility (a11y):**
   - Honor `@media (prefers-reduced-motion: reduce)` in `BookCinematic.tsx`, `CombatAnimation.tsx`, and `ChatAndEmojiHUD.tsx`.
   - Ensure full keyboard navigation (`Tab`, `Enter`, `Space`, `Escape` to close modals) across Lobby, Waiting Room, Arena targeting cells, and Audio Mixer.
   - Verify ARIA live regions (`aria-live="polite"`) announce turn transitions and errors cleanly.
2. **Responsive Viewport QA:**
   - Automated Playwright/headless verification across Mobile (`375×812`), Tablet (`768×1024`), and Desktop (`1280×800`) for both Offline Pass-and-Play and Online Multiplayer (5-player & 10-player matrices).
3. **PWA Manifest & Service Worker:**
   - Add `manifest.webmanifest` (`display: "standalone"`) and offline app-shell caching so Local Pass-and-Play launches with zero network connectivity, while explicitly bypassing service-worker caching for `/api/*` and `/ws` routes.

### 2.4 Gated Voice Verification & Production Release (Milestone 7.4)
1. **Optional Gated Voice Spike (ADR-03):**
   - Keep WebRTC TURN relay **permanently disabled** unless the 5-point Metered.ca API empirical verification proves < 5 min reporting latency and reliable 85% auto-cutoff.
   - If not authorized or if telemetry fails, ship with text chat + 6 emoji reactions (100% ₹0 guaranteed).
2. **Deployment Runbook & Post-Deploy Smoke Suite:**
   - Finalize `apps/server/.env.example` and `apps/web/.env.example`.
   - Document exact free-tier deployment steps (Supabase PostgreSQL → Render Free Web Service → Cloudflare Pages / Vercel / Firebase Hosting).
   - Execute end-to-end production smoke checklist (Register → Login → F5 Refresh → Create Room → Join → Start Match → Roll & Verify → Shoot → Victory) and sign off **Release v1.0.0**.

---

## 3. Ordered Phase 7 Milestones

| Milestone | Title | Key Deliverables | Exit Gate |
|---|---|---|---|
| **7.1** | **Security & Capacity Hardening** | Security headers, prod secret fail-fast, `MAX_ACTIVE_ROOMS` guard, secret-leak scan | Unit tests + `typecheck` + `lint` + `build` pass |
| **7.2** | **DB, Health & Cold-Start UX** | Live Postgres migration check, bounded PG pool, `/ready` probe, cold-start banner | Migration & health tests pass |
| **7.3** | **a11y, Responsive QA & PWA** | `prefers-reduced-motion`, keyboard/ARIA audit, 3-viewport screenshots, PWA manifest | All viewport & a11y checks pass |
| **7.4** | **Release & Deployment Verification** | Env templates, deployment runbook, live smoke verification, v1.0.0 tag/release notes | 100% quality gates + smoke pass |

---

## 4. Definition of Done for Phase 7
- All 4 quality gates (`npm.cmd test`, `npm.cmd run typecheck`, `npm.cmd run lint`, `npm.cmd run build`) pass with 0 errors.
- Offline Pass-and-Play remains 100% functional with zero network dependencies.
- Single `users` database table (ADR-01) and ₹0 recurring cost constraint preserved.
- No payment methods or paid third-party tiers attached.
