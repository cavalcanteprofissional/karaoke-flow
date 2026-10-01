import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * O usuário da sessão é dev?
 *
 * Não lê `public.dev_accounts` direto: a tabela tem RLS ligado e **nenhuma**
 * policy (migration `20260930000034`), então via Data API ela é invisível —
 * por design, para que só o service role promova alguém. O que a UI pode
 * fazer é chamar o helper `is_dev()`, que é `security definer` e por isso
 * enxerga a linha do próprio dev.
 *
 * Falha fechada: qualquer erro (RPC ausente antes da migration, rede, permissão)
 * devolve `false` — o efeito é só esconder os botões de dev, nunca abrir acesso.
 * A autorização de verdade está nas RPCs (`create_bar` e `create_room`), que
 * consultam `is_dev()` no banco.
 */
export async function isDevAccount(supabase: SupabaseClient): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_dev");
  if (error) return false;
  return data === true;
}
