import Link from "next/link";
import { redirect } from "next/navigation";
import { DoorOpen, Lock, Power, QrCode, Store, Table2, Tv, User } from "lucide-react";

import { EntryApprovalWait } from "@/components/bars/entry-approval-wait";
import { MesaPicker } from "@/components/rooms/mesa-picker";
import { PendingEntries } from "@/components/rooms/pending-entries";
import type { PendingEntry } from "@/components/rooms/pending-entries";
import { QueueList } from "@/components/rooms/queue-list";
import { PlaybackControls } from "@/components/rooms/playback-controls";
import type { QueueItem } from "@/components/rooms/queue-list";
import { QUEUE_VISIBLE_STATUSES } from "@/lib/rooms/queue";
import { BarQr } from "@/components/rooms/bar-qr";
import { RoomSettings } from "@/components/rooms/room-settings";
import { CloseRoomButton } from "@/components/rooms/close-room-button";
import { LeaveRoomButton } from "@/components/rooms/leave-room-button";
import { MesaQrDialog } from "@/components/rooms/mesa-qr-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getEntryPreviewAction } from "@/lib/bars/actions";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";
import { getMemberEntryState } from "@/lib/rooms/entry-state";
import { canPickMesa, canRequestSongs } from "@/lib/rooms/spectator";
import type { Bar } from "@/types/bar";
import type { MemberEntryState } from "@/types/room";

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

  // `rooms_public` é a view da migration 20260930038 (F1/F2 da auditoria de
  // RLS): mesmas 14 colunas de sempre, sem a credencial da TV e sem a chave de
  // API, que passaram a sair por RPC host-only. Leia `rooms` direto e o banco
  // responde `permission denied` — o `select *` cobre as colunas revogadas.
  const { data: room } = await supabase
    .from("rooms_public")
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
          // O destino é a própria sala, aprovada ou não: fora do raio a sala já
          // é uma visão válida de espectador (fila viva, sem mesa, sem pedido de
          // música). Mandar para o `/player` punia quem assistia de celular com a
          // tela cheia da TV — texto grande e alto contraste para 3 metros.
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

  let myMembership: MemberEntryState | null | undefined;
  if (!isHost) {
    // Status efetivo (regra das 24h), não a linha crua: aprovada há mais de 24h
    // volta a ser `pending` e a pessoa vê a tela de aprovação outra vez.
    const entry = await getMemberEntryState(room.id);
    myMembership = entry.ok ? entry.state : null;
  }
  const myMesa = myMembership?.mesa_numero ?? null;
  const isPendingMember = myMembership?.status === "pending";
  // O que a tela pode **oferecer** é uma função só, e mora em `spectator.ts`:
  // fora do raio (gravado no join, migration 20261003000040), nem mesa nem
  // pedido de música — a pessoa assiste.
  const podePedir = canRequestSongs({ isHost, membership: myMembership ?? null });
  const podeEscolherMesa = canPickMesa({ isHost, membership: myMembership ?? null });
  // Fase 16: bar de mesa única não pergunta. Quem entra já nasce com a mesa 1
  // gravada pelo `join_room` (migration 20261008000001); o `quantidade_mesas > 1`
  // aqui cobre quem entrou antes da regra e membro antigo sem mesa — sem ele o
  // MesaPicker apareceria para a pessoa escolher a única opção possível.
  const needsMesa =
    (myMembership?.status ?? null) === "approved" &&
    myMesa == null &&
    podeEscolherMesa &&
    (bar?.quantidade_mesas ?? 0) > 1;
  // Assistir é opt-in e liberado para qualquer membro aprovado — dentro ou fora
  // do raio. A porta do player (a migration 20260927000029) exige `approved`, por
  // isso o botão não aparece para quem está pendente. Sem token: o quiosque
  // nesse caminho é só leitura, e ninguém vê a credencial da TV.
  const podeVerPlayer = !isHost && (myMembership?.status ?? null) === "approved";

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
      "id, title, status, position, duration_seconds, thumbnail_url, added_by_user_id, youtube_video_id"
    )
    .eq("room_id", room.id)
    .in("status", QUEUE_VISIBLE_STATUSES)
    .order("position", { ascending: true })
    .limit(100);
  const queueInitial = (queueRows ?? []) as QueueItem[];

  let youtubeConnectedAt: string | null = null;
  // Os dois segredos da sala (credencial do link da TV e chave de API do
  // YouTube) saíram do alcance do papel `authenticated` na migration
  // `20260930000038`: a coluna não é mais legível pelo client, e sim por RPC
  // `security definer` que só obedece ao dono. Aqui é o único lugar que precisa
  // deles, e só quando `isHost` — que é exatamente quem as RPCs autorizam.
  // O client é o do USUÁRIO (não o `createAdmin()`): o `auth.uid()` de dentro da
  // RPC é o que faz a checagem de vínculo, e ele só existe com o JWT da sessão.
  let playerToken: string | null = null;
  let youtubeApiKey: string | null = null;
  if (isHost) {
    const [tokenRes, keyRes] = await Promise.all([
      supabase.rpc("admin_get_room_player_token", { p_room_id: room.id }),
      supabase.rpc("admin_get_room_youtube_api_key", { p_room_id: room.id }),
    ]);
    playerToken = tokenRes.data ?? null;
    youtubeApiKey = keyRes.data ?? null;

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
            {podeVerPlayer && (
              <Button asChild size="sm" variant="outline">
                <Link href={`/player/${room.code}`}>
                  <Tv className="size-3" />
                  Ver o player
                </Link>
              </Button>
            )}
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
              <BarQr barCode={bar.code} barNome={bar.nome} />
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
            pre_approval_24h: room.pre_approval_24h,
            youtube_api_key: youtubeApiKey,
          }}
          youtubeConnectedAt={youtubeConnectedAt}
          bar={
            bar
              ? {
                  id: bar.id,
                  nome: bar.nome,
                  endereco: bar.endereco,
                  cidade: bar.cidade,
                  latitude: bar.latitude,
                  longitude: bar.longitude,
                  raio_permitido_metros: bar.raio_permitido_metros,
                  quantidade_mesas: bar.quantidade_mesas,
                }
              : null
          }
        />
      )}

      {isHost && <PendingEntries roomId={room.id} initial={pendingInitial} />}

      {!isHost && isPendingMember && (
        <EntryApprovalWait
          roomId={room.id}
          roomCode={room.code}
          barName={bar?.nome ?? hostName}
          mesa={myMesa}
          // A pessoa já está nesta página: na aprovação o servidor revalida e o
          // card sai da tela sozinho, com o `MesaPicker` e a busca embaixo.
          // `replace` para a URL em que ela já está só recarregaria a mesma tela.
          mode="refresh"
        />
      )}

      {!isHost && needsMesa && bar && (
        <MesaPicker roomId={room.id} quantidadeMesas={bar.quantidade_mesas} />
      )}

      {/* Sem o token da TV não há link para montar, então os controles de
          reprodução só aparecem com ele — passar `null` construiria uma URL
          `/player/<código>?token=null` e o "copiar link" copiaria lixo. Na
          prática o token sempre existe (o banco o gera); o que falta é a RPC,
          e aí o sintoma é estes controles não aparecerem, e não um link quebrado. */}
      {isHost && playerToken && (
        <PlaybackControls
          roomId={room.id}
          roomCode={code}
          playerToken={playerToken}
          status={room.playback_status}
          hasCurrent={Boolean(room.current_item_id)}
          queueLength={queueInitial.filter((item) => item.status === "approved").length}
          isHost={isHost}
        />
      )}

      {(isHost ? true : !isPendingMember && !needsMesa) && (
        <QueueList
          roomId={room.id}
          roomCode={code}
          initial={queueInitial}
          isHost={isHost}
          currentUserId={user.id}
          canRequest={podePedir}
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
