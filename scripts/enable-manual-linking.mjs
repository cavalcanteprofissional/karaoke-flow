/**
 * Habilita o manual linking de identidades no Supabase (Auth) via Management API.
 * (Fase 8b·ter — botão "Vincular GitHub": mesma conta por senha e por OAuth.)
 *
 * O `supabase.auth.linkIdentity` é recusado enquanto o projeto tiver
 * `security.manual_linking_enabled = false`. Ligar aqui é o requisito do
 * cruzamento (read README "Login e acesso" / TESTING §3.1).
 *
 * Alerta: ligar manual linking amplia a superfície de ataque (advisory da
 * Supabase sobre SSO/e-mail). Para este projeto de dev que roda com senhas
 * privadas e contas de teste é aceitável; o TODO 8b·ter registra o plano de
 * reverter (ou migrar para staging) antes de uso real.
 *
 * Uso: node scripts/enable-manual-linking.mjs
 * Requer SUPABASE_ACCESS_TOKEN e NEXT_PUBLIC_SUPABASE_URL em .env.local.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

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
const accessToken = g("SUPABASE_ACCESS_TOKEN");
for (const k of [url, accessToken]) {
  if (!k) {
    console.error(
      "Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_ACCESS_TOKEN no .env.local"
    );
    process.exit(1);
  }
}

const ref =
  url.match(/https:\/\/(.+)\.supabase\.co/)?.[1] ?? url.split("//")[1].split(".")[0];

const getRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!getRes.ok) {
  console.error(`FALHA ao ler config (${getRes.status}):\n${await getRes.text()}`);
  process.exit(1);
}
const config = await getRes.json();
const manual = config.security_manual_linking_enabled;
console.log("Estado atual: security_manual_linking_enabled =", String(manual));

if (manual === true) {
  console.log("Manual linking já habilitado. Nada a fazer.");
} else {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ security_manual_linking_enabled: true }),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`OK (${res.status}): manual linking habilitado`);
    if (text && text !== "") console.log(text.slice(0, 2000));
  } else {
    console.error(`FALHA (${res.status}):\n${text}`);
    process.exit(1);
  }
}
