import Link from "next/link";
import {
  DoorOpen,
  Hourglass,
  Laugh,
  MapPin,
  Mic2,
  Power,
  QrCode,
  Settings2,
  Table2,
  UserRound,
  Store,
} from "lucide-react";

import { CreateBarDialog } from "@/components/bars/create-bar-dialog";
import { CreateRoomDialog } from "@/components/bars/create-room-dialog";
import { PendingEntryRequests } from "@/components/bars/pending-entry-requests";
import { getMyEntryRequestsAction } from "@/lib/bars/actions";
import { isDevAccount } from "@/lib/dev";
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
  const isDev = await isDevAccount(supabase);

  // Lista, não `maybeSingle`: até a Fase 8b·quater `bars.host_id` era UNIQUE e
  // o dev tinha uma casa só. O dev é isento do teto de 1 bar, então com 2+ bars
  // esta query ERRARIA (`maybeSingle` exige no máximo 1 linha) — daí a lista.
  const { data: myBars } = await supabase
    .from("bars")
    .select("*")
    .eq("host_id", user!.id)
    .order("criado_em", { ascending: true });

  const myBarsList = (myBars ?? []) as Bar[];

  const { data: hostedRooms } = await supabase
    .from("rooms_public")
    .select("*")
    .eq("host_id", user!.id)
    .order("created_at", { ascending: false });

  // Salas por bar, para o card de cada bar mostrar as suas e oferecer
  // "Adicionar sala" na bar certa.
  const roomsByBar = new Map<string, Room[]>();
  for (const room of hostedRooms ?? []) {
    if (!room.bar_id) continue;
    const list = roomsByBar.get(room.bar_id) ?? [];
    list.push(room as Room);
    roomsByBar.set(room.bar_id, list);
  }

  const { data: memberships } = await supabase
    .from("room_members")
    .select("room_id, status, mesa_numero")
    .eq("user_id", user!.id);

  const approvedRooms = (memberships ?? [])
    .filter((m) => m.status === "approved")
    .map((m) => ({ room_id: m.room_id, mesa: m.mesa_numero }));
  const pendingCount = (memberships ?? []).filter((m) => m.status === "pending").length;
  const pendingRequests = await getMyEntryRequestsAction();

  const visited: VisitedBar[] = [];
  if (approvedRooms.length > 0) {
    const approvedIds = approvedRooms.map((r) => r.room_id);
    const { data: rooms } = await supabase
      .from("rooms_public")
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

      {myBarsList.length > 0 ? (
        <section className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
              <Store className="size-4" />
              {myBarsList.length > 1 ? `Meus bares · ${myBarsList.length}` : "Meu bar"}
              {isDev && (
                <Badge variant="outline" className="text-xs">
                  dev
                </Badge>
              )}
            </h2>
            {isDev && !isAnonymous && (
              <CreateBarDialog
                triggerLabel="Criar bar"
                triggerVariant="outline"
                triggerSize="sm"
              />
            )}
          </div>

          <div className="flex flex-col gap-2">
            {myBarsList.map((bar) => {
              const barRooms = roomsByBar.get(bar.id) ?? [];
              const activeCount = barRooms.filter((r) => r.status === "active").length;
              const primary = barRooms[0];
              return (
                <div
                  key={bar.id}
                  className="hover:bg-secondary/40 flex flex-col gap-3 rounded-xl border p-4 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-col gap-0.5">
                      <span className="flex items-center gap-2">
                        {primary ? (
                          <Link
                            href={`/salas/${primary.code}`}
                            className="hover:underline"
                          >
                            <span className="text-lg font-semibold">{bar.nome}</span>
                          </Link>
                        ) : (
                          <span className="text-lg font-semibold">{bar.nome}</span>
                        )}
                        <span className="border-border bg-secondary/40 rounded-md border px-2 py-0.5 font-mono text-xs tracking-[0.2em]">
                          {bar.code}
                        </span>
                      </span>
                      <p className="text-muted-foreground flex items-center gap-1.5 text-sm">
                        <Table2 className="size-3.5" />
                        {bar.quantidade_mesas} mesa{bar.quantidade_mesas > 1 ? "s" : ""}
                        {bar.cidade && (
                          <>
                            <span className="text-border">·</span>
                            <MapPin className="size-3.5" />
                            {bar.cidade}
                          </>
                        )}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      {barRooms.length === 0 ? (
                        <Badge variant="outline" className="text-xs">
                          sem sala ainda
                        </Badge>
                      ) : activeCount === 0 ? (
                        <Badge variant="destructive" className="text-xs">
                          <Power className="size-3" />
                          encerrado — reabra pelo karaokê
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="text-xs">
                          <QrCode className="size-3" />
                          {activeCount} karaokê {activeCount > 1 ? "ativos" : "ativo"}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {barRooms.map((room) => (
                      <Button key={room.id} asChild variant="secondary" size="xs">
                        <Link href={`/salas/${room.code}`}>
                          <Mic2 className="size-3" />
                          {room.code}
                          {room.status === "closed" ? " · encerrada" : ""}
                        </Link>
                      </Button>
                    ))}
                    {/* Multi-sala é privilégio do dev (migration 00035): para os
                        demais a regra do produto continua 1 bar = 1 karaokê, e
                        mostrar o botão só levaria a um erro do banco. */}
                    {isDev && <CreateRoomDialog barId={bar.id} barName={bar.nome} />}
                    {/* Fase 17: raio de presença e busca do YouTube saíram das
                        salas e viraram a tela do bar — só ela é acessível ao
                        dono, checado na página. */}
                    <Button asChild variant="outline" size="xs">
                      <Link href={`/bar/${bar.code}`}>
                        <Settings2 className="size-3" />
                        Bar
                      </Link>
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
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

      {pendingRequests.length > 0 && (
        <section className="flex flex-col gap-2">
          <h2 className="text-muted-foreground flex items-center gap-2 text-sm font-semibold">
            <Hourglass className="size-4" />
            Entradas aguardando aprovação · {pendingRequests.length}
          </h2>
          <PendingEntryRequests requests={pendingRequests} />
        </section>
      )}

      {pendingCount > 0 && pendingRequests.length === 0 && (
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

      {myBarsList.length === 0 && visited.length === 0 && pendingCount === 0 && (
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
