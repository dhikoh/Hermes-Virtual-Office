import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { listPackagedSkills } from "@/lib/skills/catalog";
import { readPackagedSkillFiles } from "@/lib/skills/packaged";

const req = createRequire(import.meta.url);
const { HERMES_BUILTIN_SKILLS } = req("../../server/hermes-gateway-adapter");

describe("Skill Registry Parity", () => {
  it("verifies adapter and catalog have exactly 11 skills with matching skillKey, name, and emoji", () => {
    expect(Array.isArray(HERMES_BUILTIN_SKILLS)).toBe(true);
    expect(HERMES_BUILTIN_SKILLS.length).toBe(11);

    const catalogSkills = listPackagedSkills();
    expect(catalogSkills.length).toBe(11);

    const adapterMap = new Map<string, { name: string; emoji?: string }>(
      HERMES_BUILTIN_SKILLS.map((s: { skillKey: string; name: string; emoji?: string }) => [
        s.skillKey,
        { name: s.name, emoji: s.emoji },
      ]),
    );

    const catalogMap = new Map<string, { name: string; emoji?: string }>(
      catalogSkills.map((s) => [s.skillKey, { name: s.name, emoji: s.emoji }]),
    );

    // Verify sets of skillKeys are identical
    const adapterKeys = Array.from(adapterMap.keys()).sort();
    const catalogKeys = Array.from(catalogMap.keys()).sort();
    expect(adapterKeys).toEqual(catalogKeys);

    // Verify name and emoji match for each skillKey
    for (const key of adapterKeys) {
      const adapterItem = adapterMap.get(key)!;
      const catalogItem = catalogMap.get(key)!;

      expect(catalogItem.name).toBe(adapterItem.name);
      expect(catalogItem.emoji).toBe(adapterItem.emoji);
      expect(catalogItem.emoji).toBeTruthy();
    }
  });

  it("verifies every skillKey has a corresponding folder and SKILL.md in assets/skills/", () => {
    const assetsDir = path.join(process.cwd(), "assets", "skills");
    expect(fs.existsSync(assetsDir)).toBe(true);

    const catalogSkills = listPackagedSkills();
    for (const skill of catalogSkills) {
      const skillFolder = path.join(assetsDir, skill.skillKey);
      expect(fs.existsSync(skillFolder)).toBe(true);
      expect(fs.statSync(skillFolder).isDirectory()).toBe(true);

      const skillMd = path.join(skillFolder, "SKILL.md");
      expect(fs.existsSync(skillMd)).toBe(true);
      expect(fs.statSync(skillMd).isFile()).toBe(true);
    }
  });

  it("verifies packaged.ts has files registered for each packageId", () => {
    const catalogSkills = listPackagedSkills();
    for (const skill of catalogSkills) {
      const files = readPackagedSkillFiles(skill.packageId);
      expect(files.length).toBeGreaterThan(0);
      const hasSkillMd = files.some((f) => f.relativePath === "SKILL.md");
      expect(hasSkillMd).toBe(true);
    }
  });
});
