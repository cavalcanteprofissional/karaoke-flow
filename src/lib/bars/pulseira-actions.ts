"use server";

import { revalidatePath } from "next/cache";

import {
  gerarPulseirasSchema,
  precoPulseiraSchema,
  pulseiraToggleSchema,
  removerPrecoPulseiraSchema,
  resgatarPulseiraSchema,
} from "@/lib/bars/schema";
import { createClient } from "@/lib/supabase/server";

/**
 * Server Actions da pulseira (Fase 18).
 *
 * Todas as escritas passam pelo banco como autoridade: o toggle e leitura usam
 * a RLS de `bars` (dono), e gerar código / mexer em preço / resgatar vão por RPC
 * `security definer` que repete a checagem de dono. Aqui só validamos o formato e
 * traduzimos o erro para a tela — mesmo desenho de `updateBarMesasAction`.
 */

export type PulseiraActionResult = { ok: true } | { ok: false; error: string };

export type GerarPulseirasResult =
  | { ok: true; geradas: number }
  | { ok: false; error: string };

export type ResgatarPulseiraResult =
  | {
      ok: true;
      message: string;
      precoCentavos: number | null;
      acessoAte: string;
      nome: string;
    }
  | {
      ok: false;
      code: string;
      error: string;
      /** Quando o resgate já existia, a validade que sobrou (para a tela). */
      acessoAte?: string;
    };

function firstError(error: { errors: { message?: string }[] }): string {
  return error.errors[0]?.message ?? "Dados inválidos.";
}

function traduzirRpcHospedeiro(message: string, fallback: string): string {
  if (/bar não encontrado|não autenticado|permission denied|row-level security/i.test(message)) {
    return "Só o dono do bar pode gerenciar as pulseiras.";
  }
  if (/já existe uma faixa/i.test(message)) return "Já existe uma faixa sobreposta neste dia.";
  if (/horário inválido|dia da semana inválido|preço inválido/i.test(message)) {
    return message;
  }
  return fallback;
}

/** Liga/desliga a pulseira do bar — o interruptor mestre da tela. */
export async function setPulseirasAtivadasAction(raw: unknown): Promise<PulseiraActionResult> {
  const parsed = pulseiraToggleSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Faça login para mudar a pulseira." };

  const { data, error } = await supabase
    .from("bars")
    .update({ pulseiras_ativadas: parsed.data.ativadas })
    .eq("id", parsed.data.bar_id)
    .select("id");

  if (error) {
    return { ok: false, error: "Não foi possível salvar o interruptor da pulseira." };
  }
  if (!data || data.length === 0) {
    return { ok: false, error: "Só o dono do bar pode mudar a pulseira." };
  }

  revalidatePath("/salas/[codigo]/pulseiras", "page");
  // O gate do pedido de música muda com o interruptor: a sala e a entrada
  // precisam refletir a nova regra na hora.
  revalidatePath("/salas/[codigo]", "page");
  revalidatePath("/entrar");
  return { ok: true };
}

/** Gera um lote de códigos (1–100) com 24h de validade cada. */
export async function gerarPulseirasAction(raw: unknown): Promise<GerarPulseirasResult> {
  const parsed = gerarPulseirasSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Faça login para gerar pulseiras." };

  const { data, error } = await supabase.rpc("gerar_pulseiras", {
    p_bar_id: parsed.data.bar_id,
    p_qtd: parsed.data.qtd,
  });
  if (error) {
    return { ok: false, error: traduzirRpcHospedeiro(error.message, "Não foi possível gerar as pulseiras.") };
  }

  revalidatePath("/salas/[codigo]/pulseiras", "page");
  return { ok: true, geradas: typeof data === "number" ? data : parsed.data.qtd };
}

/** Cria/atualiza uma faixa de valor (dia da semana + janela HH:MM). */
export async function salvarPrecoPulseiraAction(raw: unknown): Promise<PulseiraActionResult> {
  const parsed = precoPulseiraSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Faça login para salvar o valor." };

  const { error } = await supabase.rpc("upsert_preco_pulseira", {
    p_bar_id: parsed.data.bar_id,
    p_dia_semana: parsed.data.dia_semana,
    p_inicio: parsed.data.inicio,
    p_fim: parsed.data.fim,
    p_preco_centavos: parsed.data.preco_centavos,
  });
  if (error) {
    return { ok: false, error: traduzirRpcHospedeiro(error.message, "Não foi possível salvar o valor.") };
  }

  revalidatePath("/salas/[codigo]/pulseiras", "page");
  revalidatePath("/entrar");
  return { ok: true };
}

/** Remove uma faixa de valor pela chave que a identifica (dia + início). */
export async function removerPrecoPulseiraAction(raw: unknown): Promise<PulseiraActionResult> {
  const parsed = removerPrecoPulseiraSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Faça login para remover o valor." };

  const { error } = await supabase.rpc("remover_preco_pulseira", {
    p_bar_id: parsed.data.bar_id,
    p_dia_semana: parsed.data.dia_semana,
    p_inicio: parsed.data.inicio,
  });
  if (error) {
    return { ok: false, error: traduzirRpcHospedeiro(error.message, "Não foi possível remover o valor.") };
  }

  revalidatePath("/salas/[codigo]/pulseiras", "page");
  revalidatePath("/entrar");
  return { ok: true };
}

/** Mapa código→texto amigável (o banco decide, a tela só mostra). */
const RESGATE_MENSAGENS: Record<string, string> = {
  UNAUTHENTICATED: "Faça login para usar a pulseira.",
  ANONYMOUS: "Crie uma conta para usar a pulseira.",
  BAR_NOT_FOUND: "Bar não encontrado.",
  PULSEIRA_INATIVA: "Este bar não está usando pulseiras agora.",
  JA_TEM_ACESSO: "Você já tem acesso a este bar.",
  CODIGO_INVALIDO: "Código de pulseira inválido.",
  CODIGO_USADO: "Este código de pulseira já foi usado.",
  CODIGO_EXPIRADO: "Código de pulseira expirado — peça outro no balcão.",
};

/**
 * Resgata a pulseira na entrada (`/entrar`). O banco devolve um `jsonb` com
 * `ok`/`code`/`message`; o `code` é o que a tela usa para decidir o que mostrar
 * (incluindo a mensagem própria do ANONYMOUS, que manda criar conta).
 */
export async function resgatarPulseiraAction(raw: unknown): Promise<ResgatarPulseiraResult> {
  const parsed = resgatarPulseiraSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, code: "DADOS_INVALIDOS", error: firstError(parsed.error) };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, code: "UNAUTHENTICATED", error: RESGATE_MENSAGENS.UNAUTHENTICATED };
  }

  const { data, error } = (await supabase.rpc("resgatar_pulseira", {
    p_bar_id: parsed.data.bar_id,
    p_codigo: parsed.data.codigo,
  })) as { data: Record<string, unknown> | null; error: { message: string } | null };

  if (error || !data) {
    return { ok: false, code: "RESGATE_FAILED", error: "Não foi possível ativar a pulseira." };
  }

  if (data.ok !== true) {
    const code = String(data.code ?? "RESGATE_FAILED");
    const stored = typeof data.acesso_ate === "string" ? data.acesso_ate : undefined;
    return {
      ok: false,
      code,
      error: RESGATE_MENSAGENS[code] ?? "Não foi possível ativar a pulseira.",
      ...(stored ? { acessoAte: stored } : {}),
    };
  }

  revalidatePath("/salas/[codigo]", "page");
  revalidatePath("/entrar");
  return {
    ok: true,
    message: typeof data.message === "string" ? data.message : "Pulseira ativa.",
    precoCentavos: typeof data.preco_centavos === "number" ? data.preco_centavos : null,
    acessoAte: typeof data.acesso_ate === "string" ? data.acesso_ate : "",
    nome: typeof data.nome === "string" ? data.nome : "",
  };
}
