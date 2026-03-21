import { type YouTubeVideo, type YouTubeSearchResponse } from "@/types/youtube";

const YOUTUBE_API_BASE = "https://www.googleapis.com/youtube/v3";

interface YouTubeSearchItem {
  id: {
    videoId: string;
  };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      high?: {
        url: string;
        width: number;
        height: number;
      };
      medium?: {
        url: string;
        width: number;
        height: number;
      };
      default?: {
        url: string;
        width: number;
        height: number;
      };
    };
  };
}

export async function searchVideos(
  query: string,
  pageToken?: string
): Promise<YouTubeSearchResponse> {
  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

  if (!apiKey) {
    return { videos: [], nextPageToken: null, error: "YouTube API key not configured" };
  }

  try {
    const params = new URLSearchParams({
      part: "snippet",
      q: query,
      type: "video",
      maxResults: "10",
      key: apiKey,
      order: "relevance",
      videoCategoryId: "10",
    });

    if (pageToken) {
      params.append("pageToken", pageToken);
    }

    const response = await fetch(
      `${YOUTUBE_API_BASE}/search?${params.toString()}`,
      { cache: "no-store" }
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    const videos: YouTubeVideo[] = data.items.map((item: YouTubeSearchItem) => ({
      id: item.id.videoId,
      title: item.snippet?.title || "Untitled",
      thumbnail: item.snippet?.thumbnails?.high?.url 
        || item.snippet?.thumbnails?.medium?.url 
        || item.snippet?.thumbnails?.default?.url 
        || null,
      channelTitle: item.snippet?.channelTitle || "Unknown",
      duration: null,
      viewCount: null,
    }));

    return {
      videos,
      nextPageToken: data.nextPageToken || null,
      error: null,
    };
  } catch (error) {
    console.error("YouTube search error:", error);
    return {
      videos: [],
      nextPageToken: null,
      error: error instanceof Error ? error.message : "Search failed",
    };
  }
}

export async function getVideoDetails(videoId: string) {
  const apiKey = process.env.NEXT_PUBLIC_YOUTUBE_API_KEY;

  if (!apiKey) {
    return { video: null, error: "YouTube API key not configured" };
  }

  try {
    const params = new URLSearchParams({
      part: "contentDetails,snippet,statistics",
      id: videoId,
      key: apiKey,
    });

    const response = await fetch(
      `${YOUTUBE_API_BASE}/videos?${params.toString()}`,
      { next: { revalidate: 300 } }
    );

    if (!response.ok) {
      throw new Error(`YouTube API error: ${response.status}`);
    }

    const data = await response.json();

    if (!data.items || data.items.length === 0) {
      return { video: null, error: "Video not found" };
    }

    const item = data.items[0];
    const video: YouTubeVideo = {
      id: item.id,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      channelTitle: item.snippet.channelTitle,
      duration: item.contentDetails?.duration || null,
      viewCount: item.statistics?.viewCount || null,
    };

    return { video, error: null };
  } catch (error) {
    return {
      video: null,
      error: error instanceof Error ? error.message : "Failed to get video details",
    };
  }
}

export function getYouTubeThumbnail(videoId: string, quality: "default" | "medium" | "high" | "max" = "high"): string {
  const qualityMap = {
    default: "default",
    medium: "mqdefault",
    high: "hqdefault",
    max: "maxresdefault",
  };
  return `https://img.youtube.com/vi/${videoId}/${qualityMap[quality]}.jpg`;
}

export function extractYouTubeId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}
