"use strict";

/**
 * Hermes Gateway Adapter - with multi-agent orchestration
 *
 * The main Hermes agent acts as an orchestrator and can:
 *   - spawn_agent(name, role, instructions, wipe, continuity, boundaries)
 *   - delegate_task(agent_id, message)
 *   - list_team()
 *   - configure_agent(agent_id, ...)
 *   - dismiss_agent(agent_id)
 *
 * Sub-agents appear as 3D characters in the office, each with their own
 * conversation history, system prompt, and settings.
 *
 * Environment variables:
 *   HERMES_API_URL        Hermes HTTP API base URL   (default: http://localhost:8642)
 *   HERMES_API_KEY        Bearer token for Hermes     (default: empty)
 *   HERMES_ADAPTER_PORT   WebSocket port              (default: 18789)
 *   HERMES_MODEL          Model identifier            (default: hermes)
 *   HERMES_AGENT_NAME     Display name in Hermes3D UI   (default: Hermes)
 */

const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { WebSocketServer } = require("ws");

const { ROLE_DEFINITIONS, validateRoleAction, resolveCapability } = require("./roles/role-matrix");
const { ALL_TOOLS, toolsForCapability, toolNames } = require("./roles/tool-definitions");
const { createSnapshot, listSnapshots, rollbackSnapshot } = require("./workspace/snapshot-manager");
const { executeShellCommand, resolvePendingApproval, getPendingApprovals } = require("./execution/shell-executor");
const { listVaultDocuments } = require("./vault/vault-manager");
const {
  fetchIsolatedPage,
  saveResearchToVault,
  isCamoufoxAvailable,
  listAgentProfiles,
} = require("./research/browser-service");
const {
  createBrainArchive,
  restoreBrainArchive,
  getBrainStatus,
  unpackTarGz,
} = require("./system/brain-manager");

function loadDotenvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key] !== undefined) continue;
    let value = rawValue.trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

function loadRuntimeEnv() {
  const cwd = process.cwd();
  loadDotenvFile(path.join(cwd, ".env.local"));
  loadDotenvFile(path.join(cwd, ".env"));
}

loadRuntimeEnv();

let HERMES_API_URL = (process.env.HERMES_API_URL || "http://localhost:8642").replace(/\/$/, "");
let HERMES_API_KEY = process.env.HERMES_API_KEY || "";
const ADAPTER_PORT = parseInt(process.env.HERMES_ADAPTER_PORT || "18789", 10);
let HERMES_MODEL = process.env.HERMES_MODEL || "hermes";
const HERMES_AGENT_NAME = process.env.HERMES_AGENT_NAME || "Hermes";
const { resolveStateDir } = require("./lib/state-dir");
const STATE_DIR = resolveStateDir(process.env);

const AGENT_ID = "hermes";
const MAIN_KEY = "main";
const MAIN_SESSION_KEY = `agent:${AGENT_ID}:${MAIN_KEY}`;
const CONFIG_PATH = path.join(STATE_DIR, "config.json");
const MAX_TOOL_ROUNDS = 8;

// ---------------------------------------------------------------------------
// Orchestrator system prompt
// ---------------------------------------------------------------------------

const ORCHESTRATOR_SYSTEM_PROMPT = `You are ${HERMES_AGENT_NAME}, an AI orchestrator managing a team of sub-agents in a virtual 3D office.

You have tools to build and manage your team autonomously:

- **spawn_agent**: Create a new specialist agent with a name, role, instructions, and settings (wipe/continuity/boundaries).
- **delegate_task**: Send a task to a specific agent and receive their response.
- **list_team**: See all current team members and their IDs, names, and roles.
- **configure_agent**: Update an agent's name, role/title, instructions, or settings.
- **dismiss_agent**: Remove an agent from the team.
- **read_agent_context**: Read the recent conversation history of another agent to understand what they are currently working on, what they have already done, or what their status is. Use this for coordination - before delegating a task, check if the agent already has relevant context.

When given a goal:
1. Analyse what specialist roles are needed.
2. spawn_agent for each specialist.
3. delegate_task to assign work and coordinate.
4. Use read_agent_context to check what an agent has done or is doing before re-delegating.
5. Synthesise results into a final answer for the user.

Each spawned agent will appear as an animated character in the 3D office - walking when active, standing when idle.
Be concise in your responses to the user; do the heavy lifting via tool calls.`;

// ---------------------------------------------------------------------------
// Team management tools definition (OpenAI tool-calling format)
// ---------------------------------------------------------------------------

const TEAM_TOOLS = [
  {
    type: "function",
    function: {
      name: "spawn_agent",
      description: "Create a new sub-agent team member. Returns the agent's ID.",
      parameters: {
        type: "object",
        required: ["name", "role"],
        properties: {
          name: { type: "string", description: "Display name, e.g. 'Backend Dev'" },
          role: { type: "string", description: "Short role description, e.g. 'Python backend specialist'" },
          instructions: { type: "string", description: "System prompt / instructions for this agent" },
          wipe: { type: "boolean", description: "Clear history before each run (stateless). Default false." },
          continuity: { type: "boolean", description: "Maintain full conversation history. Default true." },
          boundaries: { type: "string", description: "Hard constraints on what this agent may do" },
          model: { type: "string", description: "Model to use. Defaults to hermes." },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delegate_task",
      description: "Send a task or question to a specific team member and get their response.",
      parameters: {
        type: "object",
        required: ["agent_id", "message"],
        properties: {
          agent_id: { type: "string", description: "ID returned by spawn_agent" },
          message: { type: "string", description: "The task, question, or instructions to send" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_team",
      description: "List all current team members with their IDs, names, and roles.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "configure_agent",
      description: "Update an existing agent's name, role/title, instructions, or settings.",
      parameters: {
        type: "object",
        required: ["agent_id"],
        properties: {
          agent_id: { type: "string" },
          name: { type: "string" },
          role: { type: "string", description: "Short role or title shown as subtitle below the agent name in the office (e.g. 'Marketing Chef', 'Code Reviewer')." },
          instructions: { type: "string" },
          wipe: { type: "boolean" },
          continuity: { type: "boolean" },
          boundaries: { type: "string" },
          model: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "dismiss_agent",
      description: "Remove an agent from the team.",
      parameters: {
        type: "object",
        required: ["agent_id"],
        properties: {
          agent_id: { type: "string" },
          reason: { type: "string" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "read_agent_context",
      description: "Read the recent conversation history of another agent to understand what they are working on, what they have already done, or what their current status is. Useful for coordination and avoiding duplicate work.",
      parameters: {
        type: "object",
        required: ["agent_id"],
        properties: {
          agent_id: { type: "string", description: "ID of the agent whose context you want to read" },
          last_n: { type: "number", description: "How many recent messages to return (default 10, max 40)" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "workspace_map",
      description: "Inspect the project workspace file tree (relative paths and sizes only, no file content). Allowed for PM, Developer, and QA.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read file contents from workspace. Protected by Role Matrix and Permission Gate (blocks .env/secrets).",
      parameters: {
        type: "object",
        required: ["file_path"],
        properties: {
          file_path: { type: "string", description: "Relative path to file in workspace" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write or update a file in the workspace. Automatically creates a pre-mutation snapshot for 1-click rollback.",
      parameters: {
        type: "object",
        required: ["file_path", "content"],
        properties: {
          file_path: { type: "string", description: "Relative path to file in workspace" },
          content: { type: "string", description: "New file content to write" },
          description: { type: "string", description: "Short explanation of the change for snapshot logs" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "execute_command",
      description: "Run a shell command (for Developer and QA). Dangerous/write commands pause for user approval.",
      parameters: {
        type: "object",
        required: ["command"],
        properties: {
          command: { type: "string", description: "Shell command to run (e.g. npm test, git status)" },
          cwd: { type: "string", description: "Optional working directory" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "web_search_and_read",
      description: "Fetch content from allowlisted web domains for research (Researcher only, isolated without cookies).",
      parameters: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", description: "HTTP/HTTPS URL on allowlisted domain" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_research_note",
      description: "Save research report to the Obsidian Markdown vault (_AI/research/). For Researcher only.",
      parameters: {
        type: "object",
        required: ["topic", "content"],
        properties: {
          topic: { type: "string", description: "Title or topic of the research" },
          content: { type: "string", description: "Markdown body of findings" },
          sources: { type: "array", items: { type: "string" }, description: "List of source URLs" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_snapshots",
      description: "List existing workspace rollback snapshots.",
      parameters: { type: "object", properties: {} },
    },
  },
  {
    type: "function",
    function: {
      name: "rollback_workspace",
      description: "Rollback workspace files to a specific snapshot ID in 1 click.",
      parameters: {
        type: "object",
        required: ["snapshot_id"],
        properties: {
          snapshot_id: { type: "string", description: "ID of snapshot to restore" },
        },
      },
    },
  },
];

// ---------------------------------------------------------------------------
// In-memory state
// ---------------------------------------------------------------------------

/** @type {Map<string, Array<{role: string, content: string}>>} */
const conversationHistory = new Map();

/** @type {Map<string, {model?: string, thinkingLevel?: string}>} */
const sessionSettings = new Map();

/** @type {Map<string, string>} agentId/filename -> content */
const agentFiles = new Map();

/** @type {Map<string, {runId: string, sessionKey: string, agentId: string, abort: () => void}>} runId -> abort handle */
const activeRuns = new Map();

/** @type {Map<string, object>} jobId -> CronJobSummary */
const cronJobs = new Map();

/**
 * @type {Map<string, {
 *   id: string, name: string, workspace: string,
 *   role?: string, systemPrompt?: string,
 *   settings: { wipe: boolean, continuity: boolean, model: string, boundaries?: string }
 * }>}
 */
const agentRegistry = new Map([
  [AGENT_ID, {
    id: AGENT_ID,
    name: HERMES_AGENT_NAME,
    workspace: path.join(STATE_DIR, "workspace-hermes"),
    role: "Orchestrator",
    systemPrompt: ORCHESTRATOR_SYSTEM_PROMPT,
    settings: { wipe: false, continuity: true, model: HERMES_MODEL },
  }],
]);

// Set of all active sendEvent functions (one per connected WS client)
/** @type {Set<(frame: object) => void>} */
const activeSendEventFns = new Set();

// ---------------------------------------------------------------------------
// Disk persistence for conversation history
// ---------------------------------------------------------------------------

const HISTORY_FILE = path.join(STATE_DIR, "hermes3d-history.json");
let persistDebounceTimer = null;

// Merge two message lists for one session. Keeps both sides, dedupes identical
// messages (role + content + timestamp), and orders by timestamp when present.
// ponytail: dedupe is by exact content, so two identical messages with no
// timestamp collapse into one. Upgrade: store message ids.
function mergeHistory(a, b) {
  const seen = new Set();
  const out = [];
  for (const m of [...a, ...b]) {
    if (!m || typeof m !== "object") continue;
    const sig = `${m.role}|${typeof m.content === "string" ? m.content : JSON.stringify(m.content)}|${m.timestamp ?? m.ts ?? ""}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(m);
  }
  const ts = (m) => Number(m.timestamp ?? m.ts ?? NaN);
  if (out.every((m) => Number.isFinite(ts(m)))) out.sort((x, y) => ts(x) - ts(y));
  return out;
}

// ponytail: single source of truth is HISTORY_FILE. Old copies in /tmp, D:/tmp,
// or cwd are no longer read. Upgrade: add a one-time migration if those files matter.
function loadHistoryFromDisk() {
  const candidateFiles = [HISTORY_FILE];

  try {
    for (const candidate of candidateFiles) {
      if (!fs.existsSync(candidate)) continue;
      try {
        const raw = fs.readFileSync(candidate, "utf8");
        const data = JSON.parse(raw);
        if (data && typeof data === "object") {
          for (const [key, messages] of Object.entries(data)) {
            if (Array.isArray(messages) && messages.length > 0) {
              conversationHistory.set(key, mergeHistory(conversationHistory.get(key) || [], messages));
            }
          }
        }
      } catch {}
    }
    console.log(`[hermes-adapter] Loaded history for ${conversationHistory.size} session(s).`);
    if (conversationHistory.size > 0) {
      saveHistoryToDisk();
    }
  } catch (err) {
    console.warn("[hermes-adapter] Could not load history:", sanitizeErrorMessage(err));
  }
}

// Atomic write: write temp file, then rename over target. A crash mid-write
// leaves the previous complete file in place instead of a truncated one.
function writeFileAtomic(filePath, text) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text, "utf8");
  fs.renameSync(tmp, filePath);
}

function writeHistoryFile() {
  const data = {};
  for (const [key, messages] of conversationHistory.entries()) {
    if (messages.length > 0) data[key] = messages;
  }
  writeFileAtomic(HISTORY_FILE, JSON.stringify(data, null, 2));
}

function saveHistoryToDisk() {
  if (persistDebounceTimer) clearTimeout(persistDebounceTimer);
  persistDebounceTimer = setTimeout(() => {
    persistDebounceTimer = null;
    try { writeHistoryFile(); } catch (err) {
      console.warn("[hermes-adapter] Could not save history:", sanitizeErrorMessage(err));
    }
  }, 500);
}

// ---------------------------------------------------------------------------
// Disk persistence for agent roster (spawned sub-agents survive restart)
// ---------------------------------------------------------------------------

const AGENTS_FILE = path.join(STATE_DIR, "hermes3d-agents.json");
let persistAgentsTimer = null;


function slugify(name) {
  const raw = typeof name === "string" ? name.trim().toLowerCase() : "";
  const cleaned = raw.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "agent";
}

function broadcastPresence() {
  broadcastEvent({
    type: "event",
    event: "presence",
    payload: {
      sessions: {
        recent: [],
        byAgent: [...agentRegistry.keys()].map((aid) => ({
          agentId: aid,
          recent: [],
        })),
      },
    },
  });
}

function createAgentEntry({ name, role = "", capability, instructions = "", boundaries = "", settings = {}, workspace, id }) {
  const safeName = (typeof name === "string" && name.trim()) ? name.trim() : "Agent";
  const slug = slugify(safeName);
  const newId = id || `${slug}-${randomId().slice(0, 6)}`;

  let resolvedCap = typeof capability === "string" ? capability.toLowerCase().trim() : "";
  if (resolvedCap === "pm") resolvedCap = "";
  if (!["developer", "researcher", "qa", "writer"].includes(resolvedCap)) {
    const rawRole = (typeof role === "string" ? role : "").toLowerCase().trim();
    if (["developer", "researcher", "qa", "writer"].includes(rawRole)) {
      resolvedCap = rawRole;
    } else {
      resolvedCap = "developer";
    }
  }

  const model = typeof settings.model === "string" && settings.model.trim() ? settings.model.trim() : HERMES_MODEL;
  const wipe = Boolean(settings.wipe);
  const continuity = settings.continuity !== false;
  const bound = typeof boundaries === "string" ? boundaries.trim() : (typeof settings.boundaries === "string" ? settings.boundaries.trim() : "");

  let systemPrompt = instructions ? instructions.trim() : `You are ${safeName}, a ${role || resolvedCap} agent.`;
  if (bound) systemPrompt += `\n\nBoundaries: ${bound}`;

  // Workspace path validation (DECISION D2)
  let agentWorkspace = workspace;
  if (!agentWorkspace || typeof agentWorkspace !== "string" || agentWorkspace.includes("..") || /^[\/\\]$|^[a-zA-Z]:[\/\\]?$/.test(agentWorkspace.trim())) {
    agentWorkspace = path.join(STATE_DIR, `workspace-${newId}`);
  }

  return {
    id: newId,
    name: safeName,
    workspace: agentWorkspace,
    role: role || resolvedCap,
    capability: resolvedCap,
    systemPrompt,
    settings: { wipe, continuity, model, boundaries: bound || undefined },
  };
}

function writeAgentsFile() {
  const mainAgent = agentRegistry.get(AGENT_ID);
  const main = mainAgent ? {
    name: mainAgent.name,
    settings: {
      model: mainAgent.settings?.model || HERMES_MODEL,
      wipe: Boolean(mainAgent.settings?.wipe),
      continuity: mainAgent.settings?.continuity !== false,
      boundaries: mainAgent.settings?.boundaries || "",
    },
  } : {
    name: HERMES_AGENT_NAME,
    settings: { model: HERMES_MODEL, wipe: false, continuity: true },
  };

  const agents = [...agentRegistry.values()]
    .filter((a) => a.id !== AGENT_ID)
    .map((a) => ({
      id: a.id,
      name: a.name,
      role: a.role || a.capability || "specialist",
      capability: a.capability || "developer",
      workspace: a.workspace,
      systemPrompt: a.systemPrompt,
      settings: a.settings || {},
    }));

  const payload = {
    version: 2,
    main,
    agents,
  };

  writeFileAtomic(AGENTS_FILE, JSON.stringify(payload, null, 2));
}

function saveAgentsToDisk() {
  if (persistAgentsTimer) {
    clearTimeout(persistAgentsTimer);
    persistAgentsTimer = null;
  }
  try {
    writeAgentsFile();
  } catch (err) {
    console.warn("[hermes-adapter] Could not save agents:", sanitizeErrorMessage(err));
  }
}

function loadAgentsFromDisk() {
  if (!fs.existsSync(AGENTS_FILE)) return;
  try {
    const raw = JSON.parse(fs.readFileSync(AGENTS_FILE, "utf8"));
    let agentList = [];

    if (Array.isArray(raw)) {
      // Legacy v1 schema: simple array
      agentList = raw;
    } else if (raw && typeof raw === "object") {
      // Roster v2 schema
      if (raw.main && typeof raw.main === "object") {
        const main = agentRegistry.get(AGENT_ID);
        if (main) {
          if (typeof raw.main.name === "string" && raw.main.name.trim()) {
            main.name = raw.main.name.trim();
          }
          if (raw.main.settings && typeof raw.main.settings === "object") {
            main.settings = { ...main.settings, ...raw.main.settings };
          }
        }
      }
      if (Array.isArray(raw.agents)) {
        agentList = raw.agents;
      }
    } else {
      throw new Error("agents file is not valid JSON array or v2 object");
    }

    for (const a of agentList) {
      if (!a || typeof a.id !== "string" || !a.id || a.id === AGENT_ID || typeof a.name !== "string") continue;
      const s = a.settings && typeof a.settings === "object" ? a.settings : {};
      const role = typeof a.role === "string" ? a.role : "";
      let capability = typeof a.capability === "string" ? a.capability.toLowerCase().trim() : "";
      if (capability === "pm") capability = "";
      if (!["developer", "researcher", "qa", "writer"].includes(capability)) {
        const rawRole = role.toLowerCase();
        if (["developer", "researcher", "qa", "writer"].includes(rawRole)) {
          capability = rawRole;
        } else {
          capability = "developer";
        }
      }

      agentRegistry.set(a.id, {
        id: a.id,
        name: a.name,
        workspace: typeof a.workspace === "string" ? a.workspace : path.join(STATE_DIR, `workspace-${a.id}`),
        role: role || capability,
        capability,
        systemPrompt: typeof a.systemPrompt === "string" ? a.systemPrompt : `You are ${a.name}.`,
        settings: {
          wipe: Boolean(s.wipe),
          continuity: s.continuity !== false,
          model: typeof s.model === "string" && s.model ? s.model : HERMES_MODEL,
          boundaries: typeof s.boundaries === "string" ? s.boundaries : undefined,
        },
      });
    }
    console.log(`[hermes-adapter] Loaded ${agentRegistry.size - 1} agent(s).`);
  } catch (err) {
    console.warn("[hermes-adapter] Could not load agents:", sanitizeErrorMessage(err));
  }
}

// Sync flush on shutdown so the last debounced change is not lost.
function flushPersistence() {
  if (persistDebounceTimer) {
    clearTimeout(persistDebounceTimer);
    persistDebounceTimer = null;
    try { writeHistoryFile(); } catch {}
  }
  if (persistAgentsTimer) {
    clearTimeout(persistAgentsTimer);
    persistAgentsTimer = null;
    try { writeAgentsFile(); } catch {}
  }
}

function getHistory(sessionKey) {
  if (!conversationHistory.has(sessionKey)) conversationHistory.set(sessionKey, []);
  return conversationHistory.get(sessionKey);
}

function clearHistory(sessionKey) {
  conversationHistory.delete(sessionKey);
  saveHistoryToDisk();
}

function randomId() {
  return require("crypto").randomBytes(8).toString("hex");
}

function redactSecrets(value) {
  if (typeof value !== "string" || !value) return value;
  let redacted = value;
  if (HERMES_API_KEY) {
    redacted = redacted.split(HERMES_API_KEY).join("[REDACTED]");
  }
  redacted = redacted.replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]");
  redacted = redacted.replace(/\b\d{8,12}:[A-Za-z0-9_-]{20,}\b/g, "[REDACTED]");
  return redacted;
}

// ---------------------------------------------------------------------------
// Hermes HTTP API helpers
// ---------------------------------------------------------------------------

function resolveHermesBaseUrl(url) {
  let base = (url || "").trim().replace(/\/+$/, "");
  base = base.replace(/\/chat\/completions\/?$/, "");
  base = base.replace(/\/models\/?$/, "");
  while (base.endsWith("/v1/v1")) {
    base = base.slice(0, -3);
  }
  return base;
}

function resolveHermesEndpoint(baseUrl, endpointPath) {
  const base = resolveHermesBaseUrl(baseUrl);
  const endpoint = endpointPath.startsWith("/") ? endpointPath : `/${endpointPath}`;
  if (base.endsWith("/v1") && endpoint.startsWith("/v1/")) {
    return `${base}${endpoint.slice(3)}`;
  }
  return `${base}${endpoint}`;
}

function updateEnvFile(filePath, updates) {
  if (!fs.existsSync(filePath)) return;
  let content = fs.readFileSync(filePath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value !== "string") continue;
    // Match only lines that START with key= (ignoring comments like # key=)
    const lineRegex = new RegExp(`^${key}=.*$`, "m");
    if (lineRegex.test(content)) {
      content = content.replace(lineRegex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}\n`;
    }
  }
  fs.writeFileSync(filePath, content, "utf8");
}

function migrateProvidersFileIfNeeded() {
  const targetFile = path.join(STATE_DIR, "api_providers.json");
  const legacyFile = path.join(process.cwd(), "api_providers.json");
  try {
    if (!fs.existsSync(targetFile) && fs.existsSync(legacyFile)) {
      fs.mkdirSync(STATE_DIR, { recursive: true });
      fs.copyFileSync(legacyFile, targetFile);
    }
  } catch {}
}

function readProvidersData() {
  migrateProvidersFileIfNeeded();
  const providersFile = path.join(STATE_DIR, "api_providers.json");
  let providers = [];
  let activeProviderId = null;
  try {
    if (fs.existsSync(providersFile)) {
      const raw = JSON.parse(fs.readFileSync(providersFile, "utf8"));
      if (Array.isArray(raw)) {
        providers = raw;
      } else if (raw && Array.isArray(raw.providers)) {
        providers = raw.providers;
        activeProviderId = raw.activeProviderId || null;
      }
    } else {
      const defaultUrl = process.env.HERMES_API_URL ? process.env.HERMES_API_URL.replace(/\/$/, "") : (HERMES_API_URL || "https://openrouter.ai/api");
      providers = [{ id: "default", name: "Default Provider", url: defaultUrl, key: process.env.HERMES_API_KEY || "" }];
      activeProviderId = "default";
      fs.writeFileSync(providersFile, JSON.stringify({ activeProviderId, providers }, null, 2));
    }
  } catch {}

  if (!activeProviderId || !providers.some((p) => p.id === activeProviderId)) {
    const matched = providers.find((p) => resolveHermesBaseUrl(p.url) === HERMES_API_URL);
    activeProviderId = matched ? matched.id : (providers[0]?.id || null);
  }

  return { providers, activeProviderId };
}

function writeProvidersData(providers, activeProviderId) {
  const providersFile = path.join(STATE_DIR, "api_providers.json");
  try {
    fs.writeFileSync(providersFile, JSON.stringify({ activeProviderId, providers }, null, 2));
  } catch {}
}

function syncActiveProviderFromDisk() {
  try {
    const provData = readProvidersData();
    if (provData.activeProviderId) {
      const activeProv = provData.providers.find((p) => p.id === provData.activeProviderId);
      if (activeProv && activeProv.url) {
        const resolvedUrl = resolveHermesBaseUrl(activeProv.url);
        if (resolvedUrl) HERMES_API_URL = resolvedUrl;
        if (typeof activeProv.key === "string" && activeProv.key) HERMES_API_KEY = activeProv.key;
      }
    }
  } catch {}
}

syncActiveProviderFromDisk();

function hermesPost(path, body) {
  return new Promise((resolve, reject) => {
    const urlStr = resolveHermesEndpoint(HERMES_API_URL, path);
    let url;
    try { url = new URL(urlStr); } catch { reject(new Error(`Invalid URL: ${urlStr}`)); return; }
    const transport = url.protocol === "https:" ? https : http;
    const bodyStr = JSON.stringify(body);
    const headers = { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(bodyStr) };
    if (HERMES_API_KEY) headers["Authorization"] = `Bearer ${HERMES_API_KEY}`;
    const req = transport.request(
      { hostname: url.hostname, port: url.port ? parseInt(url.port, 10) : (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + (url.search || ""), method: "POST", headers },
      resolve
    );
    req.on("error", reject);
    req.write(bodyStr);
    req.end();
  });
}

function hermesGet(path) {
  return new Promise((resolve, reject) => {
    const urlStr = resolveHermesEndpoint(HERMES_API_URL, path);
    let url;
    try { url = new URL(urlStr); } catch { reject(new Error(`Invalid URL: ${urlStr}`)); return; }
    const transport = url.protocol === "https:" ? https : http;
    const headers = {};
    if (HERMES_API_KEY) headers["Authorization"] = `Bearer ${HERMES_API_KEY}`;
    const req = transport.request(
      { hostname: url.hostname, port: url.port ? parseInt(url.port, 10) : (url.protocol === "https:" ? 443 : 80),
        path: url.pathname + (url.search || ""), method: "GET", headers },
      resolve
    );
    req.on("error", reject);
    req.end();
  });
}

async function readJsonBody(res) {
  const chunks = [];
  for await (const chunk of res) chunks.push(Buffer.from(chunk));
  const raw = Buffer.concat(chunks).toString("utf8");
  if (!raw.trim()) return {};
  return JSON.parse(raw);
}

function sanitizeErrorMessage(error) {
  if (!error) return "Unknown error";
  if (typeof error === "string") return redactSecrets(error);
  return redactSecrets(error.message || String(error));
}

function extractOpenAiStyleError(payload, fallbackMessage) {
  if (payload && typeof payload === "object") {
    const message =
      typeof payload?.error?.message === "string"
        ? payload.error.message.trim()
        : "";
    if (message) return message;
  }
  return fallbackMessage;
}

let cachedHermesModels = null;
let cachedHermesModelsAt = 0;

async function fetchHermesModels() {
  const now = Date.now();
  if (cachedHermesModels && now - cachedHermesModelsAt < 30_000) {
    return cachedHermesModels;
  }
  const res = await hermesGet("/v1/models");
  if (res.statusCode >= 400) {
    res.resume();
    throw new Error(`Hermes models API HTTP ${res.statusCode}`);
  }
  const payload = await readJsonBody(res);
  const models = Array.isArray(payload?.data)
    ? payload.data
        .map((entry) => (typeof entry?.id === "string" ? entry.id.trim() : ""))
        .filter(Boolean)
    : [];
  cachedHermesModels = models;
  cachedHermesModelsAt = now;
  return models;
}

async function resolveHermesModel(requestedModel) {
  const trimmed = typeof requestedModel === "string" ? requestedModel.trim() : "";
  const normalized = trimmed.includes("/") ? trimmed.split("/").pop().trim() : trimmed;
  try {
    const models = await fetchHermesModels();
    if (models.length === 0) {
      return normalized || trimmed || HERMES_MODEL;
    }
    const candidates = [trimmed, normalized, HERMES_MODEL]
      .map((value) => (typeof value === "string" ? value.trim() : ""))
      .filter(Boolean);
    for (const candidate of candidates) {
      const exact = models.find((modelId) => modelId === candidate);
      if (exact) return exact;
    }
    for (const candidate of candidates) {
      const suffix = models.find((modelId) => modelId.endsWith(`/${candidate}`));
      if (suffix) return suffix;
    }
    return models[0];
  } catch {
    return normalized || trimmed || HERMES_MODEL;
  }
}

async function completeOneTurn(messages, model, tools) {
  const resolvedModel = await resolveHermesModel(model);
  const body = { model: resolvedModel, messages, stream: false };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const res = await hermesPost("/v1/chat/completions", body);
  const payload = await readJsonBody(res);
  if (res.statusCode >= 400) {
    throw new Error(
      extractOpenAiStyleError(payload, `Hermes API HTTP ${res.statusCode}`)
    );
  }
  const choice = Array.isArray(payload?.choices) ? payload.choices[0] : null;
  const message = choice?.message || {};
  const textContent =
    typeof message?.content === "string"
      ? message.content
      : Array.isArray(message?.content)
        ? message.content
            .map((part) => (typeof part?.text === "string" ? part.text : ""))
            .join("")
        : "";
  const finishReason =
    typeof choice?.finish_reason === "string" && choice.finish_reason
      ? choice.finish_reason
      : "stop";
  const toolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls.map((tc) => {
        let args = {};
        const rawArgs = tc?.function?.arguments;
        if (typeof rawArgs === "string" && rawArgs.trim()) {
          try {
            args = JSON.parse(rawArgs);
          } catch {
            args = { _raw: rawArgs };
          }
        }
        return {
          id: typeof tc?.id === "string" ? tc.id : randomId(),
          name: typeof tc?.function?.name === "string" ? tc.function.name : "",
          args,
        };
      })
    : [];
  return { textContent, toolCalls, finishReason, resolvedModel };
}

// ---------------------------------------------------------------------------
// SSE streaming - handles both text deltas and tool calls
// ---------------------------------------------------------------------------

/**
 * Stream one LLM turn.
 * @returns {{ textContent: string, toolCalls: Array<{id,name,args}>, finishReason: string }}
 */
async function streamOneTurn(messages, model, tools, onTextDelta, abortCheck) {
  const body = { model, messages, stream: true };
  if (tools && tools.length > 0) { body.tools = tools; body.tool_choice = "auto"; }

  const resolvedModel = await resolveHermesModel(model);
  body.model = resolvedModel;
  const res = await hermesPost("/v1/chat/completions", body);
  if (res.statusCode >= 400) {
    res.resume();
    throw new Error(`Hermes API HTTP ${res.statusCode}`);
  }

  let textContent = "";
  let finishReason = "stop";
  /** @type {Record<number, {id: string, name: string, argsStr: string}>} */
  const toolCallAccum = {};
  let buffer = "";

  await new Promise((resolve, reject) => {
    res.on("data", (chunk) => {
      if (abortCheck && abortCheck()) { res.destroy(); return; }
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed === "data: [DONE]") continue;
        if (!trimmed.startsWith("data: ")) continue;
        try {
          const data = JSON.parse(trimmed.slice(6));
          const choice = data?.choices?.[0];
          if (!choice) continue;
          if (typeof choice.finish_reason === "string" && choice.finish_reason) {
            finishReason = choice.finish_reason;
          }
          const delta = choice.delta || {};
          // Text content
          if (typeof delta.content === "string" && delta.content) {
            textContent += delta.content;
            if (onTextDelta) onTextDelta(textContent);
          }
          // Tool call accumulation
          if (Array.isArray(delta.tool_calls)) {
            for (const tc of delta.tool_calls) {
              const idx = typeof tc.index === "number" ? tc.index : 0;
              if (!toolCallAccum[idx]) toolCallAccum[idx] = { id: "", name: "", argsStr: "" };
              if (tc.id) toolCallAccum[idx].id = tc.id;
              if (tc.function?.name) toolCallAccum[idx].name += tc.function.name;
              if (tc.function?.arguments) toolCallAccum[idx].argsStr += tc.function.arguments;
            }
          }
        } catch { /* ignore malformed */ }
      }
    });
    res.on("end", resolve);
    res.on("error", reject);
  });

  const toolCalls = Object.values(toolCallAccum).map((tc) => {
    let args = {};
    try { args = JSON.parse(tc.argsStr); } catch { args = { _raw: tc.argsStr }; }
    return { id: tc.id, name: tc.name, args };
  });

  if (!textContent.trim() && toolCalls.length === 0 && finishReason === "stop") {
    const fallback = await completeOneTurn(messages, resolvedModel, tools);
    return {
      textContent: fallback.textContent,
      toolCalls: fallback.toolCalls,
      finishReason: fallback.finishReason,
    };
  }

  return { textContent, toolCalls, finishReason };
}

// ---------------------------------------------------------------------------
// Broadcast a gateway event to all connected clients
// ---------------------------------------------------------------------------

function broadcastEvent(frame) {
  for (const fn of activeSendEventFns) {
    try { fn(frame); } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Tool executors
// ---------------------------------------------------------------------------

async function execSpawnAgent(args) {
  let requestedCap = typeof args.capability === "string" ? args.capability.toLowerCase().trim() : "";
  if (requestedCap === "pm") {
    return JSON.stringify({ ok: false, error: "Cannot spawn orchestrator (pm capability is reserved for main agent)." });
  }

  const entry = createAgentEntry({
    name: args.name,
    role: args.role,
    capability: args.capability,
    instructions: args.instructions,
    boundaries: args.boundaries,
    settings: {
      wipe: Boolean(args.wipe),
      continuity: args.continuity !== false,
      model: typeof args.model === "string" && args.model.trim() ? args.model.trim() : HERMES_MODEL,
    },
  });

  agentRegistry.set(entry.id, entry);
  fs.mkdirSync(entry.workspace, { recursive: true });
  saveAgentsToDisk();

  console.log(`[hermes-adapter] Spawned agent '${entry.name}' (${entry.id}) with capability '${entry.capability}'`);
  broadcastPresence();
  return JSON.stringify({ ok: true, agent_id: entry.id, name: entry.name, capability: entry.capability });
}
async function execDelegateTask(args, sendEvent) {
  const targetId = typeof args.agent_id === "string" ? args.agent_id.trim() : "";
  const message = typeof args.message === "string" ? args.message.trim() : "";
  if (!targetId || !message) return JSON.stringify({ ok: false, error: "agent_id and message required" });

  const agent = agentRegistry.get(targetId);
  if (!agent) return JSON.stringify({ ok: false, error: `Agent ${targetId} not found` });

  const sessionKey = `agent:${targetId}:${MAIN_KEY}`;
  const targetCap = resolveCapability(targetId, agent, AGENT_ID);
  const targetTools = toolsForCapability(targetCap);
  const model = agent.settings?.model || HERMES_MODEL;

  // Emit chat start event for this sub-agent so 3D office animates
  const subRunId = randomId();
  let seqCounter = 0;
  const emitSub = (state, extra) => {
    broadcastEvent({
      type: "event",
      event: "chat",
      seq: seqCounter++,
      payload: { runId: subRunId, sessionKey, state, ...extra },
    });
  };

  emitSub("delta", { message: { role: "assistant", content: "\u2026" } });

  const onTextDelta = (partial) => {
    emitSub("delta", { message: { role: "assistant", content: partial } });
  };

  try {
    const finalText = await runAgenticLoop({
      sessionKey,
      agentId: targetId,
      userMessage: message,
      model,
      tools: targetTools,
      emitDelta: onTextDelta,
      abortCheck: null,
      sendEvent,
    });

    emitSub("final", { stopReason: "stop" });
    return JSON.stringify({ ok: true, agent_id: targetId, response: finalText });
  } catch (err) {
    emitSub("error", { error: err.message });
    return JSON.stringify({ ok: false, error: err.message });
  } finally {
    flushPersistence();
  }
}
function execListTeam() {
  const members = [...agentRegistry.values()].map((a) => ({
    id: a.id, name: a.name, role: a.role || "",
    settings: a.settings,
  }));
  return JSON.stringify({ team: members });
}

function execConfigureAgent(args) {
  const targetId = typeof args.agent_id === "string" ? args.agent_id.trim() : "";
  const agent = agentRegistry.get(targetId);
  if (!agent) return JSON.stringify({ ok: false, error: `Agent ${targetId} not found` });
  if (typeof args.name === "string" && args.name.trim()) agent.name = args.name.trim();
  if (typeof args.role === "string") agent.role = args.role.trim();
  if (typeof args.instructions === "string") agent.systemPrompt = args.instructions;
  if (typeof args.wipe === "boolean") agent.settings.wipe = args.wipe;
  if (typeof args.continuity === "boolean") agent.settings.continuity = args.continuity;
  if (typeof args.boundaries === "string") {
    agent.settings.boundaries = args.boundaries;
    if (agent.systemPrompt && args.boundaries) {
      agent.systemPrompt = agent.systemPrompt.replace(/\n\nBoundaries:.*$/s, "") + `\n\nBoundaries: ${args.boundaries}`;
    }
  }
  if (typeof args.model === "string" && args.model.trim()) agent.settings.model = args.model.trim();
  saveAgentsToDisk();
  console.log(`[hermes-adapter] Configured agent: ${agent.name} (${targetId})`);
  broadcastEvent({
    type: "event", event: "presence",
    payload: {
      sessions: {
        recent: [],
        byAgent: [...agentRegistry.keys()].map((aid) => ({
          agentId: aid,
          recent: [],
        })),
      },
    },
  });
  return JSON.stringify({ ok: true, agent_id: targetId, name: agent.name, role: agent.role, settings: agent.settings });
}

function execDismissAgent(args) {
  const targetId = typeof args.agent_id === "string" ? args.agent_id.trim() : "";
  if (!targetId || targetId === AGENT_ID) return JSON.stringify({ ok: false, error: "Cannot dismiss the main orchestrator." });
  const agent = agentRegistry.get(targetId);
  if (!agent) return JSON.stringify({ ok: false, error: `Agent ${targetId} not found` });
  agentRegistry.delete(targetId);
  saveAgentsToDisk();
  clearHistory(`agent:${targetId}:${MAIN_KEY}`);
  console.log(`[hermes-adapter] Dismissed agent: ${agent.name} (${targetId})`);
  return JSON.stringify({ ok: true, dismissed: targetId });
}

function execReadAgentContext(args) {
  const targetId = typeof args.agent_id === "string" ? args.agent_id.trim() : "";
  const agent = agentRegistry.get(targetId);
  if (!agent) return JSON.stringify({ ok: false, error: `Agent ${targetId} not found` });
  const lastN = Math.min(40, Math.max(1, typeof args.last_n === "number" ? Math.floor(args.last_n) : 10));
  const sessionKey = `agent:${targetId}:${MAIN_KEY}`;
  const history = getHistory(sessionKey);
  const messages = history.slice(-lastN);
  if (messages.length === 0) {
    return JSON.stringify({ ok: true, agent_id: targetId, name: agent.name, role: agent.role || "", message_count: 0, context: "(no conversation history yet)" });
  }
  const contextLines = messages.map((m) => {
    const role = m.role === "assistant" ? agent.name : "User";
    const content = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    return `[${role}]: ${content.slice(0, 800)}${content.length > 800 ? "\u2026" : ""}`;
  });
  return JSON.stringify({
    ok: true,
    agent_id: targetId,
    name: agent.name,
    role: agent.role || "",
    message_count: history.length,
    showing_last: messages.length,
    context: contextLines.join("\n\n"),
  });
}

function buildWorkspaceMap(root) {
  const results = [];
  function walk(dir, depth = 0) {
    if (depth > 5 || results.length > 250) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const name = entry.name;
        if (name === "node_modules" || name === ".git" || name === ".hermes" || name === ".next" || name === "dist") continue;
        const full = path.join(dir, name);
        const rel = path.relative(root, full).replace(/\\/g, "/");
        if (entry.isDirectory()) {
          walk(full, depth + 1);
        } else if (entry.isFile()) {
          const stat = fs.statSync(full);
          results.push({ path: rel, size: stat.size, modified: stat.mtimeMs });
        }
      }
    } catch {}
  }
  walk(root);
  return results;
}

async function executeToolCall(tc, sendEvent, agentId = AGENT_ID) {
  const agent = agentRegistry.get(agentId) || { id: agentId, role: "developer", capability: "developer", name: "Agent" };
  const cap = resolveCapability(agentId, agent, AGENT_ID);
  const workspaceRoot = process.cwd();

  console.log(`[hermes-adapter] Tool call: ${tc.name} by ${agent.name} (${cap})`, JSON.stringify(tc.args).slice(0, 120));

  // Deny-Wins: Generic role check across ALL tools (WP2 Step 4)
  const roleDef = ROLE_DEFINITIONS[cap];
  if (!roleDef || !roleDef.tools.includes(tc.name)) {
    return JSON.stringify({
      ok: false,
      error: `Role ${cap || "unknown"} cannot use ${tc.name}. Capability '${cap || "unknown"}' is not authorized to use tool '${tc.name}' (Deny-Wins).`,
    });
  }

  switch (tc.name) {
    case "spawn_agent":          return execSpawnAgent(tc.args);
    case "delegate_task":        return execDelegateTask(tc.args, sendEvent);
    case "list_team":            return execListTeam();
    case "configure_agent":      return execConfigureAgent(tc.args);
    case "dismiss_agent":        return execDismissAgent(tc.args);
    case "read_agent_context":   return execReadAgentContext(tc.args);

    case "workspace_map": {
      const check = validateRoleAction(cap, "workspace_map");
      if (!check.allowed) return JSON.stringify({ ok: false, error: check.reason });
      const map = buildWorkspaceMap(workspaceRoot);
      return JSON.stringify({ ok: true, file_count: map.length, files: map.slice(0, 100) });
    }

    case "read_file": {
      const relPath = tc.args.file_path || "";
      const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspaceRoot, relPath);
      const check = validateRoleAction(cap, "read_file", { filePath: fullPath }, workspaceRoot);
      if (!check.allowed) return JSON.stringify({ ok: false, error: check.reason });
      if (!fs.existsSync(fullPath)) return JSON.stringify({ ok: false, error: `File not found: ${relPath}` });
      try {
        const text = fs.readFileSync(fullPath, "utf8");
        return JSON.stringify({ ok: true, file_path: relPath, content: text.slice(0, 16000) });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err.message });
      }
    }

    case "write_file": {
      const relPath = tc.args.file_path || "";
      const fullPath = path.isAbsolute(relPath) ? relPath : path.join(workspaceRoot, relPath);
      const check = validateRoleAction(cap, "write_file", { filePath: fullPath }, workspaceRoot);
      if (!check.allowed) return JSON.stringify({ ok: false, error: check.reason });
      try {
        const snapshot = createSnapshot(workspaceRoot, [fullPath], agentId, tc.args.description || `Agent ${agent.name} wrote ${relPath}`);
        fs.mkdirSync(path.dirname(fullPath), { recursive: true });
        fs.writeFileSync(fullPath, String(tc.args.content || ""), "utf8");
        return JSON.stringify({ ok: true, file_path: relPath, snapshot_id: snapshot.id });
      } catch (err) {
        return JSON.stringify({ ok: false, error: err.message });
      }
    }

    case "execute_command": {
      const cmd = tc.args.command || "";
      const targetCwd = tc.args.cwd ? (path.isAbsolute(tc.args.cwd) ? tc.args.cwd : path.join(workspaceRoot, tc.args.cwd)) : workspaceRoot;
      const res = await executeShellCommand(agentId, cap, cmd, targetCwd);
      if (res.status === "pending_approval") {
        broadcastEvent({
          type: "event",
          event: "exec.approval.requested",
          payload: {
            id: res.approvalId,
            agentId,
            command: res.command,
            cwd: targetCwd,
            reason: res.reason,
          },
        });
        return JSON.stringify({ status: "pending_approval", approval_id: res.approvalId, message: "Command paused awaiting human approval in Hermes3D UI" });
      }
      return JSON.stringify(res);
    }

    case "web_search_and_read": {
      const url = tc.args.url || "";
      const res = await fetchIsolatedPage(url, { role: cap });
      return JSON.stringify(res);
    }

    case "save_research_note": {
      const topic = tc.args.topic || "Research";
      const noteContent = tc.args.content || "";
      const sources = Array.isArray(tc.args.sources) ? tc.args.sources : [];
      const res = saveResearchToVault(workspaceRoot, topic, noteContent, sources, agent.name || agentId);
      return JSON.stringify(res);
    }

    case "list_snapshots": {
      const list = listSnapshots(workspaceRoot);
      return JSON.stringify({ ok: true, snapshots: list });
    }

    case "rollback_workspace": {
      const snapId = tc.args.snapshot_id;
      if (!snapId) return JSON.stringify({ ok: false, error: "snapshot_id required" });
      console.warn(`[rollback_workspace] Destructive rollback requested by agent '${agentId}' (${cap}) to snapshot '${snapId}'`);
      const res = rollbackSnapshot(workspaceRoot, snapId);
      return JSON.stringify(res);
    }

    default:
      return JSON.stringify({ ok: false, error: `Unknown tool: ${tc.name}` });
  }
}
// ---------------------------------------------------------------------------
// Agentic loop - handles multi-round tool-calling conversations
// ---------------------------------------------------------------------------

async function runAgenticLoop({ sessionKey, agentId, userMessage, model, tools, emitDelta, abortCheck, sendEvent }) {
  const agent = agentRegistry.get(agentId);
  const systemMsg = agent?.systemPrompt ? [{ role: "system", content: agent.systemPrompt }] : [];
  const history = getHistory(sessionKey);
  const contextHistory = (agent?.settings?.wipe) ? [] : [...history];
  let messages = [...systemMsg, ...contextHistory, { role: "user", content: userMessage }];

  let finalText = "";
  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    round++;
    const { textContent, toolCalls, finishReason } = await streamOneTurn(
      messages, model, tools, emitDelta, abortCheck
    );

    if (finishReason === "tool_calls" && toolCalls.length > 0) {
      // Inform user that tools are being executed (brief status text)
      const toolNames = toolCalls.map((t) => t.name).join(", ");
      const statusText = textContent || `Executing: ${toolNames}\u2026`;
      if (statusText) emitDelta(statusText);

      // Add assistant message with tool_calls to messages
      messages.push({
        role: "assistant",
        content: textContent || null,
        tool_calls: toolCalls.map((tc) => ({
          id: tc.id, type: "function",
          function: { name: tc.name, arguments: JSON.stringify(tc.args) },
        })),
      });

      // Execute all tool calls and collect results
      const toolResults = await Promise.all(
        toolCalls.map(async (tc) => {
          const result = await executeToolCall(tc, sendEvent, agentId);
          return { role: "tool", tool_call_id: tc.id, content: result };
        })
      );
      messages.push(...toolResults);
      continue;
    }

    // finish_reason = "stop" (or length/unknown) - we're done
    finalText = textContent;
    break;
  }

  // If MAX_TOOL_ROUNDS exhausted without final answer (WP2 Step 7)
  if (!finalText && round >= MAX_TOOL_ROUNDS) {
    try {
      const fallback = await streamOneTurn(
        [...messages, { role: "user", content: "Please summarize the actions taken and provide your final response." }],
        model,
        [],
        emitDelta,
        abortCheck
      );
      finalText = fallback.textContent || "";
    } catch {}
    if (!finalText) {
      finalText = "Reached the maximum number of tool rounds (8) without a final answer.";
    }
  }

  // Persist to history
  if (agent?.settings?.continuity !== false && finalText && finalText.trim().length > 0) {
    history.push({ role: "user", content: userMessage });
    history.push({ role: "assistant", content: finalText });
    saveHistoryToDisk();
  }

  return finalText;
}

// ---------------------------------------------------------------------------
// Frame builders
// ---------------------------------------------------------------------------

function resOk(id, payload) { return { type: "res", id, ok: true, payload: payload ?? {} }; }
function resErr(id, code, message) { return { type: "res", id, ok: false, error: { code, message } }; }

// ---------------------------------------------------------------------------
// Skills registry & status
// ---------------------------------------------------------------------------

const HERMES_BUILTIN_SKILLS = [
  {
    skillKey: "task-manager",
    name: "task-manager",
    description: "Capture actionable requests as persistent tasks and keep a shared Kanban task store in sync.",
    emoji: "\u{1F4CB}",
    homepage: "https://github.com/iamlukethedev/Hermes3D",
  },
  {
    skillKey: "soundhermes",
    name: "soundhermes",
    description: "Play music, radio, and ambient audio from the office Jukebox.",
    emoji: "\u{1F4FB}",
    homepage: "https://github.com/iamlukethedev/Hermes3D",
  },
  {
    skillKey: "todo-board",
    name: "todo",
    description: "Maintain a shared workspace TODO list with blocked tasks.",
    emoji: "\u2705",
    homepage: "http://x.com/iamlukethedev/",
  },
  {
    skillKey: "caveman",
    name: "caveman",
    description: "Ultra-compact responses for fast terminal updates.",
    emoji: "\u{1F356}",
    homepage: "https://github.com/iamlukethedev/Hermes3D",
  },
  {
    skillKey: "telegram-remote",
    name: "telegram-remote",
    description: "Two-way Telegram bridge for mobile office notifications and control.",
    emoji: "\u{1F4F1}",
    homepage: "https://github.com/iamlukethedev/Hermes3D",
  },
  {
    skillKey: "web-research",
    name: "web-research",
    description: "Stealth web intelligence & scraping via Camoufox browser.",
    emoji: "\u{1F310}",
    homepage: "https://github.com/iamlukethedev/Hermes3D",
  },
  {
    skillKey: "agent-reach",
    name: "agent-reach",
    description: "Social media and developer community intelligence playbook.",
    emoji: "\u{1F3AF}",
    homepage: "https://github.com/prakhardixit/agent-reach",
  },
  {
    skillKey: "obsidian-skills",
    name: "obsidian-skills",
    description: "Connected Obsidian Vault with wikilinks and knowledge structures.",
    emoji: "\u{1F48E}",
    homepage: "https://github.com/kepano/obsidian-skills",
  },
  {
    skillKey: "superpowers",
    name: "superpowers",
    description: "Rigorous software engineering discipline, TDD, and multi-gate verification.",
    emoji: "\u26A1",
    homepage: "https://github.com/obra/superpowers",
  },
  {
    skillKey: "humanizer",
    name: "humanizer",
    description: "Filter out repetitive AI patterns and robotic phrasing.",
    emoji: "\u270D\uFE0F",
    homepage: "https://github.com/humanizer-ai/humanizer",
  },
  {
    skillKey: "marketing-skills",
    name: "marketing-skills",
    description: "Conversion rate optimization, landing page analysis, and SEO copy.",
    emoji: "\u{1F4C8}",
    homepage: "https://github.com/marketing-skills/hub",
  },
];

const installedSkillsState = new Map(
  HERMES_BUILTIN_SKILLS.map((s) => [s.skillKey, { enabled: true, installed: true }])
);

function getGatewaySkillsReport(targetWs) {
  return HERMES_BUILTIN_SKILLS.map((s) => {
    const state = installedSkillsState.get(s.skillKey) || { enabled: true, installed: true };
    return {
      name: s.name,
      description: s.description,
      source: "hermes-workspace",
      bundled: true,
      filePath: path.join(targetWs, "skills", s.skillKey, "SKILL.md"),
      baseDir: path.join(targetWs, "skills", s.skillKey),
      skillKey: s.skillKey,
      emoji: s.emoji,
      homepage: s.homepage,
      always: true,
      disabled: !state.enabled,
      blockedByAllowlist: false,
      eligible: Boolean(state.installed),
      requirements: { bins: [], anyBins: [], env: [], config: [], os: [] },
      missing: { bins: [], anyBins: [], env: [], config: [], os: [] },
      configChecks: [],
      install: [],
    };
  });
}

// ---------------------------------------------------------------------------
// Method handlers
// ---------------------------------------------------------------------------

async function handleMethod(method, params, id, sendEvent) {
  const p = params || {};

  switch (method) {
    // --- Agent management ---------------------------------------------------

    case "agents.list": {
      const allAgents = [...agentRegistry.values()].map((agent) => ({
        id: agent.id, name: agent.name, workspace: agent.workspace,
        identity: { name: agent.name, emoji: "\u{1F916}" },
        role: agent.role,
      }));
      return resOk(id, { defaultId: AGENT_ID, mainKey: MAIN_KEY, agents: allAgents });
    }

    case "agents.create": {
      if (typeof p.workspace === "string" && (p.workspace.includes("..") || /^[\/\\]$|^[a-zA-Z]:[\/\\]?$/.test(p.workspace.trim()))) {
        return resErr(id, "INVALID_ARGUMENT", "Invalid workspace path: traversal and system roots are forbidden.");
      }
      const entry = createAgentEntry({
        name: p.name,
        role: p.role,
        capability: p.capability,
        instructions: p.systemPrompt,
        workspace: typeof p.workspace === "string" ? p.workspace : undefined,
      });
      agentRegistry.set(entry.id, entry);
      fs.mkdirSync(entry.workspace, { recursive: true });
      saveAgentsToDisk();
      broadcastPresence();
      return resOk(id, { agentId: entry.id, name: entry.name, workspace: entry.workspace, capability: entry.capability });
    }
    case "agents.delete": {
      const delId = typeof p.agentId === "string" ? p.agentId : "";
      if (delId && delId !== AGENT_ID) {
        agentRegistry.delete(delId);
        saveAgentsToDisk();
        clearHistory(`agent:${delId}:${MAIN_KEY}`);
      }
      return resOk(id, { ok: true, removedBindings: 0 });
    }

    case "agents.update": {
      const updId = typeof p.agentId === "string" ? p.agentId : "";
      const existing = agentRegistry.get(updId);
      if (existing) {
        if (typeof p.workspace === "string") {
          if (p.workspace.includes("..") || /^[\/\\]$|^[a-zA-Z]:[\/\\]?$/.test(p.workspace.trim())) {
            return resErr(id, "INVALID_ARGUMENT", "Invalid workspace path: traversal and system roots are forbidden.");
          }
          existing.workspace = p.workspace.trim();
        }
        if (typeof p.name === "string" && p.name.trim()) existing.name = p.name.trim();
        if (typeof p.role === "string") existing.role = p.role.trim();
        if (typeof p.capability === "string" && p.capability !== "pm" && ["developer", "researcher", "qa", "writer"].includes(p.capability.toLowerCase())) {
          existing.capability = p.capability.toLowerCase();
        }
        saveAgentsToDisk();
        broadcastPresence();
      }
      return resOk(id, { ok: true, removedBindings: 0 });
    }
    case "agents.files.get": {
      const key = `${p.agentId || AGENT_ID}/${p.name || ""}`;
      const content = agentFiles.get(key);
      return resOk(id, { file: content !== undefined ? { content } : { missing: true } });
    }

    case "agents.files.set": {
      const key = `${p.agentId || AGENT_ID}/${p.name || ""}`;
      agentFiles.set(key, typeof p.content === "string" ? p.content : "");
      return resOk(id, {});
    }

    // --- Config -------------------------------------------------------------

    case "config.get":
      return resOk(id, { config: { gateway: { reload: { mode: "hot" } } },
        hash: "hermes-adapter", exists: true, path: CONFIG_PATH });

    case "config.patch":
    case "config.set":
      return resOk(id, { hash: "hermes-adapter" });

    // --- Sessions -----------------------------------------------------------

    case "sessions.list": {
      const sessions = [];
      for (const [sessionKey, history] of conversationHistory.entries()) {
        if (!sessionKey.startsWith("agent:")) continue;
        const parts = sessionKey.split(":");
        const agentId = parts[1];
        const sessionId = parts.slice(2).join(":");
        const agent = agentRegistry.get(agentId);
        if (!agent) continue;
        const settings = sessionSettings.get(sessionKey) || {};
        
        let lastTimestamp = Date.now();
        if (history.length > 0) {
           const lastMsg = history[history.length - 1];
           if (lastMsg && lastMsg.timestamp) lastTimestamp = lastMsg.timestamp;
        }

        sessions.push({
          key: sessionKey, agentId: agentId,
          updatedAt: history.length > 0 ? lastTimestamp : null,
          displayName: sessionId === MAIN_KEY ? "Main" : sessionId,
          origin: { label: agent.name, provider: "hermes" },
          model: settings.model || agent.settings?.model || HERMES_MODEL,
          modelProvider: "hermes",
        });
      }
      
      for (const agent of agentRegistry.values()) {
        const mainSessionKey = `agent:${agent.id}:${MAIN_KEY}`;
        if (!sessions.find(s => s.key === mainSessionKey)) {
          const settings = sessionSettings.get(mainSessionKey) || {};
          sessions.push({
            key: mainSessionKey, agentId: agent.id,
            updatedAt: null,
            displayName: "Main",
            origin: { label: agent.name, provider: "hermes" },
            model: settings.model || agent.settings?.model || HERMES_MODEL,
            modelProvider: "hermes",
          });
        }
      }
      
      return resOk(id, { sessions });
    }

    case "sessions.preview": {
      const keys = Array.isArray(p.keys) ? p.keys : [];
      const limit = typeof p.limit === "number" ? p.limit : 8;
      const maxChars = typeof p.maxChars === "number" ? p.maxChars : 240;
      const previews = keys.map((key) => {
        const history = getHistory(key);
        if (history.length === 0) return { key, status: "empty", items: [] };
        const items = history.slice(-limit).map((msg) => ({
          role: msg.role === "assistant" ? "assistant" : "user",
          text: String(msg.content || "").slice(0, maxChars),
          timestamp: Date.now(),
        }));
        return { key, status: "ok", items };
      });
      return resOk(id, { ts: Date.now(), previews });
    }

    case "sessions.patch": {
      const key = typeof p.key === "string" ? p.key : MAIN_SESSION_KEY;
      const current = sessionSettings.get(key) || {};
      const next = { ...current };
      if (p.model !== undefined) next.model = typeof p.model === "string" ? p.model.trim() : p.model;
      if (p.thinkingLevel !== undefined) next.thinkingLevel = p.thinkingLevel;
      if (p.execHost !== undefined) next.execHost = p.execHost;
      if (p.execSecurity !== undefined) next.execSecurity = p.execSecurity;
      if (p.execAsk !== undefined) next.execAsk = p.execAsk;
      sessionSettings.set(key, next);
      const resolvedModel = await resolveHermesModel(next.model || HERMES_MODEL);
      return resOk(id, { ok: true, key, entry: { thinkingLevel: next.thinkingLevel },
        resolved: { model: resolvedModel, modelProvider: "hermes" } });
    }

    case "sessions.delete":
    case "sessions.reset": {
      const key = typeof p.key === "string" ? p.key : MAIN_SESSION_KEY;
      clearHistory(key);
      return resOk(id, { ok: true, deleted: key });
    }

    // --- Chat ---------------------------------------------------------------

    case "chat.send": {
      const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey : MAIN_SESSION_KEY;
      const userMessage = typeof p.message === "string" ? p.message.trim() : String(p.message || "").trim();
      const runId = (typeof p.idempotencyKey === "string" && p.idempotencyKey) ? p.idempotencyKey : randomId();

      if (!userMessage) return resOk(id, { status: "no-op", runId });

      // Fast-path: automated skill installer writing files
      if (userMessage.startsWith("Create these exact skill files inside the current workspace")) {
        const sessionAgentId = sessionKey.startsWith("agent:") ? sessionKey.split(":")[1] : AGENT_ID;
        const agent = agentRegistry.get(sessionAgentId);
        const agentWs = (agent && agent.workspace) ? agent.workspace : path.join(STATE_DIR, "workspace-hermes");
        try {
          const matches = [...userMessage.matchAll(/- path: ("(?:[^"\\]|\\.)*")\s+content: ("(?:[^"\\]|\\.)*")/g)];
          for (const match of matches) {
            const relPath = JSON.parse(match[1]);
            const fileContent = JSON.parse(match[2]);
            const fullTarget = path.join(agentWs, relPath);
            fs.mkdirSync(path.dirname(fullTarget), { recursive: true });
            fs.writeFileSync(fullTarget, fileContent, "utf8");
          }
        } catch (err) {
          console.warn("[hermes-adapter] Installer auto-write warning:", err.message);
        }

        setImmediate(() => {
          sendEvent({
            type: "event",
            event: "chat",
            seq: 0,
            payload: {
              runId,
              sessionKey,
              state: "final",
              stopReason: "end_turn",
              message: { role: "assistant", content: "INSTALLED" },
            },
          });
        });
        return resOk(id, { status: "started", runId });
      }

      // Resolve which agent owns this session
      const sessionAgentId = sessionKey.startsWith("agent:") ? sessionKey.split(":")[1] : AGENT_ID;
      const agent = agentRegistry.get(sessionAgentId);
      const isOrchestrator = sessionAgentId === AGENT_ID;

      let aborted = false;
      activeRuns.set(runId, {
        runId,
        sessionKey,
        agentId: sessionAgentId,
        abort() { aborted = true; },
      });

      setImmediate(async () => {
        const model = (sessionSettings.get(sessionKey) || {}).model
          || agent?.settings?.model || HERMES_MODEL;
        let seqCounter = 0;

        const emitChat = (state, extra) => {
          sendEvent({ type: "event", event: "chat", seq: seqCounter++,
            payload: { runId, sessionKey, state, ...extra } });
        };

        const onTextDelta = (partial) => {
          if (!aborted) emitChat("delta", { message: { role: "assistant", content: partial } });
        };

        try {
          const sessionAgent = agentRegistry.get(sessionAgentId);
          const sessionCap = resolveCapability(sessionAgentId, sessionAgent, AGENT_ID);
          const tools = toolsForCapability(sessionCap);

          const finalText = await runAgenticLoop({
            sessionKey, agentId: sessionAgentId, userMessage,
            model, tools, emitDelta: onTextDelta,
            abortCheck: () => aborted, sendEvent,
          });

          if (aborted) {
            emitChat("aborted", {});
          } else {
            emitChat("final", { stopReason: "end_turn",
              message: { role: "assistant", content: finalText } });
            sendEvent({ type: "event", event: "presence", seq: seqCounter++,
              payload: { sessions: { recent: [{ key: sessionKey, updatedAt: Date.now() }],
                byAgent: [{ agentId: sessionAgentId, recent: [{ key: sessionKey, updatedAt: Date.now() }] }] } } });
          }
        } catch (err) {
          if (!aborted) emitChat("error", { errorMessage: sanitizeErrorMessage(err) || "Hermes API error" });
          else emitChat("aborted", {});
        } finally {
          activeRuns.delete(runId);
          flushPersistence();
        }
      });

      return resOk(id, { status: "started", runId });
    }

    case "chat.abort": {
      const runId = typeof p.runId === "string" ? p.runId.trim() : "";
      const sessionKey = typeof p.sessionKey === "string" ? p.sessionKey.trim() : "";
      let aborted = 0;
      if (runId) {
        const handle = activeRuns.get(runId);
        if (handle) {
          handle.abort();
          activeRuns.delete(runId);
          aborted += 1;
        }
      } else if (sessionKey) {
        for (const [activeRunId, handle] of activeRuns.entries()) {
          if (handle.sessionKey !== sessionKey) continue;
          handle.abort();
          activeRuns.delete(activeRunId);
          aborted += 1;
        }
      }
      return resOk(id, { ok: true, aborted });
    }

    case "chat.history": {
      const histKey = typeof p.sessionKey === "string" ? p.sessionKey : MAIN_SESSION_KEY;
      return resOk(id, { sessionKey: histKey, messages: getHistory(histKey) });
    }

    case "agent.wait": {
      const { runId, timeoutMs = 30000 } = p;
      const start = Date.now();
      while (activeRuns.has(runId) && Date.now() - start < timeoutMs) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return resOk(id, { status: activeRuns.has(runId) ? "running" : "done" });
    }

    // --- Approvals ----------------------------------------------------------

    case "exec.approvals.get": {
      const active = getPendingApprovals();
      return resOk(id, {
        path: "",
        exists: true,
        hash: "hermes-approvals",
        approvals: active,
        file: { version: 1, defaults: { security: "full", ask: "off", autoAllowSkills: true }, agents: {} },
      });
    }

    case "exec.approvals.set":
      return resOk(id, { hash: "hermes-approvals" });

    case "exec.approval.resolve": {
      try {
        const decision = p.decision || "allow-once";
        const resolveRes = resolvePendingApproval(p.id, decision);
        if (resolveRes.ok && resolveRes.approvedCommand) {
          const execRes = await executeShellCommand(
            p.agentId || "agent",
            "developer",
            resolveRes.approvedCommand,
            resolveRes.cwd || process.cwd(),
            { preApproved: true }
          );
          return resOk(id, { ok: true, decision, execution: execRes });
        }
        return resOk(id, { ok: resolveRes.ok, decision });
      } catch (err) {
        return resOk(id, { ok: false, error: err.message });
      }
    }

    // --- Workspace Snapshots & Rollback -------------------------------------

    case "workspace.snapshots.list": {
      const list = listSnapshots(process.cwd());
      return resOk(id, { snapshots: list });
    }

    case "workspace.rollback": {
      const snapId = p.snapshotId;
      if (!snapId) return resErr(id, "missing_param", "snapshotId is required");
      try {
        const res = rollbackSnapshot(process.cwd(), snapId);
        return resOk(id, res);
      } catch (err) {
        return resErr(id, "rollback_failed", err.message);
      }
    }

    // --- Knowledge Vault Documents ------------------------------------------

    case "vault.documents.list": {
      const docs = listVaultDocuments(process.cwd(), p.subfolder || "research");
      return resOk(id, { documents: docs });
    }

    // --- Role Matrix & Capabilities -----------------------------------------

    case "roles.matrix.get": {
      return resOk(id, { roles: ROLE_DEFINITIONS });
    }

    // --- Browser & Research Service (Camoufox & Profile Isolation) ---------

    case "browser.status": {
      return resOk(id, {
        ok: true,
        camoufoxAvailable: isCamoufoxAvailable(),
        engine: isCamoufoxAvailable() ? "camoufox" : "http-isolated",
        profiles: listAgentProfiles(process.cwd()),
        allowlist: DEFAULT_RESEARCH_ALLOWLIST,
      });
    }

    case "browser.profiles.list": {
      return resOk(id, {
        ok: true,
        profiles: listAgentProfiles(process.cwd()),
      });
    }

    case "browser.navigate": {
      const url = typeof p.url === "string" ? p.url : "";
      if (!url) return resErr(id, "missing_param", "url is required");
      try {
        const result = await fetchIsolatedPage(url, {
          allowlist: Array.isArray(p.allowlist) ? p.allowlist : undefined,
          agentId: p.agentId || "researcher",
          preferCamoufox: p.preferCamoufox !== false,
          saveToVault: Boolean(p.saveToVault),
          topic: p.topic,
          workspacePath: process.cwd(),
        });
        return resOk(id, result);
      } catch (err) {
        return resErr(id, "browser_navigation_failed", err.message);
      }
    }

    // --- Brain Migration & State (Option 1) ----------------------------------

    case "brain.status": {
      return resOk(id, { ok: true, status: getBrainStatus(process.cwd()) });
    }

    case "brain.export": {
      try {
        const result = createBrainArchive(process.cwd());
        return resOk(id, { ok: true, archive: result });
      } catch (err) {
        return resErr(id, "brain_export_failed", err.message);
      }
    }

    case "brain.import": {
      const archivePath = typeof p.archivePath === "string" ? p.archivePath : "";
      if (!archivePath) return resErr(id, "missing_param", "archivePath is required");
      try {
        const result = restoreBrainArchive(archivePath, process.cwd());
        return resOk(id, { ok: true, restored: result });
      } catch (err) {
        return resErr(id, "brain_import_failed", err.message);
      }
    }

    // --- Status & heartbeat -------------------------------------------------

    case "status": {
      const recent = [...agentRegistry.keys()].flatMap((aid) => {
        const h = getHistory(`agent:${aid}:${MAIN_KEY}`);
        return h.length > 0 ? [{ key: `agent:${aid}:${MAIN_KEY}`, updatedAt: Date.now() }] : [];
      });
      return resOk(id, { sessions: { recent,
        byAgent: [...agentRegistry.keys()].map((aid) => ({
          agentId: aid,
          recent: recent.filter((r) => r.key.includes(`:${aid}:`)),
        })) } });
    }

    case "wake":
      return resOk(id, { ok: true });

    // --- Skills & models ----------------------------------------------------

    case "skills.status": {
      const targetAgentId = typeof p.agentId === "string" ? p.agentId.trim() : AGENT_ID;
      const agent = agentRegistry.get(targetAgentId) || agentRegistry.get(AGENT_ID);
      const wsDir = (agent && agent.workspace) ? agent.workspace : path.join(STATE_DIR, "workspace-hermes");
      const managedSkillsDir = path.join(STATE_DIR, "skills");
      return resOk(id, {
        workspaceDir: wsDir,
        managedSkillsDir,
        skills: getGatewaySkillsReport(wsDir),
      });
    }

    case "skills.update": {
      const skillKey = typeof p.skillKey === "string" ? p.skillKey.trim() : "";
      if (!skillKey) return resErr(id, "missing_param", "skillKey is required");
      const current = installedSkillsState.get(skillKey) || { enabled: true, installed: true };
      if (typeof p.enabled === "boolean") {
        current.enabled = p.enabled;
      }
      installedSkillsState.set(skillKey, current);
      return resOk(id, { ok: true, skillKey, config: { enabled: current.enabled } });
    }

    case "skills.install": {
      const name = typeof p.name === "string" ? p.name.trim() : "";
      installedSkillsState.set(name.toLowerCase(), { enabled: true, installed: true });
      return resOk(id, { ok: true, message: `Skill ${name} installed.`, stdout: "", stderr: "", code: 0 });
    }

    case "models.list":
      try {
        const models = await fetchHermesModels();
        return resOk(id, {
          models: (models.length > 0 ? models : [HERMES_MODEL]).map((modelId) => ({
            id: modelId,
            name: modelId,
          })),
        });
      } catch {
        return resOk(id, { models: [{ id: HERMES_MODEL, name: HERMES_MODEL }] });
      }

    case "tasks.list":
      return resOk(id, { tasks: [] });

    // --- Config Update ------------------------------------------------------

    case "config.providers.list": {
      const { providers, activeProviderId } = readProvidersData();
      return resOk(id, { providers, activeProviderId });
    }

    case "config.providers.save": {
      let { providers, activeProviderId } = readProvidersData();
      const newProv = p.provider;
      if (!newProv || !newProv.id) return resOk(id, { ok: false });
      
      const idx = providers.findIndex((x) => x.id === newProv.id);
      if (idx >= 0) providers[idx] = newProv;
      else providers.push(newProv);
      
      writeProvidersData(providers, activeProviderId);
      return resOk(id, { ok: true, providers, activeProviderId });
    }

    case "config.providers.delete": {
      let { providers, activeProviderId } = readProvidersData();
      providers = providers.filter((x) => x.id !== p.providerId);
      if (activeProviderId === p.providerId) {
        activeProviderId = providers[0]?.id || null;
      }
      writeProvidersData(providers, activeProviderId);
      return resOk(id, { ok: true, providers, activeProviderId });
    }

    case "config.update": {
      let updated = false;
      const apiUrl = p.apiUrl;
      const apiKey = p.apiKey;
      let { providers, activeProviderId } = readProvidersData();

      if (typeof apiUrl === "string") {
        HERMES_API_URL = resolveHermesBaseUrl(apiUrl);
        process.env.HERMES_API_URL = HERMES_API_URL;
        updated = true;
      }
      if (typeof apiKey === "string") {
        HERMES_API_KEY = apiKey;
        process.env.HERMES_API_KEY = apiKey;
        updated = true;
      }

      if (p.providerId && providers.some((x) => x.id === p.providerId)) {
        activeProviderId = p.providerId;
      } else if (typeof apiUrl === "string") {
        const found = providers.find((x) => resolveHermesBaseUrl(x.url) === HERMES_API_URL);
        if (found) activeProviderId = found.id;
      }

      writeProvidersData(providers, activeProviderId);

      let newModels = [];
      if (updated) {
        cachedHermesModels = null;
        cachedHermesModelsAt = 0;
        try {
          newModels = await fetchHermesModels();
        } catch(e) {
          console.warn("[hermes-adapter] Failed to fetch models on provider switch:", e.message);
        }

        if (newModels.length > 0 && !newModels.includes(HERMES_MODEL)) {
          HERMES_MODEL = newModels[0];
          process.env.HERMES_MODEL = HERMES_MODEL;
        }

        try {
          const envPath = path.join(process.cwd(), ".env");
          updateEnvFile(envPath, {
            HERMES_API_URL: HERMES_API_URL,
            HERMES_API_KEY: HERMES_API_KEY,
            HERMES_MODEL: HERMES_MODEL,
          });
        } catch(err) {
          console.error("[hermes-adapter] Failed to update .env", err);
        }
      }
      return resOk(id, {
        ok: true,
        activeProviderId,
        models: newModels,
        defaultModel: HERMES_MODEL,
      });
    }

    case "config.test": {
      const apiUrl = p.apiUrl || HERMES_API_URL;
      const apiKey = p.apiKey !== undefined ? p.apiKey : HERMES_API_KEY;
      
      try {
        const urlStr = resolveHermesEndpoint(apiUrl, "/v1/models");
        const fetchMethod = typeof fetch !== 'undefined' ? fetch : async (url, opts) => {
          return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const transport = parsed.protocol === "https:" ? https : http;
            const req = transport.request(
              { hostname: parsed.hostname, port: parsed.port, path: parsed.pathname + parsed.search, method: "GET", headers: opts.headers },
              (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, json: async () => JSON.parse(data), status: res.statusCode }));
              }
            );
            req.on("error", reject);
            req.end();
          });
        };

        const res = await fetchMethod(urlStr, {
          headers: apiKey ? { "Authorization": `Bearer ${apiKey}` } : {}
        });

        if (!res.ok) {
          return resOk(id, { success: false, error: `HTTP ${res.status} from API` });
        }

        const payload = await res.json();
        const models = Array.isArray(payload?.data) ? payload.data : [];
        return resOk(id, { success: true, count: models.length });
      } catch (err) {
        return resOk(id, { success: false, error: err.message });
      }
    }

    // --- Cron jobs ----------------------------------------------------------

    case "cron.list": {
      const includeDisabled = p.includeDisabled !== false;
      const jobs = [...cronJobs.values()];
      return resOk(id, { jobs: includeDisabled ? jobs : jobs.filter((j) => j.enabled) });
    }

    case "cron.add": {
      const jobId = randomId();
      const job = {
        id: jobId, name: typeof p.name === "string" ? p.name : "Cron Job",
        agentId: typeof p.agentId === "string" ? p.agentId : AGENT_ID,
        sessionKey: typeof p.sessionKey === "string" ? p.sessionKey : MAIN_SESSION_KEY,
        description: typeof p.description === "string" ? p.description : "",
        enabled: p.enabled !== false, deleteAfterRun: Boolean(p.deleteAfterRun),
        updatedAtMs: Date.now(), schedule: p.schedule || { kind: "every", everyMs: 3600000 },
        sessionTarget: p.sessionTarget || "main", wakeMode: p.wakeMode || "next-heartbeat",
        payload: p.payload || { kind: "systemEvent", text: "tick" }, state: {},
      };
      cronJobs.set(jobId, job);
      return resOk(id, job);
    }

    case "cron.remove": {
      const jobId = typeof p.id === "string" ? p.id : "";
      return resOk(id, { ok: true, removed: cronJobs.delete(jobId) });
    }

    case "cron.patch": {
      const jobId = typeof p.id === "string" ? p.id : "";
      const job = cronJobs.get(jobId);
      if (!job) return resOk(id, { ok: false, error: "not_found" });
      const updated = { ...job };
      if (p.enabled !== undefined) updated.enabled = Boolean(p.enabled);
      if (p.name !== undefined) updated.name = String(p.name);
      if (p.schedule !== undefined) updated.schedule = p.schedule;
      if (p.payload !== undefined) updated.payload = p.payload;
      updated.updatedAtMs = Date.now();
      cronJobs.set(jobId, updated);
      return resOk(id, { ok: true, job: updated });
    }

    case "cron.run": {
      const jobId = typeof p.id === "string" ? p.id : "";
      const job = cronJobs.get(jobId);
      if (!job) return resOk(id, { ok: false });
      cronJobs.set(jobId, { ...job, state: { ...job.state, runningAtMs: Date.now() } });
      setTimeout(() => {
        const current = cronJobs.get(jobId);
        if (!current) return;
        const done = { ...current, state: { ...current.state, runningAtMs: undefined, lastRunAtMs: Date.now(), lastStatus: "ok" } };
        cronJobs.set(jobId, done);
        broadcastEvent({ type: "event", event: "cron", payload: { action: "finished", jobId, status: "ok", summary: done } });
      }, 3000);
      return resOk(id, { ok: true, ran: true });
    }

    default:
      console.warn(`[hermes-adapter] Unhandled method: ${method}`);
      return resOk(id, {});
  }
}

// ---------------------------------------------------------------------------
// WebSocket server
// ---------------------------------------------------------------------------

let httpServer = null;

function startAdapter() {
  httpServer = http.createServer((req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    if (parsedUrl.pathname === "/api/browser/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          ok: true,
          camoufoxAvailable: isCamoufoxAvailable(),
          engine: isCamoufoxAvailable() ? "camoufox" : "http-isolated",
          profiles: listAgentProfiles(process.cwd()),
        })
      );
    }
    if (parsedUrl.pathname === "/api/browser/profiles") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(
        JSON.stringify({
          ok: true,
          profiles: listAgentProfiles(process.cwd()),
        })
      );
    }
    if (parsedUrl.pathname === "/api/system/brain/status") {
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, status: getBrainStatus(process.cwd()) }));
    }
    if (parsedUrl.pathname === "/api/system/brain/export") {
      try {
        const result = createBrainArchive(process.cwd());
        const data = fs.readFileSync(result.archivePath);
        res.writeHead(200, {
          "Content-Type": "application/gzip",
          "Content-Disposition": `attachment; filename="${path.basename(result.archivePath)}"`,
          "Content-Length": data.length,
        });
        return res.end(data);
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    }
    if (parsedUrl.pathname === "/api/system/brain/import" && req.method === "POST") {
      const chunks = [];
      req.on("data", (chunk) => chunks.push(chunk));
      req.on("end", () => {
        try {
          const bodyBuffer = Buffer.concat(chunks);
          if (bodyBuffer.length === 0) {
            res.writeHead(400, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ ok: false, error: "Empty archive payload" }));
          }
          const restored = unpackTarGz(bodyBuffer, process.cwd());
          res.writeHead(200, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: true, fileCount: restored.length }));
        } catch (err) {
          res.writeHead(500, { "Content-Type": "application/json" });
          return res.end(JSON.stringify({ ok: false, error: err.message }));
        }
      });
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Hermes Gateway Adapter - OK\n");
  });

  const wss = new WebSocketServer({ server: httpServer });
  wss.on("error", (err) => {
    if (err.code !== "EADDRINUSE") console.error("[hermes-adapter] Server error:", sanitizeErrorMessage(err));
  });

  wss.on("connection", (ws) => {
    let connected = false;
    let globalSeq = 0;

    const send = (frame) => {
      if (ws.readyState === ws.OPEN) {
        try { ws.send(JSON.stringify(frame)); }
        catch (e) { console.error("[hermes-adapter] send error:", sanitizeErrorMessage(e)); }
      }
    };

    // Register this connection's send function for broadcasts
    const sendEventFn = (frame) => {
      if (frame.type === "event" && typeof frame.seq !== "number") frame.seq = globalSeq++;
      send(frame);
    };
    activeSendEventFns.add(sendEventFn);

    send({ type: "event", event: "connect.challenge", payload: { nonce: randomId() } });

    ws.on("message", async (raw) => {
      let frame;
      try { frame = JSON.parse(raw.toString("utf8")); } catch { return; }
      if (!frame || typeof frame !== "object" || frame.type !== "req") return;
      const { id, method, params } = frame;
      if (typeof id !== "string" || typeof method !== "string") return;

      if (method === "connect") {
        connected = true;
        const allAgents = [...agentRegistry.values()].map((a) => ({ agentId: a.id, name: a.name, isDefault: a.id === AGENT_ID }));
        send({
          type: "res", id, ok: true,
          payload: {
            type: "hello-ok", protocol: 3,
            adapterType: "hermes",
            features: { methods: ["agents.list","agents.create","agents.delete","agents.update",
              "sessions.list","sessions.preview","sessions.patch","sessions.reset","sessions.delete",
              "chat.send","chat.abort","chat.history","agent.wait",
              "status","config.get","config.set","config.patch",
              "config.providers.list","config.providers.save","config.providers.delete","config.test","config.update",
              "agents.files.get","agents.files.set",
              "exec.approvals.get","exec.approvals.set","exec.approval.resolve",
              "workspace.snapshots.list","workspace.rollback","vault.documents.list","roles.matrix.get",
              "browser.status","browser.profiles.list","browser.navigate",
              "brain.status","brain.export","brain.import",
              "wake","skills.status","models.list",
              "tasks.list",
              "cron.list","cron.add","cron.remove","cron.patch","cron.run"],
              events: ["chat","presence","heartbeat","cron","exec.approval.requested"] },
            snapshot: { health: { agents: allAgents, defaultAgentId: AGENT_ID },
              sessionDefaults: { mainKey: MAIN_KEY } },
            auth: { role: "operator", scopes: ["operator.admin","operator.approvals"] },
            policy: { tickIntervalMs: 30000 },
          },
        });
        return;
      }

      if (!connected) { send(resErr(id, "not_connected", "Send connect first.")); return; }

      try {
        const response = await handleMethod(method, params, id, sendEventFn);
        send(response);
      } catch (err) {
        const message = sanitizeErrorMessage(err);
        console.error(`[hermes-adapter] Error handling ${method}:`, message);
        send(resErr(id, "internal_error", message || "Internal error"));
      }
    });

    ws.on("close", () => activeSendEventFns.delete(sendEventFn));
    ws.on("error", (err) => {
      console.error("[hermes-adapter] WebSocket error:", sanitizeErrorMessage(err));
      activeSendEventFns.delete(sendEventFn);
    });
  });

  httpServer.listen(ADAPTER_PORT, "127.0.0.1", () => {
    console.log(`\n[hermes-adapter] \u2713 Listening on ws://localhost:${ADAPTER_PORT}`);
    console.log(`[hermes-adapter] \u2713 Forwarding to Hermes API at ${HERMES_API_URL}`);
    console.log(`[hermes-adapter] \u2713 Model: ${HERMES_MODEL}`);
    console.log(`[hermes-adapter] \u2713 Multi-agent orchestration: ENABLED`);
    console.log(`\nOpen Hermes3D -> ws://localhost:${ADAPTER_PORT}\n`);
  });

  httpServer.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`[hermes-adapter] Port ${ADAPTER_PORT} in use. Set HERMES_ADAPTER_PORT to change it.`);
      process.exit(98);
    } else {
      console.error("[hermes-adapter] Server error:", sanitizeErrorMessage(err));
      process.exit(1);
    }
  });
}

if (require.main === module) {
  loadAgentsFromDisk();
  loadHistoryFromDisk();
  if (process.send) {
    process.on("message", (m) => {
      if (m && m.type === "shutdown") {
        flushPersistence();
        if (httpServer) {
          httpServer.close(() => process.exit(0));
          setTimeout(() => process.exit(0), 1000).unref();
        } else {
          process.exit(0);
        }
      }
    });
  }
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.once(sig, () => { flushPersistence(); process.exit(0); });
  }
  process.once("exit", flushPersistence);
  startAdapter();
}

module.exports = {
  agentRegistry,
  loadAgentsFromDisk,
  writeAgentsFile,
  mergeHistory,
  writeFileAtomic,
  executeToolCall,
  resolveHermesEndpoint,
  resolveHermesBaseUrl,
  updateEnvFile,
  readProvidersData,
  writeProvidersData,
  createAgentEntry,
  slugify,
  flushPersistence,
};
