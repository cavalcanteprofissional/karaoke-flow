import Link from "next/link";
import { DoorOpen, Laugh, Music2, Plus, Radio, UserRound } from "lucide-react";

import { CreateRoomButton } from "@/components/rooms/create-room-button";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import type { Room } from "@/types/room";

function RoomLinkCard({ room, relation }: { room: Room; relation: "host" | "member" }) {
  return (
    <Link
      href={`/salas/${room.code}`}
      className="group hover:bg-secondary/40 rounded-xl border p-4 transition-colors"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-0.5">
          <span className="flex items-center gap-2">
            <span className="font-mono text-lg font-semibold tracking-[0.15em]">
              {room.code}
            </span>
            {room.status === "closed" && <Badge variant="outline">encerrada</Badge>}
          </span>
          <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
            {relation === "host" ? (
              <>
                <Radio className="size-3.5" />
                você é o dono
              </>
            ) : (
              <>
                <UserRound className="size-3.5" />
                você participa
              </>
            )}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="secondary" className="text-xs">
            {room.entry_mode === "open" ? "entrada livre" : "c/ aprovação"}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {room.queue_approval_mode === "auto" ? "fila automática" : "fila manual"}
          </Badge>
        </div>
      </div>
    </Link>
  );
}

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = user?.user_metadata.full_name ?? user?.email ?? "pessoa";

  const { data: hosted } = await supabase
    .from("rooms")
    .select("*")
    .eq("host_id", user!.id)
    .order("created_at", { ascending: false });

  const { data: memberships } = await supabase
    .from("room_members")
    .select("room_id, status")
    .eq("user_id", user!.id);

  const approvedIds = (memberships ?? [])
    .filter((m) => m.status === "approved")
    .map((m) => m.room_id);
  const pendingCount = (memberships ?? []).filter((m) => m.status === "pending").length;

  let memberRooms: Room[] = [];
  if (approvedIds.length > 0) {
    const { data } = await supabase.from("rooms").select("*").in("id", approvedIds);
    memberRooms = data ?? [];
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Olá, {displayName}</h1>
        <p className="text-muted-foreground text-sm">
          Crie uma sala para a noite ou entre em uma que já está rolando.
        </p>
      </section>

      <div className="grid grid-cols-2 gap-2">
        <CreateRoomButton />
        <Button asChild variant="outline" className="w-full">
          <Link href="/entrar">
            <DoorOpen className="size-4" />
            Entrar numa sala
          </Link>
        </Button>
      </div>

      {hosted && hosted.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
            <Plus className="size-4" />
            Suas salas (dono)
          </h2>
          <div className="flex flex-col gap-2">
            {hosted.map((room) => (
              <RoomLinkCard key={room.id} room={room} relation="host" />
            ))}
          </div>
        </section>
      )}

      {memberRooms.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
            <Music2 className="size-4" />
            Salas em que participo
          </h2>
          <div className="flex flex-col gap-2">
            {memberRooms.map((room) => (
              <RoomLinkCard key={room.id} room={room} relation="member" />
            ))}
          </div>
        </section>
      )}

      {pendingCount > 0 && (
        <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="text-base">Entradas aguardando aprovação</CardTitle>
            <CardDescription>
              Você tem {pendingCount} pedido{pendingCount > 1 ? "s" : ""} de entrada
              pendente{pendingCount > 1 ? "s" : ""}. Quando o dono aprovar, a sala aparece
              aqui.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary" size="sm">
              <Link href="/entrar">Ver código de uma sala</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!hosted?.length && memberRooms.length === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
              <Laugh className="size-6" />
            </span>
            <CardTitle className="text-base">Nenhuma sala ainda</CardTitle>
            <CardDescription>
              Crie a primeira para começar a noite — o QR sai na hora.
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
