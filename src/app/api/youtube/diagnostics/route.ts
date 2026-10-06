import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { isDevAccount } from "@/lib/dev";
import { createAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  defaultAppTokenProvider,
  resolveDevApiKeyFromEnv,
  resolveYouTubeApiKey,
  type ResolvedApiKey,
} from "@/lib/youtube/credentials";
import {
  probeYouTubeCredential,
  safeDiagnosticDetail,
  type YouTubeDiagnostic,
} from "@/lib/youtube/diagnostics";
import { getHostAccessToken } from "@/lib/youtube/host-oauth";

/**
 * Diagnóstico da configuração do YouTube — só para conta `dev` (Fase 8f).
 *
 * Este endpoint é o que fecha o ciclo do defeito reportado: sem ele, a única
 * forma de saber por que a busca falhava em produção era a mensagem genérica. Com
 * ele, o dev pergunta ao deploy o que o deploy acha da credencial.
 *
 * TRÊS MODOS, porque ler env e chamar a API têm custos e riscos diferentes:
 *
 *   (padrão)        — o que EXISTE aqui. Nenhuma chamada ao YouTube, nenhuma
 *                     cota gasta. Respondível por `curl` no terminal, o que
 *                     importa quando o problema é "a variável chegou ao deploy?".
 *   ?probe=1        — chama o YouTube de verdade. Gasta 100 unidades de cota
 *                     do projeto da credencial. Devolve o `reason` cru do Google.
 *   ?room=CODE      — a credencial que aquela sala usaria, em vez da global.
 *
 * A separação (padrão vs `?probe=1`) é deliberada: um diagnóstico que só
 * funciona gastando cota é um diagnóstico que ninguém usa na hora do
 * incidente. Checar "a env chegou e o papel é dev" não custa nada.
 */

const NO_STORE = { "Cache-Control": "no-store" } as const;

type DiagnosticReport = YouTubeDiagnostic & {
  /** As variáveis existem, por nome, sem valor. Nunca o valor. */
  envPresent: {
    youtubeApiKey: boolean;
    oauthClientId: boolean;
    oauthClientSecret: boolean;
    appRefreshToken: boolean;
    supabaseServiceRole: boolean;
  };
  /** Contexto do deploy, útil para comparar com o painel. */
  runtime: {
    vercelEnv: boolean;
    vercelRegion: string | null;
    vercelProduction: boolean;
    nodeEnv: string | null;
  };
  /** Papel da sessão — o portão da cadeia de credencial. */
  isDev: boolean;
  /** A origem por onde a credencial seria resolvida, se houvesse. */
  resolvedFrom: string | null;
  /** O que o dev deve conferir agora, em ordem de prioridade. */
  nextSteps: string[];
};

/**
 * O passo principal do diagnóstico de ambiente.
 *
 * A pergunta que ele responde é "o deploy está pronto para a busca funcionar,
 * mesmo sem chave de sala?". Antes da Fase 8f, a resposta era sempre sim quando
 * `YOUTUBE_API_KEY` existisse — porque a cadeia caía nela para qualquer pessoa.
 * Agora a resposta é sim só para conta `dev`, e por isso cada item abaixo é uma
 * condição que ele precisa conferir.
 */
function environmentReport(isDev: boolean): DiagnosticReport {
  const youtubeApiKey = Boolean(process.env.YOUTUBE_API_KEY?.trim());
  const oauthClientId = Boolean(process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim());
  const oauthClientSecret = Boolean(process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim());
  const appRefreshToken = Boolean(process.env.YOUTUBE_APP_REFRESH_TOKEN?.trim());
  const supabaseServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  const nextSteps: string[] = [];
  if (!supabaseServiceRole) {
    nextSteps.push("Falta SUPABASE_SERVICE_ROLE_KEY: sem service role não dá para ler a chave da sala nem o cache compartilhado.");
  }
  if (!oauthClientId || !oauthClientSecret) {
    nextSteps.push("Faltam YOUTUBE_OAUTH_CLIENT_ID/SECRET: sem elas o botão 'conectar conta do YouTube' não funciona.");
  }
  if (!isDev) {
    nextSteps.push("Esta sessão não é dev (is_dev() = false): a chave de YOUTUBE_API_KEY NÃO será usada, por decisão.");
  } else if (!youtubeApiKey && !appRefreshToken) {
    nextSteps.push("Conta dev sem YOUTUBE_API_KEY nem YOUTUBE_APP_REFRESH_TOKEN: a busca usa a chave da sala ou o pool do bar, e nada mais.");
  }
  if (youtubeApiKey && !isDev) {
    nextSteps.push("YOUTUBE_API_KEY está presente no deploy e será ignorada para esta sessão (não-dev). Remova da Vercel se não for mais usada por dev.");
  }

  return {
    ok: nextSteps.length === 0,
    source: "none",
    code: null,
    googleReason: null,
    hint: null,
    httpStatus: null,
    elapsedMs: null,
    envPresent: {
      youtubeApiKey,
      oauthClientId,
      oauthClientSecret,
      appRefreshToken,
      supabaseServiceRole,
    },
    runtime: {
      vercelEnv: Boolean(process.env.VERCEL_ENV),
      vercelRegion: process.env.VERCEL_REGION ?? null,
      vercelProduction: process.env.VERCEL_ENV === "production",
      nodeEnv: process.env.NODE_ENV ?? null,
    },
    isDev,
    resolvedFrom: null,
    nextSteps,
  };
}

/**
 * Resolve a credencial como a busca resolveria, para uma sala específica.
 *
 * Reaproveita `resolveYouTubeApiKey` de propósito: um diagnóstico que
 * montasse a própria cadeia mostraria um estado que a rota nunca produz. O
 * `isDev` vem do banco, como na rota — e por isso a chamada só acontece depois
 * do `isDevAccount` ter aprovado a sessão.
 */
async function resolveForRoom(
  admin: SupabaseClient,
  supabase: SupabaseClient,
  roomCode: string
): Promise<{ credential: ResolvedApiKey | null; isDev: boolean; note: string | null }> {
  const isDev = await isDevAccount(supabase);
  const { data: room } = await supabase
    .from("rooms_public")
    .select("id, host_id, bar_id")
    .eq("code", roomCode)
    .maybeSingle();
  if (!room) {
    return { credential: null, isDev, note: `Sala "${roomCode}" não existe ou você não é membro.` };
  }

  const { data: secretRow } = await admin
    .from("rooms")
    .select("youtube_api_key")
    .eq("id", room.id)
    .maybeSingle();

  let poolKey: string | null = null;
  if (room.bar_id) {
    const { data: barRow } = await supabase
      .from("bars")
      .select("youtube_credential_policy, youtube_pool_id")
      .eq("id", room.bar_id)
      .maybeSingle();
    if (barRow?.youtube_credential_policy === "platform_pool" && barRow.youtube_pool_id) {
      const { data: pool } = await admin
        .from("youtube_credential_pools")
        .select("api_key, active")
        .eq("id", barRow.youtube_pool_id)
        .maybeSingle();
      if (pool?.active) poolKey = pool.api_key;
    }
  }

  const hostToken = await getHostAccessToken({
    hostId: room.host_id,
    store: {
      getRefreshToken: async (hostId) => {
        const { data } = await admin
          .from("youtube_oauth_tokens")
          .select("refresh_token")
          .eq("host_id", hostId)
          .maybeSingle();
        return data?.refresh_token ?? null;
      },
    },
  });

  const credential = await resolveYouTubeApiKey({
    roomKey: secretRow?.youtube_api_key ?? null,
    hostToken,
    platformKey: poolKey,
    isDev,
    appToken: defaultAppTokenProvider(),
    devApiKey: resolveDevApiKeyFromEnv(),
  });

  return { credential, isDev, note: null };
}

/**
 * O passo quando a sala existe mas a cadeia resolve `null`.
 *
 * Sem isto o `?room=` devolvia `hint: null` justo no caso que ele existe para
 * diagnosticar — sala que não tem chave, nem conta conectada, nem pool. O dev
 * via "nenhuma credencial" sem nenhuma pista do que fazer, que é o defeito
 * original da Fase 8f em outra forma.
 */
function missHint(roomCode: string | null): string {
  if (!roomCode) {
    return "Nenhuma credencial de desenvolvimento está configurada: sem YOUTUBE_API_KEY nem YOUTUBE_APP_REFRESH_TOKEN, nem a conta dev tem busca. Comente '?probe=1' para testar uma credencial que exista.";
  }
  return `A sala "${roomCode}" não tem chave própria nem conta do YouTube conectada, e a política do bar não dá acesso a uma chave da plataforma. É esse o estado que o participante vê como "CREDENTIAL_NOT_CONFIGURED".`;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Faça login para usar o diagnóstico.", code: "UNAUTHENTICATED" },
      { status: 401, headers: NO_STORE }
    );
  }

  // O portão. `is_dev()` falha fechado quando não há linha em `dev_accounts`
  // (migration 34), então quem não é dev recebe 403 sem poder sondar a
  // existência de variáveis do servidor. Um diagnóstico de configuração é
  // informação de infraestrutura: não é para quem opera o bar.
  const isDev = await isDevAccount(supabase);
  if (!isDev) {
    return NextResponse.json(
      { error: "Diagnóstico restrito a contas de desenvolvimento.", code: "FORBIDDEN" },
      { status: 403, headers: NO_STORE }
    );
  }

  const wantsProbe = request.nextUrl.searchParams.get("probe") === "1";
  const roomCode = request.nextUrl.searchParams.get("room")?.trim();

  // Modo ambiente: sem chave da sala e, por padrão, sem chamar o Google.
  if (!roomCode) {
    if (!wantsProbe) return NextResponse.json(environmentReport(true), { headers: NO_STORE });
  }

  try {
    const admin = createAdmin();
    const resolved = roomCode
      ? await resolveForRoom(admin, supabase, roomCode)
      : {
          credential: await resolveYouTubeApiKey({
            roomKey: null,
            isDev: true,
            appToken: defaultAppTokenProvider(),
            devApiKey: resolveDevApiKeyFromEnv(),
          }),
          isDev: true,
          note: null,
        };

    if (!wantsProbe) {
      // Mostra de onde viria a credencial sem gastar cota: responde a
      // "a cadeia resolveria o quê aqui?" sem chamar o YouTube.
      const report = environmentReport(resolved.isDev);
      return NextResponse.json(
        {
          ...report,
          room: roomCode ?? null,
          resolvedFrom: resolved.credential?.source ?? "none",
          hint: resolved.credential ? null : (resolved.note ?? missHint(roomCode ?? null)),
          code: resolved.credential ? null : "CREDENTIAL_NOT_CONFIGURED",
        },
        { headers: NO_STORE }
      );
    }

    const probe = await probeYouTubeCredential({ credential: resolved.credential });
    const report = environmentReport(resolved.isDev);
    return NextResponse.json(
      {
        ...probe,
        room: roomCode ?? null,
        // O `note` também no modo probe: sem ele, "a sala não existe" e "a sala
        // existe mas não tem credencial" saíam idênticos — `CREDENTIAL_NOT_CONFIGURED`
        // nos dois casos, que é mandar o dev configuring something que não existe.
        note: resolved.note,
        envPresent: report.envPresent,
        runtime: report.runtime,
        isDev: resolved.isDev,
        resolvedFrom: resolved.credential?.source ?? "none",
        nextSteps: probe.ok
          ? ["Chave aceita pelo YouTube. Se a busca ainda falha no app, o problema está em outro caminho."]
          : report.nextSteps,
      },
      { headers: NO_STORE }
    );
  } catch (error) {
    // Endpoint de diagnóstico é, por desenho, a coisa que mais devolve texto
    // de exceção — e é por isso que o detalhe precisa passar por
    // `safeDiagnosticDetail`, e não por `error.message` cru. A justificativa é
    // simétrica à do `googleReason`: o Google ecoa a URL com `?key=` na mensagem
    // e o `YouTubeApiError` tem tratamento próprio; uma exceção desconhecida
    // (`fetch` do token, cliente do Supabase, driver) não tem garantia nenhuma de
    // que a própria mensagem não cita a URL montada com a chave.
    const detail = safeDiagnosticDetail(error);
    return NextResponse.json(
      {
        error: "O diagnóstico não conseguiu concluir.",
        code: "DIAGNOSTIC_FAILED",
        detail,
        envPresent: environmentReport(true).envPresent,
        runtime: environmentReport(true).runtime,
        isDev: true,
        nextSteps: detail.redacted
          ? [
              "A exceção acima é do servidor, não do Google: confira as env e se o Supabase responde.",
              "A mensagem foi omitida porque continha um segredo (chave ou token) — abra o log do servidor.",
            ]
          : [
              "A exceção acima é do servidor, não do Google: confira as env e se o Supabase responde.",
            ],
      },
      { status: 500, headers: NO_STORE }
    );
  }
}