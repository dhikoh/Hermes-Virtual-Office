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
      id: "scout-abc123",
      name: "Scout",
      workspace: `${home}/.hermes/workspace-scout-abc123`,
      role: "research",
      capability: "researcher",
      systemPrompt: "You scout.",
      settings: { wipe: false, continuity: true, model: "m", boundaries: "no writes" },
    });
    first.writeAgentsFile();

    delete require.cache[ADAPTER];
    const second = require(ADAPTER);
    second.loadAgentsFromDisk();
    const reloaded = second.agentRegistry.get("scout-abc123");
    expect(reloaded?.name).toBe("Scout");
    expect(reloaded?.settings.boundaries).toBe("no writes");
    expect(reloaded?.capability).toBe("researcher");
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
    mod.agentRegistry.set("dev-1", {
      id: "dev-1",
      name: "Dev",
      role: "developer",
      capability: "developer",
      settings: { wipe: false, continuity: true, model: "m" },
    });
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

  // --- WP3 Persistence & Registry Tests ---

  it("persists orchestrator name and settings across restarts via roster v2 (WP3)", () => {
    const first = require(ADAPTER);
    const main = first.agentRegistry.get("hermes");
    expect(main).toBeTruthy();
    main.name = "Custom Hermes PM";
    main.settings = { ...main.settings, model: "custom-orchestrator-model", boundaries: "orchestrate only" };
    first.writeAgentsFile();

    delete require.cache[ADAPTER];
    const second = require(ADAPTER);
    second.loadAgentsFromDisk();
    const reloadedMain = second.agentRegistry.get("hermes");
    expect(reloadedMain?.name).toBe("Custom Hermes PM");
    expect(reloadedMain?.settings.model).toBe("custom-orchestrator-model");
    expect(reloadedMain?.settings.boundaries).toBe("orchestrate only");
    // Ensure capability pm is never mutated or downgraded
    expect(reloadedMain?.role).toBe("Orchestrator");
  });

  it("generates distinct workspace paths for two agents with the same name (WP3)", async () => {
    const mod = require(ADAPTER);
    const resA = JSON.parse(await mod.executeToolCall({ name: "spawn_agent", args: { name: "Duplicate" } }, () => {}, "hermes"));
    const resB = JSON.parse(await mod.executeToolCall({ name: "spawn_agent", args: { name: "Duplicate" } }, () => {}, "hermes"));

    expect(resA.ok).toBe(true);
    expect(resB.ok).toBe(true);
    expect(resA.agent_id).not.toBe(resB.agent_id);

    const agentA = mod.agentRegistry.get(resA.agent_id);
    const agentB = mod.agentRegistry.get(resB.agent_id);
    expect(agentA.workspace).not.toBe(agentB.workspace);
    expect(agentA.workspace).toContain(`workspace-${resA.agent_id}`);
    expect(agentB.workspace).toContain(`workspace-${resB.agent_id}`);
  });

  it("handles non-ASCII names cleanly with fallback slug 'agent' (WP3)", async () => {
    const mod = require(ADAPTER);
    const res = JSON.parse(await mod.executeToolCall({ name: "spawn_agent", args: { name: "名前" } }, () => {}, "hermes"));
    expect(res.ok).toBe(true);
    expect(res.agent_id).toMatch(/^agent-[a-z0-9]{6}$/);
    const agent = mod.agentRegistry.get(res.agent_id);
    expect(agent.name).toBe("名前");
    expect(agent.workspace).toContain(`workspace-${res.agent_id}`);
  });

  it("reads legacy v1 array schema backwards compatibly (WP3)", () => {
    const dir = path.join(home, ".hermes");
    fs.mkdirSync(dir, { recursive: true });
    const legacyArray = [
      {
        id: "legacy-worker-1",
        name: "Legacy Worker",
        role: "developer",
        workspace: path.join(dir, "workspace-legacy-1"),
        systemPrompt: "Legacy instructions",
        settings: { model: "hermes-legacy", wipe: false, continuity: true },
      },
    ];
    fs.writeFileSync(path.join(dir, "hermes3d-agents.json"), JSON.stringify(legacyArray, null, 2));

    const mod = require(ADAPTER);
    mod.loadAgentsFromDisk();
    const worker = mod.agentRegistry.get("legacy-worker-1");
    expect(worker).toBeTruthy();
    expect(worker.name).toBe("Legacy Worker");
    expect(worker.capability).toBe("developer");
  });

  it("supports roster v2 schema round-trip (WP3)", () => {
    const mod = require(ADAPTER);
    mod.agentRegistry.set("writer-bot", {
      id: "writer-bot",
      name: "Doc Writer",
      role: "writer",
      capability: "writer",
      workspace: path.join(home, ".hermes", "workspace-writer-bot"),
      systemPrompt: "Write docs.",
      settings: { model: "doc-model", wipe: false, continuity: true },
    });
    mod.writeAgentsFile();

    const agentsFilePath = path.join(home, ".hermes", "hermes3d-agents.json");
    const savedContent = JSON.parse(fs.readFileSync(agentsFilePath, "utf8"));
    expect(savedContent.version).toBe(2);
    expect(savedContent.main).toBeTruthy();
    expect(Array.isArray(savedContent.agents)).toBe(true);
    expect(savedContent.agents.some((a: any) => a.id === "writer-bot")).toBe(true);
  });

  it("rejects workspace paths with directory traversal '..' (DECISION D2) (WP3)", () => {
    const mod = require(ADAPTER);
    // createAgentEntry validates and replaces traversal with secure default
    const entry = mod.createAgentEntry({
      name: "BadAgent",
      workspace: "../../etc/passwd",
    });
    expect(entry.workspace).not.toContain("..");
    expect(entry.workspace).toContain("workspace-badagent");
  });
});
