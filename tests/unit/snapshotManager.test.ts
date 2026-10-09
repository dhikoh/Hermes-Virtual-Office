import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const {
  createSnapshot,
  listSnapshots,
  rollbackSnapshot,
} = require("../../server/workspace/snapshot-manager");

describe("Snapshot & 1-Click Rollback Engine v2.3.1", () => {
  const testWorkspace = path.join(process.cwd(), "tests", "fixtures", "test-workspace");
  const testFileA = path.join(testWorkspace, "src", "hello.txt");
  const testFileB = path.join(testWorkspace, "src", "created_by_agent.txt");

  beforeAll(() => {
    fs.mkdirSync(path.dirname(testFileA), { recursive: true });
    fs.writeFileSync(testFileA, "Original content v1", "utf8");
    if (fs.existsSync(testFileB)) fs.unlinkSync(testFileB);
  });

  afterAll(() => {
    try {
      fs.rmSync(testWorkspace, { recursive: true, force: true });
    } catch {}
  });

  it("creates pre-mutation snapshots of existing and pending files", () => {
    const snapshot = createSnapshot(testWorkspace, [testFileA, testFileB], "dev-1", "Feature refactor");
    expect(snapshot.id).toMatch(/^snap_/);
    expect(snapshot.files).toHaveLength(2);

    const fileARecord = snapshot.files.find((f: any) => f.originalPath === testFileA);
    expect(fileARecord.existsBefore).toBe(true);
    expect(fileARecord.backupFile).toBeTruthy();

    const fileBRecord = snapshot.files.find((f: any) => f.originalPath === testFileB);
    expect(fileBRecord.existsBefore).toBe(false);
  });

  it("lists existing snapshots in reverse chronological order", () => {
    const list = listSnapshots(testWorkspace);
    expect(list.length).toBeGreaterThanOrEqual(1);
    expect(list[0].authorAgentId).toBe("dev-1");
  });

  it("performs 1-click rollback: restores modified file and deletes newly introduced file", () => {
    const list = listSnapshots(testWorkspace);
    const activeSnapshotId = list[0].id;

    // Simulate Agent mutating fileA and creating fileB
    fs.writeFileSync(testFileA, "DAMAGED or BUGGY content v2", "utf8");
    fs.writeFileSync(testFileB, "New unreviewed file v2", "utf8");

    expect(fs.readFileSync(testFileA, "utf8")).toBe("DAMAGED or BUGGY content v2");
    expect(fs.existsSync(testFileB)).toBe(true);

    // Rollback!
    const rollbackResult = rollbackSnapshot(testWorkspace, activeSnapshotId);
    expect(rollbackResult.ok).toBe(true);
    expect(rollbackResult.restoredCount).toBe(2);

    // Verify fileA is restored to Original content v1
    expect(fs.readFileSync(testFileA, "utf8")).toBe("Original content v1");

    // Verify fileB is deleted
    expect(fs.existsSync(testFileB)).toBe(false);
  });
});
