"use client";

import { useCallback, useEffect, useState } from "react";
import { LoaderCircle, MapPin, TriangleAlert, Users } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

/** Retorno da RPC `admin_room_occupancy` (migration 20261003000040). */
export type RoomOccupancy = {
  /** Membros `approved` — quem está na sala. O host não entra (não tem linha). */
  total: number;
  dentro: number;
  fora: number;
  /** Aprovados sem mesa: entraram pelo código ou de fora do raio. */
  sem_mesa: number;
  pendentes: number;
  /** `{"1": 3, "2": 1}` — contagem por número de mesa. */
  por_mesa: Record<string, number>;
};

type RoomOccupancyCardProps = {
  roomId: string;
  /** Para desenhar todas as mesas, mesmo as vazias — uma mesa vazia é informação. */
  quantidadeMesas: number;
};

const VAZIO: RoomOccupancy = {
  total: 0,
  dentro: 0,
  fora: 0,
  sem_mesa: 0,
  pendentes: 0,
  por_mesa: {},
};

/** 1234 → "1.234": contador de gente não pode vir cru no card. */
function formatar(quantidade: number): string {
  return quantidade.toLocaleString("pt-BR");
}

/**
 * Quem está na sala agora, separado por raio de presença e por mesa (Fase 9
 * parcial, 2026-10-03).
 *
 * Três coisas motivaram o card, e nenhuma delas é enfeite:
 *
 *   1. **A regra de 2026-10-02 ficou invisível para o host.** "Quem está fora do
 *      raio entra e só assiste" é uma regra que o dono precisa VERطبيق: é a
 *      diferença entre "ninguém entrou" e "entraram, mas estão longe".
 *   2. **A presença precisa ser gravada para ser contada.** O cookie `kf-geo`
 *      só existe no navegador de cada um; o banco não tinha como saber de onde
 *      veio a pessoa. Agora `join_room` grava `fora_do_raio`/`distancia_m`.
 *   3. **RLS esconde a sala por linha**, então nem o host conseguia somar os
 *      outros com um `select`. O agregado vem de uma RPC `security definer` que
 *      confere `is_host` dentro do banco — o mesmo desenho das `admin_*` da
 *      auditoria de RLS.
 *
 * Ao vivo por `postgres_changes` em `room_members`, filtrado pela sala. A
 * migração põe `replica identity full` na tabela porque sem a PK no payload o
 * evento de `DELETE` (quem sai) não chega.
 */
export function RoomOccupancyCard({ roomId, quantidadeMesas }: RoomOccupancyCardProps) {
  const [data, setData] = useState<RoomOccupancy | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    const supabase = createClient();
    const { data: payload, error } = await supabase.rpc("admin_room_occupancy", {
      p_room_id: roomId,
    });
    if (error) {
      setErro(error.message);
      return;
    }
    setErro(null);
    setData(normalizar(payload));
  }, [roomId]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`room-occupancy:${roomId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "room_members",
          filter: `room_id=eq.${roomId}`,
        },
        () => {
          void carregar();
        }
      )
      // A primeira leitura vem no `subscribe` (mesmo desenho do `PendingEntries`),
      // e não num effect separado: um `useEffect(() => carregar(), [])` separado
      // dispara dois renders e a regra `react-hooks/set-state-in-effect` barra.
      .subscribe(() => {
        void carregar();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [carregar, roomId]);

  if (erro) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="text-muted-foreground size-4" />
            Quem está na sala
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p role="alert" className="flex items-start gap-2 text-sm text-amber-500">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" />
            Não foi possível ler a contagem: {erro}
          </p>
        </CardContent>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <LoaderCircle className="text-muted-foreground size-4 animate-spin" />
            Quem está na sala
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">Contando a galera…</p>
        </CardContent>
      </Card>
    );
  }

  const mesas = [...new Set([...Object.keys(data.por_mesa), ...range(quantidadeMesas)])]
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="text-muted-foreground size-4" />
          Quem está na sala
          <span className="text-muted-foreground ml-auto text-xs font-normal">
            atualiza sozinho
          </span>
        </CardTitle>
        <CardDescription>
          {formatar(data.total)} {data.total === 1 ? "pessoa" : "pessoas"} na sala
          {data.pendentes > 0 && (
            <> · {formatar(data.pendentes)} aguardando sua aprovação</>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Numero valor={data.total} rotulo="na sala" />
          <Numero valor={data.dentro} rotulo="dentro do raio" />
          <Numero valor={data.fora} rotulo="fora do raio" destaque={data.fora > 0} />
        </div>

        {mesas.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-muted-foreground text-xs">Por mesa</p>
            <div className="flex flex-wrap gap-2">
              {mesas.map((numero) => {
                const pessoas = data.por_mesa[String(numero)] ?? 0;
                return (
                  <Badge
                    key={numero}
                    variant={pessoas > 0 ? "secondary" : "outline"}
                    className="gap-1.5 tabular-nums"
                  >
                    <span>Mesa {numero}</span>
                    <span className="opacity-70">{formatar(pessoas)}</span>
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {data.fora > 0 && (
          <p className="text-muted-foreground flex items-start gap-2 text-xs">
            <MapPin className="mt-0.5 size-3.5 shrink-0" />
            <span>
              Quem está fora do raio entrou como espectador: assiste à playlist, mas não
              escolhe mesa nem pede música. O corte é do servidor, no momento em que a
              pessoa pede — mudar a localização depois não libera a fila.
            </span>
          </p>
        )}

        {data.total === 0 && data.pendentes === 0 && (
          <p className="text-muted-foreground text-sm">
            Ninguém entrou ainda. Compartilhe o QR das mesas com a galera.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function Numero({ valor, rotulo, destaque = false }: {
  valor: number;
  rotulo: string;
  destaque?: boolean;
}) {
  return (
    <div
      className={
        destaque
          ? "bg-amber-500/10 flex flex-col rounded-lg border border-amber-500/30 p-3"
          : "bg-muted/40 flex flex-col rounded-lg border p-3"
      }
    >
      <span className="text-2xl leading-tight font-semibold tabular-nums">
        {formatar(valor)}
      </span>
      <span className="text-muted-foreground text-xs">{rotulo}</span>
    </div>
  );
}

function range(quantidade: number): string[] {
  return Array.from({ length: Math.max(0, quantidade) }, (_, i) => String(i + 1));
}

/**
 * O banco devolve o agregado em `jsonb`; um cliente desatualizado (ou a RPC fora
 * do ar) pode devolver `null`, e aí o card precisa mostrar zero em vez de
 * quebrar. Números chegam como `number`, mas um `jsonb` Round-trip pode entregar
 * string — daí o `Number()`.
 */
function normalizar(payload: unknown): RoomOccupancy {
  if (!payload || typeof payload !== "object") return VAZIO;
  const bruto = payload as Record<string, unknown>;
  const porMesaBruto = bruto.por_mesa;
  const por_mesa: Record<string, number> = {};
  if (porMesaBruto && typeof porMesaBruto === "object") {
    for (const [mesa, pessoas] of Object.entries(porMesaBruto as Record<string, unknown>)) {
      por_mesa[mesa] = Number(pessoas) || 0;
    }
  }

  return {
    total: Number(bruto.total) || 0,
    dentro: Number(bruto.dentro) || 0,
    fora: Number(bruto.fora) || 0,
    sem_mesa: Number(bruto.sem_mesa) || 0,
    pendentes: Number(bruto.pendentes) || 0,
    por_mesa,
  };
}
