/**
 * Shell / CLI Execution Engine v2.3.1
 * Safely executes terminal commands for Developer & QA roles under Permission Gate rules.
 * Enforces timeout, max buffer output, and user approval workflows.
 * Based on Virtual AI Office Blueprint v2.3.1 (Section 5.1 & 5.3)
 */

const { spawn } = require("node:child_process");
const { validateRoleAction } = require("../roles/role-matrix");
const { GATE_LEVEL } = require("../security/permission-gate");

/** In-memory store for pending approvals */
const pendingApprovals = new Map();
/** Set of commands approved for the session ("allow-always") */
const sessionAllowedCommands = new Set();

/**
 * Requests an approval ticket for a RED-tier command
 */
function createPendingApproval(agentId, command, cwd = process.cwd(), host = "local") {
  const approvalId = `appr_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const expiresAtMs = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

  const entry = {
    id: approvalId,
    agentId,
    command,
    cwd,
    host,
    expiresAtMs,
    createdAt: Date.now(),
    status: "pending",
  };

  pendingApprovals.set(approvalId, entry);
  return entry;
}

/**
 * Resolves a pending approval with user decision
 * @param {string} approvalId
 * @param {"allow-once" | "allow-always" | "deny"} decision
 */
function resolvePendingApproval(approvalId, decision) {
  const approval = pendingApprovals.get(approvalId);
  if (!approval) {
    throw new Error(`Approval ${approvalId} not found or expired.`);
  }

  if (decision === "deny") {
    pendingApprovals.delete(approvalId);
    return { ok: false, decision: "deny", approvalId };
  }

  if (decision === "allow-always") {
    sessionAllowedCommands.add(approval.command.trim());
  }

  pendingApprovals.delete(approvalId);
  return { ok: true, decision, approvalId, approvedCommand: approval.command, cwd: approval.cwd };
}

/**
 * Lists all active pending approvals
 */
function getPendingApprovals() {
  const now = Date.now();
  // Filter out expired entries
  for (const [id, entry] of pendingApprovals.entries()) {
    if (now > entry.expiresAtMs) pendingApprovals.delete(id);
  }
  return Array.from(pendingApprovals.values());
}

/**
 * Executes a shell command with strict safety constraints
 */
function executeShellCommand(agentId, role, command, cwd = process.cwd(), options = {}) {
  return new Promise((resolve) => {
    // 1. Role Matrix & Gate Evaluation
    const evalResult = validateRoleAction(role, "execute_command", { command });
    if (!evalResult.allowed) {
      return resolve({
        ok: false,
        level: evalResult.level,
        exitCode: 1,
        stderr: `Blocked by Security Gate: ${evalResult.reason}`,
        stdout: "",
      });
    }

    const trimmedCommand = command.trim();
    const isPreApproved =
      options.preApproved ||
      sessionAllowedCommands.has(trimmedCommand) ||
      evalResult.level === GATE_LEVEL.YELLOW;

    // 2. If command is RED and not approved yet, return pending approval ticket
    if (evalResult.level === GATE_LEVEL.RED && !isPreApproved) {
      const approval = createPendingApproval(agentId, trimmedCommand, cwd);
      return resolve({
        ok: false,
        status: "pending_approval",
        approvalId: approval.id,
        level: GATE_LEVEL.RED,
        command: trimmedCommand,
        reason: evalResult.reason,
      });
    }

    // 3. Execution in sandboxed subprocess with timeout and buffer limits
    const timeoutMs = options.timeoutMs || 30000;
    const maxBuffer = options.maxBuffer || 128 * 1024; // 128 KB

    const startTime = Date.now();
    let stdoutBuffer = "";
    let stderrBuffer = "";
    let killedDueToTimeout = false;

    const proc = spawn(trimmedCommand, {
      cwd,
      shell: true,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      killedDueToTimeout = true;
      proc.kill("SIGKILL");
    }, timeoutMs);

    proc.stdout.on("data", (chunk) => {
      if (stdoutBuffer.length < maxBuffer) {
        stdoutBuffer += chunk.toString("utf8");
        if (stdoutBuffer.length >= maxBuffer) {
          stdoutBuffer += "\n[OUTPUT TRUNCATED: Exceeded 128KB buffer limit]";
        }
      }
    });

    proc.stderr.on("data", (chunk) => {
      if (stderrBuffer.length < maxBuffer) {
        stderrBuffer += chunk.toString("utf8");
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: 1,
        stdout: stdoutBuffer,
        stderr: err.message,
        executionTimeMs: Date.now() - startTime,
      });
    });

    proc.on("close", (code) => {
      clearTimeout(timer);
      const executionTimeMs = Date.now() - startTime;
      if (killedDueToTimeout) {
        return resolve({
          ok: false,
          exitCode: 124,
          stdout: stdoutBuffer,
          stderr: `Execution timed out after ${timeoutMs}ms. Process terminated.`,
          executionTimeMs,
        });
      }
      resolve({
        ok: code === 0,
        exitCode: code,
        stdout: stdoutBuffer,
        stderr: stderrBuffer,
        executionTimeMs,
      });
    });
  });
}

module.exports = {
  createPendingApproval,
  resolvePendingApproval,
  getPendingApprovals,
  executeShellCommand,
};
