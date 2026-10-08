import { redirect } from "next/navigation";
import { QrCode } from "lucide-react";

import { BackLink } from "@/components/rooms/back-link";
import { HostScreenNav } from "@/components/rooms/host-screen-nav";
import { BarQr } from "@/components/rooms/bar-qr";
import { MesaQrDialog } from "@/components/rooms/mesa-qr-dialog";
import { RoomOccupancyCard } from "@/components/rooms/room-occupancy";
import { MesasBarCard } from "@/components/rooms/settings/mesas-bar-card";
import { RoomBehaviorCard } from "@/components/rooms/settings/room-behavior-card";
import { RoomCodeCard } from "@/components/rooms/settings/room-code-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";

type SalaScreenProps = {
  params: Promise<{ codigo: string }>;
};

/**
 * Tela `Sala` do host (Fase 17): como a sala funciona, o cartaz/QR das
 * mesas (com a quantidade de mesas, Fase 16), quem está na sala e o código
 * de entrada. Saiu de `/salas/[codigo]`, que virou a tela ao vivo.
 * Só o host entra — o não-host volta para a sala.
 */
export default async function SalaScreenPage({ params }: SalaScreenProps) {
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
  if (room.host_id !== user.id) redirect(`/salas/${code}`);

  let bar: {
    id: string;
    code: string;
    nome: string;
    endereco: string | null;
    cidade: string | null;
    latitude: number | null;
    longitude: number | null;
    raio_permitido_metros: number;
    quantidade_mesas: number;
  } | null = null;
  if (room.bar_id) {
    const { data: barData } = await supabase
      .from("bars")
      .select(
        "id, code, nome, endereco, cidade, latitude, longitude, raio_permitido_metros, quantidade_mesas"
      )
      .eq("id", room.bar_id)
      .maybeSingle();
    bar = barData;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <BackLink roomCode={room.code} />
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-[0.2em]">Sala</h1>
          <span className="text-muted-foreground text-sm">
            Como funciona, mesas e código
          </span>
        </div>
        <HostScreenNav roomCode={room.code} barCode={bar?.code ?? null} />
      </section>

      <RoomBehaviorCard
        roomId={room.id}
        initial={{
          entry_mode: room.entry_mode,
          queue_approval_mode: room.queue_approval_mode,
          require_song_confirmation: room.require_song_confirmation,
          pre_approval_24h: room.pre_approval_24h,
        }}
      />

      {bar && (
        <>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <QrCode className="text-muted-foreground size-4" />
                Cartaz e QR das mesas
              </CardTitle>
              <CardDescription>
                QR do bar para quem ainda vai escolher a mesa; QR de cada mesa para a
                galera entrar direto na sala.
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

          <MesasBarCard bar={{ id: bar.id, quantidade_mesas: bar.quantidade_mesas }} />
          <RoomOccupancyCard roomId={room.id} quantidadeMesas={bar.quantidade_mesas} />
        </>
      )}

      <RoomCodeCard roomId={room.id} roomCode={room.code} />
    </div>
  );
}
