#!/usr/bin/env node

/**
 * CLI tool: Hermes 1-Click Brain Export
 * Usage:
 *   node scripts/brain-export.mjs [output-archive-path]
 *   npm run brain:export
 */

import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createBrainArchive } = require("../server/system/brain-manager.js");

const workspaceDir = process.cwd();
const customOutput = process.argv[2] ? path.resolve(process.argv[2]) : null;

console.log("\n📦 [Hermes Brain Export] Starting 1-Click AI Brain backup...");
console.log(`   Workspace: ${workspaceDir}`);

try {
  const result = await Promise.resolve(createBrainArchive(workspaceDir, customOutput));
  const mb = (result.archiveSize / (1024 * 1024)).toFixed(2);
  const kb = (result.archiveSize / 1024).toFixed(1);
  const displaySize = result.archiveSize > 1024 * 1024 ? `${mb} MB` : `${kb} KB`;

  console.log("\n✅ [Hermes Brain Export] Success!");
  console.log(`   Archive:     ${result.archivePath}`);
  console.log(`   Files:       ${result.fileCount} items packaged`);
  console.log(`   Raw Data:    ${(result.totalBytes / 1024).toFixed(1)} KB`);
  console.log(`   Gzip Size:   ${displaySize}`);
  console.log("\n💡 Pindahkan file arsip ini ke VPS baru, lalu jalankan:");
  console.log(`   npm run brain:import ${path.basename(result.archivePath)}\n`);
} catch (err) {
  console.error("\n❌ [Hermes Brain Export] Failed:", err.message);
  process.exit(1);
}
