// @vitest-environment node

import { describe, expect, it, vi } from "vitest";

import { spawnSync } from "node:child_process";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>(
    "node:child_process"
  );
  return {
    default: actual,
    ...actual,
    spawnSync: vi.fn(),
  };
});

import { escapePosixShellArg, runSshJson } from "@/lib/ssh/gateway-host";

const mockedSpawnSync = vi.mocked(spawnSync);

describe("escapePosixShellArg", () => {
  it("wraps empty strings in single quotes", () => {
    expect(escapePosixShellArg("")).toBe("''");
  });

  it("safely escapes shell metacharacters and single quotes", () => {
    expect(escapePosixShellArg("foo; rm -rf /")).toBe("'foo; rm -rf /'");
    expect(escapePosixShellArg("it's cool")).toBe("'it'\\''s cool'");
    expect(escapePosixShellArg("$(whoami)")).toBe("'$(whoami)'");
  });
});

describe("runSshJson", () => {
  it("escapes all argv elements passed to ssh to prevent command injection", () => {
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({ ok: true }),
      stderr: "",
      error: undefined,
    } as never);

    runSshJson({
      sshTarget: "user@host.test",
      argv: ["bash", "-s", "--", "evil; rm -rf /", "$(cat /etc/passwd)"],
      label: "escape-test",
    });

    const [, args] = mockedSpawnSync.mock.calls[0] as [string, string[]];
    expect(args).toContain("bash");
    expect(args).toContain("-s");
    expect(args).toContain("--");
    expect(args).toContain("'evil; rm -rf /'");
    expect(args).toContain("'$(cat /etc/passwd)'");
  });

  it("forwards maxBuffer to spawnSync when provided", () => {
    mockedSpawnSync.mockClear();
    mockedSpawnSync.mockReturnValueOnce({
      status: 0,
      stdout: JSON.stringify({ ok: true }),
      stderr: "",
      error: undefined,
    } as never);

    runSshJson({
      sshTarget: "me@example.test",
      argv: ["bash", "-lc", "echo ok"],
      label: "ssh-json-test",
      input: "echo hello",
      maxBuffer: 12345,
    } as unknown as Parameters<typeof runSshJson>[0]);

    expect(mockedSpawnSync).toHaveBeenCalledTimes(1);
    const [, , options] = mockedSpawnSync.mock.calls[0] as [
      string,
      string[],
      { encoding?: string; input?: string; maxBuffer?: number },
    ];
    expect(options.maxBuffer).toBe(12345);
  });
});
