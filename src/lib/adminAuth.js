import "server-only";
import crypto from "node:crypto";

export const ADMIN_COOKIE_NAME = "xuongart_admin_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

// Distinct env var so rotating ADMIN_PASSWORD does not silently invalidate
// existing sessions, and so a missing/leaked password never becomes the
// signing secret. We require this to be set explicitly — there is no
// hardcoded fallback because that would let any deploy with a missing env
// sign forgeable session cookies.
function getSigningSecret() {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error(
      "ADMIN_SESSION_SECRET is not configured (or is too short). Set it to a random 32+ character string in your environment."
    );
  }
  return secret;
}

export function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || "";
}

function toBase64Url(value) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function fromBase64Url(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function signPayload(payloadB64) {
  return crypto
    .createHmac("sha256", getSigningSecret())
    .update(payloadB64)
    .digest("base64url");
}

export function createAdminSessionToken() {
  const payload = {
    iat: Date.now(),
    v: 1,
  };
  const payloadB64 = toBase64Url(JSON.stringify(payload));
  const signature = signPayload(payloadB64);
  return `${payloadB64}.${signature}`;
}

export function verifyAdminSessionToken(token) {
  if (!token) return false;
  // Token must be exactly two parts separated by a single dot. split with
  // limit lets us reject extra dots cleanly.
  const parts = token.split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, signature] = parts;
  if (!payloadB64 || !signature) return false;

  let expected;
  try {
    expected = signPayload(payloadB64);
  } catch {
    // ADMIN_SESSION_SECRET missing: never allow a session to validate.
    return false;
  }

  // Both inputs are ASCII (base64url alphabet); explicit "ascii" encoding
  // makes the byte-equal comparison unambiguous regardless of locale.
  const signatureBuffer = Buffer.from(signature, "ascii");
  const expectedBuffer = Buffer.from(expected, "ascii");
  if (signatureBuffer.length !== expectedBuffer.length) return false;
  if (!crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return false;
  }

  try {
    const payload = JSON.parse(fromBase64Url(payloadB64));
    if (!payload?.iat) return false;
    return Date.now() - Number(payload.iat) <= SESSION_TTL_MS;
  } catch {
    return false;
  }
}

export function isAdminAuthenticated(request) {
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  return verifyAdminSessionToken(token);
}

// sameSite "strict" so admin cookies are never sent on cross-site requests.
// Admin UI is fully same-origin (/admin on the same host), so strict is
// safe and protects against CSRF without an explicit token.
export function setAdminSessionCookie(response) {
  response.cookies.set(ADMIN_COOKIE_NAME, createAdminSessionToken(), {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.floor(SESSION_TTL_MS / 1000),
  });
}

export function clearAdminSessionCookie(response) {
  response.cookies.set(ADMIN_COOKIE_NAME, "", {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
}
