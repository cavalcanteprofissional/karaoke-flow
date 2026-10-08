"use client";

import {
  useCallback,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  Check,
  Clock,
  GripVertical,
  ListMusic,
  LoaderCircle,
  Mic2,
  Repeat2,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { restrictToVerticalAxis } from "@dnd-kit/modifiers";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import {
  QUEUE_VISIBLE_STATUSES,
  composeQueueOrder,
  moveQueueItem,
  queueStatusView,
} from "@/lib/rooms/queue";
import {
  removeQueueItemAction,
  reorderQueueAction,
  setQueueItemStatusAction,
} from "@/lib/rooms/queue-actions";
import { announcePlaybackChange } from "@/lib/rooms/player-channel";
import { announceQueueChange, subscribeToQueueChanges } from "@/lib/rooms/room-channel";
import { SPECTATOR_QUEUE_NOTICE } from "@/lib/rooms/spectator";
import { formatDurationSeconds } from "@/lib/youtube/format";

export type QueueItem = {
  id: string;
  title: string;
  status: string;
  position: number;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  added_by_user_id: string;
  youtube_video_id: string;
};

type QueueListProps = {
  roomId: string;
  roomCode: string;
  initial: QueueItem[];
  isHost: boolean;
  currentUserId: string;
  /**
   * A tela pode pedir música? `false` para o espectador (entrou fora do raio):
   * ele acompanha a fila, mas não recebe os botões de pedir/trocar. A regra mora
   * em `canRequestSongs` — aqui só chega a resposta.
   */
  canRequest?: boolean;
};

/**
 * Rede de segurança da lista: 10s. Curto o bastante para o participante não
 * achar que a tela travou, longo o bastante para não martelar o banco com um
 * celular de participant em cada mesa do bar.
 */
const POLL_MS = 10_000;

export function QueueList({
  roomId,
  roomCode,
  initial,
  isHost,
  currentUserId,
  canRequest = true,
}: QueueListProps) {
  const [items, setItems] = useState<QueueItem[]>(initial);
  const [names, setNames] = useState<Map<string, string | null>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);
  /** Ordem das aprovadas durante o drag/⬆/⬇, antes do fetch reconciliar. */
  const [draftOrder, setDraftOrder] = useState<string[] | null>(null);

  // `distance` evita que o scroll do celular seja capturado como arrasto; o
  // KeyboardSensor mantém o reorden acessível sem mouse.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("queue_items")
      .select(
        "id, title, status, position, duration_seconds, thumbnail_url, added_by_user_id, youtube_video_id"
      )
      .eq("room_id", roomId)
      .in("status", QUEUE_VISIBLE_STATUSES)
      .order("position", { ascending: true })
      .limit(100);
    const list = (data ?? []) as QueueItem[];
    setItems(list);

    // `profiles_public` é uma view (sem FK para PostgREST): o nome de quem pediu
    // vem numa segunda query, como em `PendingEntries`.
    if (list.length > 0) {
      const ids = [...new Set(list.map((item) => item.added_by_user_id))];
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, name")
        .in("id", ids);
      setNames(new Map((profiles ?? []).map((p) => [p.id, p.name])));
    } else {
      setNames(new Map());
    }
  }, [roomId]);

  /**
   * Por que três camadas (2026-09-27): a lista do participante parava de
   * atualizar e nada explicava. `postgres_changes` depende da publicação
   * `supabase_realtime` e da RLS no momento do evento (se qualquer um dos dois
   * falhar, a assinatura sobe e não chega nada, sem erro); celular travado dorme
   * o WebSocket; e o aviso de "a fila mudou" ia só para a TV, nunca para quem
   * está na sala. Então: broadcast de quem mutou + poll de 10s + relê quando a
   * tela volta a ficar visível. Cada camada é barata e vale a redundância
   * porque o custo de uma lista parada é o participante achando que deu errado.
   */
  useEffect(() => {
    // 1. `postgres_changes`: o caminho que já funcionava para o host.
    const supabase = createClient();
    const channel = supabase
      .channel(`queue-${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "queue_items",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void fetchItems();
        }
      )
      .subscribe(() => {
        void fetchItems();
      });

    // 2. Broadcast: quem mutou a fila avisa, sem depender de RLS/publicação.
    const unsubscribeBroadcast = subscribeToQueueChanges(
      roomCode,
      () => void fetchItems(),
      (status) => {
        if (status !== "SUBSCRIBED") {
          console.warn(
            `[fila ${roomCode}] realtime da fila em ${status} — caindo no poll de ${POLL_MS / 1000}s.`
          );
        }
      }
    );

    // 3. Poll de segurança, só com a tela visível: TV e celular dormem.
    const poll = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
      void fetchItems();
    }, POLL_MS);

    // 4. O caso real do bar: a tela estava travada e o WS nunca acordou.
    const wake = () => {
      void fetchItems();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", wake);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("focus", wake);
      window.addEventListener("online", wake);
    }

    return () => {
      clearInterval(poll);
      unsubscribeBroadcast();
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", wake);
      }
      if (typeof window !== "undefined") {
        window.removeEventListener("focus", wake);
        window.removeEventListener("online", wake);
      }
      void supabase.removeChannel(channel);
    };
  }, [roomId, roomCode, fetchItems]);

  async function moderate(item: QueueItem, action: "approved" | "rejected" | "remove") {
    if (busy) return;
    setBusy(item.id);
    // Otimista: o participante vê o efeito na hora; o fetch ao final reconcilia.
    setItems((prev) =>
      action === "remove"
        ? prev.filter((i) => i.id !== item.id)
        : prev.map((i) => (i.id === item.id ? { ...i, status: action } : i))
    );

    const result =
      action === "remove"
        ? await removeQueueItemAction(item.id)
        : await setQueueItemStatusAction(item.id, action);
    setBusy(null);

    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível atualizar a música.");
      void fetchItems();
      return;
    }
    // Duas audiências, um aviso cada: a TV (que pode estar ociosa e precisa
    // puxar a próxima) e os aparelhos da sala (a lista de quem está com o
    // celular na mão). Em paralelo, para não somar latência.
    await Promise.all([announcePlaybackChange(roomCode), announceQueueChange(roomCode)]);
    // Reconcilia posição/status (o trigger `touch_updated_at` também dispara o realtime).
    void fetchItems();
  }

  /**
   * Grava a nova ordem na fila. O `reorder_queue` exige a fila visível INTEIRA,
   * então compomos [tocando, aprovadas na ordem escolhida, pendentes] — as
   * pendentes ficam sempre no fim porque ainda não entraram na ordem do host.
   */
  async function commitOrder(approvedIds: string[]) {
    const nextApproved = approvedIds.filter((id) =>
      items.some((item) => item.id === id && item.status === "approved")
    );
    if (JSON.stringify(nextApproved) === JSON.stringify(approved.map((i) => i.id))) {
      return;
    }

    setDraftOrder(nextApproved);
    setBusy("order");
    const payload = composeQueueOrder({
      playing: playing.map((item) => item.id),
      pending: pending.map((item) => item.id),
      approved: nextApproved,
    });
    const result = await reorderQueueAction(roomId, payload);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível reordenar a fila.");
    }
    // A TV mostra a ordem da fila e a sala mostra a lista: sem o aviso, os dois
    // ficariam com a ordem antiga até o poll.
    await Promise.all([announcePlaybackChange(roomCode), announceQueueChange(roomCode)]);
    // O realtime também avisa, mas o fetch garante a ordem real (reconcilia
    // `STALE_QUEUE` e qualquer approve/remove que tenha corrido em paralelo).
    void fetchItems().finally(() => setDraftOrder(null));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const current = approved.map((item) => item.id);
    const from = current.indexOf(String(active.id));
    const to = current.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    void commitOrder(arrayMove(current, from, to));
  }

  const pending = items.filter((item) => item.status === "pending");
  // O host vê as pendentes no bloco de aprovação acima; para o participante elas
  // continuam na lista com o badge "aguardando aprovação".
  const rest = isHost ? items.filter((item) => item.status !== "pending") : items;
  const waiting = isHost ? pending : [];
  // Só o item em reprodução e as aprovadas formam a ordem que o host controla:
  // tocando fica fixo no topo e pendentes não entram no reorden.
  const playing = rest.filter((item) => item.status === "playing");
  const approved = rest.filter((item) => item.status === "approved");
  const approvedIds = draftOrder ?? approved.map((item) => item.id);
  const ordered = approvedIds
    .map((id) => approved.find((item) => item.id === id))
    .filter((item): item is QueueItem => Boolean(item));

  function requesterName(item: QueueItem) {
    if (item.added_by_user_id === currentUserId) return "você";
    return names.get(item.added_by_user_id) ?? "Participante";
  }

  function metaLine(item: QueueItem) {
    const duration = formatDurationSeconds(item.duration_seconds);
    return [duration, `pedido por ${requesterName(item)}`].filter(Boolean).join(" · ");
  }

  /** D1: o autor troca a própria música e o host troca qualquer uma; D3: nunca o que já tocou. */
  function canReplace(item: QueueItem) {
    const mine = item.added_by_user_id === currentUserId;
    // O espectador não tem o botão: trocar aponta para a tela de solicitação, que
    // ele não acessa. Tirar a própria música continua liberado — retirar não é
    // pedir, e o item dele precisa poder sair da fila.
    return canRequest && (mine || isHost) && ["pending", "approved"].includes(item.status);
  }

  function replaceButton(item: QueueItem) {
    if (!canReplace(item)) return null;
    return (
      <Button
        asChild
        size="icon"
        variant="ghost"
        aria-label={`Trocar ${item.title}`}
        title="Trocar esta música"
      >
        <Link href={`/salas/${roomCode}/buscar?trocar=${item.id}`}>
          <Repeat2 className="text-muted-foreground size-4" />
        </Link>
      </Button>
    );
  }

  function removeButton(item: QueueItem) {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        aria-label={`Remover ${item.title}`}
        disabled={busy === item.id}
        onClick={() => moderate(item, "remove")}
      >
        {busy === item.id ? (
          <LoaderCircle className="size-4 animate-spin" />
        ) : (
          <Trash2 className="text-muted-foreground size-4" />
        )}
      </Button>
    );
  }

  return (
    <Card className="border-dashed">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ListMusic className="text-muted-foreground size-4" />
          Fila de músicas
          {/* Fase 17: o host também pede música (quantas quiser na própria sala,
              o trigger `20261004000042` já isenta o dono do limite) — esconder o
              link dele era a última peça faltando para o pedido funcionar na UI. */}
          {canRequest && (
            <Link href={`/salas/${roomCode}/buscar`}>
              <Button size="sm" variant="outline">
                <Mic2 className="size-3.5" />
                Pedir música
              </Button>
            </Link>
          )}
        </CardTitle>
        {isHost ? (
          <CardDescription>
            {pending.length > 0
              ? `${pending.length} música${pending.length > 1 ? "s" : ""} aguardando sua aprovação.`
              : "As músicas pedidas chegam aqui na hora."}
          </CardDescription>
        ) : canRequest ? (
          <CardDescription>
            Sua sala atualiza ao vivo conforme o host aprova e o player toca.
          </CardDescription>
        ) : (
          /* Sem botão desabilitado: um controle que a pessoa vê e não funciona
             lê como defeito. A regra em uma frase, e a lista segue viva. */
          <CardDescription>{SPECTATOR_QUEUE_NOTICE}</CardDescription>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {waiting.length > 0 && (
          <section aria-label="Aguardando sua aprovação" className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
              Aguardando sua aprovação ({waiting.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {waiting.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="text-muted-foreground text-xs">{metaLine(item)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Aprovar ${item.title}`}
                      disabled={busy === item.id}
                      onClick={() => moderate(item, "approved")}
                    >
                      {busy === item.id ? (
                        <LoaderCircle className="size-4 animate-spin" />
                      ) : (
                        <Check className="size-4 text-emerald-500" />
                      )}
                      Aprovar
                    </Button>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Rejeitar ${item.title}`}
                      disabled={busy === item.id}
                      onClick={() => moderate(item, "rejected")}
                    >
                      <X className="size-4 text-rose-500" />
                    </Button>
                    {removeButton(item)}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 p-4 text-center">
            <p className="text-muted-foreground text-sm">
              {canRequest
                ? "A fila está vazia — peça a primeira música!"
                : "Nada tocando agora. A fila aparece aqui assim que o dono liberar uma música."}
            </p>
            {canRequest && (
              <Link href={`/salas/${roomCode}/buscar`}>
                <Button>
                  <Mic2 className="size-4" />
                  Pedir música
                </Button>
              </Link>
            )}
          </div>
        ) : (
          isHost &&
          ordered.length > 0 && (
            <p className="text-muted-foreground text-xs">
              Arraste ou use as setas para mudar a ordem das próximas músicas.
            </p>
          )
        )}

        {isHost && playing.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {playing.map((item) => (
              <QueueRow
                key={item.id}
                item={item}
                meta={metaLine(item)}
                trailing={removeButton(item)}
              />
            ))}
          </ul>
        )}

        {isHost
          ? ordered.length > 0 && (
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                modifiers={[restrictToVerticalAxis]}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={approvedIds}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="flex flex-col gap-1.5">
                    {ordered.map((item, index) => (
                      <SortableQueueRow
                        key={item.id}
                        item={item}
                        index={index}
                        total={ordered.length}
                        meta={metaLine(item)}
                        reorderable={busy !== "order"}
                        reorder={(direction) =>
                          void commitOrder(moveQueueItem(approvedIds, item.id, direction))
                        }
                        trailing={
                          <>
                            {replaceButton(item)}
                            {removeButton(item)}
                          </>
                        }
                      />
                    ))}
                  </ul>
                </SortableContext>
              </DndContext>
            )
          : rest.length > 0 && (
              <ul className="flex flex-col gap-1.5">
                {rest.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    meta={metaLine(item)}
                    trailing={
                      isHost ? (
                        removeButton(item)
                      ) : (
                        <>
                          {replaceButton(item)}
                          {item.added_by_user_id === currentUserId &&
                            ["pending", "approved"].includes(item.status) && (
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                disabled={busy === item.id}
                                onClick={() => moderate(item, "remove")}
                              >
                                {busy === item.id ? (
                                  <LoaderCircle className="size-4 animate-spin" />
                                ) : (
                                  <Trash2 className="size-4" />
                                )}
                                Tirar da fila
                              </Button>
                            )}
                        </>
                      )
                    }
                  />
                ))}
              </ul>
            )}
      </CardContent>
    </Card>
  );
}

type QueueRowProps = {
  item: QueueItem;
  meta: string;
  /** Controles à direita (aprovar/remover/trocar). */
  trailing?: ReactNode;
  /** Handle de arrasto do Bloco C (apenas nas aprovadas, só para o host). */
  handle?: ReactNode;
  /** Botões ⬆/⬇, acessíveis por teclado como alternativa ao arrasto. */
  arrows?: ReactNode;
  /** Props do `useSortable` quando a linha é arrastável. */
  sortable?: { ref: (node: HTMLLIElement | null) => void; style?: CSSProperties };
};

function QueueRow({ item, meta, trailing, handle, arrows, sortable }: QueueRowProps) {
  const view = queueStatusView(item.status);
  return (
    <li
      ref={sortable?.ref}
      style={sortable?.style}
      className={`border-border flex items-center gap-3 rounded-xl border p-2 ${
        view.isPlaying ? "border-emerald-500/50 bg-emerald-500/5" : ""
      }`}
    >
      {handle}
      <span className="text-muted-foreground font-mono text-xs font-semibold">
        #{item.position}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="text-muted-foreground text-xs">{meta}</p>
      </div>
      <Badge variant={view.variant} className="shrink-0 text-xs">
        {view.isPlaying && <Clock className="size-3" />}
        {view.label}
      </Badge>
      {arrows}
      {trailing}
    </li>
  );
}

type SortableQueueRowProps = Omit<QueueRowProps, "handle" | "arrows"> & {
  index: number;
  total: number;
  reorderable: boolean;
  reorder: (direction: "up" | "down") => void;
};

function SortableQueueRow({
  item,
  meta,
  trailing,
  index,
  total,
  reorderable,
  reorder,
}: SortableQueueRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({
      id: item.id,
      disabled: !reorderable,
    });

  return (
    <QueueRow
      item={item}
      meta={meta}
      trailing={trailing}
      sortable={{
        ref: setNodeRef,
        style: {
          transform: CSS.Transform.toString(transform),
          transition,
          zIndex: isDragging ? 10 : undefined,
          opacity: isDragging ? 0.7 : undefined,
        },
      }}
      handle={
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground cursor-grab touch-none rounded p-1 active:cursor-grabbing"
          aria-label={`Reordenar ${item.title}`}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
      }
      arrows={
        <div className="flex shrink-0 items-center">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Subir ${item.title}`}
            disabled={!reorderable || index === 0}
            onClick={() => reorder("up")}
          >
            <span aria-hidden>↑</span>
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label={`Descer ${item.title}`}
            disabled={!reorderable || index === total - 1}
            onClick={() => reorder("down")}
          >
            <span aria-hidden>↓</span>
          </Button>
        </div>
      }
    />
  );
}
