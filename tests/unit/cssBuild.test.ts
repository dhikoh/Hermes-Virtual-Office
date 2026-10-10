import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Regression: an arbitrary Tailwind variant like `[&::-webkit-details-marker]:hidden` once
// compiled to invalid CSS and broke the whole stylesheet, so no page could render.
// This runs the real PostCSS + Tailwind pipeline over globals.css and every source file.
describe("tailwind css pipeline", () => {
  it("compiles globals.css with no parse error", async () => {
    const root = path.resolve(__dirname, "../..");
    const css = fs.readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    const result = await postcss([tailwind({ base: root })]).process(css, {
      from: path.join(root, "src/app/globals.css"),
    });
    expect(result.css.length).toBeGreaterThan(1000);
    // Invalid escapes produced by the broken arbitrary variant.
    expect(result.css).not.toMatch(/\\\\4 /);
    expect(result.css).not.toMatch(/webkit-7/);
  });

  it("source uses no arbitrary [&::...] variants", () => {
    const srcRoot = path.resolve(__dirname, "../../src");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(tsx|ts)$/.test(entry.name) && /\[&::/.test(fs.readFileSync(full, "utf8"))) {
          offenders.push(full);
        }
      }
    };
    walk(srcRoot);
    expect(offenders).toEqual([]);
  });
});
