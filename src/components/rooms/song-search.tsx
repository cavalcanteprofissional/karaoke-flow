"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  LoaderCircle,
  MapPin,
  Music2,
  Plus,
  Repeat2,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SongConfirmDialog } from "@/components/rooms/song-confirm-dialog";
import { captureGeolocation, writeGeoCookie } from "@/lib/consent/geo";
import { addSongToQueueAction, replaceQueueSongAction } from "@/lib/rooms/queue-actions";
import { announceQueueChange } from "@/lib/rooms/room-channel";
import type { YouTubeVideo } from "@/lib/youtube/types";
import { formatDurationSeconds } from "@/lib/youtube/format";

type SearchState =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "results"; results: YouTubeVideo[] }
  | {
      kind: "error";
      message: string;
      code?: string;
      geoRequired?: boolean;
      /**
       * O passo a seguir escrito no servidor (`hint`). Só aparece para quem
       * pode agir: o host da sala. Ver `OWNER_ACTIONS`.
       */
      hint?: string | null;
      /** Esta falha é de configuração do bar, não da rede nem do Google. */
      ownerAction?: boolean;
    };

type SongSearchProps = {
  roomCode: string;
  presenceOk: boolean;
  presenceMessage: string | null;
  /** `rooms.require_song_confirmation`: abre o modal antes de adicionar (Bloco B). */
  requireSongConfirmation: boolean;
  /**
   * Bloco D: id do item da fila que está sendo trocado. search vira troca — a
   * confirmação é obrigatória mesmo com `require_song_confirmation` desligado,
   * porque aqui a ação é sobrescrever o pedido de outra pessoa.
   */
  replaceItemId?: string;
  /** Título do item trocado, só para o texto do modal. */
  replaceItemTitle?: string | null;
  /**
   * Uma música ativa por participante (migration `20261004000042`). Vem pronto do
   * servidor (`resolveOwnActiveSong`): `{ playing: true }` trava os botões — é a
   * sua música tocando e trocá-la cortaria o áudio da TV — e `{ replaced }`
   * avisa que aquele pedido sai da fila quando o próximo entrar.
   */
  ownActiveSong?: { playing: boolean; replacedTitle: string | null };
  /**
   * Esta pessoa é o host da sala? Decide se o passo de configuração vem
   * acompanhado do atalho para as configurações — porque só o host tem onde
   * salvar a chave (ver `OWNER_ACTION_CODES`).
   */
  isHost?: boolean;
};

const DEBOUNCE_MS = 500;

/**
 * Códigos que a busca devolve quando o problema é CONFIGURAÇÃO DO BAR, e não a
 * rede nem o Google (Fase 8f).
 *
 * A distinção importa porque cada grupo tem um interlocutor e um conserto
 * diferentes:
 *
 *  - `CREDENTIAL_NOT_CONFIGURED`: o bar nunca configurou credencial. Quem
 *    resolve é o host, em `/salas/<código>` (Configurações).
 *  - `KEY_INVALID`, `KEY_RESTRICTED`, `API_NOT_ENABLED`, `SCOPES_INSUFFICIENT`:
 *    existe credencial, e ela é rejeitada. O conserto é no Google Cloud ou
 *    reconectando a conta — repetir a busca não muda nada.
 *  - `QUOTA_EXHAUSTED`: conserto é de infraestrutura (chave nova ou pool).
 *
 * Antes, todos caíam no mesmo texto genérico e a pessoa achava que era a
 * internet dela.
 */
const OWNER_ACTION_CODES = new Set([
  "CREDENTIAL_NOT_CONFIGURED",
  "KEY_INVALID",
  "KEY_RESTRICTED",
  "API_NOT_ENABLED",
  "SCOPES_INSUFFICIENT",
  "QUOTA_EXHAUSTED",
]);

/**
 * Lê a resposta como JSON sem deixar a exceção escapar.
 *
 * A rota responde JSON sempre (Fase 8f), mas um proxy ou o próprio Next pode
 * devolver HTML num 500 — e `response.json()` nesse caso lança, caindo no
 * `catch` de rede com uma mentira. Aqui o parse é tolerante e o corpo vira
 * objeto vazio, então a tela mostra a mensagem padrão e o status continua
 * disponíveis.
 */
async function readJson(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = await response.json();
    return typeof parsed === "object" && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function SongSearch({
  roomCode,
  presenceOk,
  presenceMessage,
  requireSongConfirmation,
  replaceItemId,
  replaceItemTitle,
  ownActiveSong,
  isHost = false,
}: SongSearchProps) {
  const isReplace = Boolean(replaceItemId);
  /**
   * A trava do player não vale para a troca autorizada (Bloco D): ali quem troca é
   * o host, ou o próprio autor em item que não está tocando, e a ação segue valendo
   * — é a fila do participante que a regra limita, não o texto da busca.
   */
  const ownSongPlaying = !isReplace && Boolean(ownActiveSong?.playing);
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [state, setState] = useState<SearchState>({ kind: "idle" });
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<YouTubeVideo | null>(null);
  const [granting, setGranting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const canSearch = presenceOk;

  useEffect(() => {
    if (!canSearch) return;
    const trimmed = query.trim();
    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    if (!trimmed) return;

    const timer = setTimeout(async () => {
      setState({ kind: "loading" });
      try {
        const response = await fetch(
          `/api/youtube/search?room=${encodeURIComponent(roomCode)}&q=${encodeURIComponent(trimmed)}`,
          { signal: controller.signal, headers: { Accept: "application/json" } }
        );
        const body = (await readJson(response)) as {
          results?: YouTubeVideo[];
          error?: string;
          code?: string;
          geoRequired?: boolean;
          hint?: string;
        };
        if (!controller.signal.aborted) {
          if (!response.ok) {
            setState({
              kind: "error",
              message: body.error ?? "Não foi possível buscar agora.",
              code: body.code,
              geoRequired: body.geoRequired,
              hint: body.hint ?? null,
              ownerAction: body.code ? OWNER_ACTION_CODES.has(body.code) : false,
            });
          } else {
            setState({ kind: "results", results: body.results ?? [] });
          }
        }
      } catch {
        // Só aqui — `fetch` recusado, offline, DNS — "falha de rede" é a
        // descrição correta. Qualquer resposta HTTP, mesmo 500 com HTML, tem
        // que sair pelo caminho de cima com o código: foi isso que fazia um
        // erro de configuração do bar aparecer como "falha de rede".
        if (!controller.signal.aborted) {
          setState({ kind: "error", message: "Falha de rede ao buscar músicas." });
        }
      }
    }, DEBOUNCE_MS);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query, roomCode, canSearch]);

  async function handleGrantLocation() {
    setGranting(true);
    const geo = await captureGeolocation();
    if (geo.status === "denied") {
      toast.error(
        "Permissão de localização negada. Habilite no navegador para pedir músicas."
      );
    } else if (geo.status === "unavailable") {
      toast.error("Não foi possível obter sua localização neste dispositivo.");
    } else {
      writeGeoCookie(geo);
      window.location.reload();
      return;
    }
    setGranting(false);
  }

  function handleAdd(video: YouTubeVideo) {
    if (adding) return;
    if (!isReplace && added.has(video.videoId)) return;
    // Há de vir na prop, mas a trava é repetida aqui: é o botão que a pessoa
    // realmente toca, e um clique no tempo certo entre o render e o clique
    // mostraria uma busca que aceita pedidos que o servidor vai recusar.
    if (ownSongPlaying) {
      toast.error(
        "Você já tem uma música tocando nesta sala. Dá para pedir outra quando ela terminar."
      );
      return;
    }
    if (requireSongConfirmation || isReplace) {
      setConfirming(video);
      return;
    }
    void addToQueue(video);
  }

  async function addToQueue(video: YouTubeVideo) {
    setAdding(video.videoId);
    if (replaceItemId) {
      const result = await replaceQueueSongAction(replaceItemId, video);
      setAdding(null);
      setConfirming(null);
      if (result.ok) {
        // A troca muda título/duração do item que TODO mundo vê na lista: os
        // aparelhos da sala precisam reler (o poll de 10s cobre quem não ouvir).
        void announceQueueChange(roomCode);
        toast.success(`${video.title} — música trocada, posição e status mantidos.`);
        return;
      }
      toast.error(result.error ?? "Não foi possível trocar a música.");
      return;
    }

    const result = await addSongToQueueAction({ roomCode, video });
    setAdding(null);
    setConfirming(null);
    if (result.ok) {
      setAdded((prev) => new Set(prev).add(video.videoId));
      // A sala precisa ver o pedido chegar na hora — em especial o host, que é
      // quem aprova, e os outros participantes, que era o que não acontecia.
      void announceQueueChange(roomCode);
      const label =
        result.item.status === "pending" ? "aguardando aprovação do host" : "na fila";
      /**
       * O aviso pós-ação cita a música que SAIU, não só a que entrou: sem o
       * título anterior o participante vê o pedido novo e só percebe a troca
       * quando a música some da lista. `result.replaced` vem do servidor porque
       * foi a trigger que apagou — a tela não pode adivinhar o que o banco fez.
       */
      toast.success(
        result.replaced
          ? `${video.title} — ${label}. “${result.replaced.title}” saiu da fila: cada participante tem uma música ativa por vez.`
          : `${video.title} — ${label}`
      );
      // Não empurra mais para o player: pedir música não é "assistir". Quem pede
      // volta para a tela da mesa, onde vê a fila realtime, o status do pedido e
      // o botão de abrir o player — e quem não quiser assistir, não é levado.
      router.push(`/salas/${roomCode}`);
    } else {
      if (result.geoRequired) {
        toast.error(result.error);
        window.location.reload();
        return;
      }
      toast.error(result.error ?? "Não foi possível adicionar a música.");
    }
  }

  function placesLabel() {
    if (!query.trim()) {
      return (
        <p className="text-muted-foreground text-sm">
          Digite o nome da música (ou artista) para buscar no YouTube.
        </p>
      );
    }
    switch (state.kind) {
      case "loading":
        return (
          <span className="text-muted-foreground flex items-center gap-2 text-sm">
            <LoaderCircle className="size-4 animate-spin" />
            buscando no YouTube…
          </span>
        );
      case "results":
        if (state.results.length === 0) {
          return (
            <p className="text-muted-foreground text-sm">
              Nada encontrado. Tente outra busca.
            </p>
          );
        }
        return (
          <ul className="flex flex-col gap-2">
            {state.results.map((video) => {
              const duration = formatDurationSeconds(video.durationSeconds);
              const isAdded = !isReplace && added.has(video.videoId);
              return (
                <li
                  key={video.videoId}
                  className="border-border bg-background flex items-center gap-3 rounded-xl border p-2"
                >
                  <div className="relative shrink-0">
                    {video.thumbnailUrl ? (
                      <div
                        className="bg-muted relative aspect-video w-[120px] rounded-lg"
                        style={{
                          backgroundImage: `url(${video.thumbnailUrl})`,
                          backgroundSize: "cover",
                          backgroundPosition: "center",
                        }}
                        aria-hidden
                      />
                    ) : (
                      <div className="bg-muted flex aspect-video w-[120px] items-center justify-center rounded-lg">
                        <Music2 className="text-muted-foreground size-5" />
                      </div>
                    )}
                    {duration && (
                      <span className="absolute right-1 bottom-1 rounded bg-black/80 px-1 text-xs font-medium text-white">
                        {duration}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{video.title}</p>
                    {video.channelTitle && (
                      <p className="text-muted-foreground truncate text-xs">
                        {video.channelTitle}
                      </p>
                    )}
                  </div>
                  {isAdded ? (
                    <Badge variant="secondary">na fila</Badge>
                  ) : (
                    <Button
                      size="icon"
                      onClick={() => handleAdd(video)}
                      disabled={adding === video.videoId || ownSongPlaying}
                      aria-label={
                        isReplace
                          ? `Trocar por ${video.title}`
                          : `Adicionar ${video.title} à fila`
                      }
                      title={
                        ownSongPlaying
                          ? "Você já tem uma música tocando nesta sala"
                          : isReplace
                            ? "Trocar por esta música"
                            : "Adicionar à fila"
                      }
                    >
                      {adding === video.videoId ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : isReplace ? (
                        <Repeat2 className="size-4" />
                      ) : (
                        <Plus className="size-4" />
                      )}
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        );
      case "error":
        return (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-sm">
              {state.message}
              {state.code === "RATE_LIMITED" && " (aguarde um pouco)"}
            </p>
            {state.geoRequired && (
              <Button size="sm" onClick={handleGrantLocation} disabled={granting}>
                {granting ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <MapPin className="size-3.5" />
                )}
                Permitir localização
              </Button>
            )}
            {/**
             * O passo do host. Só aparece quando o código é de configuração, e o
             * texto vem do servidor (`hint`): a tela não inventa instrução sobre
             * Google Cloud, porque errar o passo aqui manda a pessoa procurar
             * coisa que não existe.
             *
             * Sem link para o participante não-dev: ele não tem onde salvar
             * chave nenhuma, e um botão que leva a uma tela onde ele não pode
             * agir é pior que nenhum.
             */}
            {state.ownerAction && state.hint && (
              <div className="border-border bg-muted/40 flex flex-col gap-2 rounded-xl border p-3">
                <p className="text-sm">{state.hint}</p>
                {isHost && (
                  <Button asChild size="sm" variant="outline" className="w-fit">
                    <Link href={`/salas/${roomCode}`}>
                      <Settings2 className="size-3.5" />
                      Abrir configurações da sala
                    </Link>
                  </Button>
                )}
              </div>
            )}
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!presenceOk && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-950/10 p-3 text-sm">
          <MapPin className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <div className="flex flex-col gap-2">
            <p>
              {presenceMessage ??
                "Precisamos da sua localização para confirmar que você está no bar."}
            </p>
            <div>
              <Button size="sm" onClick={handleGrantLocation} disabled={granting}>
                {granting ? (
                  <LoaderCircle className="size-3.5 animate-spin" />
                ) : (
                  <MapPin className="size-3.5" />
                )}
                Permitir localização
              </Button>
            </div>
          </div>
        </div>
      )}

      {/**
       * Aviso ANTES da ação (a escolha do usuário foi avisar nos dois momentos):
       * quando existe uma ativa, o próximo pedido sai da fila. Sem esta frase a
       * substituição só apareceria no toast depois do clique, e a pessoa já teria
       * clicado achando que as duas iam tocar.
       */}
      {!isReplace && !ownActiveSong?.playing && ownActiveSong?.replacedTitle && (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-950/10 p-3 text-sm"
          data-testid="aviso-substituicao"
        >
          <Repeat2 className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p>
            Você já tem{" "}
            <span className="text-foreground font-medium">
              {ownActiveSong.replacedTitle}
            </span>{" "}
            na fila. Pedir outra música substitui esse pedido — cada participante
            tem uma música ativa por vez.
          </p>
        </div>
      )}

      {ownSongPlaying && (
        <div
          className="flex items-start gap-2 rounded-xl border border-amber-300/40 bg-amber-950/10 p-3 text-sm"
          data-testid="aviso-tocando"
        >
          <Music2 className="mt-0.5 size-4 shrink-0 text-amber-400" />
          <p>
            {ownActiveSong?.replacedTitle ? (
              <>
                <span className="text-foreground font-medium">
                  {ownActiveSong.replacedTitle}
                </span>{" "}
                está tocando agora.
              </>
            ) : (
              "Sua música está tocando agora."
            )}{" "}
            Dá para pedir outra quando ela terminar.
          </p>
        </div>
      )}

      {isReplace && (
        <div className="flex flex-col gap-2">
          <Button asChild size="sm" variant="ghost" className="w-fit">
            <Link href={`/salas/${roomCode}`}>
              <ArrowLeft className="size-4" />
              Voltar para a fila
            </Link>
          </Button>
          <p className="text-muted-foreground text-sm">
            Trocando a música{" "}
            <span className="text-foreground font-medium">
              {replaceItemTitle ?? "da fila"}
            </span>
            . A posição e a aprovação são mantidas.
          </p>
        </div>
      )}

      <div className="relative">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2" />
        <Input
          value={query}
          disabled={canSearch === false}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={
            isReplace
              ? "Buscar a música que vai substituir…"
              : "Buscar música no YouTube…"
          }
          className="h-12 rounded-xl pr-9 pl-9 text-base"
          aria-label="Buscar música no YouTube"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            className="text-muted-foreground hover:text-foreground absolute top-1/2 right-3 -translate-y-1/2"
            aria-label="Limpar busca"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {placesLabel()}

      <SongConfirmDialog
        video={confirming}
        busy={adding === confirming?.videoId}
        mode={isReplace ? "replace" : "add"}
        replaceItemTitle={replaceItemTitle ?? null}
        onCancel={() => setConfirming(null)}
        onConfirm={(video) => void addToQueue(video)}
      />
    </div>
  );
}
