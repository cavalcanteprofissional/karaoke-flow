import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Store } from "lucide-react";

import { HostScreenNav } from "@/components/rooms/host-screen-nav";
import { PresenceGateInfo } from "@/components/rooms/presence-gate-info";
import { YoutubeSettingsCard } from "@/components/rooms/settings/youtube-settings-card";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type BarScreenProps = {
  params: Promise<{ codigo: string }>;
};

/**
 * Tela `Bar` (Fase 17): configurações que valem para a casa inteira, não
 * para uma sala — o raio de presença e a busca do YouTube (um card por
 * sala, porque a chave é da sala e a cota é do projeto do Google Cloud).
 *
 * Só o dono do bar entra (`bars.host_id`), checado no servidor: a RLS de
 * `bars` deixa qualquer autenticado LER, então a autorização desta tela é a
 * página, não o banco. O `/bar` também entrou em `PROTECTED_PREFIXES` no
 * `proxy.ts` — sem sessão nem chega aqui.
 */
export default async function BarScreenPage({ params }: BarScreenProps) {
  const { codigo } = await params;
  const barCode = codigo.trim().toUpperCase();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: bar } = await supabase
    .from("bars")
    .select("*")
    .eq("code", barCode)
    .maybeSingle();

  if (!bar) redirect("/dashboard");
  if (bar.host_id !== user.id) redirect("/dashboard");

  // Salas do bar — na prática uma; o dev pode ter várias, e aí a busca do
  // YouTube vira um card por sala (a chave é `rooms.youtube_api_key`).
  const { data: rooms } = await supabase
    .from("rooms_public")
    .select("*")
    .eq("bar_id", bar.id)
    .order("created_at", { ascending: true });

  const roomList = rooms ?? [];

  // Uma leitura para todas as salas: o token de OAuth é do HOST, não da sala.
  let youtubeConnectedAt: string | null = null;
  const keyByRoom = new Map<string, string | null>();
  if (roomList.length > 0) {
    const { data: oauth } = await createAdmin()
      .from("youtube_oauth_tokens")
      .select("updated_at")
      .eq("host_id", user.id)
      .maybeSingle();
    youtubeConnectedAt = oauth?.updated_at ?? null;

    // A RPC valida o vínculo de dono da sala com o JWT da sessão: salas que
    // não são suas respondem null e o card nasce "sem chave".
    const keys = await Promise.all(
      roomList.map(async (room) => {
        if (room.host_id !== user.id) return [room.id, null] as const;
        const res = await supabase.rpc("admin_get_room_youtube_api_key", {
          p_room_id: room.id,
        });
        return [room.id, res.data ?? null] as const;
      })
    );
    for (const [roomId, key] of keys) keyByRoom.set(roomId, key);
  }

  const entryModeApproval = roomList.some((room) => room.entry_mode === "approval");

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <Link
          href="/dashboard"
          className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
        >
          <ArrowLeft className="size-3.5" />
          Voltar ao início
        </Link>
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-[0.2em]">{bar.code}</h1>
          <span className="text-muted-foreground flex items-center gap-1.5 text-sm">
            <Store className="size-3.5" />
            {bar.nome}
          </span>
        </div>
        {roomList.length > 0 && (
          <HostScreenNav roomCode={roomList[0].code} barCode={bar.code} />
        )}
      </section>

      <PresenceGateInfo
        barId={bar.id}
        barName={bar.nome}
        address={bar.endereco}
        city={bar.cidade}
        latitude={bar.latitude}
        longitude={bar.longitude}
        radiusMeters={bar.raio_permitido_metros}
        entryModeApproval={entryModeApproval}
      />

      {roomList.length === 0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center">
          <p className="font-medium">Este bar ainda não tem karaokê</p>
          <p className="text-muted-foreground mt-1 text-sm">
            A busca de música é configuração de cada sala — assim que houver uma sala
            ativa, o card aparece aqui.
          </p>
        </div>
      ) : (
        roomList.map((room) => (
          <YoutubeSettingsCard
            key={room.id}
            roomId={room.id}
            roomCode={room.code}
            apiKey={keyByRoom.get(room.id) ?? null}
            youtubeConnectedAt={youtubeConnectedAt}
          />
        ))
      )}
    </div>
  );
}
