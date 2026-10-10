import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ADAPTER = path.resolve(__dirname, "../../server/hermes-gateway-adapter.js");

describe("adapter shutdown and process supervision (WP4)", () => {
  let tempDir: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-shutdown-"));
    prevHome = process.env.USERPROFILE;
    process.env.USERPROFILE = tempDir;
    delete require.cache[ADAPTER];
  });

  afterEach(() => {
    process.env.USERPROFILE = prevHome;
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("writes agents roster immediately and synchronously on mutation", () => {
    const mod = require(ADAPTER);
    const agentId = "sync-agent-123";
    mod.agentRegistry.set(agentId, {
      id: agentId,
      name: "Sync Agent",
      workspace: path.join(tempDir, "workspace-sync"),
      role: "developer",
      capability: "developer",
      systemPrompt: "Work synchronously",
      settings: { model: "m", wipe: false, continuity: true },
    });

    mod.writeAgentsFile();
    const agentsPath = path.join(tempDir, ".hermes", "hermes3d-agents.json");
    expect(fs.existsSync(agentsPath)).toBe(true);

    const saved = JSON.parse(fs.readFileSync(agentsPath, "utf8"));
    expect(saved.version).toBe(2);
    expect(saved.agents.some((a: any) => a.id === agentId)).toBe(true);
  });

  it("gracefully shuts down with code 0 on IPC shutdown message", async () => {
    const port = 19890;
    const stateDir = path.join(tempDir, "ipc-state");
    fs.mkdirSync(stateDir, { recursive: true });

    const env = {
      ...process.env,
      USERPROFILE: tempDir,
      HOME: tempDir,
      HERMES_ADAPTER_PORT: String(port),
      HERMES_STATE_DIR: stateDir,
    };

    const child = spawn(process.execPath, [ADAPTER], {
      env,
      stdio: ["ignore", "pipe", "pipe", "ipc"],
    });

    let stdout = "";
    const isReady = new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Adapter readiness timeout")), 10000);
      child.stdout?.on("data", (d) => {
        stdout += d.toString();
        if (stdout.includes("Listening on")) {
          clearTimeout(timeout);
          resolve();
        }
      });
      child.on("error", (err) => {
        clearTimeout(timeout);
        reject(err);
      });
    });

    await isReady;

    const exitPromise = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
      child.on("exit", (code, signal) => resolve({ code, signal }));
    });

    child.send({ type: "shutdown" });

    const result = await exitPromise;
    expect(result.code).toBe(0);
  });

  it("exits with distinct code 98 when adapter port is already in use (EADDRINUSE)", async () => {
    const port = 19891;
    // Bind port with dummy server first
    const dummyServer = net.createServer();
    await new Promise<void>((resolve, reject) => {
      dummyServer.listen(port, "127.0.0.1", () => resolve());
      dummyServer.on("error", reject);
    });

    try {
      const stateDir = path.join(tempDir, "inuse-state");
      fs.mkdirSync(stateDir, { recursive: true });

      const env = {
        ...process.env,
        USERPROFILE: tempDir,
        HOME: tempDir,
        HERMES_ADAPTER_PORT: String(port),
        HERMES_STATE_DIR: stateDir,
      };

      const child = spawn(process.execPath, [ADAPTER], {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });

      const exitPromise = new Promise<number | null>((resolve) => {
        child.on("exit", (code) => resolve(code));
      });

      const exitCode = await exitPromise;
      expect(exitCode).toBe(98);
    } finally {
      await new Promise<void>((resolve) => dummyServer.close(() => resolve()));
    }
  });
});
