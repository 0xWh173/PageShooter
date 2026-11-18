import crypto from "node:crypto";
import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { WebSocket } from "ws";
import {
  WS_CLOSE_CODE_UNAUTHORIZED,
  WS_HEARTBEAT_INTERVAL_MS
} from "@pageshooter/shared";
import { config, getSessionCookieName } from "../config.js";
import type { AuthService } from "../services/authService.js";
import { verifyToken, type TokenPayload } from "../services/token.js";
import { revocationManager as defaultRevocationManager, type RevocationManager } from "../services/revocation.js";
import type { RoomManager } from "../rooms/roomManager.js";
import { RoomBroadcaster } from "./roomBroadcaster.js";
import { ReconnectManager } from "./reconnectManager.js";
import { WSDispatcher } from "./dispatcher.js";
import type { WSConnectionContext } from "./types.js";

export interface WebSocketGatewayOptions {
  authService: AuthService;
  roomManager: RoomManager;
  serverInstanceId: string;
  nodeEnv?: string;
  corsOrigin?: string;
  revocationManager?: RevocationManager;
}

export class WebSocketGateway {
  public readonly broadcaster: RoomBroadcaster;
  public readonly reconnectManager: ReconnectManager;
  public readonly dispatcher: WSDispatcher;
  public readonly serverInstanceId: string;
  public readonly nodeEnv: string;
  public readonly corsOrigin: string;
  public readonly revocationManager: RevocationManager;
  private authService: AuthService;
  private activeIntervals = new Set<NodeJS.Timeout>();

  constructor(options: WebSocketGatewayOptions) {
    this.authService = options.authService;
    this.serverInstanceId = options.serverInstanceId;
    this.nodeEnv = options.nodeEnv ?? config.NODE_ENV;
    this.corsOrigin = options.corsOrigin ?? config.CORS_ORIGIN;
    this.revocationManager = options.revocationManager ?? defaultRevocationManager;
    this.broadcaster = new RoomBroadcaster();
    this.reconnectManager = new ReconnectManager(
      options.roomManager,
      this.broadcaster,
      this.serverInstanceId
    );
    this.dispatcher = new WSDispatcher(
      options.roomManager,
      this.broadcaster,
      this.reconnectManager,
      this.serverInstanceId,
      this.revocationManager
    );
  }

  register(fastifyApp: FastifyInstance): void {
    fastifyApp.get(
      "/ws",
      {
        websocket: true,
        preHandler: async (request: FastifyRequest, reply: FastifyReply) => {
          const origin = request.headers.origin;
          const allowedOrigins = (this.corsOrigin || "").split(",").map((o) => o.trim());

          // CSWSH Defense: Validate origin before HTTP 101 Switching Protocols
          if (this.nodeEnv === "production" && !origin) {
            return reply.status(403).send({
              statusCode: 403,
              error: "FORBIDDEN_ORIGIN",
              message: "Missing Origin header on WebSocket upgrade"
            });
          }

          if (origin && !allowedOrigins.includes(origin) && !allowedOrigins.includes("*")) {
            return reply.status(403).send({
              statusCode: 403,
              error: "FORBIDDEN_ORIGIN",
              message: "Forbidden WebSocket origin"
            });
          }
        }
      },
      (socket: WebSocket, request: FastifyRequest) => {
        this.handleConnection(socket, request);
      }
    );
  }

  private handleConnection(socket: WebSocket, request: FastifyRequest): void {
    // 1. Strict Origin Validation (CSWSH defense fallback)
    const origin = request.headers.origin;
    const allowedOrigins = (this.corsOrigin || "").split(",").map((o) => o.trim());
    if (this.nodeEnv !== "test" || origin) {
      if (!origin || (!allowedOrigins.includes(origin) && !allowedOrigins.includes("*"))) {
        socket.close(WS_CLOSE_CODE_UNAUTHORIZED, "Forbidden WebSocket origin");
        return;
      }
    }

    // 2. Authentication: Cookie-first with query-string fallback strictly in test environment
    const cookieName = getSessionCookieName(this.nodeEnv);
    const cookieToken =
      request.cookies?.[cookieName] ??
      request.cookies?.["__Host-pageshooter_session"] ??
      request.cookies?.["pageshooter_session"];
    const query = (request.query || {}) as Record<string, string | undefined>;
    const queryToken = query.token;

    let token: string | undefined = cookieToken;

    if (!token && queryToken) {
      if (this.nodeEnv === "test") {
        token = queryToken;
      } else {
        socket.close(WS_CLOSE_CODE_UNAUTHORIZED, "Query token forbidden in production");
        return;
      }
    }

    if (!token) {
      socket.close(WS_CLOSE_CODE_UNAUTHORIZED, "Missing authentication session");
      return;
    }

    // 3. JWT Verification & Revocation Check
    let payload: TokenPayload;
    try {
      payload = verifyToken(token);
    } catch {
      socket.close(WS_CLOSE_CODE_UNAUTHORIZED, "Invalid or expired token");
      return;
    }

    if (payload.jti && this.revocationManager.isRevoked(payload.jti)) {
      socket.close(WS_CLOSE_CODE_UNAUTHORIZED, "Session revoked");
      return;
    }

    const socketId = crypto.randomUUID();
    const context: WSConnectionContext = {
      socketId,
      userId: payload.userId,
      username: payload.username,
      jti: payload.jti,
      roomCode: null,
      socket,
      isAlive: true,
      superseded: false,
      lastChatMessageTime: 0,
      mutedUntil: 0,
      emojiTimestamps: []
    };

    this.broadcaster.registerSocket(context);

    // 4. Server-Assisted Room Discovery on Handshake
    const activeResolution = this.reconnectManager["roomManager"].resolveUserRoomParticipation(payload.userId);

    // Send AUTH_SUCCESS immediately upon verified handshake
    this.broadcaster.sendToSocket(socket, {
      type: "AUTH_SUCCESS",
      userId: payload.userId,
      username: payload.username,
      serverInstanceId: this.serverInstanceId,
      activeRoomCode: activeResolution?.roomCode,
      activeRoomPhase: activeResolution?.phase,
      canReconnectMatch: activeResolution?.canReconnectMatch,
      hasActiveMatchParticipation: activeResolution?.hasActiveMatchParticipation
    });

    // 15-second connection liveness heartbeat
    const heartbeat = setInterval(() => {
      if (socket.readyState === 1 /* OPEN */) {
        this.broadcaster.sendToSocket(socket, { type: "PING" });
      }
    }, WS_HEARTBEAT_INTERVAL_MS);

    if (typeof heartbeat.unref === "function") {
      heartbeat.unref();
    }
    this.activeIntervals.add(heartbeat);

    // Message handler
    socket.on("message", (rawData) => {
      this.dispatcher.dispatchMessage(context, rawData);
    });

    // Close handler
    socket.on("close", () => {
      clearInterval(heartbeat);
      this.activeIntervals.delete(heartbeat);

      const unregistered = this.broadcaster.unregisterSocket(socketId);
      if (unregistered && unregistered.roomCode) {
        this.reconnectManager.onSocketDisconnect(unregistered, unregistered.roomCode);
      }
    });

    // Error handler
    socket.on("error", () => {
      try {
        socket.close();
      } catch {
        // Ignore
      }
    });
  }

  terminateUserSockets(userId: string, reason: string = "LOGOUT"): void {
    const sockets = this.broadcaster.getSocketsByUserId(userId);
    for (const ctx of sockets) {
      ctx.isAlive = false;
      ctx.superseded = true;
      try {
        ctx.socket.close(WS_CLOSE_CODE_UNAUTHORIZED, reason);
      } catch {
        // Ignore socket close errors
      }
      const unregistered = this.broadcaster.unregisterSocket(ctx.socketId);
      if (unregistered && unregistered.roomCode) {
        this.reconnectManager.onSocketDisconnect(unregistered, unregistered.roomCode);
      }
    }
  }

  closeAll(): void {
    for (const interval of this.activeIntervals) {
      clearInterval(interval);
    }
    this.activeIntervals.clear();
    this.broadcaster.clear();
  }
}
