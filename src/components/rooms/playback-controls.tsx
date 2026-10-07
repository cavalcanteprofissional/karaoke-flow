"use client";

import { useState } from "react";
import {
  Copy,
  ExternalLink,
  Pause,
  Play,
  RefreshCw,
  SkipForward,
  Square,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { copiarTexto } from "@/lib/clipboard";
import { setPlaybackAction, rotatePlayerTokenAction } from "@/lib/rooms/playback-actions";
import { announcePlaybackChange } from "@/lib/rooms/player-channel";
import { playbackControls } from "@/lib/rooms/playback";
import { usePlaybackLive } from "@/lib/rooms/use-playback-live";
import type { PlaybackAction, PlaybackStatus } from "@/lib/rooms/playback";

/**
 * Controle de playback do host (Fase 7) + o link da TV (Fase 6).
 *
 * Regras que valem aqui:
 *  - quem manda é o banco: os botões só chamam `set_playback`, que exige
 *    host; a UI esconder o botão é conveniência, não autorização;
 *  - depois de gravar, o host avisa a TV por broadcast (o quiosque relê o
 *    estado) — o alvo é latência < 2s sem depender de poll;
 *  - o link da TV carrega um token de capacidade. "Gerar novo link" rotaciona
 *    o token, então o link antigo (e a TV velha) param na hora.
 *
 * E um quarto, da Fase 8g·C: `status`/`hasCurrent`/`queueLength` são o estado
 * do PRIMEIRO render, e a música termina na TV, num RPC que não revalida a
 * página aberta. Sem o `usePlaybackLive`, o card ficava dito "Retomar" a noite
 * inteira enquanto a sala seguia sozinha — os botões continuavam certos no
 * banco, só a tela mentia.
 */
export type PlaybackControlsProps = {
  roomId: string;
  roomCode: string;
  playerToken: string;
  status: PlaybackStatus;
  hasCurrent: boolean;
  queueLength: number;
  isHost: boolean;
};

export function PlaybackControls({
  roomId,
  roomCode,
  playerToken,
  status,
  hasCurrent,
  queueLength,
  isHost,
}: PlaybackControlsProps) {
  const [busy, setBusy] = useState<PlaybackAction | "link" | null>(null);
  const [token, setToken] = useState(playerToken);
  /**
   * Os três valores vivem: começam iguais ao que o servidor mandou e passam a
   * ser atualizados por broadcast/poll/foco (Fase 8g·C). Enquanto nenhuma
   * leitura chegar, valem exatamente as props — é por isso que os testes de
   * estado do card não precisam de realtime nenhum.
   */
  const live = usePlaybackLive(roomCode, { status, hasCurrent, queueLength });

  const controls = playbackControls({
    isHost,
    status: live.status,
    hasCurrent: live.hasCurrent,
    queueLength: live.queueLength,
  });
  const playerUrl = `/player/${roomCode}?token=${token}`;

  async function run(action: PlaybackAction) {
    if (busy) return;
    setBusy(action);
    const result = await setPlaybackAction(roomId, action);
    if (!result.ok) {
      toast.error(result.error);
    } else {
      await announcePlaybackChange(roomCode);
    }
    setBusy(null);
  }

  async function rotate() {
    if (busy) return;
    setBusy("link");
    const result = await rotatePlayerTokenAction(roomId);
    if (!result.ok) {
      toast.error(result.error);
    } else {
      setToken(result.token);
      toast.success("Novo link do player gerado — o link antigo parou de funcionar.");
    }
    setBusy(null);
  }

  async function copyLink() {
    const url = new URL(playerUrl, window.location.origin).toString();
    // Pelo mesmo motivo do Pix: o dono copia esse link pela rede do bar, onde
    // não existe Clipboard API — e o quiosque não mostra o token para o
    // convidado, então essa cópia é a única forma de ele chegar na TV.
    const ok = await copiarTexto(url);
    if (ok) {
      toast.success("Link do player copiado.");
    } else {
      toast.error("Não foi possível copiar. Use “Abrir player na TV” e copie o link da barra.");
    }
  }

  if (!isHost) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Player da TV</CardTitle>
        <CardDescription>
          Abra o link na TV do bar. Quem estiver cantando não precisa do celular: o
          quiosque avança sozinho quando a música acaba.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="secondary">
            <a href={playerUrl} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" />
              Abrir player na TV
            </a>
          </Button>
          <Button variant="outline" onClick={() => void copyLink()}>
            <Copy className="size-4" />
            Copiar link
          </Button>
          <Button
            variant="outline"
            onClick={() => void rotate()}
            disabled={busy !== null}
            title="Gera um link novo e invalida o atual"
          >
            <RefreshCw className="size-4" />
            Gerar novo link
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {controls.canPlay ? (
            <Button onClick={() => void run("play")} disabled={busy !== null}>
              <Play className="size-4" />
              {controls.playLabel}
            </Button>
          ) : controls.canPause ? (
            <Button onClick={() => void run("pause")} disabled={busy !== null}>
              <Pause className="size-4" />
              Pausar
            </Button>
          ) : null}
          <Button
            variant="secondary"
            onClick={() => void run("skip")}
            disabled={busy !== null || !controls.canSkip}
          >
            <SkipForward className="size-4" />
            Pular
          </Button>
          <Button
            variant="outline"
            onClick={() => void run("stop")}
            disabled={busy !== null || !controls.canStop}
          >
            <Square className="size-4" />
            Parar
          </Button>
        </div>

        {controls.emptyHint && (
          <p className="text-muted-foreground text-sm">{controls.emptyHint}</p>
        )}
      </CardContent>
    </Card>
  );
}
