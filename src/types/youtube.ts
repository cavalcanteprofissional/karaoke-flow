export interface YouTubeVideo {
  id: string;
  title: string;
  thumbnail: string;
  channelTitle: string;
  duration: string | null;
  viewCount: string | null;
}

export interface YouTubeSearchResponse {
  videos: YouTubeVideo[];
  nextPageToken: string | null;
  error: string | null;
}

export interface YouTubePlayerState {
  videoId: string | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
}
