import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { resolveStateDir as resolveStateDirTs } from "@/lib/hermes/paths";

const require = createRequire(import.meta.url);
const { resolveStateDir: resolveStateDirCjs } = require("../../server/lib/state-dir.js");

describe("stateDir parity between TS (paths.ts) and CJS (state-dir.js) (WP6)", () => {
  it("matches when HERMES_STATE_DIR is an absolute override", () => {
    const override = path.resolve("/custom/absolute/hermes-state");
    const env = { HERMES_STATE_DIR: override };

    const tsResult = resolveStateDirTs(env);
    const cjsResult = resolveStateDirCjs(env);

    expect(tsResult).toBe(cjsResult);
    expect(cjsResult).toBe(override);
  });

  it("matches when HERMES_STATE_DIR uses tilde (~) expansion", () => {
    const env = { HERMES_STATE_DIR: "~/my-state-folder" };

    const tsResult = resolveStateDirTs(env);
    const cjsResult = resolveStateDirCjs(env);

    expect(tsResult).toBe(cjsResult);
    expect(cjsResult).toBe(path.resolve(path.join(os.homedir(), "my-state-folder")));
  });

  it("matches when no HERMES_STATE_DIR override is present (default home/.hermes)", () => {
    const env = {};

    const tsResult = resolveStateDirTs(env);
    const cjsResult = resolveStateDirCjs(env);

    expect(tsResult).toBe(cjsResult);
    expect(cjsResult).toBe(path.join(os.homedir(), ".hermes"));
  });

  it("matches when home directory is missing (fallback to tmpdir/.hermes)", () => {
    const env = {};
    const fakeEmptyHome = () => "";

    const tsResult = resolveStateDirTs(env, fakeEmptyHome);
    const cjsResult = resolveStateDirCjs(env, fakeEmptyHome);

    expect(tsResult).toBe(cjsResult);
    expect(cjsResult).toBe(path.join(os.tmpdir(), ".hermes"));
  });
});
