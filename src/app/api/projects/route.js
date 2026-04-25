import { NextResponse } from "next/server";
import { readStore, serializeProject, sortByOrderThenId } from "@/lib/contentStore";

export const revalidate = 0;

export async function GET(request) {
  try {
    const requestUrl = new URL(request.url);
    const projectType = requestUrl.searchParams.get("type");
    const store = await readStore();

    let projects = sortByOrderThenId(store.projects || []);

    if (projectType === "featured") {
      projects = projects.filter((project) => Boolean(project.featured));
    } else if (projectType === "general") {
      projects = projects.filter((project) => !project.featured);
    }

    return NextResponse.json({
      data: projects.map((project) => serializeProject(project)),
      meta: {
        pagination: {
          page: 1,
          pageSize: projects.length,
          pageCount: 1,
          total: projects.length,
        },
      },
    });
  } catch (error) {
    console.error("Error fetching projects:", error);
    return NextResponse.json({ error: "Failed to fetch projects" }, { status: 500 });
  }
}
