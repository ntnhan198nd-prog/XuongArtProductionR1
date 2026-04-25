import { NextResponse } from "next/server";
import { getAdminPassword, setAdminSessionCookie } from "@/lib/adminAuth";

export async function POST(request) {
  try {
    const body = await request.json();
    const password = String(body?.password || "");
    const configuredPassword = getAdminPassword();

    if (!configuredPassword) {
      return NextResponse.json(
        { error: "ADMIN_PASSWORD is not configured in environment." },
        { status: 500 }
      );
    }

    if (password !== configuredPassword) {
      return NextResponse.json({ error: "Invalid password." }, { status: 401 });
    }

    const response = NextResponse.json({ ok: true });
    setAdminSessionCookie(response);
    return response;
  } catch (error) {
    return NextResponse.json({ error: "Failed to login." }, { status: 400 });
  }
}
