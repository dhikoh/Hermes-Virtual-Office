"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const STATE_DIRNAME = ".hermes";

function resolveUserPath(input, homedirFn = os.homedir) {
  const trimmed = String(input ?? "").trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, homedirFn());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
}

function resolveDefaultHomeDir(homedirFn = os.homedir) {
  const home = homedirFn();
  if (home) {
    try {
      if (fs.existsSync(home)) return home;
    } catch {}
  }
  return os.tmpdir();
}

function resolveStateDir(env = process.env, homedirFn = os.homedir) {
  const override = env.HERMES_STATE_DIR?.trim();
  if (override) return resolveUserPath(override, homedirFn);
  return path.join(resolveDefaultHomeDir(homedirFn), STATE_DIRNAME);
}

module.exports = {
  STATE_DIRNAME,
  resolveUserPath,
  resolveDefaultHomeDir,
  resolveStateDir,
};
