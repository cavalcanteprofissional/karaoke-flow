/**
 * Obtém o YOUTUBE_APP_REFRESH_TOKEN (conta do desenvolvedor) via fluxo OAuth
 * loopback. O script abre o navegador, captura o code no redirect URI local,
 * troca por tokens e imprime o refresh_token para colar no .env.local.
 *
 * Uso: node scripts/youtube-app-oauth.mjs
 * Requer YOUTUBE_OAUTH_CLIENT_ID/SECRET em .env.local e um OAuth client do tipo
 * Web app com redirect "http://localhost:8891/".
 */
import { exec } from "node:child_process";
import http from "node:http";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "..", ".env.local");
const env = readFileSync(envPath, "utf8");
const g = (k) => {
  const m = env.match(new RegExp("^" + k + "=(.*)$", "m"));
  return m ? m[1].trim() : undefined;
};

const clientId = g("YOUTUBE_OAUTH_CLIENT_ID");
const clientSecret = g("YOUTUBE_OAUTH_CLIENT_SECRET");
if (!clientId || !clientSecret) {
  console.error("Faltam YOUTUBE_OAUTH_CLIENT_ID / YOUTUBE_OAUTH_CLIENT_SECRET no .env.local");
  process.exit(1);
}

const PORT = Number(process.env.YT_OAUTH_PORT ?? 8891);
const REDIRECT_URI = `http://localhost:${PORT}/`;
const SCOPE = "https://www.googleapis.com/auth/youtube.readonly";
const NONCE = randomBytes(16).toString("hex");

const authorizeUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authorizeUrl.searchParams.set("client_id", clientId);
authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authorizeUrl.searchParams.set("response_type", "code");
authorizeUrl.searchParams.set("scope", SCOPE);
authorizeUrl.searchParams.set("access_type", "offline");
authorizeUrl.searchParams.set("prompt", "consent");
authorizeUrl.searchParams.set("state", NONCE);

const opener =
  process.platform === "win32"
    ? `start "" "${authorizeUrl.toString()}"`
    : process.platform === "darwin"
      ? `open "${authorizeUrl.toString()}"`
      : `xdg-open "${authorizeUrl.toString()}"`;

console.log("Abra no navegador (ou clique no link abaixo):");
console.log(authorizeUrl.toString());
exec(opener);

const server = http.createServer((req, res) => {
  const reqUrl = new URL(req.url, REDIRECT_URI);
  const code = reqUrl.searchParams.get("code");
  const error = reqUrl.searchParams.get("error");
  const state = reqUrl.searchParams.get("state");

  if (error) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end(`<h1>Autorização recusada</h1><p>${error}</p>`);
    server.close();
    return;
  }
  if (!code || state !== NONCE) {
    res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
    res.end("<h1>OAuth inválido (code/state)</h1><p>Feche e rode de novo.</p>");
    server.close();
    return;
  }

  exchange(code)
    .then((result) => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      if (!result.ok) {
        res.end(`<h1>Falha ao trocar o code</h1><p>${result.error}</p>`);
        console.error("Falha:", result.error);
      } else {
        res.end("<h1>Token obtido!</h1><p>Pode fechar esta aba.</p>");
        console.log("\n=== YOUTUBE_APP_REFRESH_TOKEN ===");
        console.log(result.refreshToken);
        console.log("==================================\n");
        console.log(
          "Cole o valor acima em .env.local como YOUTUBE_APP_REFRESH_TOKEN="
        );
        console.log("(o app continua sem usar o token até você adicioná-lo)")
      }
    })
    .finally(() => server.close());
});

async function exchange(code) {
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
    redirect_uri: REDIRECT_URI,
    grant_type: "authorization_code",
  });
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { ok: false, error: data?.error_description ?? data?.error ?? `HTTP ${response.status}` };
  }
  if (!data.refresh_token) {
    return {
      ok: false,
      error: "Sem refresh_token na resposta. Use uma conta que nunca autorizou ou acesso_type=offline.",
    };
  }
  return { ok: true, refreshToken: data.refresh_token };
}

server.listen(PORT, () => {
  console.log(`Aguardando o retorno OAuth em ${REDIRECT_URI} (ctrl+c para cancelar)`);
});