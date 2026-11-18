import { spawn } from "node:child_process";

const npmCmd = process.platform === "win32" ? "npm.cmd" : "npm";

function startProcess(label, scriptName) {
  const child = spawn(`${npmCmd} run ${scriptName}`, {
    stdio: "inherit",
    shell: true
  });
  child.on("exit", (code) => {
    if (code && code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
    }
  });
  return child;
}

console.log("[PageShooter] Starting Backend (:4000) and Web Frontend (:3234)...");
const serverProc = startProcess("server", "dev:server");
const webProc = startProcess("web", "dev:web");

function shutdown() {
  try {
    serverProc.kill();
    webProc.kill();
  } catch {
    // Ignore
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
