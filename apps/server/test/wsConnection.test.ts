import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { AddressInfo } from "node:net";
import { WebSocket } from "ws";
import {
  WS_CLOSE_CODE_UNAUTHORIZED,
  WS_CLOSE_CODE_FRAME_TOO_LARGE,
  type WSServerMessage
} from "@pageshooter/shared";
import { buildServer } from "../src/server.js";
import { generateToken } from "../src/services/token.js";
import { RoomManager } from "../src/rooms/roomManager.js";

function waitForMessage(ws: WebSocket): Promise<WSServerMessage> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for message"));
    }, 3000);

    ws.once("message", (data) => {
      clearTimeout(timer);
      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject(err);
      }
    });

    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

function waitForClose(ws: WebSocket): Promise<{ code: number; reason: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timeout waiting for close"));
    }, 3000);

    ws.once("close", (code, reason) => {
      clearTimeout(timer);
      resolve({ code, reason: reason.toString() });
    });

    ws.once("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

describe("WebSocket Handshake, Authentication & Liveness (wsConnection.test.ts)", () => {
  let app: ReturnType<typeof buildServer>;
  let wsBaseUrl: string;
  let logLines: string[] = [];

  beforeAll(async () => {
    logLines = [];
    app = buildServer({
      enableRateLimit: false,
      enableSweepTimer: false,
      dbHealthCheck: async () => ({ ok: true, latencyMs: 1 }),
      logger: {
        level: "info",
        stream: {
          write: (chunk: string) => {
            logLines.push(chunk);
          }
        }
      }
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address() as AddressInfo;
    wsBaseUrl = `ws://127.0.0.1:${addr.port}/ws`;
  });

  afterAll(async () => {
    await app.close();
  });

  it("rejects connection without token query parameter with close code 4401", async () => {
    const ws = new WebSocket(wsBaseUrl);
    const { code } = await waitForClose(ws);
    expect(code).toBe(WS_CLOSE_CODE_UNAUTHORIZED);
  });

  it("rejects connection with invalid or tampered token with close code 4401", async () => {
    const ws = new WebSocket(`${wsBaseUrl}?token=tampered.token.here`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(WS_CLOSE_CODE_UNAUTHORIZED);
  });

  it("rejects connection with expired token with close code 4401", async () => {
    const expiredToken = generateToken(
      { userId: "usr-expired", username: "ghost" },
      "-1s"
    );
    const ws = new WebSocket(`${wsBaseUrl}?token=${expiredToken}`);
    const { code } = await waitForClose(ws);
    expect(code).toBe(WS_CLOSE_CODE_UNAUTHORIZED);
  });

  it("authenticates valid 7-day token and sends AUTH_SUCCESS with serverInstanceId", async () => {
    const token = generateToken({ userId: "usr-alice", username: "Alice" });
    const ws = new WebSocket(`${wsBaseUrl}?token=${token}`);

    const msg = await waitForMessage(ws);
    expect(msg.type).toBe("AUTH_SUCCESS");
    if (msg.type === "AUTH_SUCCESS") {
      expect(msg.userId).toBe("usr-alice");
      expect(msg.username).toBe("Alice");
      expect(typeof msg.serverInstanceId).toBe("string");
      expect(msg.serverInstanceId.length).toBeGreaterThan(10);
    }

    ws.close();
    await waitForClose(ws);
  });

  it("redacts JWT tokens from application server logs", async () => {
    const secretJwt = generateToken({ userId: "usr-secret", username: "SecretAgent" });
    const ws = new WebSocket(`${wsBaseUrl}?token=${secretJwt}`);
    await waitForMessage(ws);
    ws.close();
    await waitForClose(ws);

    // Verify logs do NOT contain the raw JWT
    const hasRawSecret = logLines.some((line) => line.includes(secretJwt));
    expect(hasRawSecret).toBe(false);

    // Verify logs DO contain token=[REDACTED]
    const hasRedactedToken = logLines.some((line) => line.includes("token=[REDACTED]"));
    expect(hasRedactedToken).toBe(true);
  });

  it("closes socket with code 1009 when payload exceeds 4 KB (4096 bytes)", async () => {
    const token = generateToken({ userId: "usr-oversize", username: "BigPayload" });
    const ws = new WebSocket(`${wsBaseUrl}?token=${token}`);
    await waitForMessage(ws); // AUTH_SUCCESS

    // Send payload > 4096 bytes
    const largePayload = JSON.stringify({
      type: "SEND_CHAT_MESSAGE",
      correlationId: "cid-overflow",
      roomCode: "ABCDEF",
      message: "x".repeat(4500)
    });

    ws.send(largePayload);
    const { code } = await waitForClose(ws);
    expect(code).toBe(WS_CLOSE_CODE_FRAME_TOO_LARGE);
  });

  it("returns MALFORMED_JSON error when client sends unparseable frame", async () => {
    const token = generateToken({ userId: "usr-badjson", username: "Malformed" });
    const ws = new WebSocket(`${wsBaseUrl}?token=${token}`);
    await waitForMessage(ws); // AUTH_SUCCESS

    ws.send("this is definitely not json { [");
    const response = await waitForMessage(ws);

    expect(response.type).toBe("ERROR");
    if (response.type === "ERROR") {
      expect(response.code).toBe("MALFORMED_JSON");
    }

    ws.close();
    await waitForClose(ws);
  });

  it("responds with PONG to client PING heartbeat frame", async () => {
    const token = generateToken({ userId: "usr-pinger", username: "HeartbeatTester" });
    const ws = new WebSocket(`${wsBaseUrl}?token=${token}`);
    await waitForMessage(ws); // AUTH_SUCCESS

    ws.send(JSON.stringify({ type: "PING" }));
    const response = await waitForMessage(ws);

    expect(response.type).toBe("PONG");

    ws.close();
    await waitForClose(ws);
  });
});
