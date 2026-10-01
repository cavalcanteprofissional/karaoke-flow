/**
 * DIAGNÓSTICO READ-ONLY das contas de Auth e do dono de domínio (Fase 8b·ter).
 *
 * Por que existe: o cruzamento "e-mail/senha ↔ GitHub" (botão "Vincular GitHub",
 * `supabase.auth.linkIdentity`) tem duas pré-condições que nenhuma tela mostra:
 *
 *   1. a sessão atual precisa ter identidade `email` e NÃO ter `github`
 *      (é o gate do `src/components/auth/user-menu.tsx`);
 *   2. a identidade `github` precisa NÃO estar presa a outro `user_id` — o GoTrue
 *      não funde identidades de usuários diferentes, e uma conta criada por
 *      sign-in com GitHub já ocupa o `provider_id`.
 *
 * Quando a (2) falha, o botão nem aparece nem funciona, e o sintoma chega ao dono
 * como um "Credenciais inválidas." genérico que não explica nada. Este script
 * responde: quem existe, quem tem qual identidade, quem é dono de qual bar/sala, e
 * se o cruzamento está bloqueado — antes de qualquer escrita.
 *
 * CUIDADO QUE CUSTOU UM DIAGNÓSTICO ERRADO: `auth.admin.listUsers` devolve
 * `identidades: []` nesta versão do GoTrue, mesmo para quem acabou de entrar por
 * OAuth. A identidade é lida de `auth.identities` por `scripts/inspect-users.sql`
 * (via Management API) — sem essa leitura o relatório acusa ausências que não
 * existem. Se o SQL não puder rodar, o script avisa e NÃO tira conclusões sobre
 * identidade.
 *
 * NÃO escreve nada: um SELECT por Management API + SELECTs via service role.
 * NÃO imprime segredos (nenhuma chave, nenhuma senha).
 *
 * Uso: npm run inspect:users
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local;
 * SUPABASE_ACCESS_TOKEN para ler identidades e a config de Auth.
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
const serviceRole = g("SUPABASE_SERVICE_ROLE_KEY");
const accessToken = g("SUPABASE_ACCESS_TOKEN");
for (const [k, v] of [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceRole],
]) {
  if (!v) {
    console.error(`Faltam ${k} / SUPABASE_SERVICE_ROLE_KEY no .env.local`);
    process.exit(1);
  }
}

const ref = url.match(/https:\/\/(.+)\.supabase\.co/)?.[1] ?? "?";

/**
 * IDs fixos do seed — o contrato estável do domínio (ver scripts/seed.mjs).
 * O slot do dono é `…0001` por padrão, mas com SEED_HOST_USER_ID a conta real
 * do dono (a que entrou por OAuth) assume o rótulo — e o `…0001` pode nem
 * existir mais, já que foi apagado por órfão.
 */
const HOST_USER_ID = g("SEED_HOST_USER_ID") || null;
const SEED_IDS = new Map([
  [HOST_USER_ID ?? "00000000-0000-0000-0000-000000000001", "dono"],
  ["00000000-0000-0000-0000-000000000002", "ana"],
  ["00000000-0000-0000-0000-000000000003", "bruno"],
  ["00000000-0000-0000-0000-000000000004", "betania"],
]);
const DONO_ID = HOST_USER_ID ?? "00000000-0000-0000-0000-000000000001";

const line = (s = "") => console.log(s);
const head = (s) => {
  line();
  line(`── ${s} ${"─".repeat(Math.max(0, 66 - s.length))}`);
};
const short = (id) => (typeof id === "string" ? id.slice(0, 8) : "—");

/** SELECT por Management API (roda como postgres; é o único jeito de ver auth.*). */
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

/** Estado do manual linking. Envolve: é opcional e não deve derrubar o relatório. */
async function readManualLinking() {
  if (!accessToken) return { skipped: true };
  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) return { error: `HTTP ${res.status}` };
    return { value: (await res.json()).security_manual_linking_enabled };
  } catch (e) {
    return { error: e.message };
  }
}

/** Dono de domínio de cada conta: bars, rooms e contagens de membros/fila. */
async function readOwnership(admin) {
  const out = { bars: [], rooms: [], memberCount: 0, queueCount: 0 };
  for (const [table, idCol, userCol, codeCol] of [
    ["bars", "id", "host_id", "code"],
    ["rooms", "id", "host_id", "code"],
    ["room_members", "room_id", "user_id", null],
    ["queue_items", "id", "added_by_user_id", null],
  ]) {
    const select = [idCol, userCol, ...(codeCol ? [codeCol] : [])].join(",");
    const { data, error } = await admin.from(table).select(select);
    if (error) return { error: `${table}: ${error.message}` };
    for (const r of data ?? []) {
      if (table === "bars") out.bars.push(r);
      else if (table === "rooms") out.rooms.push(r);
      else if (table === "room_members") out.memberCount += 1;
      else out.queueCount += 1;
    }
  }
  return out;
}

async function main() {
  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  head("projeto");
  line(`ref: ${ref}`);

  head("config de Auth (Management API)");
  const manual = await readManualLinking();
  if (manual.skipped) {
    line("security_manual_linking_enabled: (pulado — sem SUPABASE_ACCESS_TOKEN)");
  } else if (manual.error) {
    line(`security_manual_linking_enabled: (erro ao ler — ${manual.error})`);
  } else {
    line(`security_manual_linking_enabled: ${String(manual.value)}`);
    line(
      manual.value === true
        ? '  (o botão "Vincular GitHub" pode ser chamado pelo app)'
        : "  (OFF — `linkIdentity` é recusado pelo GoTrue; rode `npm run enable:manual-linking`)"
    );
  }

  // Contas + identidades. Sem o SQL não há como saber quem tem o quê, e um
  // relatório sem isso seria pior que nenhum (foi o que mentiu na 1ª versão).
  let users = null;
  let identitiesKnown = false;
  if (accessToken) {
    try {
      const sql = fs.readFileSync(path.join(__dirname, "inspect-users.sql"), "utf8");
      users = await query(sql);
      identitiesKnown = true;
    } catch (e) {
      line(`(falha ao ler auth.identities: ${e.message})`);
    }
  } else {
    line(
      "(sem SUPABASE_ACCESS_TOKEN: identidades NÃO serão lidas — veja o aviso abaixo)"
    );
  }

  if (!users) {
    const { data: list, error: listErr } = await admin.auth.admin.listUsers({
      perPage: 1000,
    });
    if (listErr) {
      console.error(`FALHA ao listar usuários: ${listErr.message}`);
      process.exit(1);
    }
    users = (list?.users ?? []).map((u) => ({
      user_id: u.id,
      id_curto: short(u.id),
      email: u.email,
      confirmado_em: u.email_confirmed_at,
      criado_em: u.created_at,
      ultimo_login_em: u.last_sign_in_at,
      anonimo: u.is_anonymous ?? u.app_metadata?.is_anonymous === true,
      identidades: [],
    }));
    line();
    line("!! ATENÇÃO: `listUsers` devolve `identidades: []` neste projeto — o GoTrue");
    line("   não as popula. As linhas abaixo NÃO provam ausência de identidade.");
    line("   Rode com SUPABASE_ACCESS_TOKEN no .env.local para um relatório confiável.");
  }

  const contas = users.filter((u) => !u.anonimo);
  head(`contas com login (${contas.length} de ${users.length} usuários)`);
  for (const u of contas) {
    const seedLabel = SEED_IDS.get(u.user_id);
    line();
    line(`${seedLabel ? `[seed ${seedLabel}] ` : ""}${u.id_curto}`);
    line(`  e-mail:        ${u.email ?? "(sem e-mail — GitHub com e-mail privado)"}`);
    line(`  confirmado:    ${u.confirmado_em ? "sim" : "NÃO"}`);
    line(`  criado:        ${u.criado_em ?? "—"}`);
    line(`  último login:  ${u.ultimo_login_em ?? "—"}`);
    const ids = u.identidades ?? [];
    line(
      `  identidades:   ${ids.length ? ids.map((i) => i.provider).join(" + ") : "(nenhuma)"}`
    );
    for (const i of ids) {
      if (i.provider_id) line(`    ${i.provider}:${String(i.provider_id).slice(0, 14)}…`);
    }
  }
  const anonimos = users.length - contas.length;
  if (anonimos > 0) line(`\n(+ ${anonimos} visitantes anônimos, sem login)`);

  head("dono de domínio");
  const own = await readOwnership(admin);
  if (own.error) {
    line(`falha ao ler domínio: ${own.error}`);
  } else {
    line(`bars:          ${own.bars.length ? "" : "(nenhuma)"}`);
    for (const b of own.bars) {
      const l = SEED_IDS.get(b.host_id);
      line(`  ${b.code}  host=${short(b.host_id)}${l ? `  [seed ${l}]` : ""}`);
    }
    line(`rooms:         ${own.rooms.length ? "" : "(nenhuma)"}`);
    for (const r of own.rooms) {
      const l = SEED_IDS.get(r.host_id);
      line(`  ${r.code}  host=${short(r.host_id)}${l ? `  [seed ${l}]` : ""}`);
    }
    line(`room_members:  ${own.memberCount}`);
    line(`queue_items:   ${own.queueCount}`);
  }

  head("diagnóstico do cruzamento e-mail ↔ GitHub");
  const problems = [];
  const byId = new Map(users.map((u) => [u.user_id, u]));
  const dono = byId.get(DONO_ID);

  if (identitiesKnown) {
    if (!dono) {
      problems.push(
        `A conta de seed do dono (...0001) NÃO existe — nada a cruzar. Rode \`npm run seed\`.`
      );
    } else {
      const donoIds = (dono.identidades ?? []).map((i) => i.provider);
      if (!donoIds.includes("email")) {
        problems.push(
          `A conta do dono (...0001) não tem identidade "email" — o botão "Vincular GitHub" ` +
            `nem aparece (o gate exige email). Rode \`npm run sync:seed-users\`.`
        );
      }
      if (donoIds.includes("github")) {
        line("GitHub já está ligado na conta do dono (...0001). Cruzamento feito.");
      }
    }

    // O bloqueio real: identidade github presa a um user_id que não é o do dono.
    for (const u of users) {
      for (const i of u.identidades ?? []) {
        if (i.provider !== "github" || u.user_id === DONO_ID) continue;
        const donoIds = (dono?.identidades ?? []).map((x) => x.provider);
        problems.push(
          `A identidade GitHub (${String(i.provider_id).slice(0, 14)}…) está presa a ${u.id_curto} ` +
            `(${u.email ?? "e-mail privado"}), que NÃO é a conta do dono (...0001). O GoTrue não ` +
            `funde identidades entre user_ids diferentes: o "Vincular GitHub" falha enquanto esta ` +
            `conta existir. Ela tem identidades: [${(u.identidades ?? []).map((x) => x.provider).join(", ")}].`
        );
        problems.push(
          `  → caminhos: (a) dar e-mail+senha a ${u.id_curto} e deixar o GitHub ser a porta ` +
            `principal — é a conta real do dono; ou (b) apagar ${u.id_curto} e refazer o seed ` +
            `usando o GitHub. O (b) perde as salas, e elas são descartáveis.`
        );
        if (donoIds.includes("email")) {
          problems.push(
            `  → sobre (b): o dono (...0001) tem identidade "email" funcionando; apagar as 4 contas ` +
              `de seed destrói ${own.bars.length} bar(s) e ${own.rooms.length} sala(s) em cascade.`
          );
        }
      }
    }

    // E-mail duplicado é o motivo número um de "usuário já existe" no Admin API.
    const byEmail = new Map();
    for (const u of users) {
      if (!u.email) continue;
      const k = u.email.toLowerCase();
      if (!byEmail.has(k)) byEmail.set(k, []);
      byEmail.get(k).push(u);
    }
    for (const [mail, group] of byEmail) {
      if (group.length > 1) {
        problems.push(
          `E-mail duplicado "${mail}" em ${group.length} contas (${group
            .map((u) => u.id_curto)
            .join(", ")}) — o Admin API recusa.`
        );
      }
    }

    // profile sem dono: o trigger handle_new_user só roda no INSERT.
    const missing = [];
    for (const u of users) {
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("id", u.user_id)
        .maybeSingle();
      if (!data) missing.push(u.id_curto);
    }
    if (missing.length) {
      problems.push(
        `Usuário(s) sem linha em profiles: ${missing.join(", ")} — o trigger handle_new_user ` +
          `só roda no INSERT em auth.users; o profile não volta sozinho.`
      );
    }
  } else {
    line("Relatório INCOMPLETO: sem SUPABASE_ACCESS_TOKEN não dá para dizer quem tem");
    line("identidade, e é exatamente essa informação que decide o cruzamento.");
  }

  if (problems.length === 0 && identitiesKnown) {
    line("Nada bloqueando: o cruzamento deve funcionar.");
  } else {
    for (const p of problems) line(`• ${p}`);
  }

  line();
  line("(diagnóstico somente-leitura — nada foi alterado)");
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
