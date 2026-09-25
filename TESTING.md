# Estratégia de Testes — Karaokê Watch Party

Documento que define como testamos o projeto, dividido em duas partes:

1. **Boas práticas e stack** — convenções para testes unitários, de integração e e2e.
2. **Etapas de testes funcionais** — checklist de verificação à parte do código, por fluxo de negócio.

> Status: **Vitest + RTL + jsdom** configurados; **MSW instalado na Fase 4**. **Etapa atual (2026-09-25):** suite com **180 testes** (rooms/utils + `deriveRoomCodeFromName`, `src/lib/bars/qr.test.ts` 21, i18n, cookies/geo, Onboarding, `src/lib/youtube/*` 31, `queue` com a matriz de presença, a rota `/api/youtube/search` com **18 provas via MSW** — incl. credencial OAuth via **Bearer** host/app — o **roundtrip authorize→callback** com 4 provas do estado, e a **entrada com aprovação**: `src/components/bars/entry-approval-wait.test.tsx` (11) + `src/components/bars/pending-entry-requests.test.tsx` (5) e `src/components/rooms/presence-gate-info.test.tsx` (6)). Playwright (e2e) entra na Fase 6. Este arquivo deve ser atualizado conforme as ferramentas entrarem no projeto.
>
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
- [ ] `npm test` (Vitest) passa — inclui também `src/components/bars/entry-approval-wait.test.tsx` (11 testes: espera, aprovação automática, rejeição, cleanup do canal, cancelar, cancelado × encerrada), `src/components/bars/pending-entry-requests.test.tsx` (5 testes: lista de pedidos e cancelar) e `src/components/rooms/presence-gate-info.test.tsx` (6 testes: aviso do gate nos dois modos, mapa com o raio, campo bloqueado, raio novo, bar sem coordenadas) — **180 testes** no total.
- [ ] **Raio de presença no painel do host (2026-09-25):** com o toggle "Entrada livre" **ligado**, o card "Raio de presença" diz que o gate bloqueia fora de **500 m** mesmo com entrada direta (e que o host nunca é bloqueado); o mapa mostra o círculo no endereço do bar com "500 m a partir do bar"; o campo "Raio de presença" está **desabilitado** em `500 m` com "Personalização em breve"; bar sem coordenadas mostra o aviso de que todo participante é bloqueado. Ligar/desligar o toggle troca o texto do aviso na hora.
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

### 3.6 Player device (Fase 6)

- [ ] `/player/[code]` acessível **sem login**.
- [ ] Primeira reprodução exige um toque (autoplay).
- [ ] Eventos `play/pause/skip/queueUpdated/reorder` refletem na tela sem reload (< 2s).
- [ ] Pré-carregamento do próximo vídeo (transição sem tela preta).
- [ ] Nenhum overlay sobre o player do YouTube (restrição da TOS).
- [ ] Fila legível a distância, com destaque na "próxima música".
- [ ] Estado vazio: QR grande + CTA "escaneie para adicionar uma música".
- [ ] Sessão estável por horas (reconexão do Realtime automática).

### 3.7 Controle do host (Fase 7)

- [ ] Play/pause/skip/next do celular refletem na tela.
- [ ] Estado `playing`/item atual persistem na sala.

### 3.8 Segurança / LGPD / NFR (Fase 8)

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
