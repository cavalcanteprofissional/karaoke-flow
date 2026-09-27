/**
 * Diagnóstico das actions de fila (Fase 8a) — rode quando o host "aprovar"、
 * "remover" ou "trocar" uma música responder que ela não está mais na fila.
 *
 * O bug original: as três actions faziam a PRÉ-LEITURA do item com
 * `rooms!inner(host_id, code)` e guardavam só `data` — o `error` do PostgREST
 * era descartado, então qualquer falha (embed rejeitado, cache de schema,
 * linha zerada pelo `!inner` + RLS) virava `data: null` e caía no NOT_FOUND
 * "Essa música não está mais na fila.". O UPDATE nunca chegava a rodar.
 *
 * Este script reproduz, com sessão REAL de host (anon key + signIn), a mesma
 * cadeia que a action faz e imprime o erro cru de cada etapa:
 *   1. select com o embed (a forma quebrada)
 *   2. select sem o embed (a forma corrigida)
 *   3. select da sala por id (o que a action passa a fazer)
 *   4. update no-op (mesmo status) — prova a policy de escrita + o .select()
 *   5. update de verdade (pending -> approved) e volta ao status original
 *
 * Ele mexe no status de UM item e restaura. Rode: node
 * scripts/diagnose-queue-actions.mjs
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
for (const k of [url, anonKey]) {
  if (!k) {
    console.error("Faltam NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY");
    process.exit(1);
  }
}

const ROOM_CODE = process.argv[2] ?? "KARAOKE";
const HOST_EMAIL = process.argv[3] ?? "dono@exemplo.com";
const HOST_PASSWORD = process.argv[4] ?? "senha123";

function show(label, { data, error }) {
  console.log(`\n--- ${label}`);
  if (error) {
    console.log(`    ERRO  : ${error.code ?? ""} ${error.message}`);
    console.log(
      `    DETALHE: ${error.details ?? "(sem details)"} | hint: ${error.hint ?? "-"}`
    );
  } else {
    console.log(`    OK    : ${JSON.stringify(data)}`);
  }
}

async function main() {
  const supabase = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: sess, error: sessErr } = await supabase.auth.signInWithPassword({
    email: HOST_EMAIL,
    password: HOST_PASSWORD,
  });
  if (sessErr) {
    console.error("Falha no login do host:", sessErr.message);
    process.exit(1);
  }
  const userId = sess.user.id;
  const isAnon = sess.user.is_anonymous ?? false;
  console.log(`Sessão: ${HOST_EMAIL} (${userId}) · anônimo=${isAnon}`);

  const { data: room } = await supabase
    .from("rooms")
    .select("id, code, host_id, queue_approval_mode, status")
    .eq("code", ROOM_CODE)
    .maybeSingle();
  if (!room) {
    console.error(`Sala ${ROOM_CODE} não encontrada (rode npm run seed antes).`);
    process.exit(1);
  }
  console.log(
    `Sala ${room.code} · host=${room.host_id === userId} · fila=${room.queue_approval_mode} · ${room.status}`
  );

  // A fila visível, como o `QueueList` busca.
  const { data: items, error: itemsErr } = await supabase
    .from("queue_items")
    .select("id, title, status, position, added_by_user_id")
    .eq("room_id", room.id)
    .in("status", ["pending", "approved", "playing"])
    .order("position", { ascending: true })
    .limit(100);
  if (itemsErr) {
    console.error("Falha ao ler a fila:", itemsErr.message);
    process.exit(1);
  }
  console.log(`Fila visível: ${items.length} item(ns)`);
  if (items.length === 0) {
    console.error("Nenhum item visível — peça uma música antes de rodar o diagnóstico.");
    process.exit(1);
  }

  const item = items[0];
  console.log(`Item alvo: "${item.title}" (${item.id}) status=${item.status}`);

  // 1. A forma quebrada: embed + error descartado pela action.
  show(
    "1. select COM rooms!inner (a forma que a action usava)",
    await supabase
      .from("queue_items")
      .select("id, status, added_by_user_id, rooms!inner(host_id, code)")
      .eq("id", item.id)
      .maybeSingle()
  );

  // 2. A forma corrigida: sem embed, com room_id explícito.
  show(
    "2. select SEM embed (a forma corrigida)",
    await supabase
      .from("queue_items")
      .select("id, status, added_by_user_id")
      .eq("id", item.id)
      .eq("room_id", room.id)
      .maybeSingle()
  );

  // 3. A sala lida à parte.
  show(
    "3. select da sala por id",
    await supabase
      .from("rooms")
      .select("id, host_id, code")
      .eq("id", room.id)
      .maybeSingle()
  );

  // 4. Escrita no-op: policy + .select() sem mudar nada semanticamente.
  show(
    "4. update no-op (mesmo status) — prova a policy de escrita",
    await supabase
      .from("queue_items")
      .update({ status: item.status })
      .eq("id", item.id)
      .select("id, status")
  );

  // 5. A transição real que o host quer, restaurando o status original.
  if (item.status === "pending") {
    show(
      "5a. update pending -> approved (o que o host quer)",
      await supabase
        .from("queue_items")
        .update({ status: "approved" })
        .eq("id", item.id)
        .select("id, status")
    );
    show(
      "5b. volta para pending (restaura o estado de dev)",
      await supabase
        .from("queue_items")
        .update({ status: "pending" })
        .eq("id", item.id)
        .select("id, status")
    );
  } else {
    console.log("\n(5) pulado: o item não está pending — o teste 4 já provou a escrita.");
  }
}

main().catch((e) => {
  console.error("ERRO NO DIAGNÓSTICO:", e);
  process.exit(1);
});
