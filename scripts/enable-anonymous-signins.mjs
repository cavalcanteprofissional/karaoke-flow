/**
 * Habilita anonymous sign-ins no Supabase (Auth) via Management API.
 * (Fase 3.5 — sessão anônima: participante pode entrar sem conta.)
 *
 * Antes: AuthConfig.external.anonymous = { enabled: false }.
 * Uso: node scripts/enable-anonymous-signins.mjs
 * Requer SUPABASE_ACCESS_TOKEN e NEXT_PUBLIC_SUPABASE_URL em .env.local.
 * (Não escreve em auth.users; apenas a config do projeto.)
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

// Primeiro lê a config atual para confirmar o estado de anonymous.
const getRes = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  headers: { Authorization: `Bearer ${accessToken}` },
});
if (!getRes.ok) {
  console.error(`FALHA ao ler config (${getRes.status}):\n${await getRes.text()}`);
  process.exit(1);
}
const config = await getRes.json();
const anonymous = config.external?.anonymous;
console.log("Estado atual: external.anonymous =", JSON.stringify(anonymous));

if (anonymous?.enabled) {
  console.log("Anonymous sign-ins já habilitado. Nada a fazer.");
} else {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ external: { anonymous: { enabled: true } } }),
  });
  const text = await res.text();
  if (res.ok) {
    console.log(`OK (${res.status}): anonymous habilitado`);
    if (text && text !== "") console.log(text.slice(0, 2000));
  } else {
    console.error(`FALHA (${res.status}):\n${text}`);
    process.exit(1);
  }
}