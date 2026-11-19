const FALLBACK_VERCEL_JWT_SECRET =
  process.env.JWT_SECRET ||
  "vercel_serverless_pageshooter_jwt_secret_key_auto_generated_2026_99x";

async function getVercelFastifyApp(hostHeader) {
  if (!globalThis.__pageshooterVercelAppPromise) {
    globalThis.__pageshooterVercelAppPromise = (async () => {
      // Set env vars BEFORE dynamically importing server/config so module-level config & token.ts pick them up
      if (!process.env.NODE_ENV) {
        process.env.NODE_ENV = "production";
      }
      if (!process.env.JWT_SECRET) {
        process.env.JWT_SECRET = FALLBACK_VERCEL_JWT_SECRET;
      }

      const originList = [
        process.env.CORS_ORIGIN || "",
        hostHeader ? `https://${hostHeader}` : "",
        hostHeader ? `http://${hostHeader}` : "",
        "http://localhost:3234",
        "http://localhost:5173"
      ]
        .filter(Boolean)
        .join(",");
      process.env.CORS_ORIGIN = originList;

      const [{ buildServer }, { loadConfig }, { RoomManager }] = await Promise.all([
        import("../apps/server/dist/server.js"),
        import("../apps/server/dist/config.js"),
        import("../apps/server/dist/rooms/roomManager.js")
      ]);

      const cfg = loadConfig({
        ...process.env,
        NODE_ENV: process.env.NODE_ENV,
        JWT_SECRET: process.env.JWT_SECRET,
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
  const app = await getVercelFastifyApp(req.headers.host);
  app.server.emit("request", req, res);
}
