# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

**Versão atual:** `0.1.0` (em desenvolvimento — `main` ainda não recebeu tag de release).

## [Unreleased]

### Adicionado

- **Fase 1 — Banco de dados + RLS (Supabase):**
  - Migrations versionadas com Supabase CLI em `supabase/migrations` (aplicadas via `supabase db push` no projeto cloud `kskoipyzqcacccepcqpc`).
  - Tabelas: `profiles`, `rooms`, `room_members`, `queue_items`, `song_cache` + triggers de `updated_at`.
  - Trigger `handle_new_user` cria `profile` automaticamente ao criar usuário no Auth.
  - `position` da fila computado no banco com advisory lock por sala (`next_queue_position`) — sem condição de corrida entre inserts simultâneos.
  - Status inicial da fila normalizado no banco (`queue_initial_status`): lê `queue_approval_mode` da sala — `auto` entra `approved`, `manual` entra `pending`; cliente não escolhe status (bloqueia auto-aprovação por INSERT direto).
  - RLS ativo desde o dia 1 em todas as tabelas: fila/sala legíveis apenas por host ou membro aprovado daquela sala (`is_host` / `is_approved_member`), host actions validadas no backend via policies, `song_cache` sem policies (só service role), multi-tenancy com `roomId` em toda tabela.
  - Funções auxiliares: `is_host`, `is_approved_member`, `generate_room_code` (6 chars, sem caracteres ambíguos), `join_room` (RPC de entrada: `open` → aprovado; `approval` → pending).
  - View `profiles_public` (id/nome/avatar) para exibir "quem pediu" sem expor e-mail.
  - Seed de dev determinístico via `npm run seed` (`scripts/seed.mjs`): cria 3 usuários via **Auth Admin API** com IDs fixos (trigger gera perfis) e insere salas/membros/fila idempotentemente. Login dev: `dono@exemplo.com`, `ana@exemplo.com`, `bruno@exemplo.com` (senha `senha123`).
  - Credenciais `.env.local` atualizadas: nova `SUPABASE_SERVICE_ROLE_KEY` correta (a anterior era uma cópia da anon), `SUPABASE_ACCESS_TOKEN` adicionado.
- **Fase 2 — Autenticação (Google + GitHub):**
  - Helpers SSR via `@supabase/ssr`: `src/lib/supabase/client.ts` (browser, cache em singleton) e `src/lib/supabase/server.ts` (server, com cookies async do Next 16).
  - `src/proxy.ts` (Next 16: `middleware` → `proxy`): refresh da sessão em toda request, bloco rota protegida sem usuário (`/dashboard`, `/salas`) redirecionando para `/login`, e redireciona `/login` para `/dashboard` quando já autenticado; `Cache-Control: private, no-store` nas respostas.
  - Página `/login` com botões OAuth (Google e GitHub) via `signInWithOAuth`, seção "Acesso de desenvolvimento" (e-mail/senha com usuários do seed, **somente em `NODE_ENV=development`**) e tratamento de erro via `toast`/query-string.
  - Callback `/auth/callback` fazendo `exchangeCodeForSession` e redirect seguro (valida `next` relativo); rota/logout via `SignOutButton`.
  - Store de auth no client com **Zustand** (`src/stores/auth-store.ts`) sincronizada por `onAuthStateChange` via `AuthSessionProvider` no layout raiz.
  - Config de providers desacoplada em `src/lib/auth/providers.ts` (adicionar X/Meta no futuro = 1 linha + ícone), ícones de marca inline (Google/GitHub) já que `lucide-react` não traz brand icons.
  - Layout protegido em grupo `(app)` (`src/app/(app)/layout.tsx`) com guarda no servidor (`getUser()`), `AppShell` com slot de ações do header e `UserMenu` com logout; página `/dashboard` placeholder (Fase 3 vem a seguir).
- **Fase 3 — Salas: criar e entrar:**
  - Migration `20260921000008_room_join.sql`: RPC `get_room_preview` (security definer) que devolve código, dono (nome), `host_id` e modo de entrada para o fluxo de entrada antes de virar membro; habilita **Realtime** de `room_members` (publicação `supabase_realtime`) para o painel de aprovação de entrada.
  - Server actions em `src/lib/rooms/actions.ts`: criar sala (código via RPC `generate_room_code` + URL do QR gravada em `qr_code_url`), preview/entrada via RPC, config da sala (toggles), aprovar/rejeitar entrada, encerrar e sair — todas refazendo validação via RLS e **detectando no-op por policy** (`select` + checagem de linhas) para nunca dar sucesso silencioso.
  - QR code: geração client-side com `qrcode` (`RoomQr`, exporta PNG) e leitura via câmera com `@zxing/browser` (`QrScanner`, extrai código da URL `/entrar?code=...` ou código puro).
  - Fluxo de entrada em 1–2 toques (`/entrar`): digitar código (6 chars, auto-maiúsculas) ou escanear QR → preview da sala (nome do dono + modo de entrada) → confirmar; `entryMode=open` entra direto, `approval` vira `pending` com aviso; se você é o dono, redireciona para a sala.
  - Página da sala `/salas/[codigo]` (host): card do QR, toggles persistidos de `entryMode`/`queueApprovalMode`/`requireSongConfirmation` (`RoomSettings`, otimistas com rollback), painel `Pedidos de entrada` com aprovação/rejeição em tempo real (postgres_changes com filtro por sala) e encerrar sala; participante vê só infos + "sair".
  - Dashboard reescrito: lista "suas salas (dono)" e "salas em que participo", contador de entradas pendentes, botões criar/entrar; bottom nav ganha "Entrar".
  - Proxy ganhou `/entrar` nas rotas protegidas.
  - **Testes: Vitest + React Testing Library + jsdom instalados e configurados** (`vitest.config.mts`, `src/test/setup.ts`, scripts `test`/`test:watch`/`test:coverage`); primeiros testes unitários de `src/lib/rooms/utils.ts` (normalização, validação e extração de código de QR). `@types/node` atualizado para `^24` (exigência do `vitest@5`).
- **Etapa 1 — Tela 1 (Onboarding) + consentimento LGPD + base i18n:**
  - Migration `20260921000009_consents.sql`: tabela `consents` (`user_id` pk → `auth.users`, `terms_version`, `cookies_preferences` jsonb, `geolocation` jsonb, `accepted_at`/`updated_at`) com RLS por usuário (select/insert/update do próprio). Aplicada via **Management API** (`scripts/apply-sql.mjs`, POST `/v1/projects/{ref}/database/query`) — novas migrações passarão por esse caminho.
  - `/` vira bifurcação (spec §2.5): apenas dois botões — "Quero cantar" / "Sou dono" — localizados pt-BR/en/es + banner de consentimento sobreposto; **nada é coletado antes do aceite** (botões não cooperam sem aceite).
  - Cookies do dispositivo (`src/lib/consent/cookies.ts`, `geo.ts`): `kf-consent-given` (estritamente necessário), `kf-preferences` (idioma + último perfil), `kf-geo` (status `concedida|negada|indisponível` + coords aproximadas arredondadas). Geolocalização solicitada uma única vez, logo após o aceite, sem reprompt.
  - Server action `syncConsentAction` (backfill pós-login dos cookies → `consents`, idempotente) disparada pelo `ConsentSync` no layout `(app)`.
  - i18n em `src/lib/i18n` (`detectLocale`/`normalizeLocale` respectando ordens/idioma do navegador + dicionários pt-BR/en/es) — somente a Tela 1 localizada nesta etapa.
  - Proxy: usuário autenticado em `/` agora redireciona para `/dashboard` (mantido o restante dos redirects).
  - Testes: +4 arquivos (i18n, cookies, geo + componente Onboarding); `vitest.config.mts` ganhou `globals: true` (autocleanup do RTL). Validação completa em 2026-09-21: **29/29 testes, typecheck, eslint e `build --webpack` verdes** + smoke HTTP (anon e autenticado).

### Alterado

- **Plano de implementação (`TODO.md`) e spec (`karaoke-watch-party-spec.md`):**
  - Novo campo de configuração da sala `requireSongConfirmation` (toggle do host: "pedir confirmação antes de adicionar música"), que exibe um modal de confirmação (thumbnail + título + duração) para o próprio usuário antes de enviar a música à fila. Complementar ao `queueApprovalMode`, não substituto.
  - **Plano de testes por fase** adicionado ao `TODO.md` (seção "Plano de testes por fase"): MSW na Fase 4 (busca/fila), testes de domínio bar/mesa/karaokê na Fase 3.5, Playwright transversal pós-Fase 6 e transformação do e2e RLS manual da Fase 3 em script replayável. **A bateria atual (29 testes unitários) ainda não cobre server actions, banco/RLS nem e2e automatizado — execução fica para as fases listadas; nada foi rodado hoje, apenas planejado.**

### Excluído

- Nada ainda.

### Corrigido

- `supabase db reset --linked`/`--db-url` no projeto cloud: contornado falha do role temporário `cli_login_postgres` (sem CREATEROLE) usando conexão direta `--db-url` do user `postgres`.
- Seed por SQL raw em `auth.users`/`auth.identities` deixava o serviço Auth instável (`Database error querying schema`/`finding users`) — substituído por criação via Auth Admin API em `scripts/seed.mjs`.
- Chave `SUPABASE_SERVICE_ROLE_KEY` do `.env.local` (estava como cópia da anon).

### Segurança

- Chave do YouTube removida do bundle público (`NEXT_PUBLIC_YOUTUBE_API_KEY` não é mais definida).
- RLS validado por testes de integração reais: participante aprovado vê só a sala dele (leitura/escrita bloqueadas em salas alheias via policies); ações de host (aprovar/reordenar/deletar) rejeitadas no backend para não-host; auto-aprovação de status impossível por client.
- `song_cache` sem policies (acesso apenas via service role).

### Testes

- `TESTING.md`: estratégia de testes do projeto — pirâmide unitário/integração/e2e, stack adotada (Vitest + React Testing Library, MSW para mock de redes, Playwright), boas práticas (testes determinísticos, MSW em vez de chamadas reais de API, isolamento da cota do YouTube), checklist funcional por fase (auth, salas, busca, fila com `requireSongConfirmation`, player, host, segurança/LGPD) e definição de pronto (DoD).
- Configuração das ferramentas de teste: **Vitest/RTL/jsdom instalados e configurados na Fase 3** (scripts `test`/`test:watch`/`test:coverage`); MSW (mock de redes) e Playwright (E2E) ficam para as próximas fases junto do código a testar.

### Documentação

- README.md atualizado com seção de versionamento e tópico dedicado a Testes.

### Decisões de projeto

- Migrations do Supabase: padrão `supabase/migrations` via Supabase CLI.
- Chave YouTube por sala: modelo "API key do host + OAuth Google + fallback default" (alinhado à seção 12 da spec).
- Deploy Vercel: adiado para fim do MVP.
- Seed de usuários de dev via **Auth Admin API** (não SQL raw em `auth.users`), por estabilidade do serviço Auth no cloud.
- Status inicial de fila derivado no banco a partir de `queue_approval_mode` da sala (nunca escolhido pelo client).
- **Fase 0 — Fundação do projeto (rebuild a partir do zero):**
  - Scaffold do Next.js 16.3.5 (App Router, TypeScript, Tailwind v4, ESLint, Turbopack).
  - Inicialização do shadcn/ui (v4, style `radix-nova`) com componentes base: `button`, `input`, `card`, `dialog`, `sheet`, `tabs`, `slider`, `dropdown-menu`, `label`, `switch`, `badge`, `separator`, `scroll-area`, `sonner`, `skeleton`, `tooltip`.
  - Prettier configurado (`prettier-plugin-tailwindcss`) com scripts `format`/`format:check` e script `typecheck`.
  - Tema escuro por padrão via `next-themes` (`ThemeProvider` + `ThemeToggle`).
  - Layout raiz em `pt-BR` com providers globais (`ThemeProvider`, `TooltipProvider`, `Toaster`) e metadados do app.
  - Estrutura de pastas pronta (`src/app`, `src/components`, `src/lib`, `src/hooks`, `src/stores`, `src/types`).
  - Correção de segurança no `.env.example`/`.env.local`: remoção da chave pública do YouTube (`NEXT_PUBLIC_YOUTUBE_API_KEY`) — a chave agora existe apenas como `YOUTUBE_API_KEY` (server-side), alinhado à spec (seção 13).
  - Correção do `.gitignore` para não ignorar `next.config.ts`.

### Alterado

- **Plano de implementação (`TODO.md`) e spec (`karaoke-watch-party-spec.md`):**
  - Novo campo de configuração da sala `requireSongConfirmation` (toggle do host: "pedir confirmação antes de adicionar música"), que exibe um modal de confirmação (thumbnail + título + duração) para o próprio usuário antes de enviar a música à fila. Complementar ao `queueApprovalMode`, não substituto.

### Excluído

- Nada ainda.

### Corrigido

- Nada ainda.

### Segurança

- Chave do YouTube removida do bundle público (`NEXT_PUBLIC_YOUTUBE_API_KEY` não é mais definida).

### Testes

- `TESTING.md`: estratégia de testes do projeto — pirâmide unitário/integração/e2e, stack adotada (Vitest + React Testing Library, MSW para mock de redes, Playwright), boas práticas (testes determinísticos, MSW em vez de chamadas reais de API, isolamento da cota do YouTube), checklist funcional por fase (auth, salas, busca, fila com `requireSongConfirmation`, player, host, segurança/LGPD) e definição de pronto (DoD).
- Configuração das ferramentas de teste: **Vitest/RTL/jsdom instalados e configurados na Fase 3** (scripts `test`/`test:watch`/`test:coverage`); MSW (mock de redes) e Playwright (E2E) ficam para as próximas fases junto do código a testar.

### Documentação

- README.md atualizado com seção de versionamento e tópico dedicado a Testes.

### Decisões de projeto

- Migrations do Supabase: padrão `supabase/migrations` via Supabase CLI.
- Chave YouTube por sala: modelo "API key do host + OAuth Google + fallback default" (alinhado à seção 12 da spec).
- Deploy Vercel: adiado para fim do MVP.
