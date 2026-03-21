"use client";

import { useState } from "react";
import { useAuthStore } from "@/store/authStore";
import { useUser } from "@/hooks/useUser";
import { usePlaylist } from "@/hooks/usePlaylist";
import { SongRequestForm } from "@/components/playlist/SongRequestForm";
import { PlaylistTable } from "@/components/playlist/PlaylistTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ListMusic } from "lucide-react";

export default function DashboardPage() {
  const user = useUser();
  const isAdmin = useAuthStore((state) => state.user?.role === "admin");
  const { playlist, currentSong, isLoading, removeSong, reorder, playSong } = usePlaylist();

  const [activeTab, setActiveTab] = useState("playlist");

  if (!user) {
    return null;
  }

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newPlaylist = [...playlist];
    [newPlaylist[index - 1], newPlaylist[index]] = [newPlaylist[index], newPlaylist[index - 1]];
    reorder(newPlaylist);
  };

  const handleMoveDown = (index: number) => {
    if (index === playlist.length - 1) return;
    const newPlaylist = [...playlist];
    [newPlaylist[index], newPlaylist[index + 1]] = [newPlaylist[index + 1], newPlaylist[index]];
    reorder(newPlaylist);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">
          Bem-vindo, {user?.full_name || user?.email}!
        </h1>
        <p className="text-muted-foreground">
          Playlist ao vivo - Acompanhe e solicite suas músicas favoritas.
        </p>
      </div>

      {currentSong && (
        <Card className="mb-8 bg-primary/5 border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="p-2 bg-primary/20 rounded-full">
                <ListMusic className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tocando agora</p>
                <p className="font-semibold">{currentSong.songs?.title}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-6">
          <TabsTrigger value="playlist">Playlist</TabsTrigger>
          <TabsTrigger value="solicitar">Solicitar Música</TabsTrigger>
        </TabsList>

        <TabsContent value="playlist">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListMusic className="h-5 w-5" />
                Playlist
              </CardTitle>
            </CardHeader>
            <CardContent>
              <PlaylistTable
                playlist={playlist}
                currentSongId={currentSong?.song_id || null}
                onPlay={playSong}
                onRemove={removeSong}
                onMoveUp={handleMoveUp}
                onMoveDown={handleMoveDown}
                isAdmin={isAdmin}
                isLoading={isLoading}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="solicitar">
          <Card>
            <CardContent className="p-6">
              <SongRequestForm />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
