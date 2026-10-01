/**
 * Sincroniza as credenciais dos usuários de seed (por ID fixo) com as vars
 * SEED_* do .env.local, SEM apagar/recriar domínio — `npm run seed` resetaria
 * salas/fila, este script só toca em auth.users.
 *
 * Por que existe (Fase 8b·ter): o dono quer as MESMAS contas de dev funcionando
 * no Cloud com credenciais PESSOAIS (e-mails/senha vem do .env.local, nunca do
 * repo). O seed não reaplica senha em usuário existente de propósito; este
 * script é o caminho replayável para renomear/rotacionar as contas já vivas.
 *
 * - Usuários resolvidos pelo ID fixo (mesma regra do seed); dados de domínio
 *   (bars/rooms/members/queue) não são tocados, então as salas continuam dele.
 * - Admin API ignora a confirmação de e-mail (o trigger handle_new_user não
 *   roda de novo — o profile já existe).
 * - Exceção quando SEED_HOST_USER_ID está definido: o slot do dono é uma conta
 *   OAuth (ex.: GitHub) e NÃO é tocado por aqui. `updateUserById` numa conta
 *   só-OAuth falha com `Database error loading user` — a senha é definida pelo
 *   próprio usuário no menu ("Definir senha", `auth.updateUser` client-side).
 * - NUNCA imprime os valores das credenciais.
 *
 * Uso: node scripts/sync-seed-users.mjs
 * Requer NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY em .env.local.
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

/** Host canônico opcional — mesma var do `seed.mjs`. */
const HOST_USER_ID = g("SEED_HOST_USER_ID") || undefined;

const USERS = [
  {
    id: HOST_USER_ID ?? "00000000-0000-0000-0000-000000000001",
    label: "dono",
    email: g("SEED_HOST_EMAIL") ?? "dono@exemplo.com",
    // Conta só-OAuth: não aplicar e-mail/senha por aqui (quebraria o login).
    readOnly: Boolean(HOST_USER_ID),
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    label: "ana",
    email: g("SEED_USER_EMAIL") ?? "ana@exemplo.com",
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    label: "bruno",
    email: g("SEED_USER2_EMAIL") ?? "bruno@exemplo.com",
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    label: "betania",
    email: g("SEED_HOST2_EMAIL") ?? "betania@exemplo.com",
  },
];
const PASSWORD = g("SEED_PASSWORD") ?? "senha123";

async function main() {
  const admin = createClient(url, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  for (const u of USERS) {
    const { data: found, error: findErr } = await admin.auth.admin.getUserById(u.id);
    if (findErr || !found?.user) {
      console.error(`pulando ${u.label}: não existe (${findErr?.message ?? "ausente"})`);
      continue;
    }
    const current = found.user.email;
    const emailChanged = current.toLowerCase() !== u.email.toLowerCase();

    // Host canônico (conta OAuth): só reporta. Tentar aplicar e-mail/senha por
    // admin API aqui é o que quebra a conta (`Database error loading user`).
    if (u.readOnly) {
      console.log(`ok ${u.label}: conta canônica OAuth, não tocada`);
      console.log(`   e-mail real: '${current}' (e-mail/senha definidos no menu)`);
      if (emailChanged) {
        console.warn(
          `   ATENÇÃO: SEED_HOST_EMAIL está '${u.email}' mas a conta usa '${current}'.` +
            ` Ajuste SEED_HOST_EMAIL para o e-mail real (local e Vercel) ou o login por senha falha.`
        );
      }
      continue;
    }

    const patch = {
      email: u.email,
      email_confirm: true,
      password: PASSWORD,
    };
    const fullName = found.user.user_metadata?.full_name;
    if (fullName) {
      patch.user_metadata = { ...(found.user.user_metadata ?? {}), full_name: fullName };
    }
    const { error } = await admin.auth.admin.updateUserById(u.id, patch);
    if (error) {
      console.error(`FALHA em ${u.label}: ${error.message}`);
      continue;
    }
    console.log(
      `ok ${u.label}: e-mail ${emailChanged ? "RENOMEADO" : "inalterado"}, senha atualizada`
    );
  }
}

main().catch((e) => {
  console.error("ERRO:", e.message);
  process.exit(1);
});
