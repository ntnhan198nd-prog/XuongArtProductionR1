import { NextResponse } from "next/server";
import { isAdminAuthenticated } from "@/lib/adminAuth";

export async function GET(request) {
  return NextResponse.json({ authenticated: isAdminAuthenticated(request) });
}
