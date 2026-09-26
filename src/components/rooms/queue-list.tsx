"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Clock, ListMusic, LoaderCircle, Mic2, Trash2, X } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

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
import { QUEUE_VISIBLE_STATUSES, queueStatusView } from "@/lib/rooms/queue";
import {
  removeQueueItemAction,
  setQueueItemStatusAction,
} from "@/lib/rooms/queue-actions";
import { formatDurationSeconds } from "@/lib/youtube/format";

export type QueueItem = {
  id: string;
  title: string;
  status: string;
  position: number;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  added_by_user_id: string;
  /** Guardado para o Bloco D (trocar a música) — o `QueueList` não usa ainda. */
  youtube_video_id: string;
};

type QueueListProps = {
  roomId: string;
  roomCode: string;
  initial: QueueItem[];
  isHost: boolean;
  currentUserId: string;
};

export function QueueList({
  roomId,
  roomCode,
  initial,
  isHost,
  currentUserId,
}: QueueListProps) {
  const [items, setItems] = useState<QueueItem[]>(initial);
  const [names, setNames] = useState<Map<string, string | null>>(new Map());
  const [busy, setBusy] = useState<string | null>(null);

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

  useEffect(() => {
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

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, fetchItems]);

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
    // Reconcilia posição/status (o trigger `touch_updated_at` também dispara o realtime).
    void fetchItems();
  }

  const pending = items.filter((item) => item.status === "pending");
  // O host vê as pendentes no bloco de aprovação acima; para o participante elas
  // continuam na lista com o badge "aguardando aprovação".
  const rest = isHost ? items.filter((item) => item.status !== "pending") : items;
  const waiting = isHost ? pending : [];

  function requesterName(item: QueueItem) {
    if (item.added_by_user_id === currentUserId) return "você";
    return names.get(item.added_by_user_id) ?? "Participante";
  }

  function metaLine(item: QueueItem) {
    const duration = formatDurationSeconds(item.duration_seconds);
    return [duration, `pedido por ${requesterName(item)}`].filter(Boolean).join(" · ");
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
          {!isHost && (
            <Link href={`/salas/${roomCode}/buscar`}>
              <Button size="sm" variant="outline">
                <Mic2 className="size-3.5" />
                Pedir música
              </Button>
            </Link>
          )}
        </CardTitle>
        <CardDescription>
          {isHost
            ? pending.length > 0
              ? `${pending.length} música${pending.length > 1 ? "s" : ""} aguardando sua aprovação.`
              : "As músicas pedidas chegam aqui na hora."
            : "Sua sala atualiza ao vivo conforme o host aprova e o player toca."}
        </CardDescription>
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
              A fila está vazia — peça a primeira música!
            </p>
            {!isHost && (
              <Link href={`/salas/${roomCode}/buscar`}>
                <Button>
                  <Mic2 className="size-4" />
                  Pedir música
                </Button>
              </Link>
            )}
          </div>
        ) : (
          rest.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {rest.map((item) => {
                const view = queueStatusView(item.status);
                return (
                  <li
                    key={item.id}
                    className={`border-border flex items-center gap-3 rounded-xl border p-2 ${
                      view.isPlaying ? "border-emerald-500/50 bg-emerald-500/5" : ""
                    }`}
                  >
                    <span className="text-muted-foreground font-mono text-xs font-semibold">
                      #{item.position}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{item.title}</p>
                      <p className="text-muted-foreground text-xs">{metaLine(item)}</p>
                    </div>
                    <Badge variant={view.variant} className="shrink-0 text-xs">
                      {view.isPlaying && <Clock className="size-3" />}
                      {view.label}
                    </Badge>
                    {isHost && removeButton(item)}
                  </li>
                );
              })}
            </ul>
          )
        )}
      </CardContent>
    </Card>
  );
}
