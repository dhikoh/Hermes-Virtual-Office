// End-to-end check: create agent over WS, kill adapter, restart, agent must still exist.
// Usage: node tests/e2e-adapter-persistence.mjs
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const WebSocket = require("ws");
const ADAPTER = path.resolve(import.meta.dirname, "../server/hermes-gateway-adapter.js");
const PORT = "18790";
const home = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-e2e-"));
// State dir is separate from HOME on purpose: proves HERMES_STATE_DIR (used by Docker volume) is honored.
const stateDir = path.join(home, "state-volume");
const env = { ...process.env, USERPROFILE: home, HOME: home, HERMES_ADAPTER_PORT: PORT, HERMES_STATE_DIR: stateDir };

function startAdapter() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [ADAPTER], { env, stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    const t = setTimeout(() => reject(new Error("adapter start timeout\n" + out)), 15000);
    child.stdout.on("data", (d) => {
      out += d;
      if (out.includes("Listening on")) { clearTimeout(t); resolve(child); }
    });
    child.stderr.on("data", (d) => (out += d));
    child.on("exit", (c) => reject(new Error(`exited ${c}\n${out}`)));
  });
}

function rpc(ws, method, params) {
  return new Promise((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMsg = (raw) => {
      const f = JSON.parse(raw.toString());
      if (f.type === "res" && f.id === id) { ws.off("message", onMsg); resolve(f); }
    };
    ws.on("message", onMsg);
    ws.send(JSON.stringify({ type: "req", id, method, params }));
    setTimeout(() => reject(new Error("rpc timeout " + method)), 10000);
  });
}

async function connect() {
  const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
  await new Promise((res, rej) => { ws.once("open", res); ws.once("error", rej); });
  await rpc(ws, "connect", {});
  return ws;
}

function assert(cond, msg) {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("PASS:", msg);
}

let proc = await startAdapter();
let ws = await connect();
const created = await rpc(ws, "agents.create", { name: "Scout Bot" });
assert(created.ok && created.payload.agentId, "agents.create returns agentId");
const agentId = created.payload.agentId;
assert(fs.existsSync(created.payload.workspace), "workspace folder created");
ws.close();
await new Promise((r) => setTimeout(r, 1200)); // let debounce flush (500ms)
proc.kill("SIGTERM");
await new Promise((r) => proc.once("exit", r));

const agentsFile = path.join(stateDir, "hermes3d-agents.json");
assert(fs.existsSync(agentsFile), "agents file written to HERMES_STATE_DIR");
assert(!fs.existsSync(path.join(home, ".hermes", "hermes3d-agents.json")), "agents file NOT written to HOME/.hermes");

proc = await startAdapter();
ws = await connect();
const list = await rpc(ws, "agents.list", {});
const ids = list.payload.agents.map((a) => a.id);
assert(ids.includes(agentId), `agent ${agentId} survives restart (agents.list)`);
const del = await rpc(ws, "agents.delete", { agentId });
assert(del.ok, "agents.delete ok");
ws.close();
await new Promise((r) => setTimeout(r, 1200));
proc.kill("SIGTERM");
await new Promise((r) => proc.once("exit", r));

const after = JSON.parse(fs.readFileSync(agentsFile, "utf8"));
assert(!after.some((a) => a.id === agentId), "deleted agent removed from disk");
fs.rmSync(home, { recursive: true, force: true });
console.log("\nALL E2E CHECKS PASSED");
