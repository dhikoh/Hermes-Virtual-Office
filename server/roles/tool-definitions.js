/**
 * Single source of truth for tool definitions and capability mappings (WP2).
 * Every tool exposed to LLM is defined here.
 */

const ALL_TOOLS = [
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

// Add capability parameter to spawn_agent tool schema
const spawnAgentTool = ALL_TOOLS.find((t) => t.function.name === "spawn_agent");
if (spawnAgentTool && spawnAgentTool.function.parameters.properties) {
  spawnAgentTool.function.parameters.properties.capability = {
    type: "string",
    description: "Specialized capability of the agent: developer | researcher | qa | writer (pm is reserved for main orchestrator)",
    enum: ["developer", "researcher", "qa", "writer"],
  };
}

const CAPABILITY_TOOLS = {
  pm: [
    "workspace_map",
    "spawn_agent",
    "delegate_task",
    "list_team",
    "configure_agent",
    "dismiss_agent",
    "read_agent_context",
  ],
  developer: [
    "workspace_map",
    "read_file",
    "write_file",
    "execute_command",
    "list_snapshots",
    "rollback_workspace",
    "read_agent_context",
  ],
  researcher: [
    "web_search_and_read",
    "save_research_note",
    "read_agent_context",
  ],
  qa: [
    "workspace_map",
    "read_file",
    "execute_command",
    "read_agent_context",
  ],
  writer: [
    "workspace_map",
    "read_file",
    "read_agent_context",
  ],
};

const toolNames = ALL_TOOLS.map((t) => t.function.name);

function toolsForCapability(capability) {
  const norm = typeof capability === "string" ? capability.toLowerCase().trim() : "";
  const allowed = CAPABILITY_TOOLS[norm];
  if (!allowed) return [];
  return allowed
    .map((name) => ALL_TOOLS.find((t) => t.function.name === name))
    .filter(Boolean);
}

module.exports = {
  ALL_TOOLS,
  CAPABILITY_TOOLS,
  toolNames,
  toolsForCapability,
};
