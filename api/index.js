import { buildServer } from "../apps/server/dist/server.js";
import { loadConfig } from "../apps/server/dist/config.js";
import { RoomManager } from "../apps/server/dist/rooms/roomManager.js";

const FALLBACK_VERCEL_JWT_SECRET =
  process.env.JWT_SECRET ||
  "vercel_serverless_pageshooter_jwt_secret_key_auto_generated_2026_99x";

async function getVercelFastifyApp(hostHeader) {
  if (!globalThis.__pageshooterVercelAppPromise) {
    globalThis.__pageshooterVercelAppPromise = (async () => {
      const originList = [
        process.env.CORS_ORIGIN || "",
        hostHeader ? `https://${hostHeader}` : "",
        hostHeader ? `http://${hostHeader}` : "",
        "http://localhost:3234",
        "http://localhost:5173"
      ]
        .filter(Boolean)
        .join(",");

      const cfg = loadConfig({
        ...process.env,
        NODE_ENV: process.env.NODE_ENV || "production",
        JWT_SECRET: FALLBACK_VERCEL_JWT_SECRET,
        CORS_ORIGIN: originList
      });

      const roomManager =
        globalThis.__pageshooterRoomManager ||
        (globalThis.__pageshooterRoomManager = new RoomManager());

      const app = buildServer({
        config: cfg,
        roomManager,
        enableRateLimit: false
      });

      await app.ready();
      return app;
    })();
  }
  return globalThis.__pageshooterVercelAppPromise;
}

export default async function handler(req, res) {
  // Dynamically ensure current Vercel deployment domain is allowed by origin checks
  if (req.headers.host && !process.env.CORS_ORIGIN) {
    process.env.CORS_ORIGIN = `https://${req.headers.host},http://${req.headers.host}`;
  }
  const app = await getVercelFastifyApp(req.headers.host);
  app.server.emit("request", req, res);
}
