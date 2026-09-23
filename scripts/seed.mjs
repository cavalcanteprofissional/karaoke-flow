/**
 * Seed determinístico de dev (TESTING.md §2.5).
 *
 * - Usuários são criados via Auth Admin API (service role) com IDs fixos —
 *   raw SQL em auth.users deixa o serviço Auth instável (validação OK: todos
 *   os fluxos de login funcionam após).
 * - O trigger handle_new_user cria os profiles automaticamente.
 * - Dados de domínio (bares/mesas/salas/membros/fila) são inseridos via
 *   service role, de forma idempotente (re-executável): este script faz reset
 *   COMPLETO do domínio (bares, mesas, rooms, membros, fila) antes de inserir.
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
  {
    id: "00000000-0000-0000-0000-000000000004",
    email: "betania@exemplo.com",
    name: "Dona Betânia (host)",
  },
];
const PASSWORD = "senha123";

// IDs fixos do domínio.
const BAR1 = "20000000-0000-0000-0000-000000000001"; // Karaokê do Zé
const BAR2 = "20000000-0000-0000-0000-000000000002"; // Bar da Esquina
const ROOM1 = "10000000-0000-0000-0000-000000000001"; // sala única do Bar1
const ROOM2 = "10000000-0000-0000-0000-000000000002"; // sala única do Bar2

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

async function resetDomain(admin) {
  // Reset completo do domínio (idempotente). Ordem respeita as FKs.
  // Cada tabela é apagada por completo usando a primeira coluna (id é o padrão,
  // mas room_members tem PK composta) + filtro universal nojento p/ PostgREST.
  const NEVER = "00000000-0000-0000-0000-000000000000";
  const plans = [
    ["queue_items", "id", "fila"],
    ["room_members", "user_id", "membros"],
    ["rooms", "id", "salas"],
    ["mesas", "id", "mesas"],
    ["bars", "id", "bares"],
  ];
  for (const [table, col, label] of plans) {
    const { error } = await admin.from(table).delete().neq(col, NEVER);
    if (error) throw new Error(`reset ${table}: ` + error.message);
    console.log(`reset: ${label} limpo`);
  }
}

async function main() {
  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const ids = await ensureUsers(admin);
  const [dono, ana, bruno, betania] = ids;

  await resetDomain(admin);

  // ---- Bares (perfil-personificação do host, 1:1) ----
  const { error: barsErr } = await admin.from("bars").insert([
    {
      id: BAR1,
      host_id: dono,
      code: "ZEHBAR",
      nome: "Karaokê do Zé",
      cidade: "São Paulo",
      endereco: "Rua das Flores, 123",
      quantidade_mesas: 12,
      latitude: -23.550_66,
      longitude: -46.633_38,
      raio_permitido_metros: 150,
    },
    {
      id: BAR2,
      host_id: betania,
      code: "BARSEG",
      nome: "Bar da Esquina",
      cidade: "São Paulo",
      endereco: "Av. Brasil, 456",
      quantidade_mesas: 6,
      raio_permitido_metros: 150,
    },
  ]);
  if (barsErr) throw new Error("bars: " + barsErr.message);
  console.log("bares criados: Karaokê do Zé (ZEHBAR, 12 mesas, dono), Bar da Esquina (BARSEG, 6 mesas, Betânia)");

  // ---- Mesas (etiquetas; rótulos opcionais) ----
  const mesas1 = Array.from({ length: 12 }, (_, i) => ({
    bar_id: BAR1,
    numero: i + 1,
    rotulo: `Mesa ${i + 1}`,
  }));
  const mesas2 = Array.from({ length: 6 }, (_, i) => ({
    bar_id: BAR2,
    numero: i + 1,
    rotulo: `Mesa ${i + 1}`,
  }));
  const { error: mesasErr } = await admin.from("mesas").insert([...mesas1, ...mesas2]);
  if (mesasErr) throw new Error("mesas: " + mesasErr.message);
  console.log("mesas criadas: 12 no Zé, 6 na Esquina");

  // ---- Salas (1 por bar — multi-sala desabilitado) ----
  const { error: roomsErr } = await admin.from("rooms").insert([
    {
      id: ROOM1,
      bar_id: BAR1,
      code: "KARAOK",
      host_id: dono,
      entry_mode: "open",
      queue_approval_mode: "manual",
      require_song_confirmation: true,
      status: "active",
    },
    {
      id: ROOM2,
      bar_id: BAR2,
      code: "BAR2FO",
      host_id: betania,
      entry_mode: "approval",
      queue_approval_mode: "auto",
      require_song_confirmation: false,
      status: "active",
    },
  ]);
  if (roomsErr) throw new Error("rooms: " + roomsErr.message);
  console.log("salas criadas: KARAOK (open/manual/confirm, bar ZEHBAR), BAR2FO (approval/auto, bar BARSEG)");

  // ---- Membros (participante obrigatoriamente registra a mesa) ----
  const { error: membersErr } = await admin.from("room_members").insert([
    { room_id: ROOM1, user_id: ana, status: "approved", mesa_numero: 3 },
    { room_id: ROOM1, user_id: bruno, status: "approved", mesa_numero: 7 },
    { room_id: ROOM2, user_id: ana, status: "pending", mesa_numero: 2 },
  ]);
  if (membersErr) throw new Error("room_members: " + membersErr.message);
  console.log("membros criados: ana (mesa 3)/bruno (mesa 7) aprovados em KARAOK; ana pending (mesa 2) em BAR2FO");

  // ---- Fila (só na sala do Karaokê do Zé) ----
  const { error: queueErr } = await admin.from("queue_items").insert([
    {
      room_id: ROOM1,
      added_by_user_id: ana,
      youtube_video_id: "dQw4w9WgXcQ",
      title: "Never Gonna Give You Up (cover karaokê)",
      duration_seconds: 212,
      status: "approved",
    },
    {
      room_id: ROOM1,
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
    "\nSeed concluído. Login dev: dono@exemplo.com | betania@exemplo.com | ana@exemplo.com | bruno@exemplo.com (senha123)"
  );
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});