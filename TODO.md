# TODO — Karaokê Watch Party (rebuild)

Plano de implementação faseado para reconstrução do projeto a partir da `karaoke-watch-party-spec.md`.

**Decisões técnicas assumidas:**

- Next.js 16 (App Router, TypeScript, Tailwind CSS) — deploy na Vercel
- shadcn/ui para componentes
- Zustand (estado client), react-hook-form + zod (forms/validação)
- Supabase (Postgres + Auth + Realtime) — free tier obrigatório
- Docs/UI em português

**Escopo:** MVP da spec (seções 1–14). Roadmap futuro (seção 15) documentado ao final, fora do MVP.

**Próximas etapas (plano fechado em 2026-09-21, atualizado em 2026-09-23):**

1. ~~Tela 1 — Onboarding + consentimento LGPD + base i18n~~ (**entregue em 2026-09-21** — ver sub-bloco da Fase 2).
2. ~~**Domínio bar/mesas/karaokês + acesso anônimo** (Fase 3.5)~~ (**entregue em 2026-09-23** — Blocos A–F concluídos: migrations 00010–00014 aplicadas no projeto Cloud via `apply-sql.mjs`, anonymous sign-ins, reseed (Bar 1/Bar 2), lib+actions+16 testes de `qr.ts`, UI Bloc E, docs Bloc F; lint/typecheck/build e 45 testes verdes. **Decisões de modelo fechadas com o PO** — ver bloco da Fase 3.5 abaixo). _Pendências residuais registradas ao final da Fase 3.5._
3. ~~**Busca + fila end-to-end** (Fase 4)~~ (**entregue em 2026-09-23** — Blocos A–H concluídos + hardening pós-entrega I; ver seção Fase 4 abaixo).
4. ~~**Acabamento do MANIFEST v0.1 — §6 "Acerca das Belas Artes"**~~ (**entregue em 2026-09-22**): Google Takeout "YouTube and YouTube Music" (2 pedidos, 1 recebido) recebido; `ler-takeout.mjs` (fora do repo, `Temp\opencode\yt-music`) ajustado p/ nomes pt-BR + strip ` - Topic` e rodado → 8.216 eventos de escuta (2025→2026, sem Shorts/vídeo, 2.842 faixas); §6 do [`MANIFEST.md`](./MANIFEST.md) escrita com o retrato real (Florence + The Machine dominante, AURORA, década 2020); nota de instrução do autor e cartão do ouvido removidos, nota de rodapé aponta a etapa de ciência de dados; fonte no §8 e nota da spec §16/§17 atualizadas. Zip do Takeout isolado em `.local-data/takeout/` (gitignored, nunca versionado). _Pendência residual anotada:_ análise cruzada (histórico × curtidas) fica para o futuro repo `karaoke-flow-data` (ciência de dados — ver `docs/ciencia-de-dados/segmentacao-sentimental.md`).

> A ampliação da **bateria de testes** acompanha as fases (ver seção "Plano de testes por fase" abaixo).

---

## Retomada — contexto da próxima sessão (2026-09-28)

> O que está em pé quando a máquina voltar. Para se pôr a par: estes três commits —
> `21667d3` (seed por env + cruzamento + Advisor 0010), `8fd31f2` e `fe7efec` (MANIFEST).

**Estado atual — Fase 8b·ter (código + Cloud) pronta, tudo aplicado no projeto `kskoipyzqcacccepcqpc`:**

- `security_manual_linking_enabled=true` via Management API (chave **plana** `security_manual_linking_enabled` — o corpo aninhado legado `security:{…}` retorna 200 mas não aplica; `scripts/enable-manual-linking.mjs` foi corrigido para a forma plana).
- `sync:seed-users` rotacionou a senha privada nas 4 contas (`auth.admin.updateUserById`, idempotente, sem tocar em domínio): dono→`multimalakoi@gmail.com`; ana/bruno `@exemplo.com`; **betania mantém `betania@exemplo.com`** (o outlook pessoal pertence à conta GitHub `e3580e25…` da Vercel — sem merge, decisão do usuário).
- Identidades `email` presentes nas 4 contas; GitHub só entra pelo botão **"Vincular GitHub"** (validação manual — ver item 2 abaixo).
- Advisor 0010: migration `20260928000033_profiles_public_invoker.sql` **aplicada** + `smoke-profiles-public.sql` **8/8 ok** (view `security_invoker=true`, `email` com permission denied para `anon`/`authenticated`, grants por coluna `id/name/avatar_url`, policy `profiles_select_public`).
- MANIFEST: voz/clima/o sentir como produto; homenagem à Supergiant Games/Transistor acomodada em §6 (sem nota de rodapé).
- `SUPABASE_ACCESS_TOKEN` válido no `.env.local` (`sbp_fcb5…`); scripts leem token, anon key e service role de `.env.local`.
- Testes: 379/379 (32 arquivos), typecheck, lint e scan de segredos verdes.

**Falta (lado do usuário, sem código):**

1. **Vercel:** espelhar as envs (SEED_HOST_EMAIL, SEED_USER_EMAIL, SEED_USER2_EMAIL, SEED_PASSWORD, NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=1; SEED_HOST2_EMAIL fica no default) e revalidar no remoto.
2. **Validar §3.1 (TESTING):** senha→dono→"Vincular GitHub"→sair→GitHub→mesmas salas. Quando o usuário fizer o link, rodar o check de `auth.identities` do id `…0001` (deve ter `email` + `github`).
3. Depois: reavaliar `security_manual_linking_enabled` (desligar ou migrar para staging antes de uso real).

**Próxima fase de desenvolvimento (decisão em aberto — recomendado: Fase 9):**

- **Fase 9:** entrada **fora do raio** (toggle por sala, `checkPresence` em 3 estados, lista do host com distância/tag "fora do bar") + **link de convidado do dono** (`rooms.link_convidado`, expiração/uso máximo). Decisões D1–D5 já fechadas com o PO em 2026-09-25. Sequência 9→10→11; o player (Fase 6/7) pronto destrava 12/13.
- **Alternativa:** itens de hardening da **Fase 8** (auditoria completa de RLS, rate limiting em rotas sensíveis, teste de concorrência da fila, limites do Realtime, LGPD retenção/exclusão, limpeza de `played`/`rejected`, polimento mobile, latência realtime).

**Ferramental que se aplica:** migrations via `node scripts/apply-sql.mjs supabase/migrations/<arquivo>.sql`; smokes em `scripts/*.sql`; smoke **por catálogo** quando `set role` não vale no contexto da Management API; validação manual no checklist do TESTING.

---

## Plano de testes por fase (ampliação da bateria)

> **Situação atual (2026-09-27):** Vitest + RTL + jsdom com **353 testes** (32 arquivos) — rooms/utils, `src/lib/bars/qr.test.ts` 20, `src/lib/bars/schema.test.ts` 5 + `radiusTickStep`/`radiusTicks` em `geo.test.ts`, i18n, consent cookies/geo, componente Onboarding, `src/lib/youtube/*` 55, `queue` matriçada (39), rota `/api/youtube/search` **16 via MSW** — incl. Bearer de OAuth host/app —, **roundtrip OAuth authorize→callback 4**, entrada com aprovação (`entry-approval-wait` 10, `pending-entry-requests` 5) e o gate de presença (`presence-gate-info` 14), fila (`queue-list` 23, `song-search` 9, `song-confirm-dialog` 9), player (`playback` 24 de regras puras, `youtube-stage` 13, `player-error-boundary` 2, `player-kiosk` 18 com a IFrame Player API mockada **fiel ao ciclo de vida real**, `playback-controls` 12), e a **Fase 8a** (`queue-actions` 7, `entry-state` 5, `room-settings` 3). **MSW instalado** (mocka a YouTube Data API nas provas de rota). **Ainda não há** Playwright, testes de server actions nem cobertura de banco/RLS automatizada — o banco é coberto por **smoke SQL** (`scripts/smoke-playback.sql`, `scripts/smoke-player-session.sql`). Detalhamento por área em `TESTING.md` §3.2.
>
> Princípios: testar o que agrega (helpers de domínio e componentes críticos em unit; fluxos de usuário em e2e); manter a suíte rápida; RLS validada via smoke/e2e, não em unit.

- [x] **Fase 3.5 (Etapa 2):** regras de domínio de bar/mesa/karaokê (parse/extração/rotas de QR, token de entrada) extraídas em `src/lib/bars/qr.ts` e cobertas em unit (**16 testes**); smoke HTTP do fluxo de entrada (anon/autenticado, 1 karaokê) validado manualmente. **Ainda falta:** testes de componentes das telas novas (`/entrar` reescrito, `CreateBarDialog`, dashboard "meus bares").
- [x] **Fase 4 (Etapa 3):** **MSW** adicionado e mockando a YouTube Data API nas provas de rota — serviço de busca (parse de itens, cadeia de credenciais host→app→dev, cache miss/hit, rate-limit, geo gate, credencial fora do payload) e `addSongToQueueAction` (matriz de geolocalização unit). **Fica para a Fase 5:** unit da store de fila e smoke HTTP da rota `/salas/[codigo]/buscar`.
- [x] **Fase 5:** testes de componentes do painel de aprovação/reorder da fila e do modal `requireSongConfirmation`; unit das actions de reorder/controle do player (fila vazia/pausada, dedupe) — painel, modal, reorder e troca cobertos em 26/09 (**266 testes**); o unit do controle do player (fila vazia/pausada, dedupe) fica para a Fase 7, junto das actions de play/pause/skip.
- [x] **Fase 6:** smoke HTTP da rota pública `/player/[codigo]` (sem sessão, modo quiosque) — contrato do banco coberto por `scripts/smoke-playback.sql` (20 passos, inclui token inválido, sala encerrada e rotação de token); o smoke HTTP de verdade fica para o e2e com Playwright. **Ampliado na Fase 8a:** o player ganhou a segunda porta (sessão, sem token) e o smoke `scripts/smoke-player-session.sql` cobre token × sessão × anônimo × 24h em 17 verificações, autossuficiente.
- [x] **Fase 8a:** as actions de fila (aprovar/rejeitar/remover/reordenar) e o player por sessão + pré-aprovação de 24h — `queue-actions.test.ts` (7, erro real do banco chegando ao `toast`), `entry-state.test.ts` (5), `room-settings.test.tsx` (3, o toggle travado na UI), `player-kiosk` 10 → 13, `song-search` 6 → 9 e `playback` 20 → 24. Ver a seção da Fase 8a.
- [ ] **E2E transversal (Playwright):** instalar Playwright quando o MVP estiver estável (pós-Fase 6) e automatizar os fluxos principais — Tela 1 (aceite LGPD) → `/login` → dashboard à proteger, entrada em karaokê por código/QR, participante sem geo bloqueado de adicionar (e host não), player aberto em tela externa. Transformar o e2e RLS manual da Fase 3 em script replayável (`scripts/`).
- [ ] **Rastreabilidade:** marcar no CHANGELOG quando MSW/Playwright entrarem; atualizar `TESTING.md` §2 ao longo das fases.

---

## Fase 0 — Fundação

- [x] Scaffold Next.js 16 (App Router, TypeScript, Tailwind)
- [ ] Deploy Vercel inicial (adiado para o fim do MVP — decisão registrada no CHANGELOG)
- [x] Setup do shadcn/ui (config, componentes base: button, input, card, dialog, drawer/sheet, tabs, slider, dropdown-menu, label)
- [x] Estrutura de pastas (`src/app`, `src/components`, `src/lib`, `src/hooks`, `src/stores`, `src/types`)
- [x] ESLint + prettier configurados
- [x] Tema escuro por default (next-themes)
- [x] Shell mobile-first base: header, bottom nav, containers responsivos
- [x] `.env.example` com todas as variáveis e documentação:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `YOUTUBE_API_KEY` (chave default do desenvolvedor)
  - Config dos provedores OAuth (Google, GitHub)
- [x] Layout raiz + globals (dark, mobile-first)
- [x] Validação da Fase 0: lint / typecheck / build / servidor 200 (landing page ok)

## Fase 1 — Banco de dados + RLS (Supabase)

> **Pendência externa:** ~~aguardando credenciais válidas~~ — **resolvida em 2026-09-21**: projeto Supabase `kskoipyzqcacccepcqpc` reativado (estava pausado), credenciais atualizadas e validadas. `YOUTUBE_API_KEY` **validada** (`search.list` respondeu OK em 2026-09-21) — usada em dev; **não vai para produção** (ver Fase 4). Credenciais OAuth `YOUTUBE_OAUTH_CLIENT_ID/SECRET` adicionadas no `.env.local` para o modelo chave-por-host.
>
> ⚠️ **OAuth client (2026-09-21 → resolvido 2026-09-23):** o client **Web** antigo havia sido deletado no Google Cloud (restava só o **Desktop app** `555657479128-nou62soqjj…`, loopback, p/ ferramentas dev). Para a **Fase 4 (OAuth por-host)** o client Web foi **recriado** em 2026-09-23 (`karaoke-flow-web`, redirects `http://localhost:3000/auth/youtube/callback` + `http://localhost:8891/`) e o `YOUTUBE_OAUTH_CLIENT_ID/SECRET` do `.env.local` agora apontam para ele (`credentials/oauth/oauth-dev-web.json`). O client Desktop permanece no console p/ ferramentas dev/manifesto (não é mais usado pelo app).

**Decisão:** migrations versionadas com **Supabase CLI** (`supabase/migrations`, aplicadas via `supabase db push`).

- [x] Migration: `profiles` (id, nome, email, avatar, authProvider)
- [x] Migration: `rooms` (id, code único 6 chars, qr_code_url, host_id, entry_mode, queue_approval_mode, require_song_confirmation, youtube_api_key nullable, status, created_at)
- [x] Migration: `room_members` (roomId, userId, status pending|approved|rejected, joinedAt)
- [x] Migration: `queue_items` (roomId, addedByUserId, youtubeVideoId, title, thumbnailUrl, durationSeconds, status, position, addedAt)
- [x] `position` da fila computado no banco (advisory lock por sala + trigger) — sem corrida em inserts simultâneos
- [x] Migration: `song_cache` (query normalizada, resultados, timestamp) — sem policies RLS (só service role)
- [x] Trigger que cria `profile` ao criar usuário no Supabase Auth (`handle_new_user`)
- [x] RLS ligado desde o dia 1:
  - [x] Leitura/escrita da fila apenas para `RoomMember.status = approved` da sala (nunca salas alheias) — validado por teste de integração real
  - [x] Host actions validadas no backend via policies (aprovar/reordenar/deletar rejeitadas para não-host; auto-aprovação de status bloqueada via trigger `queue_items_initial_status`)
- [x] `roomId` em toda tabela relevante (multi-tenancy desde já, nunca assumir sala única)
- [x] Seed determinístico de dev (`npm run seed` — scripts/seed.mjs cria usuários via Auth Admin API + dados de domínio idempotentes)
- [ ] Scripts de limpeza de dados quentes (played/rejected antigos) — planejado na Fase 8
- [ ] Validação dos limites do free tier: linhas/storage do Postgres, conexões concorrentes do Realtime (anotar resultados)

## Fase 2 — Autenticação (Google + GitHub)

- [x] Configurar providers **GitHub** e **Spotify** no projeto Supabase (credenciais OAuth externas — ver README); **Google** pendente de credencial
- [x] Camada de providers estendida (Spotify, Discord, Facebook, X) com botões desabilitados até credenciais prontas — **Spotify bloqueado: Web API exige Premium**
- [x] Helpers Supabase SSR: `client`, `server`, middleware/proxy de sessão
- [x] Página de login com botões OAuth (Google, GitHub)
- [x] Rota de callback + exchange de código
- [x] Rota/logout
- [x] Store de auth no client (Zustand), sincronizada com a sessão
- [x] Layout protegido para rotas autenticadas (dashboard/salas)
- [x] Arquivo de config de providers desacoplado (facilita adicionar X/Meta no futuro sem retrabalho)
- [x] Login de desenvolvimento via e-mail/senha (somente `NODE_ENV=development`) com usuários do `npm run seed`

### Tela 1 — Onboarding / Seleção de Perfil (MVP — spec §2.5)

> **Decisões fechadas com o PO (2026-09-21):** exceção do host (vê o banner, nunca é bloqueado); i18n **apenas da Tela 1** nesta etapa (dicionários prontos para crescer); geolocalização bloqueia adicionar música para não-host, mas mantém **view-only** (fila/player/thumbnail); proxy **mantém os redirects atuais**.

- [x] Tela raiz (`/`) substitui a landing atual pela bifurcação: apenas os botões **"Quero cantar"** (participante) e **"Sou dono"** (host), texto no idioma detectado do navegador; nenhum outro elemento (não é landing de marketing)
- [x] Banner/modal de consentimento LGPD/GDPR com **aceite antes de qualquer coleta**; sem aceite, nada do dispositivo é coletado; cookie **estritamente necessário** `kf-consent-given` marcado ao aceitar (permitido sem aceite)
- [x] Base i18n (`src/lib/i18n`): idioma do navegador define o idioma da UI; dicionários pt-BR (default) + en/es; estrutura pronta para crescer
- [x] Coleta de idioma (`navigator.language`) após aceite → define o idioma da UI (incl. botões)
- [x] Coleta de geolocalização após aceite: `getCurrentPosition` com status `concedida|negada|indisponível` + coords aproximadas persistidas; sem reprompt automático
- [x] Cookie de preferências: idioma + último perfil escolhido, persistidos entre visitas
- [x] Registro de aceite na tabela `consents` (migration `20260921000009_consents.sql`, RLS próprio usuário) quando houver uid (anônimo ou login); sem sessão, fica nos cookies do dispositivo até o vínculo (backfill via `syncConsentAction` no layout `(app)`)
- [x] Exceção host: vê o banner, nunca é bloqueado
- [x] Roteamento: "Quero cantar" → `/login` (participante) · "Sou dono" → `/login` (host); coleta independente da escolha (desde que cookies aceitos); sinalização do perfil + pré-seleção do último perfil via cookie
- [x] Proxy: **mantém redirects atuais** — não-autenticado em rota protegida → `/login`; autenticado em `/` ou `/login` → `/dashboard`

## Fase 3 — Salas: criar e entrar

> **Observação de implementação:** o QR é renderizado no cliente (`qrcode`) mas a URL é persistida no banco (`qr_code_url`) já na criação da sala, via server action. O scan exige câmera → testar em dispositivo real ou navegador com `--use-fake-device-for-media-stream`.

- [x] Criar sala → gera `code` único com entropia suficiente (6 chars, não sequenciais, RPC `generate_room_code`) + URL de QR persistida
- [x] Gerar QR code ao criar a sala (lib `qrcode`, componente `RoomQr` com export PNG)
- [x] Entrar na sala via código digitado e via scan de QR (lib `@zxing/browser`, componente `QrScanner`)
- [x] Fluxo de entrada em 1–2 toques: abrir QR → nome da sala → confirmar entrada (sem formulários longos)
- [x] `entryMode = open`: participante entra direto
- [x] `entryMode = approval`: pedido de entrada fica `pending`; host aprova/rejeita (Realtime `room_members`)
- [x] Painel de aprovação de entrada (na tela da sala, ações rápidas aprovar/rejeitar, sem navegação extra)
- [x] Sair da sala; host pode fechar a sala (`status = closed`, bloco rota p/ salas encerradas)
- [x] Toggles de config da sala persistidos no banco (`entryMode`, `queueApprovalMode`, `requireSongConfirmation`) com atualização otimista
- [x] Toggle `requireSongConfirmation` na UI de config da sala ("Pedir confirmação antes de adicionar música")
- [x] Instalar/configurar Vitest + RTL + jsdom + coverage (MSW fica para a Fase 4/5, junto do código de rede a mockar)
- [x] Tela de espera da aprovação (`EntryApprovalWait`) compartilhada por `/entrar` (QR e código) e `/salas/[código]`, com Realtime + poll, avanço automático na aprovação, retry na rejeição e estados "cancelado" × "sala encerrada" (2026-09-25)
- [x] Pedido `pending` recuperável após sair da tela: membership devolvida pelo preview, lista de pedidos no dashboard e em `/entrar` sem token ("Acompanhar aprovação" → `/entrar?code=…`), e o gate de presença não esconde mais quem já tem pedido em andamento (2026-09-25)
- [x] Participante cancela o próprio pedido `pending` (tela de espera e lista) e volta ao preview do bar/sala para poder pedir de novo (2026-09-25)
- [x] Raio de presença visível para o host: aviso no toggle "Entrada livre" de que o gate barra **independente** do modo de entrada, mapa (Leaflet + OSM) com o círculo em **500 m** e a metragem, campo de raio **bloqueado/desabilitado** com "Personalização em breve", e migration do padrão 150 → 500 m (2026-09-25)
- [x] **Personalização do raio pelo host** (2026-09-26): campo habilitado (input numérico + slider, **50–1000 m** de 50 em 50), **prévia do círculo em tempo real** (o mapa e o texto do aviso acompanham o valor local antes de gravar) e persistência em `bars.raio_permitido_metros` via `updateBarRadiusAction` (escrita pelo client do usuário → barrada pela RLS `bars_update_own` para quem não é dono; `.select()` detecta no-op de policy). Grava no commit do controle (soltar o slider, sair do campo, Enter ou debounce de 500 ms), com status "Salvando…/Salvo às HH:MM", rollback + toast se o banco recusar e botão "Restaurar 500 m". Validação em `barRadiusSchema` (mesma faixa do `check` do banco, fonte única em `src/types/bar.ts`)
- [x] **HUD/sprites animados sobre o mapa do raio** (2026-09-26): o wrapper relativo do `PresenceRadiusMap` recebe duas camadas `pointer-events-none` (não roubam pan/zoom) — o HUD com a metragem e a etiqueta do passo ("anéis de 100 m") e os anéis internos do raio, cada um pulsando com atraso escalonado e `motion-reduce:animate-none`. A geometria vem de `RadiusGeometry`, que mede a escala do próprio Leaflet (`latLngToContainerPoint` + `containerPointToLatLng`) e republica a cada `move`/`zoom`/`resize`; o passo dos anéis é puro e testado (`radiusTickStep`/`radiusTicks` em `src/lib/bars/geo.ts`)

## Fase 3.5 — Domínio bar/mesas/karaokês + acesso anônimo

> **Revisão do modelo decidida com o PO (2026-09-21):** o host é **um bar**; o bar tem **mesas 0–999** (cadastro rico) e **1..N karaokês simultâneos** (default: 1 fila por bar). Cada karaokê = uma `room` (fila + player próprios). Entrar no bar → default 1 karaokê: **direto na fila única**; N karaokês: a pessoa escolhe a **mesa** por número (0–999) ou QR → mesa resolve o karaokê. A infra de consentimento LGPD (`consents`) já nasce na **Etapa 1 (Tela 1)** e é alimentada por ela.

> **Modelo fechado na implementação (2026-09-23) — prevalece sobre o texto acima:** bar = perfil-personificação do host (1:1), login real obrigatório; **salas/karaokês são do host**, default **1 por bar** (multi-sala desabilitado p/ criar; affordance "Adicionar sala"); **mesas pertencem ao bar** (tabela `mesas` + QR próprio), entrada direta com mesa pré-selecionada por código/QR; `quantidade_mesas` default **1**; mesas = etiqueta, playlist da sala; participante escolhe mesa obrigatoriamente (`room_members.mesa_numero`); stats do participante derivados por query; anon sign-in via Management API (host não pode ser anônimo).

### Plano de implementação (Blocos A–F, 2026-09-23) — ✅ concluídos

- [x] **A. Banco (migrations):** `20260923000010_bars` (bars: host_id unique, code, nome, cidade, endereco, `quantidade_mesas` default 1, `generate_bar_code`, RLS select-todos/escrita-host); `20260923000011_mesas` (bar_id, numero unique por bar, rotulo, RLS, helper `is_bar_host`); `20260923000012_rooms_bar` (`rooms.bar_id`, migração bar auto por host das rooms existentes, `room_members.mesa_numero`); `20260923000013_entry_preview` (`get_entry_preview` unifica bar/room, `get_room_preview` dropada, `join_room` com mesa validada + registrada via `coalesce`); `20260923000014_create_bar` (criação atômica bar + mesas + room única; recusa anônimo). **Aplicadas** no projeto Cloud via `node scripts/apply-sql.mjs` (padrão do time — sem `SUPABASE_DB_PASSWORD`, `supabase db push` falha em auth).
- [x] **B. Sessão anônima:** script `scripts/enable-anonymous-signins.mjs` (Management API) rodado + config.toml local `enable_anonymous_sign_ins=true`; botão "Continuar sem login" no `/login` (`signInAnonymously` → `/entrar`); proxy desvia anônimo de `/`/`/login`/`/dashboard` para `/entrar`; `create_bar` recusa sessão anônima.
- [x] **C. Reseed (`scripts/seed.mjs`):** 4 usuários via Auth Admin API (novo **betania**, host 1:1 do Bar 2); Bar 1 "Karaokê do Zé" (`ZEHBAR`, 12 mesas, sala `KARAOK` fila manual) + Bar 2 "Bar da Esquina" (`BARSEG`, 6 mesas, sala `BAR2FO` fila auto); ana/bruno com `mesa_numero`.
- [x] **D. Actions + domain lib:** `src/lib/bars/actions.ts` (`createBarAction` zod com `default(1)` na quantidade de mesas, `getEntryPreviewAction`, `joinEntryAction`); `src/lib/bars/qr.ts` (puro: `parseEntryToken`, `extractEntryToken`, `barJoinUrl`/`mesaJoinUrl`, backcompat `?code=`) com **16 testes** (`qr.test.ts`).
- [x] **E. UI:** `/entrar` reescrito (token → preview → escolha da mesa → join; QR de mesa pré-seleciona; se é host, redirect); `CreateBarDialog` (sem multi-sala); dashboard "Meu bar" + "Bares que frequento" + pendências + botão "Adicionar sala" desabilitado; QRs de bar/mesa (`RoomQr` com `fileName`); `/salas/[codigo]` contexto "Bar · Mesa N"; `QrScanner` com `match` customizado.
- [x] **F. Docs + testes:** spec §5 (Entidades), `docs/flows/*` migrados, README/TESTING.md §3/CHANGELOG atualizados; unit de `qr.ts`; lint/typecheck/build e 45 testes verdes.

### Pendências residuais (Fase 3.5)

- [ ] **Docs/flows (`docs/flows/*.md`):** diagramas **Mermaid** sanitizados e validados com `mermaid.parse` **v10.9.8 + v11.17.2** (26/26 OK) — arestas **sem vírgula/parêntese** (`-->|label|` só palavras simples), `?` apenas no **fim** de nó `{…}`, ERD sem relacionamento encadeado, sem backticks/newline cru em labels. **Ainda falta:** conferir a renderização no renderizador/preview usado (limpar cache do editor — o erro antigo citado usava o texto pré-correção) e varrer os demais `.md` do repo com o mesmo critério de sintaxe.
- [ ] **Migrations aplicadas via `apply-sql.mjs`** não registradas em `schema_migrations` (sem `SUPABASE_DB_PASSWORD`) — anotar reaplicação/criação local quando o acesso via CLI for resolvido.
- [x] **`YOUTUBE_APP_REFRESH_TOKEN`** coletado em 2026-09-23 via `scripts/youtube-app-oauth.mjs` (conta dev) e gravado no `.env.local` — fallback do app da Fase 4 ativo (expira em 7 dias enquanto o consent screen estiver em _Testing_).
- [ ] **Deploy Vercel** permanece adiado para o fim do MVP (decisão registrada no CHANGELOG).

- [ ] Migration `bars` (1:1 com `profiles` de host): `host_id` unique, `code` 6 chars, `nome`, `cidade`, `endereco`, `quantidade_mesas` (0–999), `karaokes_simultaneos` (default 1), `criado_em`
- [ ] Migration `mesas`: `bar_id`, `numero` (0–999, unique por bar), `rotulo`, `room_id` (karaokê a que pertence)
- [ ] `rooms` vira karaokê: coluna `bar_id` (FK) + migração dos registros existentes
- [ ] RLS novas: `bars`/`mesas` legíveis por **qualquer autenticado, inclusive anônimo**; escrita só do dono (`is_bar_host` — helper novo que valida `bars.host_id`, adaptando `is_host` atual); `consents` só o próprio usuário; preview continua via RPC security definer
- [ ] RPC `get_table_room_preview(bar_code, mesa)` → karaokê da mesa (N filas) ou fila única (default)
- [ ] Reseed: Bar 1 "Karaokê do Zé" (1 karaokê, fila manual) + Bar 2 (2 karaokês "Pista A"/"Pista B", mesas 1–15 → A, 16–30 → B) — substitui KARAOK/BAR2FO
- [ ] Sessão anônima: **⚠️ pendência externa** — habilitar anonymous sign-ins (Management API `AuthConfig` ou dashboard) + botão "Continuar sem login" no `/login` (`signInAnonymously`)
- [ ] "Criar sala" → **Criar bar**: cadastro rico (nome, cidade, endereço, `quantidade_mesas`, `karaokes_simultaneos`, rótulos das mesas) → gera mesas + karaokês + QRs
- [ ] `/entrar` reescrito: escolher bar (lista ou código/QR do karaokê) → 1 karaokê: direto na fila única; N: número da mesa ou scan do QR da mesa → preview → confirmar (`join_room`)
- [ ] QR por karaokê **e** por mesa (mesa codifica `bar code + número`)
- [ ] Dashboard: host vê "meus bares"; participante vê "bares que visito"; `/salas/[codigo]` = página do karaokê
- [ ] Docs/fluxos (`docs/flows/*`) e **spec §5 (Entidades)** migrados para a terminologia/entidades bar/karaokê/mesa/consents

## Requisito — presença física (geo gate) — registrado 2026-09-23

> **Definição:** participação na sala de karaokê (entrar/confirmar mesa **e** adicionar música) exige que o usuário **esteja fisicamente no bar**. Compara-se o GPS do usuário (cookie `kf-geo`, sob consentimento) com as coordenadas do bar ± raio. Bloqueia usuários remotos. Host isento (é o bar). Ver spec §2.5.4.
>
> **Análise:** coords do cookie com 3 casas (~±50–111 m) → raio por bar default **150 m** (50–1000, ajustável); bar **sem coords registradas** ⇒ participante não comprova presença e é bloqueado (geo-unavailable) — localização vira requisito de facto no cadastro (hint no dialog); GPS de dispositivo **não é prova criptográfica** (spoofing) — é trava de fricção, não fronteira de segurança; consentimento LGPD vira **mandatório p/ participação** (view-only mantido); raio pertence ao **bar** (aplica-se a N salas). Geocode gratuito via **Nominatim/OSM** com fallback **GPS do dispositivo** no cadastro.

- [x] Migration `20260923000015_bars_geo` aplicada no projeto Cloud (via `apply-sql.mjs`, padrão do time) — validação real do gate no banco; reseed com coords do **ZEHBAR** (Bar 1) e raio default 150.
- [x] `src/lib/bars/geo.ts` (haversine, `withinRadius`, `checkPresence`, `geocodeAddress`) + `presence.ts` (leitura do cookie server-side) — **23 testes** verdes.
- [x] `joinEntryAction`/`getEntryPreviewAction` exigem presença (host isento); `EntryPreview` com banner de bloqueio + CTA "Permitir localização" (re-captura e revalida).
- [x] `CreateBarDialog` + schema: endereço → geocode (Nominatim) → fallback "usar minha localização atual"; campo **raio** com hint explicando a finalidade; default 150.
- [x] Questionário: **Q16** (endereço/cidade — localização física), **Q17** (nº médio de mesas), **Q18** (aceitação de exigir GPS); nota de raio de presença registrada; 18 perguntas.
- [x] Docs: spec §2.5/§3/§13, CHANGELOG, `docs/flows` (fluxo de entrada com gate), README (stack/questionário).
- [x] **Pendência resolvida:** refresh do `kf-geo` em `entry-preview` recaptura GPS — rota reexecutada no servidor revalida a presença a cada submissão da action.

## Fase 4 — Busca no YouTube + fila end-to-end

> **Escopo ampliado com o PO (2026-09-21):** além da busca, esta fase entrega a **adição à fila + lista simples da fila** (mutation com `position` por advisory lock e status inicial por modo de aprovação). Realtime completo, painel de aprovação do host, reordenar/remover e modal `requireSongConfirmation` ficam na Fase 5. A busca respeita a **matriz de permissão por geolocalização**.

### Plano de implementação (Blocos A–H, 2026-09-23) — ✅ concluídos

- [x] **A. Lib:** `src/lib/youtube/*` — `types`, `errors` (`YouTubeApiError`, mensagem amigável de cota), `rate-limit` (janela deslizante em memória, 60/h), `cache` (`normalizeQuery` em bucket alfabético, TTL 7d), `app-oauth` (refresh/exchange), `credentials` (cadeia key-room → **OAuth host** → OAuth app → dev), `search` (`safeSearch=strict` + `videoEmbeddable=true`, durações em lotes de 50), `service` (busca orquestrada com portas: rate limit, cache, geo gate, credencial) — **31 testes** verdes.
- [x] **B. Banco:** migration `20260923000016_youtube_oauth_tokens` (host_id unique, refresh_token, updated_at; **sem policies — só service role**) **aplicada** no Cloud via `apply-sql.mjs`; `src/lib/supabase/admin.ts` (client service role).
- [x] **C. Rota + action:** `/api/youtube/search` (GET autenticado; rate limit `ip:userId`; cache `song_cache` compartilhado via admin; cadeia de credenciais injetada; credencial **nunca no payload**; 400/403/404/429+**Retry-After**/502 com fallback amigável; geo gate server-side via `kf-geo`), `src/lib/rooms/queue.ts` (`queueSongSchema`, `buildQueueSongItem` com a matriz de presença — **códigos** `GEO_UNAVAILABLE`/`OUTSIDE_BAR`) + `queue.test.ts`, `src/lib/rooms/queue-actions.ts` (`addSongToQueueAction` com `.select()` para validar RLS host/membro + `revalidatePath`).
- [x] **D. UI:** `src/lib/youtube/format.ts` (duração); `SongSearch` (debounce 500ms + **AbortController**, thumbnail reutilizável, banner geo com CTA "Permitir localização" + `window.location.reload`, "Adicionar à fila"), rota `/salas/[codigo]/buscar` (server: auth → sala → membership → `requirePresence`), `QueueList` (inicial server + subscribe Realtime `postgres_changes` em `queue_items`) integrada à página da sala.
- [x] **E. OAuth por-host:** rotas `/auth/youtube/authorize` (state nonce → cookie `kf-yt-oauth` httpOnly; `access_type=offline&prompt=consent`) e `/auth/youtube/callback` (exchange → upsert em `youtube_oauth_tokens`), `scripts/youtube-app-oauth.mjs` (coleta do `YOUTUBE_APP_REFRESH_TOKEN`), **cadeia com OAuth do host** (`getHostAccessToken` via `admin`), Bloco "Conexão YouTube do host" no `RoomSettings` (chave manual própria + Conectar com Google) + `updateYoutubeKeyAction`.
- [x] **F. MSW:** devDep instalado; **16 testes** de rota `route.test.ts` (401, 404, PENDING, sucesso+chave do bar, **chave fora do payload**, cache miss→hit sem bater no YouTube, cota friendly 502, erro genérico 502, NO_CREDENTIAL, 429+Retry-After, OUTSIDE_BAR, dentro do raio, GEO_UNAVAILABLE, host isento).
- [x] **G. Docs:** spec §4/§6/§12/§13, `docs/flows` (busca no fluxo da sala), CHANGELOG, README (se for o caso) atualizados; lint/typecheck/build e **146 testes** verdes.
- [x] **H. Pendências externas (resolvidas em 2026-09-23):** **client Web** criado no Google Cloud (`karaoke-flow-web`, redirects `http://localhost:3000/auth/youtube/callback` + `http://localhost:8891/`; `YOUTUBE_OAUTH_CLIENT_ID/SECRET` atualizados + JSON em `credentials/oauth/oauth-dev-web.json`); **`YOUTUBE_APP_REFRESH_TOKEN` coletado** com `scripts/youtube-app-oauth.mjs` e gravado no `.env.local` (conta dev autorizada; expira em 7 dias enquanto o consent screen estiver em _Testing_); **`queue_items` publicada** na `supabase_realtime` (migration `20260923000017` — aplicada; antes só `room_members` estava).
- [x] **I. Hardening pós-entrega (2026-09-23):** **state do OAuth não era gravado** (duplo-encode → `state-mismatch` silencioso; removido extra `encodeURIComponent` + cookie `secure` condicional + helpers movidos p/ `src/app/auth/youtube/oauth.ts` — 4 testes de roundtrip); **busca 502 com OAuth** corrigida (`Authorization: Bearer` para app/host, `?key=` para room/dev — +2 testes MSW); **UI de conexão** no RoomSettings ("conectado · desde …" + "Remover conexão" com **revoke na Google**); **dono auto-aprovado** (migration `20260923000018`); **encerrar sala = RPC `close_room`** (migration `20260923000019`: status `cancelled` novo + expulsa membros; página mostra "sala encerrada"); docs/CHANGELOG/testes atualizados → **152 testes** verdes.

- [x] Rota de servidor `/api/youtube/search` — credencial injetada apenas no backend, **nunca no client**
- [x] `safeSearch=strict` + `videoEmbeddable=true` no `search.list` (moderação + só vídeos embutíveis)
- [x] Busca + `videos.list?part=contentDetails` (lote) para duração; resultados com thumbnail + título + duração
- [x] Campo de busca único e persistente no topo da tela; resultados em lista mobile-first
- [x] Botão "Adicionar à fila" grande (alvo de toque generoso, ambiente de bar)
- [x] Debounce na busca (~500ms + AbortController contra corridas de request)
- [x] `song_cache` compartilhado entre karaokês (query normalizada; reusar antes de chamar a API; TTL 7 dias)
- [x] Rate limiting por usuário/IP na rota de busca (independente da cota do YouTube)
- [x] Fallback amigável de cota esgotada ("tente novamente mais tarde", sem erro cru)
- [x] Cadeia de credenciais: chave do bar → **OAuth do host** → OAuth do app → `YOUTUBE_API_KEY` (dev, só quando setada)
- [x] OAuth por-host: rotas authorize/callback + tabela `youtube_oauth_tokens` (sem policies — só service role); script `scripts/youtube-app-oauth.mjs` (consent único do dev → `YOUTUBE_APP_REFRESH_TOKEN` no `.env.local`)
- [x] Bloco "Conexão YouTube do host" no `RoomSettings` (conectar conta Google / colar key própria)
- [x] **Registro p/ produção:** `YOUTUBE_API_KEY` do dev **não** entra na produção (produção = OAuth por-host + OAuth do app como default). `YOUTUBE_APP_REFRESH_TOKEN` (script) é **pré-requisito** do fallback do app — sem ele, produção depende só de OAuth por-host
- [x] Server action `addSongToQueueAction`: insert em `queue_items` (position advisory lock, status por `queue_approval_mode`, `.select()` para validar RLS)
- [x] **Matriz de presença física (Requisito §2.5.4):** participante precisa de consentimento + geo concedida + dentro do raio do bar (haversine, server-side via `kf-geo`) para **entrar e adicionar música** (erro amigável + botão re-permitir); host isento; view da fila/player/thumbnail mantido
- [x] `/salas/[codigo]/buscar` (rota filha) + lista simples da fila na página da sala (atualiza ao adicionar)
- [x] Instalar MSW + testes da rota/lib (sucesso, cota esgotada, 429, cache hit, credencial nunca no payload) e da `addSongToQueueAction` (geo gate, RLS)

### Validação manual (E2E dev) — pendente de rodar (24/09)

> Rode tudo em `npm run dev -- --webpack`, login dev `dono@exemplo.com`/`senha123`, sala `KARAOKE` (bar `ZEHBAR`). Google OAuth client Web `karaoke-flow-web` ✓ (redirects `http://localhost:3000/auth/youtube/callback` + `http://localhost:8891/`). Consent screen ainda em **Testing** → refresh tokens expiram em ~7 dias (migrar para **Production** após validar).
>
> **Bloqueios resolvidos (25/09) — prontos para rodar:**
>
> 1. **Presença física:** coords do Bar 1 (`ZEHBAR`) setadas para a casa do testador — **R. Cap. Olavo, 1111 - Aerolândia, Fortaleza–CE** (`lat -3.7719634`, `lon -38.5146187`, `cidade='Fortaleza'`) via service-role PATCH e persistidas em `scripts/seed.mjs` (reseed não reverte). `BARSEG`/Bar 2 segue sem coords (GEO_UNAVAILABLE).
> 2. **Runtime `/entrar`:** o fluxo de código puro derrubava o render no Next 16 ("revalidatePath … during render") porque `enterRoomByCodeAction` mutava **durante o render**. Corrigido: `/entrar` usa leitura (`getEntryPreviewAction`) no render e a entrada roda no client (`EnterRoomByCode`) via Server Action no mount — entrada automática mantida, aprovação do host intacta.
>
> **Revalidar** os itens de Fase 3.6 abaixo (notas também no `TESTING.md` §3.2/§3.6).

- [ ] **Fase 3.6 — código de sala configurável + entrada por código:** digitar `KARAOKE` no `/entrar` (anônimo ou ana/bruno) → entra **direto na sala sem mesa** → `MesaPicker` obrigatório dentro da sala → "Bar · Mesa N"; host troca o código no `RoomSettings` (colisão bloqueada; página redireciona para o novo código); QR de bar/mesa (`?bar=ZEHBAR&mesa=3`) mantém mesa pré-selecionada; criar novo bar com `codigo_entrada` customizado e com default derivado do nome.
- [ ] **OAuth por-host conecta e grava de verdade:** "Conectar com o Google" no `RoomSettings` → volta para o callback → bloco mostra **"conectado à conta Google · desde …"**; conferir 1 linha nova em `youtube_oauth_tokens` (Management API).
- [ ] **Busca com OAuth (sem 502):** `/salas/KARAOKE/buscar` retorna resultados com o token do host (Bearer) — nada de "Não foi possível buscar no YouTube agora".
- [ ] **Dono auto-aprovado:** com a sala em `queueApprovalMode=manual`, o dono pede uma música → status **`approved`** de primeira (trigger `queue_items_initial_status`).
- [ ] **Busca/adicionar de participante:** entrar com mesa + geo (ex. `ana@exemplo.com`) → busca ok e adiciona música respeitando o modo da sala (geo gate: celular precisa permitir localização).
- [ ] **Encerrar sala (só o dono):** botão "Encerrar sala" → confirm → sala `closed`, itens não tocados viram **`cancelled`**, **todos os `room_members` são deletados** (expulsos); quem era membro vê a tela "Esta sala foi encerrada"; tentativa de encerrar como não-host deve falhar (UI escondida + backend recusa).
- [ ] **Remover conexão:** "Remover conexão" revoga o token na Google e apaga a linha de `youtube_oauth_tokens`; a busca volta a cair para o OAuth do app → dev.
- [ ] **Uso normal da Fase 4 (regressão):** debounce, 429 com retry, cache hit (`cached: true`), quota friendly, presença física fora do raio bloqueando.

## Fase 5 — Fila: realtime, aprovação e confirmação

> A adição à fila (com `position` por advisory lock e status inicial por modo de aprovação) já é entregue na Fase 4; esta fase fecha o ecossistema da fila.

> **Escopo registrado (26/09) — implementação começa em 27/09 (blocos A–F):**
>
> 1. **Bloqueio de UI de aprovação:** o backend já suporta aprovar/rejeitar/remover (RLS `queue_items_update_host`/`delete_host` + triggers de status), mas **não existe UI nem action** — `QueueList` é read-only. Entra nesta fase: ações `setQueueItemStatusAction`/`removeQueueItemAction` (padrão `.select()` de validação RLS) + painel do host espelhando `PendingEntries`.
> 2. **Bloco A — host aprovar/rejeitar/remover** músicas (painel com Realtime por sala).
> 3. **Bloco B — modal `requireSongConfirmation`** (Dialog com thumbnail/título/duração antes do `addSongToQueueAction`; config já persistida no RoomSettings).
> 4. **Bloco C — reordenar (host): mover ⬆/⬇ por item E drag-and-drop (AMBOS decididos)** + remover; reescreve `position` no backend.
> 5. **Bloco D — trocar a própria música** mantendo posição/status: RPC `replace_queue_song` (`security definer`, regras D1–D3 em `docs/flows/fluxos-do-sistema.md` §5) + action + botão em itens `pending`/`approved` do autor/host.
> 6. **Bloco E — feedback visual:** mostrar "quem pediu" (join `added_by` × `profiles_public`) e distinguir `pendente de aprovação` vs `na fila` vs `tocando agora`.
> 7. **Bloco F — testes + docs:** unit/UI das actions e RPC; TESTING §3.5; TODO/CHANGELOG.
>    8.1. **Lote 1 entregue em 26/09 (Blocos A/B/E)** — ver lista de checkboxes abaixo. **Lote 2 entregue em 26/09 (Blocos C/D)**: `reorder_queue`/`replace_queue_song` (`security definer`, migrations 00025/00026) + `@dnd-kit` (core/sortable/modifiers/utilities como dependências de produção). **Features que ficaram de fora de propósito**: participante **não** cancela o próprio pedido (DELETE é host-only — exigiria policy nova), e o item **tocando** só sai pela ação de pular (Fase 6/7).
> 8. **Canal `room:{id}` (broadcast) fica para Fase 6/7** (player/controller); nesta fase a fila segue no `postgres_changes` por sala (`queue-{roomId}`, já isolado por `room_id=eq`).

> **Decisões fechadas com o PO (26/09) — Bloco C:**
>
> 1. **Drag-and-drop com `@dnd-kit`** (biblioteca especializada em DnD; `KeyboardSensor` + `PointerSensor`, handle só no item para não conflitar com o scroll vertical da lista). Instalada como dependência de produção no Bloco C — o fallback acessível continua sendo o mover ⬆/⬇, que não pode ser removido.
> 2. **Reordenar em uma só chamada atômica: RPC `reorder_queue`** (`security definer`, valida host + itens da mesma sala + faixa de posições e reescreve `position` com `row_number()`), no lugar de N updates client-side — evita estados intermediários inconsistentes e dispensa transação do browser. Segue o mesmo desenho das RPCs já entregues (`close_room`, `replace_queue_song`), com testes de RLS no checklist da fase.
> 3. **Contrato do payload fechada na implementação (26/09):** a RPC exige a **fila visível inteira** (`playing`+`approved`+`pending`) na ordem desejada. Motivo: `queue_items` não tem unique em `(room_id, position)`, então uma lista parcial criaria posições repetidas; a lista parcial vira o erro "fila desatualizada" (código `STALE_QUEUE`), que a UI trata com toast + refetch. O **advisory lock usa a mesma chave de `next_queue_position`**, fechando a corrida com insert. O item tocando é fixo e as pendentes vão para o fim, porque ainda não entram na ordem do host.

- [ ] Estados da fila e transições: `pending → approved → playing → played`; `rejected`, `skipped`; `cancelled` (terminal — dono encerra a sala, já entregue na Fase 4)
- [ ] `queueApprovalMode = auto`: entra direto na fila
- [x] `queueApprovalMode = manual`: entra como `pending` até host aprovar (**painel entregue em 26/09 — Bloco A**: bloco "Aguardando sua aprovação (N)" no topo do `QueueList`, com Aprovar/Rejeitar/Remover via `setQueueItemStatusAction`/`removeQueueItemAction`, escrita pelo client → RLS `queue_items_update_host`/`queue_items_delete_host` + `.select()` anti-no-op; regra pura `buildQueueModeration` com 18 unit)
- [x] `requireSongConfirmation = true`: modal de confirmação (Dialog) com thumbnail/título/duração antes de enviar à fila; só persiste após "Confirmar" (**Bloco B entregue em 26/09** — `SongConfirmDialog`; o flag deixou de ser decorativo: `/buscar` passa `requireSongConfirmation` ao `SongSearch` e só "Confirmar" chama `addSongToQueueAction`)
- [ ] Realtime da fila via canal `room:{id}` (especificamente por sala, nunca canal global) — **deferido p/ Fase 6/7**; nesta fase continua `postgres_changes` por sala
- [x] Painel de aprovação de fila (ações aprovar/rejeitar sem sair da tela principal) — Bloco A **entregue em 26/09** como seção do próprio card da fila (o host vê cada pendente uma vez só, sem lista duplicada; "Remover" também entrou aqui)
- [x] Reordenar e remover itens (host) — mover ⬆/⬇ **e drag-and-drop com `@dnd-kit` (ambos, decidido em 26/09)** e gravação em **uma RPC atômica `reorder_queue`** (`security definer`, `row_number()` reescrevendo `position`; nada de N updates client-side) — Bloco C **entregue em 26/09**: migration `20260926000025` (advisory lock na chave de `next_queue_position` + contrato "fila inteira"), `reorderQueueAction`, helpers puros `composeQueueOrder`/`moveQueueItem`/`reorderSchema`, `DndContext`/`SortableContext` só nas aprovadas (handle `⠿`, `PointerSensor` com `distance: 8`, `KeyboardSensor`, `restrictToVerticalAxis`) e ordem otimista com rollback + refetch; remover já tinha vindo no Bloco A
- [x] **Trocar a própria música mantendo a posição na fila** (RPC `replace_queue_song` — dashboard caso A; regras fechadas com o PO em `docs/flows/fluxos-do-sistema.md` §5/§5.2: quem troca = autor+host; status preservado; estados `pending`+`approved`) — Bloco D **entregue em 26/09**: migration `20260926000026` (UPDATE in place das colunas de conteúdo, `position`/`status` intocados, erro "esta música já saiu da fila" fora de `pending`/`approved`), `replaceQueueSongAction`, regra pura `buildQueueSongReplacement`, botão ↻ no `QueueList` (autor da música ou host) e `/salas/[codigo]/buscar?trocar=<itemId>` reutilizando `SongSearch`/`SongConfirmDialog` com confirmação **sempre** exigida no modo troca
- [x] Feedback visual claro por estado: `pendente de aprovação` vs `na fila` vs `tocando agora` (+ "quem pediu") — Bloco E **entregue em 26/09** (`queueStatusView` + badge por estado, destaque no item tocando, linha "4:05 · pedido por Ana" com "você" no próprio pedido; nome via `profiles_public` em 2ª query)
- [x] Indicador "quem está cantando agora" e "próximo da fila" sempre visíveis, mesmo rolando — no quiosque (Fase 6/7); **falta no painel do host**, que ainda mostra a fila em lista (pendência repetida na Fase 8a, para não virar esquecimento)

## Fase 6 — Player device (tela `/player/[codigo]`)

> **Entregue em 27/09 (vertical slice)**: rota pública com token de capacidade, player no estado do banco (`rooms.playback_status`/`current_item_id`/`current_item_started_at`/`player_token`), quiosque com auto-avanço, broadcast `player-{CODE}` + poll de 5s de fallback e o painel do host. Migrations `00027`/`00028` aplicadas no remoto e `scripts/smoke-playback.sql` verde nos 20 passos. **Ficou de fora de propósito**: pré-carregar o próximo vídeo, eventos `queueUpdated`/`reorder` no player (a TV relê por poll), e Playwright (continua adiado). **Ampliado na Fase 8a:** a rota deixou de ser só do token (participante/host entram pela sessão), a TV retoma sozinha quando acorda com a fila ociosa e a fila mutada avisa a TV por broadcast.

- [x] Rota pública (`/player/[codigo]` — código do **karaokê**) **sem login**, para navegador em modo quiosque (TV Box/Fire Stick/notebook via HDMI)
- [x] Integração YouTube IFrame Player API (lib/componente player)
- [x] Destrave de autoplay: primeira reprodução exige toque inicial (restrição de navegadores mobile)
- [x] Consumir eventos Realtime escopados por `roomId` (`play`, `pause`, `skip`, `queueUpdated`, `reorder`) manipulando o objeto do player já carregado, sem reload de página — `play`/`pause`/`skip`/`stop` por broadcast; `queueUpdated`/`reorder` caem no poll
- [ ] Pré-carregar o próximo vídeo enquanto o atual toca (transições sem tela preta/loading)
- [x] UI kiosk: vídeo ocupando a maior parte da tela, **sem overlays sobre o player** (restrição TOS YouTube)
- [x] Faixa lateral/inferior fixa com a fila: fonte grande/legível a distância, posição + título + quem pediu (sem thumbnails pequenas)
- [x] Destaque visual forte para a "próxima música"
- [x] Estado vazio: QR code grande do karaokê + "escaneie para adicionar uma música" (CTA em vez de tela em branco)
- [x] Estabilidade de sessão por horas: reconexão do canal Realtime, sem exigir refresh manual — poll de 5s cobre canal caído
- [x] Latência alvo < 2s entre ação no controller e reflexo na tela (broadcast; o poll é só o piso)
- [ ] Instalar/configurar Playwright (e2e) — player kiosk com YouTube IFrame Player API mockada (estratégia em `TESTING.md`)
- [x] Smoke HTTP da rota pública `/player/[codigo]` (sem sessão, modo quiosque) — o que dá para automatizar sem browser é o contrato do banco (`scripts/smoke-playback.sql`); o HTTP fica para o e2e

## Fase 7 — Controle de playback (host, pelo celular)

> **Entregue em 27/09 junto com a Fase 6** (o estado do player é o mesmo dado, então os dois blocos nasceram juntos). Autorização no banco (`set_playback` exige `auth.uid() = rooms.host_id`), não na UI.

- [x] Controles play/pause/skip/next no celular do host — card "Player da TV" em `/salas/[codigo]`, só para o host
- [x] Publicar eventos no canal `room:{id}` (play, pause, skip, next, reorder) — `player-{CODE}` com o evento `playback-changed`; `reorder` fica para quando o canal da fila existir
- [x] Sincronizar estado `playing`/item atual na fila (persistido na `room`/`queue_items`) — `rooms.playback_status` + `current_item_id`, invariante garantida por trigger
- [x] Controle do host sem tocar no dispositivo da TV
- [x] Link da TV com token de capacidade + "gerar novo link" (rotaciona e invalida o link antigo)

## Fase 8a — Fila/player consertados no uso real + acesso por sessão e pré-aprovação de 24h (2026-09-27)

> **Entregue em 27/09.** Esta fase não é "planejada": ela nasceu da validação manual das Fases 5–7 no navegador e no banco remoto. Três defeitos de uso real apareceram juntos (o painel do host não aprovava nada, a TV ficava parada depois de uma música, o participante não tinha porta para o player da própria sala) e um requisito novo do PO caiu no meio (pré-aprovação que valia para sempre). Migrations `00029`/`00030` aplicadas no Cloud, `npm test` (333) + typecheck + lint verdes, smoke verde (17 verificações).

> **Decisões fechadas com o PO (27/09):**
>
> 1. **Pré-aprovação de 24h para usuário autenticado, nunca para anônimo.** O comportamento herdado vinha do `on conflict` do `join_room`: o status antigo sobrevivia a qualquer reentrada, para sempre. Agora a janela nasce em `room_members.approved_at` e vale 24h; `current_user_is_anonymous()` (claim `is_anonymous` do JWT) zera a pré-aprovação para quem não tem conta, porque "aprovado pelo host" de anônimo não sobrevive a ninguém.
> 2. **Toggle `rooms.pre_approval_24h` default ON, e travado ON na UI.** O host **não** desliga: o item entra ligado, esmaecido e `disabled`, com cadeado e o texto explicando que sair da sala volta a exigir aprovação. O backend grava e respeita os dois valores (a action persiste junto com os outros toggles) — desligado ficou como caminho de teste/migração de dado legado, e foi assim que os smokes rodaram a matriz ON/OFF.
> 3. **Uma regra só, em um lugar:** `member_entry_state` decide o status efetivo; o `join_room` grava o que ela devolve e o app lê a mesma função (preview, tela de espera, página da sala). Regra duplicada em SQL e no client é o caminho para a pré-aprovação "voltar sozinha" na próxima mudança.
> 4. **Player com duas portas:** `p_token` = a TV (como antes, sem sessão); `p_token` nulo = **a sessão de quem está chamando** (`auth.uid()` dentro da função: host ou membro `approved`). Token errado não cai para a sessão, senão o quiosque deixaria de avisar que o link da TV morreu.
> 5. **Diagnóstico antes de conserto, sempre:** o botão vermelho ("não found") e a causa (`PGRST201` por `rooms.current_item_id`) estavam em camadas diferentes; `npm run diagnose:queue` ficou no repositório para o próximo bug de RPC/PostgREST. E o smoke novo é **autossuficiente** (cria e apaga o que usa), ao contrário do `smoke-playback.sql`, que exigia seed antes e depois.

- [x] **Corrigir o painel do host** — `PGRST201` (embed ambíguo depois da migration `00027`) via hint explícito da FK, com o erro real chegando ao `toast` em vez de "música não encontrada"
- [x] **Seed com uma música de verdade em `approved`** (a trigger de status inicial ignora o `approved` do `INSERT`)
- [x] **A TV retoma sozinha** quando acorda/recarrega com a sala ociosa e fila aprovada (`shouldClaimFromIdle`)
- [x] **A TV é avisada na hora** de aprovar/rejeitar/remover/reordenar (broadcast além do poll de 5s)
- [x] **Participante e host entram no player sem token** (`/player/<codigo>` por sessão; adicionar música redireciona para lá)
- [x] **Pré-aprovação de 24h** (`rooms.pre_approval_24h` + `room_members.approved_at` + trigger, backfill, `current_user_is_anonymous`, `member_entry_state`, `join_room` reescrito)
- [x] **Toggle travado ON no `RoomSettings`**, com a decisão acima registrada; outros toggles seguem mandando `true`
- [x] **Smoke autossuficiente** (`scripts/smoke-player-session.sql`, 17 verificações: token, sessão, `pending`/anônimo/não-membro/token errado, 23h × 25h × OFF, reaprovar não renova, limpeza) + `npm run diagnose:queue`
- [x] **Testes** — `queue-actions` (7), `entry-state` (5), `room-settings` (3) novos; `player-kiosk` 10 → 13, `song-search` 6 → 9, `playback` 20 → 24 → **333 testes** verdes
- [ ] **Player em browser de TV de verdade** (YouTube IFrame API real, autoplay, latência) — o smoke prova o contrato do banco, não a tela; continua dependendo de Playwright. **Parcialmente coberto em 27/09**: o player rodou no browser de dev, o que expôs e fechou o crash de prontidão (bloco logo abaixo) — falta a TV de verdade (som, tela do bar).
- [ ] **Pré-carregar o próximo vídeo** no quiosque (transição sem tela preta) — mesmo item pendente da Fase 6
- [ ] **Smoke HTTP** da rota pública `/player/[codigo]` (a página carregando, `noindex`, os dois caminhos de autorização) — depende de Playwright
- [ ] **"Tocando agora" e "próxima" fixos no painel do host** (hoje é lista, como já estava anotado na Fase 5)

### Fase 8a·bis — o player de verdade quebrou em browser (correção 27/09)

> **O que aconteceu:** abrir `/player/KARAOKE?token=…` no browser derrubou a tela com `player.loadVideoById is not a function` no primeiro approve. A causa era o `onReady` disparado logo após `new YT.Player(...)`: a IFrame API devolve um objeto **parcial**, e os métodos só existem depois do `onReady` do iframe (o handle documentado é o `event.target`). Os 333 testes passavam porque o **duplo** era mais permissivo que a API real. Diagnóstico antes de conserto, como na Fase 8a: teste vermelho com o duplo fiel primeiro, correção depois. `npm test` agora com **353 testes** (32 arquivos), typecheck e lint verdes; detalhe no `CHANGELOG.md` §Corrigido e lição 3.7 no `docs/engenharia/pos-mortem-smoke-playback.md`.

- [x] **Prontidão real no stage** — `onReady` só do evento real, player do `event.target`, e comando que chega antes fica **pendente** (última intenção, aplicada como `load → play/pause`); reaplicar o mesmo estado não recarrega a faixa
- [x] **Método ausente não é bug** — `canCall()` checa a existência antes de chamar (o player subindo não vira `TypeError`); erro de verdade sobe para o boundary
- [x] **Stage novo ≠ player antigo** — `stage.isPlayable()` substitui o booleano "pronto" do quiosque, que sobrevivia ao unmount e fazia a fila que voltava a ter música marcar a faixa como carregada sem player
- [x] **Probe de autoplay só quando o comando executa** (boot lento não abre "Toque para começar" à toa)
- [x] **Timeout de prontidão (8s)** — vira o aviso de "não foi possível tocar"; some se o player ficar pronto depois
- [x] **`PlayerErrorBoundary` acima do quiosque** — exceção na tela vira aviso + botão de recarregar, no lugar do overlay que matava a TV
- [x] **Duplo fiel da IFrame API** (`src/test/fake-youtube.ts`, compartilhado) + `youtube-stage.test.tsx` (13) e `player-error-boundary.test.tsx` (2) novos, `player-kiosk.test.tsx` 13 → 18
- [ ] **Confirmar em TV de verdade** (o que o browser não prova): autoplay com som, troca de faixa sem piscar preto, e o aviso de erro aparecendo na tela grande
- [ ] **Regra permanente:** API de terceiro no client entra com o duplo fiel ao contrato documentado, na mesma task do código — suíte verde não substitui browser real (checklist em `TESTING.md` §3.6)

### Fase 8b — 2º round de defeitos no uso real (2026-09-27)

> **O que aconteceu:** três defeitos achados testando a TV e o celular de verdade, **todos passando com 353 testes verdes**. (a) `Console NotFoundError` / `removeChild` ao trocar de fase: a IFrame API remove o iframe e o `destroy()` estava no cleanup do `useEffect`, que roda **depois** do React mexer no DOM — e o mesmo crash tinha **dois gatilhos** (fim da última música **e** o botão "Parar"), ambos montando o stage de novo. (b) "Toque para começar" reaparecia sozinho por cima do vídeo tocando: o probe era armado em todo `play()`, e o quiosque chama `play()` a cada leitura de estado (poll de 5s). (c) a lista do participante parava de atualizar: `postgres_changes` com filtro em `room_id` **não entrega `DELETE`** sem `replica identity full`, celular dormindo não reconecta sozinho, e ninguém avisava a sala além da TV. `npm test` agora com **379 testes** (32 arquivos), typecheck, lint e build verdes; lições em `docs/engenharia/pos-mortem-smoke-playback.md` §3.8–3.10.

- [x] **A — CTA não rearma sozinho** — probe só em `loadVideoById` real, `CUED`/buffering antes da faixa tocar a primeira vez, ou `play()` com gesto do usuário; CTA sai no `PLAYING` (`onPlaying`), não no clique; `youtube-stage.test.tsx` 13 → 20
- [x] **B — `destroy()` em cleanup de layout** (`useIsomorphicLayoutEffect` no stage) + `try/catch`; teste que prova que o `destroy()` roda **com o stage ainda no documento** (falha com o cleanup passivo: `expected false to be true`); `player-kiosk.test.tsx` 18 → 22
- [x] **C — lista do participante ao vivo** — `src/lib/rooms/room-channel.ts` (`room-queue-<CODE>`), broadcast em pedir/trocar/aprovar/rejeitar/remover/reordenar, Postgres Changes mantido, poll de 10s, relê em `visibilitychange`/`focus`/`online`, aviso não-vazio se a assinatura falhar
- [x] **D1 — participante tira o próprio pedido** — `buildQueueRemoval` com `userId` (autor remove `pending`/`approved` próprios, nunca `playing`; host remove o que vê) + policy `queue_items_delete_own` e `replica identity full` em `supabase/migrations/20260927000031_queue_author_delete.sql`
- [x] **`createClient()` dentro do `try`** nos dois canais (`room-channel`, `player-channel`) — aviso best-effort não pode virar erro na tela de quem acabou de gravar no banco (achado porque o teste da busca disparava `Unhandled Rejection` sem URL/chave de ambiente)
- [x] **Migração `20260927000031` aplicada no projeto Cloud** (`kskoipyzqcacccepcqpc`, sem `seed`) e conferida: `relreplident = 'f'` (full) em `queue_items` e `queue_items_delete_own` presente
- [ ] **Validar na TV + celular** conforme `TESTING.md` §3.9·ter (crash do "Parar", CTA por 60s, lista do participante, celular em background)
- [ ] **D2 — "Parar" segura a sala (decidido com o usuário):** coluna aditiva `rooms.playback_held` (`20260927000032_playback_hold.sql`), sem novo enum. Hoje `set_playback('stop')` deixa a sala `idle` e `shouldClaimFromIdle` **puxa a próxima sozinho**; com o hold, a TV fica no QR e nada entra em `playing` até o host apertar "Tocar". O crash já foi corrigido (B), a semântica é esta
- [ ] **Regra permanente:** cleanup que fala com API que remove o próprio DOM é `useLayoutEffect`; listar os gatilhos de desmontagem antes de fechar a task; efeito que reexecuta por poll precisa de teste com temporizador

### Fase 8b·bis — o link da TV é credencial, e o repo é público (2026-09-27)

> **O que aconteceu:** verificação de rotina perguntou se o token de player escrito nos testes (`const TOKEN = "3f2a9c1e-…"`) tinha sido exposto. O valor era **falso** — conferido no banco: 2 salas, nenhuma com aquele `player_token` — mas o repositório é **PÚBLICO** e a forma é idêntica à de um link real (`/player/<código>?token=…` lê o estado da sala e a fila sem login). Duas falhas de processo: (a) o literal estava digitado em 3 arquivos, sem nenhuma marca de "isto é fixture"; (b) a revisão confiou no argumento "é só teste". Lição em `docs/engenharia/pos-mortem-smoke-playback.md` §3.11.

- [x] **Fonte única de token falso** — `src/test/fake-player-token.ts` (`FAKE_PLAYER_TOKEN` e `FAKE_ROTATED_PLAYER_TOKEN`, valores obviamente artificiais); os 3 testes passaram a importar em vez de digitar, e o UUID antigo saiu do código
- [x] **Scanner no repositório** — `scripts/scan-secrets.mjs` + `npm run scan:secrets` (e `-- --staged`): falha em UUID fora de fixture, em `?token=<uuid>`/link de TV montado, em formato de chave conhecida (`sbp_`, `AIza`, `GOCSPX-`, chave privada) e em variável `*_KEY|SECRET|TOKEN|PASSWORD` com valor; aponta `arquivo:linha` e diz o que fazer. Validado com link de TV e chave `sbp_` **plantados** — ambos sinalizados
- [x] **Item no DoD e no checklist de segurança** do `TESTING.md`, mais a lição §3.11 e as regras no checklist do pós-mortem
- [ ] **Regra permanente (manual):** link da TV nunca vai para issue, chat, print ou doc. Se for, rotacionar na hora com "gerar novo link" do host (`rotate_player_token`, host-only) — apagar o texto **depois** do push não desfaz nada, o histórico é público
- [ ] **Ligar o scanner ao commit** (opcional, ainda não feito): `core.hooksPath` com `pre-commit` chamando `npm run scan:secrets -- --staged`, para o guarda não depender de lembrar

### Fase 8b·ter — contas do seed por env e cruzamento e-mail/senha ↔ GitHub (2026-09-28)

> **Por que:** o dono quer testar as salas semeadas no **remoto**, usando a mesma conta por **senha (local)** e por **GitHub (Vercel)** — sem habilitar o form de e-mail/senha em produção _para o dono_. O GitHub está com _"Keep my email addresses private"_ **ON**, então o auto-link por e-mail verificado não dispararia; o caminho é o **`linkIdentity` manual** (botão "Vincular GitHub"), que exige a config do projeto `security_manual_linking_enabled=true`. Alerta (transparência): ligar a flag amplia a superfície de ataque (advisory da Supabase sobre SSO/email) — aceito para o projeto de dev; desligar (ou migrar para projeto de staging) antes de qualquer uso real. A `senha123` pública **deixa de valer** no projeto Cloud: todas as contas ganham senha privada do `.env.local`/Vercel.

- [x] **Seed resolve usuários por ID fixo** (`scripts/seed.mjs`): e-mails/senha vêm de `SEED_HOST_EMAIL`/`SEED_HOST2_EMAIL`/`SEED_USER_EMAIL`/`SEED_USER2_EMAIL`/`SEED_PASSWORD` (defaults públicos em `.env.example` e README; valores pessoais no `.env.local`); senha **só na criação** (usuário existente mantém a rotacionada); nunca cria `dono@exemplo.com` órfão quando o dono usa outro e-mail
- [x] **Gate do form e-mail/senha** (`login/page.tsx`): `devLoginEnabled` = dev **ou** `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=1` — em produção OUT; a conta do dono entra por GitHub, as demais por senha privada
- [x] **Botão "Vincular GitHub"** no menu do usuário (`user-menu.tsx`): só para contas com identidade `email`, sem identidade `github`, não anônimas; chama `linkIdentity` com redirect para o callback existente (que troca o code — sem mudança na rota)
- [x] **`diagnose-queue-actions.mjs`** e **`smoke-player-session.sql`** lendo o host por `SEED_*`/id fixo (sobrevivem à renomeação dos e-mails)
- [x] **Scanner tolera `.env.example`** com default público (`SEED_PASSWORD=senha123` — regra `variavel-de-segredo-com-valor` ganhou `envExampleOk`)
- [x] **Aplicar no projeto Cloud** (`kskoipyzqcacccepcqpc`): `security_manual_linking_enabled=true` (Management API, chave plana) + rotacionar senha privada nas 4 contas (`sync:seed-users`) + renomear `dono …0001`→`multimalakoi@gmail.com`; betania **mantém** `betania@exemplo.com` (outlook reservado à conta GitHub `e3580e25…`); identidades `email` confirmadas nas 4 (GitHub só após "Vincular GitHub" manual)
- [ ] **Vercel:** envs = `.env.local` (mesmas vars) + `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=1`
- [ ] **Validar o cruzamento** (§3.1 TESTING): senha→dono→"Vincular GitHub"→sair→GitHub→mesma sala; form e-mail/senha na Vercel com as 4 contas e senha privada; `senha123` rejeitada no Cloud
- [ ] **Depois:** reavaliar `security_manual_linking_enabled` (desligar ou migrar para staging antes de uso real)

### Fase 8b·quater — papel `dev` (multi-bar/multi-sala) e a conta GitHub como dona canônica (2026-09-30)

> **Por que:** o dono do projeto quer privilégios **acima de qualquer host** — em especial criar quantas salas quiser, não só uma. E a conta que ele realmente usa (a que entra pelo GitHub na Vercel) era uma **conta sem nenhum dado de domínio**: o bar e a sala do seed pertenciam a um `dono@exemplo.com` órfão. Isto é: a conta que loga não era a dona de nada.

- [x] **Tirar o teto de 1 bar do dev** (`20260930000034`): `bars.host_id` perde o `UNIQUE` (o índice fica); `create_bar` passa a recusar 2º bar para quem não é dev
- [x] **Papel `dev` sem auto-promoção:** `public.dev_accounts` com RLS ligado e **zero policies** + `is_dev()` `security definer` — **não** coluna em `profiles`, que a policy `profiles_update_own` deixaria o usuário editar em si mesmo
- [x] **`create_room(p_bar_id, p_codigo)`:** nova RPC para mais uma sala no bar existente (antes não havia caminho nenhum), com `bars.host_id = auth.uid()` verificado **antes** de qualquer escrita
- [x] **Fechar o bypass da overload legada:** havia uma `create_bar` de **5 argumentos** (`20260923000014`), ainda executável por `authenticated` e **sem** a regra de 1 bar — atualizar só a de 9 deixava a de 5 como escada. Dropada; conferido por catálogo que sobrou **uma**
- [x] **Teto de salas preservado para os demais** (`20260930000035`): `create_room` tinha saído liberada para qualquer host, o que era **mais** do que o pedido (privilégio do dev ≠ multi-sala para todos). Quem não é dev continua com 1 bar = 1 karaokê, e a UI esconde o botão
- [x] **Dashboard multi-bar:** `maybeSingle<Bar>()` → lista (com 2+ bares a query antiga **errava**); badge `dev`, "Criar bar" e "Adicionar sala" só para dev; salas agrupadas por bar; `CreateRoomDialog` + `createRoomAction` + `createRoomSchema`
- [x] **"Definir senha" para conta OAuth** (`set-password-dialog.tsx`): usando `auth.updateUser` (o caminho documentado). **A Admin API funciona com `{ password }` isolado** — a nota anterior de que ela falha era de uma sonda com conta criada por SQL, que não representa conta OAuth real (ver 01/10). O item virou sempre disponível para conta não-anônima: o client **não** consegue saber se há senha (o hash fica em `auth.users.encrypted_password`), então gatear por identidade `email` era proxy falso nos dois sentidos
- [x] **Conta do dono como canônica:** env `SEED_HOST_USER_ID` faz o slot do dono (bar 1 + sala 1) ser dessa conta em vez do `…0001` fixo, e garante o `dev`. `sync-seed-users` não toca nessa conta e avisa se `SEED_HOST_EMAIL` não bater com o e-mail real
- [x] **Smoke `scripts/smoke-dev-role.sql`** (10/10 → **15/15**, `begin`/`rollback`): `is_dev()` por host, dev cria 2º bar e 3 salas, não-dev **recusado** em 2º bar e 2º karaokê, não-host recusado em bar alheio, **auto-promoção bloqueada por RLS** e `dev_accounts` invisível ao cliente (esses dois testes com `set local role authenticated` — o `postgres` da Management API tem `BYPASSRLS` e passaria verde com a policy furada)
- [x] **Aplicado no Cloud** `kskoipyzqcacccepcqpc`: `20260930000034` e `…035` via `apply-sql`; `npm run seed` rodado; bar 1 + sala 1 agora de `e3580e25…`, único dev
- [x] **Senha da conta canônica definida pela Admin API** (01/10): `PUT /auth/v1/admin/users/{id}` só com `{ password }`, **sem tocar em e-mail/metadata/identidades** → `200`. Provado por sign-in real (`grant_type=password`) e por `npm run diagnose:queue KARAOKE`, que antes falhava com `Invalid login credentials`. **É credencial local de teste**, não porta de login do produto: o login humano é OAuth-only e a recuperação é do GitHub/Google
- [x] **Bypass dos tetos fechado no BANCO** (`20260930000036`): as regras viviam só nas RPCs, e o RLS liberava `INSERT`/`UPDATE` direto em `bars`/`rooms` — um cliente autenticado criava 2º bar, 2ª sala, sala em bar alheio e re-apontava o `bar_id` da própria sala para o bar de outro. Reproduzido (com trigger desligado, tudo em rollback) e fechado com `BEFORE INSERT` em `bars`/`rooms` + `BEFORE UPDATE OF bar_id, host_id` em `rooms`. 5 casos no smoke (15/15) rodando o ataque **sem** passar por RPC
- [x] **`profiles.auth_provider` corrigido** (`20260930000037`): gravava `'email'` para todos porque `handle_new_user()` lia `raw_user_meta_data->>'provider'`, que o GoTrue não preenche no OAuth (o `provider` está em `raw_app_meta_data`) → função corrigida + backfill
- [x] **Vazamento de segredo corrigido** em `enable-manual-linking.mjs`: logava o corpo do `PATCH`, que é a config de Auth completa com `external_github_secret`/`external_google_secret`. **Os dois segredos ficaram expostos no output de uma sessão e precisam ser rotacionados**
- [x] **Conta órfã `…0001` apagada** (01/10) e `smoke-player-session.sql` deixou de depender dela (host vem de `public.bars where code = 'ZEHBAR'`); `inspect-users.mjs` passou a rotular o host por `SEED_HOST_USER_ID`
- [x] **Fase 8b·ter fechada:** `security_manual_linking_enabled` **desligado** no Cloud (o e-mail primário do GitHub agora é o outlook, verificado e igual ao `auth.users.email`, então o auto-link por e-mail funciona e a flag — que é rota de account takeover — só trazia risco). Botão "Vincular GitHub" atrás de `NEXT_PUBLIC_ENABLE_MANUAL_LINKING` (default `0`, fail-closed)
- [ ] **Vercel:** `SEED_HOST_EMAIL=cavalcanteprofissional@outlook.com` + `SEED_HOST_USER_ID` (se o seed rodar na Vercel) + `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=1` — a senha da conta já existe, então basta as envs
- [ ] **Rotacionar `external_github_secret` / `external_google_secret`** no projeto Supabase (expostos no output de `enable-manual-linking.mjs` antes da correção)

## Fase 8 — Não-funcionais, segurança, LGPD e polimento

- [x] Estratégia de testes documentada: `TESTING.md` (Vitest + RTL + MSW + Playwright, checklist funcional por fase, DoD)
- [x] **Advisor 0010 — `profiles_public` sem `security definer`** (2026-09-28): migration `20260928000033` virou a view para `security_invoker=true`, revogou o SELECT genérico de `anon`/`authenticated` em `profiles` e concedeu só `id/name/avatar_url` (`email` > permission denied pela API); policy `profiles_select_public` (`using true`) mantém o comportamento externo. Smoke `scripts/smoke-profiles-public.sql` valida por catálogo. **Aplicada e smoke verde no projeto Cloud (28/09).**
- [ ] Auditoria completa de RLS — isolar salas; threads/admin; host actions autorizadas no backend
- [ ] Rate limiting em rotas sensíveis (busca, entrada, ações de host)
- [ ] Validação de limites do free tier Supabase Realtime (mensagens/eventos por segundo, conexões simultâneas) — Firebase como plano B anotado
- [ ] Teste de concorrência: múltiplos usuários adicionando à fila ao mesmo tempo, sem posições duplicadas
- [ ] LGPD: política de retenção de dados + caminho de exclusão de conta/dados
- [ ] Rotina de limpeza de `played`/`rejected` antigos (agregar/arquivar)
- [ ] Polimento mobile: alvos de toque ≥ 44px, contraste adequado, tema escuro consistente (controller + tela)
- [ ] Latência realtime < 2s validada entre controller e tela

## Fases 9–15 — Experiência do participante, entrada remota e monetizeção (registrado 2026-09-25)

> **Planejamento apenas, nada implementado.** Elaboração completa (estado atual no código, modelo de dados, UI, testes e **decisões resolvidas (D1–D4, D11) e em aberto (D5–D10, D12–D14)**) em [`docs/produto/roadmap-experiencia.md`](./docs/produto/roadmap-experiencia.md). Ordem: Fase 9 → 10 → 11, e 12/13 dependem da Fase 6 (player) e 14 → 15.
>
> **Lacunas que estas fases fecham:** o gate de presença é binário e não persiste nada (`src/lib/bars/geo.ts:55`); `room_members` não tem coluna de presença/raio; a mesma regra bloqueia **entrada e pedido de música** (`queue.ts:85`, `youtube/service.ts:101`); a fila é por **sala** e `mesa_numero` não tem FK; o **player não existe** (Fase 6), então timer/minutagem dependem dele; e não existe nada de gamificação, pagamento ou pedido no bar.

### Fase 9 — Entrada fora do raio (toggle do host) + lista sinalizada

- [x] **Decidido com o PO (2026-09-25):** toggle **por sala**, e quem está fora **cai como `pending` e precisa da aprovação do dono** (D1, D2); a lista do dono mostra **distância em metros** + tag "fora do bar" + tipo de conta, com consentimento explícito (D4)
- [ ] Toggle "permite entrada de quem está fora do raio" no card de raio de presença (host), com aviso de que a pessoa entra **sem poder pedir música**
- [ ] **Link de convidado do dono** (além de QR e código): `rooms.link_convidado` com expiração/uso máximo (**D5**), botão "copiar link" e compartilhamento — Web Share API (cobre Instagram no mobile) + WhatsApp, Telegram, Facebook, X; sem URL web para Instagram feed/story (fallback: copiar link / `RoomQr` com o link impresso). O link **não** pula a aprovação
- [ ] Migration: coluna de permissão + `link_convidado` + `room_members.fora_do_raio` / `distancia_m` / `via_link_convidado` gravados no `join_room`
- [ ] `checkPresence` sai de booleano para **3 estados** (dentro / fora-permitido / fora-bloqueado) com erro `OUTSIDE_BAR_ALLOWED`
- [ ] Card "Fora do raio" **só para o host**: dados básicos + **distância em metros** + tag "fora do bar" + visitante sem login (anônimo) × usuário, com mesa, horário e estado (aguardando/aprovado); filtros por mesa/tipo
- [ ] Aviso de consentimento (finalidade + retenção) antes de concluir a entrada de quem está fora — LGPD
- [ ] Garantir por RLS/teste que participante **não** lê a marcação nem a distância alheia

### Fase 10 — Fora do raio vê a fila, mas não pede música

- [ ] Permissão única `canAskSong` (host, ou dentro do raio) aplicada em `addSongToQueueAction`, na rota de busca e nos botões
- [x] **Decidido (D3):** a **busca some** para quem está fora — ele vê só fila, player ao vivo e os agregados por mesa
- [ ] UI: "Você entrou como visitante: pode ouvir, não pode pedir" + CTA "Quero pedir música" (pede a localização)
- [ ] Matriz de testes por papel (host, dentro, fora, anônimo, pending) em action/rota/UI

### Fase 11 — Tela "Mesa": quem está comigo + as músicas da mesa

- [x] **Decidido com o PO (2026-09-25) — visibilidade em dois níveis (D3):** nível 1 = **agregado por mesa** para todo mundo na sala (quantas pessoas e quantas músicas por mesa, sem nomes); nível 2 = **somente quem está na mesma mesa** vê foto, nome e as músicas de cada um. Quem está fora do raio (aprovado) fica no nível 1 + fila/player ao vivo
- [ ] Nível 1: contagem de pessoas e de músicas pedidas **por mesa** (`room_members.mesa_numero` + `queue_items`), sem join de nome/avatar
- [ ] Nível 2: `room_members` da mesa + `queue_items` de quem pede nela (join em 2 níveis × **D9** desnormalizar `queue_items.mesa_numero`)
- [ ] Fila e player continuam **os da sala**, iguais para todas as mesas
- [ ] Privacidade: anônimo como "visitante" no detalhe da mesa, opt-in/apelido, denúncia/bloqueio (**D6**); tag de fora-do-raio e distância **só no painel do host**
- [ ] Teste de RLS/query provando que quem está no nível 1 não consegue ler nome/avatar da mesa alheia

### Fase 12 — Perfil de karaokê e check de som/microfone

- [ ] `profiles.karaoke_level` (1–5) + check-list de áudio ("som muito alto", "microfone muito baixo", eco, delay) com **sugestão acionável** por sintoma
- [ ] Teste de microfone no app (nível de entrada) como diagnosis, sem gravar áudio
- [ ] Sugerir músicas compatíveis com o nível da mesa

### Fase 13 — Tempo de música, teste grátis e alarme (depende da Fase 6)

- [ ] `queue_items.started_at/finished_at` (minutagem real) + contador diário por participante
- [ ] Modal/alarme com **quantas músicas faltam** + **minutagem restante** + aviso de fim do período grátis
- [ ] **Countdown de 30 s** "sua música é a próxima" → "é a sua agora"
- [ ] Alarme do dia nas **2 primeiras solicitações** de cada pessoa
- [ ] Ao estourar o limite: bloquear, sugerir plano ou última música grátis (**D7**)

### Fase 14 — Recompensas: dias consecutivos + música pedida por bar

- [ ] Streak de dias consecutivos + regra de quebra/congelador (**D8**)
- [ ] Contador **acumulado de músicas por bar** (fidelidade do bar) + contador da sessão
- [ ] Recompensa: badge, desconto no consumo do bar ou tempo extra de canto (**D10**)
- [ ] Ranking do bar (só host × placar da mesa) — opcional

### Fase 15 — Pagamento + pedido de comida/bebida via mesa (com o sistema do bar)

- [x] **Decidido (D11):** as opções (deep-link × API do PDV do bar × módulo nativo) serão avaliadas **diretamente com o bar** antes de escolher — nada implementado até lá
- [ ] Primeiro passo depois da conversa com o bar: botão "Pedir no bar" na tela da mesa apontando para o sistema que eles já usam
- [ ] Depois: integração via API do PDV do bar, ou módulo nativo `table_orders` (implica fiscal/nota)
- [ ] Pagamento: assinatura mensal do bar (Q6–Q9 do questionário) × pago pelo participante; provedor (**D12**)
- [ ] Comissão sobre bebidas: hipótese de pesquisa, não compromisso

## Roadmap (fora do MVP — documentado, não implementar agora)

- [ ] **Ciência de dados — segmentação sentimental dos ouvintes (PLN/letras):** camada híbrida (embeddings SBERT + léxicos/ML, circumplexo valence-arousal, letras via Genius com excertos curtos + metadados acústicos Spotify, HDBSCAN) que classifica o ouvinte — primeiro o perfil pessoal do dev (histórico YT Music real da §6), depois usuários da app com LGPD. **Nasce fora do repo e será extraída para o repo independente `karaoke-flow-data`.** Arquitetura e estado da arte: [`docs/ciencia-de-dados/segmentacao-sentimental.md`](./docs/ciencia-de-dados/segmentacao-sentimental.md) (decisões fechadas em 2026-09-22).
- [ ] OAuth X (Twitter) e Meta (Facebook) — iniciar app review com antecedência
- [ ] Catálogo pré-indexado de clássicos de karaokê (~500–1000 músicas) como fallback quando a cota de busca se esgotar
- [ ] Aumento de cota YouTube via auditoria Google Cloud + pool/rotação de chaves quando 10+ salas
- [ ] Escala 5.000 usuários: pausar/reconectar canais Realtime em background; verificar teto de conexões do free tier (Firebase como plano B)
- [ ] Hardware dedicado (Raspberry Pi/appliance) só se o modelo kiosk mostrar limitação real
