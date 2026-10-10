import { describe, it, expect, beforeEach, afterEach } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { execFileSync } from "node:child_process";

describe("api_providers.json State Directory Persistence (WP6)", () => {
  let tempBase: string;
  let sharedStateDir: string;
  let cwd1: string;
  let cwd2: string;

  beforeEach(() => {
    tempBase = fs.mkdtempSync(path.join(os.tmpdir(), "hermes-provider-test-"));
    sharedStateDir = path.join(tempBase, "shared-state");
    cwd1 = path.join(tempBase, "workspace-1");
    cwd2 = path.join(tempBase, "workspace-2");
    fs.mkdirSync(sharedStateDir, { recursive: true });
    fs.mkdirSync(cwd1, { recursive: true });
    fs.mkdirSync(cwd2, { recursive: true });
  });

  afterEach(() => {
    try {
      fs.rmSync(tempBase, { recursive: true, force: true });
    } catch {}
  });

  it("persists active provider in HERMES_STATE_DIR across different working directories (restarts)", () => {
    const adapterPath = path.resolve(__dirname, "../../server/hermes-gateway-adapter.js");

    // 1. In cwd1, write providers data to state dir
    const scriptWrite = `
      const adapter = require(${JSON.stringify(adapterPath)});
      const testProviders = [
        { id: "prov-alpha", name: "Alpha AI", url: "https://api.alpha.test", key: "sk-alpha-test" },
        { id: "prov-beta", name: "Beta AI", url: "https://api.beta.test", key: "sk-beta-test" }
      ];
      adapter.writeProvidersData(testProviders, "prov-beta");
      console.log("WROTE_SUCCESS");
    `;

    const out1 = execFileSync(process.execPath, ["-e", scriptWrite], {
      cwd: cwd1,
      env: {
        ...process.env,
        HERMES_STATE_DIR: sharedStateDir,
      },
      encoding: "utf8",
    });
    expect(out1).toContain("WROTE_SUCCESS");

    // Verify it was written to sharedStateDir, NOT to cwd1
    const stateFile = path.join(sharedStateDir, "api_providers.json");
    expect(fs.existsSync(stateFile)).toBe(true);
    expect(fs.existsSync(path.join(cwd1, "api_providers.json"))).toBe(false);

    // 2. In cwd2 (completely different working directory), read providers
    const scriptRead = `
      const adapter = require(${JSON.stringify(adapterPath)});
      const data = adapter.readProvidersData();
      console.log(JSON.stringify(data));
    `;

    const out2 = execFileSync(process.execPath, ["-e", scriptRead], {
      cwd: cwd2,
      env: {
        ...process.env,
        HERMES_STATE_DIR: sharedStateDir,
      },
      encoding: "utf8",
    });

    const parsed = JSON.parse(out2.trim());
    expect(parsed.activeProviderId).toBe("prov-beta");
    expect(parsed.providers).toHaveLength(2);
    expect(parsed.providers.find((p: { id: string }) => p.id === "prov-beta")?.name).toBe("Beta AI");
    expect(fs.existsSync(path.join(cwd2, "api_providers.json"))).toBe(false);
  });

  it("migrates legacy api_providers.json from cwd to HERMES_STATE_DIR on first read", () => {
    const adapterPath = path.resolve(__dirname, "../../server/hermes-gateway-adapter.js");
    const freshStateDir = path.join(tempBase, "fresh-state");
    fs.mkdirSync(freshStateDir, { recursive: true });

    // Seed legacy file in cwd1
    const legacyFile = path.join(cwd1, "api_providers.json");
    const legacyData = {
      activeProviderId: "legacy-prod",
      providers: [
        { id: "legacy-prod", name: "Legacy Production", url: "https://legacy.api", key: "sk-legacy" },
      ],
    };
    fs.writeFileSync(legacyFile, JSON.stringify(legacyData, null, 2), "utf8");

    // Run adapter from cwd1 with empty freshStateDir
    const scriptMigrate = `
      const adapter = require(${JSON.stringify(adapterPath)});
      const data = adapter.readProvidersData();
      console.log(JSON.stringify(data));
    `;

    const out = execFileSync(process.execPath, ["-e", scriptMigrate], {
      cwd: cwd1,
      env: {
        ...process.env,
        HERMES_STATE_DIR: freshStateDir,
      },
      encoding: "utf8",
    });

    const parsed = JSON.parse(out.trim());
    expect(parsed.activeProviderId).toBe("legacy-prod");

    // Verify it was copied to state dir and legacy file was preserved (not deleted)
    const stateFile = path.join(freshStateDir, "api_providers.json");
    expect(fs.existsSync(stateFile)).toBe(true);
    expect(fs.existsSync(legacyFile)).toBe(true);
    const stateContent = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    expect(stateContent.activeProviderId).toBe("legacy-prod");
  });
});
