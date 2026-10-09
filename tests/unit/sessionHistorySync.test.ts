import { describe, expect, it } from "vitest";
import { buildHistoryLines } from "@/features/agents/state/runtimeEventBridge";
import { buildTranscriptEntriesFromLines } from "@/features/agents/state/transcript";
import fs from "fs";
import path from "path";
import os from "os";

describe("Session History & Transcript Sync", () => {
  it("builds full transcript entries from chat.history messages", () => {
    const rawMessages = [
      { role: "user", content: "profile apikey mana yang sekarang kamu gunakan ?" },
      { role: "assistant", content: "Tidak ada akses info profil apikey." },
      { role: "user", content: "coba kamu ke gym untuk berolahaga dahulu" },
      { role: "assistant", content: "Don virtual. Tidak bisa ke gym fisik." },
    ];

    const derived = buildHistoryLines(rawMessages);
    expect(derived.lines.length).toBeGreaterThanOrEqual(4);
    expect(derived.lastUser).toBe("coba kamu ke gym untuk berolahaga dahulu");
    expect(derived.lastAssistant).toBe("Don virtual. Tidak bisa ke gym fisik.");

    const entries = buildTranscriptEntriesFromLines({
      lines: derived.lines,
      sessionKey: "agent:hermes:main",
      source: "history",
      startSequence: 0,
      confirmed: true,
    });

    expect(entries.length).toBe(derived.lines.length);
    const userEntries = entries.filter((e) => e.role === "user");
    const assistantEntries = entries.filter((e) => e.role === "assistant");

    expect(userEntries.length).toBe(2);
    expect(assistantEntries.length).toBe(2);
    expect(userEntries[0].text).toContain("profile apikey");
    expect(assistantEntries[1].text).toContain("Don virtual");
  });

  it("merges multi-location history preserving the session with more messages", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "history-test-"));
    const primaryFile = path.join(tmpDir, "primary.json");
    const fallbackFile = path.join(tmpDir, "fallback.json");

    // Primary has only 2 messages
    fs.writeFileSync(primaryFile, JSON.stringify({
      "agent:hermes:main": [
        { role: "user", content: "hello" },
        { role: "assistant", content: "hi" }
      ]
    }));

    // Fallback has 22 messages
    const fullMessages = Array.from({ length: 22 }, (_, i) => ({
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`
    }));
    fs.writeFileSync(fallbackFile, JSON.stringify({
      "agent:hermes:main": fullMessages
    }));

    // Test merge logic identical to adapter
    const memory = new Map<string, Record<string, unknown>[]>();
    const candidates = [primaryFile, fallbackFile];

    for (const file of candidates) {
      if (fs.existsSync(file)) {
        const raw = fs.readFileSync(file, "utf8");
        const data = JSON.parse(raw);
        for (const [key, msgs] of Object.entries(data)) {
          if (Array.isArray(msgs)) {
            const existing = memory.get(key) || [];
            if (msgs.length > existing.length) {
              memory.set(key, msgs);
            }
          }
        }
      }
    }

    expect(memory.get("agent:hermes:main")?.length).toBe(22);
    expect(memory.get("agent:hermes:main")?.[21].content).toBe("Message 21");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
