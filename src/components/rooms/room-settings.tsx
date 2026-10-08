"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, LayoutGrid, Link2, LoaderCircle, Lock, PlugZap, Video } from "lucide-react";
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
import { RoomOccupancyCard } from "@/components/rooms/room-occupancy";
import { updateBarMesasAction } from "@/lib/bars/actions";
import {
  updateRoomCodeAction,
  updateRoomSettingsAction,
  updateYoutubeKeyAction,
  youtubeDisconnectAction,
} from "@/lib/rooms/actions";
import { MESA_MAX } from "@/types/bar";
import type { RoomEntryMode, RoomQueueApprovalMode } from "@/types/room";

type RoomSettingsProps = {
  roomId: string;
  roomCode: string;
  initial: {
    entry_mode: RoomEntryMode;
    queue_approval_mode: RoomQueueApprovalMode;
    require_song_confirmation: boolean;
    pre_approval_24h: boolean;
    youtube_api_key: string | null;
  };
  /** updated_at de youtube_oauth_tokens quando o host conectou a conta Google. */
  youtubeConnectedAt: string | null;
  /** Bar da sala — só o host vê as configurações; alimenta o aviso/mapa do raio. */
  bar: {
    id: string;
    nome: string;
    endereco: string | null;
    cidade: string | null;
    latitude: number | null;
    longitude: number | null;
    raio_permitido_metros: number;
    /** Quantas mesas o bar tem — o card de ocupação desenha todas, vazias também. */
    quantidade_mesas: number;
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
  // Mesas do bar (Fase 16): 1 por padrão, até 10. O valor vive no servidor
  // (`bars.quantidade_mesas`) e é sincronizado pela RPC `update_bar_mesas`.
  const [mesasInput, setMesasInput] = useState(String(bar?.quantidade_mesas ?? 1));
  const [mesasBusy, setMesasBusy] = useState(false);
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

  async function saveMesas() {
    if (!bar) return;
    const next = Number(mesasInput);
    if (!Number.isInteger(next) || next < 1 || next > MESA_MAX) {
      toast.error(`Informe de 1 a ${MESA_MAX} mesas.`);
      return;
    }
    if (next === bar.quantidade_mesas) return;
    if (next < bar.quantidade_mesas) {
      const confirmed = window.confirm(
        `Diminuir de ${bar.quantidade_mesas} para ${next} mesa(s)? Quem estiver sentado nas mesas removidas vai para a mesa 1.`
      );
      if (!confirmed) return;
    }
    setMesasBusy(true);
    const result = await updateBarMesasAction(bar.id, next);
    setMesasBusy(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setMesasInput(String(result.quantidadeMesas));
    toast.success(
      result.reallocados > 0
        ? `Mesas atualizadas. ${result.reallocados} pessoa(s) foram para a mesa 1.`
        : "Quantidade de mesas atualizada."
    );
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
      pre_approval_24h: next.pre_approval_24h,
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

          {/* Pré-aprovação de 24h: o toggle é funcional (o estado OFF existe,
              está no banco e a regra respeita), mas fica TRAVADO em ON por
              decisão do PO — com "Entrada livre" desligada, quem foi aprovado
              há mais de 24h volta a pedir aprovação. Para liberar, basta
              remover o `disabled` e o `onCheckedChange` abaixo. */}
          <div className="flex items-start justify-between gap-3 opacity-60">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="toggle-pre-approval" className="flex items-center gap-1.5">
                <Lock className="size-3.5" />
                Aprovação vale por 24h
              </Label>
              <p className="text-muted-foreground text-xs">
                Quem tem login e foi aprovado nas últimas 24h entra direto ao voltar para
                a sala. Usuário sem login nunca é pré-aprovado.
              </p>
            </div>
            <Switch
              id="toggle-pre-approval"
              checked={settings.pre_approval_24h}
              disabled
              aria-describedby="toggle-pre-approval-desc"
            />
            <span id="toggle-pre-approval-desc" className="sr-only">
              Padrão do app: pré-aprovação de 24h para usuários autenticados. O host não
              pode desligar esta opção.
            </span>
          </div>
        </CardContent>
      </Card>

      {bar && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <LayoutGrid className="text-muted-foreground size-4" />
                Mesas do bar
              </CardTitle>
              <CardDescription>
                De 1 a {MESA_MAX} mesas. Um bar de mesa única não pergunta a mesa na
                entrada: quem entra pelo código já senta na mesa 1. Diminuir remove as
                últimas mesas e move quem estava nelas para a mesa 1.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              <div className="flex gap-2">
                <Input
                  id="bar-mesas"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={MESA_MAX}
                  value={mesasInput}
                  onChange={(event) => setMesasInput(event.target.value)}
                  className="w-24"
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={saveMesas}
                  disabled={mesasBusy || mesasInput === String(bar.quantidade_mesas)}
                >
                  {mesasBusy ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <LayoutGrid className="size-4" />
                  )}
                  Salvar
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Hoje o bar tem <span className="font-medium">{bar.quantidade_mesas}</span>{" "}
                {bar.quantidade_mesas === 1 ? "mesa" : "mesas"}.
              </p>
            </CardContent>
          </Card>

          <RoomOccupancyCard roomId={roomId} quantidadeMesas={bar.quantidade_mesas} />
          <PresenceGateInfo
            barId={bar.id}
            barName={bar.nome}
            address={bar.endereco}
            city={bar.cidade}
            latitude={bar.latitude}
            longitude={bar.longitude}
            radiusMeters={bar.raio_permitido_metros}
            entryModeApproval={settings.entry_mode === "approval"}
          />
        </>
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
    </div>
  );
}
