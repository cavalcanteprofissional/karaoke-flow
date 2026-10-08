import { redirect } from "next/navigation";

import { BackLink } from "@/components/rooms/back-link";
import { HostScreenNav } from "@/components/rooms/host-screen-nav";
import { PendingEntries } from "@/components/rooms/pending-entries";
import type { PendingEntry } from "@/components/rooms/pending-entries";
import { PlaybackControls } from "@/components/rooms/playback-controls";
import { QueueList } from "@/components/rooms/queue-list";
import type { QueueItem } from "@/components/rooms/queue-list";
import { YoutubeSettingsCard } from "@/components/rooms/settings/youtube-settings-card";
import { QUEUE_VISIBLE_STATUSES } from "@/lib/rooms/queue";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";

type PlayerScreenProps = {
  params: Promise<{ codigo: string }>;
};

/**
 * Tela `Player` do host (Fase 17): o card "Player da TV", a fila (moderação)
 * e, com `Entrada livre` desligada, os pedidos de entrada. Saiu de
 * `/salas/[codigo]`, que virou a tela ao vivo.
 *
 * Só o host enxerga: `admin_get_room_player_token` já recusa quem não é o
 * dono da sala, e aqui o não-host é devolvido para a sala antes de qualquer
 * leitura de segredo — a tela não existe para ele.
 */
export default async function PlayerScreenPage({ params }: PlayerScreenProps) {
  const { codigo } = await params;
  const code = normalizeRoomCode(codigo);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: room } = await supabase
    .from("rooms_public")
    .select("*")
    .eq("code", code)
    .maybeSingle();
  if (!room) redirect(`/salas/${code}`);

  if (room.host_id !== user.id) {
    // Participante não tem tela de configuração: volta para a tela ao vivo,
    // que é onde a fila dele já está.
    redirect(`/salas/${code}`);
  }

  const { data: barRow } = room.bar_id
    ? await supabase.from("bars").select("code").eq("id", room.bar_id).maybeSingle()
    : { data: null };

  // Fila (mesma query da tela ao vivo) e pedidos de entrada pendentes.
  const [{ data: queueRows }, { data: members }] = await Promise.all([
    supabase
      .from("queue_items")
      .select(
        "id, title, status, position, duration_seconds, thumbnail_url, added_by_user_id, youtube_video_id"
      )
      .eq("room_id", room.id)
      .in("status", QUEUE_VISIBLE_STATUSES)
      .order("position", { ascending: true })
      .limit(100),
    supabase
      .from("room_members")
      .select("user_id, joined_at")
      .eq("room_id", room.id)
      .eq("status", "pending"),
  ]);
  const queueInitial = (queueRows ?? []) as QueueItem[];

  const pendingList = members ?? [];
  const profileIds = pendingList.map((m) => m.user_id);
  let names = new Map<string, string>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles_public")
      .select("id, name")
      .in("id", profileIds);
    names = new Map((profiles ?? []).map((p) => [p.id, p.name]));
  }
  const pendingInitial: PendingEntry[] = pendingList.map((m) => ({
    user_id: m.user_id,
    name: names.get(m.user_id) ?? "Participante",
    joined_at: m.joined_at,
  }));

  // Mesmo caminho de antes: só o dono da sala lê a credencial da TV, pela
  // RPC `security definer` que valida o vínculo com o JWT da sessão.
  const tokenRes = await supabase.rpc("admin_get_room_player_token", {
    p_room_id: room.id,
  });
  const playerToken = tokenRes.data ?? null;

  // Sem bar não existe tela `/bar/[codigo]`, então a chave do YouTube fica
  // AQUI: toda sala tem um único lugar de configurar a credencial — com bar é
  // `/bar/[codigo]`, sem bar é o player. (Na prática a sala nasce de
  // `create_room` com `p_bar_id`, e este ramo é o fallback de fixture legada.)
  let apiKey: string | null = null;
  let youtubeConnectedAt: string | null = null;
  if (!room.bar_id) {
    const [keyRes, oauth] = await Promise.all([
      supabase.rpc("admin_get_room_youtube_api_key", { p_room_id: room.id }),
      createAdmin()
        .from("youtube_oauth_tokens")
        .select("updated_at")
        .eq("host_id", user.id)
        .maybeSingle(),
    ]);
    apiKey = keyRes.data ?? null;
    youtubeConnectedAt = oauth.data?.updated_at ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <BackLink roomCode={room.code} />
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-[0.2em]">Player</h1>
          <span className="text-muted-foreground text-sm">
            TV, fila e pedidos de entrada
          </span>
        </div>
        <HostScreenNav roomCode={room.code} barCode={barRow?.code ?? null} />
      </section>

      {/* Sem o token da TV não há link para montar, então os controles de
          reprodução só aparecem com ele — passar `null` construiria uma URL
          `/player/<código>?token=null` e o "copiar link" copiaria lixo. Na
          prática o token sempre existe (o banco o gera); o que falta é a RPC,
          e aí o sintoma é estes controles não aparecerem, e não um link quebrado. */}
      {playerToken && (
        <PlaybackControls
          roomId={room.id}
          roomCode={room.code}
          playerToken={playerToken}
          status={room.playback_status}
          hasCurrent={Boolean(room.current_item_id)}
          queueLength={queueInitial.filter((item) => item.status === "approved").length}
          isHost
        />
      )}

      <QueueList
        roomId={room.id}
        roomCode={room.code}
        initial={queueInitial}
        isHost
        currentUserId={user.id}
        canRequest
      />

      {!room.bar_id && (
        <YoutubeSettingsCard
          roomId={room.id}
          roomCode={room.code}
          apiKey={apiKey}
          youtubeConnectedAt={youtubeConnectedAt}
        />
      )}

      {/* O card de pedidos só existe quando a entrada é por aprovação: com
          "Entrada livre" ligado não existe fila de espera, e mostrar "Ninguém
          pediu entrada" seria ruído (decisão da Fase 17, risco (b)). */}
      {room.entry_mode === "approval" && (
        <PendingEntries roomId={room.id} initial={pendingInitial} />
      )}
    </div>
  );
}
