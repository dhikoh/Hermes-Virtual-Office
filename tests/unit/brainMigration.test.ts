/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { describe, expect, it } from "vitest";

const {
  createBrainArchive,
  restoreBrainArchive,
  inspectBrainArchive,
  getBrainStatus,
  unpackTarGz,
} = require("../../server/system/brain-manager.js");

describe("Brain Migration Engine (Option 1)", () => {
  const testTmpDir = path.join(process.cwd(), ".tmp-test-brain");

  it("exports and imports a workspace brain with 100% data integrity", () => {
    const srcDir = path.join(testTmpDir, "src");
    const destDir = path.join(testTmpDir, "dest");
    const archivePath = path.join(testTmpDir, "backup.tar.gz");

    // Clean up test directories
    if (existsSync(testTmpDir)) {
      rmSync(testTmpDir, { recursive: true, force: true });
    }

    // 1. Setup mock workspace
    mkdirSync(path.join(srcDir, "_AI/research"), { recursive: true });
    mkdirSync(path.join(srcDir, "_AI/plans"), { recursive: true });
    mkdirSync(path.join(srcDir, ".hermes/history"), { recursive: true });

    writeFileSync(path.join(srcDir, "MEMORY.md"), "# Knowledge Memory\nImportant context.\n", "utf8");
    writeFileSync(path.join(srcDir, "USER.md"), "# User Persona\nOwner preferences.\n", "utf8");
    writeFileSync(path.join(srcDir, "SOUL.md"), "# Agent Soul\nScientific skepticism.\n", "utf8");
    writeFileSync(path.join(srcDir, "_AI/research/competitor-analysis.md"), "## Market research\nCamoufox scraped data.\n", "utf8");
    writeFileSync(path.join(srcDir, ".hermes/history/session-alpha.json"), JSON.stringify({ chat: ["msg1", "msg2"] }), "utf8");

    // Test long path (> 100 characters)
    const longSubDir = path.join(srcDir, "_AI/research/nested-deep-directory-with-very-long-folder-name-for-testing-purposes");
    mkdirSync(longSubDir, { recursive: true });
    writeFileSync(path.join(longSubDir, "very-long-filename-that-exceeds-standard-one-hundred-characters-tar-header-limit-test.md"), "Deep content", "utf8");

    // 2. Check brain status
    const statusBefore = getBrainStatus(srcDir);
    expect(statusBefore.totalFiles).toBe(6);
    expect(statusBefore.categories.research).toBe(2);
    expect(statusBefore.categories.memory.hasMemory).toBe(true);

    // 3. Export archive
    const exportResult = createBrainArchive(srcDir, archivePath);
    expect(existsSync(archivePath)).toBe(true);
    expect(exportResult.fileCount).toBe(6);
    expect(exportResult.archiveSize).toBeGreaterThan(0);

    // 4. Inspect archive without restoring
    const inspection = inspectBrainArchive(archivePath);
    expect(inspection.manifest).toBeTruthy();
    expect(inspection.manifest.filesCount).toBe(6);
    expect(inspection.entries.length).toBeGreaterThan(6); // files + directories

    // 5. Restore into destination directory
    const restoreResult = restoreBrainArchive(archivePath, destDir);
    expect(restoreResult.fileCount).toBe(6);

    // 6. Verify restored file contents match source exactly
    expect(readFileSync(path.join(destDir, "MEMORY.md"), "utf8")).toBe("# Knowledge Memory\nImportant context.\n");
    expect(readFileSync(path.join(destDir, "USER.md"), "utf8")).toBe("# User Persona\nOwner preferences.\n");
    expect(readFileSync(path.join(destDir, "SOUL.md"), "utf8")).toBe("# Agent Soul\nScientific skepticism.\n");
    expect(readFileSync(path.join(destDir, "_AI/research/competitor-analysis.md"), "utf8")).toBe("## Market research\nCamoufox scraped data.\n");
    expect(JSON.parse(readFileSync(path.join(destDir, ".hermes/history/session-alpha.json"), "utf8"))).toEqual({ chat: ["msg1", "msg2"] });

    const restoredLongFile = path.join(destDir, "_AI/research/nested-deep-directory-with-very-long-folder-name-for-testing-purposes/very-long-filename-that-exceeds-standard-one-hundred-characters-tar-header-limit-test.md");
    expect(existsSync(restoredLongFile)).toBe(true);
    expect(readFileSync(restoredLongFile, "utf8")).toBe("Deep content");

    // Clean up
    rmSync(testTmpDir, { recursive: true, force: true });
  });

  it("blocks path traversal attacks during archive extraction", () => {
    // Construct a malicious tar header with ../evil.txt
    const header = Buffer.alloc(512);
    header.write("../evil.txt", 0, 100, "utf8");
    header.write("0000644 \0", 100, 8, "ascii");
    header.write("00000000010 ", 124, 12, "ascii"); // 8 bytes
    header.write("        ", 148, 8, "ascii");
    header.write("0", 156, 1, "ascii");
    header.write("ustar\0", 257, 6, "ascii");
    header.write("00", 263, 2, "ascii");

    let sum = 0;
    for (let i = 0; i < 512; i++) sum += header[i];
    header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");

    const fileData = Buffer.from("malicious payload", "utf8");
    const padLen = (512 - (fileData.length % 512)) % 512;
    const padding = Buffer.alloc(padLen);
    const tarBuf = Buffer.concat([header, fileData, padding, Buffer.alloc(1024)]);
    const compressed = zlib.gzipSync(tarBuf);

    expect(() => {
      unpackTarGz(compressed, testTmpDir);
    }).toThrow(/Security Violation: Malicious path detected/);
  });
});
