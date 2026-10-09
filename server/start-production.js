"use strict";

const { spawn } = require("node:child_process");
const path = require("node:path");

console.log("[Hermes3D Production] Initializing multi-process production environment...");

const adapterPath = path.join(__dirname, "hermes-gateway-adapter.js");
const webPath = path.join(__dirname, "index.js");

// 1. Start Hermes Gateway Adapter (WebSocket & REST RPC)
console.log("[Hermes3D Production] Spawning Hermes Gateway Adapter (port 18789)...");
const adapter = spawn("node", [adapterPath], {
  stdio: "inherit",
  env: process.env,
});

adapter.on("error", (err) => {
  console.error("[Hermes3D Production] Failed to start Hermes Gateway Adapter:", err);
});

adapter.on("exit", (code, signal) => {
  console.warn(`[Hermes3D Production] Hermes Gateway Adapter exited with code ${code}, signal ${signal}`);
  if (code !== 0 && !isShuttingDown) {
    console.error("[Hermes3D Production] Adapter crashed unexpectedly.");
  }
});

// 2. Start Next.js Custom Server
console.log("[Hermes3D Production] Spawning Hermes3D Web Server (port 3000)...");
const web = spawn("node", [webPath], {
  stdio: "inherit",
  env: process.env,
});

web.on("error", (err) => {
  console.error("[Hermes3D Production] Failed to start Hermes3D Web Server:", err);
});

web.on("exit", (code, signal) => {
  console.warn(`[Hermes3D Production] Hermes3D Web Server exited with code ${code}, signal ${signal}`);
  if (code !== 0 && !isShuttingDown) {
    console.error("[Hermes3D Production] Web Server exited unexpectedly.");
  }
  cleanup(code || 0);
});

let isShuttingDown = false;
function cleanup(exitCode = 0) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log("[Hermes3D Production] Gracefully shutting down services...");

  try {
    adapter.kill("SIGTERM");
  } catch {}

  try {
    web.kill("SIGTERM");
  } catch {}

  setTimeout(() => {
    try {
      adapter.kill("SIGKILL");
    } catch {}
    try {
      web.kill("SIGKILL");
    } catch {}
    process.exit(exitCode);
  }, 3000);
}

process.on("SIGINT", () => cleanup(0));
process.on("SIGTERM", () => cleanup(0));
