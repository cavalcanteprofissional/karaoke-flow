# Estratégia de Testes — Karaokê Watch Party

Documento que define como testamos o projeto, dividido em duas partes:

1. **Boas práticas e stack** — convenções para testes unitários, de integração e e2e.
2. **Etapas de testes funcionais** — checklist de verificação à parte do código, por fluxo de negócio.

> Status: **Vitest + RTL + jsdom** configurados; **MSW instalado na Fase 4**. **Etapa atual (2026-09-27):** suite com **308 testes** (rooms/utils + `deriveRoomCodeFromName`, `src/lib/bars/qr.test.ts` 21, i18n, cookies/geo, Onboarding, `src/lib/youtube/*` 31, `queue` com a matriz de presença, `src/lib/bars/schema.test.ts` 5 + `radiusTickStep`/`radiusTicks` em `geo.test.ts`, a rota `/api/youtube/search` com **18 provas via MSW** — incl. credencial OAuth via **Bearer** host/app — o **roundtrip authorize→callback** com 4 provas do estado, e a **entrada com aprovação**: `src/components/bars/entry-approval-wait.test.tsx` (11) + `src/components/bars/pending-entry-requests.test.tsx` (5) e `src/components/rooms/presence-gate-info.test.tsx` (14) e a **fila** (regras de aprovação/reordenação/troca em `src/lib/rooms/queue.test.ts` +50, `queue-list.test.tsx` 23, `song-search.test.tsx` 6 e `song-confirm-dialog.test.tsx` 9), e o **player** (`src/lib/rooms/playback.test.ts` 20 de regras puras, `player-kiosk.test.tsx` 10 com a **YouTube IFrame Player API mockada** disparando `onStateChange`/`onError`, e `playback-controls.test.tsx` 12 do painel do host)). O contrato do playback no banco remoto tem smoke próprio em `scripts/smoke-playback.sql`. Playwright (e2e) segue adiado para depois do MVP. Este arquivo deve ser atualizado conforme as ferramentas entrarem no projeto.
>
> **Nota de ambiente (2026-09-26):** o setup de teste (`src/test/setup.ts`) registra um **stub de `ResizeObserver`** — o jsdom não implementa a medição de elemento de que o Radix (Slider, Dialog, Popover) precisa para renderizar.

> **Ambiente Windows (2026-09-25):** `npm test` (pool `threads`) pode falhar na primeira execução com _"Timeout waiting for worker to respond"_; `npx vitest run --pool=forks --maxWorkers=1` roda a suite inteira sem flaky. Nenhuma configuração do repositório foi alterada por causa disso.

---

## 1. Stack adotada

| Camada            | Ferramenta                             | Quando usar                                                                                                |
| ----------------- | -------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Unit / Integração | **Vitest** + **React Testing Library** | Hooks, stores (Zustand), helpers, componentes, mutations de servidor                                       |
| Mock de redes     | **MSW** (Mock Service Worker)          | Simular YouTube Data API, Supabase REST/Realtime e rotas do app (nunca chamar serviços reais em teste)     |
| E2E               | **Playwright**                         | Fluxos completos no navegador (entrar na sala, adicionar música com o toggle de confirmação, player kiosk) |
| Cobertura         | `@vitest/coverage-v8`                  | Report de cobertura por fase; meta de referência: **≥80%** nas camadas críticas (fila, permissões, store)  |

Estrutura de arquivos (parte já criada na Fase 3; 😴 = pende de fases futuras):

```
src/
  __tests__/            # testes unitários/integração colados ao código ou centralizados
  mocks/                # handlers do MSW (youtube, supabase)
e2e/                    # testes Playwright (não entra em src/)
playwright.config.ts
vitest.config.ts
```

---

## 2. Boas práticas

### 2.1 Gerais

- **Nunca** disparar chamadas reais em teste unitário/integração — todo HTTP externo passa por **MSW**. Serviços não podem depender de cota (YouTube) nem de conectividade (Supabase).
- Testar **comportamento visível ao usuário**, não detalhes de implementação: use queries por papel (`getByRole`, `getByLabelText`), texto e `aria` — evite classes CSS e ids.
- **Tests must be deterministic**: sem `Math.random`, sem `Date.now` sem controle, sem timing flaky. Use `vi.setSystemTime`, `vi.useFakeTimers` quando precisar.
- Um **test file por unidade** (colocado ao lado do código, ex.: `useQueue.test.ts`) ou em `__tests__`.
- Nomenclatura em inglês nos testes (a comunidade/tooling usa inglês); **descrição de caso em pt-BR** quando fizer sentido para o domínio.
- Manter testes **rápidos** (< 1s por unidade, idealmente < 10s a suíte inteira de unit).

### 2.2 Unidade (Vitest + RTL)

- Priorizar o que **mais quebra**: `position` da fila, machine de estados (`pending → approved → playing → played`), lógica do toggle `requireSongConfirmation`, store de auth, rate limiting.
- Testar **estados de erro**: quota do YouTube esgotada, RLS negando escrita, token expirado.
- Para componentes que dependem de `next-themes`, `usePathname`, `useSearchParams`: renderizar dentro de wrappers de teste (criar helper `renderWithProviders`).
- Não testar bibliotecas de terceiros (Radix, YouTube Player API) — testar a **nossa lógica** ao redor delas (ex.: mokear `window.YT`).

### 2.3 Integração

- Combinar componente real + MSW para as rotas `insert`/`select` do Supabase (via client mockado) e `/api/youtube/search`.
- Validar **RQ em rede**: usuário não autenticado tentando escrever na fila → 401/RPC com erro de RLS. Mapear esses casos em teste.

### 2.4 E2E (Playwright)

- Testes em **navegador real**: Chromium dev; firefox/webkit também no CI.
- Para o **player kiosk** (`/player/[code]`), mockar a YouTube IFrame Player API — não dá pra confiar em vídeo real em teste.
- Usar estado autenticado via **setup de storageState** (login persistido) em vez de logar a cada teste.
- Rodar contra a **stack local** (dev server + Supabase local via `supabase start`), nunca contra produção/cota real.
- Testes e2e lentos: manter poucos mas de alto valor (regressão de fluxo, não de pixel).

### 2.5 Dados / Ambientes

- **Supabase Local** (`supabase start`) para e2e e desenvolvimento; **dev** compartilhado para smoke manual; **preview** e **prod** fechados para e2e.
- Variáveis de teste nunca devem conter chaves reais de cota (YouTube). Usar valores fake no `.env.test`.
- Seeds determinísticos por cenário (sala com `queueApprovalMode=manual`, sala com `requireSongConfirmation=true`, etc.).

---

## 3. Etapas de testes funcionais (à parte do sistema)

Checklist manual/funcional por fluxo, executado **antes de cada release**. Marque `[x]` conforme passar.

### 3.1 Autenticação (Fase 2)

- [ ] Login com Google funciona e cria `profile` automaticamente.
- [ ] Login com GitHub funciona.
- [ ] Logout limpa sessão e redireciona para `/`.
- [ ] Rota protegida redireciona para login quando não autenticado.
- [ ] Recarregar a página mantém a sessão (SSR + cookie).

### 3.2 Bares/mesas + acesso anônimo (Fase 3.5)

- [ ] "Continuar sem login" inicia sessão anônima e cai em `/entrar`.
- [ ] Anônimo escaneia QR do bar → preview com **escolha da mesa** → entra e vê a fila ("Bar · Mesa N").
- [ ] QR de mesa (`?bar=ZEHBAR&mesa=3`) entra já com a mesa selecionada.
- [ ] **Código de sala puro (`/entrar?code=KARAOKE` ou digitado) entra DIRETO na sala, sem mesa** — a mesa é escolhida **dentro da sala**, obrigatória para membro `approved` ainda sem mesa (`/salas/[codigo]` mostra o painel de escolha da mesa — badge "KARAOKE · ZEHBAR · N mesas"); se ainda `pending`, vê o aviso de espera da aprovação.
- [ ] **Código da sala é configurável pelo host (3–12 alfanuméricos)** no RoomSettings ("Código de entrada"): valida contra sala/bar (colisão bloqueada) e redireciona a página para o novo código.
- [ ] **Código default do bar = nome do bar normalizado** (`Karaokê do Zé` → `KARAOKEDOZE`, truncado em 12; fellback `KARAOKE` + sufixo `KARAOKE1`, `KARAOKE2`…) — aplicado ao criar bar e exibido como dica no formulário.
- [ ] Código legado de sala (`/entrar?code=ROOM`) continua entrando no karaokê de um bar.
- [ ] Criar bar (conta real) pede nome/cidade/endereço/quantidade de mesas; gera bar + mesas + karaokê único.
- [ ] **Anônimo não consegue criar bar** (botão oculto; chamada RPC rejeitada).
- [ ] Dashboard anônimo não aparece ao logado real; proxy desvia anônimo de `/`/`/login`/`/dashboard` → `/entrar`.
- [ ] Dashboard mostra "Meu bar" (código + mesas + badge de karaokê) e "Bares que frequento · N".
- [ ] Botão "Adicionar sala" aparece desabilitado (multi-sala fora do MVP).
- [ ] Página do karaokê mostra contexto "Bar · Mesa N"; host vê QR do bar + **botão "QR das mesas (N)"** abrindo modal com 1 QR por mesa centralizado (sem distorção) + download.
- [ ] `join_room` sem mesa (entrada por código) grava membro sem `mesa_numero`; `pick_mesa` valida a mesa (1..`quantidade_mesas`) e só funciona para membro `approved` de sala `active`.
- [ ] `join_room` com mesa: bar de 1 mesa usa a única; dano de mesa repetida/fora do range dá erro claro.
- [ ] `npm test` (Vitest) passa — inclui `src/lib/bars/qr.test.ts` (21 testes: parse/extração/rotas de QR + `codigo_entrada` no schema) e `src/lib/rooms/utils.test.ts` (`deriveRoomCodeFromName`, padrão 3–12).
- [ ] `npm test` (Vitest) passa — inclui também `src/components/bars/entry-approval-wait.test.tsx` (11 testes: espera, aprovação automática, rejeição, cleanup do canal, cancelar, cancelado × encerrada), `src/components/bars/pending-entry-requests.test.tsx` (5 testes: lista de pedidos e cancelar) e `src/components/rooms/presence-gate-info.test.tsx` (**14 testes**: aviso do gate nos dois modos, mapa com o raio, barra nos estados de espera/liberada/fora do raio, prévia sem gravar, autosave por debounce, snap no passo de 50 m, no-op quando volta ao valor em vigor, rollback + toast, restaurar padrão, bar sem coordenadas) — **198 testes** no total. Também `src/lib/bars/schema.test.ts` (5: bordas 50/1000, string do formulário, mensagens de limite, vazio/fracionário, default 500) e `radiusTickStep`/`radiusTicks` em `src/lib/bars/geo.test.ts` (5).
- [ ] **Raio de presença no painel do host (2026-09-25 → 26/09):** com o toggle "Entrada livre" **ligado**, o card "Raio de presença" diz que o gate bloqueia fora do raio configurado mesmo com entrada direta (e que o host nunca é bloqueado); o mapa mostra o círculo no endereço do bar; bar sem coordenadas mostra o aviso de que todo participante é bloqueado. Ligar/desligar o toggle troca o texto do aviso na hora.
- [ ] **Raio editável pelo host (2026-09-26, novo):** o campo aceita **50–1000 m** (input numérico + slider, passo 50) e **mexe o círculo do mapa antes de gravar**; soltar o slider, sair do campo, Enter ou a pausa de 500 ms grava e mostra "Salvo às HH:MM"; `49` e `1001` são recusados no campo **e** a RLS barra quem não é o dono (o card continua read-only para não-host); erro do banco devolve o valor anterior + toast; "Restaurar 500 m" volta ao padrão; os anéis/HUD aparecem com o passo rotulado e respeitam `prefers-reduced-motion`; o raio salvo vale para as salas do bar depois de um F5.

- [ ] **Fase 3.6 — entrada por código destravada no manual:** testador consegue entrar digitar `KARAOKE` no `/entrar` → cai direto na sala → escolhe a mesa (obrigatória, `MesaPicker`) → vê "Bar · Mesa N".

> **Pendência registrada (2026-09-24) — ✅ resolvida em 25/09 (runtime):** o fluxo de entrada por código **derrubava o render** com o erro do Next 16 "Route /entrar used revalidatePath /dashboard during render which is unsupported" — a antiga `enterRoomByCodeAction` rodava a mutação (`join_room` + `revalidatePath`) **durante o render**. **Resolução:** `/entrar` usa só leitura (`getEntryPreviewAction`) no render e a entrada passa por **`EnterRoomByCode`** (client), que chama `enterRoomByCodeAction` no mount via Server Action — entrada continua automática. Revalidar os itens manuais abaixo (a pendência de **presença física** ao lado também já estava resolvida).

> **Pendência registrada (2026-09-24) — ✅ resolvida em 25/09:** o testador foi **barrado pelo gate de presença física** ao validar a entrada (`kf-geo` × coords do bar ± `raio_permitido_metros` — Bar 1 `ZEHBAR` com coords do seed em SP). **Resolução:** coordenadas do Bar 1 (`ZEHBAR`) setadas para a localização real do testador — **R. Cap. Olavo, 1111 - Aerolândia, Fortaleza–CE** (`-3.7719634, -38.5146187`, `cidade='Fortaleza'`, `endereco` idêntico) via service-role PATCH e persistidas também em `scripts/seed.mjs` (reseed não reverte). `BARSEG`/Bar 2 continua **sem coords** (GEO_UNAVAILABLE) — por escolha, testes do Bar 2 ficam p/ depois ou exige coords próprias. **Revalidar** os itens manuais abaixo.

### 3.3 Salas — criar / entrar (Fase 3)

- [ ] Criar sala gera código de **6 caracteres únicos, não sequenciais**.
- [ ] QR code da sala abrange dados suficientes para entrar em 1 toque.
- [ ] Entrar via código digitado → entra direto com `entryMode=open`.
- [ ] Entrar via scan de QR → nome da sala aparece → confirma → entra.
- [ ] `entryMode=approval`: pedido de entrada fica `pending`; host aprova/rejeita pelo painel.
- [ ] **Tela de espera da aprovação (2026-09-25):** participante `pending` vê o card "Aguardando aprovação" (bar, código, mesa) **sem precisar recarregar** — ao aprovar no painel do host, a tela muda para "Entrada aprovada!" e ** cai sozinho na sala**; ao rejeitar, aparece "Tentar novamente" (novo pedido vai de `rejected` → `pending`); se o host **encerrar a sala**, vira "Esta sala foi encerrada". Vale nos 3 caminhos: QR de bar/mesa, `/entrar?code=` e link direto `/salas/<código>`.
- [ ] **Retomar o pedido depois de sair da tela (2026-09-25):** com o pedido `pending`, sair da espera (dashboard/outra aba) e voltar **pelo código, pelo QR ou pelo link "Acompanhar aprovação"** da lista (dashboard ou `/entrar` sem token) **cai na mesma tela de espera**, sem pedir entrada de novo e **sem passar por "Permitir localização"** (o gate não pode esconder um pedido em andamento).
- [ ] **Cancelar o pedido (2026-09-25):** "Cancelar pedido" na tela de espera (confirmação) apaga o pedido → volta ao preview do bar/sala, preservando a mesa quando veio do QR; o mesmo botão na lista do dashboard remove o item; se o cancelamento vier de outra aba, a espera mostra "Pedido cancelado" (não "sala encerrada").
- [ ] Sair da sala remove membro; **host encerra a sala**: a fila é **cancelada** (`cancelled`) e **todos são expulsos**; participantes veem tela de "sala encerrada"; não-host não consegue encerrar.
- [ ] **Reabrir sala**: host reabre sala encerrada pelo botão "Reabrir sala" (`reopen_room`); status volta ao `active`, participantes podem entrar de novo pelo código/QR; itens cancelados não são ressuscitados.
- [ ] Toggles persistidos recarregam corretos ao reentrar na sala.

### 3.4 Busca YouTube (Fase 4)

- [x] Busca com debounce (não dispara por tecla) — **500 ms + AbortController** (rota `/salas/[codigo]/buscar`).
- [x] `safeSearch=strict` aplicado (verificar no request) — **+ `videoEmbeddable=true`**.
- [x] Resultados com thumbnail + título + duração.
- [x] **Chave não aparece em nenhum request do client** (inspecionar DevTools → Network) — **teste MSW assegura** (chave fora do payload).
- [x] Quota esgotada → mensagem amigável "tente novamente mais tarde".
- [x] Rate limit por usuário/IP bloqueia spam de buscas — **429 + `Retry-After`**.
- [x] Cache compartilhado reusa resultados (2ª busca do mesmo termo **sem bater na Google** — `cached: true`).
- [x] **Gate de presença física na busca e na adição** (fora do raio / sem geo → bloqueado com CTA "Permitir localização"; host isento).
- [x] OAuth por-host: "Conectar com o Google" no RoomSettings grava `youtube_oauth_tokens`, vira a credencial da busca (**Bearer**) e o bloco passa a mostrar **"conectado à conta Google · desde …"**.
- [x] **Remover conexão** revoga o token na Google e apaga a linha; a busca cai para a próxima credencial da cadeia.
- [x] Busca usando OAuth (host/app) envia `Authorization: Bearer` e **nunca** `?key=` — **testes MSW** (host e app cobrem os dois caminhos).

### 3.5 Fila — adicionar música (Fase 5)

- [ ] `queueApprovalMode=auto`: música entra direto na fila.
- [ ] `queueApprovalMode=manual`: música entra `pending`; host aprova/rejeita.
- [ ] **Dono da sala** pedindo música entra **`approved` direto**, mesmo em `queueApprovalMode=manual` (trigger `queue_items_initial_status`).
- [ ] **`requireSongConfirmation=true`**: ao clicar "Adicionar à fila", abre modal com thumbnail + título + duração; "Cancelar" não adiciona; "Confirmar" adiciona.
- [ ] **`requireSongConfirmation=false`**: adiciona direto, sem modal.
- [ ] Toggle `requireSongConfirmation` presente na config da sala (host) e persistido.
- [ ] Concorrência: dois usuários adicionam ao mesmo tempo → posições distintas na fila (sem corrida).
- [ ] Estados visuais: `pendente` vs `na fila` vs `tocando` legíveis.
- [ ] Reordenação e remoção apenas pelo host (validação no backend, não só UI).
- [ ] **`npm test` (Vitest) passa** — inclui `src/lib/rooms/queue.test.ts` (+50 unit: aprovação, `composeQueueOrder`, `moveQueueItem`, `reorderSchema`, `buildQueueSongReplacement`), `src/components/rooms/queue-list.test.tsx` (23), `src/components/rooms/song-search.test.tsx` (6) e `src/components/rooms/song-confirm-dialog.test.tsx` (9) — **266 testes** no total.

**Fase 5, Bloco A/E — aprovação e estados (2026-09-26, manual):**

- [ ] Host em `/salas/[codigo]` com `queueApprovalMode=manual`: pedido de participante aparece no topo como **"Aguardando sua aprovação (1)"** (realtime, sem F5) e **também** na lista de baixo se o participante estiver em outra aba.
- [ ] **Aprovar** tira do bloco de pendentes e a música passa a "na fila"; **Rejeitar** some da fila dos dois lados; **Remover** apaga (com `✕` do participante sempre na lista).
- [ ] Segundo host/participante **não** vê os botões; a linha "4:05 · pedido por Ana" aparece para todos, e o próprio pedido diz "pedido por **você**".
- [ ] Item com `status=playing` ganha o badge **"tocando agora"** com destaque; `rejected`/`played`/`skipped`/`cancelled` não aparecem na fila viva.
- [ ] **RLS (a prova real, não automatizada):** com a sessão de um participante, `setQueueItemStatusAction`/`removeQueueItemAction` devem falhar com "Só o dono da sala pode…" (`RLS_BLOCKED`, `.select()` vazio) e a lista voltar ao estado anterior; o mesmo com o host de **outra** sala.
- [ ] Sala encerrada (`close_room`): a fila zera, o bloco de aprovação some e as actions recusam com "Esta música não está mais na fila" (itens viram `cancelled`).

**Fase 5, Bloco B — confirmação do vídeo (2026-09-26, manual):**

- [ ] `requireSongConfirmation=true`: "Adicionar à fila" abre o modal com **thumbnail, título e duração**; "Cancelar" (ou Esc) não adiciona; "Confirmar" adiciona e mostra o toast ("aguardando aprovação" ou "na fila").
- [ ] `requireSongConfirmation=false`: adiciona direto, sem modal.
- [ ] Ligar o toggle em Configurações muda o comportamento **na hora** (recarrega a página de busca ou reabre) — antes o flag não era lido em lugar nenhum.
- [ ] Música já adicionada mantém o botão desabilitado mesmo depois de passar pelo modal.

**Fase 5, Bloco C — reordenar a fila (2026-09-26, manual):**

- [ ] Host com 3+ aprovadas: **⬆/⬇** movem uma casa e a ordem persiste (recarregar a página mantém). A primeira não sobe e a última não desce.
- [ ] **Arrastar pelo punho ⠿** reordena igual às setas — e **rolar a página/lista com o dedo** na lista não dispara arrasto (`PointerSensor` com `distance: 8`).
- [ ] **Teclado:** o handle é focável, Espaço pega, setas movem, Espaço solta (o fallback ⬆/⬇ continua disponível para quem não usa drag).
- [ ] O item **"tocando agora"** fica fixo no topo e **não** tem setas nem handle; as **pendentes** ficam no bloco de aprovação e não são reordenáveis.
- [ ] Participante não vê setas, handle nem punho em nenhum item.
- [ ] **Fila desatualizada:** com duas abas do host, arrastar numa delas enquanto a outra aprova uma música → a que tentou mostra o aviso "A fila mudou enquanto você reordenava" e volta à ordem real (sem posições repetidas nem `NULL`).
- [ ] **RLS (a prova real, não automatizada):** com a sessão de um participante, `reorderQueueAction` precisa falhar ("Só o dono da sala pode reorder a fila"); o mesmo para o host de **outra** sala. Com a sessão do **autor de um item** (não host) chamando `replaceQueueSongAction` de item alheio, precisa falhar também.
- [ ] **Concorrência com insert:** com o player/participante adicionando enquanto o host reordena, nenhuma posição fica duplicada (o advisory lock cobre os dois lados).

**Fase 5, Bloco D — trocar a música da fila (2026-09-26, manual):**

- [ ] Botão **↻** aparece nos itens `pending`/`approved` que **eu** pedi — e em qualquer item quando eu sou o **host** (D1). Não aparece no que está tocando nem nos terminais (D3).
- [ ] Ao trocar em `/salas/[codigo]/buscar?trocar=<item>`: o texto diz que **posição e aprovação são mantidas**, a confirmação **aparece sempre** (mesmo com `requireSongConfirmation=false`) e "Cancelar" não grava nada.
- [ ] **D2:** trocar uma música já `approved` em sala `manual` **mantém** `approved` (não volta para o bloco de aprovação) e **mantém a posição** (não vai para o fim).
- [ ] A fila dos dois lados reflete o título/thumbnail novos pelo realtime, e o item **não** muda de `id` nem de `position` (nada de "tocando agora" quebrado).
- [ ] Item que já saiu da fila enquanto a pessoa buscava (ex.: o host pulou) → aviso "Esta música já saiu da fila" e **nada** muda.
- [ ] Quem chega em `?trocar=` de item alheio (participante) ou de item já tocando cai no fluxo normal de **pedir música**, sem tela morta.

### 3.6 Player device (Fase 6)

> **O que dá para automatizar sem browser (entregue):** o contrato do banco, com `scripts/smoke-playback.sql` rodando contra o remoto (20 passos, verde). Ele fixa as regras que o player consome: token inválido não abre nada, sala encerrada não avança, só `approved` entra em `playing`, o player não pula em pausa, o item que sai da fila deixa a sala `idle` e o link antigo morre na rotação. **Rodar:** `npm run seed` → `node scripts/apply-sql.mjs scripts/smoke-playback.sql 100000` → `npm run seed` (o smoke mexe nos dados). Os itens de browser ficam para o Playwright.

- [x] `/player/[code]` acessível **sem login** — e **com** token: link sem token ou com token velho mostra aviso, não player.
- [x] Primeira reprodução exige um toque (autoplay) — botão "Toque para começar" e aviso quando o player trava.
- [x] Eventos `play/pause/skip/queueUpdated/reorder` refletem na tela sem reload (< 2s) — `play/pause/skip/stop` por broadcast; `queueUpdated/reorder` por poll de 5s.
- [ ] Pré-carregamento do próximo vídeo (transição sem tela preta) — fora do escopo entregue.
- [x] Nenhum overlay sobre o player do YouTube (restrição da TOS).
- [x] Fila legível a distância, com destaque na "próxima música".
- [x] Estado vazio: QR grande + CTA "escaneie para adicionar uma música".
- [x] Sessão estável por horas (reconexão do Realtime automática) — o poll cobre canal caído; reconexão fina do canal ainda é do e2e.
- [ ] Smoke HTTP da rota pública (a página carregando, o `noindex`) — depende do Playwright.

### 3.7 Controle do host (Fase 7)

- [x] Play/pause/skip/next do celular refletem na tela (broadcast + poll de rede de segurança).
- [x] Estado `playing`/item atual persistem na sala (`rooms.playback_status`/`current_item_id`, com trigger de invariante).
- [x] Não-host não controla: `set_playback` devolve `false` e `rotate_player_token` não devolve token (provado no smoke e no smoke de participante).

### 3.8 Roteiro de teste manual — Fase 6/7 (TV + celular)

> Esta é a parte que **ninguém automatizou ainda**: o player real do YouTube num navegador de TV nunca rodou. O smoke garante o contrato do banco; o que falta é o browser.

**Antes de começar**

1. `npm run seed` **primeiro**. O seed recria as salas, e `rooms.player_token` é sorteado no insert — **qualquer link copiado antes do seed está morto** (a tela mostra "link não serve mais", que é o comportamento esperado, não bug).
2. Entre como host (`dono@exemplo.com` / `senha123`, ou o login de dev) e abra `/salas/KARAOKE`.
3. No card **"Player da TV"** (só host), clique em **"Abrir player na TV"** ou **"Copiar link"**. O link é `/player/KARAOKE?token=…` — token por sala, o mesmo link serve para quantas TVs quiserem.
4. Aprovete pelo menos **duas** músicas (o player só toca o que está `approved`), senão a TV fica no QR.

**Na TV**

- [ ] Abre sem login e sem erro de página; o vídeo ocupa a tela **sem nada por cima** (restrição de TOS).
- [ ] Na primeira vez aparece **"Toque para começar"** — é o autoplay com som sendo bloqueado, esperado em TV/celular.
- [ ] Toca a primeira aprovada e a faixa mostra "tocando agora" com **quem pediu**.
- [ ] A próxima música fica destacada logo abaixo.
- [ ] Ao acabar a faixa, **avança sozinha** para a próxima aprovada (não precisa tocar em nada).
- [ ] Chega na última e a sala fica parada (sem item tocando) em vez de recarregar a página.
- [ ] Deixa a TV ligada alguns minutos: o host mexendo no celular reflete **sem recarregar** a página (broadcast), e um celular com a tela apagada não para a TV (poll de 5s).

**No celular do host (com a TV aberta)**

- [ ] Pausar → a TV para; Retomar → **continua de onde parou** (o player do YouTube guarda a posição).
- [ ] Pular → a atual vira "pulada" e a próxima entra.
- [ ] Parar → a sala para; "Tocar" de novo entra na próxima aprovada que sobrou.
- [ ] Aprovar uma música nova pelo painel → ela aparece na TV em até ~5s (é o poll; o broadcast ainda não cobre `queueUpdated`).
- [ ] Reordenar a fila → a TV reflete em até ~5s (mesma razão).
- [ ] "Gerar novo link" → o link velho passa a mostrar aviso, e o novo funciona.
- [ ] participante no celular: **não** vê o card "Player da TV".

**Cuidados com o smoke** (e por que ele demora)

Cada execução é um round-trip ao Management API contra um banco cujo estado não é previsível, e o smoke mexe nos dados de verdade. Planeje a sequência inteira antes de rodar (quantos itens, o que cada passo deixa para o próximo) — o `DO` inteiro aborta no primeiro passo que levanta exceção, então um erro no meio faz o relatório inteiro sumir e custa um `seed` + uma aplicação para cada ajuste.

**Cuidados com o smoke**

`scripts/smoke-playback.sql` **mexe nos dados de verdade**: cria itens "Smoke 1..3" com vídeo falso, marca itens como `played`/`skipped` e apaga um. Rode `npm run seed` antes (ele precisa de uma sala com itens) e **de novo depois**. Para ver o relatório inteiro: `node scripts/apply-sql.mjs scripts/smoke-playback.sql 100000` (o segundo argumento é o limite de caracteres; o padrão 2000 corta o JSON).

**Limitações conhecidas (não são bug do teste manual)**

| Comportamento | Por quê |
|---|---|
| TV recarrega enquanto está **pausada** → música volta do zero | a âncora de tempo é zerada no pause de propósito (decisão P6 da migration `00027`); o cronômetro de verdade é da Fase 13 |
| Não pré-carrega a próxima faixa | fora do escopo entregue; pode dar um piscar preto na virada |
| Fila/reordenação chegam por poll de 5s, não por push | o canal do player cobre só `playback_status` |
| Uma TV mostrando aviso de link invalidado | é o token rotacionado; pegue o link novo no card do host |
| Vídeo que o YouTube não deixa embutir | erro 101/150 do player; a TV mostra o aviso de autoplay, mas vídeo bloqueado para embedding é caso do conteúdo da música |

### 3.9 Segurança / LGPD / NFR (Fase 8)

- [ ] RLS: participante aprovado de sala A **não** lê a fila da sala B (comprovar via API direta).
- [ ] Ações de host rejeitadas no backend quando chamadas por não-host.
- [ ] Rate limit nas rotas sensíveis.
- [ ] Caminho de exclusão de conta/dados funcionando.
- [ ] Larvas de limpeza de `played`/`rejected` antigos.
- [ ] Alvos de toque ≥ 44px no controller.
- [ ] Tema escuro consistente no controller e na tela.

> Este checklist cresce a cada fase; registre falhas em issues e nunca lance release com item do escopo pendente.

---

## 4. Definição de pronto (DoD)

Uma fase/feature só é considerada pronta quando:

- [ ] Lint + typecheck + build passam.
- [ ] Testes unitários/integração da feature existem e passam (Vitest).
- [ ] Fluxo validado manualmente conforme checklist funcional da fase.
- [ ] Casos RLS/segurança da feature têm cobertura (teste ou validação manual documentada).
- [ ] CHANGELOG atualizado com a mudança.
