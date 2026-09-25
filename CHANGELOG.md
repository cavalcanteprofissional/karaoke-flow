# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

**Versão atual:** `0.1.0` (em desenvolvimento — `main` ainda não recebeu tag de release).

## [Unreleased]

### Adicionado

- **Tela de espera da aprovação de entrada com avanço automático (2026-09-25):**
  - Novo componente compartilhado **`EntryApprovalWait`** (`src/components/bars/entry-approval-wait.tsx`) usado nos três pontos de entrada — `/entrar` por QR de bar/mesa (`EntryPreview`), `/entrar` por código (`EnterRoomByCode`) e `/salas/[codigo]` (`RoomPage`):
    - **pendente:** card com badge "Aguardando aprovação", nome do bar, código da sala, mesa e aviso de que a tela abre o karaokê sozinha;
    - **aprovado:** "Entrada aprovada!" + `router.replace('/salas/<código>')` + `router.refresh()` (na rota da sala, só `refresh`, que já está na URL certa);
    - **rejeitado:** "Tentar novamente" (reenvia o pedido — `join_room` volta `rejected` → `pending`) e "Voltar ao início";
    - **sala encerrada:** `close_room` apaga `room_members`, então a linha some → card "Esta sala foi encerrada".
  - **Atualização em tempo real:** subscription em `room_members` filtrada por `room_id` (RLS já libera a própria linha, e a tabela está no `supabase_realtime`) + **poll de 8 s** como rede de segurança; o canal é removido no unmount.
  - **`getEntryPreviewAction` agora devolve a membership do participante** (`status` + `mesa_numero`, novo tipo `EntryMembership`) e **`/entrar` não pede entrada de novo** para quem já tem `pending`/`rejected` na sala — o `EntryApprovalWait` assume a partir do status real, inclusive em `/salas` quando o participante chega pelo link direto (o unread de `rooms` por RLS escondia a sala). A página da sala também distingue "sala encerrada" de "link inválido" no fallback sem RLS.
  - **Testes:** `src/components/bars/entry-approval-wait.test.tsx` (4 testes: estado de espera, redirect automático na aprovação, retry na rejeição, limpeza do canal) — **`npm test` (163) passa**, junto com `npm run typecheck`, `npm run lint` e `npm run build`.

- **Pedido de entrada pendente recuperável e cancelável (2026-09-25):**
  - **Cancelar:** `cancelEntryRequestAction(roomId)` apaga a própria linha `room_members` **só quando `status = 'pending'`** (RLS `room_members_delete_self_or_host` já permite auto-delete; quem está `approved` continua usando `leaveRoomAction` para sair da sala). Botão "Cancelar pedido" na tela de espera, com confirmação (`window.confirm`) e volta ao **preview do bar/sala** — preservando a mesa quando a entrada veio do QR (`cancelHref` → `/entrar?bar=…&mesa=N`).
  - **Cancelado ≠ encerrado:** `getEntryRequestStateAction(roomCode)` consulta o servidor quando a linha some (cancelamento em outra aba, expulsão ou `close_room`, que apaga todos). Antes, cancelar aparecia como "Esta sala foi encerrada"; agora o participante `pending` não lê `rooms` por RLS, então o status da sala vem do client de service role (**somente leitura**, sem `youtube_api_key`).
  - **Retomar o pedido de qualquer página:**
    - `/entrar?code=…` passa a mostrar a **tela de espera antes do gate de presença** — antes, quem estava `pending` sem o cookie `kf-geo` caía no "Permitir localização";
    - `getMyEntryRequestsAction()` lista os pedidos `pending` do participante com bar, código da sala e mesa (a RLS de `rooms` esconde a sala de quem não está `approved`, então código/nome são resolvidos via service role, somente leitura);
    - `PendingEntryRequests` entra no `/entrar` **sem token** e no **dashboard**: "Acompanhar aprovação" navega para `/entrar?code=…` com `push` + `refresh` (não depende do Router Cache de uma URL já visitada antes do pedido existir) e "Cancelar" remove o pedido da lista.
  - **Testes:** 6 novos (cancelar após confirmar, não cancelar ao desistir, `cancelHref` do bar, erro amigável, cancelado × encerrado, lista com acompanhar/cancelar) — **`npm test` (174) passa**, com `npm run typecheck`, `npm run lint` e `npm run build`.

- **Código da sala configurável + entrada direta por código com mesa escolhida na sala (2026-09-24):**
  - **Migrations `20260924000021`/`20260924000022`** (aplicadas no projeto cloud via `node scripts/apply-sql.mjs`):
    - `00021` corrige a **ambiguidade de coluna** em `get_entry_preview` (ERROR 42702 `bar_id is ambiguous`) qualificando `public.rooms.bar_id`, `public.rooms.status` e `public.mesas.bar_id` no WHERE.
    - `00022`: constraint `rooms.code` → **3–12 alfanuméricos maiúsculos**; helpers RPC **`unique_room_code`**/**`default_room_code`**/**`room_code_available`** (security definer, checam colisão com `rooms.code` **e** `bars.code`); **`create_bar(p_codigo)`** com default = nome do bar normalizado (fallback `KARAOKE` + sufixo `KARAOKE1`, `KARAOKE2`…); **`join_room` com `p_mesa` opcional** (entrada por código entra sem mesa) — removida a exigência de "escolha uma mesa"; nova RPC **`pick_mesa`** (valida mesa em 1..`quantidade_mesas`, só membro `approved` de sala `active`); seed **`KARAOK` → `KARAOKE`**.
  - **Domínio:** `src/lib/rooms/utils.ts` (`ROOM_CODE_PATTERN` 3–12 + `deriveRoomCodeFromName`); `src/lib/bars/qr.ts` (padrão 3–12) + `schema.ts` (`codigo_entrada` opcional); `create_bar` passa `p_codigo` (dica do default no `CreateBarDialog`).
  - **UI:** `/entrar` distingue entrada **por QR de bar/mesa** (preview + mesa, como antes) de **código puro de sala** (`or code=KARAOKE`) → `enterRoomByCodeAction`, entra direto na sala (`join_room` sem mesa) com gate de presença; `/salas/[codigo]` mostra **mesa obrigatória dentro da sala** para membro `approved` ainda sem mesa (`MesaPicker` → `pick_mesa`) e aviso de "aguardando aprovação" para `pending`; `RoomSettings` ganha **"Código de entrada"** (`updateRoomCodeAction`: valida padrão + disponibilidade e redireciona para o novo código).
  - **Testes:** `src/lib/rooms/utils.test.ts` reescrito (padrão 3–12 + `deriveRoomCodeFromName`) e `src/lib/bars/qr.test.ts` (21 testes, incl. `codigo_entrada` no schema) — **`npm test` (159) passa.**

- **Reabrir sala encerrada + QR das mesas em modal (2026-09-24):**
  - **`reopen_room` RPC** (migration `20260924000020`, `security definer`, host-only) volta `rooms.status` para `active` — a fila cancelada permanece cancelada (terminal) e os membros expulsos reentram do zero; `get_entry_preview` volta a resolver o karaokê automaticamente.
  - `reopenRoomAction` (`src/lib/rooms/actions.ts`) + `CloseRoomButton` vira botão dual: **"Reabrir sala"** quando encerrada (`RotateCcw`), sem promessa falsa no texto de confirmação do encerramento.
  - **Dashboard** passa a contar **apenas salas ativas** ("N karaoké(s) ativo(s)") e, quando o bar só tem salas encerradas, exibe badge "encerrado — reabra pelo karaokê" apontando para a página da sala.
  - **QR das mesas em modal:** o grid da sala (que amassava/distorcia os QRs das mesas) sai da página e entra em um **`MesaQrDialog`** — botão "QR das mesas (N)" no card do bar, 1 QR por linha centralizado com download (`qr-mesa-N-CODE`).

- **Fase 3.5 — Domínio bar/mesas/karaokês + acesso anônimo (2026-09-23):**
  - **Migrations `20260923000010..14`** (aplicadas no projeto cloud `kskoipyzqcacccepcqpc` via `node scripts/apply-sql.mjs` — padrão do time, já que não há `SUPABASE_DB_PASSWORD` e `supabase db push` falha em auth):
    - `bars`: perfil-personificação do host (1:1, `host_id` único), `code` 6 chars (`generate_bar_code`, mesmo charset da sala), `quantidade_mesas` default 1 (1–999); RLS: SELECT qualquer autenticado (inclusive anônimo), escrita só do host (`is_bar_host`).
    - `mesas`: etiquetas do bar (`bar_id`, `numero` único por bar, `rotulo`); RLS: SELECT autenticado, escrita sem política (só via RPC).
    - `rooms_bar`: `rooms.bar_id` + migração backfill (bar auto-por-host das rooms existentes) + `room_members.mesa_numero`.
    - `entry_preview`: **`get_room_preview` dropada** → **`get_entry_preview(p_code, p_mesa)`** (aceita código de bar **ou** room legado; resolve o karaokê único ativo do bar; valida mesa quando informada); **`join_room(p_code, p_mesa)`** ganha mesa obrigatória (bar >1 mesa) e grava `mesa_numero`.
    - `create_bar(p_nome, p_cidade, p_endereco, p_quantidade_mesas, p_rotulos)`: criação **atômica** (bar + mesas 1..N + room única) via transação; recusa sessão **anônima** (`is_anonymous`) — host exige login real.
  - **Acesso anônimo:** anonymous sign-ins habilitados via Management API (`scripts/enable-anonymous-signins.mjs`, `AuthConfig.external_anonymous_users_enabled: true` confirmado) + `supabase/config.toml` (`enable_anonymous_sign_ins = true`); botão **"Continuar sem login"** no `/login` (`signInAnonymously` → `/entrar`); proxy desvia anônimo de `/`/`/login`/`/dashboard` para `/entrar`; `UserMenu` rotula "Visitante".
  - **Reseed** (`scripts/seed.mjs`): 4 usuários via Auth Admin API (novo **`betania`** como host do Bar 2 — `bars.host_id` é único 1:1), Bar 1 "Karaokê do Zé" (`ZEHBAR`, 12 mesas, sala `KARAOK` open/confirm/manual) e Bar 2 "Bar da Esquina" (`BARSEG`, 6 mesas, sala `BAR2FO` approval/auto), ana/bruno com `mesa_numero`, fila idempotente.
  - **UI:** `/entrar` reescrito (token bar/room → preview com **escolha da mesa** → `join_room(room_code, mesa)`; QR de mesa pré-seleciona; e-mail de host com nome do dono bloqueia redireciona direto à sala); `CreateBarDialog` substitui "Criar sala"; dashboard vira "Meu bar" + "Bares que frequento" (stats derivados por query) com botão **"Adicionar sala" desabilitado** (multi-sala fora do MVP); `/salas/[codigo]` mostra contexto **"Bar · Mesa N"** + card com QR do bar e QRs de cada mesa; `QrScanner` passou a aceitar `match` customizado (leitura de QR de mesa `?bar=ZEHBAR&mesa=3`).
  - **Domain lib:** `src/lib/bars/qr.ts` (parse/rota de token: bar/mesa/room legado; `extractEntryToken`; geradores de URL de QR), `schema.ts` (zod `createBarSchema` com coerce + `default(1)`), `actions.ts` (create_bar/get_entry_preview/join_room) e **16 testes unitários** (`qr.test.ts`) — `npm test` (45) passa.
  - **Docs:** spec §5, `docs/flows/*` (ERD/RLS/seed, ciclo do bar, entrada com mesa, anônimo), README, TESTING.md e TODO (checklist Fase 3.5) atualizados.

- **Camada de provedores de login ampliada (OAuth):**
  - `src/lib/auth/providers.ts` passa a listar **Spotify, GitHub, Google, Discord, Facebook e X** (config desacoplada); `provider-icons.tsx` ganha ícones SVG para Spotify, Discord, Facebook e X; `login-form.tsx` renderiza botões com estado **desabilitado ("em breve")** quando o provedor não tem credenciais funcionais.
  - **GitHub** configurado e ativo no Supabase (OAuth App `Karaoke Watch Party`); **Google** mantido; **Spotify** habilitado no Supabase mas com botão **desabilitado** na UI — a Web API exige **Spotify Premium** (a camada de autenticação do Spotify permanece construída, pronta para ativar quando a conta atender); Discord/Facebook/X prontos no código, aguardando apps OAuth externos + credenciais (app review necessário p/ Facebook e X em produção).
  - Credenciais espelhadas em `.env.local` (gitignored, **consulta apenas**) + placeholders no `.env.example`; README ganha tabela de provedores com status e links de criação; spec §8/§10/§15 e TODO Fase 2 atualizados.

- **MANIFEST v0.1 — §6 "Acerca das Belas Artes" concluída (2026-09-22):**
  - Google Takeout "YouTube and YouTube Music" recebido e processado pela ferramenta pessoal isolada `ler-takeout.mjs` (fora do repo, em `Temp\opencode\yt-music`) — ajustada nesta etapa para aceitar nomes de arquivo pt-BR (`histórico-de-visualização.json`) e limpar o sufixo ` - Topic` dos canais oficiais auto-gerados.
  - Sinal musical real extraído: **8.216 eventos de escuta** (2025→2026, sem Shorts/vídeo) sobre 48.200 entradas cruas, **2.842 faixas distintas**; top artista Florence + The Machine (1.716 ≈ 21%), segunda voz AURORA (818); década 2020 em 100% dos lançamentos; pico 2025-Q4 (2.112).
  - **`MANIFEST.md` §6** reescrita com o retrato íntimo baseado nos números reais; nota de rodapé aponta a etapa futura de ciência de dados; nota de instrução do autor e bloco "cartão do ouvido" removidos; **§8 Fontes** e nota de status da **spec §16/§17** atualizadas.
  - **Higiene de dados:** exportação do Takeout movida para `.local-data/takeout/` (`takeout-20260922-yt-music.zip`) e ignorada por `.gitignore` (`.local-data/`) — **nunca versionada**; outputs da ferramenta permanecem fora do repositório.
- **Registro de etapa futura de ciência de dados (roadmap):** doc `docs/ciencia-de-dados/segmentacao-sentimental.md` — camada PLN híbrida (embeddings SBERT + léxicos/ML) que classifica o ouvinte no circumplexo valence-arousal usando letras (Genius, excertos curtos) + metadados acústicos (Spotify); nasce neste repo, mas será extraída para o repo independente `karaoke-flow-data`; sujeito inicial = perfil pessoal do dev (extensível a usuários da app); HDBSCAN p/ clusters; registrada no `TODO.md` (Roadmap) e referenciada na §6/§8 do manifesto.

- **Requisito — presença física (geo gate, 2026-09-23):**
  - **Migration `20260923000015_bars_geo`:** `bars.latitude`/`longitude` (nullable, checks de faixa e paridade) + `raio_permitido_metros` (default **150**, 50–1000); `create_bar` recebe `p_latitude`, `p_longitude`, `p_raio_permitido_metros` (validações server-side); `get_entry_preview` retorna `bar_latitude`/`bar_longitude`/`bar_raio_permitido_metros` para o gate.
  - **Domínio geo:** `src/lib/bars/geo.ts` (haversine, `withinRadius`, `checkPresence` — regra pura, host isento; `geocodeAddress` via **Nominatim/OSM** gratuito, sem chave, com `fetchFn` injetável; arredondamento ~5 casas) e `src/lib/bars/presence.ts` (leitura server-side do cookie `kf-geo`). **23 testes** novos (`geo.test.ts`).
  - **Gate de entrada:** `getEntryPreviewAction` computa a presença do participante; `joinEntryAction` revalida no servidor antes do `join_room` (erro amigável + `geoRequired`); `EntryPreview` ganha banner de bloqueio com CTA **"Permitir localização"** (recaptura do GPS + refresh).
  - **Cadastro do bar:** `CreateBarDialog` + `createBarSchema` com **localização** (geocode pelo endereço, fallback **"usar minha localização atual"**) e campo **raio de presença** com hint explicando a finalidade (bloquear usuário remoto); schema zod com preprocess de coords vazias → `null` e refine de paridade.
  - **Questionário** (`questionario-donos-estabelecimento.md`): 15 → **18 perguntas** — **Q16** (endereço/cidade = localização física), **Q17** (nº médio de mesas), **Q18** (aceitação de exigir GPS para pedir música) + **nota de raio de presença**; "Como usar" atualizado.
  - **Docs:** spec §2.5 (geo vira **finalidade ativa**; consentimento mandatório p/ participação), §2.5.4 (requisito + análise + limitação honesta sobre spoofing), §3 e §13; TODO ganha o bloco "Requisito — presença física (geo gate)"; seed ganha coords do Bar 1 (`ZEHBAR`).

- **Fase 4 — Busca no YouTube + fila end-to-end (2026-09-23):**
  - **Lib** `src/lib/youtube/*`: `rate-limit` (janela deslizante em memória — 60/h por `ip:userId`), `cache` (query normalizada em bucket de palavras ordenadas, TTL 7 d, compartilhado entre karaokês), `errors` (`YouTubeApiError` + `toFriendlyYouTubeError` p/ cota/chave inválida), `app-oauth` (refresh do app + exchange do code por-host), `credentials` (cadeia **chave do bar → OAuth do host → OAuth do app → chave dev**), `search` (**`safeSearch=strict`** + **`videoEmbeddable=true`**, durações em lotes de 50 via `part=contentDetails`), `service` (`searchYouTubeForRoom` — orquestração testável com portas), `host-oauth` (refresh do token do host via service role) e `format` (duração). **31 testes** unit.
  - **`/api/youtube/search` (GET):** autenticado; cache `song_cache` (admin/service role); rate limit com `Retry-After`; credencial injetada **só no backend** (nunca no payload); códigos `UNAUTHENTICATED`/`ROOM_NOT_FOUND`/`NOT_MEMBER`/`PENDING`/`GEO_UNAVAILABLE`/`OUTSIDE_BAR`/`NO_CREDENTIAL`/`RATE_LIMITED`/`EMPTY_QUERY`/`API_ERROR` com fallback amigável de cota.
  - **`addSongToQueueAction`** (`src/lib/rooms/queue-actions.ts`): insert em `queue_items` com position por advisory lock, status por `queue_approval_mode` e **`.select()` para validar RLS host/membro**; lib `src/lib/rooms/queue.ts` com a **matriz de presença física** (`GEO_UNAVAILABLE`/`OUTSIDE_BAR`) + testes.
  - **UI busca:** rota filha `/salas/[codigo]/buscar` (server: auth → sala → membership → `requirePresence`), `SongSearch` (debounce 500 ms + **AbortController**, banner de geo com CTA "Permitir localização", "Adicionar à fila", thumbnails sem `<img>`), `QueueList` (SSR inicial + Realtime `postgres_changes` por sala) integrada a `/salas/[codigo]`.
  - **OAuth por-host (Bloco E):** rotas `/auth/youtube/authorize` (estado nonce via cookie `kf-yt-oauth`; `access_type=offline&prompt=consent`) e `/auth/youtube/callback` (exchange → `youtube_oauth_tokens` via service role); **migration `20260923000016_youtube_oauth_tokens`** (sem policies) aplicada no Cloud; `scripts/youtube-app-oauth.mjs` (coleta do `YOUTUBE_APP_REFRESH_TOKEN` do app via loopback); bloco **"Conexão YouTube do host"** no `RoomSettings` (chave própria + Conectar com Google) e `updateYoutubeKeyAction`.
  - **MSW** instalado (devDep) + **16 testes de rota** (`route.test.ts`): 401/404/PENDING, sucesso com chave do bar, **chave fora do payload**, cache miss→hit sem bater na Google, cota friendly 502, NO_CREDENTIAL, **429 + Retry-After**, geo gate in/out do raio, `GEO_UNAVAILABLE`, host isento.
  - **Realtime da fila:** migration `20260923000017_queue_items_realtime` adiciona `queue_items` à publication `supabase_realtime` (aplicada no Cloud; antes só `room_members` estava publicada) — `QueueList` agora recebe INSERT/UPDATE/DELETE ao vivo.
  - **Verificação:** lint/typecheck/build verdes e **146 testes** passando. **Pendências externas resolvidas em 2026-09-23:** client **Web** recriado no Google Cloud (`karaoke-flow-web`, redirects `http://localhost:3000/auth/youtube/callback` + `http://localhost:8891/`) e `YOUTUBE_OAUTH_CLIENT_ID/SECRET` apontando para ele (`credentials/oauth/oauth-dev-web.json`); **`YOUTUBE_APP_REFRESH_TOKEN` coletado** (conta dev) e gravado no `.env.local`.

- **Hardening da Fase 4 + encerramento de sala (2026-09-23):**
  - **OAuth por-host passa a gravar de verdade:** o `state` era duplo-encodado (`encodeURIComponent` + `URLSearchParams`) e o callback devolvia `state-mismatch` sem gravar nada — removido o encode extra + decodificação única; helpers de OAuth movidos para `src/app/auth/youtube/oauth.ts` (as rotas só exportam `GET`). Cookie do state `secure` **condicional** (seguro fora de localhost para permitir prod-mode local). **4 testes** de roundtrip authorize→callback.
  - **Busca passa a funcionar com OAuth (fix do 502):** `searchYouTube`/`fetchDurations` usam `Authorization: Bearer` para credenciais **app/host** e `?key=` para **room/dev** (antes o token OAuth era enviado como API key e a Google rejeitava → 502 amigável); `source` propagado da resolução até a chamada. **+2 testes MSW** na rota (Bearer host e app, key nunca vaza).
  - **UI "conectado":** `RoomSettings` passa a receber `youtubeConnectedAt` da página (service role) e mostra **"Conectado à conta Google · desde …"** com botão **"Remover conexão"** (revoga o refresh token em `oauth2.googleapis.com/revoke` e apaga a linha — `youtubeDisconnectAction`); link de conectar virou `<a>` (sem fallback RSC).
  - **Dono da sala é sempre auto-aprovado:** migration `20260923000018_queue_host_autoapprove` — `queue_items_initial_status` vira `approved` quando `added_by_user_id` é o host, mesmo em modo manual (música do dono não espera a própria aprovação).
  - **Encerrar sala = RPC `close_room`** (migration `20260923000019`, `security definer`, host-only): marca a sala `closed`, **cancela a fila inteira** (estado terminal novo `cancelled`) e **expulsa todos os membros**. Participantes de sala encerrada veem tela de encerramento; botão avisa o dono confirmando o impacto.
  - **Verificação:** **152 testes** passando (17 arquivos), typecheck/lint/build verdes; migrations 00018–00019 aplicadas no Cloud `kskoipyzqcacccepcqpc` e funções conferidas via Management API.

### Corrigido

- **`/entrar` derrubava o render com "Route /entrar used revalidatePath /dashboard during render which is unsupported" (2026-09-25):** `EnterPage` chamava `enterRoomByCodeAction` (que executa `join_room` **e** `revalidatePath("/dashboard")` + `revalidatePath("/entrar")`) **durante o render** — o Next 16 proíbe `revalidatePath` no render, e mutação como side-effect de render é anti-pattern (docs do próprio Next, `data-security` §"Avoiding side-effects during rendering"). O branch de **código puro de sala** (`?code=`) agora usa a action **read-only** `getEntryPreviewAction` no render (erro de código / host / sala encerrada / presença bloqueada viram UI estática, sem escrever no banco) e delega a entrada a um novo client component **`EnterRoomByCode`** (`src/components/bars/enter-room-by-code.tsx`), que dispara `enterRoomByCodeAction` **no mount via Server Action (POST)** — entrada continua automática (1 toque), com erro inline + "Tentar novamente" e `router.refresh()` no caso `geoRequired`. Aprovação do host intacta (regra do RPC `join_room`). Validação: typecheck, eslint, testes (159) e build verdes.
- **Entrada de participante quebrava com ERROR 42702 (`bar_id is ambiguous`)** em `get_entry_preview` quando o código digitado resolvia um bar: a RPC não qualificava as colunas de `rooms`/`mesas` no WHERE com o prefixo do schema (`public.`). Migration `20260924000021` qualifica os campos ambíguos (atribuições de `OUT` params ficam simples); smoke verificado via Management API (`get_entry_preview('ZEHBAR')`/`('BAR2FO')`/`('ZEHBAR', 3)` OK).
- **Diagramas Mermaid de `docs/flows/*` não renderizavam em parsers mais antigos (GitHub/previews):** texto de **aresta** (`-->|label|`) com vírgula/parênteses gerava "Parse error … got 'PS'"; `?` no **meio** de nó `{…}` (ex.: `{Tem sessão? (proxy)}`) quebrava a linha seguinte; ERD com relacionamento encadeado na mesma linha era rejeitado. Corrigido sanitizando os 3 arquivos (arestas só com palavras simples — `|anônimo|`, `|conta real|`, `|cantar|`, `|dono|` —, `?` apenas no fim do nó, relacionamento do ERD em linhas separadas, remoção de backticks/newline cru em labels). **Validação real:** `mermaid.parse` em **v10.9.8** (parser do GitHub/previews antigos) e **v11.17.2** — **26/26** diagramas OK nos 3 arquivos.
- **`README.md` reescrito** em formato amigável de projeto (visão, destaques, stack, arquitetura, quickstart, scripts, roadmap/estado, docs — incl. MANIFEST, TODO recente e versão do changelog).
- **Vitest não iniciava os workers (`npm test`):** o pool default `forks` esbarrava no espaço do caminho do workspace (`D:\BACK UP\...`) e travava com "Timeout waiting for worker to respond". `vitest.config.mts` agora usa `pool: "threads"` — `npm test` roda e passa (45/45).
- **`MANIFEST.md`:** cabeçalho de status removido (bloco "Status do documento / Fonte de verdade técnica / Validação de mercado") — continuação do cleanup da §6.

- **Docs/fluxos (`docs/flows/*`) alinhados ao estado real do MVP:** `banco-de-dados.md` corrigido (ERD passa a refletir as migrations de verdade — `song_cache` no lugar do inexistente `queue_cache`, colunas de `profiles` (`name`/`avatar_url`), entidade `consents` (migration `0009`) adicionada; §5 deixa de dizer "esquema atual" e marca a RPC `replace_queue_song` como **proposta da Fase 5**, já que a RPC ainda não existe). `fluxos-do-sistema.md` atualizado (cabeçalho "Fases 1–3 concluídas; Fase 3.5 em andamento", §2.2 passa a incluir a etapa real de preview `get_room_preview` antes do `join_room`, §2.1 não é mais "Proposta"). `README.md` e `TODO.md`/`CHANGELOG.md` com referências atualizadas (estado da doc de fluxos pós-Fase 3, cleanup textual das notas de instrução do MANIFEST §6).

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

- **Aprovação de música: rótulo corrigido + padrão passa a ser "com aprovação" (2026-09-25):** o toggle da fila nas configurações da sala, que se chamava "Música sem aprovação" porém com descrição "Cada música fica pendente até você aprovar." ao estar desligado, agora é **"Música com aprovação"** e o switch foi **invertido para refletir o rótulo** (`RoomSettings`: `checked` = `manual`; ON = com aprovação/pendente, OFF = `auto`/entra direto — mesmos modos e armazenamento `auto`/`manual`, funcionalidade preservada). Salas novas passam a nascer **com o toggle ligado**: migration `20260925000023` seta `rooms.queue_approval_mode` default `'manual'` (aplicada via Management API; default verificado `'manual'::text` e linhas existentes intactas — `KARAOKE` manual, `BAR2FO` auto).
- **Seed/dev — coords do Bar 1 movidas para a casa do testador (2026-09-25):** `ZEHBAR`/Karaokê do Zé agora aponta para **R. Cap. Olavo, 1111 - Aerolândia, Fortaleza–CE** (`latitude -3.7719634`, `longitude -38.5146187`, `cidade='Fortaleza'`) — aplicado via service-role PATCH no cloud e persistido em `scripts/seed.mjs` (reseed não reverte). Motivo: validar manualmente o fluxo de entrada (geo gate) de casa. `BARSEG`/Bar 2 permanece **sem coords** (GEO_UNAVAILABLE). TESTING.md §3.2 e TODO.md "Validação manual" marcados como resolvidos.

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
