"use client";

import { useState } from "react";
import { Loader2, Music, CheckCircle, AlertCircle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SearchBar } from "@/components/shared/SearchBar";
import { VideoCard } from "@/components/shared/VideoCard";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { type YouTubeVideo } from "@/types/youtube";

export function SongRequestForm() {
  const { user } = useAuth();
  const supabase = createClient();

  const [searchResults, setSearchResults] = useState<YouTubeVideo[]>([]);
  const [selectedVideo, setSelectedVideo] = useState<YouTubeVideo | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  const handleVideoSelect = (video: YouTubeVideo) => {
    setSelectedVideo(video);
    setSubmitSuccess(false);
    setSubmitError(null);
  };

  const handleSubmit = async () => {
    if (!selectedVideo || !user) return;

    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const { data: songData, error: songError } = await supabase
        .from("songs")
        .insert({
          youtube_id: selectedVideo.id,
          youtube_url: `https://www.youtube.com/watch?v=${selectedVideo.id}`,
          title: selectedVideo.title,
          thumbnail: selectedVideo.thumbnail || null,
          requested_by: user.id,
          status: "pending",
        })
        .select()
        .single();

      if (songError) throw songError;

      const { error: queueError } = await supabase
        .from("approval_queue")
        .insert({
          song_id: songData.id,
          requested_by: user.id,
          status: "pending",
        });

      if (queueError) throw queueError;

      setSubmitSuccess(true);
      setSelectedVideo(null);
      setSearchResults([]);
    } catch (error) {
      console.error("Error submitting song:", error);
      setSubmitError("Erro ao enviar música. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Music className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Solicitar Música</h2>
      </div>

      <SearchBar
        onResults={setSearchResults}
        onLoading={setIsSearching}
        onError={setSearchError}
      />

      {isSearching && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
          <span className="ml-2 text-muted-foreground">Buscando...</span>
        </div>
      )}

      {searchError && (
        <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-md">
          <AlertCircle className="h-4 w-4" />
          {searchError}
        </div>
      )}

      {searchResults.length > 0 && (
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {searchResults.map((video) => (
            <VideoCard
              key={video.id}
              video={video}
              onSelect={handleVideoSelect}
              isSelected={selectedVideo?.id === video.id}
            />
          ))}
        </div>
      )}

      {searchResults.length === 0 && !isSearching && !searchError && (
        <p className="text-center text-sm text-muted-foreground py-8">
          Digite uma música para buscar no YouTube
        </p>
      )}

      {selectedVideo && (
        <div className="border-t pt-4 mt-4">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            Música selecionada
          </div>
          <p className="font-medium mb-4">{selectedVideo.title}</p>

          {submitSuccess ? (
            <div className="flex items-center gap-2 text-sm text-green-600 p-3 bg-green-50 rounded-md">
              <CheckCircle className="h-4 w-4" />
              Música enviada para aprovação com sucesso!
            </div>
          ) : (
            <>
              {submitError && (
                <div className="flex items-center gap-2 text-sm text-destructive p-3 bg-destructive/10 rounded-md mb-4">
                  <AlertCircle className="h-4 w-4" />
                  {submitError}
                </div>
              )}
              <Button onClick={handleSubmit} disabled={isSubmitting} className="w-full">
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  "Enviar para Aprovação"
                )}
              </Button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
