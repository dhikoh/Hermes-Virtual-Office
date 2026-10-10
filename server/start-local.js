"use strict";

const { spawn, exec } = require("node:child_process");
const path = require("node:path");

console.log("=================================================");
console.log("    HERMES VIRTUAL OFFICE - LOCAL RUNNER");
console.log("=================================================");

const adapterPath = path.join(__dirname, "hermes-gateway-adapter.js");
const webPath = path.join(__dirname, "index.js");

// 1. Start Hermes Gateway Adapter (port 18789)
console.log("\n[1/2] Starting Gateway Adapter (port 18789)...");
const adapter = spawn("node", [adapterPath], {
  stdio: "inherit",
  env: process.env,
});

adapter.on("error", (err) => {
  console.error("[Adapter Error]:", err.message);
});

// 2. Start Next.js Development Server (port 3000)
console.log("[2/2] Starting Web Server (port 3000)...");
const web = spawn("node", [webPath, "--dev"], {
  stdio: "inherit",
  env: process.env,
});

web.on("error", (err) => {
  console.error("[Web Server Error]:", err.message);
});

// 3. Open browser after a brief delay
let browserOpened = false;
setTimeout(() => {
  if (!browserOpened) {
    browserOpened = true;
    console.log("\n[Hermes3D] Opening browser: http://localhost:3000/office\n");
    if (process.platform === "win32") {
      exec('start "" "http://localhost:3000/office"');
    }
  }
}, 4500);

let isShuttingDown = false;
function killProcess(child) {
  if (!child || !child.pid) return;
  try {
    if (process.platform === "win32") {
      exec(`taskkill /pid ${child.pid} /T /F`, () => {});
    } else {
      child.kill("SIGTERM");
    }
  } catch {}
}

function cleanup(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("\n[Hermes3D] Shutting down services cleanly...");

  killProcess(adapter);
  killProcess(web);

  setTimeout(() => {
    process.exit(exitCode);
  }, 1000);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
