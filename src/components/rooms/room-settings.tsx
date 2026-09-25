"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link2, LoaderCircle, PlugZap, Video } from "lucide-react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { PresenceGateInfo } from "@/components/rooms/presence-gate-info";
import {
  updateRoomCodeAction,
  updateRoomSettingsAction,
  updateYoutubeKeyAction,
  youtubeDisconnectAction,
} from "@/lib/rooms/actions";
import type { RoomEntryMode, RoomQueueApprovalMode } from "@/types/room";

type RoomSettingsProps = {
  roomId: string;
  roomCode: string;
  initial: {
    entry_mode: RoomEntryMode;
    queue_approval_mode: RoomQueueApprovalMode;
    require_song_confirmation: boolean;
    youtube_api_key: string | null;
  };
  /** updated_at de youtube_oauth_tokens quando o host conectou a conta Google. */
  youtubeConnectedAt: string | null;
  /** Bar da sala — só o host vê as configurações; alimenta o aviso/mapa do raio. */
  bar: {
    nome: string;
    endereco: string | null;
    cidade: string | null;
    latitude: number | null;
    longitude: number | null;
    raio_permitido_metros: number;
  } | null;
};

export function RoomSettings({
  roomId,
  roomCode,
  initial,
  youtubeConnectedAt,
  bar,
}: RoomSettingsProps) {
  const router = useRouter();
  const [settings, setSettings] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [youtubeKey, setYoutubeKey] = useState(initial.youtube_api_key ?? "");
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [ytConnBusy, setYtConnBusy] = useState(false);
  const [roomCodeInput, setRoomCodeInput] = useState(roomCode);
  const [codeBusy, setCodeBusy] = useState(false);
  const optimistic = useRef(settings);

  async function saveRoomCode() {
    setCodeBusy(true);
    const result = await updateRoomCodeAction(roomId, roomCodeInput);
    setCodeBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível trocar o código.");
      return;
    }
    toast.success(`Código atualizado! Novo link: /salas/${result.newCode}`);
    router.push(`/salas/${result.newCode}`);
    router.refresh();
  }

  async function commit(next: typeof optimistic.current) {
    optimistic.current = next;
    setSettings(next);
    setBusy(true);
    const result = await updateRoomSettingsAction(roomId, {
      entry_mode: next.entry_mode,
      queue_approval_mode: next.queue_approval_mode,
      require_song_confirmation: next.require_song_confirmation,
    });
    if (!result.ok) {
      optimistic.current = initial;
      setSettings(initial);
      toast.error(result.error ?? "Não foi possível salvar.");
    }
    setBusy(false);
  }

  async function saveYoutubeKey() {
    setYoutubeBusy(true);
    const result = await updateYoutubeKeyAction(roomId, youtubeKey.trim() || null);
    if (result.ok) {
      toast.success("Chave do YouTube salva.");
    } else {
      toast.error(result.error ?? "Não foi possível salvar a chave.");
    }
    setYoutubeBusy(false);
  }

  async function removeYoutubeKey() {
    setYoutubeBusy(true);
    const result = await updateYoutubeKeyAction(roomId, null);
    if (result.ok) {
      setYoutubeKey("");
      toast.success("Chave do YouTube removida.");
    } else {
      toast.error(result.error ?? "Não foi possível remover a chave.");
    }
    setYoutubeBusy(false);
  }

  async function disconnectYoutube() {
    const confirmed = window.confirm(
      "Desconectar a conta Google desta sala? O token será revogado na Google e a busca passará a usar a próxima credencial disponível."
    );
    if (!confirmed) return;

    setYtConnBusy(true);
    const result = await youtubeDisconnectAction(roomId);
    setYtConnBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível desconectar.");
      return;
    }
    toast.success("Conta Google desconectada.");
    window.location.reload();
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            Como a sala funciona
            {busy && (
              <LoaderCircle className="text-muted-foreground size-3.5 animate-spin" />
            )}
          </CardTitle>
          <CardDescription>
            As mudanças valem na hora e ficam salvas para a próxima reentrada.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="toggle-entry">Entrada livre</Label>
              <p className="text-muted-foreground text-xs">
                {settings.entry_mode === "open"
                  ? "Qualquer um com o QR entra direto — mas só passa quem estiver dentro do raio de presença."
                  : "Cada entrada precisa da sua aprovação — e de estar dentro do raio de presença."}
              </p>
            </div>
            <Switch
              id="toggle-entry"
              checked={settings.entry_mode === "open"}
              onCheckedChange={(checked) =>
                commit({
                  ...optimistic.current,
                  entry_mode: checked ? "open" : "approval",
                })
              }
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="toggle-queue">Música com aprovação</Label>
              <p className="text-muted-foreground text-xs">
                {settings.queue_approval_mode === "manual"
                  ? "Cada música fica pendente até você aprovar."
                  : "A música já entra direto na fila."}
              </p>
            </div>
            <Switch
              id="toggle-queue"
              checked={settings.queue_approval_mode === "manual"}
              onCheckedChange={(checked) =>
                commit({
                  ...optimistic.current,
                  queue_approval_mode: checked ? "manual" : "auto",
                })
              }
            />
          </div>

          <div className="flex items-start justify-between gap-3">
            <div>
              <Label htmlFor="toggle-confirm">Pedir confirmação do vídeo</Label>
              <p className="text-muted-foreground text-xs">
                Mostra thumbnail e duração antes de entrar na fila.
              </p>
            </div>
            <Switch
              id="toggle-confirm"
              checked={settings.require_song_confirmation}
              onCheckedChange={(checked) =>
                commit({ ...optimistic.current, require_song_confirmation: checked })
              }
            />
          </div>
        </CardContent>
      </Card>

      {bar && (
        <PresenceGateInfo
          barName={bar.nome}
          address={bar.endereco}
          city={bar.cidade}
          latitude={bar.latitude}
          longitude={bar.longitude}
          radiusMeters={bar.raio_permitido_metros}
          entryModeApproval={settings.entry_mode === "approval"}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="text-muted-foreground size-4" />
            Código de entrada
          </CardTitle>
          <CardDescription>
            Quem digita este código na entrada vai direto para a sala — a mesa é escolhida
            depois, dentro do karaokê. Trocar o código muda o link{" "}
            <span className="font-mono">/salas/…</span> e o QR que você compartilha.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Input
              id="room-code"
              value={roomCodeInput}
              onChange={(event) => setRoomCodeInput(event.target.value.toUpperCase())}
              maxLength={12}
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              className="font-mono tracking-[0.2em] uppercase"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={saveRoomCode}
              disabled={codeBusy || roomCodeInput.trim().toUpperCase() === roomCode}
            >
              {codeBusy ? (
                <LoaderCircle className="size-4 animate-spin" />
              ) : (
                <KeyRound className="size-4" />
              )}
              Salvar
            </Button>
          </div>
          <p className="text-muted-foreground text-xs">
            3–12 letras ou números, sem acentos ou espaços. Padrão: o nome do bar em
            maiúsculas (ex.: <span className="font-mono">KARAOKEDOZE</span>) ou{" "}
            <span className="font-mono">KARAOKE</span> quando não há nome.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Video className="text-muted-foreground size-4" />
            Busca de música (YouTube)
          </CardTitle>
          <CardDescription>
            A busca esgota a cota do dia por usuário. Evite usar a cota do projeto:
            conecte a sua conta Google e a cota sair do seu projeto (recomendado) ou
            cadastre uma chave de API.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="yt-key">Chave de API (opcional)</Label>
            <div className="flex gap-2">
              <Input
                id="yt-key"
                type="password"
                value={youtubeKey}
                placeholder={
                  initial.youtube_api_key ? "••••••••" : "Cole a sua YouTube API key"
                }
                onChange={(event) => setYoutubeKey(event.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={saveYoutubeKey}
                disabled={
                  youtubeBusy || youtubeKey.trim() === (initial.youtube_api_key ?? "")
                }
              >
                {youtubeBusy ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                Salvar
              </Button>
            </div>
            {initial.youtube_api_key && (
              <Button
                variant="ghost"
                size="sm"
                className="self-start text-xs"
                onClick={removeYoutubeKey}
                disabled={youtubeBusy}
              >
                Remover chave salva
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <Label htmlFor="yt-connect">Conta do YouTube</Label>
            {youtubeConnectedAt ? (
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                  <Link2 className="size-3.5" />
                  Conectado à conta Google
                  <span className="text-border">·</span>
                  desde{" "}
                  {new Date(youtubeConnectedAt).toLocaleDateString("pt-BR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={disconnectYoutube}
                  disabled={ytConnBusy}
                >
                  {ytConnBusy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <PlugZap className="size-4" />
                  )}
                  Remover conexão
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-1">
                <p className="text-muted-foreground text-xs">
                  Você autoriza a busca a usar a sua conta Google (sua cota) em vez da do
                  app. Desconecte pela conta Google quando quiser revogar.
                </p>
                <a
                  id="yt-connect"
                  href={`/auth/youtube/authorize?room=${encodeURIComponent(roomCode)}`}
                  className="mt-1 inline-flex"
                >
                  <Button variant="secondary" size="sm">
                    <Video className="size-4" />
                    Conectar com o Google
                  </Button>
                </a>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
