# Estratégia de Testes — Karaokê Watch Party

Documento que define como testamos o projeto, dividido em duas partes:

1. **Boas práticas e stack** — convenções para testes unitários, de integração e e2e.
2. **Etapas de testes funcionais** — checklist de verificação à parte do código, por fluxo de negócio.

> Status: **Vitest + RTL + jsdom** configurados; **MSW instalado na Fase 4**. **Etapa atual (2026-09-30):** suite com **384 testes** (32 arquivos) — rooms/utils, `src/lib/bars/qr.test.ts` 20, i18n, cookies/geo, Onboarding, `src/lib/youtube/*` 55, `queue` com a matriz de presença e as regras de aprovação/reordenação/troca (39), `src/lib/bars/schema.test.ts` 10 (raio + `createRoomSchema` da Fase 8b·quater) + `radiusTickStep`/`radiusTicks` em `geo.test.ts`, a rota `/api/youtube/search` com **16 provas via MSW** — incl. credencial OAuth via **Bearer** host/app —, o **roundtrip authorize→callback** com 4 provas do estado, a **entrada com aprovação** (`entry-approval-wait` 10 + `pending-entry-requests` 5), o gate de presença (`presence-gate-info` 14), a **fila** (`queue-list` 23, `song-search` 9, `song-confirm-dialog` 9), o **player** (`playback` 24 de regras puras, `youtube-stage` 13, `player-error-boundary` 2, `player-kiosk` 18 com a **YouTube IFrame Player API mockada fiel ao ciclo de vida real** — métodos só depois do `onReady`, ver §3.6, `playback-controls` 12 do painel do host) e a **Fase 8a** (`queue-actions` 7, `entry-state` 5, `room-settings` 3). O contrato do playback e o da autorização por sessão/pré-aprovação de 24h têm smoke próprio no banco remoto (`scripts/smoke-playback.sql` e `scripts/smoke-player-session.sql`), e o papel `dev` tem o **`scripts/smoke-dev-role.sql`** (**15/15**, com os 5 casos de bypass do INSERT/UPDATE direto). Playwright (e2e) segue adiado para depois do MVP. Este arquivo deve ser atualizado conforme as ferramentas entrarem no projeto.
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
- [ ] **Login dev por e-mail/senha** em `npm run dev` entra com as contas do seed (e-mails de `SEED_HOST_*`/`SEED_USER_*`; senha = `SEED_PASSWORD` — defaults públicos documentados no `.env.example`/README, valores pessoais no `.env.local`).
- [ ] ~~**Cruzamento (uma conta, dois métodos)**~~ — **desativado em 01/10** (`security_manual_linking_enabled=false` + `NEXT_PUBLIC_ENABLE_MANUAL_LINKING=0`): com o e-mail primário do GitHub verificado e igual ao `auth.users.email`, o **auto-link por e-mail** cobre o caso sem o botão, e o `linkIdentity` é rota de account takeover. Se for religado de propósito: conferir em `auth.identities` as duas linhas (`email` **e** `github`) no mesmo `user_id` — o do dono é `SEED_HOST_USER_ID`.
- [ ] **Bypass dos tetos (o que a UI não prova):** logado como **não-dev** (Betânia), `INSERT` direto em `bars` e `rooms` pela Data API deve ser recusado, e `UPDATE rooms SET bar_id` para o bar de outro também — `curl` com a anon key e o JWT da sessão, não pela UI. O mesmo está automatizado em `scripts/smoke-dev-role.sql` (7a–7e).
- [ ] **Conta do dono sem vazar para a tela:** `auth.users.email` = `cavalcanteprofessional@outlook.com`; `auth.identities` com **1** linha (`github`) e `identity_data.email` verificado e igual ao da conta (2º login seguido do 1º precisa continuar igual — é o que prova que o auto-link por e-mail funciona). `profiles.auth_provider` = `github` (não `email`).
- [ ] **Sair e entrar com GitHub** (na Vercel ou local) → cai nas **mesmas** salas de dev (mesmo id do passo anterior, o host do `KARAOKE`).
- [ ] **Form e-mail/senha em produção:** só aparece com `NEXT_PUBLIC_ENABLE_EMAIL_LOGIN=1`; com a flag desligada, o `/login` da Vercel não mostra a seção "Acesso de desenvolvimento" e o GitHub continua entrando normalmente.
- [ ] **`senha123` pública deixa de funcionar** no projeto Cloud depois da rotação de 28/09 — valem as credenciais do `.env.local`/Vercel (se algum login remoto usar a senha padrão, é bug).

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

- [x] `/player/[code]` acessível **sem login** pela porta do token (a TV); **sem token** também abre para quem está logado e é host ou membro aprovado (Fase 8a) — link com token velho mostra aviso e **não** cai para a sessão.
- [x] Primeira reprodução exige um toque (autoplay) — botão "Toque para começar" e aviso quando o player trava.
- [x] Eventos `play/pause/skip/queueUpdated/reorder` refletem na tela sem reload (< 2s) — `play/pause/skip/stop` por broadcast; `queueUpdated/reorder` por poll de 5s.
- [ ] Pré-carregamento do próximo vídeo (transição sem tela preta) — fora do escopo entregue.
- [x] Nenhum overlay sobre o player do YouTube (restrição da TOS).
- [x] Fila legível a distância, com destaque na "próxima música".
- [x] Estado vazio: QR grande + CTA "escaneie para adicionar uma música".
- [x] Sessão estável por horas (reconexão do Realtime automática) — o poll cobre canal caído; reconexão fina do canal ainda é do e2e.
- [ ] Smoke HTTP da rota pública (a página carregando, o `noindex`) — depende do Playwright.

> **Correção de 27/09 — o player de verdade quebrou e a suíte não viu (leitura obrigatória):** abrir `/player/KARAOKE?token=…` no browser derrubou a tela com `player.loadVideoById is not a function` no primeiro approve. A IFrame API devolve do construtor um objeto **parcial** — os métodos só existem depois do `onReady` do iframe, e o handle documentado é o `event.target` —, enquanto o componente (e o **duplo de teste**) acreditavam que a instância já estava pronta. **Regra permanente:** API de terceiro no client entra com o duplo fiel ao contrato documentado, **na mesma task do código**; um duplo que antecipa o ciclo de vida da dependência aprova código que não roda.
>
> - O duplo agora é `src/test/fake-youtube.ts`, compartilhado pelo stage e pelo quiosque: a instância do construtor **não tem métodos**, e o teste dispara o `onReady` como o iframe faria.
> - `player-kiosk.test.tsx` chama `fireReady()` num lugar só (`renderKiosk`) — **não** em cada teste. Todo cenário novo que precisar do player já pronto usa `renderKiosk(state)`; o que precisa do player ainda subindo usa `renderKiosk(state, { ready: false })`.
> - Coberto agora: primeira música do boot, avanço do host com o player subindo (toca a nova, não a velha), fila esgota e volta a tocar, boot lento virando aviso, `onEnded`, 150 vs. erro, unmount antes/depois do ready (`youtube-stage` 13, `player-kiosk` 18, `player-error-boundary` 2).
> - O que segue valendo: **suíte verde não substitui browser real**, e browser não substitui TV (som, tela do bar) — item aberto no `TODO.md`.

### 3.7 Controle do host (Fase 7)

- [x] Play/pause/skip/next do celular refletem na tela (broadcast + poll de rede de segurança).
- [x] Estado `playing`/item atual persistem na sala (`rooms.playback_status`/`current_item_id`, com trigger de invariante).
- [x] Não-host não controla: `set_playback` devolve `false` e `rotate_player_token` não devolve token (provado no smoke e no smoke de participante).

### 3.8 Roteiro de teste manual — Fase 6/7 (TV + celular)

> Esta é a parte que **ninguém automatizou ainda**: o player real do YouTube num navegador de TV nunca rodou. O smoke garante o contrato do banco; o que falta é o browser.

**Antes de começar**

1. `npm run seed` **primeiro**. O seed recria as salas, e `rooms.player_token` é sorteado no insert — **qualquer link copiado antes do seed está morto** (a tela mostra "link não serve mais", que é o comportamento esperado, não bug).
2. Entre como host — via o form **"Acesso de desenvolvimento"** (`dono@exemplo.com`/`senha123` no default; **no projeto Cloud valem as credenciais do `.env.local`/Vercel**, ver §3.1) — e abra `/salas/KARAOKE`.
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
- [ ] Aprovar uma música nova pelo painel → ela aparece na TV **sem esperar os 5s** (broadcast, desde a Fase 8a).
- [ ] Reordenar a fila → a TV reflete em até ~5s (o canal do player cobre só `playback_status`; reordenar chega pelo poll).
- [ ] "Gerar novo link" → o link velho passa a mostrar aviso, e o novo funciona.
- [ ] participante no celular: **não** vê o card "Player da TV".

**No celular do participante (Fase 8a — o caminho que faltava)**

- [ ] Adicionar música leva direto para o **player da própria sala** (sem token, sem link da TV) — a fila e o que está tocando aparecem.
- [ ] Recarregar essa URL continua abrindo (a autorização é a **sessão**, não o token) — e um logout derruba para o aviso de "não autorizado".
- [ ] Membro com o pedido ainda **pendente** recebe aviso, não o player; aprovado pelo host passa a abrir.
- [ ] Com a TV fechada: adicionar duas músicas e deixar a sala ociosa → o player do celular **toca a primeira sozinho** (claim com a sala ociosa).
- [ ] O link da TV (`?token=…`) continua abrindo **sem login nenhum**, e um token velho não "volta" para a sessão de quem está logado no mesmo navegador.
- [ ] Entrar, sair e voltar em menos de 24h **sem o host tocar em nada** → entra aprovado (pré-aprovação); **sair** e voltar → pede aprovação de novo.

**Cuidados com o smoke** (e por que ele demora)

Cada execução é um round-trip ao Management API contra um banco cujo estado não é previsível, e o smoke mexe nos dados de verdade. Planeje a sequência inteira antes de rodar (quantos itens, o que cada passo deixa para o próximo) — o `DO` inteiro aborta no primeiro passo que levanta exceção, então um erro no meio faz o relatório inteiro sumir e custa um `seed` + uma aplicação para cada ajuste.

> As armadilhas concreteadas nesse loop (ordem de avaliação de `jsonb_build_object`, `DO` que aborta inteiro, saída truncada do `apply-sql.mjs`, estado não previsível do banco de dev, material insuficiente) e o checklist do próximo smoke estão em [`docs/engenharia/pos-mortem-smoke-playback.md`](./docs/engenharia/pos-mortem-smoke-playback.md).

**Cuidados com o smoke**

`scripts/smoke-playback.sql` **mexe nos dados de verdade**: cria itens "Smoke 1..3" com vídeo falso, marca itens como `played`/`skipped` e apaga um. Rode `npm run seed` antes (ele precisa de uma sala com itens) e **de novo depois**. Para ver o relatório inteiro: `node scripts/apply-sql.mjs scripts/smoke-playback.sql 100000` (o segundo argumento é o limite de caracteres; o padrão 2000 corta o JSON).

**Limitações conhecidas (não são bug do teste manual)**

| Comportamento                                                            | Por quê                                                                                                                  |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| TV recarrega enquanto está **pausada** → música volta do zero            | a âncora de tempo é zerada no pause de propósito (decisão P6 da migration `00027`); o cronômetro de verdade é da Fase 13 |
| Não pré-carrega a próxima faixa                                          | fora do escopo entregue; pode dar um piscar preto na virada                                                              |
| Reordenar a fila chega à TV por poll de 5s, não por push                 | o canal do player cobre só `playback_status`; aprovar/rejeitar/remover já vão por broadcast (Fase 8a)                    |
| Uma TV mostrando aviso de link invalidado                                | é o token rotacionado; pegue o link novo no card do host                                                                 |
| Vídeo que o YouTube não deixa embutir                                    | erro 101/150 do player; a TV mostra o aviso de autoplay, mas vídeo bloqueado para embedding é caso do conteúdo da música |
| Participante aprovado que voltou depois de 24h precisa de aprovação nova | é a pré-aprovação de 24h funcionando (`pre_approval_24h` ON, travado na UI)                                              |

### 3.9 Fase 8a — fila/player no uso real, player por sessão e pré-aprovação de 24h

> **O que dá para automatizar sem browser (entregue):** o contrato do banco, com `scripts/smoke-player-session.sql` rodando contra o remoto. Ele é **autossuficiente** — cria a sala `SMOKE8` e os usuários de teste, roda a matriz e **se apaga no fim**, então não exige `npm run seed` antes nem depois (o `smoke-playback.sql` da Fase 6 exige). **Rodar:** `node scripts/apply-sql.mjs scripts/smoke-player-session.sql 100000` (o segundo argumento é o limite de caracteres do relatório; o padrão 2000 corta o JSON). Novidade de schema: `pre_approval_24h` ON/off, `room_members.approved_at`, `current_user_is_anonymous`, `member_entry_state` e as duas portas de `player_room_id`. O que dá para rodar antes de qualquer deploy: **`npm run diagnose:queue`**, que reproduz as quatro actions de moderação e mostra o erro cru do PostgREST — foi ele que achou o `PGRST201` do embed ambíguo, que a UI escondia como "música não encontrada".

- [x] **Aprovar/rejeitar/remover/reordenar funcionam de verdade** (o `PGRST201` do embed ambíguo corrigido com hint explícito da FK) — `queue-actions.test.ts` (7) + smoke.
- [x] **Erro de banco vira erro na tela**: falha de leitura/escrita na moderação chega ao `toast`, não como "música não encontrada".
- [x] **A TV retoma sozinha** com a sala ociosa e fila aprovada (acordar/recarregar/poll) — `shouldClaimFromIdle` em `playback.test.ts` (24) + `player-kiosk.test.tsx` (18).
- [x] **Fila mutada avisa a TV** sem esperar o poll de 5s (broadcast depois de aprovar/rejeitar/remover/reordenar).
- [x] **Participante e host entram no player sem token** (`/player/<codigo>` por sessão) e **adicionar música leva ao player** — `song-search.test.tsx` (9).
- [x] **Negados no player:** membro `pending`, anônimo sem aprovação, não-membro e token errado — token errado **não** cai para a sessão.
- [x] **Pré-aprovação de 24h:** autenticado aprovado há 23h reentra aprovado; aos 25h volta a `pending` (com "entrada livre" OFF); toggle OFF não pré-aproveja ninguém; **anônimo nunca** é pré-aprovado; **reaprovar não renova** a janela.
- [x] **Toggle travado ON na UI** do `RoomSettings` (a decisão do PO) com o backend aceitando os dois valores — `room-settings.test.tsx` (3).
- [x] **Fila/player/seed de dev** — o seed deixa uma música `approved` (a trigger de status inicial ignora o `approved` do `INSERT`), senão o teste manual do player não tinha com o que testar.
- [ ] **Smoke HTTP** da rota pública com os dois caminhos de autorização e o redirect depois de adicionar — depende de Playwright.
- [ ] **Player em browser de TV de verdade** (IFrame API real, autoplay, latência) — o smoke prova o contrato, não a tela. **O browser de dev já rodou em 27/09** e expôs o crash de prontidão (ver §3.6): o que falta é a confirmação na TV.

### 3.9·bis Player em browser depois da correção de 27/09 (roteiro curto)

> Feito **com o dev server rodando e o console do browser aberto** (o crash só aparece com a API real; nenhum duplo de teste substitui este passo). Guarde o console: o `player.loadVideoById is not a function` aparecia aí, antes de qualquer elemento da tela.

- [ ] **Abrir `/player/<codigo>?token=…` com uma música já `approved`**: o vídeo começa sozinho (ou aparece "Toque para começar" se o navegador bloquear autoplay) — **sem overlay de erro**.
- [ ] **Aprovar uma música com a TV já aberta**: ela entra em ≤ 5s, sem recarregar a faixa que estava tocando.
- [ ] **Pular pelo celular do host**: a próxima começa e a faixa nova **não pisca preto**.
- [ ] **Fila acaba e a sala esvazia**: a TV mostra o QR; na música seguinte, o vídeo volta (o caminho do remount do stage, que era o segundo bug do mesmo defeito).
- [ ] **Devtools com o throttling em "Slow 3G"**: nada de crash; o aviso de "Não foi possível tocar esta música" aparece se o player demorar (8s) e some quando ficar pronto.
- [ ] **Autoplay bloqueado**: o botão "Toque para começar" aparece **só** quando o player está pronto, e um toque toca.
- [ ] **Comentar a `https://www.youtube.com/iframe_api` no DevTools** (simula ad-blocker): a TV mostra o aviso com o botão de recarregar, em vez de tela preta.

### 3.9·ter Player e fila depois do 2º round de correções de 27/09

> Mesmo princípio do roteiro acima: o que quebrou desta vez (`destroy()` depois do React, CTA repetido, lista do participante parada) só aparece com **timing de verdade** — poll de 5s, clique do host e celular com tela dormindo. Aplique a migração `20260927000031_queue_author_delete.sql` **antes** (ela traz a policy nova e o `replica identity full`; sem isso, o teste de remoção falha por RLS).

**TV + console aberto**

- [ ] **Fim da última música (fila vira vazia)**: a TV mostra o QR **sem `NotFoundError`/`removeChild` no console**.
- [ ] **Host clica "Parar" com música tocando**: a TV esvazia, **sem crash no console** — o mesmo crash do item anterior, por um caminho diferente (ver pós-mortem §3.8). Estado do console é o que conta aqui, não a tela.
- [ ] **"Parar" com outra música aprovada na fila**: hoje a próxima entra sozinha (comportamento pendente de mudança — ver TODO Fase 8b). Anotar o comportamento, não falhar o teste por isso.
- [ ] **Deixar tocar ≥ 60s com a TV armada**: o gate **não** reaparece por cima do vídeo (regressão do poll — antes era a CTA "Toque para começar").
- [ ] **Buffering (Throttling "Slow 3G") depois da faixa já ter começado**: a CTA **não** volta.
- [ ] **Sequência longa (5+ músicas, atravessando a virada)**: nenhum erro no console no fim de cada faixa.
- [ ] **Sair do `/player` pelo histórico do browser** (não pelo botão): sem erro.

**Lista no celular do participante (com a TV/host em outro aparelho)**

- [ ] **Host aprova**: a lista do participante atualiza em **segundos**, sem recarregar a página.
- [ ] **Host tira da fila / moderador rejeita**: a linha some da lista do participante (cobre o `DELETE` + filtro de `room_id`).
- [ ] **Participante pede/troca música pelo próprio celular**: os outros aparelhos da sala (inclusive a TV) enxergam na hora.
- [ ] **Celular do participante com o app em background (≥ 30s) e depois aberto**: a lista relê sozinha (cobre `visibilitychange`).
- [ ] **Participante pede música e depois toca em "Tirar da fila"**: some sem erro (D1).
- [ ] **Modo avião → online**: a lista volta a atualizar.
- [ ] **Desligar o realtime no DevTools (abrir a aba "Channels" e matar o WS)**: a lista continua atualizando pelo poll de 10s, e o console mostra o aviso de assinatura falha (log proposital, ver §3.10 do pós-mortem).

### 3.9·quater O toque de partida da TV (Fase 8, 2026-10-01)

> **O que mudou:** a TV não toca antes de um toque humano. O `PlayerGate` é a tela
> inteira que aparece **antes** do IFrame Player existir, e o player só é montado
> **dentro** do toque (`playerVars.autoplay: 0`). Consequências verificáveis:
> desarmada a TV não tem iframe no DOM, não baixa vídeo e **não pede a próxima
> música**; armada, o "armado" fica no `localStorage` e recarregar a página não
> devolve o gate.
>
> **O "armado" é store externo, não estado do React** (`src/lib/rooms/player-arm.ts`,
> `useSyncExternalStore`). O quiosque é SSR-rendered, e a primeira versão deste
> gate lia o `localStorage` no estado inicial: o **servidor** mandava o gate e o
> **cliente** mandava o vídeo, e a tela hydrationava com duas árvores diferentes
> — "Hydration failed because the server rendered HTML didn't match the client",
> que o Next 16 mostra como "Recoverable Error". Por isso o `getServerSnapshot` é
> sempre `false`, e o storage só entra em vigor na hidratação. O item 3 abaixo
> existe para isso não voltar sem ninguém perceber.
>
> **Por que este bloco é manual:** a política de autoplay é do browser e não
> existe no jsdom. A suíte cobre a fiação (o 150 vira gate, o toque refaz o play,
> o mudo destrava) com o duplo da IFrame API; o que só o aparelho real prova é
> se o gesto chegou ao browser e se o D-pad acerta o botão.

**TV com música já tocando no banco (abra `/player/<código>?token=…`)**

- [ ] **A tela é o gate, não o vídeo**: aparece "Sala `<código>`" e **um** botão só, "Toque ou pressione OK para começar". No Elements, **não** existe `[data-testid="youtube-stage"]` — o iframe do YouTube ainda não foi criado.
- [ ] **Botão já focado ao abrir**: o foco está no botão, sem precisar navegar. É o que faz o primeiro OK do controle não ir para o `body`.
- [ ] **Console limpo ao abrir**: nenhum "Hydration failed…", nenhum "Recoverable Error", nenhuma mensagem de hydration no console. Este item é o que pegou o bug da primeira versão — a tela "funcionava", só que regerava a árvore inteira atrás. Confira também o terminal do `next dev`: sem `Warning: Text content did not match` / `An error occurred during hydration`.
- [ ] **TV já armada, aberta de novo**: abra `/player/<código>` **depois** de já ter armado. A tela pode piscar o gate por **um frame** (é o instante entre a hidratação e a leitura do storage, e o React troca logo em seguida) — o que **não** pode é ficar no gate, nem derrubar erro de hydration. Conte o `localStorage.getItem("kf:player-armed:<código>")` no console: tem que dar `"1"`.
- [ ] **Clique/toque**: o vídeo começa **com som**, sem erro 150 no console.
- [ ] **Controle remoto (ou emulação de D-pad no DevTools)**: `Enter`/OK no botão focado tem o mesmo efeito do clique. Se o foco não estiver no botão, o teste falha aqui — é regressão.
- [ ] **F5 na TV**: o gate **não** volta e o vídeo retoma do `elapsed_seconds` (o "armado" está no `localStorage`).
- [ ] **"Trancar TV"**: o vídeo some do DOM e o gate volta; tocar de novo recarrega **a mesma faixa** e ela volta a tocar. Se a TV ficar muda com o toque certo, o `loadedRef` não foi zerado ao trancar.
- [ ] **Gate com a fila vazia**: nada tocando e nada aprovado → a TV mostra o **QR** ("Escaneie para adicionar uma música"), não o gate. O gate só assume quando existe o que tocar.
- [ ] **Desarmada + host aprova uma música**: o gate aparece em ~5s (poll) e a fila **não anda** — confirme no banco que o item continua `approved` e `playback_status` segue `idle`. Este é o item que mais importa: sem ele, a fila se esvazia sozinha com ninguém olhando.
- [ ] **Sequência longa (5+ músicas)**: nenhuma vez o gate volta por cima de um vídeo **tocando**; nenhum erro no console no fim de cada faixa.

**Fase "tentar de novo" (o browser recusou mesmo dentro do toque)**

> Num browser de desktop moderno esta tela é **difícil de provoke** — é esse o
> ponto da mudança. Onde ela aparecer (smart TV com política de autoplay
> rígida), o roteiro é:

- [ ] **Aparece a tela cheia "O navegador recusou o som"**, com "Tentar de novo" e "Começar sem som" — e o vídeo continua montado atrás dela.
- [ ] **"Tentar de novo"**: o áudio entra (ou a tela some e o vídeo toca mudo, o que é aceitável desde que o vídeo apareça).
- [ ] **"Começar sem som"**: o vídeo aparece **mudo** e a faixa inferior ganha "Ativar o som"; o clique therein **tira o mudo**.
- [ ] **O botão de som some sozinho** depois de ~15s, sem o ninguém tocar.
- [ ] **A TV já tocou normalmente antes**: o gate **não** aparece, e o "trancar" volta ao gate na hora.
- [ ] **"Trancar TV" depois de a faixa tocar**: o vídeo some e o `localStorage` fica **sem** a chave `kf:player-armed:<código>`. Se o botão sumir com o vídeo e a chave continuar lá, o próximo F5 abre a TV armada — o bug que o estado `audioUnlocked` da primeira versão escondia, agora coberto por teste.

**Participante no celular (o gate vale para todo mundo)**

- [ ] **Participante pede uma música e abre o `/player`**: aparece o gate; um toque toca com som. O celular também bloqueia áudio sem gesto — por isso o gate não é só da TV.
- [ ] **Participante assistindo com o gate na tela e a tela dormindo (≥ 30s)**: ao voltar, a TV não fica com o gate travado sobre um vídeo já em `PLAYING`.


- [ ] RLS: participante aprovado de sala A **não** lê a fila da sala B (comprovar via API direta).
- [ ] Ações de host rejeitadas no backend quando chamadas por não-host.
- [ ] Rate limit nas rotas sensíveis.
- [ ] Caminho de exclusão de conta/dados funcionando.
- [ ] Latgebras de segurança e o DoD exigem **`npm run scan:secrets`** (o repo é público e o link da TV é credencial)
- [ ] Rotação de link da TV: host clica "gerar novo link" e o link anterior deixa de abrir a sala (o token é UUID, nunca reaproveitar)
- [ ] Larvas de limpeza de `played`/`rejected` antigos.
- [ ] Alvos de toque ≥ 44px no controller.
- [ ] Tema escuro consistente no controller e na tela.

### 3.11 Fase 8c·A — limites e latência do realtime (medido 2026-10-01)

> **O que este bloco é:** a validação numérica de dois itens que estavam abertos
> desde a Fase 6. **Rodar:** `npm run measure:limits`
> (`scripts/measure-limits.mjs`; flags: `--no-ramp`, `--ramp-max N`, `--no-write`,
> `--json`).
> Resultado registrado em `docs/engenharia/limites-free-tier.md`.
>
> O script **não imprime nenhuma chave, senha ou token de player**, não cria e
> não apaga nada; a única escrita é o `UPDATE` de §3.3, que não muda conteúdo
> (só o `updated_at`, via trigger) e some com `--no-write`. Não substitui
> `npm run seed`.

- [ ] `npm run measure:limits` termina sem exceção e imprime as 5 seções
- [ ] **Postgres:** banco em 2,7% do teto (13,33 MB / 500 MB) — confirmado
- [ ] **Rampa:** 200 conexões simultâneas abrem com **0 falhas** (teto publicado)
- [ ] **Broadcast:** p95 abaixo de 2000 ms (medido 166 ms) e **0 perdidos** em 60 envios
- [ ] **Aviso de fila:** o script aponta `assinar` + `fechar` como o custo dominante e `enviar` como ~0 ms — é a prova de que o alvo de 2 s **falha no p95 por desenho do `announce`**, não por falta de rede
- [ ] **Latência na TV de verdade** (o que o script **não** cobre): host aprova uma música no celular, a fila do participante muda **sem esperar o poll** (< 2 s), e a lista muda de novo com o celular em segundo plano (< 10 s, o poll) — roteiro em §3.9·ter

> **Por que o alvo de 2 s é medida de script E de browser:** o script mede rede e
> banco; a TV renderiza, o quiosque e o `set_playback` acontecem em código que o
> script não executa. Os dois juntos fecham o item — nenhum dos dois sozinho.

> Este checklist cresce a cada fase; registre falhas em issues e nunca lance release com item do escopo pendente.

---

## 4. Definição de pronto (DoD)

Uma fase/feature só é considerada pronta quando:

- [ ] Lint + typecheck + build passam.
- [ ] `npm run scan:secrets` passa (link da TV é credencial, e o repositório é público — ver `docs/engenharia/pos-mortem-smoke-playback.md` §3.11).
- [ ] Testes unitários/integração da feature existem e passam (Vitest).
- [ ] Fluxo validado manualmente conforme checklist funcional da fase.
- [ ] Casos RLS/segurança da feature têm cobertura (teste ou validação manual documentada).
- [ ] CHANGELOG atualizado com a mudança.
