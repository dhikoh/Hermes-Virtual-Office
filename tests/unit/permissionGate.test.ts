import { describe, expect, it } from "vitest";

// Import from CommonJS server modules
const {
  GATE_LEVEL,
  evaluateFileRead,
  evaluateFileWrite,
  evaluateShellCommand,
  evaluateBrowserUrl,
  normalizePath,
} = require("../../server/security/permission-gate");

const {
  ROLES,
  validateRoleAction,
} = require("../../server/roles/role-matrix");

describe("Permission Gate v2.3.1 (Security Engine)", () => {
  const workspaceRoot = "D:/Workspace Virtual/Hermes3D";

  describe("File Read Protection", () => {
    it("classifies safe workspace file reads as GREEN", () => {
      const res = evaluateFileRead("D:/Workspace Virtual/Hermes3D/src/index.ts", workspaceRoot);
      expect(res.level).toBe(GATE_LEVEL.GREEN);
      expect(res.allowed).toBe(true);
    });

    it("strictly blocks reading .env files as BLACK (Deny-Wins)", () => {
      const res = evaluateFileRead("D:/Workspace Virtual/Hermes3D/.env", workspaceRoot);
      expect(res.level).toBe(GATE_LEVEL.BLACK);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("BLACK");
    });

    it("strictly blocks reading SSH keys and credentials as BLACK", () => {
      const sshRes = evaluateFileRead("C:/Users/User/.ssh/id_rsa", workspaceRoot);
      expect(sshRes.level).toBe(GATE_LEVEL.BLACK);
      expect(sshRes.allowed).toBe(false);

      const credRes = evaluateFileRead("D:/Workspace Virtual/Hermes3D/credentials.json", workspaceRoot);
      expect(credRes.level).toBe(GATE_LEVEL.BLACK);
      expect(credRes.allowed).toBe(false);
    });

    it("requires approval (RED) when attempting to read outside the workspace", () => {
      const res = evaluateFileRead("C:/Windows/System32/drivers/etc/hosts", workspaceRoot);
      expect(res.level).toBe(GATE_LEVEL.RED);
      expect(res.allowed).toBe(false);
    });
  });

  describe("File Write Protection", () => {
    it("classifies normal workspace file write as YELLOW (auto with snapshot)", () => {
      const res = evaluateFileWrite("D:/Workspace Virtual/Hermes3D/src/components/Button.tsx", workspaceRoot);
      expect(res.level).toBe(GATE_LEVEL.YELLOW);
      expect(res.allowed).toBe(true);
      expect(res.requiresApproval).toBe(false);
    });

    it("strictly blocks writing into internal .git/ as BLACK", () => {
      const res = evaluateFileWrite("D:/Workspace Virtual/Hermes3D/.git/hooks/pre-commit", workspaceRoot);
      expect(res.level).toBe(GATE_LEVEL.BLACK);
      expect(res.allowed).toBe(false);
    });

    it("requires approval (RED) when writing to build trigger files (package.json)", () => {
      const res = evaluateFileWrite("D:/Workspace Virtual/Hermes3D/package.json", workspaceRoot);
      expect(res.level).toBe(GATE_LEVEL.RED);
      expect(res.requiresApproval).toBe(true);
    });
  });

  describe("Shell Execution Protection", () => {
    it("allows safe read-only commands as YELLOW", () => {
      const res = evaluateShellCommand("git status");
      expect(res.level).toBe(GATE_LEVEL.YELLOW);
      expect(res.allowed).toBe(true);
      expect(res.requiresApproval).toBe(false);
    });

    it("marks normal shell build/test commands as RED (requiring user approval)", () => {
      const res = evaluateShellCommand("npm test");
      expect(res.level).toBe(GATE_LEVEL.RED);
      expect(res.allowed).toBe(true);
      expect(res.requiresApproval).toBe(true);
    });

    it("blocks exfiltration attempts and malicious destruction as BLACK", () => {
      const res = evaluateShellCommand("cat .env");
      expect(res.level).toBe(GATE_LEVEL.BLACK);
      expect(res.allowed).toBe(false);

      const res2 = evaluateShellCommand("type .env");
      expect(res2.level).toBe(GATE_LEVEL.BLACK);
      expect(res2.allowed).toBe(false);
    });
  });

  describe("Browser URL Evaluation", () => {
    const allowlist = ["wikipedia.org", "github.com", "developer.mozilla.org"];

    it("allows navigation to allowlisted domains as YELLOW", () => {
      const res = evaluateBrowserUrl("https://github.com/torvalds/linux", allowlist);
      expect(res.level).toBe(GATE_LEVEL.YELLOW);
      expect(res.allowed).toBe(true);
      expect(res.requiresApproval).toBe(false);
    });

    it("requires approval (RED) for un-allowlisted domains", () => {
      const res = evaluateBrowserUrl("https://unknown-random-site.xyz/page", allowlist);
      expect(res.level).toBe(GATE_LEVEL.RED);
      expect(res.requiresApproval).toBe(true);
    });
  });
});

describe("Role Capability Matrix v2.3.1", () => {
  const workspaceRoot = "D:/Workspace Virtual/Hermes3D";

  it("Developer: Can read/write code and execute shell, but is PROHIBITED from browser", () => {
    const read = validateRoleAction(ROLES.DEVELOPER, "read_file", { filePath: `${workspaceRoot}/src/app.ts` }, workspaceRoot);
    expect(read.allowed).toBe(true);

    const shell = validateRoleAction(ROLES.DEVELOPER, "execute_command", { command: "npm run build" });
    expect(shell.level).toBe(GATE_LEVEL.RED);
    expect(shell.requiresApproval).toBe(true);

    const browser = validateRoleAction(ROLES.DEVELOPER, "browser_navigate", { url: "https://github.com" });
    expect(browser.allowed).toBe(false);
    expect(browser.level).toBe(GATE_LEVEL.BLACK);
    expect(browser.reason).toContain("prohibited from using browser");
  });

  it("Researcher: Can browse allowlisted web, but CANNOT read workspace code or execute shell", () => {
    const browser = validateRoleAction(ROLES.RESEARCHER, "browser_navigate", { url: "https://wikipedia.org/wiki/AI" });
    expect(browser.allowed).toBe(true);
    expect(browser.level).toBe(GATE_LEVEL.YELLOW);

    const read = validateRoleAction(ROLES.RESEARCHER, "read_file", { filePath: `${workspaceRoot}/src/app.ts` }, workspaceRoot);
    expect(read.allowed).toBe(false);
    expect(read.level).toBe(GATE_LEVEL.BLACK);

    const shell = validateRoleAction(ROLES.RESEARCHER, "execute_command", { command: "npm test" });
    expect(shell.allowed).toBe(false);
    expect(shell.level).toBe(GATE_LEVEL.BLACK);
  });

  it("QA: Can execute test shell and browse ONLY localhost", () => {
    const localBrowser = validateRoleAction(ROLES.QA, "browser_navigate", { url: "http://localhost:3000/office" });
    expect(localBrowser.allowed).toBe(true);
    expect(localBrowser.level).toBe(GATE_LEVEL.YELLOW);

    const extBrowser = validateRoleAction(ROLES.QA, "browser_navigate", { url: "https://google.com" });
    expect(extBrowser.allowed).toBe(false);
    expect(extBrowser.level).toBe(GATE_LEVEL.BLACK);
    expect(extBrowser.reason).toContain("strictly limited to localhost");

    const write = validateRoleAction(ROLES.QA, "write_file", { filePath: `${workspaceRoot}/src/app.ts` }, workspaceRoot);
    expect(write.allowed).toBe(false);
    expect(write.level).toBe(GATE_LEVEL.BLACK);
  });

  it("PM (Orchestrator): Can inspect workspace_map, but cannot read raw files or execute shell", () => {
    const map = validateRoleAction(ROLES.PM, "workspace_map", {});
    expect(map.allowed).toBe(true);

    const read = validateRoleAction(ROLES.PM, "read_file", { filePath: `${workspaceRoot}/src/app.ts` }, workspaceRoot);
    expect(read.allowed).toBe(false);
    expect(read.level).toBe(GATE_LEVEL.BLACK);

    const shell = validateRoleAction(ROLES.PM, "execute_command", { command: "ls" });
    expect(shell.allowed).toBe(false);
    expect(shell.level).toBe(GATE_LEVEL.BLACK);
  });
});
