/* eslint-disable @typescript-eslint/no-require-imports */
import { describe, expect, it } from "vitest";

const {
  isCamoufoxAvailable,
  listAgentProfiles,
  getAgentProfileDir,
  fetchIsolatedPage,
} = require("../../server/research/browser-service");

describe("Camoufox Browser Service & Gateway RPC Integration", () => {
  it("exports browser capabilities correctly", () => {
    expect(typeof isCamoufoxAvailable).toBe("function");
    expect(typeof listAgentProfiles).toBe("function");
    expect(typeof getAgentProfileDir).toBe("function");
    expect(typeof fetchIsolatedPage).toBe("function");
  });

  it("probes Camoufox availability and returns boolean status", () => {
    const available = isCamoufoxAvailable();
    expect(typeof available).toBe("boolean");
  });

  it("handles agent browser profile directories idempotently", () => {
    const dir1 = getAgentProfileDir("agent-researcher-alpha");
    const dir2 = getAgentProfileDir("agent-researcher-alpha");
    expect(dir1).toBe(dir2);
    expect(dir1).toContain("agent-researcher-alpha");
  });

  it("rejects unauthorized navigation gracefully", async () => {
    const res = await fetchIsolatedPage("https://untrusted-unapproved-site.top/secret", ["wikipedia.org"]);
    expect(res.ok).toBe(false);
    expect(res.error).toBeDefined();
  });
});
