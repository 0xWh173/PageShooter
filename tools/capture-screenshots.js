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
    const args = [
      "--headless=new",
      "--disable-gpu",
      "--no-sandbox",
      `--window-size=${width},${height}`,
      `--screenshot=${outputPath}`,
      url
    ];

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
      { name: "1_setup_screen.png", view: "setup", width: 1280, height: 820 },
      { name: "2_five_player_desktop.png", view: "5p", width: 1920, height: 1080 },
      { name: "3_six_player_desktop.png", view: "6p", width: 1920, height: 1080 },
      { name: "4_ten_player_desktop.png", view: "10p", width: 1920, height: 1080 },
      { name: "5_five_player_laptop.png", view: "5p", width: 1366, height: 768 },
      { name: "6_five_player_mobile.png", view: "5p", width: 390, height: 844 },
      { name: "7_book_cinematic.png", view: "cinematic", width: 1280, height: 820 },
      { name: "8_cell_destruction.png", view: "destruction", width: 1280, height: 820 },
      { name: "9_player_elimination.png", view: "elimination", width: 1280, height: 820 },
      { name: "10_victory_screen.png", view: "victory", width: 1280, height: 820 }
    ];

    try {
      for (const s of screens) {
        const url = `http://localhost:${PORT}/?qa_view=${s.view}`;
        const out = path.join(ARTIFACTS_DIR, s.name);
        console.log(`Capturing ${s.name} (${s.width}x${s.height}) from ${url}...`);
        await takeScreenshot(url, out, s.width, s.height);
        console.log(`Saved ${s.name} (${fs.statSync(out).size} bytes)`);
      }
      console.log("All screenshots captured successfully!");
    } catch (e) {
      console.error("Error capturing screenshots:", e);
    } finally {
      server.close();
    }
  });
}

run();

