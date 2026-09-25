import Link from "next/link";
import {
  DoorOpen,
  Laugh,
  MapPin,
  Plus,
  Power,
  QrCode,
  Table2,
  UserRound,
  Store,
} from "lucide-react";

import { CreateBarDialog } from "@/components/bars/create-bar-dialog";
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
import type { Bar } from "@/types/bar";
import type { MemberStatus, Room } from "@/types/room";

type VisitedBar = {
  bar: Bar;
  room: Room;
  mesa: number | null;
  status: MemberStatus;
};

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const displayName = user?.user_metadata.full_name ?? user?.email ?? "pessoa";
  const isAnonymous = user?.is_anonymous ?? user?.app_metadata?.is_anonymous === true;

  const { data: myBar } = await supabase
    .from("bars")
    .select("*")
    .eq("host_id", user!.id)
    .maybeSingle<Bar>();

  const { data: hostedRooms } = await supabase
    .from("rooms")
    .select("*")
    .eq("host_id", user!.id)
    .order("created_at", { ascending: false });

  const activeHostedCount = (hostedRooms ?? []).filter(
    (r) => r.status === "active"
  ).length;

  const { data: memberships } = await supabase
    .from("room_members")
    .select("room_id, status, mesa_numero")
    .eq("user_id", user!.id);

  const approvedRooms = (memberships ?? [])
    .filter((m) => m.status === "approved")
    .map((m) => ({ room_id: m.room_id, mesa: m.mesa_numero }));
  const pendingCount = (memberships ?? []).filter((m) => m.status === "pending").length;

  const visited: VisitedBar[] = [];
  if (approvedRooms.length > 0) {
    const approvedIds = approvedRooms.map((r) => r.room_id);
    const { data: rooms } = await supabase
      .from("rooms")
      .select("*")
      .in("id", approvedIds);

    const memberBars = new Map<string, Bar>();
    const barIds = [...new Set(rooms?.map((r) => r.bar_id).filter(Boolean))] as string[];
    if (barIds.length > 0) {
      const { data: bars } = await supabase.from("bars").select("*").in("id", barIds);
      for (const bar of bars ?? []) memberBars.set(bar.id, bar);
    }

    for (const m of approvedRooms) {
      const room = rooms?.find((r) => r.id === m.room_id);
      if (!room) continue;
      const bar = room.bar_id ? memberBars.get(room.bar_id) : undefined;
      if (!bar) continue;
      visited.push({ bar, room, mesa: m.mesa, status: "approved" });
    }
    visited.sort((a, b) => a.bar.nome.localeCompare(b.bar.nome, "pt-BR"));
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">Olá, {displayName}</h1>
        <p className="text-muted-foreground text-sm">
          Seu bar na tela da casa, sua mesa na mão.
        </p>
        {isAnonymous && (
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <UserRound className="size-3.5" />
            Você está como visitante. Para criar o seu bar,{" "}
            <Link href="/login" className="text-primary underline underline-offset-2">
              crie uma conta
            </Link>
            .
          </p>
        )}
      </section>

      {myBar ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
              <Store className="size-4" />
              Meu bar
            </h2>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
              title="Multi-sala chega em uma fase futura"
            >
              <Plus className="size-4" />
              Adicionar sala
            </Button>
          </div>
          <Link
            href={hostedRooms?.[0] ? `/salas/${hostedRooms[0].code}` : "/entrar"}
            className="group hover:bg-secondary/40 rounded-xl border p-4 transition-colors"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="text-lg font-semibold">{myBar.nome}</span>
                  <span className="border-border bg-secondary/40 rounded-md border px-2 py-0.5 font-mono text-xs tracking-[0.2em]">
                    {myBar.code}
                  </span>
                </span>
                <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                  <Table2 className="size-3.5" />
                  {myBar.quantidade_mesas} mesa{myBar.quantidade_mesas > 1 ? "s" : ""}
                  {myBar.cidade && (
                    <>
                      <span className="text-border">·</span>
                      <MapPin className="size-3.5" />
                      {myBar.cidade}
                    </>
                  )}
                </p>
              </div>
              <div className="flex flex-col items-end gap-1">
                {activeHostedCount === 0 && (hostedRooms?.length ?? 0) > 0 ? (
                  <Badge variant="destructive" className="text-xs">
                    <Power className="size-3" />
                    encerrado — reabra pelo karaokê
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs">
                    <QrCode className="size-3" />
                    {activeHostedCount} karaokê{" "}
                    {activeHostedCount > 1 ? "ativos" : "ativo"}
                  </Badge>
                )}
              </div>
            </div>
          </Link>
        </section>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          {!isAnonymous && <CreateBarDialog />}
          <Button asChild variant="outline" className="w-full">
            <Link href="/entrar">
              <DoorOpen className="size-4" />
              Entrar numa casa
            </Link>
          </Button>
        </div>
      )}

      {visited.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
            <Laugh className="size-4" />
            Bares que frequento · {visited.length}
          </h2>
          <div className="flex flex-col gap-2">
            {visited.map(({ bar, room, mesa }) => (
              <Link
                key={room.id}
                href={`/salas/${room.code}`}
                className="group hover:bg-secondary/40 rounded-xl border p-4 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <span className="flex items-center gap-2">
                      <span className="font-medium">{bar.nome}</span>
                      <span className="border-border bg-secondary/40 rounded-md border px-2 py-0.5 font-mono text-xs tracking-[0.2em]">
                        {bar.code}
                      </span>
                    </span>
                    <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                      <Table2 className="size-3.5" />
                      {mesa ? `Mesa ${mesa} · ` : ""}
                      sala {room.code}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge variant="secondary" className="text-xs">
                      {room.entry_mode === "open" ? "entrada livre" : "c/ aprovação"}
                    </Badge>
                    {room.status === "closed" && (
                      <Badge variant="outline" className="text-xs">
                        encerrada
                      </Badge>
                    )}
                  </div>
                </div>
              </Link>
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
              pendente{pendingCount > 1 ? "s" : ""}. Quando o dono aprovar, o bar aparece
              aqui.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="secondary" size="sm">
              <Link href="/entrar">Ver código de uma casa</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {!myBar && visited.length === 0 && pendingCount === 0 && (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
            <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
              <Store className="size-6" />
            </span>
            <CardTitle className="text-base">Nada por aqui ainda</CardTitle>
            <CardDescription>
              {isAnonymous
                ? "Crie uma conta para montar o seu bar — ou entre em uma casa pelo QR."
                : "Crie o seu bar e o QR das mesas sai na hora."}
            </CardDescription>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
