const crypto = require("node:crypto");

const parseCookies = (header) => {
  const raw = typeof header === "string" ? header : "";
  if (!raw.trim()) return {};
  const out = {};
  for (const part of raw.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
};

/** Constant-time string comparison to prevent timing attacks. */
const safeCompare = (a, b) => {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) {
    // Compare against self to burn constant time, then return false
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
};

const SESSION_SALT = "_hermes_session_salt";
const hashSessionToken = (secret) => {
  if (!secret) return "";
  return crypto.createHash("sha256").update(`${secret}${SESSION_SALT}`).digest("hex");
};

/** Simple in-memory rate limiter for auth attempts. */
const createRateLimiter = (maxAttempts = 10, windowMs = 60_000) => {
  const attempts = new Map();
  const cleanup = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of attempts) {
      if (now - entry.start > windowMs) attempts.delete(key);
    }
  }, windowMs);
  cleanup.unref();

  return {
    isLimited(ip) {
      const entry = attempts.get(ip);
      if (!entry) return false;
      return entry.count >= maxAttempts;
    },
    recordFailure(ip) {
      const now = Date.now();
      const entry = attempts.get(ip);
      if (!entry || now - entry.start > windowMs) {
        attempts.set(ip, { count: 1, start: now });
        return;
      }
      entry.count++;
    },
    reset(ip) {
      attempts.delete(ip);
    },
  };
};

/**
 * Resolve client IP for rate limiting.
 * When TRUSTED_PROXY=1 is set, the first value of X-Forwarded-For is used.
 * Only set TRUSTED_PROXY=1 when this server sits behind a reverse proxy that
 * you control (nginx, Caddy, Vercel edge). Without it, X-Forwarded-For is
 * ignored to prevent spoofing by direct clients.
 */
const resolveClientIp = (req) => {
  if (process.env.TRUSTED_PROXY === "1") {
    const forwarded = req.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string") {
      const first = forwarded.split(",")[0]?.trim();
      if (first) return first;
    }
  }
  return req.socket?.remoteAddress || "unknown";
};

const isBypassPath = (url) => {
  const raw = typeof url === "string" ? url : "";
  const pathname = (raw.split("?")[0] || "/").toLowerCase();
  return (
    pathname === "/login" ||
    pathname.startsWith("/login/") ||
    pathname.startsWith("/api/auth/") ||
    pathname.startsWith("/_next/") ||
    pathname.startsWith("/assets/") ||
    pathname === "/favicon.ico"
  );
};

function createAccessGate(options) {
  const token = String(options?.token ?? "").trim();
  const sessionHash = hashSessionToken(token);
  const cookieName = String(options?.cookieName ?? "studio_access").trim() || "studio_access";
  const required = Boolean(options?.required);

  const enabled = Boolean(token) || required;
  const rateLimiter = createRateLimiter(10, 60_000);

  const getAuthState = (req) => {
    if (!enabled) return { authorized: true, limited: false };
    if (!token && required) return { authorized: false, limited: false };
    const ip = resolveClientIp(req);
    const cookieHeader = req.headers?.cookie;
    const cookies = parseCookies(cookieHeader);
    const cookieVal = cookies[cookieName] || "";
    const authorized = safeCompare(cookieVal, token) || safeCompare(cookieVal, sessionHash);
    if (authorized) {
      rateLimiter.reset(ip);
      return { authorized: true, limited: false };
    }
    if (rateLimiter.isLimited(ip)) {
      return { authorized: false, limited: true };
    }
    rateLimiter.recordFailure(ip);
    return { authorized: false, limited: rateLimiter.isLimited(ip) };
  };

  const handleHttp = (req, res) => {
    if (!enabled) return false;
    if (isBypassPath(req.url)) return false;

    const auth = getAuthState(req);
    if (!auth.authorized) {
      const pathname = String(req.url || "/").split("?")[0];
      const isApi = pathname.startsWith("/api/");
      const statusCode = auth.limited ? 429 : 401;

      if (isApi) {
        res.statusCode = statusCode;
        res.setHeader("Content-Type", "application/json");
        res.end(
          JSON.stringify({
            error: auth.limited
              ? "Too many failed studio access attempts. Wait a minute and retry."
              : "Studio access token required. Send the configured Studio access cookie and retry.",
          })
        );
        return true;
      }

      if (auth.limited) {
        res.statusCode = 429;
        res.setHeader("Content-Type", "text/plain");
        res.end("Too many failed studio access attempts. Wait a minute and retry.");
        return true;
      }

      // Seamless redirect to /login
      res.statusCode = 302;
      const target = encodeURIComponent(req.url || "/office");
      res.setHeader("Location", `/login?redirect=${target}`);
      res.end();
      return true;
    }
    return false;
  };

  const isSameOriginOrLocal = (req) => {
    const origin = req.headers?.origin;
    if (!origin) return true;
    try {
      const originUrl = new URL(origin);
      const hostHeader = req.headers?.host;
      if (hostHeader && originUrl.host.toLowerCase() === hostHeader.toLowerCase()) {
        return true;
      }
      if (
        originUrl.hostname === "localhost" ||
        originUrl.hostname === "127.0.0.1" ||
        originUrl.hostname === "::1"
      ) {
        return true;
      }
    } catch {
      return false;
    }
    return false;
  };

  const allowUpgrade = (req) => {
    if (!isSameOriginOrLocal(req)) return false;
    if (!enabled) return true;
    return getAuthState(req).authorized;
  };

  return { enabled, handleHttp, allowUpgrade };
}

module.exports = { createAccessGate };
