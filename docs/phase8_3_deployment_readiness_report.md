# PageShooter — Phase 8.3 Deployment Readiness & Free-Tier Validation Report

**Date:** 2026-11-18  
**Phase:** Phase 8.3 — Deployment Readiness & Free-Tier Validation  
**Deployment Status:** **NOT YET PUBLISHED (Prepared & Validated — Awaiting Phase 8.4 Part B Approval)**  
**Estimated Monthly Cost:** **₹0.00**

---

## 1. Validated ₹0 Deployment Architecture

| Layer | Provider (Free Tier) | Verified Free-Tier Limits | Credit Card Required? |
|---|---|---|---|
| **Frontend (Static + PWA)** | **Cloudflare Pages** (Free) | Unlimited bandwidth, 500 builds/month, 20,000 files max, automatic TLS (`*.pages.dev`). | **No** |
| **Backend (Fastify + WS)** | **Render Free Web Service** | 512 MB RAM, 0.1 vCPU, 750 free instance hours/month, native `wss://` WebSocket upgrade, automatic TLS (`*.onrender.com`). Spins down after 15 min inactivity (30–60s cold start). | **No** |
| **PostgreSQL Database** | **Supabase Free** | 500 MB database storage, 5 GB/month egress, 2 active projects. Pauses after 7 consecutive days of inactivity (manual resume in dashboard within 1 year). | **No** |
| **Voice Relay (ADR-03)** | **Disabled (Fail-Closed)** | Text chat + 6 authorized emojis active at ₹0. | **N/A** |

---

## 2. Critical Cross-Domain Cookie & Origin Findings

1. **Cross-Site Cookie Behavior (`*.pages.dev` ↔ `*.onrender.com`):**
   - `pages.dev` and `onrender.com` are on the Public Suffix List (distinct eTLD+1 sites).
   - [`apps/server/src/config.ts`](file:///c:/Games/PageShooter/apps/server/src/config.ts#L50-L57) currently sets `__Host-pageshooter_session` with `httpOnly: true, secure: true, sameSite: "lax", path: "/"`.
   - **Important:** Browsers will **not** send a `SameSite=Lax` cookie on cross-site `fetch(..., { credentials: "include" })` or cross-site WebSocket handshakes from `*.pages.dev` to `*.onrender.com`.
   - **Zero-Cost Options to Handle This Cleanly:**
     - **Option A (Recommended — Zero Cross-Site Friction):** Serve the compiled static frontend (`apps/web/dist`) from the same Render origin (or attach a custom domain / reverse proxy so REST + WS + HTML share the exact origin), preserving `SameSite=Lax` + `__Host-` with zero third-party cookie issues.
     - **Option B (Split Domains `pages.dev` + `onrender.com`):** Requires configuring `sameSite: "none"` (with `Secure: true` and `__Host-` preserved) for cross-site `fetch` + `wss://`, noting that Safari ITP / strict browser third-party cookie blockers may block `SameSite=None` cookies on `pages.dev` → `onrender.com`.
   - This trade-off is surfaced explicitly in the **Phase 8.4 Part B Approval Gate** before any public deployment.

2. **CORS & Secret Configuration:**
   - Production `assertProductionSecrets` ([`config.ts`](file:///c:/Games/PageShooter/apps/server/src/config.ts#L32-L38)) blocks boot if `JWT_SECRET` uses any dev/placeholder string.
   - `CORS_ORIGIN` must be set to the exact `https://<frontend-origin>` (no wildcard `*` with `credentials: true`).

---

## 3. Production Build, Migration & Operational Readiness

| Check | Verification | Status |
|---|---|---|
| **Static Assets & PWA** | `npm.cmd run build:web` outputs `apps/web/dist` (`index.html`, JS `135.21 kB` gzip, `manifest.webmanifest`, `sw.js`). `sw.js` bypasses `/api/*` and `/ws`. | **PASS** |
| **Server Compilation** | `npm.cmd run build:server` compiles `apps/server/dist/index.js` cleanly via `tsc -b`. | **PASS** |
| **DB Migrations** | `npm.cmd run db:migrate --workspace=@pageshooter/server` verified against PostgreSQL 16 (single `users` table per ADR-01). | **PASS** |
| **Readiness & Health Probes** | `GET /api/health` (DB connectivity) and `GET /api/ready` (DB + RAM < 450 MB; stays `200` at full room capacity) verified. | **PASS** |
| **Capacity Ceiling** | `MAX_ACTIVE_ROOMS=20` empirically validated at `176.27 MB` RSS (< 400 MB safety cap under Render's 512 MB limit). | **PASS** |
| **Log Hygiene** | Fastify request serializer redacts `?token=[REDACTED]`; zero JWTs or DB URLs logged. | **PASS** |

---

## 4. Exact Build, Migration, Deployment & Rollback Steps

### Build & Migration Commands
```bash
# 1. Apply single-table schema migration to Supabase PostgreSQL
DATABASE_URL="postgresql://..." npm run db:migrate --workspace=@pageshooter/server

# 2. Build monorepo (shared + game-engine + web + server)
npm ci && npm run build
```

### Rollback Procedure
- **Backend (Render):** Trigger instant rollback to previous deployment image in Render Dashboard (Deploys → Rollback). Note: any active in-memory matches terminate on restart; clients automatically receive `MATCH_TERMINATED_SERVER_RESTART` and return to lobby cleanly.
- **Frontend (Cloudflare Pages):** Click "Rollback to this deployment" in Cloudflare Pages Deployments history (takes < 10 seconds globally).
- **Database:** Single `users` table schema is additive-only (`0000_cold_randall.sql`); no destructive migrations exist.

---

## 5. Known Free-Tier Limitations & Operational Risks

1. **15-Minute Idle Spin-Down (Render Free):** Backend sleeps after 15 min without traffic; first wake-up takes 30–60s (handled in UI via `cold-start-banner`). Keep-alive pingers are **strictly prohibited**.
2. **7-Day Inactivity Pause (Supabase Free):** Database pauses after 7 consecutive days of low/zero queries; requires manual "Resume Project" in Supabase dashboard.
3. **RAM-Only Match Volatility (ADR-01):** Server restarts or Render container recycling terminate active matches; `ServerRestartModal` informs players transparently.
4. **No Automated Backups on Free Tier:** Supabase Free does not include automated daily PITR backups; `pg_dump` can be run manually if user table backup is desired.

**Gate Verdict:** **PASS — Deployment readiness validated at ₹0. Ready for Phase 8.4 (Part A preparation + Part B Public Deployment Approval Gate).**
