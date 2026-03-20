import { type NextRequest, NextResponse } from "next/server";
import { searchVideos } from "@/lib/youtube/api";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q");
  const pageToken = searchParams.get("pageToken");

  if (!query) {
    return NextResponse.json(
      { error: "Query parameter 'q' is required" },
      { status: 400 }
    );
  }

  if (query.length < 2) {
    return NextResponse.json(
      { error: "Query must be at least 2 characters" },
      { status: 400 }
    );
  }

  const result = await searchVideos(query, pageToken || undefined);

  return NextResponse.json(result);
}
