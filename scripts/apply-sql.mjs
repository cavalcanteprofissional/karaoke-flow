/**
 * Aplica um arquivo de migração SQL no banco remoto via Management API
 * (POST /v1/projects/{ref}/database/query — Status 201 `[]` em DDL).
 *
 * Uso: npm run db:apply -- supabase/migrations/<arquivo>.sql
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

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Informe o caminho do arquivo SQL.");
  process.exit(1);
}
const filePath = path.join(process.cwd(), fileArg);
if (!fs.existsSync(filePath)) {
  console.error(`Arquivo não encontrado: ${filePath}`);
  process.exit(1);
}
const sql = fs.readFileSync(filePath, "utf8");

console.log(`Aplicando ${fileArg} em ${ref}...`);
const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
if (res.ok) {
  console.log(`OK (${res.status})`);
  if (text && text !== "[]") console.log(text.slice(0, 2000));
} else {
  console.error(`FALHA (${res.status}):`);
  console.error(text);
  process.exit(1);
}
