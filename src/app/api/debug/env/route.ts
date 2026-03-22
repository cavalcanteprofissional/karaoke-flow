import { NextResponse } from "next/server";

export async function GET() {
  const youtubeRelatedKeys = Object.keys(process.env).filter(
    (key) => key.includes("YOUTUBE") || key.includes("API")
  );

  const envStatus: Record<string, string> = {};
  youtubeRelatedKeys.forEach((key) => {
    envStatus[key] = process.env[key] ? "✅ SET" : "❌ NOT SET";
  });

  return NextResponse.json({
    timestamp: new Date().toISOString(),
    server: "Next.js API Route",
    environment: {
      YOUTUBE_API_KEY: {
        status: process.env.YOUTUBE_API_KEY ? "✅ SET" : "❌ NOT SET",
        length: process.env.YOUTUBE_API_KEY?.length || 0,
      },
      NEXT_PUBLIC_YOUTUBE_API_KEY: {
        status: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY ? "✅ SET" : "❌ NOT SET",
        length: process.env.NEXT_PUBLIC_YOUTUBE_API_KEY?.length || 0,
      },
    },
    allRelatedKeys: envStatus,
    dotenvFiles: [
      ".env.local",
      ".env",
      ".env.development",
      ".env.production",
    ],
  });
}
