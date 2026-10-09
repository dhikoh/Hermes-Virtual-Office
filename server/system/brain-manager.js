/**
 * Hermes 1-Click Brain Migration Engine (Option 1)
 *
 * Packages and restores the entire AI state:
 * - _AI/ (Research notes, plans, adr, browser profiles, cookies, sessions)
 * - .hermes/ (Chat history, tasks, snapshots, configurations)
 * - Core memory files (MEMORY.md, USER.md, SOUL.md, IDENTITY.md, api_providers.json)
 *
 * Implements self-contained, streaming POSIX/GNU TAR + GZIP (.tar.gz)
 * with zero external dependencies, 100% portable across Linux, Windows, macOS, and Docker.
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const CORE_FILES = [
  "MEMORY.md",
  "USER.md",
  "SOUL.md",
  "IDENTITY.md",
  "AGENTS.md",
  "HEARTBEAT.md",
  "TOOLS.md",
  "api_providers.json",
];

const CORE_DIRS = [
  "_AI",
  ".hermes",
];

function sanitizeTarPath(p) {
  return p.replace(/\\/g, "/").replace(/^\/+/, "");
}

function createTarHeader(name, size, typeflag = "0", mode = 0o644) {
  const buf = Buffer.alloc(512);
  let nameBuf = Buffer.from(name, "utf8");
  if (nameBuf.length > 100) {
    nameBuf = nameBuf.subarray(0, 100);
  }
  nameBuf.copy(buf, 0);

  buf.write(mode.toString(8).padStart(6, "0") + " \0", 100, 8, "ascii");
  buf.write("0000000\0", 108, 8, "ascii");
  buf.write("0000000\0", 116, 8, "ascii");
  buf.write(size.toString(8).padStart(11, "0") + " ", 124, 12, "ascii");
  const mtime = Math.floor(Date.now() / 1000);
  buf.write(mtime.toString(8).padStart(11, "0") + " ", 136, 12, "ascii");
  buf.write("        ", 148, 8, "ascii"); // Checksum placeholder
  buf.write(typeflag, 156, 1, "ascii");
  buf.write("ustar\0", 257, 6, "ascii");
  buf.write("00", 263, 2, "ascii");

  let sum = 0;
  for (let i = 0; i < 512; i++) {
    sum += buf[i];
  }
  buf.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return buf;
}

function createLongLinkRecord(longName) {
  const nameBuf = Buffer.from(longName + "\0", "utf8");
  const header = createTarHeader("././@LongLink", nameBuf.length, "L", 0o644);
  const padLen = (512 - (nameBuf.length % 512)) % 512;
  const padding = Buffer.alloc(padLen);
  return Buffer.concat([header, nameBuf, padding]);
}

function packFileEntry(relPath, contentBuf) {
  const chunks = [];
  const normalizedPath = sanitizeTarPath(relPath);

  if (Buffer.byteLength(normalizedPath, "utf8") > 100) {
    chunks.push(createLongLinkRecord(normalizedPath));
  }

  const header = createTarHeader(normalizedPath, contentBuf.length, "0", 0o644);
  chunks.push(header);
  chunks.push(contentBuf);

  const padLen = (512 - (contentBuf.length % 512)) % 512;
  if (padLen > 0) {
    chunks.push(Buffer.alloc(padLen));
  }

  return Buffer.concat(chunks);
}

function packDirEntry(relPath) {
  let normalizedPath = sanitizeTarPath(relPath);
  if (!normalizedPath.endsWith("/")) normalizedPath += "/";

  const chunks = [];
  if (Buffer.byteLength(normalizedPath, "utf8") > 100) {
    chunks.push(createLongLinkRecord(normalizedPath));
  }

  const header = createTarHeader(normalizedPath, 0, "5", 0o755);
  chunks.push(header);
  return Buffer.concat(chunks);
}

function collectWorkspaceFiles(workspaceDir) {
  const entries = [];

  // 1. Core single files
  for (const filename of CORE_FILES) {
    const filePath = path.join(workspaceDir, filename);
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      entries.push({
        relPath: filename,
        absPath: filePath,
        isDir: false,
      });
    }
  }

  // 2. Core directories recursively
  for (const dirName of CORE_DIRS) {
    const dirPath = path.join(workspaceDir, dirName);
    if (fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory()) {
      walkDir(dirPath, workspaceDir, entries);
    }
  }

  return entries;
}

function walkDir(currentDir, baseDir, entries) {
  const items = fs.readdirSync(currentDir, { withFileTypes: true });
  const relDir = path.relative(baseDir, currentDir);
  if (relDir && relDir !== ".") {
    entries.push({
      relPath: relDir,
      absPath: currentDir,
      isDir: true,
    });
  }

  for (const item of items) {
    const itemPath = path.join(currentDir, item.name);
    // Ignore socket files or temporary lock files
    if (item.name.endsWith(".sock") || item.name.endsWith(".lock")) {
      continue;
    }
    if (item.isDirectory()) {
      walkDir(itemPath, baseDir, entries);
    } else if (item.isFile()) {
      const relPath = path.relative(baseDir, itemPath);
      entries.push({
        relPath,
        absPath: itemPath,
        isDir: false,
      });
    }
  }
}

/**
 * Creates a .tar.gz archive of the workspace brain
 */
function createBrainArchive(workspaceDir, outputPath = null, _options = {}) {
  const ws = path.resolve(workspaceDir);
  if (!fs.existsSync(ws)) {
    throw new Error(`Workspace path does not exist: ${ws}`);
  }

  const entries = collectWorkspaceFiles(ws);
  const tarChunks = [];
  const manifest = {
    version: "1.0",
    created: new Date().toISOString(),
    engine: "Hermes3D 1-Click Migration Engine",
    filesCount: 0,
    totalBytes: 0,
    files: [],
  };

  // Sort entries: directories first, then files alphabetically
  entries.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1;
    if (!a.isDir && b.isDir) return 1;
    return a.relPath.localeCompare(b.relPath);
  });

  for (const entry of entries) {
    if (entry.isDir) {
      tarChunks.push(packDirEntry(entry.relPath));
    } else {
      const content = fs.readFileSync(entry.absPath);
      tarChunks.push(packFileEntry(entry.relPath, content));
      manifest.filesCount++;
      manifest.totalBytes += content.length;
      manifest.files.push({
        path: sanitizeTarPath(entry.relPath),
        size: content.length,
      });
    }
  }

  // Include manifest.json in the archive root
  const manifestBuf = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  tarChunks.push(packFileEntry("manifest.json", manifestBuf));

  // End of archive: two 512-byte zero blocks
  tarChunks.push(Buffer.alloc(1024));

  const tarBuffer = Buffer.concat(tarChunks);
  const compressedGzip = zlib.gzipSync(tarBuffer, { level: 9 });

  const finalOutput = outputPath
    ? path.resolve(outputPath)
    : path.join(ws, `hermes-brain-${new Date().toISOString().replace(/[:.]/g, "-")}.tar.gz`);

  fs.mkdirSync(path.dirname(finalOutput), { recursive: true });
  fs.writeFileSync(finalOutput, compressedGzip);

  return {
    archivePath: finalOutput,
    fileCount: manifest.filesCount,
    totalBytes: manifest.totalBytes,
    archiveSize: compressedGzip.length,
    manifest,
  };
}

/**
 * Parses and extracts a .tar.gz brain archive
 */
function unpackTarGz(archiveBuffer, targetWorkspaceDir) {
  const tarBuffer = zlib.gunzipSync(archiveBuffer);
  let offset = 0;
  let nextLongName = null;
  const restoredFiles = [];
  const targetDir = path.resolve(targetWorkspaceDir);

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    offset += 512;

    // Check for two consecutive empty blocks (EOF)
    let isAllZeroes = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isAllZeroes = false;
        break;
      }
    }
    if (isAllZeroes) {
      break;
    }

    // Read header fields
    const rawName = nextLongName || header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "").trim();
    nextLongName = null;

    const sizeStr = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);

    const dataPad = (512 - (size % 512)) % 512;
    const dataEnd = offset + size;

    if (typeflag === "L") {
      // Long name record
      const longNameData = tarBuffer.subarray(offset, offset + size).toString("utf8").replace(/\0.*$/, "");
      nextLongName = longNameData;
      offset = dataEnd + dataPad;
      continue;
    }

    const entryPath = sanitizeTarPath(rawName);

    // SECURITY: Reject path traversal attacks
    if (
      entryPath.includes("..") ||
      entryPath.startsWith("/") ||
      path.isAbsolute(entryPath)
    ) {
      throw new Error(`Security Violation: Malicious path detected in archive: ${entryPath}`);
    }

    if (typeflag === "5" || entryPath.endsWith("/")) {
      // Directory entry
      const fullDir = path.join(targetDir, entryPath);
      fs.mkdirSync(fullDir, { recursive: true });
      offset = dataEnd + dataPad;
      continue;
    }

    // File entry
    const fileContent = tarBuffer.subarray(offset, offset + size);
    offset = dataEnd + dataPad;

    const destPath = path.join(targetDir, entryPath);
    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    fs.writeFileSync(destPath, fileContent);

    restoredFiles.push({
      path: entryPath,
      size,
    });
  }

  return restoredFiles;
}

/**
 * Restores a brain archive into the workspace
 */
function restoreBrainArchive(archivePath, targetWorkspaceDir) {
  const absArchivePath = path.resolve(archivePath);
  if (!fs.existsSync(absArchivePath)) {
    throw new Error(`Brain archive not found: ${absArchivePath}`);
  }

  const archiveBuffer = fs.readFileSync(absArchivePath);
  const targetDir = path.resolve(targetWorkspaceDir);
  fs.mkdirSync(targetDir, { recursive: true });

  const restored = unpackTarGz(archiveBuffer, targetDir);

  let manifest = null;
  const manifestPath = path.join(targetDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    } catch {
      // Ignore if manifest corrupt
    }
  }

  return {
    targetDir,
    restoredFiles: restored,
    fileCount: restored.filter((f) => f.path !== "manifest.json").length,
    totalBytes: restored.reduce((acc, f) => acc + (f.path !== "manifest.json" ? f.size : 0), 0),
    manifest,
  };
}

/**
 * Inspects a brain archive without writing to disk
 */
function inspectBrainArchive(archivePath) {
  const absArchivePath = path.resolve(archivePath);
  if (!fs.existsSync(absArchivePath)) {
    throw new Error(`Brain archive not found: ${absArchivePath}`);
  }

  const archiveBuffer = fs.readFileSync(absArchivePath);
  const tarBuffer = zlib.gunzipSync(archiveBuffer);

  let offset = 0;
  let nextLongName = null;
  const entries = [];
  let manifest = null;

  while (offset + 512 <= tarBuffer.length) {
    const header = tarBuffer.subarray(offset, offset + 512);
    offset += 512;

    let isAllZeroes = true;
    for (let i = 0; i < 512; i++) {
      if (header[i] !== 0) {
        isAllZeroes = false;
        break;
      }
    }
    if (isAllZeroes) break;

    const rawName = nextLongName || header.subarray(0, 100).toString("utf8").replace(/\0.*$/, "").trim();
    nextLongName = null;

    const sizeStr = header.subarray(124, 136).toString("ascii").replace(/\0.*$/, "").trim();
    const size = parseInt(sizeStr, 8) || 0;
    const typeflag = String.fromCharCode(header[156]);

    const dataPad = (512 - (size % 512)) % 512;
    const dataEnd = offset + size;

    if (typeflag === "L") {
      const longNameData = tarBuffer.subarray(offset, offset + size).toString("utf8").replace(/\0.*$/, "");
      nextLongName = longNameData;
      offset = dataEnd + dataPad;
      continue;
    }

    const entryPath = sanitizeTarPath(rawName);
    if (entryPath === "manifest.json") {
      try {
        manifest = JSON.parse(tarBuffer.subarray(offset, offset + size).toString("utf8"));
      } catch {}
    }

    entries.push({
      path: entryPath,
      size,
      isDir: typeflag === "5" || entryPath.endsWith("/"),
    });

    offset = dataEnd + dataPad;
  }

  return {
    archivePath: absArchivePath,
    entries,
    manifest,
  };
}

/**
 * Returns current brain status & inventory
 */
function getBrainStatus(workspaceDir) {
  const ws = path.resolve(workspaceDir);
  const entries = collectWorkspaceFiles(ws);

  const filesOnly = entries.filter((e) => !e.isDir);
  const totalBytes = filesOnly.reduce((acc, f) => {
    try {
      return acc + fs.statSync(f.absPath).size;
    } catch {
      return acc;
    }
  }, 0);

  const researchFiles = filesOnly.filter((f) => f.relPath.startsWith("_AI/research") || f.relPath.startsWith("_AI\\research")).length;
  const planFiles = filesOnly.filter((f) => f.relPath.startsWith("_AI/plans") || f.relPath.startsWith("_AI\\plans")).length;
  const historyFiles = filesOnly.filter((f) => f.relPath.includes(".hermes") && f.relPath.includes("history")).length;
  const hasMemory = fs.existsSync(path.join(ws, "MEMORY.md"));
  const hasUser = fs.existsSync(path.join(ws, "USER.md"));
  const hasSoul = fs.existsSync(path.join(ws, "SOUL.md"));

  return {
    workspaceDir: ws,
    totalFiles: filesOnly.length,
    totalBytes,
    categories: {
      research: researchFiles,
      plans: planFiles,
      history: historyFiles,
      memory: {
        hasMemory,
        hasUser,
        hasSoul,
      },
    },
  };
}

module.exports = {
  createBrainArchive,
  restoreBrainArchive,
  inspectBrainArchive,
  getBrainStatus,
  sanitizeTarPath,
  unpackTarGz,
};
