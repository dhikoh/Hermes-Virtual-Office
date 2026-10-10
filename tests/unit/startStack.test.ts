import { describe, expect, it } from "vitest";
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const START_STACK = path.resolve(__dirname, "../../server/start-stack.js");
const { nextRestartDelay, shouldGiveUp } = require(START_STACK);

describe("start-stack supervisor and launcher (WP5)", () => {
  it("computes backoff delays properly: 1s, 2s, 4s, 8s, 16s, capped at 16s", () => {
    expect(nextRestartDelay(0)).toBe(1000);
    expect(nextRestartDelay(1)).toBe(2000);
    expect(nextRestartDelay(2)).toBe(4000);
    expect(nextRestartDelay(3)).toBe(8000);
    expect(nextRestartDelay(4)).toBe(16000);
    expect(nextRestartDelay(5)).toBe(16000);
    expect(nextRestartDelay(100)).toBe(16000);
  });

  it("decides whether to give up based on >5 crashes within 60 seconds", () => {
    const now = Date.now();
    // 5 crashes within last 10 seconds -> should not give up yet (threshold is >5)
    const fiveCrashes = [now - 5000, now - 4000, now - 3000, now - 2000, now - 1000];
    expect(shouldGiveUp(fiveCrashes)).toBe(false);

    // 6 crashes within last 10 seconds -> must give up
    const sixCrashes = [...fiveCrashes, now];
    expect(shouldGiveUp(sixCrashes)).toBe(true);

    // Old crashes outside 60s window do not trigger give up
    const oldCrashes = [now - 120000, now - 100000, now - 80000, now - 70000, now - 65000, now - 1000];
    expect(shouldGiveUp(oldCrashes)).toBe(false);
  });

  it("supervises adapter: restarts on unexpected exit(1) and survives (e2e mock)", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-start-stack-"));
    const stateFile = path.join(tempDir, "counter.txt");
    fs.writeFileSync(stateFile, "0", "utf8");

    // Mock adapter that exits with code 1 twice, then sleeps happily
    const mockAdapter = path.join(tempDir, "mock-adapter.js");
    fs.writeFileSync(
      mockAdapter,
      `
const fs = require('fs');
const stateFile = '${stateFile.replace(/\\/g, "/")}';
const runs = parseInt(fs.readFileSync(stateFile, 'utf8') || '0', 10) + 1;
fs.writeFileSync(stateFile, String(runs), 'utf8');

if (runs <= 2) {
  process.exit(1);
} else {
  // Stay alive and handle shutdown message
  if (process.send) {
    process.on('message', (m) => {
      if (m && m.type === 'shutdown') process.exit(0);
    });
  }
  setInterval(() => {}, 1000);
}
`,
      "utf8"
    );

    // Mock web server that stays alive
    const mockWeb = path.join(tempDir, "mock-web.js");
    fs.writeFileSync(
      mockWeb,
      `
setInterval(() => {}, 1000);
`,
      "utf8"
    );

    const child = spawn(process.execPath, [START_STACK], {
      env: {
        ...process.env,
        HERMES_ADAPTER_PATH: mockAdapter,
        HERMES_WEB_PATH: mockWeb,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    try {
      // Wait for 2 restarts (delay 1s + 2s + margin = ~4.5s)
      await new Promise<void>((resolve, reject) => {
        const start = Date.now();
        const interval = setInterval(() => {
          try {
            const count = parseInt(fs.readFileSync(stateFile, "utf8"), 10);
            if (count >= 3) {
              clearInterval(interval);
              resolve();
            } else if (Date.now() - start > 12000) {
              clearInterval(interval);
              reject(new Error("Timeout waiting for mock adapter restart count >= 3, got: " + count));
            }
          } catch (e) {
            // ignore while reading
          }
        }, 300);
      });

      const finalCount = parseInt(fs.readFileSync(stateFile, "utf8"), 10);
      expect(finalCount).toBeGreaterThanOrEqual(3);
    } finally {
      child.kill("SIGTERM");
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }, 20000);
});
