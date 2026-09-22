# Estratégia de Testes — Karaokê Watch Party

Documento que define como testamos o projeto, dividido em duas partes:

1. **Boas práticas e stack** — convenções para testes unitários, de integração e e2e.
2. **Etapas de testes funcionais** — checklist de verificação à parte do código, por fluxo de negócio.

> Status: **Vitest + RTL + jsdom instalados e configurados na Fase 3** (`vitest.config.mts`, `src/test/setup.ts`, scripts `test`/`test:watch`/`test:coverage`; primeiros unitários: `src/lib/rooms/utils.test.ts`). **Etapa 1 (2026-09-21):** suite com **29 testes** (i18n, cookies de consentimento, geo, componente Onboarding) — `globals: true` no Vitest p/ autocleanup do RTL. MSW (mock de redes) e Playwright (e2e) entram nas próximas fases. Este arquivo deve ser atualizado conforme as ferramentas entrarem no projeto.

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

### 3.2 Salas — criar / entrar (Fase 3)

- [ ] Criar sala gera código de **6 caracteres únicos, não sequenciais**.
- [ ] QR code da sala abrange dados suficientes para entrar em 1 toque.
- [ ] Entrar via código digitado → entra direto com `entryMode=open`.
- [ ] Entrar via scan de QR → nome da sala aparece → confirma → entra.
- [ ] `entryMode=approval`: pedido de entrada fica `pending`; host aprova/rejeita pelo painel.
- [ ] Sair da sala remove membro; host fecha sala (`status=closed`).
- [ ] Toggles persistidos recarregam corretos ao reentrar na sala.

### 3.3 Busca YouTube (Fase 4)

- [ ] Busca com debounce (não dispara por tecla).
- [ ] `safeSearch=strict` aplicado (verificar no request).
- [ ] Resultados com thumbnail + título + duração.
- [ ] **Chave não aparece em nenhum request do client** (inspecionar DevTools → Network).
- [ ] Quota esgotada → mensagem amigável "tente novamente mais tarde".
- [ ] Rate limit por usuário/IP bloqueia spam de buscas.

### 3.4 Fila — adicionar música (Fase 5)

- [ ] `queueApprovalMode=auto`: música entra direto na fila.
- [ ] `queueApprovalMode=manual`: música entra `pending`; host aprova/rejeita.
- [ ] **`requireSongConfirmation=true`**: ao clicar "Adicionar à fila", abre modal com thumbnail + título + duração; "Cancelar" não adiciona; "Confirmar" adiciona.
- [ ] **`requireSongConfirmation=false`**: adiciona direto, sem modal.
- [ ] Toggle `requireSongConfirmation` presente na config da sala (host) e persistido.
- [ ] Concorrência: dois usuários adicionam ao mesmo tempo → posições distintas na fila (sem corrida).
- [ ] Estados visuais: `pendente` vs `na fila` vs `tocando` legíveis.
- [ ] Reordenação e remoção apenas pelo host (validação no backend, não só UI).

### 3.5 Player device (Fase 6)

- [ ] `/player/[code]` acessível **sem login**.
- [ ] Primeira reprodução exige um toque (autoplay).
- [ ] Eventos `play/pause/skip/queueUpdated/reorder` refletem na tela sem reload (< 2s).
- [ ] Pré-carregamento do próximo vídeo (transição sem tela preta).
- [ ] Nenhum overlay sobre o player do YouTube (restrição da TOS).
- [ ] Fila legível a distância, com destaque na "próxima música".
- [ ] Estado vazio: QR grande + CTA "escaneie para adicionar uma música".
- [ ] Sessão estável por horas (reconexão do Realtime automática).

### 3.6 Controle do host (Fase 7)

- [ ] Play/pause/skip/next do celular refletem na tela.
- [ ] Estado `playing`/item atual persistem na sala.

### 3.7 Segurança / LGPD / NFR (Fase 8)

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
