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

// Best-effort client IP extraction. Vercel/Cloudflare set x-forwarded-for;
// fall back to the request's remote address otherwise. Uses the first IP
// in the chain since that's the original client (subsequent entries are
// trusted proxies).
export function getClientIp(request) {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const real = request.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}
