#!/usr/bin/env node

/**
 * CLI tool: Hermes 1-Click Brain Import / Restore
 * Usage:
 *   node scripts/brain-import.mjs <archive-path> [target-dir]
 *   npm run brain:import <archive-path>
 */

import path from "node:path";
import process from "node:process";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { restoreBrainArchive } = require("../server/system/brain-manager.js");

const archiveArg = process.argv[2];
if (!archiveArg) {
  console.error("\n❌ [Hermes Brain Import] Missing argument.");
  console.log("   Usage: npm run brain:import <path-to-hermes-brain.tar.gz>\n");
  process.exit(1);
}

const archivePath = path.resolve(archiveArg);
const targetDir = process.argv[3] ? path.resolve(process.argv[3]) : process.cwd();

console.log("\n🔄 [Hermes Brain Import] Starting restoration...");
console.log(`   Archive: ${archivePath}`);
console.log(`   Target:  ${targetDir}`);

try {
  const result = await Promise.resolve(restoreBrainArchive(archivePath, targetDir));
  console.log("\n✅ [Hermes Brain Import] Success!");
  console.log(`   Restored: ${result.fileCount} files`);
  console.log(`   Total:    ${(result.totalBytes / 1024).toFixed(1)} KB`);
  if (result.manifest) {
    console.log(`   Engine:   ${result.manifest.engine || "Hermes3D"}`);
    console.log(`   Created:  ${result.manifest.created || "N/A"}`);
  }
  console.log("\n💡 Seluruh memori, catatan riset, dan sesi browser telah dipulihkan ke workspace ini.\n");
} catch (err) {
  console.error("\n❌ [Hermes Brain Import] Restoration failed:", err.message);
  process.exit(1);
}
