import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = 5173;
const DIST_DIR = path.resolve("apps/web/dist");
const ARTIFACTS_DIR = "C:/Users/Osama Yusouf/.gemini/antigravity/brain/f608478c-72b0-4894-8cae-93bb137c1243/screenshots";
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// Ensure screenshot directory exists
fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });

// Simple MIME map
const MIME_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json"
};

// Simple static server for dist
const server = http.createServer((req, res) => {
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

function takeScreenshot(url, outputPath, width = 1280, height = 820) {
  return new Promise((resolve, reject) => {
    const isMobile = width < 600;
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      "--hide-scrollbars",
      "--force-device-scale-factor=1",
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`
    ];

    if (isMobile) {
      args.push(
        "--user-agent=Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1"
      );
    }

    args.push(url);

    const child = spawn(CHROME_PATH, args, { stdio: "ignore" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Chrome exited with code ${code}`));
    });
    child.on("error", reject);
  });
}

async function run() {
  server.listen(PORT, async () => {
    console.log(`Static server running on http://localhost:${PORT}`);

    const screens = [
      { name: "katana_battlefield_armed.png", view: "5p", width: 1920, height: 1080 },
      { name: "handdrawn_progression_stages.png", view: "progression", width: 1440, height: 1400 },
      { name: "katana_1_focus_center.png", view: "combat_focus&phase=FOCUS", width: 1280, height: 820 },
      { name: "katana_2_lightning_dash.png", view: "combat_dash&phase=KATANA_DASH", width: 1280, height: 820 },
      { name: "katana_3_razor_slash.png", view: "combat_slash&phase=SLASH_FLASH", width: 1280, height: 820 },
      { name: "katana_4_blood_splash.png", view: "combat_blood&phase=BLOOD_SPLASH", width: 1280, height: 820 },
      { name: "katana_5_sheathe_knockout.png", view: "combat_knockout&phase=KNOCKOUT_CROSS", width: 1280, height: 820 },
      { name: "handdrawn_mobile_battlefield.png", view: "5p", width: 390, height: 844 }
    ];

    try {
      for (const s of screens) {
        const url = `http://localhost:${PORT}/?qa_view=${s.view}`;
        const out = path.join(ARTIFACTS_DIR, s.name);
        console.log(`Capturing ${s.name} (${s.width}x${s.height}) from ${url}...`);
        await takeScreenshot(url, out, s.width, s.height);
        console.log(`Saved ${s.name} (${fs.statSync(out).size} bytes)`);
      }
      console.log("All katana screenshots captured successfully!");
    } catch (e) {
      console.error("Error capturing screenshots:", e);
    } finally {
      server.close();
    }
  });
}

run();
