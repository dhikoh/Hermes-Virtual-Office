/**
 * Permission Gate v2.3.1 Engine
 * Implements 4-tier security classification: GREEN, YELLOW, RED, BLACK
 * Based on Virtual AI Office Blueprint v2.3.1 (Section 5.1)
 * Enforces Deny-Wins principle.
 */

const path = require("node:path");

const GATE_LEVEL = {
  GREEN: "GREEN",
  YELLOW: "YELLOW",
  RED: "RED",
  BLACK: "BLACK",
};

/** Sensitive path patterns that are BLACK for read or write */
const BLACK_PATTERNS = [
  /(?:^|[\\/])\.env(?:\.|$)/i,
  /(?:^|[\\/])\.ssh(?:[\\/]|$)/i,
  /(?:^|[\\/])id_rsa/i,
  /(?:^|[\\/])id_ed25519/i,
  /(?:^|[\\/])\.aws(?:[\\/]|$)/i,
  /(?:^|[\\/])credentials(?:\.|$)/i,
  /(?:^|[\\/])\.git[\\/]/i, // Writing or direct access into .git internal files
  /(?:^|[\\/])token[s]?(?:\.|$)/i,
  /(?:^|[\\/])policy\.json$/i,
  /(?:^|[\\/])audit\.log$/i,
  /(?:^|[\\/]|\b)cookies(?:\.|$)/i,
  /(?:^|[\\/]|\b)User Data[\\/]Default/i, // Chrome/Edge user browser profiles
];

/** Execution-sensitive files (RED to write, triggers special review) */
const SENSITIVE_WRITE_PATTERNS = [
  /(?:^|[\\/])\.github[\\/]workflows[\\/]/i,
  /(?:^|[\\/])\.husky[\\/]/i,
  /(?:^|[\\/])\.vscode[\\/](?:tasks|launch|settings)\.json/i,
  /(?:^|[\\/])package\.json$/i,
  /(?:^|[\\/])Makefile$/i,
  /(?:^|[\\/])Dockerfile$/i,
];

/** Read-only fixed commands that can be YELLOW (automated with notification) */
const FIXED_READONLY_COMMANDS = [
  /^git\s+status(?:\s+.*)?$/i,
  /^git\s+log(?:\s+.*)?$/i,
  /^git\s+diff(?:\s+.*)?$/i,
  /^dir(?:\s+.*)?$/i,
  /^ls(?:\s+.*)?$/i,
];

/** Commands strictly BLACK (cannot be run by any agent) */
const BLACK_COMMAND_PATTERNS = [
  /\brmdir\s+\/s\s+\/q\s+[c-z]:\\/i,
  /\bformat\s+[c-z]:/i,
  /\bcat\s+.*\.env\b/i,
  /\btype\s+.*\.env\b/i,
  /\bcurl\s+.*-d\s+.*\.env\b/i,
  /\bInvoke-WebRequest\s+.*\.env\b/i,
  /\bpowershell\s+-enc\b/i,
  /\bshutdown\b/i,
];

/**
 * Normalizes paths across Windows & POSIX conventions
 */
function normalizePath(targetPath) {
  if (typeof targetPath !== "string") return "";
  let clean = targetPath.trim();
  clean = path.normalize(clean);
  // Unify drive letter to lowercase for consistent comparison
  if (/^[A-Za-z]:/.test(clean)) {
    clean = clean[0].toLowerCase() + clean.slice(1);
  }
  return clean.replace(/\\/g, "/");
}

/**
 * Evaluates file read permission
 */
function evaluateFileRead(filePath, workspaceRoot) {
  const normPath = normalizePath(filePath);
  const normRoot = normalizePath(workspaceRoot);

  for (const pattern of BLACK_PATTERNS) {
    if (pattern.test(normPath)) {
      return {
        level: GATE_LEVEL.BLACK,
        allowed: false,
        reason: `Access to sensitive path blocked (BLACK): ${filePath}`,
      };
    }
  }

  // Check if within workspace or vault
  if (normRoot && !normPath.startsWith(normRoot)) {
    return {
      level: GATE_LEVEL.RED,
      allowed: false,
      reason: `Reading outside workspace requires user approval (RED): ${filePath}`,
    };
  }

  return {
    level: GATE_LEVEL.GREEN,
    allowed: true,
    reason: "Safe workspace read (GREEN)",
  };
}

/**
 * Evaluates file write/edit permission
 */
function evaluateFileWrite(filePath, workspaceRoot) {
  const normPath = normalizePath(filePath);
  const normRoot = normalizePath(workspaceRoot);

  for (const pattern of BLACK_PATTERNS) {
    if (pattern.test(normPath)) {
      return {
        level: GATE_LEVEL.BLACK,
        allowed: false,
        reason: `Writing to protected path forbidden (BLACK): ${filePath}`,
      };
    }
  }

  // Writing outside workspace is RED
  if (normRoot && !normPath.startsWith(normRoot)) {
    return {
      level: GATE_LEVEL.RED,
      allowed: true,
      requiresApproval: true,
      reason: `Writing outside workspace requires approval (RED): ${filePath}`,
    };
  }

  // Writing to sensitive trigger files is RED
  for (const pattern of SENSITIVE_WRITE_PATTERNS) {
    if (pattern.test(normPath)) {
      return {
        level: GATE_LEVEL.RED,
        allowed: true,
        requiresApproval: true,
        reason: `Writing to build trigger or execution config requires approval (RED): ${filePath}`,
      };
    }
  }

  // Safe file modification inside workspace: YELLOW (auto with snapshot)
  return {
    level: GATE_LEVEL.YELLOW,
    allowed: true,
    requiresApproval: false,
    reason: "Workspace write with automatic snapshot (YELLOW)",
  };
}

/**
 * Evaluates shell command permission
 */
function evaluateShellCommand(command) {
  if (typeof command !== "string" || !command.trim()) {
    return { level: GATE_LEVEL.BLACK, allowed: false, reason: "Empty command (BLACK)" };
  }

  const trimmed = command.trim();

  for (const pattern of BLACK_COMMAND_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        level: GATE_LEVEL.BLACK,
        allowed: false,
        reason: `Dangerous or secret-exfiltrating shell command blocked (BLACK): ${trimmed}`,
      };
    }
  }

  // Fixed read-only command: YELLOW
  for (const pattern of FIXED_READONLY_COMMANDS) {
    if (pattern.test(trimmed)) {
      return {
        level: GATE_LEVEL.YELLOW,
        allowed: true,
        requiresApproval: false,
        reason: `Safe read-only command (YELLOW): ${trimmed}`,
      };
    }
  }

  // Standard commands: RED (always requires user approval)
  return {
    level: GATE_LEVEL.RED,
    allowed: true,
    requiresApproval: true,
    reason: `Shell execution requires explicit user approval (RED): ${trimmed}`,
  };
}

/**
 * Evaluates browser URL navigation
 */
function evaluateBrowserUrl(url, allowlist = []) {
  if (typeof url !== "string") {
    return { level: GATE_LEVEL.BLACK, allowed: false, reason: "Invalid URL (BLACK)" };
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return { level: GATE_LEVEL.BLACK, allowed: false, reason: "Malformed URL (BLACK)" };
  }

  // Block localhost for external researcher (QA only)
  const host = parsed.hostname.toLowerCase();

  // Check allowlist
  const isAllowlisted = allowlist.some((domain) => {
    const d = domain.toLowerCase();
    return host === d || host.endsWith("." + d);
  });

  if (isAllowlisted) {
    return {
      level: GATE_LEVEL.YELLOW,
      allowed: true,
      requiresApproval: false,
      reason: `Allowlisted domain navigation (YELLOW): ${host}`,
    };
  }

  // Non-allowlisted domain: RED (requires approval)
  return {
    level: GATE_LEVEL.RED,
    allowed: true,
    requiresApproval: true,
    reason: `Navigating to domain outside allowlist requires approval (RED): ${host}`,
  };
}

module.exports = {
  GATE_LEVEL,
  normalizePath,
  evaluateFileRead,
  evaluateFileWrite,
  evaluateShellCommand,
  evaluateBrowserUrl,
};
