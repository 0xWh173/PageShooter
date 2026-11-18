# PageShooter — Phase 8.2 Independent Security & Release Audit

**Date:** 2026-11-18  
**Phase:** Phase 8.2 — Independent Security & Release Audit  
**Scope:** Backend (`apps/server`), Frontend (`apps/web`), Shared (`packages/shared`, `packages/game-engine`), Dependencies (`npm audit`), Infrastructure & Capacity

---

## 1. Executive Summary

An independent code-level and dependency security audit of PageShooter was performed across authentication, authorization, application security, WebSocket protocol handling, and infrastructure capacity.

- **2 code-level security/availability defects** (`SEC-01`, `SEC-02`) were identified, **fixed**, and **retested**.
- **2 runtime dependency advisories** (`SEC-03`, `SEC-04`) and **2 informational/hardening observations** (`SEC-05`, `SEC-06`) are documented below with exact mitigations and upgrade paths.
- **0 unresolved Critical or High code-level vulnerabilities** remain.

---

## 2. Audit Findings & Remediation Status

| ID | Severity | Area | File & Lines | Finding & Impact | Remediation & Status |
|---|---|---|---|---|---|
| **SEC-01** | **High** | Infrastructure / Availability | [`apps/server/src/server.ts`](file:///c:/Games/PageShooter/apps/server/src/server.ts#L199-L212) | `/api/ready` returned HTTP `503` whenever `activeRooms >= maxRooms` (`MAX_ACTIVE_ROOMS`). When configured as Render's health check path, reaching normal full room capacity (20/20 rooms) would cause the orchestrator to mark a healthy server as dead and restart it, wiping all 20 active RAM matches. | **FIXED & RETESTED:** `/api/ready` now returns `200` (`ready: true`, `acceptingNewRooms: false`) when DB & RAM (`rssMb < 450`) are healthy even at full room capacity; `POST /api/rooms` continues to enforce `503 SERVER_CAPACITY_REACHED`. Verified in [`phase7Hardening.test.ts`](file:///c:/Games/PageShooter/apps/server/test/phase7Hardening.test.ts). |
| **SEC-02** | **Medium** | Authentication | [`apps/server/src/middleware/auth.ts`](file:///c:/Games/PageShooter/apps/server/src/middleware/auth.ts#L29-L31) | `requireAuth` accepted `Authorization: Bearer <JWT>` in all environments (including `production`), whereas `WebSocketGateway` restricted non-cookie fallback strictly to `NODE_ENV === "test"`. | **FIXED & RETESTED:** Restricted `Bearer` header fallback in `requireAuth` to `currentConfig.NODE_ENV === "test"`, enforcing strict `HttpOnly` cookie authentication in production. |
| **SEC-03** | **High (Mitigated)** | Dependencies | `package-lock.json` (`drizzle-orm <0.45.2`) | `npm audit` reported GHSA-gpj5-g38j-94v9 (SQL injection via improperly escaped SQL identifiers). **Mitigation:** PageShooter uses strictly static Drizzle schema identifiers on the single `users` table ([`schema.ts`](file:///c:/Games/PageShooter/apps/server/src/db/schema.ts)); no user-controlled table or column identifiers are ever passed to Drizzle. | **MITIGATED (Upgrade Recommended):** Plan major-version upgrade to `drizzle-orm >= 0.45.2` during a scheduled dependency bump (requires breaking-change verification). |
| **SEC-04** | **High (Mitigated)** | Dependencies | `package-lock.json` (`zod <4.6.6`) | `npm audit` reported GHSA-mrhx-c7xc-m3w5 (memory exhaustion on oversized constrained collections). **Mitigation:** WebSocket frames are capped at `MAX_WS_FRAME_BYTES = 4096` (4 KB) in [`server.ts`](file:///c:/Games/PageShooter/apps/server/src/server.ts#L135-L139) and REST payloads use Fastify's default 1 MB limit with strict field bounds. | **MITIGATED (Upgrade Recommended):** Upgrade `zod >= 4.6.6` in a future dependency maintenance pass. |
| **SEC-05** | **Low** | Error Handling | [`apps/server/src/routes/rooms.ts`](file:///c:/Games/PageShooter/apps/server/src/routes/rooms.ts#L72-L78) | For unexpected `500` errors, `err.message` is forwarded in the JSON response rather than a generic message in production. | **DOCUMENTED:** Low risk (no stack traces are sent); mask `statusCode >= 500` messages in production as a future polish item. |
| **SEC-06** | **Informational** | Dev Dependencies | `package-lock.json` (`esbuild`, `minimatch`, `picomatch`) | `npm audit` flagged 12 moderate + picomatch dev-only advisories in `drizzle-kit`, `eslint`, `vite`, and `vitest`. None are shipped in the runtime server or browser bundle. | **ACCEPTED:** Dev/build-time only; no runtime exposure. |

---

## 3. Domain-by-Domain Verification Summary

| Domain | Controls Verified | Verdict |
|---|---|---|
| **Auth & Session** | Argon2id (`m=19456, t=2, p=1`) + `dummyVerify` timing defense ([`password.ts`](file:///c:/Games/PageShooter/apps/server/src/services/password.ts)); HS256 JWT with `iss: "pageshooter-server"`, `aud: "pageshooter-client"` ([`token.ts`](file:///c:/Games/PageShooter/apps/server/src/services/token.ts)); prod `__Host-pageshooter_session` (`HttpOnly; Secure; SameSite=Lax; Path=/`) & `assertProductionSecrets` ([`config.ts`](file:///c:/Games/PageShooter/apps/server/src/config.ts)); fail-closed `RevocationManager` ([`revocation.ts`](file:///c:/Games/PageShooter/apps/server/src/services/revocation.ts)); dual-layer CSRF (`X-PageShooter-Client: web` + `Origin`) & CSWSH Origin validation ([`gateway.ts`](file:///c:/Games/PageShooter/apps/server/src/ws/gateway.ts)). | **PASS** |
| **Authorization** | Host-only `kickPlayer` & `startMatch` (`403 NOT_HOST`); player-only `executeRoll` & `executeShot` (`403 SPECTATOR_FORBIDDEN`, `400 PLAYER_ELIMINATED`); kicked sockets immediately unsubscribed from `RoomBroadcaster` and rejected with `NOT_A_PLAYER`; active-match single-room guard enforced across REST and WS. | **PASS** |
| **App Security** | React text-node rendering (no `dangerouslySetInnerHTML`); Drizzle parameterized queries; Helmet `frameguard: deny`, `referrerPolicy: no-referrer`, prod `hsts` & strict default `contentSecurityPolicy` (no `unsafe-inline`); token redaction in Fastify logger; `sw.js` bypasses `/api/*` and `/ws`. | **PASS** |
| **WebSocket Security** | `WSClientMessageSchema` Zod validation; `4096` byte `maxPayload`; `expectedStateVersion` + `commandId` replay protection; chat (`1/2s`, `30s` mute) & emoji (`2/s` silent drop, 6-ID whitelist); multi-tab `4409` supersession; 60s independent disconnect timers. | **PASS** |
| **Infra & Capacity** | `MAX_ACTIVE_ROOMS=20` atomic single-threaded check in `RoomManager.createRoom`; PostgreSQL pool capped at `max: 5` ([`db/index.ts`](file:///c:/Games/PageShooter/apps/server/src/db/index.ts)); `/api/ready` stays `200` at full room capacity; ₹0 budget preserved. | **PASS** |

---

## 4. Regression Quality Gates (After Phase 8.2 Fixes)

- `npm.cmd test`: **304/304 passed** across **39 test files**
- `npm.cmd run typecheck`: **0 errors**
- `npm.cmd run lint`: **0 errors, 0 warnings**
- `npm.cmd run build`: **Passed cleanly**

**Gate Verdict:** **PASS — Zero unresolved Critical or High code-level findings. Authorized to proceed to Phase 8.3.**
