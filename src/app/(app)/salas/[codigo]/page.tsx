import Link from "next/link";
import { redirect } from "next/navigation";
import { DoorOpen, Lock, Power, QrCode, Store, Table2, User } from "lucide-react";

import { EntryApprovalWait } from "@/components/bars/entry-approval-wait";
import { MesaPicker } from "@/components/rooms/mesa-picker";
import { PendingEntries } from "@/components/rooms/pending-entries";
import type { PendingEntry } from "@/components/rooms/pending-entries";
import { QueueList } from "@/components/rooms/queue-list";
import type { QueueItem } from "@/components/rooms/queue-list";
import { RoomQr } from "@/components/rooms/room-qr";
import { RoomSettings } from "@/components/rooms/room-settings";
import { CloseRoomButton } from "@/components/rooms/close-room-button";
import { LeaveRoomButton } from "@/components/rooms/leave-room-button";
import { MesaQrDialog } from "@/components/rooms/mesa-qr-dialog";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { barJoinUrl } from "@/lib/bars/qr";
import { getEntryPreviewAction } from "@/lib/bars/actions";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";
import type { Bar } from "@/types/bar";

type RoomPageProps = {
  params: Promise<{ codigo: string }>;
};

function RoomClosedNotice() {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
      <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
        <Power className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="font-medium">Esta sala foi encerrada</p>
        <p className="text-muted-foreground text-sm">
          O dono encerrou o karaokê: a fila foi cancelada e a sala ficou indisponível.
        </p>
      </div>
      <Link
        href="/dashboard"
        className="bg-primary text-primary-foreground rounded-xl px-6 py-3 text-sm font-semibold"
      >
        Voltar ao início
      </Link>
    </div>
  );
}

export default async function RoomPage({ params }: RoomPageProps) {
  const { codigo } = await params;
  const code = normalizeRoomCode(codigo);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .from("rooms")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (!room) {
    const entryResult = await getEntryPreviewAction(code);
    if (!("error" in entryResult) && entryResult.membership) {
      return (
        <EntryApprovalWait
          roomId={entryResult.preview.room_id}
          roomCode={entryResult.preview.room_code}
          barName={entryResult.preview.bar_nome}
          mesa={entryResult.membership.mesa_numero}
          initialStatus={entryResult.membership.status}
          destination={null}
        />
      );
    }
    if ("error" in entryResult && /encerrada/i.test(entryResult.error)) {
      return <RoomClosedNotice />;
    }

    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
        <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
          <Lock className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">Você ainda não entrou neste karaokê</p>
          <p className="text-muted-foreground text-sm">
            Entre pelo QR ou pelo código para ver a fila e pedir músicas.
          </p>
        </div>
        <Link
          href={`/entrar?code=${code}`}
          className="bg-primary text-primary-foreground rounded-xl px-6 py-3 text-sm font-semibold"
        >
          Entrar na sala {code}
        </Link>
      </div>
    );
  }

  const isHost = room.host_id === user.id;
  const closed = room.status === "closed";

  if (closed && !isHost) {
    return <RoomClosedNotice />;
  }

  const { data: hostProfile } = await supabase
    .from("profiles_public")
    .select("name")
    .eq("id", room.host_id)
    .maybeSingle();
  const hostName = hostProfile?.name ?? "Dono";

  let bar: Bar | null | undefined;
  if (room.bar_id) {
    const { data: barData } = await supabase
      .from("bars")
      .select("*")
      .eq("id", room.bar_id)
      .maybeSingle();
    bar = barData;
  }

  let myMembership:
    { status?: string | null; mesa_numero?: number | null } | null | undefined;
  if (!isHost) {
    const { data: membership } = await supabase
      .from("room_members")
      .select("status, mesa_numero")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();
    myMembership = membership;
  }
  const myMesa = myMembership?.mesa_numero ?? null;
  const isPendingMember = myMembership?.status === "pending";
  const needsMesa = (myMembership?.status ?? null) === "approved" && myMesa == null;

  let pendingInitial: PendingEntry[] = [];
  if (isHost) {
    const { data: members } = await supabase
      .from("room_members")
      .select("user_id, joined_at")
      .eq("room_id", room.id)
      .eq("status", "pending");

    const list = members ?? [];
    const profileIds = list.map((m) => m.user_id);
    let names = new Map<string, string>();
    if (profileIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, name")
        .in("id", profileIds);
      names = new Map((profiles ?? []).map((p) => [p.id, p.name]));
    }
    pendingInitial = list.map((m) => ({
      user_id: m.user_id,
      name: names.get(m.user_id) ?? "Participante",
      joined_at: m.joined_at,
    }));
  }

  const { data: queueRows } = await supabase
    .from("queue_items")
    .select(
      "id, title, status, position, duration_seconds, thumbnail_url, added_by_user_id"
    )
    .eq("room_id", room.id)
    .in("status", ["pending", "approved", "playing"])
    .order("position", { ascending: true })
    .limit(100);
  const queueInitial = (queueRows ?? []) as QueueItem[];

  let youtubeConnectedAt: string | null = null;
  if (isHost) {
    const { data: oauth } = await createAdmin()
      .from("youtube_oauth_tokens")
      .select("updated_at")
      .eq("host_id", user.id)
      .maybeSingle();
    youtubeConnectedAt = oauth?.updated_at ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="font-mono text-2xl font-bold tracking-[0.2em]">
                {room.code}
              </h1>
              {closed && (
                <Badge variant="destructive">
                  <Power className="size-3" />
                  encerrada
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:gap-1.5">
              {isHost ? (
                <span className="flex items-center gap-1.5">
                  <Store className="size-3.5" />
                  Seu karaokê
                  {bar && (
                    <>
                      <span className="text-border">·</span>
                      {bar.nome} ({bar.code})
                    </>
                  )}
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  {bar ? (
                    <>
                      <Store className="size-3.5" />
                      {bar.nome} ({bar.code})
                    </>
                  ) : (
                    <>
                      <User className="size-3.5" />
                      Sala de {hostName}
                    </>
                  )}
                  {myMesa && (
                    <>
                      <span className="text-border">·</span>
                      <Table2 className="size-3.5" />
                      Mesa {myMesa}
                    </>
                  )}
                </span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-1.5">
            <Badge variant="secondary">
              {room.entry_mode === "open" ? (
                <DoorOpen className="size-3" />
              ) : (
                <Lock className="size-3" />
              )}
              {room.entry_mode === "open" ? "livre" : "c/ aprovação"}
            </Badge>
            <Badge variant="outline">
              {room.queue_approval_mode === "auto" ? "fila automática" : "fila manual"}
            </Badge>
          </div>
        </div>
      </section>

      {isHost && bar && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <QrCode className="text-muted-foreground size-4" />
              Cartaz e QR das mesas
            </CardTitle>
            <CardDescription>
              QR do bar para quem ainda vai escolher a mesa; QR de cada mesa para a galera
              entrar direto na sala.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="flex justify-center">
              <RoomQr
                value={barJoinUrl(bar.code)}
                alt={`QR do bar ${bar.nome}`}
                fileName={`qr-bar-${bar.code}.png`}
              />
            </div>
            {bar.quantidade_mesas > 1 && (
              <div className="flex justify-center">
                <MesaQrDialog
                  barCode={bar.code}
                  barNome={bar.nome}
                  quantidadeMesas={bar.quantidade_mesas}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {isHost && (
        <RoomSettings
          roomId={room.id}
          roomCode={code}
          initial={{
            entry_mode: room.entry_mode,
            queue_approval_mode: room.queue_approval_mode,
            require_song_confirmation: room.require_song_confirmation,
            youtube_api_key: room.youtube_api_key ?? null,
          }}
          youtubeConnectedAt={youtubeConnectedAt}
        />
      )}

      {isHost && <PendingEntries roomId={room.id} initial={pendingInitial} />}

      {!isHost && isPendingMember && (
        <EntryApprovalWait
          roomId={room.id}
          roomCode={room.code}
          barName={bar?.nome ?? hostName}
          mesa={myMesa}
          destination={null}
        />
      )}

      {!isHost && needsMesa && bar && (
        <MesaPicker roomId={room.id} quantidadeMesas={bar.quantidade_mesas} />
      )}

      {(isHost ? true : !isPendingMember && !needsMesa) && (
        <QueueList
          roomId={room.id}
          roomCode={code}
          initial={queueInitial}
          isHost={isHost}
        />
      )}

      {isHost ? (
        <CloseRoomButton roomId={room.id} closed={closed} />
      ) : (
        <LeaveRoomButton roomId={room.id} />
      )}
    </div>
  );
}
