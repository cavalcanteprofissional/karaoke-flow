/**
 * MEDIÇÃO dos limites do plano e da latência do realtime (Fase 8, itens 3 e 8).
 *
 * Por que este script existe: o `TODO.md` traz há três fases dois itens que nunca
 * tinham número — "validar limites do free tier do Realtime" e "latência realtime
 * < 2s validada entre controller e tela". Nenhum dos dois é um bug: é uma decisão
 * de arquitetura que precisa de dado. Quantas conexões o projeto aguenta antes de
 * o canal cair? Quanto tempo leva um aviso de fila entre dois aparelhos? O poll de
 * segurança é de 5s (player) e 10s (fila) — ou seja, o alvo de 2s **só é
 * atingido se o broadcast estiver funcionando**, e isso precisa ser número, não
 * intenção.
 *
 * O que ele mede:
 *   1. Postgres: tamanho do banco e de cada tabela, linhas por tabela de domínio,
 *      conexões abertas, contas de Auth (com_login × anônimos);
 *   2. Realtime: rampa de conexões simultâneas (em que passo o canal falha);
 *   3. Realtime: latência de broadcast entre dois clientes (p50/p95/máx) — este é
 *      o termo dominante da latência "controller → TV";
 *   4. Realtime: custo de um `announceQueueChange` real (assinar + enviar +
 *      desassinar, a mesma sequência de `src/lib/rooms/room-channel.ts`), que é o
 *      que a action de fila paga depois de gravar no banco;
 *   5. latência do caminho de escrita do app (UPDATE real pela Data API com sessão
 *      de host) — quantas idas e voltas o celular espera antes do aviso.
 *
 * O que ele NÃO mede, e por quê:
 *   - a tela de verdade (TV/celular). A latência "controller → tela" de ponta a
 *     ponta continua sendo validação manual no browser (`TESTING.md` §3.9·ter);
 *     a regra do projeto é que suíte e script não substituem browser real.
 *   - banda/streaming. O script mede contagem de mensagens, não bytes
 *     consumidos: o bandwidth é do projeto inteiro e não isola este teste.
 *
 * QUASE NADA DESTRUTIVO: as seções 1–4 são somente-leitura (SELECT e assinaturas
 * de canal). A seção 5 faz **uma** escrita, e ela é declarada: um `UPDATE` que não
 * muda status, posição nem conteúdo, mas cujo trigger `touch_updated_at` reescreve
 * `updated_at` para `now()` — a linha muda mesmo. É inevitável medir o caminho de
 * escrita pelo mesmo caminho que o app usa (Data API + sessão real de host, porque
 * a policy é host-only); rodar com `--no-write` pula a seção e a rodada vira
 * leitura pura. Nada é criado e nada é apagado em nenhum modo.
 * NÃO imprime segredos (nenhuma chave, senha ou token de player).
 *
 * Uso:
 *   npm run measure:limits
 *   npm run measure:limits -- --json          # também despeja os números em JSON
 *   npm run measure:limits -- --no-ramp       # pula a rampa de conexões
 *   npm run measure:limits -- --ramp-max 100  # teto da rampa (padrão 200)
 *   npm run measure:limits -- --no-write      # zero escrita no banco
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
if (!fs.existsSync(envPath)) {
  console.error(".env.local não encontrado. Copie de .env.example e preencha.");
  process.exit(1);
}

const env = fs.readFileSync(envPath, "utf8");
const g = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim() : undefined;
};

const url = g("NEXT_PUBLIC_SUPABASE_URL");
const anonKey = g("NEXT_PUBLIC_SUPABASE_ANON_KEY");
const accessToken = g("SUPABASE_ACCESS_TOKEN");
for (const [nome, valor] of [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
]) {
  if (!valor) {
    console.error(`Faltam ${nome} no .env.local`);
    process.exit(1);
  }
}

const args = process.argv.slice(2);
const hasFlag = (f) => args.includes(f);
const argValue = (f, fallback) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};

const ref =
  url.match(/https:\/\/(.+)\.supabase\.co/)?.[1] ?? url.split("//")[1].split(".")[0];

/**
 * Teto do plano gratuito como **publicado** pela Supabase (pricing/docs), para
 * comparação lado a lado. Fonte: documentação de planos da Supabase — número de
 * plano, não de projeto, e **sujeito a mudar**: o que vale é o medido em (2). Se
 * o número publicado divergir do medido, o medido é o que importa e este objeto
 * precisa ser atualizado (é a razão de o script existir).
 */
const LIMITES_PUBLICADOS_FREE = {
  bancoMB: 500,
  conexoesRealtimeSimultaneas: 200,
  bandaEgressMensalGB: 5,
  storageGB: 1,
  fonte: "documentação de planos da Supabase (verificar antes de citar)",
};

const results = {};
const line = (s = "") => console.log(s);
const head = (s) => {
  line();
  line(`── ${s} ${"─".repeat(Math.max(0, 68 - s.length))}`);
};

/** SELECT por Management API (roda como postgres — o único jeito de ver pg_*). */
async function query(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  const rows = JSON.parse(text);
  return Array.isArray(rows) ? rows : [rows];
}

const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
const pct = (a, b) => (b > 0 ? `${((a / b) * 100).toFixed(1)}%` : "—");

function stats(samples) {
  if (samples.length === 0) return null;
  const sorted = [...samples].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    n: sorted.length,
    minMs: +sorted[0].toFixed(1),
    p50Ms: +at(0.5).toFixed(1),
    p95Ms: +at(0.95).toFixed(1),
    maxMs: +sorted[sorted.length - 1].toFixed(1),
  };
}

/**
 * Abre um canal e resolve quando ele fica SUBSCRIBED (ou recusa no timeout).
 * Cada `createClient` do supabase-js abre o seu próprio WebSocket, então N
 * clientes = N conexões — que é o que a rampa de conexões precisa medir.
 */
function openChannel(
  supabase,
  topic,
  { event = "ping", onEvent, timeoutMs = 10_000 } = {}
) {
  return new Promise((resolve) => {
    const started = Date.now();
    const channel = supabase.channel(topic);
    if (onEvent) channel.on("broadcast", { event }, onEvent);
    let settled = false;
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      resolve({ ok, error, ms: Date.now() - started, channel, supabase });
    };
    const timer = setTimeout(() => finish(false, "timeout na assinatura"), timeoutMs);
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        finish(true, null);
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        finish(false, status);
      }
      // CHOSED é o teardown: não é falha.
    });
  });
}

/**
 * Fecha uma conexão de sonda. `SupabaseClient` NÃO tem `.close()` — quem segura
 * o WebSocket é `client.realtime` (o `SupabaseRealtimeClient`), que expõe
 * `disconnect()`. Sem isso o processo segura centenas de sockets até o fim, e a
 * rampa passaria a medir o socket do Node em vez do teto do projeto.
 */
async function closeOne(c) {
  try {
    await c.supabase.removeChannel(c.channel);
  } catch {
    /* best-effort: socket morto no fim do teste não é achado */
  }
  try {
    await c.supabase.realtime.disconnect();
  } catch {
    /* best-effort */
  }
}

async function closeAll(clientes) {
  for (const c of clientes) await closeOne(c);
}

// ---------------------------------------------------------------------------
// 1) Postgres: tamanho, linhas, conexões e contas
// ---------------------------------------------------------------------------
async function measurePostgres() {
  head("Postgres");
  if (!accessToken) {
    line("(pulado — sem SUPABASE_ACCESS_TOKEN no .env.local)");
    return { disponivel: false };
  }

  try {
    const [db] = await query("select pg_database_size(current_database()) as bytes");
    const bytes = Number(db.bytes);
    line(`Banco: ${mb(bytes)} MB de ${LIMITES_PUBLICADOS_FREE.bancoMB} MB publicados`);
    line(`      ${pct(bytes, LIMITES_PUBLICADOS_FREE.bancoMB * 1024 * 1024)} usado`);

    const tabelas = await query(`
      select c.relname as tabela,
             c.reltuples::bigint as estimativa_linhas,
             pg_total_relation_size(c.oid) as bytes
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       order by pg_total_relation_size(c.oid) desc
    `);
    const alvos = [
      "bars",
      "rooms",
      "room_members",
      "queue_items",
      "song_cache",
      "consents",
      "profiles",
      "dev_accounts",
      "youtube_oauth_tokens",
    ];
    line();
    line("Tabela                      linhas    MB");
    const linhas = {};
    for (const t of tabelas) {
      if (!alvos.includes(t.tabela)) continue;
      linhas[t.tabela] = Number(t.estimativa_linhas);
      line(
        `  ${t.tabela.padEnd(24)} ${String(t.estimativa_linhas).padStart(7)}  ${mb(Number(t.bytes)).padStart(7)}`
      );
    }
    line();
    line("(linhas = estimativa do planner; exato só com ANALYZE. Em base de");
    line(" desenvolvimento o número pequeno não significa 'pouco dado'.)");

    // ATENÇÃO ao `await`: `await query(sql)[0]` indexaria a PROMISE (o `await`
    // tem precedência menor que o acesso a membro) e devolveria `undefined`.
    // O parêntese é obrigatório.
    const conn = (
      await query(`
      select count(*)::int as total,
             count(*) filter (where state = 'active')::int as ativas,
             count(*) filter (where state = 'idle')::int as ociosas,
             count(*) filter (where state = 'idle in transaction')::int as ociosas_em_tx
        from pg_stat_activity
    `)
    )[0];
    line();
    line(
      `Conexões: ${conn.total} (ativas ${conn.ativas} · ociosas ${conn.ociosas} · ociosas em tx ${conn.ociosas_em_tx})`
    );

    let contas = null;
    try {
      const [u] = await query(`
        select count(*)::int as total,
               count(*) filter (where coalesce(is_anonymous, false) = false)::int as com_login,
               count(*) filter (where coalesce(is_anonymous, false) = true)::int as anonimos
          from auth.users
      `);
      contas = {
        total: Number(u.total),
        comLogin: Number(u.com_login),
        anonimos: Number(u.anonimos),
      };
      line(
        `Contas: ${contas.total} (com login ${contas.comLogin} · anônimos ${contas.anonimos}) — anônimo não tem limite por conta`
      );
    } catch (e) {
      line(`Contas: (erro ao ler auth.users — ${e.message})`);
    }

    results.postgres = {
      bancoMB: +mb(bytes),
      limitePublicadoMB: LIMITES_PUBLICADOS_FREE.bancoMB,
      usoPct: +((bytes / (LIMITES_PUBLICADOS_FREE.bancoMB * 1024 * 1024)) * 100).toFixed(
        2
      ),
      linhas,
      conexoes: {
        total: Number(conn.total),
        ativas: Number(conn.ativas),
        ociosas: Number(conn.ociosas),
        ociosasEmTx: Number(conn.ociosas_em_tx),
      },
      contas,
    };
    return results.postgres;
  } catch (e) {
    line(`(falha ao ler o Postgres: ${e.message})`);
    results.postgres = { disponivel: false, erro: e.message };
    return results.postgres;
  }
}

// ---------------------------------------------------------------------------
// 2) Rampa de conexões simultâneas do Realtime
// ---------------------------------------------------------------------------

/**
 * Timeout curto na rampa: são 200 assinaturas, e esperar o timeout padrão em
 * cada falha vira vários minutos de parede esperando um erro que não vem.
 */
const RAMP_TIMEOUT_MS = 15_000;
const RAMP_PASSO_TIMEOUT_MS = 120_000;

async function measureConnections(rampMax) {
  head(`Realtime — conexões simultâneas (teto ${rampMax})`);
  const topic = `probe-kf-limits-${Date.now()}`;
  const steps = [1, 10, 25, 50, 100, 200].filter((n) => n <= rampMax);
  const clientes = [];
  const rampa = [];

  for (const alvo of steps) {
    const faltam = alvo - clientes.length;
    const t0 = Date.now();
    // As assinaturas vão EM PARALELO. A primeira versão fazia uma por vez e um
    // passo de 200 estourava 10 minutos de timeout do shell, porque cada abertura
    // de WebSocket leva ~1,3 s (medido abaixo). O que interessa é o TETO do
    // projeto, não a paciência do script.
    const novos = Array.from({ length: faltam }, () =>
      createClient(url, anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 1000 } },
      })
    );
    const assinaturas = await Promise.race([
      Promise.all(
        novos.map((s) => openChannel(s, topic, { timeoutMs: RAMP_TIMEOUT_MS }))
      ),
      new Promise((r) => setTimeout(() => r(null), RAMP_PASSO_TIMEOUT_MS)),
    ]);
    if (assinaturas === null) {
      line(
        `  (passo de ${alvo} conexões estourou ${RAMP_PASSO_TIMEOUT_MS / 1000}s — abortando)`
      );
      break;
    }
    const lote = assinaturas.map((a, i) => ({ ...a, supabase: novos[i] }));
    clientes.push(...lote);
    const okNoLote = lote.filter((c) => c.ok).length;
    // As falhas são as DO LOTE. Somar `clientes.length - okNoLote` contaria como
    // falha toda conexão que veio do passo anterior — foi o que fez a primeira
    // versão reportar "1 conexão estável" num teste em que 50 abriram.
    const falhas = lote.length - okNoLote;
    const maisLenta = Math.max(...lote.map((c) => c.ms));
    const passo = {
      conexoes: clientes.length,
      ok: okNoLote,
      falhas,
      assinaturaMaisLentaMs: maisLenta,
      duracaoPassoMs: Date.now() - t0,
    };
    rampa.push(passo);
    line(
      `  ${String(alvo).padStart(3)} conexões → ${okNoLote} ok, ${falhas} falha(s) no passo` +
        ` · ${passo.duracaoPassoMs} ms` +
        (maisLenta > 1500 ? ` (assinatura mais lenta ${maisLenta} ms)` : "")
    );
    if (falhas > 0) {
      line(
        `  → o canal recusou antes do passo inteiro; erros: ${clientErrors(clientes)}`
      );
      break;
    }
  }

  const maxOk = Math.max(
    0,
    ...rampa.filter((r) => r.falhas === 0).map((r) => r.conexoes)
  );
  const primeiroQueFalhou = rampa.find((r) => r.falhas > 0);
  line();
  line(
    primeiroQueFalhou
      ? `Máxima estável medida: ${maxOk} conexões simultâneas. Publicado: ${LIMITES_PUBLICADOS_FREE.conexoesRealtimeSimultaneas}.`
      : `Todas as ${maxOk} conexões abriram (nenhuma falha até o teto). Publicado: ${LIMITES_PUBLICADOS_FREE.conexoesRealtimeSimultaneas}.`
  );
  results.conexoes = {
    maxEstavel: maxOk,
    limitePublicado: LIMITES_PUBLICADOS_FREE.conexoesRealtimeSimultaneas,
    falhaEm: primeiroQueFalhou ? primeiroQueFalhou.conexoes : null,
    rampa,
  };
  await closeAll(clientes);
}

function clientErrors(clientes) {
  const erros = new Set();
  for (const c of clientes) if (!c.ok && c.error) erros.add(c.error);
  return [...erros].join(", ") || "(sem detalhe)";
}

// ---------------------------------------------------------------------------
// 3) Latência de broadcast entre dois clientes (o termo dominante)
// ---------------------------------------------------------------------------
async function measureBroadcastLatency(amostras = 60) {
  head(`Realtime — latência de broadcast (${amostras} envios)`);
  const topic = `probe-kf-lat-${Date.now()}`;
  const receptor = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const emissor = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const recebidos = new Map();
  const sub = await openChannel(receptor, topic, {
    onEvent: (msg) => {
      // A chave é o `seq`; o TEMPO viaja no payload. (A primeira versão media
      // `Date.now() - seq` e reportava 1,79 trilhões de ms — relógio não é chave.)
      const seq = Number(msg?.payload?.seq ?? -1);
      const enviado = Number(msg?.payload?.t ?? 0);
      if (seq < 0 || !enviado) return;
      recebidos.set(seq, Date.now() - enviado);
    },
  });
  if (!sub.ok) {
    line(`(não foi possível assinar o receptor: ${sub.error} — pulando)`);
    await closeAll([sub]);
    return;
  }

  const subEmissor = await openChannel(emissor, topic);
  if (!subEmissor.ok) {
    line(`(não foi possível assinar o emissor: ${subEmissor.error} — pulando)`);
    await closeAll([sub, subEmissor]);
    return;
  }
  const latencias = [];
  let perdidos = 0;
  for (let seq = 0; seq < amostras; seq++) {
    const res = await subEmissor.channel.send({
      type: "broadcast",
      event: "ping",
      payload: { seq, t: Date.now() },
    });
    if (res !== "ok") {
      perdidos += 1;
      continue;
    }
    const limite = Date.now() + 3000;
    while (!recebidos.has(seq) && Date.now() < limite) {
      await new Promise((r) => setTimeout(r, 5));
    }
    if (recebidos.has(seq)) latencias.push(recebidos.get(seq));
    else perdidos += 1;
  }
  const st = stats(latencias);
  if (!st) {
    line("(nenhuma entrega confirmada)");
  } else {
    line(`entregues: ${st.n} · perdidos/timeout: ${perdidos}`);
    line(
      `ida e volta: min ${st.minMs} ms · p50 ${st.p50Ms} ms · p95 ${st.p95Ms} ms · máx ${st.maxMs} ms`
    );
    line(
      st.p95Ms < 2000
        ? "→ abaixo de 2 s: o alvo de latência é viável no caminho broadcast."
        : "→ ACIMA de 2 s no broadcast: o alvo só se sustenta com o poll (5–10 s), que não bate 2 s."
    );
  }
  results.broadcast = { ...(st ?? {}), perdidos, limite2s: st ? st.p95Ms < 2000 : null };
  await closeAll([sub, subEmissor]);
}

// ---------------------------------------------------------------------------
// 4) Custo de um announceQueueChange (o que a action paga após gravar)
// ---------------------------------------------------------------------------
async function measureAnnounce(vezes = 10) {
  head(`Realtime — custo de um aviso de fila (${vezes}×)`);
  const topic = `probe-kf-announce-${Date.now()}`;
  const amostras = [];
  const porEtapa = { criar: [], assinar: [], enviar: [], fechar: [] };
  for (let i = 0; i < vezes; i++) {
    // Mesma sequência de `announceQueueChange`: criar client → assinar → enviar →
    // desassinar. É o custo por mutação de fila, em todas as actions do host.
    const t0 = Date.now();
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const t1 = Date.now();
    porEtapa.criar.push(t1 - t0);

    const c = await openChannel(supabase, topic);
    if (!c.ok) {
      line(`  (falhou na assinatura: ${c.error})`);
      break;
    }
    const t2 = Date.now();
    porEtapa.assinar.push(t2 - t1);

    await supabase
      .channel(topic)
      .send({ type: "broadcast", event: "ping", payload: { at: i } });
    const t3 = Date.now();
    porEtapa.enviar.push(t3 - t2);

    await closeOne(c);
    porEtapa.fechar.push(Date.now() - t3);
    amostras.push(Date.now() - t0);
  }
  const st = stats(amostras);
  if (st) {
    line(
      `p50 ${st.p50Ms} ms · p95 ${st.p95Ms} ms · máx ${st.maxMs} ms (criar + assinar + enviar + fechar)`
    );
    for (const etapa of ["criar", "assinar", "enviar", "fechar"]) {
      const s = stats(porEtapa[etapa]);
      if (s) {
        line(
          `  ${etapa === "enviar" ? "└" : "├"} ${etapa.padEnd(8)} p50 ${String(s.p50Ms).padStart(5)} ms · p95 ${s.p95Ms} ms`
        );
      }
    }
    line(
      "→ é o que o celular do host paga DEPOIS de gravar no banco, em cada ação de fila."
    );
    const semCanal = stats(porEtapa.criar);
    const abertura = stats(porEtapa.assinar);
    if (semCanal && abertura) {
      const msAbertura = semCanal.p50Ms + abertura.p50Ms;
      const parte = Math.round((msAbertura / st.p50Ms) * 100);
      line(
        `   ⚠ ${parte}% do custo é abrir a conexão (criar + assinar). O aviso pode sair por um`
      );
      line("     canal já vivo — o mesmo que a tela de quem ouve mantém aberto —");
      line("     e cair para o custo de `enviar` (ordem de milissegundos).");
    }
  }
  results.aviso = {
    ...(st ?? { erro: "sem amostra" }),
    etapas: Object.fromEntries(Object.entries(porEtapa).map(([k, v]) => [k, stats(v)])),
  };
}

// ---------------------------------------------------------------------------
// 5) Latência do caminho de escrita do app (sessão real de host)
// ---------------------------------------------------------------------------
async function measureWritePath() {
  head("Latência — caminho de escrita do app (sessão real de host)");
  if (hasFlag("--no-write")) {
    line("(pulado — --no-write: esta é a ÚNICA seção que escreve no banco)");
    return;
  }
  const email = g("SEED_HOST_EMAIL");
  const senha = g("SEED_PASSWORD");
  if (!email || !senha) {
    line("(pulado — sem SEED_HOST_EMAIL/SEED_PASSWORD no .env.local)");
    return;
  }
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: sessErr } = await supabase.auth.signInWithPassword({
    email,
    password: senha,
  });
  if (sessErr) {
    line(`(login do host falhou: ${sessErr.message} — pulado)`);
    return;
  }

  const { data: item } = await supabase
    .from("queue_items")
    .select("id, room_id, title, updated_at")
    .in("status", ["pending", "approved", "playing"])
    .limit(1)
    .maybeSingle();
  if (!item) {
    line("(pulado — nenhum item visível na fila; peça uma música antes)");
    return;
  }

  // A ÚNICA escrita do script, e ela é declarada: um `UPDATE` que não muda
  // status/posição/nada de conteúdo, mas cujo trigger `touch_updated_at` reescreve
  // `updated_at` para `now()` — ou seja, a linha muda de fato. Por isso o item
  // acima é pulado com `--no-write`, e o rodapé não chama o script de
  // "somente-leitura" sem ressalva. Precisa de sessão de host porque a policy de
  // UPDATE é host-only — é esse round-trip que o celular espera.
  const amostras = [];
  for (let i = 0; i < 5; i++) {
    const t = Date.now();
    const { error } = await supabase
      .from("queue_items")
      .update({ updated_at: item.updated_at })
      .eq("id", item.id)
      .select("id");
    const ms = Date.now() - t;
    if (error) {
      line(`  (erro na escrita: ${error.message})`);
      break;
    }
    amostras.push(ms);
  }
  const st = stats(amostras);
  if (st) {
    line(
      `UPDATE host-only + select: p50 ${st.p50Ms} ms · p95 ${st.p95Ms} ms (n=${st.n})`
    );
    line("→ some com o aviso de fila, e o total é o alvo de 2 s do `TODO.md`.");
  }
  results.escrita = st ?? { erro: "sem amostra" };
}

async function main() {
  head("projeto");
  line(`ref: ${ref}`);
  line(`url: ${url}`);
  line(`modo: ${hasFlag("--json") ? "JSON no fim" : "relatório"}`);

  await measurePostgres();

  if (!hasFlag("--no-ramp")) {
    await measureConnections(Number(argValue("--ramp-max", 200)));
  } else {
    line();
    line("(rampa de conexões pulada — --no-ramp)");
  }

  await measureBroadcastLatency();
  await measureAnnounce();
  await measureWritePath();

  head("publicado × medido");
  line(
    `banco: medido ${results.postgres?.bancoMB ?? "—"} MB · publicado ${LIMITES_PUBLICADOS_FREE.bancoMB} MB`
  );
  line(
    `conexões realtime: medido ${results.conexoes?.maxEstavel ?? "—"} · publicado ${LIMITES_PUBLICADOS_FREE.conexoesRealtimeSimultaneas}`
  );
  line(`broadcast p95: ${results.broadcast?.p95Ms ?? "—"} ms · alvo do TODO: < 2000 ms`);
  line();
  line(`limites publicados: ${JSON.stringify(LIMITES_PUBLICADOS_FREE)}`);
  line("O MEDIDO manda: é o número deste projeto, agora. Se divergir do publicado,");
  line(
    "atualize a constante no script e registre a data em docs/engenharia/limites-free-tier.md."
  );

  if (hasFlag("--json")) {
    line();
    line("--- JSON ---");
    line(JSON.stringify(results, null, 2));
  }

  line();
  if (hasFlag("--no-write")) {
    line("(RODADA SEM ESCRITA — nenhuma seção mediu nada que gravasse no banco)");
  } else {
    line(
      "(SEM ESCRITA, exceto o item 5: um UPDATE sem mudança de conteúdo, cujo trigger reescreve `updated_at` de 1 item da fila. Use --no-write para zero escrita.)"
    );
  }
}

main().catch((e) => {
  console.error("ERRO NA MEDIÇÃO:", e.message);
  process.exit(1);
});
