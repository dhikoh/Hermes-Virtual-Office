/**
 * Isolated Browser Research Service v2.4.0
 * Provides safe web research for Researcher agent.
 * Supports Camoufox anti-detect browser engine with per-agent persistent profile isolation (userDataDir),
 * and transparent fallback to lightweight isolated HTTP client when Camoufox binary is unavailable.
 * Enforces domain allowlist and writes results to <workspace>/_AI/research/
 * Based on Virtual AI Office Blueprint v2.4.0
 */

const https = require("node:https");
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { validateRoleAction, ROLES, DEFAULT_RESEARCH_ALLOWLIST } = require("../roles/role-matrix");
const { writeVaultDocument } = require("../vault/vault-manager");

let camoufoxModule = null;
try {
  camoufoxModule = require("camoufox");
} catch {
  camoufoxModule = null;
}

/**
 * Checks whether Camoufox package and its browser binary are available on the host system.
 */
function isCamoufoxAvailable() {
  if (!camoufoxModule) return false;
  try {
    if (typeof camoufoxModule.findInstalledVersion === "function") {
      const ver = camoufoxModule.findInstalledVersion();
      return Boolean(ver);
    }
    return false;
  } catch {
    return false;
  }
}

/**
 * Resolves base directory for persistent agent browser profiles
 */
function getBrowserProfilesBaseDir(baseDir) {
  if (process.env.HERMES_BROWSER_PROFILE_DIR) {
    return path.resolve(process.env.HERMES_BROWSER_PROFILE_DIR);
  }
  const root = baseDir || process.cwd();
  return path.join(root, "_AI", "browser-profiles");
}

/**
 * Sanitizes agent identifier for filesystem path safety
 */
function sanitizeAgentId(agentId) {
  if (!agentId || typeof agentId !== "string") return "default";
  const sanitized = agentId.toLowerCase().replace(/[^a-z0-9_-]/g, "_").slice(0, 64);
  return sanitized || "default";
}

/**
 * Returns (and creates if needed) an isolated persistent profile directory for a specific agent
 */
function getAgentProfileDir(agentId = "researcher", baseDir) {
  const safeId = sanitizeAgentId(agentId);
  const target = path.join(getBrowserProfilesBaseDir(baseDir), safeId);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }
  return target;
}

/**
 * Lists all existing agent browser profiles and metadata
 */
function listAgentProfiles(baseDir) {
  const dir = getBrowserProfilesBaseDir(baseDir);
  if (!fs.existsSync(dir)) return [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const profilePath = path.join(dir, e.name);
        const stat = fs.statSync(profilePath);
        return {
          agentId: e.name,
          path: profilePath,
          createdAt: stat.birthtime,
          updatedAt: stat.mtime,
        };
      });
  } catch {
    return [];
  }
}

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
  // Return first 16000 characters
  return clean.slice(0, 16000);
}

/**
 * Fetches content via Node HTTP/HTTPS transport (isolated, no user cookies)
 */
function fetchHttpIsolatedPage(url, _allowlist = DEFAULT_RESEARCH_ALLOWLIST) {
  return new Promise((resolve) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return resolve({ ok: false, error: "Invalid URL", engine: "http-fallback" });
    }

    const transport = parsed.protocol === "https:" ? https : http;
    const req = transport.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || (parsed.protocol === "https:" ? 443 : 80),
        path: parsed.pathname + (parsed.search || ""),
        method: "GET",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0 HermesVirtualOffice/2.4.0",
          "Accept": "text/html,application/xhtml+xml,text/plain",
        },
      },
      (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          if (rawData.length < 1024 * 1024) rawData += chunk.toString("utf8");
        });
        res.on("end", () => {
          const text = extractCleanText(rawData);
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            statusCode: res.statusCode,
            url,
            title: parsed.hostname,
            text,
            engine: "http-fallback",
          });
        });
      }
    );

    req.on("error", (err) => {
      resolve({ ok: false, error: err.message, url, engine: "http-fallback" });
    });

    req.setTimeout(15000, () => {
      req.destroy();
      resolve({ ok: false, error: "Connection timeout (15s)", url, engine: "http-fallback" });
    });

    req.end();
  });
}

/**
 * Fetches content using Camoufox stealth browser with anti-detect fingerprinting
 * and persistent agent profile isolation.
 */
async function fetchCamoufoxPage(url, options = {}) {
  const allowlist = options.allowlist || DEFAULT_RESEARCH_ALLOWLIST;
  const role = options.role || ROLES.RESEARCHER;
  const evalRes = validateRoleAction(role, "browser_navigate", { url, allowlist });
  if (!evalRes.allowed || evalRes.requiresApproval) {
    return {
      ok: false,
      level: evalRes.level,
      requiresApproval: evalRes.requiresApproval,
      error: evalRes.reason,
      engine: "camoufox",
    };
  }

  if (!isCamoufoxAvailable()) {
    return {
      ok: false,
      error: "Camoufox browser binary is not installed or available on this system",
      engine: "camoufox",
    };
  }

  const agentId = options.agentId || "researcher";
  const persistent = options.persistentProfile !== false;
  const profileDir = persistent ? getAgentProfileDir(agentId, options.workspacePath) : undefined;
  const timeout = options.timeout || 30000;

  let browserOrContext = null;
  try {
    const launchOpts = {
      headless: options.headless !== undefined ? options.headless : true,
    };
    if (persistent && profileDir) {
      launchOpts.persistent_context = true;
      launchOpts.user_data_dir = profileDir;
    }

    browserOrContext = await camoufoxModule.Camoufox(launchOpts);

    let page;
    if (typeof browserOrContext.newPage === "function") {
      page = await browserOrContext.newPage();
    } else if (typeof browserOrContext.newContext === "function") {
      const ctx = await browserOrContext.newContext();
      page = await ctx.newPage();
    } else {
      throw new Error("Unable to create browser page from Camoufox instance");
    }

    const response = await page.goto(url, {
      waitUntil: "domcontentloaded",
      timeout,
    });

    const statusCode = response ? response.status() : 200;
    const title = await page.title().catch(() => "");
    
    const pageText = await page.evaluate(() => {
      return document.body ? document.body.innerText : "";
    }).catch(() => "");

    const text = (pageText || "").trim().slice(0, 16000);

    let screenshotBase64 = null;
    if (options.screenshot) {
      const buf = await page.screenshot({ type: "jpeg", quality: 60 }).catch(() => null);
      if (buf) {
        screenshotBase64 = buf.toString("base64");
      }
    }

    await page.close().catch(() => {});

    return {
      ok: statusCode >= 200 && statusCode < 400,
      statusCode,
      url,
      title,
      text,
      engine: "camoufox",
      agentId,
      profileDir,
      screenshot: screenshotBase64,
    };
  } catch (err) {
    return {
      ok: false,
      error: err.message || "Failed to render page with Camoufox",
      url,
      engine: "camoufox",
    };
  } finally {
    if (browserOrContext) {
      try {
        await browserOrContext.close();
      } catch {}
    }
  }
}

/**
 * Fetches content from a URL via isolated browser client.
 * Automatically uses Camoufox stealth engine if available; otherwise falls back to isolated HTTP transport.
 * Supports legacy signature: fetchIsolatedPage(url, allowlist)
 * and options signature: fetchIsolatedPage(url, { allowlist, agentId, preferCamoufox, workspacePath })
 */
async function fetchIsolatedPage(url, options = DEFAULT_RESEARCH_ALLOWLIST) {
  let allowlist = DEFAULT_RESEARCH_ALLOWLIST;
  let preferCamoufox = true;
  let agentId = "researcher";
  let workspacePath = process.cwd();
  let saveToVault = false;
  let topic = "";

  let role = ROLES.RESEARCHER;
  if (Array.isArray(options)) {
    allowlist = options;
  } else if (options && typeof options === "object") {
    if (typeof options.role === "string" && options.role) role = options.role;
    if (Array.isArray(options.allowlist)) allowlist = options.allowlist;
    if (typeof options.preferCamoufox === "boolean") preferCamoufox = options.preferCamoufox;
    if (typeof options.agentId === "string") agentId = options.agentId;
    if (typeof options.workspacePath === "string") workspacePath = options.workspacePath;
    if (typeof options.saveToVault === "boolean") saveToVault = options.saveToVault;
    if (typeof options.topic === "string") topic = options.topic;
  }

  const evalRes = validateRoleAction(role, "browser_navigate", { url, allowlist });
  if (!evalRes.allowed || evalRes.requiresApproval) {
    return {
      ok: false,
      level: evalRes.level,
      requiresApproval: evalRes.requiresApproval,
      error: evalRes.reason,
    };
  }

  let result;
  if (preferCamoufox && isCamoufoxAvailable()) {
    try {
      result = await fetchCamoufoxPage(url, {
        allowlist,
        agentId,
        role,
        workspacePath,
        persistentProfile: true,
      });
      if (!result.ok && result.error && result.error.includes("Camoufox browser binary is not installed")) {
        result = await fetchHttpIsolatedPage(url, allowlist);
      }
    } catch {
      result = await fetchHttpIsolatedPage(url, allowlist);
    }
  } else {
    result = await fetchHttpIsolatedPage(url, allowlist);
  }

  if (saveToVault && result && result.ok && result.text) {
    try {
      const savedDoc = saveResearchToVault(
        workspacePath,
        topic || result.title || "Web Research",
        result.text,
        [url],
        agentId
      );
      result.savedDoc = savedDoc;
    } catch (saveErr) {
      result.saveError = saveErr.message;
    }
  }

  return result;
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
  isCamoufoxAvailable,
  getBrowserProfilesBaseDir,
  getAgentProfileDir,
  listAgentProfiles,
  fetchCamoufoxPage,
  fetchIsolatedPage,
  saveResearchToVault,
  extractCleanText,
};

