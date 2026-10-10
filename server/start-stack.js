"use strict";

const { spawn, exec } = require("node:child_process");
const path = require("node:path");

const isDev = process.argv.includes("--dev");
const shouldOpen = process.argv.includes("--open");

const adapterPath = process.env.HERMES_ADAPTER_PATH || path.join(__dirname, "hermes-gateway-adapter.js");
const webPath = process.env.HERMES_WEB_PATH || path.join(__dirname, "index.js");

function nextRestartDelay(attempt) {
  const delays = [1000, 2000, 4000, 8000, 16000];
  const idx = Math.min(Math.max(0, attempt), delays.length - 1);
  return delays[idx];
}

function shouldGiveUp(restarts, windowMs = 60000, maxRestarts = 5) {
  const now = Date.now();
  const recent = restarts.filter((ts) => now - ts < windowMs);
  return recent.length > maxRestarts;
}

function openBrowser(url) {
  try {
    const plat = process.platform;
    if (plat === "win32") {
      exec(`start "" "${url}"`);
    } else if (plat === "darwin") {
      exec(`open "${url}"`);
    } else {
      exec(`xdg-open "${url}"`);
    }
  } catch (err) {
    console.warn("[start-stack] Could not open browser:", err.message);
  }
}

let adapterProc = null;
let webProc = null;
let isShuttingDown = false;
const restartTimestamps = [];
let consecutiveCrashes = 0;

function spawnAdapter() {
  if (isShuttingDown) return;
  console.log("[start-stack] Spawning Hermes Gateway Adapter (port 18789)...");
  adapterProc = spawn("node", [adapterPath], {
    stdio: ["inherit", "inherit", "inherit", "ipc"],
    env: process.env,
  });

  adapterProc.on("error", (err) => {
    console.error("[start-stack] Adapter process error:", err.message);
  });

  adapterProc.on("exit", (code, signal) => {
    if (isShuttingDown) return;
    console.warn(`[start-stack] Adapter exited with code ${code}, signal ${signal}`);

    if (code === 98) {
      console.error("[start-stack] Adapter port in use (EADDRINUSE 98). Shutting down stack.");
      cleanup(1);
      return;
    }

    if (code === 0) {
      console.log("[start-stack] Adapter exited cleanly.");
      return;
    }

    // Unexpected crash: record restart and backoff
    const now = Date.now();
    restartTimestamps.push(now);

    if (shouldGiveUp(restartTimestamps)) {
      console.error("[start-stack] Adapter crashed more than 5 times in 60 seconds. Aborting stack.");
      cleanup(1);
      return;
    }

    const delay = nextRestartDelay(consecutiveCrashes);
    consecutiveCrashes++;
    console.log(`[start-stack] Restarting adapter in ${delay}ms (attempt ${consecutiveCrashes})...`);
    setTimeout(() => {
      if (!isShuttingDown) spawnAdapter();
    }, delay);
  });
}

function spawnWeb() {
  if (isShuttingDown) return;
  const webArgs = [webPath];
  if (isDev) webArgs.push("--dev");

  console.log(`[start-stack] Spawning Web Server (mode: ${isDev ? "development" : "production"})...`);
  webProc = spawn("node", webArgs, {
    stdio: "inherit",
    env: process.env,
  });

  webProc.on("error", (err) => {
    console.error("[start-stack] Web server error:", err.message);
  });

  webProc.on("exit", (code, signal) => {
    if (isShuttingDown) return;
    console.warn(`[start-stack] Web server exited with code ${code}, signal ${signal}`);
    cleanup(code !== null ? code : 1);
  });
}

function cleanup(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n[start-stack] Gracefully shutting down services...");

  if (adapterProc && !adapterProc.killed) {
    try {
      if (adapterProc.send) {
        adapterProc.send({ type: "shutdown" });
      } else {
        adapterProc.kill("SIGTERM");
      }
    } catch {}
  }

  if (webProc && !webProc.killed) {
    try {
      webProc.kill("SIGTERM");
    } catch {}
  }

  const checkExit = setTimeout(() => {
    if (adapterProc && !adapterProc.killed) {
      try {
        if (process.platform === "win32") {
          exec(`taskkill /pid ${adapterProc.pid} /T /F`, () => {});
        } else {
          adapterProc.kill("SIGKILL");
        }
      } catch {}
    }
    if (webProc && !webProc.killed) {
      try {
        if (process.platform === "win32") {
          exec(`taskkill /pid ${webProc.pid} /T /F`, () => {});
        } else {
          webProc.kill("SIGKILL");
        }
      } catch {}
    }
    process.exit(exitCode);
  }, 3000);

  let adapterDone = !adapterProc || adapterProc.exitCode !== null;
  let webDone = !webProc || webProc.exitCode !== null;

  const tryFinish = () => {
    if (adapterDone && webDone) {
      clearTimeout(checkExit);
      process.exit(exitCode);
    }
  };

  if (adapterProc) {
    adapterProc.once("exit", () => {
      adapterDone = true;
      tryFinish();
    });
  }
  if (webProc) {
    webProc.once("exit", () => {
      webDone = true;
      tryFinish();
    });
  }
}

function start() {
  console.log("=================================================");
  console.log(`    HERMES VIRTUAL OFFICE - STACK RUNNER (${isDev ? "DEV" : "PROD"})`);
  console.log("=================================================");

  spawnAdapter();
  spawnWeb();

  if (shouldOpen) {
    setTimeout(() => {
      if (!isShuttingDown) {
        console.log("\n[start-stack] Opening browser: http://localhost:3000/office\n");
        openBrowser("http://localhost:3000/office");
      }
    }, 4500);
  }

  process.once("SIGINT", () => cleanup(0));
  process.once("SIGTERM", () => cleanup(0));
}

if (require.main === module) {
  start();
}

module.exports = {
  nextRestartDelay,
  shouldGiveUp,
  openBrowser,
  spawnAdapter,
  spawnWeb,
  cleanup,
};
