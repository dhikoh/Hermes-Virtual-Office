/**
 * Knowledge Vault Manager v2.3.1
 * Manages Obsidian-compatible Markdown vault inside <workspace>/_AI/
 * Based on Virtual AI Office Blueprint v2.3.1 (Section 7)
 */

const fs = require("node:fs");
const path = require("node:path");

function getVaultDir(workspacePath) {
  return path.join(workspacePath, "_AI");
}

function ensureVaultStructure(workspacePath) {
  const vault = getVaultDir(workspacePath);
  const subdirs = ["research", "plans", "adr"];
  for (const sub of subdirs) {
    fs.mkdirSync(path.join(vault, sub), { recursive: true });
  }
  return vault;
}

/**
 * Creates Obsidian-compatible frontmatter
 */
function buildFrontmatter(metadata = {}) {
  const lines = [
    "---",
    `ai-generated: true`,
    `trust: ${metadata.trust || "T3"}`,
    `employee: ${metadata.employee || "agent"}`,
    `task: ${metadata.task || "general"}`,
    `created_at: "${metadata.createdAt || new Date().toISOString()}"`,
  ];

  if (Array.isArray(metadata.sources) && metadata.sources.length > 0) {
    lines.push("sources:");
    for (const src of metadata.sources) {
      lines.push(`  - "${src}"`);
    }
  } else {
    lines.push("sources: []");
  }

  lines.push("---");
  return lines.join("\n");
}

/**
 * Writes an Obsidian-compatible markdown note into the vault
 * @param {string} workspacePath
 * @param {"research" | "plans" | "adr"} subfolder
 * @param {string} filename (e.g. "auth_architecture.md")
 * @param {string} body Markdown content body
 * @param {object} metadata
 */
function writeVaultDocument(workspacePath, subfolder, filename, body, metadata = {}) {
  ensureVaultStructure(workspacePath);
  const safeFilename = filename.endsWith(".md") ? filename : `${filename}.md`;
  const cleanFilename = safeFilename.replace(/[^a-zA-Z0-9_\-\.]/g, "_");
  const targetDir = path.join(getVaultDir(workspacePath), subfolder);
  const filePath = path.join(targetDir, cleanFilename);

  const frontmatter = buildFrontmatter(metadata);
  const fullContent = `${frontmatter}\n\n# ${metadata.title || cleanFilename.replace(/\.md$/, "")}\n\n${body.trim()}\n`;

  fs.writeFileSync(filePath, fullContent, "utf8");
  return {
    ok: true,
    filePath,
    relativePath: path.relative(workspacePath, filePath).replace(/\\/g, "/"),
  };
}

/**
 * Lists all documents in a vault subfolder
 */
function listVaultDocuments(workspacePath, subfolder) {
  const targetDir = path.join(getVaultDir(workspacePath), subfolder || "");
  if (!fs.existsSync(targetDir)) return [];

  const files = fs.readdirSync(targetDir).filter((f) => f.endsWith(".md"));
  return files.map((f) => {
    const fullPath = path.join(targetDir, f);
    const content = fs.readFileSync(fullPath, "utf8");
    return {
      filename: f,
      relativePath: path.relative(workspacePath, fullPath).replace(/\\/g, "/"),
      sizeBytes: Buffer.byteLength(content),
    };
  });
}

module.exports = {
  getVaultDir,
  ensureVaultStructure,
  writeVaultDocument,
  listVaultDocuments,
  buildFrontmatter,
};
