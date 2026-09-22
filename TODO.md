# TODO — Karaokê Watch Party (rebuild)

Plano de implementação faseado para reconstrução do projeto a partir da `karaoke-watch-party-spec.md`.

**Decisões técnicas assumidas:**

- Next.js 16 (App Router, TypeScript, Tailwind CSS) — deploy na Vercel
- shadcn/ui para componentes
- Zustand (estado client), react-hook-form + zod (forms/validação)
- Supabase (Postgres + Auth + Realtime) — free tier obrigatório
- Docs/UI em português

**Escopo:** MVP da spec (seções 1–14). Roadmap futuro (seção 15) documentado ao final, fora do MVP.

**Próximas etapas (plano fechado em 2026-09-21):**

1. ~~Tela 1 — Onboarding + consentimento LGPD + base i18n~~ (**entregue em 2026-09-21** — ver sub-bloco da Fase 2).
2. **Domínio bar/mesas/karaokês + acesso anônimo** (Fase 3.5) — novo modelo de dados (`bars`, `mesas`, `rooms.bar_id`), reseed, `/entrar`, criar bar, QR por karaokê/mesa, anônimo.
3. **Busca + fila end-to-end** (Fase 4) — rota de busca com cache/rate-limit/cadeia de credenciais, OAuth por-host e do app, `addSongToQueueAction` com a matriz de geolocalização e lista simples da fila.
4. ~~**Acabamento do MANIFEST v0.1 — §6 "Acerca das Belas Artes"**~~ (**entregue em 2026-09-22**): Google Takeout "YouTube and YouTube Music" (2 pedidos, 1 recebido) recebido; `ler-takeout.mjs` (fora do repo, `Temp\opencode\yt-music`) ajustado p/ nomes pt-BR + strip ` - Topic` e rodado → 8.216 eventos de escuta (2025→2026, sem Shorts/vídeo, 2.842 faixas); §6 do [`MANIFEST.md`](./MANIFEST.md) escrita com o retrato real (Florence + The Machine dominante, AURORA, década 2020); nota de instrução do autor e cartão do ouvido removidos, nota de rodapé aponta a etapa de ciência de dados; fonte no §8 e nota da spec §16/§17 atualizadas. Zip do Takeout isolado em `.local-data/takeout/` (gitignored, nunca versionado). *Pendência residual anotada:* análise cruzada (histórico × curtidas) fica para o futuro repo `karaoke-flow-data` (ciência de dados — ver `docs/ciencia-de-dados/segmentacao-sentimental.md`).

> A ampliação da **bateria de testes** acompanha as fases (ver seção "Plano de testes por fase" abaixo).

---

## Plano de testes por fase (ampliação da bateria)

> **Situação atual (2026-09-21):** Vitest + RTL + jsdom com **29 testes** (rooms/utils, i18n, consent cookies/geo, componente Onboarding). Smoke HTTP manual (anon/autenticado) e e2e ad-hoc de RLS da Fase 3. **Ainda não há** MSW, Playwright, testes de server actions nem cobertura de banco/RLS automatizada.
>
> Princípios: testar o que agrega (helpers de domínio e componentes críticos em unit; fluxos de usuário em e2e); manter a suíte rápida; RLS validada via smoke/e2e, não em unit.

- [ ] **Fase 3.5 (Etapa 2):** extrair regras de domínio de bar/mesa/karaokê (resolução mesa→karaokê, código de bar, payload de QRs) em funções puras e cobrir em unit; testes de componentes das telas novas (`/entrar` reescrito, criar bar, dashboard "meus bares"); smoke HTTP do fluxo de entrada (anon/autenticado, 1 karaokê vs N).
- [ ] **Fase 4 (Etapa 3):** adicionar **MSW** para mockar chamadas de rede — serviço de busca do YouTube (parse de itens, cadeia de credenciais host→app→dev, cache miss/hit, rate-limit) e `addSongToQueueAction` (validação via RLS mockada, matriz de geolocalização); unit da store de fila; smoke HTTP da rota `/salas/[codigo]/buscar` e de adicionar à fila.
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
> ⚠️ **OAuth client (2026-09-21):** o client **Web** (redirect `http://localhost:3000`) foi **deletado** no Google Cloud; o client atual é **Desktop app** (`555657479128-…googleusercontent.com`, loopback — para ferramentas dev e coleta do manifesto; JSON gitignored em `credentials/`). Para a **Fase 4 (OAuth por-host)** será preciso **recriar o client Web** (+ verificar tela de consentimento/test users).

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

- [ ] Configurar providers Google e GitHub no projeto Supabase (credenciais OAuth externas — ver README)
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

## Fase 3.5 — Domínio bar/mesas/karaokês + acesso anônimo

> **Revisão do modelo decidida com o PO (2026-09-21):** o host é **um bar**; o bar tem **mesas 0–999** (cadastro rico) e **1..N karaokês simultâneos** (default: 1 fila por bar). Cada karaokê = uma `room` (fila + player próprios). Entrar no bar → default 1 karaokê: **direto na fila única**; N karaokês: a pessoa escolhe a **mesa** por número (0–999) ou QR → mesa resolve o karaokê. A infra de consentimento LGPD (`consents`) já nasce na **Etapa 1 (Tela 1)** e é alimentada por ela.

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

## Fase 4 — Busca no YouTube + fila end-to-end

> **Escopo ampliado com o PO (2026-09-21):** além da busca, esta fase entrega a **adição à fila + lista simples da fila** (mutation com `position` por advisory lock e status inicial por modo de aprovação). Realtime completo, painel de aprovação do host, reordenar/remover e modal `requireSongConfirmation` ficam na Fase 5. A busca respeita a **matriz de permissão por geolocalização**.

- [ ] Rota de servidor `/api/youtube/search` — credencial injetada apenas no backend, **nunca no client**
- [ ] `safeSearch=strict` + `videoEmbeddable=true` no `search.list` (moderação + só vídeos embutíveis)
- [ ] Busca + `videos.list?part=contentDetails` (lote) para duração; resultados com thumbnail + título + duração
- [ ] Campo de busca único e persistente no topo da tela; resultados em lista mobile-first
- [ ] Botão "Adicionar à fila" grande (alvo de toque generoso, ambiente de bar)
- [ ] Debounce na busca (~500ms + AbortController contra corridas de request)
- [ ] `song_cache` compartilhado entre karaokês (query normalizada; reusar antes de chamar a API; TTL 7 dias)
- [ ] Rate limiting por usuário/IP na rota de busca (independente da cota do YouTube)
- [ ] Fallback amigável de cota esgotada ("tente novamente mais tarde", sem erro cru)
- [ ] Cadeia de credenciais: **OAuth do host → `rooms.youtubeApiKey` → OAuth do app → `YOUTUBE_API_KEY`** (dev, só quando setada)
- [ ] OAuth por-host: rotas authorize/callback + tabela `youtube_oauth_tokens` (user_id, refresh_token, atualizado_em; sem policies — só service role); script `scripts/youtube-app-oauth.mjs` (consent único do dev → `YOUTUBE_APP_REFRESH_TOKEN` no `.env.local`)
- [ ] Bloco "Conexão YouTube do host" no `RoomSettings` (conectar conta Google / colar key própria)
- [ ] **Registro p/ produção:** `YOUTUBE_API_KEY` do dev **não** entra na produção (produção = OAuth por-host + OAuth do app como default). Nota: `YOUTUBE_APP_REFRESH_TOKEN` (script) é **pré-requisito** do fallback do app — sem ele, produção depende só de OAuth por-host
- [ ] Server action `addSongToQueueAction`: insert em `queue_items` (position advisory lock, status por `queue_approval_mode`, `.select()` para validar RLS)
- [ ] **Matriz de geolocalização:** não-host sem geolocalização concedida **não pode adicionar música** (erro amigável + botão re-permitir), mantém view da fila/player ao vivo/thumbnail; host isento
- [ ] `/salas/[codigo]/buscar` (rota filha) + lista simples da fila na página da sala (atualiza ao adicionar)
- [ ] Instalar MSW + testes da rota/lib (sucesso, cota esgotada, 429, cache hit, credencial nunca no payload) e da `addSongToQueueAction` (geo gate, RLS)

## Fase 5 — Fila: realtime, aprovação e confirmação

> A adição à fila (com `position` por advisory lock e status inicial por modo de aprovação) já é entregue na Fase 4; esta fase fecha o ecossistema da fila.

- [ ] Estados da fila e transições: `pending → approved → playing → played`; `rejected`, `skipped`
- [ ] `queueApprovalMode = auto`: entra direto na fila
- [ ] `queueApprovalMode = manual`: entra como `pending` até host aprovar
- [ ] `requireSongConfirmation = true`: modal de confirmação (Dialog) com thumbnail/título/duração antes de enviar à fila; só persiste após "Confirmar"
- [ ] Realtime da fila via canal `room:{id}` (especificamente por sala, nunca canal global)
- [ ] Painel de aprovação de fila (drawer, ações aprovar/rejeitar sem sair da tela principal)
- [ ] Reordenar e remover itens (host)
- [ ] **Trocar a própria música mantendo a posição na fila** (RPC `replace_queue_song` — dashboard caso A; regras fechadas com o PO em `docs/flows/fluxos-do-sistema.md` §5/§5.2: quem troca = autor+host; status preservado; estados `pending`+`approved`)
- [ ] Feedback visual claro por estado: `pendente de aprovação` vs `na fila` vs `tocando agora`
- [ ] Indicador "quem está cantando agora" e "próximo da fila" sempre visíveis, mesmo rolando

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

## Roadmap (fora do MVP — documentado, não implementar agora)

- [ ] **Ciência de dados — segmentação sentimental dos ouvintes (PLN/letras):** camada híbrida (embeddings SBERT + léxicos/ML, circumplexo valence-arousal, letras via Genius com excertos curtos + metadados acústicos Spotify, HDBSCAN) que classifica o ouvinte — primeiro o perfil pessoal do dev (histórico YT Music real da §6), depois usuários da app com LGPD. **Nasce fora do repo e será extraída para o repo independente `karaoke-flow-data`.** Arquitetura e estado da arte: [`docs/ciencia-de-dados/segmentacao-sentimental.md`](./docs/ciencia-de-dados/segmentacao-sentimental.md) (decisões fechadas em 2026-09-22).
- [ ] OAuth X (Twitter) e Meta (Facebook) — iniciar app review com antecedência
- [ ] Catálogo pré-indexado de clássicos de karaokê (~500–1000 músicas) como fallback quando a cota de busca se esgotar
- [ ] Aumento de cota YouTube via auditoria Google Cloud + pool/rotação de chaves quando 10+ salas
- [ ] Escala 5.000 usuários: pausar/reconectar canais Realtime em background; verificar teto de conexões do free tier (Firebase como plano B)
- [ ] Hardware dedicado (Raspberry Pi/appliance) só se o modelo kiosk mostrar limitação real
