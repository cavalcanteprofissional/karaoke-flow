"use client";

import Image from "next/image";
import { Play, Plus } from "lucide-react";
import { type YouTubeVideo } from "@/types/youtube";
import { Button } from "@/components/ui/button";

interface VideoCardProps {
  video: YouTubeVideo;
  onSelect: (video: YouTubeVideo) => void;
  isSelected?: boolean;
  isLoading?: boolean;
}

export function VideoCard({ video, onSelect, isSelected, isLoading }: VideoCardProps) {
  return (
    <div
      className={`flex gap-4 p-3 border rounded-lg transition-colors ${
        isSelected ? "border-primary bg-primary/5" : "hover:bg-muted/50"
      }`}
    >
      <div className="relative w-32 h-20 flex-shrink-0 rounded overflow-hidden bg-muted">
        {video.thumbnail ? (
          <Image
            src={video.thumbnail}
            alt={video.title}
            fill
            className="object-cover"
            unoptimized
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Play className="h-8 w-8 text-muted-foreground" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <h3 className="font-medium text-sm line-clamp-2 mb-1">{video.title}</h3>
        <p className="text-xs text-muted-foreground truncate">{video.channelTitle}</p>
      </div>

      <div className="flex items-center">
        <Button
          size="sm"
          variant={isSelected ? "secondary" : "default"}
          onClick={() => onSelect(video)}
          disabled={isLoading}
        >
          <Plus className="h-4 w-4 mr-1" />
          {isSelected ? "Selecionada" : "Solicitar"}
        </Button>
      </div>
    </div>
  );
}
