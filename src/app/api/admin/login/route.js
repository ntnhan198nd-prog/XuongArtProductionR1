import { NextResponse } from "next/server";
import { getAdminPassword, setAdminSessionCookie } from "@/lib/adminAuth";
import {
  LOCKOUT_SECONDS,
  checkLoginAllowed,
  getClientIp,
  recordFailedLogin,
  resetLoginAttempts,
  retryAfterMinutes,
} from "@/lib/loginRateLimit";

// Single 401 response for a wrong password AND for a missing
// ADMIN_PASSWORD. The original handler returned 500 when ADMIN_PASSWORD
// was unset, leaking deploy state to anyone hitting the endpoint.
// The message is shown as-is on the login form.
function loginFailed() {
  return NextResponse.json(
    { error: "Sai mật khẩu." },
    { status: 401 }
  );
}

export async function POST(request) {
  const ip = getClientIp(request);

  const allowed = checkLoginAllowed(ip);
  if (!allowed.allowed) {
    const retryAfter = allowed.retryAfter || LOCKOUT_SECONDS;
    return NextResponse.json(
      {
        error: `Bạn nhập sai quá nhiều lần. Thử lại sau ${retryAfterMinutes(retryAfter)} phút.`,
        retryAfter,
      },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfter) },
      }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu đăng nhập không hợp lệ." }, { status: 400 });
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
