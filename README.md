# 🎤 Karaokê Watch Party

Aplicação **mobile-first** para karaokê ao vivo em bares e restaurantes: o público adiciona músicas na fila **pelo próprio celular** (escaneando o QR da mesa) e a playlist toca numa tela compartilhada (TV/projetor), controlada pelo dono da casa pelo celular — sem tocar no dispositivo da TV.

> **Estado atual (2026-09-23):** Fase 4 (**busca YouTube + fila end-to-end**) entregue e endurecida — busca com cache/rate-limit/cadeia de credenciais (chave do bar → OAuth do host → OAuth do app → dev, OAuth via `Authorization: Bearer`), adicionar à fila com gate de presença física (dono sempre auto-aprovado), OAuth por-host conectado/revogável na UI, lista da fila em tempo real, **encerrar sala** (só o dono: cancela a fila e expulsa todos), **152 testes** (inclui MSW) verdes. Próxima: Fase 5 (realtime completo, aprovação/reorder da fila e modal de confirmação). Detalhes no [`TODO.md`](./TODO.md) e no [`CHANGELOG.md`](./CHANGELOG.md) (versão atual `0.1.0`).

## Índice

- [Visão geral](#-visão-geral)
- [Funcionalidades](#-funcionalidades)
- [Stack](#-stack)
- [Arquitetura](#-arquitetura)
- [Começando](#-começando)
- [Login e acesso](#-login-e-acesso)
- [Testes](#-testes)
- [Roadmap](#-roadmap)
- [Documentação](#-documentação)
- [Changelog e versão](#-changelog-e-versão)
- [Licença](#-licença)

## 🚀 Visão geral

O karaokê de bar hoje é papel, disputa de voz e fila no olho. O objetivo é digitalizar a noite inteira:

- quem canta **escolhe a mesa**, escaneia o QR e pede música sem instalar nada;
- o host (dono da casa) **cria o bar** — com QR próprio e QR por mesa — e controla a fila, as aprovações e o playback;
- a **tela da casa** (modo quiosque) mostra a fila e o vídeo em tempo real, legível à distância;
- respeito à privacidade desde o dia 1 (**LGPD/GDPR**: consentimento antes de qualquer coleta).

## ✨ Funcionalidades

**Já implementadas (MVP):**

- **Acesso anônimo** — qualquer pessoa entra e pede música **sem criar conta**; criar bar exige login real.
- **Domínio bar → mesas → karaokê** — o host é 1 bar com `N` mesas (etiquetas); cada bar nasce com **1 karaokê** (fila + player próprios); "adicionar salas" fica desabilitado (multi-sala é futuro).
- **QR por bar e por mesa** — `?bar=ZEHBAR` e `?bar=ZEHBAR&mesa=3` para entrar **em 1 toque** com a mesa já selecionada; QR legado de sala (`?code=...`) continua funcionando.
- **Fluxo de entrada com preview** — digite o código ou escaneie → preview do bar (dono, modo de entrada, mesas) → escolha da mesa → `join_room`. Modo `open` entra direto; modo `approval` fica pendente até o host aprovar (Realtime).
- **Dashboard** — "Meu bar" (código + mesas + badge de karaokê) para o host e "Bares que frequento" para participantes, com contador de entradas pendentes.
- **Página do karaokê** — contexto "Bar · Mesa N"; o host vê o QR do bar e a grade de QRs das mesas (exportáveis em PNG).
- **Login ampliado** — OAuth GitHub (ativo), Google (configuração pendente), Spotify/Discord/Facebook/X prontos na camada; dev login e-mail/senha fora de produção.
- **Busca no YouTube com cota do dono** — cadeia chave do bar → OAuth da conta Google do host (cota do projeto dele; **Bearer** no backend) → OAuth do app → chave dev; cache compartilhado, rate limit e gate de presença física.
- **OAuth por-host gerenciável** — o host conecta a conta Google pelo `RoomSettings` e vê **"conectado à conta Google · desde …"** com botão **Remover conexão** (revoga o token na Google e apaga a linha).
- **Fila com dono sempre aprovado** — música pedida pelo **dono** da sala entra direto (mesmo em fila manual); participantes seguem o modo da sala.
- **Encerrar sala (só o dono)** — RPC atômica: fecha a sala, **cancela/interrompe a fila** (estado `cancelled`) e **expulsa todos** os participantes; quem era membro vê "sala encerrada".

**Em construção / a seguir:** fila completa — realtime, aprovação/modal de confirmação/reorder (Fase 5) e player kiosk controlado pelo celular (Fases 6 e 7). A **busca no YouTube** (cache compartilhado, rate limit, cadeia de credenciais, adicionar à fila com gate de presença) **já está entregue** (Fase 4). Ver [Roadmap](#-roadmap).

## 🧱 Stack

| Camada        | Tecnologia                                                                                            |
| ------------- | ----------------------------------------------------------------------------------------------------- |
| Front/Back    | **Next.js 16** (App Router, TypeScript), Tailwind CSS + **shadcn/ui**, Zustand, react-hook-form + zod |
| Banco/Backend | **Supabase** (Postgres + Auth + Realtime + RLS) — free tier                                           |
| Vídeo         | **YouTube Data API v3** (busca) + **YouTube IFrame Player API** (playback)                            |
| QR            | `qrcode` (geração PNG) + `@zxing/browser` (leitura por câmera)                                        |
| Testes        | Vitest + React Testing Library + jsdom + **MSW** (Playwright e2e vem na Fase 6)                       |

## 🏗️ Arquitetura

```mermaid
flowchart LR
    subgraph Celular
        Host["Controller do host (celular)<br/>cria bar · aprova · controla playback"]
        Player2["Participante (celular)<br/>QR/mesa · pede música"]
    end
    subgraph Casa
        Kiosk["Player kiosk (TV/projetor)<br/>/player/[code] · sem login"]
    end
    subgraph Backend
        SB["Supabase<br/>Postgres + RLS + Realtime + Auth"]
    end
    Host <--> SB
    Player2 <--> SB
    Kiosk <--> SB
```

- **Controller** — app web no celular do host/participante: busca, fila, aprovações e controle de playback.
- **Player device** — rota pública `/player/[codigoDoKaraoke]` para navegador em modo quiosque na TV; sem overlays sobre o player do YouTube (TOS).
- **Backend de verdade no banco** — `position` da fila por advisory lock, status inicial derivado do modo da sala (sem auto-aprovação por INSERT), **multi-tenancy** (`room_id`/`bar_id` em toda tabela) e **RLS** validando ações de host e o isolamento entre salas; preview, entrada e criação de bar via RPCs `security definer`.

### Estrutura de pastas

```
src/
├─ app/            # rotas (App Router): /, /login, /entrar, /dashboard, /salas/[codigo]
├─ components/     # UI (bares, rooms, auth, shared)
├─ lib/            # server actions, helpers Supabase/SSR, domínio (bars·rooms), i18n
├─ stores/         # estado client (auth — Zustand)
├─ types/          # tipos de domínio (room, bar)
└─ test/           # setup do Vitest
supabase/
└─ migrations/     # SQL versionado (Fase 1 → 3.5)
scripts/           # seed, apply-sql, enable-anonymous-signins, oauth
docs/flows/        # fluxos do sistema, do usuário e banco de dados (Mermaid)
```

## ▶️ Começando

Pré-requisitos: **Node 24+**, conta Supabase (projeto Cloud ou `supabase start` local).

1. Clone e instale as dependências:
   ```bash
   npm install
   ```
2. Configure o ambiente: copie `.env.example` para `.env.local` e preencha as chaves do Supabase (e as credenciais do Google Cloud, se for usar a busca):
   - `cp .env.example .env.local` (Windows: `copy .env.example .env.local`)
   - **Nunca commite o `.env.local`** (está no `.gitignore`).
3. (Opcional) Crie os dados de desenvolvimento:
   ```bash
   npm run seed        # 4 usuários + Bar 1 (ZEHBAR, 12 mesas) + Bar 2 (BARSEG, 6 mesas)
   ```
4. Rode:
   ```bash
   npm run dev
   ```

**Scripts disponíveis:**

| Script                             | O que faz                                                                  |
| ---------------------------------- | -------------------------------------------------------------------------- |
| `npm run dev`                      | dev server (Next 16)                                                       |
| `npm run build`                    | build de produção                                                          |
| `npm run lint`                     | ESLint                                                                     |
| `npm run typecheck`                | `tsc --noEmit`                                                             |
| `npm test`                         | Vitest (unit)                                                              |
| `npm run seed`                     | seed de dev no Supabase Cloud                                              |
| `node scripts/apply-sql.mjs <sql>` | aplica migration manualmente (padrão do time; veja `README` do `scripts/`) |

## 🔑 Login e acesso

- **Acesso anônimo:** botão "Continuar sem login" no `/login` → pode entrar no bar e pedir música; **não** pode criar bar (login real). Habilitação: Supabase Auth → _Allow anonymous sign-ins_ (espelhado em `supabase/config.toml`; o script `scripts/enable-anonymous-signins.mjs` configura via Management API).
- **Provedores OAuth** — configurados no projeto Supabase (credenciais no dashboard, não no `.env`); a lista exibida vive em `src/lib/auth/providers.ts`:

| Provedor                   | Status atual                                        |
| -------------------------- | --------------------------------------------------- |
| **GitHub**                 | ✅ Ativo                                            |
| **Google**                 | ⚙️ Configurar credenciais                           |
| **Spotify**                | 🔒 Desabilitado — Web API exige Spotify Premium     |
| **Discord / Facebook / X** | 🔒 Em breve (sem credenciais; app review para FB/X) |

Enquanto não há provedor, use a seção **"Acesso de desenvolvimento"** (somente dev) com os usuários do seed: `dono@exemplo.com`, `ana@exemplo.com`, `bruno@exemplo.com`, `betania@exemplo.com` — senha `senha123`.

> **Credenciais de integração (dev):** a chave de busca `YOUTUBE_API_KEY` é **só de dev e não vai para produção** — ver `karaoke-watch-party-spec.md` §12/§13 e a tabela completa no fim deste arquivo.

## 🧪 Testes

Estratégia, boas práticas e checklist funcional por fase em [`TESTING.md`](./TESTING.md).

- **Unitário / Integração:** Vitest + React Testing Library + jsdom (hoje **152 testes** verdes — inclui `src/lib/bars/qr.test.ts`, `src/lib/youtube/*`, a fila com a matriz de presença, o roundtrip OAuth authorize→callback e os Bearer de OAuth na rota de busca).
- **Mock de rede:** **MSW** instalado (Fase 4) — mocka a YouTube Data API nas provas da rota `/api/youtube/search`; serviços externos nunca são chamados em teste.
- **E2E:** Playwright no pós-MVP-stable (player kiosk com YouTube IFrame Player API mockada).
- **Banco/RLS:** validado via smoke e e2e, não em unit.

> ⚠️ O pool do Vitest usa `threads` (não `forks`) por causa do caminho do workspace (`D:\BACK UP\...`) — ver CHANGELOG.

## 🗺️ Roadmap

Plano detalhado por fases (com checklist) no [`TODO.md`](./TODO.md). Linha do tempo atual:

| Fase                                                                                                                               | Status                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fase 0 — Fundação / 1 — Banco+RLS / 2 — Auth / 3 — Salas                                                                           | ✅ Concluídas                                                                                                                                               |
| **3.5 — Bar/mesas/karaokês + acesso anônimo**                                                                                      | ✅ **Concluída (2026-09-23)**                                                                                                                               |
| **Fase 4 — Busca YouTube + fila end-to-end**                                                                                       | ✅ **Concluída (2026-09-23)**                                                                                                                               |
| Fase 5 — Fila: realtime, aprovação, confirmação, trocar música                                                                     | ⏳ **Próxima**                                                                                                                                              |
| Fase 6 — Player kiosk                                                                                                              | ⏳ Planejada                                                                                                                                                |
| Fase 7 — Controle do host pelo celular                                                                                             | ⏳ Planejada                                                                                                                                                |
| Fase 8 — Não-funcionais, segurança, LGPD                                                                                           | ⏳ Planejada                                                                                                                                                |
| **Fases 9–15 — Entrada fora do raio, tela da mesa, perfil de karaokê, tempo/teste grátis, recompensas, pagamento + pedido no bar** | 📋 **Planejadas (registro 2026-09-25, sem implementação)** — detalhamento em [`docs/produto/roadmap-experiencia.md`](./docs/produto/roadmap-experiencia.md) |

Pendência aberta conhecida: **diagramas Mermaid de `docs/flows/*`** já foram sanitizados e validados em mermaid v10/v11 — falta confirmar a renderização no seu renderizador/preview. Registrado no `TODO.md`.

## 📚 Documentação

- [`karaoke-watch-party-spec.md`](./karaoke-watch-party-spec.md) — especificação técnica (arquitetura, segurança, UX, entidades, roadmap pós-MVP).
- [`MANIFEST.md`](./MANIFEST.md) — manifesto do produto: visão, princípios e a camada social futura (inclui a seção de Belas Artes construída a partir do histórico musical real).
- [`questionario-donos-estabelecimento.md`](./questionario-donos-estabelecimento.md) — questionário de validação (18 perguntas) com donos de estabelecimentos.
- [`karaoke-pesquisa-academica.md`](./karaoke-pesquisa-academica.md) — pesquisa acadêmica e de mercado que fundamenta o produto.
- [`TODO.md`](./TODO.md) — plano de implementação por fase (**estado recente**: Fase 3.5 e Fase 4 concluídas; Fase 5 em seguida).
- [`CHANGELOG.md`](./CHANGELOG.md) — histórico por release (**versão atual `0.1.0`**).
- [`TESTING.md`](./TESTING.md) — estratégia de testes, checklist funcional e DoD.

### Fluxos do MVP (`docs/flows`)

Diagramas em **Mermaid** (rendezam no GitHub, VS Code + "Mermaid Preview", ou <https://mermaid.live>):

| Arquivo                                                                | Conteúdo                                                                                                                                                      |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/flows/fluxos-do-sistema.md`](./docs/flows/fluxos-do-sistema.md) | Fluxos técnicos end-to-end: autenticação/sessão (incl. anônimo), ciclo de vida do bar/karaokê, fila, player e a proposta de trocar música mantendo a posição. |
| [`docs/flows/fluxos-do-usuario.md`](./docs/flows/fluxos-do-usuario.md) | Jornadas por persona: host, participante (entrada com mesa) e tela kiosk.                                                                                     |
| [`docs/flows/banco-de-dados.md`](./docs/flows/banco-de-dados.md)       | Modelo relacional (ERD), matriz de RLS, máquina de estados da fila e regras de `position`/status.                                                             |

_Nota de manutenção:_ todo diagrama reflete o **código real** (migrations, `src/proxy.ts`, helpers SSR) — sem virgula/parêntese no texto de arestas (limitação dos parsers mais antigos).

### Produto (roadmap)

- [`docs/produto/roadmap-experiencia.md`](./docs/produto/roadmap-experiencia.md) — **planejamento (sem código)** das Fases 9–15: entrada de gente fora do raio de presença sinalizada só para o dono, permissão "fora do raio vê mas não pede música", tela da mesa (colegas + músicas da mesa), perfil de karaokê com check de som/microfone, tempo de música com teste grátis/alarme/countdown de 30 s, recompensas (dias consecutivos + músicas por bar) e pagamento/pedido de comida via mesa contra o sistema que o bar já usa. Inclui **12 decisões em aberto (D1–D12)**.

### Ciência de dados (roadmap)

- [`docs/ciencia-de-dados/segmentacao-sentimental.md`](./docs/ciencia-de-dados/segmentacao-sentimental.md) — camada PLN (embeddings SBERT + léxicos/ML, circumplexo valence-arousal, HDBSCAN) para classificar o ouvinte a partir de letras e metadados acústicos; nasce neste repo, vira o repo independente `karaoke-flow-data`.

## 📝 Changelog e versão

- Seguimos [Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`). **Versão atual: `0.1.0`** (em desenvolvimento, sem release publicado).
- Todo o histórico está em [`CHANGELOG.md`](./CHANGELOG.md); cada release recebe tag `v<versão>`.

## 🎤 Licença

MIT — veja o campo `license` em `package.json`. (Produto pessoal em desenvolvimento; o manifesto de visão está no [`MANIFEST.md`](./MANIFEST.md).)

---

### Apêndice — credenciais de integração (dev, Google Cloud)

Projeto Google Cloud `karaoke-flow-509317` (YouTube Data API v3):

| Uso                                       | Tipo            | Credencial                                                                                                                                                  | Onde fica                                                                                |
| ----------------------------------------- | --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Busca de músicas (default)                | API key         | `YOUTUBE_API_KEY` (só dev — **não vai para produção**)                                                                                                      | `.env.local` (não versionado)                                                            |
| Ferramentas dev / manifesto pessoal       | **Desktop app** | Client ID `555657479128-nou62soqjjneto0as5fcivck7ijlkeg9…` (público), OAuth YouTube `readonly`, redirect loopback `http://localhost`                        | `.env.local` (legado) + JSON gitignored                                                  |
| OAuth por-host (Fase 4)                   | **Web app**     | Client ID `555657479128-1qdqio5fd41o4tqbgs6t5o7l4qpbcb55…` — redirects `http://localhost:3000/auth/youtube/callback` e `http://localhost:8891/`             | `.env.local` (`YOUTUBE_OAUTH_CLIENT_ID/SECRET`) + `credentials/oauth/oauth-dev-web.json` |
| OAuth do app (fallback de busca — Fase 4) | conta dev       | `YOUTUBE_APP_REFRESH_TOKEN` **coletado** 2026-09-23 com `node scripts/youtube-app-oauth.mjs` (expira em 7 d enquanto o consent screen estiver em _Testing_) | `.env.local`                                                                             |

O Client ID é **público** e pode aparecer aqui; o **Client Secret nunca** (só `.env.local` e `credentials/`, ignorados pelo git).
