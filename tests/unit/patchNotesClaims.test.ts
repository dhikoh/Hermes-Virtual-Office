import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Patch Notes Claims Verification (WP12)", () => {
  it("verifies all file paths mentioned in the top PATCH_NOTES entry exist or are marked removed", () => {
    const patchNotesPath = path.join(process.cwd(), "PATCH_NOTES.md");
    expect(fs.existsSync(patchNotesPath)).toBe(true);

    const content = fs.readFileSync(patchNotesPath, "utf8");
    const sections = content.split(/^##\s+/m);
    // sections[0] is header, sections[1] is the top patch entry
    expect(sections.length).toBeGreaterThan(1);
    const topEntry = sections[1];

    const lines = topEntry.split("\n");
    const missingFiles: string[] = [];
    const shouldNotExistFiles: string[] = [];

    const pathRegex = /`([a-zA-Z0-9_\-./\\]+\.[a-zA-Z0-9]+)`/g;

    for (const line of lines) {
      // Check if bullet item begins with Removed or Deleted (e.g. "- Removed: `file`" or "- **Removed**: `file`")
      const isRemoval = /^\s*[-*]\s*(?:\*\*)?(?:Removed|Deleted)\b/i.test(line);
      let match: RegExpExecArray | null;

      while ((match = pathRegex.exec(line)) !== null) {
        const candidate = match[1];

        // Skip non-file paths or extensions that are commands/urls or semver strings
        if (
          /^\d+(\.\d+)+$/.test(candidate) ||
          candidate.startsWith("http://") ||
          candidate.startsWith("https://") ||
          candidate.includes("node:") ||
          candidate.endsWith(".com") ||
          candidate.endsWith(".net") ||
          candidate.endsWith(".org")
        ) {
          continue;
        }

        const resolved = path.resolve(process.cwd(), candidate);
        const exists = fs.existsSync(resolved);

        if (isRemoval) {
          if (exists) {
            shouldNotExistFiles.push(`${candidate} (marked removed but exists on disk)`);
          }
        } else {
          if (!exists) {
            missingFiles.push(`${candidate} (claimed in patch notes but not found)`);
          }
        }
      }
    }

    expect(shouldNotExistFiles).toEqual([]);
    expect(missingFiles).toEqual([]);
  });
});
