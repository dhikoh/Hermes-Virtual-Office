// @vitest-environment node

import { describe, expect, it } from "vitest";
import {
  hashSessionToken,
  isValidSessionCookie,
  verifyCredentials,
} from "../../src/lib/auth/session";

describe("Auth Session", () => {
  it("hashes session token consistently", () => {
    const hash1 = hashSessionToken("secret123");
    const hash2 = hashSessionToken("secret123");
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string
  });

  it("verifies credentials correctly with environment variables", () => {
    process.env.STUDIO_ADMIN_USER = "dhiko";
    process.env.STUDIO_ADMIN_PASSWORD = "supersecretpassword";

    expect(verifyCredentials("dhiko", "supersecretpassword")).toBe(true);
    expect(verifyCredentials("wronguser", "supersecretpassword")).toBe(false);
    expect(verifyCredentials("dhiko", "wrongpassword")).toBe(false);
  });

  it("validates session cookie matching both raw token and session hash", () => {
    process.env.STUDIO_ADMIN_USER = "admin";
    process.env.STUDIO_ADMIN_PASSWORD = "secret_pass_token";

    const hash = hashSessionToken("secret_pass_token");

    expect(isValidSessionCookie("secret_pass_token")).toBe(true);
    expect(isValidSessionCookie(hash)).toBe(true);
    expect(isValidSessionCookie("invalid_token")).toBe(false);
    expect(isValidSessionCookie(undefined)).toBe(false);
  });

  it("allows all when auth is not configured", () => {
    delete process.env.STUDIO_ADMIN_PASSWORD;
    delete process.env.STUDIO_ACCESS_TOKEN;

    expect(verifyCredentials("any", "any")).toBe(true);
    expect(isValidSessionCookie("any")).toBe(true);
  });
});
