/**
 * `npm run scan:secrets` — falha se um arquivo versionado tiver algo que
 * **pareça credencial**.
 *
 * Por que existe: o link da TV (`/player/<código>?token=…`) é uma credencial —
 * quem tem o link lê o estado da sala e a fila dela — e o repositório é
 * **público**. Em 27/09/2026 o token de player estava escrito à mão em três
 * arquivos de teste. Era um valor falso (conferido no banco: nenhuma sala tem
 * ele), mas a forma é idêntica à de um link real colado num bug report, num
 * chat ou numa captura de tela. Um scanner é mais barato que lembrar disso.
 *
 * Regras (falha com código 1 e a lista `arquivo:linha`):
 *  1. token de player: literal UUID fora dos arquivos de fixture permitidos;
 *  2. link de TV montado: `?token=<uuid>` em qualquer arquivo;
 *  3. formato de chave conhecida: `sbp_…` (Supabase), `AIza…` (Google API),
 *     `GOCSPX-…`/`GOCSPX-` (client secret do Google), `sk-…` (OpenAI),
 *     `-----BEGIN … PRIVATE KEY-----`, e linhas de `*_KEY=`/`*_SECRET=`/
 *     `*_TOKEN=`/`*_PASSWORD=` com valor à direita.
 *
 * Arquivos de fixture permitidos (UUID de teste é a exceção, não a regra):
 *  - `src/test/fake-player-token.ts` (fonte única dos tokens de teste),
 *  - `*.test.ts` / `*.test.tsx` (id de fila/sala/membro de teste),
 *  - `scripts/seed.mjs` e `scripts/smoke-*.sql` (UUIDs determinísticos de dev),
 *  - `.env.example` (só nomes de variável, sem valor).
 *
 * Uso: npm run scan:secrets          (verifica os arquivos versionados)
 *      npm run scan:secrets -- --staged   (só o que entraria no commit)
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const onlyStaged = process.argv.includes("--staged");

const FIXTURE_ALLOWLIST = [
  /^[\\/]?src[\\/]test[\\/]fake-player-token\.ts$/i,
  /\.(test|spec)\.[cm]?tsx?$/i,
  /^[\\/]?scripts[\\/]seed\.mjs$/i,
  /^[\\/]?scripts[\\/]smoke-[\w-]+\.sql$/i,
  /^[\\/]?\.(env\.example|env\.default\.example)$/i,
];
const isFixture = (file) => FIXTURE_ALLOWLIST.some((re) => re.test(file));

const UUID =
  "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}";

const RULES = [
  {
    id: "token-de-player",
    // UUID literal em código versionado. Fora de fixture = provável credencial.
    re: new RegExp(`["'\`]${UUID}["'\`]`),
    skipFixtures: true,
    why: "UUID literal fora de arquivo de teste — se for token da TV, é credencial",
  },
  {
    id: "link-de-tv",
    // Só o **valor** colado interessa: nome de parâmetro (`p_token`) é código.
    re: new RegExp(
      `\\?token=${UUID}|\\btoken\\s*[:=]\\s*["'\`]?${UUID}|\\bp_token\\s*[:=]\\s*${UUID}`,
      "i"
    ),
    skipFixtures: false,
    why: "link/montagem de token da TV com valor literal",
  },
  {
    id: "chave-conhecida",
    re: /\bsbp_[A-Za-z0-9]{16,}|\bAIza[A-Za-z0-9_-]{20,}|\bGOCSPX-[A-Za-z0-9_-]{10,}|-----BEGIN[A-Z ]*PRIVATE KEY-----/,
    skipFixtures: false,
    why: "formato de chave/certificado",
  },
  {
    id: "variavel-de-segredo-com-valor",
    re: /^\s*[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD|PASSWD)[A-Z0-9_]*\s*=\s*\S{8,}/,
    skipFixtures: false,
    why: "variável de segredo com valor embutido",
  },
];

const SCAN_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
  ".json",
  ".md",
  ".sql",
  ".yml",
  ".yaml",
  ".txt",
  ".sh",
]);

function trackedFiles() {
  const out = onlyStaged
    ? execFileSync("git", ["diff", "--cached", "--name-only", "--diff-filter=ACMR"], {
        encoding: "utf8",
      })
    : execFileSync("git", ["ls-files"], { encoding: "utf8" });
  return out
    .split("\n")
    .map((f) => f.trim())
    .filter(Boolean);
}

const findings = [];
let scanned = 0;

for (const rel of trackedFiles()) {
  if (rel.includes("node_modules") || rel.includes(".next") || rel.includes("public/"))
    continue;
  if (!SCAN_EXT.has(path.extname(rel).toLowerCase())) continue;
  const abs = path.join(root, rel);
  if (!fs.existsSync(abs)) continue;
  const fixture = isFixture(rel);
  const lines = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  scanned += 1;
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      if (rule.skipFixtures && fixture) continue;
      // docs descrevem o padrão do link de propósito: só o valor colado incomoda
      const pattern = new RegExp(rule.re.source, rule.re.flags.replace("g", ""));
      if (pattern.test(line)) {
        findings.push({
          rule: rule.id,
          why: rule.why,
          file: rel,
          line: i + 1,
          text: line.trim().slice(0, 110),
        });
      }
    }
  });
}

if (findings.length === 0) {
  console.log(
    `scan:secrets — OK (${scanned} arquivos verificados${onlyStaged ? ", staged" : ""}).`
  );
  process.exit(0);
}

console.error(`scan:secrets — ${findings.length} possível(is) segredo(s):\n`);
for (const f of findings) {
  console.error(`  ${f.file}:${f.line}  [${f.rule}] ${f.text}`);
  console.error(`      ↳ ${f.why}`);
}
console.error(
  [
    "",
    "O que fazer:",
    "  - token de player em teste → importe FAKE_PLAYER_TOKEN de src/test/fake-player-token.ts;",
    "  - link real da TV em qualquer lugar → remova, e rotacione com o botão",
    '    "gerar novo link" do host (rotate_player_token, host-only) e avise quem recebeu;',
    "  - chave real versionada por engano → rotacione no fornecedor e remova do histórico.",
    "",
  ].join("\n")
);
process.exit(1);
