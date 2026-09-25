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

## Plano de testes por fase (ampliação da bateria)

> **Situação atual (2026-09-23):** Vitest + RTL + jsdom com **152 testes** (rooms/utils, `src/lib/bars/qr.test.ts` 16, i18n, consent cookies/geo, componente Onboarding, `src/lib/youtube/*` 31, `queue` matriçada, rota `/api/youtube/search` **18 via MSW** — incl. Bearer de OAuth host/app — e **roundtrip OAuth authorize→callback 4**). **MSW instalado** (mocka a YouTube Data API nas provas de rota). **Ainda não há** Playwright, testes de server actions nem cobertura de banco/RLS automatizada.
>
> Princípios: testar o que agrega (helpers de domínio e componentes críticos em unit; fluxos de usuário em e2e); manter a suíte rápida; RLS validada via smoke/e2e, não em unit.

- [x] **Fase 3.5 (Etapa 2):** regras de domínio de bar/mesa/karaokê (parse/extração/rotas de QR, token de entrada) extraídas em `src/lib/bars/qr.ts` e cobertas em unit (**16 testes**); smoke HTTP do fluxo de entrada (anon/autenticado, 1 karaokê) validado manualmente. **Ainda falta:** testes de componentes das telas novas (`/entrar` reescrito, `CreateBarDialog`, dashboard "meus bares").
- [x] **Fase 4 (Etapa 3):** **MSW** adicionado e mockando a YouTube Data API nas provas de rota — serviço de busca (parse de itens, cadeia de credenciais host→app→dev, cache miss/hit, rate-limit, geo gate, credencial fora do payload) e `addSongToQueueAction` (matriz de geolocalização unit). **Fica para a Fase 5:** unit da store de fila e smoke HTTP da rota `/salas/[codigo]/buscar`.
- [ ] **Fase 5:** testes de componentes do painel de aprovação/reorder da fila e do modal `requireSongConfirmation`; unit das actions de reorder/controle do player (fila vazia/pausada, dedupe).
- [ ] **Fase 6:** smoke HTTP da rota pública `/player/[codigo]` (sem sessão, modo quiosque).
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
- [ ] **Personalização do raio pelo host** (bloqueada nesta entrega): campo habilitado com validação 50–1000 m, preview do círculo em tempo real e persistência — o card já mostra o valor em vigor e o aviso de que a personalização chega depois (2026-09-25)
- [ ] **HUD/sprites animados sobre o mapa do raio** (2026-09-25): o `PresenceRadiusMap` deixa o wrapper relativo para receber camadas sobrepostas (sprites de círculo por metragem, HUD com o número). Decisão registrada: Google Maps Embed foi descartado por exigir API key + billing e não permitir círculo nem update in-place; Leaflet + OSM é o caminho, com a chave de API habilitada para o embed no futuro, se fizer sentido

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
> 8. **Canal `room:{id}` (broadcast) fica para Fase 6/7** (player/controller); nesta fase a fila segue no `postgres_changes` por sala (`queue-{roomId}`, já isolado por `room_id=eq`).

- [ ] Estados da fila e transições: `pending → approved → playing → played`; `rejected`, `skipped`; `cancelled` (terminal — dono encerra a sala, já entregue na Fase 4)
- [ ] `queueApprovalMode = auto`: entra direto na fila
- [ ] `queueApprovalMode = manual`: entra como `pending` até host aprovar (**painel de aprovação no Bloco A**)
- [ ] `requireSongConfirmation = true`: modal de confirmação (Dialog) com thumbnail/título/duração antes de enviar à fila; só persiste após "Confirmar" (Bloco B)
- [ ] Realtime da fila via canal `room:{id}` (especificamente por sala, nunca canal global) — **deferido p/ Fase 6/7**; nesta fase continua `postgres_changes` por sala
- [ ] Painel de aprovação de fila (drawer, ações aprovar/rejeitar sem sair da tela principal) — Bloco A
- [ ] Reordenar e remover itens (host) — mover ⬆/⬇ **e drag-and-drop (ambos)** — Bloco C
- [ ] **Trocar a própria música mantendo a posição na fila** (RPC `replace_queue_song` — dashboard caso A; regras fechadas com o PO em `docs/flows/fluxos-do-sistema.md` §5/§5.2: quem troca = autor+host; status preservado; estados `pending`+`approved`) — Bloco D
- [ ] Feedback visual claro por estado: `pendente de aprovação` vs `na fila` vs `tocando agora` (+ "quem pediu") — Bloco E
- [ ] Indicador "quem está cantando agora" e "próximo da fila" sempre visíveis, mesmo rolando — depende de playback (Fase 6/7)

## Fase 6 — Player device (tela `/player/[codigo]`)

- [ ] Rota pública (`/player/[codigo]` — código do **karaokê**) **sem login**, para navegador em modo quiosque (TV Box/Fire Stick/notebook via HDMI)
- [ ] Integração YouTube IFrame Player API (lib/componente player)
- [ ] Destrave de autoplay: primeira reprodução exige toque inicial (restrição de navegadores mobile)
- [ ] Consumir eventos Realtime escopados por `roomId` (`play`, `pause`, `skip`, `queueUpdated`, `reorder`) manipulando o objeto do player já carregado, sem reload de página
- [ ] Pré-carregar o próximo vídeo enquanto o atual toca (transições sem tela preta/loading)
- [ ] UI kiosk: vídeo ocupando a maior parte da tela, **sem overlays sobre o player** (restrição TOS YouTube)
- [ ] Faixa lateral/inferior fixa com a fila: fonte grande/legível a distância, posição + título + quem pediu (sem thumbnails pequenas)
- [ ] Destaque visual forte para a "próxima música"
- [ ] Estado vazio: QR code grande do karaokê + "escaneie para adicionar uma música" (CTA em vez de tela em branco)
- [ ] Estabilidade de sessão por horas: reconexão do canal Realtime, sem exigir refresh manual
- [ ] Latência alvo < 2s entre ação no controller e reflexo na tela
- [ ] Instalar/configurar Playwright (e2e) — player kiosk com YouTube IFrame Player API mockada (estratégia em `TESTING.md`)

## Fase 7 — Controle de playback (host, pelo celular)

- [ ] Controles play/pause/skip/next no celular do host
- [ ] Publicar eventos no canal `room:{id}` (play, pause, skip, next, reorder)
- [ ] Sincronizar estado `playing`/item atual na fila (persistido na `room`/`queue_items`)
- [ ] Controle do host sem tocar no dispositivo da TV

## Fase 8 — Não-funcionais, segurança, LGPD e polimento

- [x] Estratégia de testes documentada: `TESTING.md` (Vitest + RTL + MSW + Playwright, checklist funcional por fase, DoD)
- [ ] Auditoria completa de RLS — isolar salas; threads/admin; host actions autorizadas no backend
- [ ] Rate limiting em rotas sensíveis (busca, entrada, ações de host)
- [ ] Validação de limites do free tier Supabase Realtime (mensagens/eventos por segundo, conexões simultâneas) — Firebase como plano B anotado
- [ ] Teste de concorrência: múltiplos usuários adicionando à fila ao mesmo tempo, sem posições duplicadas
- [ ] LGPD: política de retenção de dados + caminho de exclusão de conta/dados
- [ ] Rotina de limpeza de `played`/`rejected` antigos (agregar/arquivar)
- [ ] Polimento mobile: alvos de toque ≥ 44px, contraste adequado, tema escuro consistente (controller + tela)
- [ ] Latência realtime < 2s validada entre controller e tela

## Fases 9–15 — Experiência do participante, entrada remota e monetizeção (registrado 2026-09-25)

> **Planejamento apenas, nada implementado.** Elaboração completa (estado atual no código, modelo de dados, UI, testes e **12 decisões em aberto D1–D12**) em [`docs/produto/roadmap-experiencia.md`](./docs/produto/roadmap-experiencia.md). Ordem: Fase 9 → 10 → 11, e 12/13 dependem da Fase 6 (player) e 14 → 15.
>
> **Lacunas que estas fases fecham:** o gate de presença é binário e não persiste nada (`src/lib/bars/geo.ts:55`); `room_members` não tem coluna de presença/raio; a mesma regra bloqueia **entrada e pedido de música** (`queue.ts:85`, `youtube/service.ts:101`); a fila é por **sala** e `mesa_numero` não tem FK; o **player não existe** (Fase 6), então timer/minutagem dependem dele; e não existe nada de gamificação, pagamento ou pedido no bar.

### Fase 9 — Entrada fora do raio (toggle do host) + lista sinalizada

- [ ] Toggle "permite entrada de quem está fora do raio" no card de raio de presença (host) — escopo sala × bar em aberto (**D2**); livre × aprovação individual (**D1**)
- [ ] Migration: coluna de permissão + `room_members.fora_do_raio` / `distancia_m` gravados no `join_room`
- [ ] `checkPresence` sai de booleano para **3 estados** (dentro / fora-permitido / fora-bloqueado) com erro `OUTSIDE_BAR_ALLOWED`
- [ ] Card "Fora do raio" **só para o host**: dados básicos + tag "fora do bar" + distinguindo visitante sem login (anônimo) × usuário, com mesa e horário; filtros por mesa/tipo (**D4**, **D5**)
- [ ] Garantir por RLS/teste que participante **não** lê a marcação alheia

### Fase 10 — Fora do raio vê a fila, mas não pede música

- [ ] Permissão única `canAskSong` (host, ou dentro do raio) aplicada em `addSongToQueueAction`, na rota de busca e nos botões
- [ ] Decidir se o **catálogo** fica navegável em somente leitura (**D3**)
- [ ] UI: "Você entrou como visitante: pode ouvir, não pode pedir" + CTA "Quero pedir música" (pede a localização)
- [ ] Matriz de testes por papel (host, dentro, fora, anônimo, pending) em action/rota/UI

### Fase 11 — Tela "Mesa": quem está comigo + as músicas da mesa

- [ ] Leitura por mesa: `room_members` por `mesa_numero` + `queue_items` de quem pede naquela mesa (join em 2 níveis × **D9** desnormalizar `mesa_numero` na fila)
- [ ] Fila e player continuam **os da sala**, iguais para todas as mesas
- [ ] Privacidade da mesa: opt-in/apelido, anônimo como "visitante", denúncia/bloqueio, tag de fora-do-raio **só no painel do host** (**D6**)

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

- [ ] Primeiro passo: **deep-link** para o sistema que o bar já usa, botão "Pedir no bar" na tela da mesa (**D11**)
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
