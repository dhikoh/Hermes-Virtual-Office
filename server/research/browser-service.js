/**
 * Isolated Browser Research Service v2.3.1
 * Provides safe web research for Researcher agent without cookies, credentials, or user profiles.
 * Enforces domain allowlist and writes results to <workspace>/_AI/research/
 * Based on Virtual AI Office Blueprint v2.3.1 (Section 4.1, 5.1 & 7)
 */

const https = require("node:https");
const http = require("node:http");
const { validateRoleAction, ROLES, DEFAULT_RESEARCH_ALLOWLIST } = require("../roles/role-matrix");
const { writeVaultDocument } = require("../vault/vault-manager");

/**
 * Extracts plain clean text from an HTML response (lightweight sanitizer)
 */
function extractCleanText(html) {
  if (typeof html !== "string") return "";
  let clean = html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
  // Return first 8000 characters
  return clean.slice(0, 8000);
}

/**
 * Fetches content from a URL via isolated HTTP/HTTPS client (without credentials or cookies)
 */
function fetchIsolatedPage(url, allowlist = DEFAULT_RESEARCH_ALLOWLIST) {
  return new Promise((resolve) => {
    const evalRes = validateRoleAction(ROLES.RESEARCHER, "browser_navigate", { url, allowlist });
    if (!evalRes.allowed || evalRes.requiresApproval) {
      return resolve({
        ok: false,
        level: evalRes.level,
        requiresApproval: evalRes.requiresApproval,
        error: evalRes.reason,
      });
    }

    let parsed;
    try {
      parsed = new URL(url);
    } catch (err) {
      return resolve({ ok: false, error: "Invalid URL" });
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + (parsed.search || ""),
        method: "GET",
        headers: {
          "User-Agent": "HermesVirtualOffice-Researcher/2.3.1 (Safe-Isolated; +https://github.com/dhikoh/Hermes-Virtual-Office)",
          "Accept": "text/html,application/xhtml+xml,text/plain",
        },
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          if (rawData.length < 512 * 1024) rawData += chunk.toString("utf8");
        });
        res.on("end", () => {
          const text = extractCleanText(rawData);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            url,
            title: parsed.hostname,
            text,
          });
        });
      }
    );

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message, url });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ ok: false, error: "Connection timeout (15s)", url });
    });

    req.end();
  });
}

/**
 * Saves research output to Obsidian Markdown in <workspace>/_AI/research/<slug>.md
 */
function saveResearchToVault(workspacePath, topic, content, sources = [], authorAgentId = "researcher") {
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 50);

  return writeVaultDocument(workspacePath, "research", `${slug}.md`, content, {
    title: topic,
    employee: authorAgentId,
    trust: "T3",
    sources,
    task: "research",
  });
}

module.exports = {
  fetchIsolatedPage,
  saveResearchToVault,
  extractCleanText,
};
