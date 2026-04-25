import { NextResponse } from "next/server";
import { readStore, serializeImageProject, sortByOrderThenId } from "@/lib/contentStore";

export const revalidate = 0;

export async function GET() {
  try {
    const store = await readStore();
    const imageProjects = sortByOrderThenId(store.imageProjects || []);

    return NextResponse.json({
      data: imageProjects.map((project) => serializeImageProject(project)),
      meta: {
        pagination: {
          page: 1,
          pageSize: imageProjects.length,
          pageCount: 1,
          total: imageProjects.length,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching image projects:", error);
    return NextResponse.json(
      { error: "Failed to fetch image projects" },
      { status: 500 }
    );
  }
}
