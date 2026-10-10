import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const STATE_DIRNAME = ".hermes";
const CONFIG_FILENAME = "hermes.json";

const resolveDefaultHomeDir = (homedir: () => string = os.homedir): string => {
  const home = homedir();
  if (home) {
    try {
      if (fs.existsSync(home)) {
        return home;
      }
    } catch {
      // ignore
    }
  }
  return os.tmpdir();
};

export const resolveUserPath = (
  input: string,
  homedir: () => string = os.homedir
): string => {
  const trimmed = input.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~")) {
    const expanded = trimmed.replace(/^~(?=$|[\\/])/, homedir());
    return path.resolve(expanded);
  }
  return path.resolve(trimmed);
};

export const resolveStateDir = (
  env: Record<string, string | undefined> = process.env,
  homedir: () => string = os.homedir
): string => {
  const override = env.HERMES_STATE_DIR?.trim();
  if (override) return resolveUserPath(override, homedir);
  return path.join(resolveDefaultHomeDir(homedir), STATE_DIRNAME);
};

export const resolveConfigPathCandidates = (
  env: Record<string, string | undefined> = process.env,
  homedir: () => string = os.homedir
): string[] => {
  const explicit = env.HERMES_CONFIG_PATH?.trim();
  if (explicit) return [resolveUserPath(explicit, homedir)];

  const candidates: string[] = [];
  const stateDir = env.HERMES_STATE_DIR?.trim();
  if (stateDir) {
    candidates.push(path.join(resolveUserPath(stateDir, homedir), CONFIG_FILENAME));
  }
  candidates.push(path.join(resolveDefaultHomeDir(homedir), STATE_DIRNAME, CONFIG_FILENAME));
  return candidates;
};
