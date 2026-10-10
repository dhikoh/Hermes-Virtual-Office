import { describe, expect, it } from "vitest";

import {
  isPrivateOrLoopbackHostname,
  validateBrowserPreviewTarget,
} from "@/lib/security/urlSafety";

describe("urlSafety helpers", () => {
  it("detects standard IPv4 loopback and private networks", () => {
    expect(isPrivateOrLoopbackHostname("localhost")).toBe(true);
    expect(isPrivateOrLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackHostname("192.168.1.1")).toBe(true);
    expect(isPrivateOrLoopbackHostname("10.0.0.1")).toBe(true);
    expect(isPrivateOrLoopbackHostname("172.16.0.1")).toBe(true);
    expect(isPrivateOrLoopbackHostname("example.com")).toBe(false);
  });

  it("detects IPv6 loopback with and without brackets", () => {
    expect(isPrivateOrLoopbackHostname("::1")).toBe(true);
    expect(isPrivateOrLoopbackHostname("[::1]")).toBe(true);
    expect(isPrivateOrLoopbackHostname("::")).toBe(true);
    expect(isPrivateOrLoopbackHostname("[::]")).toBe(true);
    expect(isPrivateOrLoopbackHostname("fe80::1")).toBe(true);
    expect(isPrivateOrLoopbackHostname("[fe80::1]")).toBe(true);
    expect(isPrivateOrLoopbackHostname("fc00::1")).toBe(true);
    expect(isPrivateOrLoopbackHostname("[fc00::1]")).toBe(true);
  });

  it("rejects browser preview targets targeting loopback IPv6", () => {
    expect(() => validateBrowserPreviewTarget("http://[::1]:8080/secret")).toThrow(
      "Browser preview does not allow loopback or private-network targets."
    );
    expect(() => validateBrowserPreviewTarget("http://127.0.0.1:3000/")).toThrow(
      "Browser preview does not allow loopback or private-network targets."
    );
  });
});
