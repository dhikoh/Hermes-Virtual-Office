import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";

const {
  createSnapshot,
  listSnapshots,
  rollbackSnapshot,
} = require("../../server/workspace/snapshot-manager");

const {
  createPendingApproval,
  resolvePendingApproval,
  getPendingApprovals,
  executeShellCommand,
} = require("../../server/execution/shell-executor");

const {
  ensureVaultStructure,
  writeVaultDocument,
  listVaultDocuments,
} = require("../../server/vault/vault-manager");

const {
  ROLES,
  ROLE_DEFINITIONS,
  validateRoleAction,
} = require("../../server/roles/role-matrix");

describe("Integrated Gateway Capabilities v2.3.1", () => {
  const workspaceRoot = path.join(process.cwd(), "tests", "fixtures", "e2e-gateway-workspace");

  it("exposes all 5 blueprint roles with distinct capability flags", () => {
    expect(ROLE_DEFINITIONS[ROLES.PM]).toBeTruthy();
    expect(ROLE_DEFINITIONS[ROLES.DEVELOPER]).toBeTruthy();
    expect(ROLE_DEFINITIONS[ROLES.RESEARCHER]).toBeTruthy();
    expect(ROLE_DEFINITIONS[ROLES.QA]).toBeTruthy();
    expect(ROLE_DEFINITIONS[ROLES.WRITER]).toBeTruthy();

    expect(ROLE_DEFINITIONS[ROLES.PM].canShell).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.PM].canBrowser).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.DEVELOPER].canShell).toBe(true);
    expect(ROLE_DEFINITIONS[ROLES.DEVELOPER].canBrowser).toBe(false);
    expect(ROLE_DEFINITIONS[ROLES.RESEARCHER].canBrowser).toBe(true);
    expect(ROLE_DEFINITIONS[ROLES.RESEARCHER].canReadWorkspaceCode).toBe(false);
  });

  it("handles end-to-end workspace snapshot and rollback lifecycle", () => {
    const dummyFile = path.join(workspaceRoot, "test_file.txt");
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.writeFileSync(dummyFile, "Version 1.0", "utf8");

    const snap = createSnapshot(workspaceRoot, [dummyFile], "dev-1", "Editing test file");
    expect(snap.id).toBeTruthy();

    const snapsList = listSnapshots(workspaceRoot);
    expect(snapsList.some((s: any) => s.id === snap.id)).toBe(true);

    // Modify file
    fs.writeFileSync(dummyFile, "Version 2.0 Corrupted", "utf8");
    expect(fs.readFileSync(dummyFile, "utf8")).toBe("Version 2.0 Corrupted");

    // Rollback
    const res = rollbackSnapshot(workspaceRoot, snap.id);
    expect(res.ok).toBe(true);
    expect(fs.readFileSync(dummyFile, "utf8")).toBe("Version 1.0");

    // Clean up
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("handles end-to-end approval lifecycle and command execution", async () => {
    const cmd = "node -e \"process.stdout.write('E2E Success')\"";
    const approval = createPendingApproval("dev-1", cmd, process.cwd());
    expect(approval.id).toBeTruthy();

    const pending = getPendingApprovals();
    expect(pending.some((p: any) => p.id === approval.id)).toBe(true);

    const resolveRes = resolvePendingApproval(approval.id, "allow-once");
    expect(resolveRes.ok).toBe(true);
    expect(resolveRes.approvedCommand).toBe(cmd);

    const execRes = await executeShellCommand("dev-1", ROLES.DEVELOPER, resolveRes.approvedCommand, process.cwd(), { preApproved: true });
    expect(execRes.ok).toBe(true);
    expect(execRes.stdout).toBe("E2E Success");
  });

  it("manages Obsidian vault files and listings", () => {
    ensureVaultStructure(workspaceRoot);
    const doc = writeVaultDocument(workspaceRoot, "research", "ai_trends.md", "Trends analysis.", {
      title: "AI Trends 2026",
      employee: "researcher-1",
    });
    expect(doc.ok).toBe(true);

    const docs = listVaultDocuments(workspaceRoot, "research");
    expect(docs.some((d: any) => d.filename === "ai_trends.md")).toBe(true);

    // Clean up
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });
});
