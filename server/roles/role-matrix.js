/**
 * Role Capability Matrix v2.3.1
 * Enforces strict per-role tool capabilities and boundaries.
 * Based on Virtual AI Office Blueprint v2.3.1 (Section 4.1)
 * Enforces Deny-Wins principle: role restrictions cannot be overridden by prompt/soul.
 */

const { evaluateFileRead, evaluateFileWrite, evaluateShellCommand, evaluateBrowserUrl, GATE_LEVEL } = require("../security/permission-gate");

const ROLES = {
  PM: "pm",
  DEVELOPER: "developer",
  RESEARCHER: "researcher",
  QA: "qa",
  WRITER: "writer",
};

/** Normalized role definitions and allowed tools */
const ROLE_DEFINITIONS = {
  [ROLES.PM]: {
    id: ROLES.PM,
    title: "Project Manager / Orchestrator",
    tools: ["workspace_map", "spawn_agent", "delegate_task", "list_team", "read_agent_context", "write_plan"],
    canReadWorkspaceCode: false, // PM only sees workspace_map (file paths & metadata), never full file contents
    canWriteWorkspaceCode: false,
    canShell: false,
    canBrowser: false,
  },
  [ROLES.DEVELOPER]: {
    id: ROLES.DEVELOPER,
    title: "Software Developer",
    tools: ["workspace_map", "read_file", "write_file", "execute_command", "read_agent_context"],
    canReadWorkspaceCode: true,
    canWriteWorkspaceCode: true,
    canShell: true,
    canBrowser: false, // Developer is strictly prohibited from browsing
  },
  [ROLES.RESEARCHER]: {
    id: ROLES.RESEARCHER,
    title: "Web & Tech Researcher",
    tools: ["web_search", "fetch_web_content", "save_research", "read_agent_context"],
    canReadWorkspaceCode: false, // Researcher cannot read workspace files
    canWriteWorkspaceCode: false, // Researcher writes ONLY to _AI/research/
    canShell: false,
    canBrowser: true,
  },
  [ROLES.QA]: {
    id: ROLES.QA,
    title: "Quality Assurance Engineer",
    tools: ["workspace_map", "read_file", "execute_command", "browse_localhost", "read_agent_context"],
    canReadWorkspaceCode: true,
    canWriteWorkspaceCode: false, // QA does not modify code directly
    canShell: true, // For running test suites
    canBrowser: true, // ONLY localhost
  },
  [ROLES.WRITER]: {
    id: ROLES.WRITER,
    title: "Technical Writer & Documentation",
    tools: ["workspace_map", "read_file", "write_docs", "read_agent_context"],
    canReadWorkspaceCode: true,
    canWriteWorkspaceCode: false, // Only writes to _AI/
    canShell: false,
    canBrowser: false,
  },
};

/** Default domain allowlist for Researcher */
const DEFAULT_RESEARCH_ALLOWLIST = [
  "github.com",
  "wikipedia.org",
  "developer.mozilla.org",
  "devdocs.io",
  "npmjs.com",
  "pypi.org",
  "nodejs.org",
  "python.org",
  "stackoverflow.com",
  "w3schools.com",
  "arxiv.org",
];

/**
 * Validates if an agent with a given role can perform a specific action
 * Returns { allowed: boolean, level: string, requiresApproval: boolean, reason: string }
 */
function validateRoleAction(roleId, actionType, params = {}, workspaceRoot = process.cwd()) {
  const normRole = (typeof roleId === "string" ? roleId.toLowerCase() : "") || ROLES.DEVELOPER;
  const roleDef = ROLE_DEFINITIONS[normRole] || ROLE_DEFINITIONS[ROLES.DEVELOPER];

  switch (actionType) {
    case "workspace_map": {
      if (!roleDef.tools.includes("workspace_map")) {
        return { allowed: false, level: GATE_LEVEL.BLACK, reason: `Role ${normRole} cannot inspect workspace map.` };
      }
      return { allowed: true, level: GATE_LEVEL.GREEN, requiresApproval: false, reason: "Allowed" };
    }

    case "read_file": {
      if (!roleDef.canReadWorkspaceCode) {
        return { allowed: false, level: GATE_LEVEL.BLACK, reason: `Role ${normRole} is not permitted to read workspace code directly (Deny-Wins).` };
      }
      return evaluateFileRead(params.filePath, workspaceRoot);
    }

    case "write_file": {
      if (!roleDef.canWriteWorkspaceCode) {
        return { allowed: false, level: GATE_LEVEL.BLACK, reason: `Role ${normRole} is not permitted to write code to the workspace (Deny-Wins).` };
      }
      return evaluateFileWrite(params.filePath, workspaceRoot);
    }

    case "execute_command": {
      if (!roleDef.canShell) {
        return { allowed: false, level: GATE_LEVEL.BLACK, reason: `Role ${normRole} does not have shell execution privileges (Deny-Wins).` };
      }
      return evaluateShellCommand(params.command);
    }

    case "browser_navigate": {
      if (!roleDef.canBrowser) {
        return { allowed: false, level: GATE_LEVEL.BLACK, reason: `Role ${normRole} is prohibited from using browser tools (Deny-Wins).` };
      }
      const url = params.url || "";
      if (normRole === ROLES.QA) {
        // QA can ONLY access localhost / 127.0.0.1
        try {
          const parsed = new URL(url);
          const host = parsed.hostname.toLowerCase();
          if (host === "localhost" || host === "127.0.0.1" || host === "::1") {
            return { allowed: true, level: GATE_LEVEL.YELLOW, requiresApproval: false, reason: "QA local testing allowed (YELLOW)" };
          }
          return { allowed: false, level: GATE_LEVEL.BLACK, reason: "QA is strictly limited to localhost URLs (Deny-Wins)." };
        } catch {
          return { allowed: false, level: GATE_LEVEL.BLACK, reason: "Invalid QA test URL." };
        }
      }

      // Researcher: check domain allowlist
      const allowlist = params.allowlist || DEFAULT_RESEARCH_ALLOWLIST;
      return evaluateBrowserUrl(url, allowlist);
    }

    case "save_research": {
      // Allowed for Researcher writing exclusively to _AI/research/
      const targetPath = (params.filePath || "").replace(/\\/g, "/");
      if (normRole !== ROLES.RESEARCHER) {
        return { allowed: false, level: GATE_LEVEL.BLACK, reason: `Only Researcher may use save_research.` };
      }
      if (!targetPath.includes("/_AI/research/") && !targetPath.startsWith("_AI/research/")) {
        return { allowed: false, level: GATE_LEVEL.BLACK, reason: `save_research is restricted to the _AI/research/ directory (Deny-Wins).` };
      }
      return { allowed: true, level: GATE_LEVEL.GREEN, requiresApproval: false, reason: "Saved to research vault (GREEN)" };
    }

    default:
      return { allowed: true, level: GATE_LEVEL.GREEN, requiresApproval: false, reason: "Generic action" };
  }
}

module.exports = {
  ROLES,
  ROLE_DEFINITIONS,
  DEFAULT_RESEARCH_ALLOWLIST,
  validateRoleAction,
};
