import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  executeShellCommand,
  resolvePendingApproval,
  getPendingApprovals,
} = require("../../server/execution/shell-executor");
const { ROLES } = require("../../server/roles/role-matrix");

let gitAvailable = false;
try {
  execSync("git --version", { stdio: "ignore" });
  gitAvailable = true;
} catch {}

describe("Shell / CLI Executor Engine v2.3.1", () => {
  it("rejects shell execution for roles without shell privileges (e.g. Researcher)", async () => {
    const res = await executeShellCommand("researcher-1", ROLES.RESEARCHER, "node -v");
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain("does not have shell execution privileges");
  });

  it("blocks dangerous commands as BLACK regardless of role", async () => {
    const res = await executeShellCommand("dev-1", ROLES.DEVELOPER, "cat .env");
    expect(res.ok).toBe(false);
    expect(res.stderr).toContain("Blocked by Security Gate");
  });

  it.skipIf(!gitAvailable)("runs safe read-only commands (YELLOW) without requiring approval in hermetic git repo (WP8)", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "shell-git-test-"));
    try {
      execSync("git init", { cwd: tempDir, stdio: "ignore" });
      const res = await executeShellCommand("dev-1", ROLES.DEVELOPER, "git status", tempDir);
      expect(res.ok).toBe(true);
      expect(res.status).not.toBe("pending_approval");
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("intercepts RED commands and generates a pending approval ticket", async () => {
    const res = await executeShellCommand("dev-1", ROLES.DEVELOPER, "node -e \"console.log('Build done')\"");
    expect(res.status).toBe("pending_approval");
    expect(res.approvalId).toMatch(/^appr_/);

    const pendingList = getPendingApprovals();
    const found = pendingList.find((p: { id: string; command: string }) => p.id === res.approvalId);
    expect(found).toBeTruthy();
    expect(found?.command).toContain("Build done");
  });

  it("executes the command once approved via resolvePendingApproval", async () => {
    const command = "node -e \"console.log('Approved execution')\"";
    const initialRes = await executeShellCommand("dev-1", ROLES.DEVELOPER, command);
    expect(initialRes.status).toBe("pending_approval");

    // User approves
    const resolveRes = resolvePendingApproval(initialRes.approvalId, "allow-once");
    expect(resolveRes.ok).toBe(true);

    // Now execute with preApproved = true
    const execRes = await executeShellCommand("dev-1", ROLES.DEVELOPER, command, process.cwd(), { preApproved: true });
    expect(execRes.ok).toBe(true);
    expect(execRes.stdout).toContain("Approved execution");
  });
});
