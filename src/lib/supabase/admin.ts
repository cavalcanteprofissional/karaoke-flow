import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client com service_role (ignora RLS) — APENAS no servidor.
 * Nunca importar em componente client e nunca expor a chave ao browser.
 *
 * Memoizado por URL+chave (Fase 8f). Antes, cada `createAdmin()` construía um
 * cliente novo, e a rota de busca chamava a função DUAS vezes por requisição
 * (a chave da sala e o cache compartilhado) — dois clientes, dois pools
 * de conexões HTTP, dentro de uma única busca. Em serverless isso multiplica
 * sockets por lambda.
 *
 * Por que o cache é por par (url, key) e não uma variável só: o `.env.test`
 * troca a URL entre suítes, e um singleton travado na primeira URL mandaria
 * requisições do teste para o projeto errado — falha silenciosa e confusa.
 */
const clients = new Map<string, SupabaseClient>();

/** Só para teste: derruba os clientes memoizados para simular processo novo. */
export function clearCachedAdminClient(): void {
  clients.clear();
}

export function createAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Credenciais de service role ausentes (server-side).");
  }
  const cacheKey = `${url}\u0000${serviceRoleKey}`;
  const existing = clients.get(cacheKey);
  if (existing) return existing;
  const client = createSupabaseClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  clients.set(cacheKey, client);
  return client;
}