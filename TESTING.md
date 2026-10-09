# Estratégia de Testes — Karaokê Watch Party

Documento que define como testamos o projeto, dividido em duas partes:

1. **Boas práticas e stack** — convenções para testes unitários, de integração e e2e.
2. **Etapas de testes funcionais** — checklist de verificação à parte do código, por fluxo de negócio.

> Status: **Vitest + RTL + jsdom** configurados; **MSW instalado na Fase 4**. **Etapa atual (2026-10-08):** suite com **768 testes** (58 arquivos) — rooms/utils, `src/lib/bars/qr.test.ts` 25 (inclui o teto de 10 mesas da Fase 16), i18n, cookies/geo, Onboarding, `src/lib/youtube/*` 88 (`credentials` 18 com o portão `is_dev`, `errors` 15 — que incluem o payload real do deploy, `badRequest` + "API key not valid", e o contrapeso que impede promover `badRequest` a chave inválida só pelo `reason`, `service` 15, `host-oauth` 16 com a invalidação na desconexão e no refresh em andamento, `diagnostics` 21 com a redação de segredo em exceção nossa, `search` 9), `queue` com a matriz de presença e as regras de aprovação/reordenação/troca (39), `src/lib/bars/schema.test.ts` 13 (raio + `createRoomSchema` da Fase 8b·quater + `barMesasSchema` da Fase 16) + `radiusTickStep`/`radiusTicks` em `geo.test.ts`, a rota `/api/youtube/search` com **21 provas via MSW** — Bearer OAuth host/app, o portão `is_dev` nos dois sentidos, pool ativo/inativo e `own_only` ignorando `youtube_pool_id` — e a **`/api/youtube/diagnostics` com 18** (o portão 401/403, o relatório sem gastar cota, `?room=`, `?probe=1` com `keyInvalid` e `ipRefererBlocked`, a sala inexistente que não pode virar "sem credencial", e a exceção com segredo redigida), o **roundtrip authorize→callback** com 4 provas do estado mais o `redirect_uri` derivado da env (12 no total, com o aviso de `NEXT_PUBLIC_APP_URL` ausente), a **entrada com aprovação** (`entry-approval-wait` 10 + `pending-entry-requests` 5), o gate de presença (`presence-gate-info` 14), a **fila** (`queue-list` 30, incluindo o host pedindo música da Fase 17, `song-search` 17 com o bloco da Fase 8f — passo do host, participante sem atalho, resposta HTTP que nunca vira "falha de rede" e o atalho de configuração indo para `/bar/[codigo]` —, `song-confirm-dialog` 9), o **clipboard** (`clipboard.ts` 7 — o fallback de `execCommand` para HTTP sem secure context), o **player** (`playback` 27 de regras puras, `youtube-stage` 13, `player-error-boundary` 2, `player-kiosk` 21 com a **YouTube IFrame Player API mockada fiel ao ciclo de vida real** — métodos só depois do `onReady`, ver §3.6, `playback-controls` 12 do painel do host), `src/lib/supabase/admin.test.ts` 5 (o memo por `(url, key)`), as **4 telas do host da Fase 17** (`settings/room-behavior-card` 4 com o toggle travado, `settings/youtube-settings-card` 9 com os textos que não podem voltar a mentir, `settings/mesas-bar-card` 5, `settings/room-code-card` 4 e `host-screen-nav` 3) e a **Fase 8a** (`queue-actions` 11, `entry-state` 5, `spectator` 8 — a regra do espectador), mais a **Fase 8c** (`player-arm` do "armado" do gate, `player-gate`/`player-kiosk` com o player montado dentro do toque e o teste de `renderToString` que pega hydration mismatch — o jsdom renderiza só o cliente e não pegaria, `actions` 6 travando que a chave do YouTube é escrita por RPC e nunca por `createAdmin()`). O contrato do playback e o da autorização por sessão/pré-aprovação de 24h têm smoke próprio no banco remoto (`scripts/smoke-playback.sql` e `scripts/smoke-player-session.sql`), e o papel `dev` tem o **`scripts/smoke-dev-role.sql`** (**15/15**, com os 5 casos de bypass do INSERT/UPDATE direto). A **RLS** tem o **`scripts/smoke-rls-audit.sql`** (**62/62** — 48 ataques que precisam falhar e 14 legítimos que precisam passar; de 03/10, os H6/H7/H8 cobrem a ACL de `admin_room_occupancy`, o filtro `is_host` no corpo e o `search_path`, e os S1–S4 cobrem a regra do espectador: claim por sessão recusado, TV com token avançando, espectador sem mesa e quem está no raio ainda sentando), que roda com `set local role anon/authenticated` porque o `postgres` da Management API tem BYPASSRLS e passaria verde de mentira; e a view `profiles_public` tem o **`scripts/smoke-profiles-public.sql`** (9/9). A Fase 8f acrescenta o **`scripts/smoke-youtube-credential.sql`** — **19/19 no Supabase Cloud em 06/10/2026** (default `own_only`, as quatro recusas de coerência, o FK `RESTRICT`, os pools invisíveis ao cliente, a RPC de saúde sem devolver a chave e o bypass do trigger para service role). A Fase 8g acrescenta o **`scripts/smoke-release-current-item.sql`** — **11/11 no Supabase Cloud em 07/10/2026** (o `KF001` recusando no ar, o release devolvendo `approved` na mesma posição com a sala `idle`, as duas portas do `player_room_id`, a sala encerrada e o cantor destravado em seguida). A Fase 16 acrescenta o **`scripts/smoke-mesas.sql`** — **12 passos no Supabase Cloud em 08/10/2026** (teto 1–10 no `create_bar` e nos checks do banco, corte do ZEHBAR, `update_bar_mesas` com realocação e recusa de não-dono, auto-mesa-1 em bar de 1 mesa, espectador sem mesa e bar de 2 mesas sem escolha — roteiro em §3.17). A Fase 18 acrescenta o **`scripts/smoke-pulseiras.sql`** — **31/31 no Supabase Cloud em 08/10/2026** (o contrato novo do `create_bar`, lote de códigos, RLS de `pulseiras_codigos`, faixas de valor sem sobreposição, o `resgatar_pulseira` nas recusas/renovação e o gate `KF002` — roteiro em §3.19). A Fase 8f acrescenta o roteiro manual de §3.15 (o que a tela mostra × o que só o diagnóstico mostra) — a parte automatizada está coberta e o **`?probe=1` no deploy de preview foi executado** (ver o bloco "verificado no deploy" ao fim da seção). Playwright (e2e) segue adiado para depois do MVP. Este arquivo deve ser atualizado conforme as ferramentas entrarem no projeto.
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
- [ ] **Código da sala é configurável pelo host (3–12 alfanuméricos)** na tela **Sala** (`/salas/<código>/sala`, card "Código de entrada"): valida contra sala/bar (colisão bloqueada) e redireciona a página para o novo código.
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
- [x] OAuth por-host: "Conectar conta do YouTube" no card **"Busca de música (YouTube)"** (tela do bar) grava `youtube_oauth_tokens`, vira a credencial da busca (**Bearer**) e o bloco passa a mostrar **"Conectado à conta do YouTube · desde …"**.
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
- [x] **Toggle travado ON na UI** (a decisão do PO) com o backend aceitando os dois valores — `settings/room-behavior-card.test.tsx` (4, desde a Fase 17; antes era `room-settings.test.tsx`).
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

### 3.12 Visitante anônimo: QR, aprovação e fora do raio (2026-10-02)

> **Por que este bloco existe:** a suíte cobriu os quatro defeitos (474 testes,
> 39 arquivos), mas **jsdom renderiza só o cliente** — ela não prova nem que o QR
> da TV sai correto nem que o celular do visitante chega ao player. Estes itens
> são de browser e de aparelho real, e é aqui que eles ficam registrados.
>
> **Rodar:** em duas janelas. Janela A = a TV em `/player/<código>`. Janela B =
> **modo anônimo** (janela privada ou outro perfil, sem sessão) no celular. Para
> simular "fora do raio" de verdade, use o DevTools em **janela B**:
> `Emulation ▸ Location ▸ Custom location` com coordenadas ~2 km longe do bar.
> Um perfil **sem** o cookie `kf-geo` é o caso `geo-unavailable`.

**QR codifica o host certo (o bug do `localhost:3000`)**

- [ ] Na TV (janela A), com a sala vazia, o QR da tela de "Escaneie para adicionar" aponta para o **domínio em que a TV está aberta** — no deploy público, `https://<seu-dominio>/entrar?code=<código>`, e **nunca** `http://localhost:3000`
- [ ] Conferir pelo leitor de QR do celular: o link abre o app certo sem digitação
- [ ] O **QR das mesas** (página da sala, botão "QR das mesas") e o **QR do bar** apontam para o mesmo host
- [ ] Gerar o QR de um **preview** da Vercel (URL diferente da produção): o QR tem que apontar para o preview, não para a produção — é a prova de que o origin tem precedência sobre `NEXT_PUBLIC_APP_URL`
- [ ] `NEXT_PUBLIC_APP_URL` **case-sensitive**: confirmar na Vercel que é `..._APP_URL` (com `URL` em maiúscula). A variável com `url` minúscula é outra e simplesmente não existe

**O código sobrevive ao login (o `?code=` que morria no redirect)**

- [ ] Janela B em `/entrar?code=<código>` sem sessão → cai no `/login` com **`?next=`** na URL (visível na barra de endereços)
- [ ] "Continuar sem login" → **abre `/entrar?code=<código>`**, com o código preenchido. Antes, voltava para `/entrar` pelado e exigia escanear o QR de novo
- [ ] O mesmo pelo GitHub/Google (OAuth): o `redirectTo` leva o `next` e o callback devolve para o `code` certo
- [ ] **Reentrante:** quem já tem sessão e abre `/login` direto é levado ao dashboard, **sem** obedecer a um `next` de link colado (`//evil.com` precisa cair em `/dashboard`, nunca no host externo)

**Aprovação não é mais spinner eterno**

- [ ] Com "entrada livre" **desligada** na sala, o pedido do visitante fica em "Aguardando aprovação"
- [ ] O host aprova no celular → a tela do visitante **vira "Entrada aprovada!" e abre `/player/<código>`** sozinha
- [ ] **Aprovação sem rede lenta:** aprovar e observar. O card para no spinner por ~4s e então oferece **"Abrir o karaokê agora"** com o código para digitar à mão. O link tem que ser um `<a href>` — se funcionar com o client router quebrado, é porque a navegação não depende dele
- [ ] **Cancelar pedido** volta para `/entrar?code=<código>` sem recarregar nem travar
- [ ] Rejeitar → "Tentar novamente" volta para a entrada, e o pedido novo aparece para o host
- [ ] `console` limpo: **nenhum** `router.refresh` disparado na aprovação (o `refresh` era o que reiniciava o spinner)

**Fora do raio entra e só assiste**

> **Regras deste bloco mudaram em 03/10** (ver §3.13): o espectador agora
> **fica na tela da sala** — que é a página canônica e somente leitura — e o
> player virou **botão**, não destino de entrada. Os itens de entrada continuam
> válidos; os de destino são os de §3.13.

- [ ] **Denovo dentro do raio** (coordenadas do bar): grade de mesas aparece, botão "Entrar na mesa N", pedido de música **funciona**
- [ ] **Fora do raio** (DevTools, ~2 km longe): o aviso de fora do raio aparece, a **grade de mesas some** e não há como escolher mesa
- [ ] Entrar como fora do raio **funciona** e leva à **sala** (`/salas/<código>`), com a fila visível
- [ ] E **tentar pedir música** de fora dá recusa clara em **duas** camadas: o botão não existe na tela e a `addSongToQueueAction` recusa com `OUTSIDE_BAR` — este é o ponto que a regra de produto exige; se passar, é regressão
- [ ] **Sem consentimento** (cookie `kf-geo` apagado, ou bar sem coords/raio): o gate de localização **continua bloqueando** e não oferece entrada sem mesa. `outside` e `geo-unavailable` não podem ter o mesmo comportamento
- [ ] Dois visitantes fora do raio ao mesmo tempo: os dois entram (mesa nula convive com mesa nula — não há unique em `room_members.mesa_numero`)
- [ ] Visitante de dentro que estava na mesa 4 e **reconecta de fora**: o `on conflict` do `join_room` preserva a mesa 4 (`coalesce`), ele não volta a "sem mesa"

### 3.13 O espectador de fora do raio e o dev na rede local (2026-10-03)

> **Por que este bloco existe:** a rodada turningou a regra "quem entra fora do
> raio só assiste" de tela em **regra de banco** (migration `20261003000041`) e
> mexeu no dev da LAN (`allowedDevOrigins` + clipboard sem secure context). Os
> smokes já mediram as três portas no Cloud — S1–S4 no `smoke-rls-audit`, e o par
> do claim no `smoke-player-session`. O que falta é o **aparelho**, e o primeiro
> item é o que bugou nesta semana.

> **ATENÇÃO — o primeiro item já foi executado e achou um P0 (2026-10-04).** A
> entrada de participante estava **quebrada para todo mundo**: a distância do
> haversine ia fracionária para o `join_room`, cujo `p_distancia_m` é `int`, e o
> Postgres recusava com `invalid input syntax for type integer: "42.4732269333666"`.
> Corrigido arredondando em `checkPresence` (`src/lib/bars/geo.ts`) — ver
> `CHANGELOG.md`. **Se a entrada falhar de novo com esse texto, é regressão do
> conserto, não do roteiro.** O bloco do espectador só ficou executável depois
> disso; o "dentro do raio" já dá para rodar desde já (receita abaixo).

**Geo determinístico por console (sem depender da geolocalização do aparelho)**

> O `console` abaixo é o que torna este roteiro repetível: o gate de presença lê
> o cookie `kf-geo` (`src/lib/bars/presence.ts`), e **o que foi gravado no join
> manda para sempre** — quem entrou de fora continua "de fora" mesmo que o
> celular passe a apontar para dentro. Por isso "dentro" e "fora" precisam de
> **janelas/sessões diferentes**, e trocar o cookie na mesma sessão não troca a
> decisão. Recarregue a página depois de gravar: o valor é lido no servidor, a
> cada request.

```js
// DENTRO: coordenada idêntica à do bar → distância 0 exato → "0" é inteiro válido.
document.cookie = 'kf-geo=' + encodeURIComponent(JSON.stringify(
  {status:'granted',coords:{latitude:-3.771963,longitude:-38.514619}})) + '; path=/; max-age=3600';

// FORA: ~2 km ao norte (Fortaleza, bar em -3.771963 / -38.514619).
document.cookie = 'kf-geo=' + encodeURIComponent(JSON.stringify(
  {status:'granted',coords:{latitude:-3.753963,longitude:-38.514619}})) + '; path=/; max-age=3600';

// Sem consentimento: é o único caso que BLOQUEIA de verdade.
document.cookie = 'kf-geo=' + encodeURIComponent(JSON.stringify(
  {status:'denied',ts:'manual'})) + '; path=/; max-age=3600';
```

> O raio gravado no Cloud para o `ZEHBAR` é **150 m** (o padrão do produto é
> 500 m). As coordenadas acima são as do bar como estão na tabela `bars` — 6
> casas, sem arredondar, que é o que faz a distância dar 0 em vez de `0,4`.

**Ruído de dev conhecido (2026-10-04) — o que NÃO é falha**

| Mensagem | Como é | O que fazer |
| --- | --- | --- |
| `TypeError: Cannot write to a CLOSED writable stream` | Turbopack, geração/cache do RSC | Reiniciar `dev` + hard reload + limpar dados do site |
| `Failed to fetch RSC payload … chunk.reason.enqueueModel is not a function` | idem, costuma vir logo em seguida | idem; se persistir: `npm run dev -- --webpack` |
| `Fast Refresh` que não completa | idem | idem |

> Todas as três são de **geração do grafo de módulos do RSC** (o Turbopack
> recompila a rota na primeira visita e a navegação pega o bundle velho), não de
> hydration nem do app — o sinal que as distingue de falha real é a página
> **continuar respondendo** depois delas. Nenhuma delas foi reproduzida em
> `build` + `start`, e nenhuma delas impede o roteiro; o que importa é o item
> "console limpo" do bloco do espectador, medido **depois** dessas três saírem.

**Dev na LAN (reiniciar o servidor antes — o `next.config.ts` só vale no start)**
>
> O IP deste roteiro (`192.168.100.28`) é o da máquina **na hora em que foi
> escrito**: depois de um reboot o DHCP pode trocar o endereço, e a única coisa
> que muda no roteiro é o link. Rode `ipconfig` antes e use o IPv4 atual — o
> `allowedDevOrigins` não depende do número (ele é montado no start com os IPv4
> que a máquina tiver naquele momento), mas o `curl` abaixo tem que ser refeito
> com o IP novo.

- [ ] `npm run dev` reiniciado, e `http://192.168.100.28:3000` **aberta no celular**: a página **hidrata** (botão responde, sem tela morta) — o sintoma antigo era `/_next/static/chunks/*.js` em `403` por `blockCrossSiteDEV`
- [ ] `curl -I -H "Origin: http://192.168.100.28:3000" http://localhost:3000/_next/static/chunks/<qualquer>.js` → **`200`** (antes dava 403)
- [ ] **"Copiar" do Pix** funciona em HTTP (cai no `execCommand`, sem secure context) e **não rouba o foco** — clicar e voltar a navegar por teclado tem que continuar funcionando
- [ ] **"Copiar link da TV"** idem, e o link colado no celular abre `/player/<código>?token=…`
- [ ] Trocar de rede (outro Wi-Fi, 4G no notebook) continua funcionando sem hardcode de IP — a config pega o IPv4 da máquina agora

**Entrada do participante (o P0 de 04/10 — rode isto antes do espectador)**

- [ ] **Dentro do raio:** com o cookie `kf-geo` de coordenada idêntica, `/entrar?code=KARAOKE` **entra** e abre a sala — **antes** disso, esta tela era o bloco do P0 (`invalid input syntax for type integer`)
- [ ] **Fora do raio:** com o cookie de ~2 km, a mesma entrada **entra também** (é espectador, não é bloqueio) — e é este item que só ficou executável com o conserto
- [ ] Sem consentimento (`status: denied`): a entrada é **recusada** com a mensagem de geo — é o único dos três desfechos que bloqueia de verdade

**O espectador na tela (aparelho, com DevTools em coordenadas ~2 km do bar)**

- [ ] Entrar de fora: a fila aparece, **sem** "Pedir música" no cabeçalho **e** sem o botão do estado vazio — os dois pontos de entrada, porque o vazamento do botão do estado vazio era o mais fácil de esquecer
- [ ] A frase da regra aparece na lista ("fora do raio do bar … não para pedir música"), em vez de a lista só parecer quebrada
- [ ] **"Trocar"** some do item do próprio espectador; **"Tirar da fila"** continua (retirar não é pedir)
- [ ] `/salas/<código>/buscar` **digitado na mão** volta para a sala (não fica com a tela de busca nem com a busca montada)
- [ ] **Nenhum `MesaPicker`**, e a grade de mesas some
- [ ] O botão **"Ver o player"** abre `/player/<código>`: o vídeo aparece **mudo**, **sem** o gate de "Começar", **sem** "Ativar o som" e **sem** "Trancar TV"
- [ ] **A TV continua tocando** enquanto o celular assiste: aprovada uma música na sala, ela começa na TV **sem** o celular tocar nada — e o celular não "puxa" a próxima nem derruba a música que a TV começou (a prova de que os dois lados do `claim_next_song` estão fechados)
- [ ] Pedir música **não** leva mais para o player: depois de pedir, volta para a **tela da sala** (antes ia para `/player/<código>`)
- [ ] Fim da faixa: a **TV** avança sozinha; o celular só acompanha
- [ ] `console` limpo nas duas janelas — medido **depois** de o ruído de dev da tabela acima sair: a primeira navegação numa rota nova do Turbopack sempre produz as três, e elas **não** contam como falha

**O banco (para quem tem acesso ao Management API)**

- [ ] `node scripts/apply-sql.mjs scripts/smoke-rls-audit.sql 15000` → S1 vermelho? Não: **S1 recusado**, **S2 TV avançando**, **S3 espectador sem mesa**, **S4 quem está no raio sentando**, e o placar **62 casos · 0 falhas**
- [ ] `node scripts/apply-sql.mjs scripts/smoke-player-session.sql` → passo **06** `ok:false` com "só a TV avança a fila" e **06b** `ok:true`; passo **14** continua dando "sala encerrada"

**`RoomQr` quando a geração falha**

- [ ] Com o `qrcode` quebrado (DevTools ▸ bloquear `qrcode`), a tela **não** fica num skeleton piscando: mostra o erro **e o código da sala** para digitar à mão
- [ ] `console` mostra `[RoomQr] falha ao gerar o QR` com o `value` — antes o erro era engolido sem log

### 3.14 Uma música ativa por participante (2026-10-04)

> **Por que este bloco existe:** a regra virou migration (`20261004000042`), e os
> smokes já mediram a trigger no Cloud (série **Q**, 7 casos). O que falta é o
> **aparelho** — e o caso reportado foi justamente o que a suíte não pegaria: um
> visitante **sem login autenticado** deixando várias músicas suas em `ZEHBAR`.
>
> **O que a regra é, em uma frase:** uma música **ativa** por participante, por
> sala. Ativa = `pending` + `approved` + `playing` (é o que a fila mostra).
> Depois que a música **tocou** (`played`), a vaga abre e o pedido entra.

**Participante (celular anônimo, dentro do raio)**

- [ ] Entrar em `ZEHBAR` sem login (o botão de visitante) e abrir **"Pedir música"**: pede a primeira → ela **entra** na fila, sem aviso de substituição
- [ ] A busca mostra, **antes** do clique, que já existe uma música sua e que o próximo pedido a substitui — com o **título dela**
- [ ] Pedir a segunda: o toast diz que a nova entrou **e nomeia a que saiu**; na fila do celular, **a antiga some** e só a nova fica
- [ ] **Com uma música tocando na TV**, o botão de adicionar fica **travado** e a tela explica que dá para pedir outra quando ela terminar — e **a TV não é interrompida** em momento algum (é o ponto do desenho: substituir a `playing` cortaria o áudio)
- [ ] Forçar o pedido por outra via (DevTools, chamando a action direto) ainda devolve a mesma recusa — o aviso é conveniência, a regra é do banco
- [ ] Fim da faixa: quando a música vira `played`, o botão **destrava** e o próximo pedido entra

**Host (na própria sala)**

- [ ] O host pede três músicas: as **três** ficam na fila, sem aviso e sem recusa
- [ ] O host continua podendo **trocar** o item de qualquer participante **no lugar** (posição e aprovação mantidas) — a regra de "uma ativa" é por participante, e a troca do host é outra operação

**Outro participante**

- [ ] Com duas pessoas no celular, uma pedir não mexe na fila da outra — nem com a mesma sala

**O banco (para quem tem acesso ao Management API)**

- [ ] `node scripts/apply-sql.mjs scripts/smoke-rls-audit.sql 15000` → série **Q**: Q1 entrou · Q2 substituiu e sobrou só a nova · Q3 tocando **recusou** · Q4 a que tocava **continua** · Q5 depois de `played` entrou · Q6 host com 2 de 2 · Q7 a fila do colega intacta; placar **69 casos · 0 falhas · 0 legítimos quebrados**
- [ ] Legado: agrupar `queue_items` por `room_id + added_by_user_id` sobre as ativas e contar `> 1` → **nenhuma linha** (medido 04/10: zero violações)

> **Limite conhecido, para não confundir com falha:** a identidade do visitante
> é do **navegador** (`signInAnonymously`). Limpar os dados do site cria uma
> identidade nova, e o browser dá para apagar a cada pedido — fechar isso é prova
> de identidade, não uma trigger.

### 3.15 Busca do YouTube: o que a tela mostra e o que só o diagnóstico mostra (Fase 8f, 2026-10-05)

> **Por que este bloco existe:** o defeito reportado era um 502 genérico
> ("Tente de novo em instantes") que **ninguém conseguia diagnosticar** — o
> `reason` do Google era descartado antes de virar texto. A Fase 8f separou duas
> coisas que estavam misturadas: **o que o participante vê** (passo a seguir, sem
> jargão) e **o que só a conta `dev` vê** (o `reason` cru, que custa 100 unidades
> de cota). Os testes automatizados cobrem o contrato das duas.

> **Verificado no deploy (2026-10-06, preview `karaoke-flow-54d1zvj4p`):** o item
> que fechava a fase foi executado e a hipótese inicial — restrição de origem ou
> de IP — estava **errada**. A `YOUTUBE_API_KEY` da Production tinha **198 dias** e
> o Google respondia `400` · `reason=badRequest` · "API key not valid" para ela,
> enquanto a chave do `.env.local` respondia `200`. Trocada a chave,
> `?probe=1&room=KARAOKE` devolveu `ok: true`, `resolvedFrom: "dev"`, HTTP 200 do
> Google em 404 ms, e nenhum segredo no corpo; o host de `BAR2FO` (fora de
> `dev_accounts`) recebeu **403** sem gastar cota. Método: **`vercel pull` não
> serve para conferir valor** — variável tipo Secret volta como `[SECRET]` e
> `?decrypt=true` devolve o envelope cifrado (1072 caracteres para uma chave de
> 39). A única leitura confiável de uma credencial é a **função que a usa**:
> sondar a chave direto (Google, `maxResults=1`) ou `?probe=1` no deploy.

> **Já verificado no deploy (2026-10-06, preview `karaoke-flow-54d1zvj4p`):** o
> item que fechava a fase foi executado e a hipótese inicial estava **errada**.
> Não era restrição de origem nem de IP: a `YOUTUBE_API_KEY` da Production tinha
> **198 dias** e o Google respondia `400` · `reason=badRequest` · "API key not
> valid" para ela, enquanto a chave do `.env.local` respondia `200`. Com a chave
> trocada, `?probe=1&room=KARAOKE` devolveu `ok: true`, `resolvedFrom: "dev"`,
> HTTP 200 do Google em 404 ms, e o corpo **sem nenhum segredo**. O caso do não-dev
> (`room=BAR2FO`, host fora de `dev_accounts`) devolveu **403** sem gastar cota.
> O que a sond taught sobre o método: **`vercel pull` não serve para conferir
> valor** — variável tipo Secret volta como `[SECRET]` e `?decrypt=true` devolve o
> envelope cifrado (1072 caracteres para uma chave de 39). A única leitura
> confiável de uma credencial é a **função que a usa**: sondar a chave direto
> (Google, `maxResults=1`) ou `?probe=1` no deploy.
>
> **Primeiro, o passo que não depende de nada:** a migration
> `20261005000043` precisa estar aplicada no ambiente que se está testando. Sem
> ela, a coluna `bars.youtube_credential_policy` não existe e a busca quebra com
> erro de banco.

**Participante sem nenhuma credencial (o caso reportado)**

- [ ] Entrar em uma sala **sem chave salva e sem conta do YouTube conectada** e abrir "Pedir música": a mensagem diz que **esta sala** precisa de chave, com o passo escrito (Google Cloud → criar chave → colar em `/salas/<código>`), e **não** diz "falha de rede" nem "Tente de novo em instantes"
- [ ] O mesmo celular, na mesma sessão, **sem** a chave do dev no ambiente: o erro é o de cima. Este é o teste que fecha o vazamento — **a chave do dono não pode aparecer para este bar**
- [ ] A busca responde em **JSON** mesmo no erro (o DevTools em Network mostra o corpo com `code` e `hint`, e o status é `503`, não `500` com HTML)
- [ ] **Host** da mesma sala vê um botão/atalho para as configurações da sala; **participante** não vê atalho

**Host com chave inválida, restrita, ou sem API habilitada** (o que a classificação promete)

- [ ] Salvar uma chave **com restrição de origem ou de IP**: a tela diz que a chave está **restrita**, e não "inválida" — é o caso que só falha no deploy, porque a busca é server-side e o IP de saída da Vercel não é o da máquina
- [ ] Salvar uma chave de um projeto **sem a YouTube Data API v3 habilitada**: a mensagem é a específica, com o link/enlace para a tela da API
- [ ] Copiar uma chave **revogada**: a mensagem é "chave inválida" e o passo é criar outra
- [ ] **Cota do projeto estourada**: a mensagem diz que a cota do **projeto** acabou, e o passo é criar um projeto/chave — **não** diz "por usuário" e **não** promete que conectar a conta resolve

**Conta do YouTube conectada pelo host (OAuth)**

- [ ] Host conecta a conta em `/salas/<código>` e volta à busca: a busca funciona **e o texto da tela continua dizendo que a conta não garante cota separada** (a cobrança é do projeto do credential)
- [ ] O `redirect_uri` bate com o registro: se `NEXT_PUBLIC_APP_URL` estiver errada/faltando, aparece `redirect_uri_mismatch` e **o log do servidor tem o aviso `youtube_oauth_missing_app_url`** (uma vez, não a cada requisição)

**Diagnóstico (só conta `dev`)**

- [ ] `GET /api/youtube/diagnostics` (sem query): devolve o estado do ambiente **sem gastar cota** — variáveis presentes **por nome**, contexto do deploy, papel da sessão. Conferir: nenhum valor de chave/token aparece no corpo
- [ ] `GET /api/youtube/diagnostics?room=KARAOKE`: mostra a **fonte** que aquela sala resolveria (`room_api_key`, `host_oauth`, `platform_pool`, `app_oauth`, `dev_api_key` ou `none`) **sem** fazer chamada ao YouTube
- [ ] `GET /api/youtube/diagnostics?probe=1`: faz a chamada real e devolve `googleReason` cru. É aqui que se descobre **por que** a chave da Vercel está sendo recusada
- [ ] **Participante** chamando o endpoint: `403`, sem detalhe de ambiente
- [ ] Nenhum dos três formatos devolve chave, access token, refresh token, id de projeto ou corpo bruto do Google

**O item que fecha a Fase 8f:** rodar `?probe=1` **no deploy**, não no `localhost`.
A hipótese da restrição de origem era a mais provável para o relato original, e
ela é indistinguível de "chave inválida" olhando o `localhost`. — **Feito em
06/10/2026**, e a hipótese estava errada: a chave da Production é que estava
morta. O checklist de tela acima (as caixas de participante, chave inválida,
conta conectada) continua **pendente**, porque exige gravar chave por sala e
conectar OAuth de verdade no navegador.

---

### 3.16 Fase 8g — legenda desligada, busca que destrava sozinha e card que não mente (2026-10-07)

> **O que mudou:** três defeitos com a mesma forma — nada destravia sozinho.
> (1) A legenda do YouTube (transcrição por **IA**, não letra) ficava por cima da
> música e o `OFF` era só "não passei o parâmetro"; (2) o botão de pedir música
> só destrava no **próximo render do servidor**, porque quem terminava a faixa
> era a TV, por RPC, sem avisar o celular — o sintoma era "demora para pedir a
> próxima", e na prática era F5; (3) pior: **trancar a TV com a música no ar**
> deixava o item em `playing` para sempre, e a trigger de "uma música por
> participante" recusava todo pedido seguinte daquele cantor com `KF001` —
> bloqueio permanente, não demora.
>
> **A regra agora mora num lugar só.** `ownActiveSongView`
> (`src/lib/rooms/queue.ts`) é a mesma função que o servidor
> (`readOwnActiveSong`) e que o navegador (`useOwnActiveSong`) usam. O que a suíte
> cobre: o contrato fechado dos 8 `playerVars`, a regra pura (incluindo
> "`played` não prende ninguém"), o hook com as três camadas, o card reagindo ao
> broadcast, o `release` no `Trancar TV` — e o caso que só apareceu ao testar a
> regra, de o **host** receber o aviso de substituição que não é dele.
>
> **Por que o release é uma RPC nova (`release_current_item`) e não uma
> mudança em `claim_next_song`:** o `20260927000032` (`playback_held`) **nunca
> existiu** — o diretório salta de `00031` para `00033`. Sem coluna nenhuma no
> banco, `claim_next_song` não tem como saber que a TV foi trancada; além disso
> ele só é chamado por uma TV **armada**, que é justamente o estado em que não
> há nada a liberar. Quem sabe que trancou é o próprio quiosque, e é ele quem
> paga a conta — antes de limpar a marcação de armada no `localStorage`.
>
> **Banco coberto por smoke, não só pela suíte:** a migration
> `20261005000044` foi aplicada no Supabase Cloud e o
> **`scripts/smoke-release-current-item.sql` rodou 11/11 lá** (autossuficiente,
> sala `SMOKE8G`, formato do `smoke-player-session`): `KF001` recusa enquanto
> toca → release devolve `approved` na mesma posição e `idle` → sem música no
> ar `released:false` → token errado não cai para sessão → host libera pela
> sessão → forasteiro não libera → sala encerrada recusa → **depois do release
> o cantor pede de novo**. **Rodar:**
> `node scripts/apply-sql.mjs scripts/smoke-release-current-item.sql 8000`.

**Legenda (decisão do dono, 2026-10-05 — deve permanecer desligada)**

- [ ] **Nenhum texto de IA sobre a música**: com a faixa tocando na TV, não
      aparece nenhuma linha de transcrição automática sobre o vídeo, e o botão
      de legendas (`.ytp-subtitles-button`) não oferece faixa nenhuma.
- [ ] **Os 8 knobs estão lá** (isso é o que a suíte garante; aqui é só olhar):
      `autoplay: 0`, `controls: 1`, `rel: 0`, `fs: 0`, `playsinline: 1`,
      `iv_load_policy: 3`, `cc_load_policy: 0`, `origin`. Se qualquer um
      sumir da tela **e** o teste de contrato continuar verde, o teste foi
      afrouxado — a lista é `toEqual`, então acrescentar também falha.

**Busca destravando sozinha (o relato original: "demora")**

- [ ] **No meio da música, o botão está travado**: participante que tem faixa
      em `playing` vê o aviso de que já tem música e não consegue pedir.
- [ ] **A música termina na TV → o botão destrava em segundos, sem F5**: a
      TV faz `claim_next_song`, e o celular com a tela de busca **aberta**
      reage pelo `postgres_changes`/broadcast/poll. Navegar para outra tela e
      voltar também destrava (o `revalidatePath` de `/buscar`).
- [ ] **O aviso cita a música certa**: na fila (ainda não tocando) o texto
      nomeia o pedido que vai sair; tocando, diz que está tocando; depois de
      ouvir, o aviso some. O host **nunca** vê esse aviso.
- [ ] **Sem nada na fila, sem nenhum aviso** — e se a leitura falhar, a tela
      libera o pedido (quem decide é a trigger no banco, então isso é seguro).

**`release_current_item` — o item preso em `playing`**

- [ ] **Travar a TV com música no ar libera o cantor**: com a faixa tocando,
      aperte "Trancar TV". No banco: o item volta para `approved` **na mesma
      posição**, `rooms.current_item_id` fica nulo e `playback_status` vai para
      `idle`. No celular do cantor: o botão de pedido destrava **na hora**.
- [ ] **A fila não pula ninguém**: quem estava atrás dele continua na mesma
      posição, e a faixa devolvida volta a tocar quando a TV for rearmada.
- [ ] **Falha de rede no release não impede o travamento**: corte a conexão e
      trave a TV — o gate aparece do mesmo jeito e o `localStorage` fica sem a
      chave `kf:player-armed:<código>` (a suíte cobre este caso).
- [ ] **Sem música no ar, "Trancar TV" não muda nada** (a RPC responde
      `released: false` e nada é anunciado).
- [ ] **Cobertura faltante, assumida:** fechar o navegador/TV no meio da faixa
      não dispara `release` nenhum. Enquanto isso, quem destrava é o host com
      **Pular/Parar**, que já terminaliza o item. Se um cantor aparecer travado
      numa sala, este é o caminho manual.

**Card "Player da TV" ao vivo**

- [ ] **O card acompanha a TV sem recarregar**: host com a sala aberta vê
      "Pausar" enquanto toca; quando a música termina na TV, o card vira
      "Tocar"/"Retomar" e desabilita Pular/Parar em ~1–2s. Antes desta fase ele
      mostrava "Retomar" a noite inteira.
- [ ] **`Pular`/`Parar` do host atualizam o próprio card** na hora.
- [ ] **Fila esvaziando**: com a última música indo para `played`, o card passa
      a dizer "Nenhuma música aprovada na fila." e some o botão de tocar.
- [ ] **Tela travada no celular por > 30s e voltando**: o card relê no foco
      (é o caso real do bar — o host deixou o celular na mesa).

### 3.17 Fase 16 — mesas: 1 por padrão, até 10, e mesa única que não pergunta (2026-10-08)

**Banco (já medido — `scripts/smoke-mesas.sql`, 12 passos verde no Cloud)**

Rodar: `node scripts/apply-sql.mjs scripts/smoke-mesas.sql 9000`

- [x] `create_bar` recusa 11 mesas ("quantidade de mesas inválida (1–10)") e
      aceita 10 materializando 10 linhas de `mesas`.
- [x] Os checks do banco barram um insert direto de 11 em `bars` (23514) e em
      `mesas.numero` (23514). O passo de `bars` impersona quem **não** tem bar,
      senão o gatilho `bars_guard_insert` (00036) barra antes e esconde a medição.
- [x] ZEHBAR ficou com **10 mesas**, zero linha acima de 10.
- [x] `update_bar_mesas` pelo dono: 10 → 2 apaga as linhas e **realoca** quem
      estava na mesa 5 para a mesa 1 (`reallocados: 1`); não-dono leva
      "bar não encontrado"; 0, 11 e `null` são recusados.
- [x] **Auto-mesa-1**: bar de 1 mesa + `join_room(código, null, …)` devolve
      `mesa_numero = 1`; bar de 2 mesas continua devolvendo `null`; **espectador**
      (`fora_do_raio`) em bar de 1 mesa continua `null` — quem está de fora não
      senta, e sentá-lo mentiria para o card de ocupação do host.

**Aparelho (falta — fazer no ZEHBAR)**

- [ ] **Bar de mesa única não pergunta**: entrar pelo código numa sala de 1 mesa
      e cair **direto na tela com a fila/botão de pedir música**, sem `MesaPicker`
      no caminho. O participante vê a mesa 1 no card de ocupação do host.
- [ ] **Bar com 2+ mesas continua perguntando**: mesma entrada em `BARSEG`
      (6 mesas) mostra a grade e o `MesaPicker` só some depois de escolher.
- [ ] **Espectador continua sem mesa**: quem está fora do raio entra num bar de
      1 mesa e aparece como "sem_mesa" no painel do host.
- [ ] **Criar bar com 10 mesas**: modal de criação recusa 11 (o `max` do input é
      10) e a grade do QR de mesas desenha 10; criar com **1** não mostra o botão
      de QR por mesa (só o QR do bar).
- [ ] **Host muda as mesas pelo card "Mesas do bar"**: aumentar 1→10 insere as
      linhas na hora (o QR por mesa passa a aparecer); diminuir 10→1 pede
      confirmação e, se houver gente sentada nas mesas removidas, o toast diz
      quantas foram para a mesa 1.
- [ ] **Membro antigo em bar de 1 mesa** (entrou antes da migration) já aparece
      sentado na mesa 1 — o backfill cobre, e o `MesaPicker` não volta a aparecer.

---

### 3.18 Fase 17 — quatro telas de configuração + host pede música (2026-10-08)

**Coberto pela suíte (roda no `npm test`)**

- [x] `settings/room-behavior-card` (4): os quatro toggles, a pré-aprovação
      **ligada, esmaecida e travada** e o rollback quando o servidor recusa.
- [x] `settings/youtube-settings-card` (9): os textos que não podem voltar a
      mentir (cota é do projeto, "não cria uma cota separada", "Conectar conta do
      YouTube", chave sem "opcional", Google Cloud/restrição/Referer), o link de
      OAuth com o código da sala, remover chave gravando `null` e o card de conta
      conectada.
- [x] `settings/mesas-bar-card` (5): faixa 1–10, aumento sem confirmação,
      **redução com confirmação** (cancelar não grava) e o toast de realocados.
- [x] `settings/room-code-card` (4): input travado no código atual, caixa alta,
      navegação para `/salas/<novo>/sala` e recusa do servidor sem navegar.
- [x] `host-screen-nav` (3): as três telas da sala, o quarto link só com bar, e
      o texto de cada item.
- [x] `queue-list` (+2): o host vê **"Pedir música"** nos dois lugares, e um
      não-host sem permissão continua sem o atalho.
- [x] `song-search` (+1): o passo de configuração leva para `/bar/<código>` quando
      a sala tem bar e para `/salas/<código>/player` quando não tem.
- [x] `npm run lint`, `npm run typecheck`, `npm test` (**729 testes, 56
      arquivos**) e `npm run build` — as rotas novas aparecem no output
      (`/bar/[codigo]`, `/salas/[codigo]/{player,sala,pulseiras}`).

**Aparelho (falta — fazer no ZEHBAR)**

- [ ] **Tela ao vivo**: `/salas/<código>` mostra fila + mesa + código, e o host
      vê a navegação **Player · Sala · Pulseiras · Bar**; o participante **não
      vê** essa navegação.
- [ ] **Host-only de verdade**: logado como participante, digitar
      `/salas/<código>/sala` (ou `/player`, `/pulseiras`) volta para a sala;
      digitar `/bar/<código>` de um bar que não é seu cai no dashboard; sem
      sessão, `/bar/...` manda para o login preservando o `next`.
- [ ] **Player**: link da TV copiável/rotacionável, fila com aprovação e
      **"Pedidos de entrada" aparecendo só com "Entrada livre" desligado** (ligado,
      o card some).
- [ ] **Sala**: 4 toggles salvam e a tela ao vivo já reflete o badge novo; QR do
      bar + QR por mesa; mesas 1–10 (com confirmação ao diminuir); quem está na
      sala; trocar o código leva para a rota nova.
- [ ] **Bar**: raio de presença gravando e valendo para o gate; **um card de
      busca do YouTube por sala**; salvar a chave/desconectar refaz a busca sem
      recarregar a página.
- [ ] **Pulseiras**: rota abre com os dois cards esmaecidos e nenhum botão que
      grave.
- [ ] **Host pede música**: do botão "Pedir música" na própria sala — entra na
      fila sem limite (fila manual: fica pendente e ele mesmo aprova); em **outra**
      sala ele é participante comum (geolocalização e aprovação valem).
- [ ] **Dashboard**: o botão **Bar** em cada bar abre `/bar/<código>`.

---

### 3.19 Fase 18 — pulseira: código/QR de uso único, gate de cantar no banco (2026-10-08)

**Coberto pela suíte (roda no `npm test`)**

- [x] `src/lib/bars/pulseiras.test.ts` (regras puras): `horaEmMinutos`,
      `formatHora`, `formatCentavos` (com espaço estreito de `Intl` — matcher
      nunca numa string exata), `reaisParaCentavos`, `horaLocalPulseira`
      (fuso `America/Sao_Paulo`), `precoPulseiraHoje` (cobre agora, desempate
      pela faixa de início mais tarde, retorna `null` sem faixa) e
      `pulseiraStatus` (disponível / usado / expirado).
- [x] `src/lib/bars/qr.test.ts` (+ pulseira): URL de resgate para
      `/entrar?pulseira=…` com `bar`/`pulseira` no token, normalização de
      minúscula (o `isCode` é case-sensitive e o parâmetro é capitalizado antes
      de casar — o bug desta fase), inválida recusada e base explícita.
- [x] `pulseira-entry-card.tsx` (8): cartaz "valor de hoje", campo + botão
      Ativar chamando `resgatarPulseiraAction`, estado ativa com
      `tem_pulseira`, bloco **anônimo** ("Crie uma conta…"), card oculto com bar
      OFF e host sem bar.
- [x] `npm run lint`, `npm run typecheck`, `npm test` (**768 testes, 58
      arquivos**) e `npm run build` (a rota dinâmica `/salas/[codigo]/pulseiras`
      aparece no output).
- [x] **`scripts/smoke-pulseiras.sql` — 31/31 no Supabase Cloud em 08/10/2026**
      (transacional, `begin`/`rollback`): contrato novo do `create_bar` (10
      argumentos — a chamada de 9 cai em "does not exist"), `pulseiras_ativadas`
      gravado e lido pelo `get_entry_preview`, lote default de 10 códigos de 6
      chars em `24h`, recusas de 0/101/não-dono, RLS de `pulseiras_codigos`
      (invisível ao não-dono), faixa de preço criada/sobreposta
      (`tsrange` ancorado — **não existe `timerange` no PG**)/vigente/removida,
      `resgatar_pulseira` (congela o preço, `JA_TEM_ACESSO`, `CODIGO_USADO`,
      `CODIGO_INVALIDO`, `ANONYMOUS` **sem queimar a pulseira**,
      `PULSEIRA_INATIVA`, renovação de acesso expirado), o gate `KF002`
      (não-host sem acesso barrado, host isento, com acesso liberado) e
      `member_entry_state` nas três caras (true/true, true/false, false/false).
      Roteiro e as três armadilhas corrigidas no caminho estão no bloco da Fase
      18 do `TODO.md`.

**Coberto pelo gate no banco (não é UI — o smoke prova)**

- [x] Duas contas não usam o mesmo código (`CODIGO_USADO`).
- [x] Conta anônima não resgata (`ANONYMOUS`) e o código continua vivo.
- [x] Bar com toggle OFF: sem cartaz de resgate (`PULSEIRA_INATIVA`) e sem gate
      no pedido de música (trigger devolve o insert ao normal).
- [x] Acesso vigente bloqueia segundo resgate; acesso **expirado renova**.

**Aparelho (falta — fazer no ZEHBAR)**

- [ ] **Host**: `/salas/<código>/pulseiras` — liga o switch, gera lote (input de
      1–100), a folha de QR sai imprimível (`Ctrl+P` mostra só os códigos) e o
      QR aponta para `/entrar?pulseira=…` com o código certo; desligar o switch
      escurece os dois cards e some o cartaz do `/entrar`.
- [ ] **Cartaz**: montar faixa "hoje, 18:00–23:59, R$ 15" e ver o **preço de
      hoje** em destaque no card do host e no `/entrar` do cliente logado.
- [ ] **Resgate**: logado, escanear o QR do balcão (abre `/entrar` pré-preenchido)
      e também digitar o código à mão; o botão confirma e a fila **libera o
      pedido**; o mesmo código reapresentado (ou digitado por outra conta) recusa
      "já usado".
- [ ] **Anônimo**: sem login, o card manda "Crie uma conta…" — o resgate não
      passa nem com código válido.
- [ ] **Host isento**: o dono da sala pede música sem ativar pulseira (e, com
      bar OFF, ninguém é barrado).
- [ ] **Sala ao vivo**: participante sem pulseira vai pedir e o aviso de
      "pulseira exigida" aparece na UI (o adversário de verdade é o `KF002`).

---

## 4. Definição de pronto (DoD)

Uma fase/feature só é considerada pronta quando:

- [ ] Lint + typecheck + build passam.
- [ ] `npm run scan:secrets` passa (link da TV é credencial, e o repositório é público — ver `docs/engenharia/pos-mortem-smoke-playback.md` §3.11).
- [ ] Testes unitários/integração da feature existem e passam (Vitest).
- [ ] Fluxo validado manualmente conforme checklist funcional da fase.
- [ ] Casos RLS/segurança da feature têm cobertura (teste ou validação manual documentada).
- [ ] CHANGELOG atualizado com a mudança.
