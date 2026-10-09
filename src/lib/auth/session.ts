import crypto from "node:crypto";

export const COOKIE_NAME = "studio_access";
export const SESSION_SALT = "_hermes_session_salt";
export const SESSION_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

export function getAuthConfig() {
  const username = (process.env.STUDIO_ADMIN_USER || "admin").trim();
  const password = (
    process.env.STUDIO_ADMIN_PASSWORD ||
    process.env.STUDIO_ACCESS_TOKEN ||
    ""
  ).trim();

  return {
    username: username || "admin",
    password,
    isAuthEnabled: Boolean(password),
  };
}

export function hashSessionToken(secret: string): string {
  if (!secret) return "";
  return crypto
    .createHash("sha256")
    .update(`${secret}${SESSION_SALT}`)
    .digest("hex");
}

function safeCompare(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

export function verifyCredentials(inputUser: string, inputPass: string): boolean {
  const { username, password, isAuthEnabled } = getAuthConfig();
  if (!isAuthEnabled) return true;

  const userMatches = safeCompare(inputUser.trim(), username);
  const passMatches = safeCompare(inputPass.trim(), password);

  return userMatches && passMatches;
}

export function isValidSessionCookie(cookieValue: string | undefined): boolean {
  const { password, isAuthEnabled } = getAuthConfig();
  if (!isAuthEnabled) return true;
  if (!cookieValue) return false;

  const expectedHash = hashSessionToken(password);
  // Allow either direct secret match (e.g. automated token) or hashed session token
  return safeCompare(cookieValue, password) || safeCompare(cookieValue, expectedHash);
}
