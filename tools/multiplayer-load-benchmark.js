import { performance, monitorEventLoopDelay } from "node:perf_hooks";
import { WebSocket } from "ws";
import { buildServer } from "../apps/server/dist/server.js";
import { RoomManager } from "../apps/server/dist/rooms/roomManager.js";
import { generateToken } from "../apps/server/dist/services/token.js";

const STAGES = [1, 5, 10, 15, 20];
const PLAYERS_PER_ROOM = 10;
const SPECTATORS_PER_ROOM = 2;

function createClient(wsUrl, userId, username) {
  return new Promise((resolve, reject) => {
    const token = generateToken({ userId, username });
    const ws = new WebSocket(wsUrl, {
      headers: {
        Origin: "http://localhost:5173",
        Cookie: `pageshooter_session=${token}`
      }
    });

    const waiters = [];
    const queue = [];
    let dropped = false;

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      const idx = waiters.findIndex((w) => w.type === msg.type);
      if (idx !== -1) {
        const [w] = waiters.splice(idx, 1);
        w.resolve(msg);
      } else {
        queue.push(msg);
      }
    });

    ws.on("close", (code) => {
      if (code !== 1000) dropped = true;
    });

    ws.on("error", reject);

    const client = {
      ws,
      userId,
      username,
      get dropped() {
        return dropped;
      },
      send(payload) {
        ws.send(JSON.stringify(payload));
      },
      waitFor(type, timeoutMs = 10000) {
        const qIdx = queue.findIndex((m) => m.type === type);
        if (qIdx !== -1) {
          return Promise.resolve(queue.splice(qIdx, 1)[0]);
        }
        return new Promise((res, rej) => {
          const timer = setTimeout(() => rej(new Error(`Timeout waiting for ${type}`)), timeoutMs);
          waiters.push({
            type,
            resolve: (m) => {
              clearTimeout(timer);
              res(m);
            }
          });
        });
      },
      close() {
        try {
          ws.close(1000, "Benchmark complete");
        } catch {
          // Ignore
        }
      }
    };

    client.waitFor("AUTH_SUCCESS").then(() => resolve(client)).catch(reject);
  });
}

async function runStage(roomCount) {
  const roomManager = new RoomManager();
  const app = buildServer({
    enableRateLimit: false,
    enableSweepTimer: false,
    roomManager,
    dbHealthCheck: async () => ({ ok: true, latencyMs: 1 })
  });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const addr = app.server.address();
  const wsUrl = `ws://127.0.0.1:${addr.port}/ws`;

  const loopMonitor = monitorEventLoopDelay({ resolution: 10 });
  loopMonitor.enable();

  const allClients = [];
  const rtts = [];

  try {
    for (let r = 0; r < roomCount; r++) {
      const players = [];
      const spectators = [];

      for (let p = 0; p < PLAYERS_PER_ROOM; p++) {
        const uid = `00000000-0000-4000-${String(r).padStart(4, "0")}-${String(p + 1).padStart(12, "0")}`;
        const c = await createClient(wsUrl, uid, `R${r}P${p + 1}`);
        players.push(c);
        allClients.push(c);
      }

      for (let s = 0; s < SPECTATORS_PER_ROOM; s++) {
        const uid = `00000000-0000-4000-${String(r + 1000).padStart(4, "0")}-${String(s + 1).padStart(12, "0")}`;
        const c = await createClient(wsUrl, uid, `R${r}S${s + 1}`);
        spectators.push(c);
        allClients.push(c);
      }

      const room = roomManager.createRoom({
        id: players[0].userId,
        username: players[0].username,
        avatarId: "barnaby"
      });

      for (const p of players) {
        p.send({ type: "JOIN_ROOM", correlationId: `j-${p.userId}`, roomCode: room.roomCode });
        await p.waitFor("ROOM_SNAPSHOT");
      }
      for (const sp of spectators) {
        sp.send({ type: "JOIN_AS_SPECTATOR", correlationId: `js-${sp.userId}`, roomCode: room.roomCode });
        await sp.waitFor("ROOM_SNAPSHOT");
      }

      // Start match and measure RTT of START_MATCH + ROLL_REQUEST + EMOJI_BROADCAST
      const tStart = performance.now();
      players[0].send({ type: "START_MATCH", correlationId: `st-${r}`, roomCode: room.roomCode });
      const started = await Promise.all(players.map((p) => p.waitFor("MATCH_STARTED")));
      rtts.push(performance.now() - tStart);

      const matchState = started[0].matchState;
      const activePlayer = players.find((p) => p.userId === matchState.turn.currentPlayerId);

      const tRoll = performance.now();
      activePlayer.send({
        type: "ROLL_REQUEST",
        correlationId: `rl-${r}`,
        roomCode: room.roomCode,
        expectedStateVersion: matchState.version
      });
      await Promise.all([
        ...players.map((p) => p.waitFor("MATCH_STATE_SYNC")),
        ...spectators.map((sp) => sp.waitFor("MATCH_STATE_SYNC"))
      ]);
      rtts.push(performance.now() - tRoll);

      // Spectator sends emoji
      const tEmoji = performance.now();
      spectators[0].send({
        type: "SEND_EMOJI_REACTION",
        correlationId: `em-${r}`,
        roomCode: room.roomCode,
        emojiId: "fire"
      });
      await players[0].waitFor("EMOJI_BROADCAST");
      rtts.push(performance.now() - tEmoji);
    }

    const mem = process.memoryUsage();
    const sortedRtts = [...rtts].sort((a, b) => a - b);
    const avgRtt = sortedRtts.reduce((a, b) => a + b, 0) / sortedRtts.length;
    const p95Rtt = sortedRtts[Math.floor(sortedRtts.length * 0.95)] ?? avgRtt;
    const drops = allClients.filter((c) => c.dropped).length;

    return {
      rooms: roomCount,
      totalClients: allClients.length,
      rssMb: Number((mem.rss / 1024 / 1024).toFixed(2)),
      heapUsedMb: Number((mem.heapUsed / 1024 / 1024).toFixed(2)),
      eventLoopLagMeanMs: Number((loopMonitor.mean / 1e6).toFixed(2)),
      eventLoopLagP99Ms: Number((loopMonitor.percentile(99) / 1e6).toFixed(2)),
      avgRttMs: Number(avgRtt.toFixed(2)),
      p95RttMs: Number(p95Rtt.toFixed(2)),
      dropCount: drops
    };
  } finally {
    loopMonitor.disable();
    for (const c of allClients) c.close();
    await app.close();
  }
}

async function main() {
  console.log("PageShooter Phase 6.8 — Empirical Multi-Client Load Benchmark");
  console.log("=============================================================");
  const results = [];
  for (const stage of STAGES) {
    const res = await runStage(stage);
    results.push(res);
    console.log(
      `Rooms: ${String(res.rooms).padStart(2)} | Clients: ${String(res.totalClients).padStart(3)} | ` +
      `RSS: ${res.rssMb} MB | Heap: ${res.heapUsedMb} MB | ` +
      `LoopMean: ${res.eventLoopLagMeanMs} ms | AvgRTT: ${res.avgRttMs} ms | P95RTT: ${res.p95RttMs} ms | Drops: ${res.dropCount}`
    );
  }
  console.log("\nJSON_RESULTS=" + JSON.stringify(results));
}

main().catch((err) => {
  console.error("Benchmark failed:", err);
  process.exit(1);
});
