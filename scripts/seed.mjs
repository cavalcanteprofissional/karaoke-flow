/**
 * Seed determinístico de dev (TESTING.md §2.5).
 *
 * - Usuários são criados via Auth Admin API (service role) com IDs fixos —
 *   raw SQL em auth.users deixa o serviço Auth instável (validação OK: todos
 *   os fluxos de login funcionam após).
 * - O trigger handle_new_user cria os profiles automaticamente.
 * - Dados de domínio (salas/membros/fila) são inseridos via service role,
 *   de forma idempotente (re-executável).
 *
 * Uso: npm run seed
 * Requer credenciais válidas em .env.local.
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
for (const k of [url, serviceRole]) {
  if (!k) {
    console.error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local"
    );
    process.exit(1);
  }
}

const USERS = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    email: "dono@exemplo.com",
    name: "Dono do Bar",
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    email: "ana@exemplo.com",
    name: "Participante Ana",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    email: "bruno@exemplo.com",
    name: "Participante Bruno",
  },
];
const PASSWORD = "senha123";

const KARAOK = "10000000-0000-0000-0000-000000000001";
const BAR2FO = "10000000-0000-0000-0000-000000000002";

async function ensureUsers(admin) {
  const { data: existing } = await admin.auth.admin.listUsers({ perPage: 1000 });
  const byEmail = new Map((existing?.users ?? []).map((u) => [u.email, u]));

  const ids = [];
  for (const u of USERS) {
    const found = byEmail.get(u.email);
    if (found) {
      ids.push(found.id);
      console.log("usuário já existe:", u.email, "→", found.id);
    } else {
      const { data, error } = await admin.auth.admin.createUser({
        id: u.id,
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.name },
      });
      if (error) throw new Error("falha ao criar " + u.email + ": " + error.message);
      ids.push(data.user.id);
      console.log("usuário criado:", u.email, "→", data.user.id);
    }
  }
  return ids;
}

async function main() {
  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ids = await ensureUsers(admin);
  const [dono, ana, bruno] = ids;

  // Dados de domínio — idempotente: remove e insere os registros do seed.
  const { error: cleanQueue } = await admin
    .from("queue_items")
    .delete()
    .in("room_id", [KARAOK, BAR2FO]);
  if (cleanQueue) throw new Error("limpeza queue_items: " + cleanQueue.message);
  const { error: cleanMembers } = await admin
    .from("room_members")
    .delete()
    .in("room_id", [KARAOK, BAR2FO]);
  if (cleanMembers) throw new Error("limpeza room_members: " + cleanMembers.message);
  const { error: cleanRooms } = await admin
    .from("rooms")
    .delete()
    .in("id", [KARAOK, BAR2FO]);
  if (cleanRooms) throw new Error("limpeza rooms: " + cleanRooms.message);

  const { error: roomsErr } = await admin.from("rooms").insert([
    {
      id: KARAOK,
      code: "KARAOK",
      host_id: dono,
      entry_mode: "open",
      queue_approval_mode: "manual",
      require_song_confirmation: true,
      status: "active",
    },
    {
      id: BAR2FO,
      code: "BAR2FO",
      host_id: dono,
      entry_mode: "approval",
      queue_approval_mode: "auto",
      require_song_confirmation: false,
      status: "active",
    },
  ]);
  if (roomsErr) throw new Error("rooms: " + roomsErr.message);
  console.log("salas criadas: KARAOK (open/manual/confirm), BAR2FO (approval/auto)");

  const { error: membersErr } = await admin.from("room_members").insert([
    { room_id: KARAOK, user_id: ana, status: "approved" },
    { room_id: KARAOK, user_id: bruno, status: "approved" },
    { room_id: BAR2FO, user_id: ana, status: "pending" },
  ]);
  if (membersErr) throw new Error("room_members: " + membersErr.message);
  console.log("membros criados: ana/bruno aprovados em KARAOK; ana pending em BAR2FO");

  const { error: queueErr } = await admin.from("queue_items").insert([
    {
      room_id: KARAOK,
      added_by_user_id: ana,
      youtube_video_id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up (cover karaokê)",
      duration_seconds: 212,
      status: "approved",
    },
    {
      room_id: KARAOK,
      added_by_user_id: bruno,
      youtube_video_id: "9bZkp7q19f0",
      title: "Como Fazer Melhor (karaokê)",
      duration_seconds: 240,
      status: "pending",
    },
  ]);
  if (queueErr) throw new Error("queue_items: " + queueErr.message);
  console.log("fila criada na KARAOK: 2 itens (approved + pending)");

  console.log(
    "\nSeed concluído. Login dev: dono@exemplo.com | ana@exemplo.com | bruno@exemplo.com (senha123)"
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
