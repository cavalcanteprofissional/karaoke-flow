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

type BuscarPageProps = {
  params: Promise<{ codigo: string }>;
};

export default async function BuscarPage({ params }: BuscarPageProps) {
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

  let membership: "host" | "approved" | "pending" | "none";
  if (isHost) {
    membership = "host";
  } else {
    const { data: member } = await supabase
      .from("room_members")
      .select("status")
      .eq("room_id", room.id)
      .eq("user_id", user.id)
      .maybeSingle();
    membership = (member?.status as "approved" | "pending" | "none") ?? "none";
  }

  if (membership === "none" || membership === "pending") {
    return (
      <div className="flex flex-col gap-4">
        <BackLink code={code} />
        <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed p-8 text-center">
          <span className="bg-secondary text-secondary-foreground flex size-12 items-center justify-center rounded-2xl">
            {membership === "pending" ? <Clock3 className="size-6" /> : <DoorOpen className="size-6" />}
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-medium">
              {membership === "pending" ? "Aguardando aprovação do host" : "Você ainda não está nesta sala"}
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

  return (
    <div className="flex flex-col gap-4">
      <BackLink code={code} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Music2 className="text-muted-foreground size-4" />
            Pedir música — sala {code}
            <Badge variant="secondary">
              {room.queue_approval_mode === "auto" ? "fila automática" : "host aprova"}
            </Badge>
          </CardTitle>
          <CardDescription>
            Pesquise no YouTube e adicione à fila. A duração e a miniatura aparecem
            automaticamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SongSearch
            roomCode={code}
            presenceOk={presence.ok}
            presenceMessage={presence.ok ? null : presence.error}
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