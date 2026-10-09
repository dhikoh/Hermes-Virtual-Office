/**
 * Workspace Snapshot & 1-Click Rollback Engine
 * Implements automated pre-mutation backups and single-click restoration.
 * Based on Virtual AI Office Blueprint v2.3.1 (Section 6)
 */

const fs = require("node:fs");
const path = require("node:path");

function getSnapshotDir(workspacePath) {
  return path.join(workspacePath, ".hermes", "snapshots");
}

function getManifestPath(workspacePath) {
  return path.join(getSnapshotDir(workspacePath), "manifest.json");
}

function loadManifest(workspacePath) {
  const manifestPath = getManifestPath(workspacePath);
  if (!fs.existsSync(manifestPath)) {
    return { snapshots: [] };
  }
  try {
    const raw = fs.readFileSync(manifestPath, "utf8");
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.snapshots) ? parsed : { snapshots: [] };
  } catch {
    return { snapshots: [] };
  }
}

function saveManifest(workspacePath, manifest) {
  const manifestPath = getManifestPath(workspacePath);
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
}

/**
 * Creates a pre-mutation snapshot of specified file(s) before an agent writes/edits them.
 * @param {string} workspacePath Root of the workspace
 * @param {string[]} filePaths Array of files that will be modified/created
 * @param {string} authorAgentId ID of the agent performing the mutation
 * @param {string} description Reason or description of change
 * @returns {object} Created snapshot summary
 */
function createSnapshot(workspacePath, filePaths, authorAgentId = "agent", description = "Pre-mutation backup") {
  const snapshotId = `snap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const snapshotFolder = path.join(getSnapshotDir(workspacePath), snapshotId);
  fs.mkdirSync(snapshotFolder, { recursive: true });

  const backedUpFiles = [];

  for (const rawFile of filePaths) {
    const absPath = path.isAbsolute(rawFile) ? rawFile : path.join(workspacePath, rawFile);
    const relToWorkspace = path.relative(workspacePath, absPath);
    const existsBefore = fs.existsSync(absPath);

    const fileRecord = {
      originalPath: absPath,
      relativePath: relToWorkspace,
      existsBefore,
      backupFile: null,
    };

    if (existsBefore) {
      const backupFilename = Buffer.from(relToWorkspace).toString("hex") + ".bak";
      const backupPath = path.join(snapshotFolder, backupFilename);
      fs.copyFileSync(absPath, backupPath);
      fileRecord.backupFile = backupFilename;
    }

    backedUpFiles.push(fileRecord);
  }

  const snapshotRecord = {
    id: snapshotId,
    timestamp: new Date().toISOString(),
    authorAgentId,
    description,
    files: backedUpFiles,
  };

  const manifest = loadManifest(workspacePath);
  manifest.snapshots.unshift(snapshotRecord); // Most recent first
  // Keep max 50 snapshots
  if (manifest.snapshots.length > 50) {
    const evicted = manifest.snapshots.splice(50);
    for (const oldSnap of evicted) {
      try {
        fs.rmSync(path.join(getSnapshotDir(workspacePath), oldSnap.id), { recursive: true, force: true });
      } catch {}
    }
  }

  saveManifest(workspacePath, manifest);
  return snapshotRecord;
}

/**
 * Lists all existing snapshots for the workspace
 */
function listSnapshots(workspacePath) {
  const manifest = loadManifest(workspacePath);
  return manifest.snapshots.map((s) => ({
    id: s.id,
    timestamp: s.timestamp,
    authorAgentId: s.authorAgentId,
    description: s.description,
    fileCount: s.files.length,
    files: s.files.map((f) => f.relativePath),
  }));
}

/**
 * Restores the workspace to the exact state captured in a snapshot.
 * @param {string} workspacePath Root of workspace
 * @param {string} snapshotId Snapshot identifier
 * @returns {object} Result of rollback
 */
function rollbackSnapshot(workspacePath, snapshotId) {
  const manifest = loadManifest(workspacePath);
  const snapshot = manifest.snapshots.find((s) => s.id === snapshotId);

  if (!snapshot) {
    throw new Error(`Snapshot with id "${snapshotId}" not found.`);
  }

  const snapshotFolder = path.join(getSnapshotDir(workspacePath), snapshot.id);
  const restoredFiles = [];

  for (const fileRecord of snapshot.files) {
    const targetPath = fileRecord.originalPath;

    if (fileRecord.existsBefore && fileRecord.backupFile) {
      // File existed: restore the content from backup
      const backupPath = path.join(snapshotFolder, fileRecord.backupFile);
      if (fs.existsSync(backupPath)) {
        fs.mkdirSync(path.dirname(targetPath), { recursive: true });
        fs.copyFileSync(backupPath, targetPath);
        restoredFiles.push(fileRecord.relativePath);
      }
    } else if (!fileRecord.existsBefore) {
      // File did not exist before mutation: delete the newly created file
      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        restoredFiles.push(`(deleted) ${fileRecord.relativePath}`);
      }
    }
  }

  return {
    ok: true,
    snapshotId,
    restoredCount: restoredFiles.length,
    restoredFiles,
  };
}

module.exports = {
  createSnapshot,
  listSnapshots,
  rollbackSnapshot,
  getSnapshotDir,
};
