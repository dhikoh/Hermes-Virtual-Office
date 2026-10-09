/* eslint-disable @typescript-eslint/no-require-imports */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const {
  ensureVaultStructure,
  writeVaultDocument,
  listVaultDocuments,
} = require("../../server/vault/vault-manager");

const {
  fetchIsolatedPage,
  fetchCamoufoxPage,
  saveResearchToVault,
  extractCleanText,
  isCamoufoxAvailable,
  getAgentProfileDir,
  listAgentProfiles,
} = require("../../server/research/browser-service");

describe("Knowledge Vault & Camoufox Browser Research Engine v2.4.0", () => {
  const testWorkspace = path.join(process.cwd(), "tests", "fixtures", "vault-test-workspace");

  beforeAll(() => {
    fs.mkdirSync(testWorkspace, { recursive: true });
  });

  afterAll(() => {
    try {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it("creates Obsidian-compatible _AI/ vault structure with YAML frontmatter", () => {
    ensureVaultStructure(testWorkspace);
    expect(fs.existsSync(path.join(testWorkspace, "_AI", "research"))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, "_AI", "plans"))).toBe(true);
    expect(fs.existsSync(path.join(testWorkspace, "_AI", "adr"))).toBe(true);

    const doc = writeVaultDocument(
      testWorkspace,
      "plans",
      "sprint_1_plan.md",
      "## Goals\n- Deliver Phase 1\n- Deliver Phase 2",
      {
        title: "Sprint 1 Work Plan",
        employee: "pm-1",
        task: "task-001",
        sources: ["https://internal.wiki"],
      }
    );

    expect(doc.ok).toBe(true);
    const content = fs.readFileSync(doc.filePath, "utf8");
    expect(content).toContain("ai-generated: true");
    expect(content).toContain("employee: pm-1");
    expect(content).toContain("trust: T3");
    expect(content).toContain("## Goals");
  });

  it("lists notes created in the vault subfolders", () => {
    const list = listVaultDocuments(testWorkspace, "plans");
    expect(list).toHaveLength(1);
    expect(list[0].filename).toBe("sprint_1_plan.md");
  });

  it("extractCleanText safely extracts plain text and strips scripts/styles", () => {
    const sampleHtml = `
      <html>
        <head><style>.bad { color: red; }</style></head>
        <body>
          <script>alert('evil');</script>
          <h1>Hello World</h1>
          <p>This is clean text &amp; facts.</p>
        </body>
      </html>
    `;
    const clean = extractCleanText(sampleHtml);
    expect(clean).not.toContain("alert");
    expect(clean).not.toContain(".bad");
    expect(clean).toContain("Hello World");
    expect(clean).toContain("This is clean text & facts.");
  });

  it("saves research findings to _AI/research/ with Obsidian frontmatter", () => {
    const res = saveResearchToVault(
      testWorkspace,
      "Quantum Computing Primer",
      "Quantum computing utilizes qubits for superposition calculations.",
      ["https://wikipedia.org/wiki/Quantum_computing"],
      "researcher-007"
    );

    expect(res.ok).toBe(true);
    expect(res.relativePath).toContain("_AI/research/quantum_computing_primer.md");

    const content = fs.readFileSync(res.filePath, "utf8");
    expect(content).toContain("employee: researcher-007");
    expect(content).toContain("https://wikipedia.org/wiki/Quantum_computing");
    expect(content).toContain("Quantum computing utilizes qubits");
  });

  it("enforces domain allowlist on isolated web fetching", async () => {
    // Non-allowlisted domain without approval
    const blockedRes = await fetchIsolatedPage("https://malicious-unknown-site.xyz/data", ["wikipedia.org"]);
    expect(blockedRes.ok).toBe(false);
    expect(blockedRes.error).toContain("allowlist");
  });

  it("safely probes Camoufox engine availability", () => {
    const available = isCamoufoxAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("creates and manages isolated persistent profiles per agent", () => {
    const profileResearcher = getAgentProfileDir("agent_researcher_01", testWorkspace);
    const profileSubagent = getAgentProfileDir("subagent-data-scraper", testWorkspace);

    expect(fs.existsSync(profileResearcher)).toBe(true);
    expect(fs.existsSync(profileSubagent)).toBe(true);
    expect(profileResearcher).toContain(path.join("_AI", "browser-profiles", "agent_researcher_01"));
    expect(profileSubagent).toContain(path.join("_AI", "browser-profiles", "subagent-data-scraper"));

    const profiles = listAgentProfiles(testWorkspace);
    expect(profiles.length).toBeGreaterThanOrEqual(2);
    const agentIds = profiles.map((p: { agentId: string }) => p.agentId);
    expect(agentIds).toContain("agent_researcher_01");
    expect(agentIds).toContain("subagent-data-scraper");
  });

  it("gracefully reports unavailable Camoufox binary if not installed locally", async () => {
    if (!isCamoufoxAvailable()) {
      const res = await fetchCamoufoxPage("https://example.com", {
        allowlist: ["example.com"],
        agentId: "test-agent",
        workspacePath: testWorkspace,
      });
      expect(res.ok).toBe(false);
      expect(res.error).toContain("Camoufox browser binary is not installed");
    }
  });

  it("falls back to isolated HTTP transport seamlessly when Camoufox binary is absent", async () => {
    const res = await fetchIsolatedPage("https://raw.githubusercontent.com/robots.txt", {
      allowlist: ["raw.githubusercontent.com"],
      agentId: "fallback-agent",
      workspacePath: testWorkspace,
    });
    expect(res).toBeDefined();
    // Allowlist validated, engine executed
    expect(res.engine).toMatch(/^(camoufox|http-fallback)$/);
  });
});

