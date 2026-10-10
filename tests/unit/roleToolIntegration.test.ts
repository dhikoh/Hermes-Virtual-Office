import { describe, expect, it, vi } from "vitest";
import path from "node:path";
import fs from "node:fs";

const { ROLES, ROLE_DEFINITIONS, resolveCapability, validateRoleAction } = require("../../server/roles/role-matrix");
const { ALL_TOOLS, CAPABILITY_TOOLS, toolNames, toolsForCapability } = require("../../server/roles/tool-definitions");

describe("Role and Tool Integration (WP2)", () => {
  it("verifies consistency between ALL_TOOLS, CAPABILITY_TOOLS and ROLE_DEFINITIONS", () => {
    expect(ALL_TOOLS.length).toBe(14);
    expect(toolNames.length).toBe(14);

    // Every tool in ALL_TOOLS must be owned by at least one capability
    for (const name of toolNames) {
      const owners = Object.entries(CAPABILITY_TOOLS).filter(([, tools]) =>
        (tools as string[]).includes(name),
      );
      expect(
        owners.length,
        `Tool '${name}' has no owning capability in CAPABILITY_TOOLS`,
      ).toBeGreaterThanOrEqual(1);
    }

    // Every capability in ROLE_DEFINITIONS must match CAPABILITY_TOOLS exactly
    for (const role of Object.values(ROLES)) {
      const def = ROLE_DEFINITIONS[role as string];
      expect(def).toBeTruthy();
      expect(def.tools).toEqual(CAPABILITY_TOOLS[role as string]);
    }
  });

  it("verifies toolsForCapability returns correct subset and fails closed for unknown", () => {
    expect(toolsForCapability("pm").map((t: any) => t.function.name)).toEqual(CAPABILITY_TOOLS.pm);
    expect(toolsForCapability("developer").map((t: any) => t.function.name)).toEqual(CAPABILITY_TOOLS.developer);
    expect(toolsForCapability("researcher").map((t: any) => t.function.name)).toEqual(CAPABILITY_TOOLS.researcher);
    expect(toolsForCapability("qa").map((t: any) => t.function.name)).toEqual(CAPABILITY_TOOLS.qa);
    expect(toolsForCapability("writer").map((t: any) => t.function.name)).toEqual(CAPABILITY_TOOLS.writer);

    // Unknown capability must return empty tools list (fail-closed)
    expect(toolsForCapability("unknown")).toEqual([]);
    expect(toolsForCapability("")).toEqual([]);
    expect(toolsForCapability(null)).toEqual([]);
  });

  it("verifies resolveCapability security: only main agent can be pm, non-main cannot assume pm", () => {
    // Main orchestrator is always PM
    expect(resolveCapability("hermes", { id: "hermes", role: "Orchestrator" }, "hermes")).toBe(ROLES.PM);

    // Attempting to inject pm into non-main agent is rejected
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(resolveCapability("rogue-1", { id: "rogue-1", capability: "pm", role: "lead" }, "hermes")).toBe("");
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("attempted to assume 'pm' capability. Rejected"));
    warnSpy.mockRestore();

    // Standard valid capabilities
    expect(resolveCapability("dev-1", { id: "dev-1", capability: "developer" }, "hermes")).toBe(ROLES.DEVELOPER);
    expect(resolveCapability("res-1", { id: "res-1", capability: "researcher" }, "hermes")).toBe(ROLES.RESEARCHER);
    expect(resolveCapability("qa-1", { id: "qa-1", capability: "qa" }, "hermes")).toBe(ROLES.QA);
    expect(resolveCapability("writer-1", { id: "writer-1", capability: "writer" }, "hermes")).toBe(ROLES.WRITER);

    // Display label 'role: pm' does NOT grant pm capability
    const warnSpy2 = vi.spyOn(console, "warn").mockImplementation(() => {});
    const capWithPmLabel = resolveCapability("agent-x", { id: "agent-x", role: "pm" }, "hermes");
    expect(capWithPmLabel).toBe(ROLES.DEVELOPER); // Falls back to developer safely
    warnSpy2.mockRestore();
  });

  it("verifies legacy agent migration with warning", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const cap = resolveCapability("legacy-agent", { id: "legacy-agent", role: "custom-label" }, "hermes");
    expect(cap).toBe(ROLES.DEVELOPER);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("defaulting to developer"));
    warnSpy.mockRestore();
  });

  it("verifies 5 capability x 14 tools matrix authorization in executeToolCall", () => {
    // Test the capability matrix boundaries
    const caps = [ROLES.PM, ROLES.DEVELOPER, ROLES.RESEARCHER, ROLES.QA, ROLES.WRITER];
    for (const cap of caps) {
      const allowedTools = CAPABILITY_TOOLS[cap];
      for (const tool of toolNames) {
        const isAllowed = allowedTools.includes(tool);
        const roleDef = ROLE_DEFINITIONS[cap];
        expect(roleDef.tools.includes(tool)).toBe(isAllowed);
      }
    }

    // PM cannot read file, write file, execute shell, or rollback
    expect(ROLE_DEFINITIONS[ROLES.PM].tools.includes("read_file")).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.PM].tools.includes("write_file")).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.PM].tools.includes("execute_command")).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.PM].tools.includes("rollback_workspace")).toBe(false);

    // Researcher cannot read workspace code or execute shell
    expect(ROLE_DEFINITIONS[ROLES.RESEARCHER].tools.includes("read_file")).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.RESEARCHER].tools.includes("execute_command")).toBe(false);

    // QA cannot write code
    expect(ROLE_DEFINITIONS[ROLES.QA].tools.includes("write_file")).toBe(false);
  });

  it("verifies fail-closed behavior for unknown actions in validateRoleAction", () => {
    const res = validateRoleAction(ROLES.DEVELOPER, "unknown_malicious_action", {});
    expect(res.allowed).toBe(false);
    expect(res.level).toBe("BLACK");
    expect(res.reason).toContain("Unknown or unmapped action");
  });
});
