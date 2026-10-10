import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ADAPTER = path.resolve(__dirname, "../../server/hermes-gateway-adapter.js");

describe("agent registry persistence", () => {
  let home: string;
  let prevHome: string | undefined;

  beforeEach(() => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-reg-"));
    prevHome = process.env.USERPROFILE;
    process.env.USERPROFILE = home;
    delete require.cache[ADAPTER];
  });

  afterEach(() => {
    process.env.USERPROFILE = prevHome;
    fs.rmSync(home, { recursive: true, force: true });
  });

  it("writes spawned agents and reloads them after restart", () => {
    const first = require(ADAPTER);
    first.agentRegistry.set("scout-abc123", {
      id: "scout-abc123", name: "Scout", workspace: `${home}/.hermes/workspace-scout`,
      role: "research", systemPrompt: "You scout.", settings: { wipe: false, continuity: true, model: "m", boundaries: "no writes" },
    });
    first.writeAgentsFile();

    delete require.cache[ADAPTER];
    const second = require(ADAPTER);
    second.loadAgentsFromDisk();
    const reloaded = second.agentRegistry.get("scout-abc123");
    expect(reloaded?.name).toBe("Scout");
    expect(reloaded?.settings.boundaries).toBe("no writes");
  });

  it("skips corrupt file without throwing", () => {
    const dir = path.join(home, ".hermes");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "hermes3d-agents.json"), "{not json");
    const mod = require(ADAPTER);
    expect(() => mod.loadAgentsFromDisk()).not.toThrow();
  });
});
