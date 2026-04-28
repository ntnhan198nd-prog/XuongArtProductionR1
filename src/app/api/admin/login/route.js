import { NextResponse } from "next/server";
import { getAdminPassword, setAdminSessionCookie } from "@/lib/adminAuth";
import {
  checkLoginAllowed,
  getClientIp,
  recordFailedLogin,
  resetLoginAttempts,
} from "@/lib/loginRateLimit";

// Single 401 response for any failure (wrong password, missing config,
// rate-limited). The original handler returned 500 when ADMIN_PASSWORD
// was unset, leaking deploy state to anyone hitting the endpoint.
function loginFailed() {
  return NextResponse.json(
    { error: "Invalid credentials." },
    { status: 401 }
  );
}

export async function POST(request) {
  const ip = getClientIp(request);

  const allowed = checkLoginAllowed(ip);
  if (!allowed.allowed) {
    return NextResponse.json(
      { error: "Too many login attempts. Please try again later." },
      {
        status: 429,
        headers: { "Retry-After": String(allowed.retryAfter || 300) },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const password = String(body?.password || "");
  const configuredPassword = getAdminPassword();

  if (!configuredPassword) {
    // Treat as a failed login from the client's perspective so a
    // misconfigured deploy is indistinguishable from a wrong password.
    // The deploy operator should rely on check-env, not on probing the
    // login endpoint, to discover this.
    recordFailedLogin(ip);
    return loginFailed();
  }

  if (password !== configuredPassword) {
    recordFailedLogin(ip);
    return loginFailed();
  }

  resetLoginAttempts(ip);
  const response = NextResponse.json({ ok: true });
  setAdminSessionCookie(response);
  return response;
}
