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

  it("merges history by keeping both sides, deduped and time-ordered", () => {
    const mod = require(ADAPTER);
    const a = [{ role: "user", content: "hi", timestamp: 1 }, { role: "assistant", content: "yo", timestamp: 2 }];
    const b = [{ role: "user", content: "hi", timestamp: 1 }, { role: "user", content: "new", timestamp: 3 }];
    const merged = mod.mergeHistory(a, b);
    expect(merged.map((m: { content: string }) => m.content)).toEqual(["hi", "yo", "new"]);
    // shorter but newer list must not lose to longer older list
    const older = [{ role: "user", content: "x", timestamp: 1 }, { role: "user", content: "y", timestamp: 2 }];
    const newerShort = [{ role: "user", content: "z", timestamp: 9 }];
    expect(mod.mergeHistory(older, newerShort)).toHaveLength(3);
  });

  it("writes atomically and leaves no temp file behind", () => {
    const mod = require(ADAPTER);
    const target = path.join(home, "out", "f.json");
    mod.writeFileAtomic(target, '{"ok":1}');
    expect(JSON.parse(fs.readFileSync(target, "utf8"))).toEqual({ ok: 1 });
    expect(fs.readdirSync(path.dirname(target))).toEqual(["f.json"]);
  });

  it("blocks orchestration tools for non-PM roles, allows PM", async () => {
    const mod = require(ADAPTER);
    mod.agentRegistry.set("dev-1", { id: "dev-1", name: "Dev", role: "developer", settings: { wipe: false, continuity: true, model: "m" } });
    const noop = () => {};
    const denied = JSON.parse(await mod.executeToolCall({ name: "spawn_agent", args: { name: "X" } }, noop, "dev-1"));
    expect(denied.ok).toBe(false);
    expect(denied.error).toContain("cannot use spawn_agent");
    const allowed = JSON.parse(await mod.executeToolCall({ name: "list_team", args: {} }, noop, "hermes"));
    expect(Array.isArray(allowed.team)).toBe(true);
  });

  it("skips corrupt file without throwing", () => {
    const dir = path.join(home, ".hermes");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "hermes3d-agents.json"), "{not json");
    const mod = require(ADAPTER);
    expect(() => mod.loadAgentsFromDisk()).not.toThrow();
  });
});
