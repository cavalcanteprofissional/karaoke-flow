import { redirect } from "next/navigation";
import { Ticket } from "lucide-react";

import { BackLink } from "@/components/rooms/back-link";
import { HostScreenNav } from "@/components/rooms/host-screen-nav";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/server";
import { normalizeRoomCode } from "@/lib/rooms/utils";

type PulseirasScreenProps = {
  params: Promise<{ codigo: string }>;
};

/**
 * Tela `Pulseiras` (Fase 17, PLACEHOLDER): a rota e a navegação já existem
 * para a Fase 18 não precisar mexer em menu — hoje os dois cards estão
 * esmaecidos e sem ação, porque as tabelas (`pulseiras_codigos`,
 * `pulseiras_acessos`, `pulseiras_precos`) e a RPC `resgatar_pulseira` ainda
 * não foram criadas. O toggle mestre (`bars.pulseiras_ativadas`) também é
 * da 18; quando ele entrar, este aviso sai e o card passa a respeitar o
 * estado OFF esmaecido (decisão 2 do PO).
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

  let barCode: string | null = null;
  if (room.bar_id) {
    const { data: barData } = await supabase
      .from("bars")
      .select("code")
      .eq("id", room.bar_id)
      .maybeSingle();
    barCode = barData?.code ?? null;
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-3">
        <BackLink roomCode={room.code} />
        <div className="flex items-center gap-2">
          <h1 className="font-mono text-2xl font-bold tracking-[0.2em]">
            Pulseiras
          </h1>
          <span className="text-muted-foreground text-sm">Códigos e valores</span>
        </div>
        <HostScreenNav roomCode={room.code} barCode={barCode} />
      </section>

      <div className="bg-muted/40 text-muted-foreground flex items-start gap-2 rounded-xl border border-dashed p-4 text-sm">
        <Ticket className="mt-0.5 size-4 shrink-0" />
        <p>
          Esta tela chega na <span className="font-medium">Fase 18</span>: códigos de
          uso único, faixa de valores por dia e hora, e a pulseira liberando o pedido
          de música. Por enquanto nada é gerado aqui.
        </p>
      </div>

      <div aria-disabled className="flex flex-col gap-6 opacity-60">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Distribuição de códigos
            </CardTitle>
            <CardDescription>
              Gerar códigos em lote, ver quem já usou (disponível / usado / expirado) e
              imprimir a folha de QR de cada pulseira.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Em breve — a chave de cada código expira em 24h e não tem caminho de
              reset.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              Valor da pulseira
            </CardTitle>
            <CardDescription>
              Preço por dia da semana e faixa de horas, com o valor de hoje em
              destaque. O card público de valores aparece na entrada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-xs">
              Em breve — sem cobrança agora: a tela serve como calendário e memorando
              para quem chega.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
