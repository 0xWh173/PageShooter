import crypto from "node:crypto";
import fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import fastifyCookie from "@fastify/cookie";
import fastifyWebsocket from "@fastify/websocket";
import { MAX_WS_FRAME_BYTES } from "@pageshooter/shared";
import { config as defaultConfig, type Config } from "./config.js";
import { checkDbHealth, closeDb, getDb, type DbHealthResult, type AppDatabase } from "./db/index.js";
import { AuthService } from "./services/authService.js";
import { type GoogleTokenVerifier } from "./services/googleAuth.js";
import { RoomManager } from "./rooms/roomManager.js";
import { authRoutes } from "./routes/auth.js";
import { userRoutes } from "./routes/users.js";
import { roomRoutes } from "./routes/rooms.js";
import { WebSocketGateway } from "./ws/gateway.js";
import { revocationManager } from "./services/revocation.js";

// ADR-01: Ephemeral process generation identifier living solely in RAM
export const serverInstanceId = crypto.randomUUID();

declare module "fastify" {
  interface FastifyInstance {
    pageshooterConfig?: Config;
  }
}

export interface ServerBuildOptions {
  config?: Config;
  db?: AppDatabase;
  dbHealthCheck?: () => Promise<DbHealthResult>;
  authService?: AuthService;
  roomManager?: RoomManager;
  googleTokenVerifier?: GoogleTokenVerifier;
  enableRateLimit?: boolean;
  enableSweepTimer?: boolean;
  sweepIntervalMs?: number;
  serverInstanceId?: string;
  logger?: unknown;
  wsGateway?: WebSocketGateway;
}

function buildLoggerConfig(userLogger: unknown, isDev: boolean) {
  const reqSerializer = (req: {
    method?: string;
    url?: string;
    hostname?: string;
    ip?: string;
    socket?: { remotePort?: number };
  }) => ({
    method: req?.method,
    url: typeof req?.url === "string" ? req.url.replace(/([?&])token=[^&]*/g, "$1token=[REDACTED]") : req?.url,
    hostname: req?.hostname,
    remoteAddress: req?.ip,
    remotePort: req?.socket?.remotePort
  });

  if (userLogger === false) return false;
  if (userLogger && typeof userLogger === "object") {
    const obj = userLogger as Record<string, unknown>;
    const existingSerializers = (obj.serializers || {}) as Record<string, unknown>;
    return {
      ...obj,
      serializers: {
        req: reqSerializer,
        ...existingSerializers
      }
    };
  }
  if (userLogger === true || isDev) {
    return {
      serializers: {
        req: reqSerializer
      }
    };
  }
  return false;
}

export function buildServer(options: ServerBuildOptions = {}): FastifyInstance {
  const currentConfig = options.config ?? defaultConfig;
  const healthChecker = options.dbHealthCheck ?? (() => checkDbHealth(currentConfig.DATABASE_URL));
  const database = options.db ?? getDb(currentConfig.DATABASE_URL);
  const authService = options.authService ?? new AuthService(database);
  const roomManager =
    options.roomManager ?? new RoomManager({ maxActiveRooms: currentConfig.MAX_ACTIVE_ROOMS });
  const currentServerInstanceId = options.serverInstanceId ?? serverInstanceId;

  const app = fastify({
    logger: buildLoggerConfig(options.logger, currentConfig.NODE_ENV === "development")
  });

  app.decorate("pageshooterConfig", currentConfig);

  // CORS Configuration
  const allowedOrigins = currentConfig.CORS_ORIGIN.split(",").map((o) => o.trim());
  app.register(cors, {
    origin: (origin, cb) => {
      // Allow requests with no origin (like mobile apps, curl, server-to-server)
      if (!origin) {
        cb(null, true);
        return;
      }
      if (allowedOrigins.includes(origin) || allowedOrigins.includes("*")) {
        cb(null, true);
        return;
      }
      if (
        currentConfig.COOKIE_SAMESITE === "none" &&
        (/^https:\/\/[a-z0-9-]+\.discordsays\.com$/i.test(origin) ||
          /^https:\/\/pageshooter[a-z0-9-]*\.vercel\.app$/i.test(origin))
      ) {
        cb(null, true);
        return;
      }
      const corsError = new Error("CORS origin not allowed");
      (corsError as { statusCode?: number }).statusCode = 403;
      cb(corsError, false);
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-PageShooter-Client", "x-pageshooter-client"]
  });

  // Cookie Support for HttpOnly Session Management
  app.register(fastifyCookie);

  // Security Headers (Helmet) — enforcing no-referrer, frameguard, and prod HSTS
  app.register(helmet, {
    contentSecurityPolicy: currentConfig.NODE_ENV === "production",
    referrerPolicy: { policy: "no-referrer" },
    frameguard: { action: "deny" },
    hsts:
      currentConfig.NODE_ENV === "production"
        ? { maxAge: 31536000, includeSubDomains: true }
        : false
  });

  // Rate Limiting (Global fallback: 100 requests / minute)
  const isRateLimitEnabled = options.enableRateLimit ?? true;
  if (isRateLimitEnabled) {
    app.register(rateLimit, {
      max: 100,
      timeWindow: "1 minute"
    });
  }

  // Register WebSocket plugin with 4 KB max payload frame limit
  app.register(fastifyWebsocket, {
    options: {
      maxPayload: MAX_WS_FRAME_BYTES
    }
  });

  // Initialize and register WebSocket Gateway inside Fastify plugin scope
  const wsGateway =
    options.wsGateway ??
    new WebSocketGateway({
      authService,
      roomManager,
      serverInstanceId: currentServerInstanceId,
      nodeEnv: currentConfig.NODE_ENV,
      corsOrigin: currentConfig.CORS_ORIGIN,
      revocationManager
    });

  app.register(async (wsScope) => {
    wsGateway.register(wsScope);
  });

  // Root Info Route
  app.get("/", async () => {
    return {
      name: "PageShooter Multiplayer Server",
      version: "1.0.0",
      phase: "6.4",
      status: "ONLINE",
      serverInstanceId: currentServerInstanceId
    };
  });

  // Health Endpoint: System & Database Connectivity
  app.get("/api/health", async (_request, reply) => {
    const dbHealth = await healthChecker();
    const isHealthy = dbHealth.ok;

    const payload = {
      status: isHealthy ? "HEALTHY" : "DEGRADED",
      uptime: Math.round(process.uptime() * 100) / 100,
      timestamp: new Date().toISOString(),
      version: "1.0.0",
      database: isHealthy
        ? {
            status: "CONNECTED",
            latencyMs: dbHealth.latencyMs
          }
        : {
            status: "DISCONNECTED",
            error: dbHealth.error ?? "Database connectivity failure"
          }
    };

    const statusCode = isHealthy ? 200 : 503;
    return reply.status(statusCode).send(payload);
  });

  // Readiness Endpoint: DB + RAM headroom (normal full room capacity keeps server 200 Ready)
  app.get("/api/ready", async (_request, reply) => {
    const dbHealth = await healthChecker();
    const rssMb = Math.round((process.memoryUsage().rss / 1024 / 1024) * 100) / 100;
    const activeRooms = roomManager.roomCount;
    const maxRooms = roomManager.maxCapacity;
    const isReady = dbHealth.ok && rssMb < 450;

    return reply.status(isReady ? 200 : 503).send({
      ready: isReady,
      acceptingNewRooms: activeRooms < maxRooms,
      databaseOk: dbHealth.ok,
      rssMb,
      activeRooms,
      maxActiveRooms: maxRooms
    });
  });

  // Authentication & User REST API Routes
  app.register(authRoutes, {
    prefix: "/api/auth",
    authService,
    googleTokenVerifier: options.googleTokenVerifier,
    wsGateway
  });

  app.register(userRoutes, {
    prefix: "/api/users",
    authService
  });

  // Room & Spectator Management REST API Routes (Phase 6.4)
  app.register(roomRoutes, {
    prefix: "/api/rooms",
    roomManager,
    authService
  });

  // Periodic room expiration sweep (Requirement 3: every 60 seconds, unref'd, cleared on shutdown)
  let sweepTimer: NodeJS.Timeout | null = null;
  const isSweepEnabled = options.enableSweepTimer ?? true;
  if (isSweepEnabled) {
    const sweepInterval = options.sweepIntervalMs ?? 60_000;
    sweepTimer = setInterval(() => {
      try {
        roomManager.sweepExpiredRooms();
      } catch (err) {
        app.log.error(err, "Error executing periodic room expiration sweep");
      }
    }, sweepInterval);

    if (typeof sweepTimer.unref === "function") {
      sweepTimer.unref();
    }
  }

  // Graceful DB disconnect and timer cleanup on server close
  app.addHook("onClose", async () => {
    wsGateway.closeAll();
    revocationManager.close();
    roomManager.clear();
    if (sweepTimer) {
      clearInterval(sweepTimer);
      sweepTimer = null;
    }
    await closeDb();
  });

  return app;
}
