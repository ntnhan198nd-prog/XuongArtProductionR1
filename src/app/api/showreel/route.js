import { NextResponse } from "next/server";
import { readStore } from "@/lib/contentStore";

export const revalidate = 0;

export async function GET() {
  try {
    const store = await readStore();
    return NextResponse.json({ data: store.showreel || null });
  } catch (error) {
    console.error("Fetch showreel failed:", error);
    return NextResponse.json({ data: null });
  }
}
