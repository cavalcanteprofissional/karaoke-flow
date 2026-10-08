"use client";

import { useState } from "react";
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
import { updateYoutubeKeyAction, youtubeDisconnectAction } from "@/lib/rooms/actions";

type YoutubeSettingsCardProps = {
  roomId: string;
  /** Código da sala — o link de OAuth (`/auth/youtube/authorize?room=`) é por sala. */
  roomCode: string;
  /** Chave já salva na sala (`rooms.youtube_api_key`) — null quando não há. */
  apiKey: string | null;
  /** updated_at de youtube_oauth_tokens quando o host conectou a conta Google. */
  youtubeConnectedAt: string | null;
};

/**
 * "Busca de música (YouTube)" — chave colada ou conta conectada, por sala.
 * Partido de `room-settings.tsx` na Fase 17; na tela do bar
 * (`/bar/[codigo]`) ele aparece um por sala, porque a chave é da sala e a
 * cota é do projeto do Google Cloud.
 */
export function YoutubeSettingsCard({
  roomId,
  roomCode,
  apiKey,
  youtubeConnectedAt,
}: YoutubeSettingsCardProps) {
  const [youtubeKey, setYoutubeKey] = useState(apiKey ?? "");
  const [youtubeBusy, setYoutubeBusy] = useState(false);
  const [ytConnBusy, setYtConnBusy] = useState(false);

  async function saveYoutubeKey() {
    setYoutubeBusy(true);
    const result = await updateYoutubeKeyAction(roomId, youtubeKey.trim() || null);
    if (result.ok) {
      // O toast confirma o QUE foi salvo. O que a chave faz (e em qual projeto
      // a cota é cobrada) está no texto do card — aqui seria ruído.
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
      "Desconectar a conta do YouTube desta sala? O token será revogado no Google e a busca passará a usar a chave salva aqui."
    );
    if (!confirmed) return;

    setYtConnBusy(true);
    const result = await youtubeDisconnectAction(roomId);
    setYtConnBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível desconectar.");
      return;
    }
    toast.success("Conta do YouTube desconectada.");
    window.location.reload();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Video className="text-muted-foreground size-4" />
          Busca de música (YouTube)
        </CardTitle>
        <CardDescription>
          {/**
           * Reescrito na Fase 8f porque o texto antigo prometia duas coisas que
           * não são verdade: (1) que a busca "esgota a cota do dia por usuário" —
           * não existe cota por usuário, a cota é do PROJETO do Google Cloud; e
           * (2) que conectar a conta Google tira a busca "do seu projeto" — o
           * OAuth autoriza a leitura, mas a chamada continua sendo cobrada no
           * projeto da credencial. Quem lia isso achava que conectar a conta
           * resolvia o problema de cota; não resolve.
           *
           * O que o texto diz agora é a parte honesta e útil: sem chave, esta
           * sala não tem busca — e a chave vem de um projeto do Google Cloud.
           */}
          Esta sala precisa de uma chave da{" "}
          <span className="font-medium">YouTube Data API v3</span> para buscar
          músicas. A chave é do seu projeto no Google Cloud e a cota é desse
          projeto — não existe cota por pessoa.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <Label htmlFor="yt-key">Chave da YouTube Data API v3</Label>
          <div className="flex gap-2">
            <Input
              id="yt-key"
              type="password"
              value={youtubeKey}
              placeholder={apiKey ? "••••••••" : "Cole a sua YouTube API key"}
              onChange={(event) => setYoutubeKey(event.target.value)}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={saveYoutubeKey}
              disabled={
                youtubeBusy || youtubeKey.trim() === (apiKey ?? "")
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
          {apiKey && (
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
          {/**
           * O passo de criar a chave, porque "cole a sua chave" sem dizer onde
           * ela nasce é onde a maioria dos hosts trava — e o sintoma que chega
           * para o dev é a busca falhando com um código que ninguém sabe
           * interpretar.
           */}
          <p className="text-muted-foreground text-xs">
            No{" "}
            <a
              href="https://console.cloud.google.com/apis/credentials"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              Google Cloud
            </a>
            , crie um projeto, ative a{" "}
            <span className="font-medium">YouTube Data API v3</span> e gere uma chave
            de API. Deixe as restrições de origem e de endereço IP sem restrição: a
            busca roda no servidor e não envia Referer — uma chave restrita
            funciona na sua máquina e falha no site.
          </p>
        </div>

        <div className="flex flex-col gap-1">
          {/**
           * "Conta do YouTube", e não "Conta do Google" (Fase 8f): o botão
           * levava a uma tela que parece login do Google e muita gente achava
           * que era o mesmo "entrar com Google" do app — que não tem relação
           * nenhuma com a YouTube Data API e não dá nenhuma credencial.
           */}
          <Label htmlFor="yt-connect">Conta do YouTube conectada (alternativa à chave)</Label>
          {youtubeConnectedAt ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
                <Link2 className="size-3.5" />
                Conectado à conta do YouTube
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
                {/**
                 * Este texto é o mais delicado da tela, porque a versão
                 * anterior afirmava duas coisas falsas: que login com Google
                 * do app é equivalente, e que conectar a conta tira a busca
                 * "do seu projeto". Nada disso é verdade — o OAuth dá
                 * autorização de leitura e a chamada continua sendo cobrada
                 * no projeto da credencial. O que ele realmente oferece é
                 * dispensar chave colada à mão; o que ele não oferece é cota
                 * separada.
                 */}
                Em vez de colar uma chave, você pode autorizar a busca a usar
                a sua conta do YouTube. Isso{" "}
                <span className="font-medium">não cria uma cota separada</span>:
                a leitura continua sendo cobrada no mesmo projeto do Google
                Cloud. Serve para não ter chave guardada aqui — para ter cota
                própria, o caminho é um projeto seu no Google Cloud.
              </p>
              <a
                id="yt-connect"
                href={`/auth/youtube/authorize?room=${encodeURIComponent(roomCode)}`}
                className="mt-1 inline-flex"
              >
                <Button variant="secondary" size="sm">
                  <Video className="size-4" />
                  Conectar conta do YouTube
                </Button>
              </a>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
