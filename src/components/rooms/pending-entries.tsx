"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, LoaderCircle, UserCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { decideEntryAction } from "@/lib/rooms/actions";
import { createClient } from "@/lib/supabase/client";

export type PendingEntry = {
  user_id: string;
  name: string;
  joined_at: string;
};

type PendingEntriesProps = {
  roomId: string;
  initial: PendingEntry[];
};

export function PendingEntries({ roomId, initial }: PendingEntriesProps) {
  const [entries, setEntries] = useState<PendingEntry[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data: members } = await supabase
      .from("room_members")
      .select("user_id, joined_at")
      .eq("room_id", roomId)
      .eq("status", "pending");

    const list = members ?? [];
    let names = new Map<string, string>();
    if (list.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, name")
        .in(
          "id",
          list.map((m) => m.user_id)
        );
      names = new Map((profiles ?? []).map((p) => [p.id, p.name]));
    }

    setEntries(
      list.map((m) => ({
        user_id: m.user_id,
        name: names.get(m.user_id) ?? "Participante",
        joined_at: m.joined_at,
      }))
    );
  }, [roomId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`entries:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        () => load()
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        () => load()
      )
      .subscribe(() => load());

    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  async function decide(userId: string, status: "approved" | "rejected") {
    setBusy(userId);
    const result = await decideEntryAction(roomId, userId, status);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "Não foi possível atualizar o pedido.");
      return;
    }
    setEntries((prev) => prev.filter((e) => e.user_id !== userId));
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="text-muted-foreground size-4" />
          Pedidos de entrada
        </CardTitle>
        <CardDescription>
          {entries.length === 0
            ? "Nenhum pedido aguardando aprovação."
            : "Entre aprovar e rejeitar, sem sair da tela."}
        </CardDescription>
      </CardHeader>

      {entries.length > 0 && (
        <CardContent className="flex flex-col gap-2">
          {entries.map((entry) => (
            <div
              key={entry.user_id}
              className="flex items-center justify-between gap-3 rounded-xl border p-3"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="bg-secondary text-secondary-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
                  <UserPlus className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{entry.name}</p>
                  <p className="text-muted-foreground text-xs">aguardando aprovação</p>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="outline" className="text-xs">
                  novo
                </Badge>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Aprovar ${entry.name}`}
                  disabled={busy === entry.user_id}
                  onClick={() => decide(entry.user_id, "approved")}
                >
                  {busy === entry.user_id ? (
                    <LoaderCircle className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4 text-emerald-500" />
                  )}
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label={`Rejeitar ${entry.name}`}
                  disabled={busy === entry.user_id}
                  onClick={() => decide(entry.user_id, "rejected")}
                >
                  <X className="size-4 text-rose-500" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
