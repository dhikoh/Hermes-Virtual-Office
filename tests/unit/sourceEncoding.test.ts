import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

const MOJIBAKE_REGEX = /â€|ðŸ|âœ|â†|â€“|â€”|Ã[\x80-\xBF]|\uFFFD/;

function getFiles(dir: string, extensions: string[]): string[] {
  const result: string[] = [];
  if (!fs.existsSync(dir)) return result;

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "node_modules" && entry.name !== ".next" && entry.name !== ".git") {
        result.push(...getFiles(fullPath, extensions));
      }
    } else {
      const ext = path.extname(entry.name);
      if (extensions.includes(ext)) {
        result.push(fullPath);
      }
    }
  }
  return result;
}

describe("Source code encoding hygiene (WP1)", () => {
  const targetDirs = [
    path.join(process.cwd(), "server"),
    path.join(process.cwd(), "src"),
    path.join(process.cwd(), "scripts"),
  ];
  const extensions = [".js", ".mjs", ".ts", ".tsx", ".css", ".md"];
  const allFiles = targetDirs.flatMap((d) => getFiles(d, extensions));

  it("ensures no files have UTF-8 BOM or double-encoded mojibake", () => {
    const violations: { file: string; line: number; text: string; reason: string }[] = [];

    for (const filePath of allFiles) {
      const buffer = fs.readFileSync(filePath);
      // Check BOM
      if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
        violations.push({
          file: path.relative(process.cwd(), filePath),
          line: 1,
          text: "",
          reason: "File starts with UTF-8 BOM",
        });
      }

      const content = buffer.toString("utf8");
      const lines = content.split("\n");
      lines.forEach((line, index) => {
        if (MOJIBAKE_REGEX.test(line)) {
          violations.push({
            file: path.relative(process.cwd(), filePath),
            line: index + 1,
            text: line.trim(),
            reason: "Mojibake pattern detected",
          });
        }
      });
    }

    if (violations.length > 0) {
      const sample = violations
        .slice(0, 5)
        .map((v) => `${v.file}:${v.line} [${v.reason}] ${v.text}`)
        .join("\n");
      expect(
        violations,
        `Found ${violations.length} encoding violations in source files:\n${sample}`,
      ).toEqual([]);
    }
  });

  it("verifies ORCHESTRATOR_SYSTEM_PROMPT is clean and free of mojibake", () => {
    const adapterPath = path.join(process.cwd(), "server", "hermes-gateway-adapter.js");
    const adapterContent = fs.readFileSync(adapterPath, "utf8");
    const promptMatch = adapterContent.match(/const ORCHESTRATOR_SYSTEM_PROMPT = `([\s\S]*?)`;/);
    expect(promptMatch).toBeTruthy();
    const prompt = promptMatch![1];

    expect(MOJIBAKE_REGEX.test(prompt)).toBe(false);
    // Ensure all characters in system prompt are clean ASCII
    const nonAscii = prompt.match(/[^\x00-\x7F]/g);
    expect(
      nonAscii,
      `ORCHESTRATOR_SYSTEM_PROMPT contains non-ASCII characters: ${nonAscii ? nonAscii.join(", ") : ""}`,
    ).toBeNull();
  });
  it("verifies HERMES_BUILTIN_SKILLS in adapter match catalog skill keys with clean emojis", () => {
    const adapterPath = path.join(process.cwd(), "server", "hermes-gateway-adapter.js");
    const adapterContent = fs.readFileSync(adapterPath, "utf8");
    const match = adapterContent.match(/const HERMES_BUILTIN_SKILLS = (\[[\s\S]*?\n\]);/);
    expect(match).toBeTruthy();

    const skills = eval(match![1]);
    expect(skills.length).toBe(11);

    const catalogPath = path.join(process.cwd(), "src", "lib", "skills", "catalog.ts");
    const catalogContent = fs.readFileSync(catalogPath, "utf8");

    for (const skill of skills) {
      expect(catalogContent.includes(`skillKey: "${skill.skillKey}"`)).toBe(true);
      expect(skill.emoji).toBeTruthy();
      expect(MOJIBAKE_REGEX.test(skill.emoji)).toBe(false);
    }
  });

});
