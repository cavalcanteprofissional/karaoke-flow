"use client";

import { useCallback, useEffect, useState } from "react";
import { ListMusic, Mic2 } from "lucide-react";
import Link from "next/link";

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
import { formatDurationSeconds } from "@/lib/youtube/format";

export type QueueItem = {
  id: string;
  title: string;
  status: string;
  position: number;
  duration_seconds: number | null;
  thumbnail_url: string | null;
  added_by_user_id: string;
};

type QueueListProps = {
  roomId: string;
  roomCode: string;
  initial: QueueItem[];
  isHost: boolean;
};

const VISIBLE_STATUSES = ["pending", "approved", "playing"];

function statusLabel(status: string) {
  switch (status) {
    case "playing":
      return <Badge variant="secondary">tocando</Badge>;
    case "pending":
      return <Badge variant="outline">pendente</Badge>;
    default:
      return <Badge>na fila</Badge>;
  }
}

export function QueueList({ roomId, roomCode, initial, isHost }: QueueListProps) {
  const [items, setItems] = useState<QueueItem[]>(initial);

  const fetchItems = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("queue_items")
      .select("id, title, status, position, duration_seconds, thumbnail_url, added_by_user_id")
      .eq("room_id", roomId)
      .in("status", VISIBLE_STATUSES)
      .order("position", { ascending: true })
      .limit(100);
    if (data) setItems(data);
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [roomId, fetchItems]);

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
            ? "As músicas pedidas chegam aqui na hora."
            : "Sua sala atualiza ao vivo conforme o host aprova e o player toca."}
        </CardDescription>
      </CardHeader>
      <CardContent>
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
          <ul className="flex flex-col gap-1.5">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-xl border-border border p-2"
              >
                <span className="text-muted-foreground font-mono text-xs font-semibold">
                  #{item.position}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{item.title}</p>
                  {item.duration_seconds !== null && (
                    <p className="text-muted-foreground text-xs">
                      {formatDurationSeconds(item.duration_seconds)}
                    </p>
                  )}
                </div>
                {statusLabel(item.status)}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}