import "server-only";

// In-memory sliding-window rate limiter for /api/admin/login. Sufficient
// for a single Next instance — if this site ever scales to multiple
// concurrent serverless instances or regions we'd need a shared store
// (Upstash Redis, Cloudflare KV, etc.).
//
// Defaults: 5 failed attempts per IP per 5 minutes.
const WINDOW_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

// ip → { count: number, firstAt: number, lockedUntil: number | null }
const attempts = new Map();

function getEntry(ip) {
  const now = Date.now();
  const existing = attempts.get(ip);
  if (!existing) return null;
  // Reset the window once the oldest attempt has aged out.
  if (now - existing.firstAt > WINDOW_MS && (!existing.lockedUntil || existing.lockedUntil < now)) {
    attempts.delete(ip);
    return null;
  }
  return existing;
}

export function checkLoginAllowed(ip) {
  const entry = getEntry(ip);
  if (!entry) return { allowed: true };
  if (entry.lockedUntil && entry.lockedUntil > Date.now()) {
    const retryAfter = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    return { allowed: false, retryAfter };
  }
  return { allowed: true };
}

export function recordFailedLogin(ip) {
  const now = Date.now();
  const entry = attempts.get(ip);
  if (!entry || now - entry.firstAt > WINDOW_MS) {
    attempts.set(ip, { count: 1, firstAt: now, lockedUntil: null });
    return;
  }
  entry.count += 1;
  if (entry.count >= MAX_ATTEMPTS) {
    entry.lockedUntil = now + WINDOW_MS;
  }
}

export function resetLoginAttempts(ip) {
  attempts.delete(ip);
}

// Best-effort client IP extraction for rate-limit keying.
//
// SECURITY: the LEFT-most x-forwarded-for entry is fully client-controllable
// (the caller can send any value), so keying on it lets an attacker dodge the
// per-IP limit by rotating the header on every request. Prefer the trusted
// client-IP header written by our own edge — Cloudflare's cf-connecting-ip or
// the platform's x-real-ip — which the client cannot forge. Only as a last
// resort fall back to the RIGHT-most x-forwarded-for entry (the hop appended
// by our edge), never the left-most.
//
// NB: the in-memory `attempts` Map is per-instance, so on multi-lambda
// deploys (Vercel) this limiter is still best-effort; a shared store
// (Upstash/Cloudflare KV) is required for a hard cross-instance guarantee.
export function getClientIp(request) {
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim();

  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const parts = forwarded
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return "unknown";
}
