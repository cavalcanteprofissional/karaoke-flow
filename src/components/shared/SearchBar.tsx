"use client";

import { useState, useCallback } from "react";
import { Search, Loader2, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { type YouTubeVideo } from "@/types/youtube";

interface SearchBarProps {
  onResults: (videos: YouTubeVideo[]) => void;
  onLoading: (loading: boolean) => void;
  onError: (error: string | null) => void;
}

export function SearchBar({ onResults, onLoading, onError }: SearchBarProps) {
  const [query, setQuery] = useState("");

  const handleSearch = useCallback(async () => {
    if (query.length < 2) return;

    onLoading(true);
    onError(null);

    try {
      const response = await fetch(`/api/youtube/search?q=${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.error) {
        onError(data.error);
        onResults([]);
      } else {
        onResults(data.videos || []);
      }
    } catch {
      onError("Erro ao buscar vídeos");
      onResults([]);
    } finally {
      onLoading(false);
    }
  }, [query, onResults, onLoading, onError]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSearch();
    }
  };

  const clearSearch = () => {
    setQuery("");
    onResults([]);
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Buscar músicas no YouTube..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-10"
        />
        {query && (
          <button
            onClick={clearSearch}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <Button onClick={handleSearch} disabled={query.length < 2}>
        <Search className="h-4 w-4 mr-2" />
        Buscar
      </Button>
    </div>
  );
}
