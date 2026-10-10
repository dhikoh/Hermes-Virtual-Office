/**
 * Role Capability Matrix v2.3.1 (Remediated WP2)
 * Enforces strict per-role tool capabilities and boundaries.
 * Based on Virtual AI Office Blueprint v2.3.1 (Section 4.1)
 * Enforces Deny-Wins principle: role restrictions cannot be overridden by prompt/soul.
 */

const {
  evaluateFileRead,
  evaluateFileWrite,
  evaluateShellCommand,
  evaluateBrowserUrl,
  GATE_LEVEL,
} = require("../security/permission-gate");
const { CAPABILITY_TOOLS } = require("./tool-definitions");

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
    tools: [...CAPABILITY_TOOLS.pm],
    canReadWorkspaceCode: false, // PM only sees workspace_map (file paths & metadata), never full file contents
    canWriteWorkspaceCode: false,
    canShell: false,
    canBrowser: false,
  },
  [ROLES.DEVELOPER]: {
    id: ROLES.DEVELOPER,
    title: "Software Developer",
    tools: [...CAPABILITY_TOOLS.developer],
    canReadWorkspaceCode: true,
    canWriteWorkspaceCode: true,
    canShell: true,
    canBrowser: false, // Developer is strictly prohibited from browsing
  },
  [ROLES.RESEARCHER]: {
    id: ROLES.RESEARCHER,
    title: "Web & Tech Researcher",
    tools: [...CAPABILITY_TOOLS.researcher],
    canReadWorkspaceCode: false,
    canWriteWorkspaceCode: false,
    canShell: false,
    canBrowser: true,
  },
  [ROLES.QA]: {
    id: ROLES.QA,
    title: "Quality Assurance Engineer",
    tools: [...CAPABILITY_TOOLS.qa],
    canReadWorkspaceCode: true,
    canWriteWorkspaceCode: false, // QA verifies and tests, never writes code directly
    canShell: true,
    canBrowser: true, // QA can only browse localhost / test endpoints
  },
  [ROLES.WRITER]: {
    id: ROLES.WRITER,
    title: "Documentation & Content Writer",
    tools: [...CAPABILITY_TOOLS.writer],
    canReadWorkspaceCode: true,
    canWriteWorkspaceCode: false,
    canShell: false,
    canBrowser: false,
  },
};

/** Default domain allowlist for Researcher web access */
const DEFAULT_RESEARCH_ALLOWLIST = [
  "github.com",
  "api.github.com",
  "raw.githubusercontent.com",
  "docs.npmjs.com",
  "registry.npmjs.org",
  "developer.mozilla.org",
  "wikipedia.org",
  "*.wikipedia.org",
  "stackoverflow.com",
  "arxiv.org",
  "python.org",
  "nodejs.org",
  "rust-lang.org",
  "go.dev",
];

/**
 * Resolves the operational capability for an agent.
 * Separates display label ('role') from security boundary ('capability').
 * - Only defaultAgentId (orchestrator) may have 'pm' capability.
 * - Non-orchestrator agents attempting 'pm' are denied.
 * - Legacy agents without capability fallback safely to developer with warning.
 */
function resolveCapability(agentId, agent, defaultAgentId = "hermes") {
  if (agentId === defaultAgentId) {
    return ROLES.PM;
  }
  if (!agent) {
    return "";
  }

  const explicitCap = typeof agent.capability === "string" ? agent.capability.toLowerCase().trim() : "";
  if (explicitCap === ROLES.PM) {
    console.warn(`[resolveCapability] Agent '${agentId}' attempted to assume 'pm' capability. Rejected (Deny-Wins).`);
    return "";
  }
  if (explicitCap && Object.values(ROLES).includes(explicitCap)) {
    return explicitCap;
  }

  // Legacy fallback: infer from agent.role label
  const rawRole = typeof agent.role === "string" ? agent.role.toLowerCase().trim() : "";
  if (rawRole && [ROLES.DEVELOPER, ROLES.RESEARCHER, ROLES.QA, ROLES.WRITER].includes(rawRole)) {
    return rawRole;
  }

  console.warn(
    `[resolveCapability] Legacy agent '${agentId}' without standard capability (role: '${agent.role}'), defaulting to developer.`,
  );
  return ROLES.DEVELOPER;
}

/**
 * Validates whether an agent with a given role may perform a specific action.
 * Returns { allowed, level, requiresApproval, reason }
 */
function validateRoleAction(roleId, actionType, params = {}, workspaceRoot = process.cwd()) {
  const normRole = (typeof roleId === "string" ? roleId.toLowerCase().trim() : "") || ROLES.DEVELOPER;
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

    default:
      // Fail-closed (Deny-Wins) for unknown actions (WP2 Step 4)
      return {
        allowed: false,
        level: GATE_LEVEL.BLACK,
        requiresApproval: false,
        reason: `Unknown or unmapped action: ${actionType} (Deny-Wins).`,
      };
  }
}

module.exports = {
  ROLES,
  ROLE_DEFINITIONS,
  DEFAULT_RESEARCH_ALLOWLIST,
  resolveCapability,
  validateRoleAction,
};
