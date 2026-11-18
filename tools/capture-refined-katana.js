import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 5175;
const DIST_DIR = path.resolve("apps/web/dist");
const ARTIFACTS_DIR = "C:/Users/Osama Yusouf/.gemini/antigravity/brain/f608478c-72b0-4894-8cae-93bb137c1243/screenshots";
const FRAMES_DIR = path.join(ARTIFACTS_DIR, "katana_frames");
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";
const CDP_PORT = 9444;

fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
fs.mkdirSync(FRAMES_DIR, { recursive: true });

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png"
};

function createStaticServer() {
  return http.createServer((req, res) => {
    const urlPath = req.url.split("?")[0];
    let filePath = path.join(DIST_DIR, urlPath === "/" ? "index.html" : urlPath);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(DIST_DIR, "index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    try {
      const data = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": contentType });
      res.end(data);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err));
    }
  });
}

class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.ws = null;
    this.id = 0;
    this.callbacks = new Map();
    this.eventListeners = new Map();
  }

  async connect() {
    this.ws = new WebSocket(this.wsUrl);
    await new Promise((resolve, reject) => {
      this.ws.onopen = resolve;
      this.ws.onerror = reject;
    });

    this.ws.onmessage = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id && this.callbacks.has(data.id)) {
        const { resolve, reject } = this.callbacks.get(data.id);
        this.callbacks.delete(data.id);
        if (data.error) reject(new Error(data.error.message));
        else resolve(data.result);
      } else if (data.method) {
        const listeners = this.eventListeners.get(data.method) || [];
        for (const fn of listeners) fn(data.params);
      }
    };
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.callbacks.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  on(event, fn) {
    if (!this.eventListeners.has(event)) this.eventListeners.set(event, []);
    this.eventListeners.get(event).push(fn);
  }

  close() {
    if (this.ws) this.ws.close();
  }
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function evaluate(client, expression) {
  const res = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true
  });
  if (res.exceptionDetails) {
    throw new Error(res.exceptionDetails.text || "Evaluation error");
  }
  return res.result?.value;
}

async function setViewport(client, width, height, isMobile = false) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: isMobile
  });
  await client.send("Emulation.setVisibleSize", { width, height }).catch(() => {});
}

async function captureScreenshot(client, outputPath) {
  const result = await client.send("Page.captureScreenshot", { format: "png" });
  const buffer = Buffer.from(result.data, "base64");
  fs.writeFileSync(outputPath, buffer);
  return buffer.length;
}

async function run() {
  console.log("============================================================");
  console.log("   PAGESHOOTER KATANA EXECUTION REFINEMENT VERIFICATION     ");
  console.log("============================================================\n");

  const server = createStaticServer();
  await new Promise((r) => server.listen(PORT, r));
  console.log(`[HTTP Server] Listening on http://localhost:${PORT}`);

  const chromeProcess = spawn(CHROME_PATH, [
    "--headless=new",
    `--remote-debugging-port=${CDP_PORT}`,
    "--no-sandbox",
    "--disable-gpu",
    "--hide-scrollbars",
    "--disable-extensions",
    "about:blank"
  ]);

  await sleep(1500);

  const listRes = await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`);
  const targets = await listRes.json();
  const pageTarget = targets.find((t) => t.type === "page") || targets[0];
  if (!pageTarget) throw new Error("No Chrome page target discovered!");

  console.log(`[CDP] Connected to: ${pageTarget.webSocketDebuggerUrl}`);
  const client = new CDPClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();

  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("DOM.enable");
  await client.send("Log.enable");
  await client.send("Network.enable");

  // 1. Measure Live Frame-Timing Performance
  console.log("\n--- Profiling Frame Timing at 1920x1080 ---");
  await setViewport(client, 1920, 1080, false);
  await client.send("Page.navigate", { url: `http://localhost:${PORT}/?qa_view=5p` });
  await sleep(600);

  const perfMeasurements = await evaluate(client, `
    new Promise((resolve) => {
      const frameDeltas = [];
      let lastTime = performance.now();
      let frameCount = 0;
      let running = true;

      function recordFrame(now) {
        const delta = now - lastTime;
        lastTime = now;
        if (frameCount > 0) frameDeltas.push(delta);
        frameCount++;
        if (running) requestAnimationFrame(recordFrame);
      }
      requestAnimationFrame(recordFrame);

      setTimeout(() => {
        running = false;
        const avg = frameDeltas.reduce((a, b) => a + b, 0) / frameDeltas.length;
        const sorted = [...frameDeltas].sort((a, b) => a - b);
        resolve({
          totalFrames: frameDeltas.length,
          avgDeltaMs: Number(avg.toFixed(2)),
          minDeltaMs: Number(Math.min(...frameDeltas).toFixed(2)),
          maxDeltaMs: Number(Math.max(...frameDeltas).toFixed(2)),
          p95DeltaMs: Number(sorted[Math.floor(sorted.length * 0.95)].toFixed(2)),
          effectiveFps: Number((1000 / avg).toFixed(1)),
          droppedFrames: frameDeltas.filter(d => d > 24).length
        });
      }, 2000);
    })
  `);
  console.log("Measured Performance:", perfMeasurements);

  // 2. Capture Desktop & Mobile Battlefield Recordings
  console.log("\n--- Capturing Desktop and Mobile Battlefield ---");
  await setViewport(client, 1920, 1080, false);
  await client.send("Page.navigate", { url: `http://localhost:${PORT}/?qa_view=5p` });
  await sleep(500);
  await captureScreenshot(client, path.join(ARTIFACTS_DIR, "katana_battlefield_armed.png"));

  await setViewport(client, 390, 844, true);
  await client.send("Page.navigate", { url: `http://localhost:${PORT}/?qa_view=5p` });
  await sleep(500);
  await captureScreenshot(client, path.join(ARTIFACTS_DIR, "handdrawn_mobile_battlefield.png"));

  // 3. Capture 25 Continuous Frames Across the Full Katana Execution
  console.log("\n--- Capturing 25 Sequential Frames Across Entire Katana Execution ---");
  await setViewport(client, 1280, 820, false);

  const frameTimes = [
    // Phase 1: Target Lock / Focus (0 - 240ms)
    { t: 0, label: "01_focus_lock_0ms" },
    { t: 120, label: "02_focus_draw_120ms" },
    // Phase 2: Lightning Dash Across (240 - 580ms)
    { t: 260, label: "03_dash_accel_260ms" },
    { t: 330, label: "04_dash_blur_330ms" },
    { t: 410, label: "05_dash_crossing_mid_410ms" },
    { t: 460, label: "06_dash_blade_contact_460ms" },
    { t: 520, label: "07_dash_exit_right_520ms" },
    // Phase 3: Razor Slash Impact & Localized Flash (580 - 720ms)
    { t: 610, label: "08_slash_impact_flash_610ms" },
    { t: 670, label: "09_slash_razor_trail_670ms" },
    // Phase 4: Screen Blood Splatter Overlay (720 - 1100ms)
    { t: 760, label: "10_screen_blood_burst_760ms" },
    { t: 850, label: "11_screen_blood_splatter_850ms" },
    { t: 960, label: "12_screen_blood_drips_960ms" },
    { t: 1060, label: "13_screen_blood_still_stance_1060ms" },
    // Phase 5: Chiburui - Swinging Reaper Grim to Flick Blood Off (1100 - 1580ms)
    { t: 1140, label: "14_chiburui_swing_init_1140ms" },
    { t: 1240, label: "15_chiburui_arc_motion_1240ms" },
    { t: 1340, label: "16_chiburui_blood_flick_droplets_1340ms" },
    { t: 1450, label: "17_chiburui_blood_cleared_1450ms" },
    { t: 1540, label: "18_chiburui_swing_followthrough_1540ms" },
    // Phase 6: Sheathe Lock (*KLICK-CLACK*) (1580 - 1920ms)
    { t: 1650, label: "19_sheathe_guide_into_saya_1650ms" },
    { t: 1750, label: "20_sheathe_spark_click_clack_1750ms" },
    { t: 1850, label: "21_sheathe_locked_clean_1850ms" },
    // Phase 7: Knockout & Collapse (1920 - 2220ms)
    { t: 1960, label: "22_knockout_target_buckle_1960ms" },
    { t: 2060, label: "23_knockout_ko_stamp_2060ms" },
    // Phase 8: Execution Complete / Resolve (2220 - 2500ms)
    { t: 2260, label: "24_resolve_tall_pose_2260ms" },
    { t: 2400, label: "25_resolve_duel_complete_2400ms" }
  ];

  const capturedPaths = [];
  for (const ft of frameTimes) {
    const url = `http://localhost:${PORT}/?qa_view=combat_flow&time=${ft.t}`;
    await client.send("Page.navigate", { url });
    await sleep(80);
    const framePath = path.join(FRAMES_DIR, `${ft.label}.png`);
    await captureScreenshot(client, framePath);
    capturedPaths.push({ ...ft, path: framePath });
    process.stdout.write(`.`);
  }
  console.log(`\nSuccessfully captured ${capturedPaths.length} distinct frames to ${FRAMES_DIR}`);

  // 4. Capture Key Phase Acceptance Images
  console.log("\n--- Capturing Key Phase Acceptance Screenshots ---");
  const milestones = [
    { t: 80, file: "katana_1_focus_center.png" },
    { t: 460, file: "katana_2_lightning_dash.png" },
    { t: 640, file: "katana_3_razor_slash.png" },
    { t: 850, file: "katana_4_screen_blood_splash.png" },
    { t: 1060, file: "katana_5_stand_straight.png" },
    { t: 1340, file: "katana_6_chiburui_blood_flick.png" },
    { t: 1750, file: "katana_7_sheathe_knockout.png" }
  ];

  for (const ms of milestones) {
    const url = `http://localhost:${PORT}/?qa_view=combat_flow&time=${ms.t}`;
    await client.send("Page.navigate", { url });
    await sleep(80);
    await captureScreenshot(client, path.join(ARTIFACTS_DIR, ms.file));
    console.log(`Saved milestone: ${ms.file}`);
  }

  // Write frame metadata for Python generator
  fs.writeFileSync(
    path.join(ARTIFACTS_DIR, "katana_frames_manifest.json"),
    JSON.stringify({ perfMeasurements, frames: capturedPaths }, null, 2)
  );

  client.close();
  chromeProcess.kill();
  server.close();
  console.log("Browser capture complete.");
}

run().catch((e) => {
  console.error("Capture failed:", e);
  process.exit(1);
});

