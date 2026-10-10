const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { resolveStateDir, resolveUserPath, resolveDefaultHomeDir, STATE_DIRNAME } = require("./lib/state-dir");

const resolveStudioSettingsPath = (env = process.env) => {
  return path.join(resolveStateDir(env), "hermes3d", "settings.json");
};

const readJsonFile = (filePath) => {
  if (!fs.existsSync(filePath)) return null;
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
};

const DEFAULT_GATEWAY_URL = "ws://localhost:18789";
const HERMES_CONFIG_FILENAME = "hermes.json";

const isRecord = (value) => Boolean(value && typeof value === "object");

const readHermesGatewayDefaults = (env = process.env) => {
  try {
    const stateDir = resolveStateDir(env);
    const configPath = path.join(stateDir, HERMES_CONFIG_FILENAME);
    const parsed = readJsonFile(configPath);
    if (!isRecord(parsed)) return null;
    const gateway = isRecord(parsed.gateway) ? parsed.gateway : null;
    if (!gateway) return null;
    const auth = isRecord(gateway.auth) ? gateway.auth : null;
    const token = typeof auth?.token === "string" ? auth.token.trim() : "";
    const port =
      typeof gateway.port === "number" && Number.isFinite(gateway.port) ? gateway.port : null;
    if (!token) return null;
    const url = port ? `ws://localhost:${port}` : "";
    if (!url) return null;
    return { url, token, adapterType: "hermes" };
  } catch {
    return null;
  }
};

const loadUpstreamGatewaySettings = (env = process.env) => {
  const settingsPath = resolveStudioSettingsPath(env);
  const parsed = readJsonFile(settingsPath);
  const gateway = parsed && typeof parsed === "object" ? parsed.gateway : null;
  const url = typeof gateway?.url === "string" ? gateway.url.trim() : "";
  const token = typeof gateway?.token === "string" ? gateway.token.trim() : "";
  const adapterType =
    typeof gateway?.adapterType === "string" && gateway.adapterType.trim()
      ? gateway.adapterType.trim()
      : "hermes";
  if (!token && adapterType === "hermes") {
    const defaults = readHermesGatewayDefaults(env);
    if (defaults) {
      return {
        url: url || defaults.url,
        token: defaults.token,
        adapterType,
        settingsPath,
      };
    }
  }
  return {
    url: url || DEFAULT_GATEWAY_URL,
    token,
    adapterType,
    settingsPath,
  };
};

module.exports = {
  resolveStateDir,
  resolveStudioSettingsPath,
  loadUpstreamGatewaySettings,
};
