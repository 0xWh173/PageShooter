# PageShooter — Phase 8.4 Controlled Release & Verification Report

**Date:** 2026-11-18  
**Phase:** Phase 8.4 — Controlled Release & Live Verification  
**Deployment Status:** **PART A COMPLETE — STOPPED AT PART B PUBLIC DEPLOYMENT APPROVAL GATE**  
*(Zero public infrastructure provisioned; awaiting explicit user approval to publish.)*

---

## 1. Part A — Release Preparation Verification

| Preparation Item | Status | Evidence |
|---|---|---|
| **Production Build** | **PASS** | `npm.cmd run build` compiled `apps/web/dist` (`135.21 kB` gzip JS) and `apps/server/dist` (`0` errors) |
| **Env Templates** | **PASS** | [`apps/server/.env.example`](file:///c:/Games/PageShooter/apps/server/.env.example) and [`apps/web/.env.example`](file:///c:/Games/PageShooter/apps/web/.env.example) validated |
| **Migration Command** | **PASS** | `npm run db:migrate --workspace=@pageshooter/server` verified against PostgreSQL 16 (single `users` table) |
| **Smoke Test Suite** | **PASS** | Local end-to-end smoke verified across 6 real Chrome sessions (`phase8_1_interactive_browser_qa_report.md`) and 10-player + 2-spectator WS suite (`phase6_8_e2e_multi_client.test.ts`) |
| **Rollback Plan** | **PASS** | Documented in [`phase8_3_deployment_readiness_report.md`](file:///c:/Games/PageShooter/docs/phase8_3_deployment_readiness_report.md#L48-L53) |

---

## 2. Part B — Public Deployment Approval Gate (Pending User Authorization)

Live deployment and live production smoke tests have **not** been executed yet because explicit user approval is required before creating externally accessible production infrastructure.

1. **Frontend Provider:** **Cloudflare Pages** (Free tier — unlimited bandwidth, 500 builds/month, `*.pages.dev` TLS)
2. **Backend Provider:** **Render** (Free Web Service — 512 MB RAM, 0.1 vCPU, 750 free instance hours/month, `wss://` supported, 15-min idle sleep)
3. **Database Provider:** **Supabase** (Free PostgreSQL — 500 MB storage, 5 GB egress/month, 2 projects, 7-day inactivity pause)
4. **Payment Requirement:** **None** — ₹0.00/month, zero credit card or paid upgrade required.
5. **User-Supplied Environment Variables & Secrets:**
   - Backend: `DATABASE_URL` (Supabase connection string), `JWT_SECRET` (random 64-char secret), `CORS_ORIGIN` (exact `https://` frontend URL), optional `GOOGLE_CLIENT_ID`
   - Frontend: `VITE_API_URL`, `VITE_WS_URL`, optional `VITE_GOOGLE_CLIENT_ID`
6. **DNS / Domain & Cookie Note:**
   - Default `*.pages.dev` + `*.onrender.com` are cross-site under `SameSite=Lax`. Either serve `apps/web/dist` same-origin from Render (or attach a custom domain) to keep `SameSite=Lax`, or enable `SameSite=None; Secure` for cross-site cookies.
7. **Deployment Actions Upon Approval:**
   - Run `db:migrate` against user-supplied Supabase `DATABASE_URL`.
   - Deploy Render Web Service (`node apps/server/dist/index.js`, health check `/api/ready`).
   - Deploy Cloudflare Pages (`apps/web/dist`).
   - Execute live smoke tests (health, readiness, HTTPS headers, register/login, F5 recovery, room/WS, 5-player match, PWA offline).
