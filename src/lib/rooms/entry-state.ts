import { createClient } from "@/lib/supabase/server";
import type { MemberEntryState } from "@/types/room";

/**
 * Status EFETIVO do participante para efeitos de entrada (Fase 8a).
 *
 * A tela de entrada NÃO pode ler `room_members` direto: o status guardado é o
 * que o host aprovou, e a pré-aprovação de 24h (migration
 * 20260927000030) pode ter vencido — nesse caso o status efetivo volta a ser
 * `pending` com "entrada livre" desligado, ou `approved` porque a sala é
 * aberta. Quem decide é `member_entry_state` no banco, que é a MESMA função que
 * o `join_room` usa para gravar: uma regra só, sem cópia no app.
 *
 * `null` = nunca entrou (ou a sala não existe). Nunca "sem Membership por
 * erro": se a RPC falhar, o resultado é `{ ok: false, error }` e quem chama
 * decide — silenciar isso seria devolver uma pré-aprovação falsa.
 */
export async function getMemberEntryState(
  roomId: string
): Promise<
  | { ok: true; state: MemberEntryState | null }
  | { ok: false; error: string; code: string }
> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("member_entry_state", {
    p_room_id: roomId,
  });

  if (error) {
    return {
      ok: false,
      error: error.message,
      code: /row-level security|permission denied|policy/i.test(error.message)
        ? "RLS_BLOCKED"
        : "ENTRY_STATE_FAILED",
    };
  }

  if (data === null || data === undefined) {
    return { ok: true, state: null };
  }

  const raw = data as {
    status?: string;
    mesa_numero?: number | null;
    pre_approval?: boolean;
    approved_at?: string | null;
    fora_do_raio?: boolean;
    distancia_m?: number | null;
    pulseira_exigida?: boolean;
    tem_pulseira?: boolean;
  };

  if (!raw.status) {
    return {
      ok: false,
      error: "Estado de entrada inválido.",
      code: "ENTRY_STATE_INVALID",
    };
  }

  return {
    ok: true,
    state: {
      status: raw.status as MemberEntryState["status"],
      mesa_numero: raw.mesa_numero ?? null,
      pre_approval: raw.pre_approval === true,
      approved_at: raw.approved_at ?? null,
      // `?? false` (e não `=== true`) seria o mesmo efeito, mas o default
      // explícito documenta a direção do erro: se a coluna não vier, é porque
      // rodou app contra banco sem a 00040 — e aí "não estou fora do raio"
      // mantém o comportamento antigo, que era menos restritivo para quem já
      // estava na sala.
      fora_do_raio: raw.fora_do_raio === true,
      distancia_m: Number.isFinite(raw.distancia_m) ? Number(raw.distancia_m) : null,
      // Igual ao `?? false` do fora_do_raio: app rodando contra banco sem a
      // 00002 (pulseira) trata "campo ausente" como "casa não usa pulseira" —
      // o default menos restritivo para quem já estava na sala antes da regra.
      pulseira_exigida: raw.pulseira_exigida === true,
      tem_pulseira: raw.tem_pulseira === true,
    },
  };
}
