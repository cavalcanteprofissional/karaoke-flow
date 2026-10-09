import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";

import { BackLink } from "@/components/rooms/back-link";
import { HostScreenNav } from "@/components/rooms/host-screen-nav";
import { PulseiraCodesCard } from "@/components/rooms/pulseiras/pulseira-codes-card";
import { PulseiraMasterSwitch } from "@/components/rooms/pulseiras/pulseira-master-switch";
import { PulseiraPricesCard } from "@/components/rooms/pulseiras/pulseira-prices-card";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";
import type { PulseiraCodeRow, PulseiraPreco } from "@/types/bar";

type PulseirasScreenProps = {
  params: Promise<{ codigo: string }>;
};

/**
 * Tela `Pulseiras` do host (Fase 18): interruptor mestre, lote de códigos com
 * QR/folha de impressão e o cartável de valores por dia/hora. A página é a
 * única que lê `bars.pulseiras_ativadas`, `pulseiras_codigos` (RLS host-only) e
 * `pulseiras_precos`; os cards são client e só chamam as Server Actions.
 *
 * Pulseira é do BAR (o código é único por casa), então uma sala sem bar não
 * tem pulseira — a tela diz isso em vez de oferecer um controle que não existe.
 */
export default async function PulseirasScreenPage({ params }: PulseirasScreenProps) {
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

  let bar: { id: string; code: string; nome: string; pulseiras_ativadas: boolean } | null = null;
  if (room.bar_id) {
    const { data } = await supabase
      .from("bars")
      .select("id, code, nome, pulseiras_ativadas")
      .eq("id", room.bar_id)
      .maybeSingle();
    bar = data ?? null;
  }

  let codigos: PulseiraCodeRow[] = [];
  let precos: PulseiraPreco[] = [];
  if (bar) {
    const [{ data: codeRows }, { data: priceRows }] = await Promise.all([
      supabase
        .from("pulseiras_codigos")
        .select("*")
        .eq("bar_id", bar.id)
        .order("criado_em", { ascending: false })
        .limit(200),
      supabase.from("pulseiras_precos").select("*").eq("bar_id", bar.id),
    ]);
    codigos = (codeRows ?? []) as PulseiraCodeRow[];
    precos = (priceRows ?? []) as PulseiraPreco[];
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3 print:hidden">
        <BackLink roomCode={room.code} />
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-[0.2em]">Pulseiras</h1>
          <span className="text-muted-foreground text-sm">Códigos e valores</span>
        </div>
        <HostScreenNav roomCode={room.code} barCode={bar?.code ?? null} />
      </section>

      {!bar ? (
        <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm">
          <Ticket className="mt-0.5 size-4 shrink-0" />
          <p>
            Este karaokê não faz parte de um bar: a pulseira é do bar (o código é único
            por casa), então não há o que configurar aqui.
          </p>
        </div>
      ) : (
        <>
          <div className="print:hidden">
            <PulseiraMasterSwitch
              barId={bar.id}
              barNome={bar.nome}
              initialAtivadas={bar.pulseiras_ativadas}
            />
          </div>
          <PulseiraCodesCard
            barId={bar.id}
            barCode={bar.code}
            codigos={codigos}
            disabled={!bar.pulseiras_ativadas}
          />
          <div className="print:hidden">
            <PulseiraPricesCard
              barId={bar.id}
              precos={precos}
              disabled={!bar.pulseiras_ativadas}
            />
          </div>
        </>
      )}
    </div>
  );
}
