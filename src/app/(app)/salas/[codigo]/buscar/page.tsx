import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Clock3, DoorOpen, Music2, Search } from "lucide-react";

import { SongSearch } from "@/components/rooms/song-search";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { requirePresence } from "@/lib/bars/presence";
import type { PresenceDecision } from "@/lib/bars/geo";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";
import { getMemberEntryState } from "@/lib/rooms/entry-state";
import { canRequestSongs } from "@/lib/rooms/spectator";
import { readOwnActiveSong } from "@/lib/rooms/queue-actions";
import type { MemberStatus } from "@/types/room";

type BuscarPageProps = {
  params: Promise<{ codigo: string }>;
  /** Bloco D: `?trocar=<queue_item_id>` entra no modo troca. */
  searchParams: Promise<{ trocar?: string | string[] }>;
};

export default async function BuscarPage({ params, searchParams }: BuscarPageProps) {
  const { codigo } = await params;
  const { trocar } = await searchParams;
  const replaceItemId = typeof trocar === "string" ? trocar : undefined;
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

  if (!room) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
        <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
          <Search className="size-6" />
        </span>
        <div className="flex flex-col gap-1">
          <p className="font-medium">Sala não encontrada</p>
          <p className="text-muted-foreground text-sm">
            Confira o código do karaokê e tente de novo.
          </p>
        </div>
        <Link
          href="/entrar"
          className="bg-primary text-primary-foreground rounded-xl px-6 py-3 text-sm font-semibold"
        >
          Entrar em um bar
        </Link>
      </div>
    );
  }

  const isHost = room.host_id === user.id;

  /**
   * O estado de entrada vem da MESMA função que a página da sala lê
   * (`member_entry_state`) e não de `select status` em `room_members`: o status
   * guardado é o que o host aprovou, e a pré-aprovação de 24h pode ter vencido —
   * ler a linha crua dava "aprovado" para quem já não está. Uma regra só, sem
   * cópia no app.
   */
  const entry = isHost ? null : await getMemberEntryState(room.id);
  const entryState = entry?.ok === true ? (entry.state ?? null) : null;
  const membership: MemberStatus | "host" | "none" = isHost
    ? "host"
    : (entryState?.status ?? "none");

  if (membership === "none" || membership === "pending" || membership === "rejected") {
    return (
      <div className="flex flex-col gap-4">
        <BackLink code={code} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
          <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
            {membership === "pending" ? (
              <Clock3 className="size-6" />
            ) : (
              <DoorOpen className="size-6" />
            )}
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {membership === "pending"
                ? "Aguardando aprovação do host"
                : "Você ainda não está nesta sala"}
            </p>
            <p className="text-muted-foreground text-sm">
              {membership === "pending"
                ? "Assim que o dono aprovar sua entrada você pode pedir músicas."
                : "Entre pela tela inicial com o QR ou o código do bar."}
            </p>
          </div>
          {membership !== "pending" && (
            <Link
              href={`/entrar?code=${code}`}
              className="bg-primary text-primary-foreground rounded-xl px-6 py-3 text-sm font-semibold"
            >
              Entrar na sala {code}
            </Link>
          )}
        </div>
      </div>
    );
  }

  /**
   * O espectador (entrou fora do raio do bar) não tem esta tela — nem offerta,
   * nem recusa: uma tela de busca que ele não pode usar é beco sem saída, e
   * `canRequestSongs` é a mesma resposta que a fila da sala usa. De volta para a
   * sala, que é onde ele acompanha tudo. O redirect (e não um aviso aqui)
   * porque o link é alcançável digitado, favoritado ou vindo de `?trocar=`.
   */
  if (!canRequestSongs({ isHost, membership: entryState })) {
    redirect(`/salas/${code}`);
  }

  let presence: PresenceDecision = { ok: true };
  if (!isHost && room.bar_id) {
    const { data: bar } = await supabase
      .from("bars")
      .select("latitude, longitude, raio_permitido_metros")
      .eq("id", room.bar_id)
      .maybeSingle();
    const cookieStore = await cookies();
    presence = requirePresence({
      isHost,
      bar: {
        latitude: bar?.latitude ?? null,
        longitude: bar?.longitude ?? null,
        raioPermitidoMetros: bar?.raio_permitido_metros ?? null,
      },
      store: cookieStore,
    });
  }

  // Bloco D: valida o item no servidor para o modo troca. Quem não puder trocar
  // (não é autor nem host, item já terminal, id inválido) cai no fluxo normal de
  // "pedir música" — a RPC repetiria a mesma recusa, mas com uma tela morta.
  let replaceItem: { id: string; title: string } | null = null;
  if (replaceItemId) {
    const { data: item } = await supabase
      .from("queue_items")
      .select("id, title, status, added_by_user_id, youtube_video_id")
      .eq("id", replaceItemId)
      .eq("room_id", room.id)
      .maybeSingle();

    const mine = item?.added_by_user_id === user.id;
    if (item && (mine || isHost) && ["pending", "approved"].includes(item.status)) {
      replaceItem = { id: item.id, title: item.title };
    }
  }

  /**
   * Uma música ativa por participante (migration `20261004000042`). O estado vem
   * do servidor pelo mesmo leitor que a action usa, para que o aviso da tela e a
   * regra do servidor não contem histórias diferentes. `reading` (não-detectado)
   * fica fora: aí a tela não trava ninguém, e a trigger ainda recusa no banco.
   */
  const ownActiveSong = replaceItem
    ? undefined
    : await readOwnActiveSong({ supabase, roomId: room.id, userId: user.id, isHost });

  return (
    <div className="flex flex-col gap-4">
      <BackLink code={code} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Music2 className="text-muted-foreground size-4" />
            {replaceItem ? "Trocar música" : "Pedir música"} — sala {code}
            <Badge variant="secondary">
              {room.queue_approval_mode === "auto" ? "fila automática" : "host aprova"}
            </Badge>
          </CardTitle>
          <CardDescription>
            {replaceItem
              ? "Escolha a música que substitui a atual. A posição na fila e a aprovação são mantidas."
              : ownActiveSong?.playing
                ? "Você já tem uma música tocando nesta sala. Dá para pedir outra quando ela terminar."
                : "Pesquise no YouTube e adicione à fila. A duração e a miniatura aparecem automaticamente."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SongSearch
            roomCode={code}
            presenceOk={presence.ok}
            presenceMessage={presence.ok ? null : presence.error}
            requireSongConfirmation={room.require_song_confirmation}
            replaceItemId={replaceItem?.id}
            replaceItemTitle={replaceItem?.title ?? null}
            ownActiveSong={
              ownActiveSong && {
                playing: ownActiveSong.playing,
                replacedTitle: ownActiveSong.title,
              }
            }
          />
        </CardContent>
      </Card>
    </div>
  );
}

function BackLink({ code }: { code: string }) {
  return (
    <Link
      href={`/salas/${code}`}
      className="text-muted-foreground hover:text-foreground flex items-center gap-1.5 text-sm"
    >
      <ArrowLeft className="size-4" />
      Voltar à sala {code}
    </Link>
  );
}
