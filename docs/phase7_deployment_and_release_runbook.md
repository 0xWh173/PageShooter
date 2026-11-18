# PageShooter — Phase 7 Zero-Cost Deployment & Release Runbook

**Version:** 1.0.0  
**Target Budget:** ₹0.00 / month (No credit card / billing attached)

---

## 1. Zero-Cost Production Topology

| Layer | Free-Tier Provider | Notes |
|---|---|---|
| **Database** | Supabase Free PostgreSQL | Single `users` table (ADR-01). Pool capped at `max: 5` in `apps/server/src/db/index.ts`. |
| **Backend API + WS** | Render Free Web Service | Node.js Fastify server (`apps/server`). `MAX_ACTIVE_ROOMS=20` keeps RAM < 400 MB under 512 MB limit. |
| **Frontend Web / PWA** | Cloudflare Pages / Vercel Free / Firebase Hosting | Static Vite bundle (`apps/web/dist`). Offline Pass-and-Play cached via `sw.js` (`/api/*` & `/ws` bypassed). |
| **Voice Relay (ADR-03)** | **Disabled (Fail-Closed)** | Text chat + 6 authorized emojis (`thumb`, `fire`, `skull`, `scream`, `sword`, `cheer`) active at ₹0. |

---

## 2. Environment Variables Checklist

### Backend (`apps/server/.env.example`)
- `NODE_ENV=production`
- `PORT=4000` (or Render `$PORT`)
- `HOST=0.0.0.0`
- `CORS_ORIGIN=https://<your-frontend-domain>`
- `DATABASE_URL=postgresql://...` (with `?sslmode=require` or Supabase pooler URL)
- `JWT_SECRET=<cryptographically-random-64-char-string>` *(Server refuses to boot in production if default/placeholder is used)*
- `JWT_EXPIRES_IN=24h`
- `MAX_ACTIVE_ROOMS=20`
- `GOOGLE_CLIENT_ID=<optional-google-oauth-client-id>`

### Frontend (`apps/web/.env.example`)
- `VITE_API_URL=https://<your-backend-domain>`
- `VITE_WS_URL=wss://<your-backend-domain>/ws`
- `VITE_GOOGLE_CLIENT_ID=<optional-google-oauth-client-id>`

---

## 3. Deployment Sequence

1. **Database Setup & Migration:**
   ```bash
   DATABASE_URL="<supabase-url>" npm run db:migrate --workspace=@pageshooter/server
   ```
   Verify only the single `users` table exists (ADR-01).
2. **Backend Build & Start (Render):**
   - Build Command: `npm ci && npm run build`
   - Start Command: `node apps/server/dist/index.js`
   - Health Check Path: `/api/ready`
3. **Frontend Build & Deploy:**
   - Build Command: `npm ci && npm run build:web`
   - Output Directory: `apps/web/dist`

---

## 4. Post-Deploy Smoke Verification Checklist

- [ ] `GET https://<backend>/api/health` returns `200` with `database.status: "CONNECTED"`.
- [ ] `GET https://<backend>/api/ready` returns `200` with `ready: true`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`.
- [ ] Frontend loads Offline Pass-and-Play without network access (PWA shell active).
- [ ] Register / Login sets `__Host-pageshooter_session` cookie (`HttpOnly; Secure; SameSite=Lax`) with zero JWT in response body or Web Storage.
- [ ] F5 refresh in Lobby, Waiting Room, and Active Match recovers session seamlessly via `/api/rooms/my-active`.
- [ ] 5+ players complete Turn 1 roll with SHA-256 commitment verification, shot execution, chat/emoji reactions, and victory screen.
