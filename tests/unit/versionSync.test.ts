import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

describe("Version Synchronization (WP7)", () => {
  const repoRoot = path.resolve(__dirname, "../..");
  const packageJsonPath = path.join(repoRoot, "package.json");
  const changelogPath = path.join(repoRoot, "CHANGELOG.md");
  const patchNotesPath = path.join(repoRoot, "PATCH_NOTES.md");

  it("ensures package.json, CHANGELOG.md, and PATCH_NOTES.md top versions are identical", () => {
    // 1. package.json version
    const pkg = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
    const pkgVersion = pkg.version;
    expect(pkgVersion).toBeDefined();

    // 2. CHANGELOG.md top heading (e.g. ## [1.0.14] - 2026-10-10)
    const changelogContent = fs.readFileSync(changelogPath, "utf8");
    const changelogMatch = changelogContent.match(/^##\s+\[([0-9]+\.[0-9]+\.[0-9]+)\]/m);
    expect(changelogMatch, "CHANGELOG.md must contain a version header ## [x.y.z]").not.toBeNull();
    const changelogVersion = changelogMatch ? changelogMatch[1] : null;

    // 3. PATCH_NOTES.md top heading (e.g. ## Patch v1.0.14 ...)
    const patchNotesContent = fs.readFileSync(patchNotesPath, "utf8");
    const patchNotesMatch = patchNotesContent.match(/^##\s+Patch\s+v?([0-9]+\.[0-9]+\.[0-9]+)/m);
    expect(patchNotesMatch, "PATCH_NOTES.md must contain a version header ## Patch vx.y.z").not.toBeNull();
    const patchNotesVersion = patchNotesMatch ? patchNotesMatch[1] : null;

    expect(changelogVersion).toBe(pkgVersion);
    expect(patchNotesVersion).toBe(pkgVersion);
    expect(pkgVersion).toBe("1.0.14");
  });
});
