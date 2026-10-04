# ADR-003: RLS como parede primária + RPCs `security definer` + Travas Bypass-Proof

**Status:** `Accepted`  
**Data:** 2026-10-04  
**Autores:** Engenharia  
**Tags:** segurança, RLS, Postgres, Supabase, RPC, security definer, multi-tenancy, hardening, auditoria

## 1. Contexto

O projeto adota **multi-tenancy forte** (`bar_id`/`room_id` em praticamente toda tabela), com isolamento entre bares/salas e papéis distintos (host, membro aprovado/pendente, anônimo, dev). Supabase/PostgREST expõe operações REST/SQL via API com JWT do usuário; além disso, existem caminhos diretos via PostgREST (INSERT/UPDATE/DELETE com filtros) que podem contornar lógicas apenas em aplicação.

Em fases de hardening (Fase 8c) foi realizada uma **auditoria sistemática de RLS** com **58 casos** (ataques que **devem falhar** vs. legítimos que **devem passar**), documentada em [`docs/engenharia/auditoria-rls.md`](../engenharia/auditoria-rls.md). Essa auditoria evidenciou vetores onde **RLS sozinho não fecha certos bypasses** (ex.: criação de domínio via INSERT direto, reescrita de colunas de escopo, caminhos host-only expostos indevidamente) e a necessidade de **travas no banco** (BEFORE INSERT/UPDATE) além de políticas por linha.

## 2. Problema

Definir o modelo de **controle de acesso e isolamento de dados** que seja:

1. **Parede primária no banco** (defense-in-depth): privilégios não dependem apenas da aplicação.
2. **Eficaz contra bypass via PostgREST/REST** (INSERT/UPDATE direto): RLS filtra linhas existentes/afetadas, mas não impede inserções com escopo incorreto por si só em todos os casos sem políticas bem projetadas + gatilhos de domínio.
3. **Clareza de autorização**: separar **políticas de leitura/escrita por linha (RLS)** de **operações transacionais complexas/host-only (RPCs)**.
4. **Auditável e medido**: verificável por **smokes SQL** com `set local role anon/authenticated` (não confiar apenas em service role/BYPASSRLS).
5. **Bypass-proof para regras de domínio**: travar limites de produto (1 bar=1 karaokê, teto por papel `dev_accounts`, não-host não cria domínio) em nível de banco (`BEFORE INSERT/UPDATE`).
6. **Minimizar vazamento de colunas sensíveis**: evitar expor `player_token`, segredos de sala ou PII além do estritamente necessário (preferir views + RPCs com retorno controlado).

## 3. Alternativas Consideradas

| Alternativa | Prós | Contras |
|---|---|---|
| **A. Somente lógica na aplicação (server actions/route handlers)** — autorização validada em código, DB com RLS frouxo/relaxado. | Rápido, flexível, fácil de testar unitariamente. | **Confiança única** (application-layer). Qualquer chamada direta via PostgREST/SQL (service role mal usado, cliente com token elevado, erro de rota) ignora checagens. Não é defense-in-depth. Difícil de auditar de forma determinística com roles anon/auth. |
| **B. RLS como parede primária + acesso via RPCs `security definer` (host-only/complexas)** — políticas RLS estritas por `room_id/bar_id/user_id/role`, operações sensíveis/host-only expostas como RPCs `security definer` com checagens internas (`is_host`, escopo, ownership), retornos projetados. Regras de domínio em `BEFORE INSERT/UPDATE` (bypass-proof). | **Banco-como-parede** (defense-in-depth). Eficaz contra bypass via PostgREST. Superfície de API reduzida/explicitada. Fácil de auditar com `set local role` (smokes). Isolamento por tenant robusto. Alinha com auditoria de 58 casos. | Mais verboso (SQL/policies + RPCs). Requer cuidado com `security definer` (deve **validar escopo + papel** internamente, nunca confiar em parâmetros não validados sozinhos). Curva de aprendizado Postgres/RLS. |
| **C. RLS muito restritivo + acesso 100% via service role (backend)** — bypass RLS no backend, autorização toda no app. | RLS não complica queries, controle centralizado. | Perde vantagem de "parede no banco" por linha. Risco de vazamento/escopo incorreto se qualquer rota esquecer de filtrar por tenant. Difícil provar isolamento com testes de ataque no nível DB. |
| **D. Somente RLS (sem RPCs, sem triggers de domínio)** — expor CRUD REST, confiar em policies. | Menos camadas. | **Insuficiente p/ bypass-proof de domínio**: PostgREST permite INSERT com valores, políticas RLS de `INSERT` avaliam NEW/constraints mas regras de "limite por conta" (1 bar/sala, teto dev, proibir auto-promoção) são mais robustas com `BEFORE INSERT/UPDATE` + RPCs que impõem contrato. Também colunas sensíveis (ex.: `player_token`) dificilmente ficam bem isoladas via CRUD genérico sem views/RPCs com projeção. |

## 4. Decisão

**Aceitar (Accepted): Alternativa B — RLS como parede primária + RPCs `security definer` para operações sensíveis/complexas + gatilhos `BEFORE INSERT/UPDATE` para regras de domínio (bypass-proof).**

Princípios adotados:

1. **RLS = Parede primária**. Nenhuma tabela multi-tenant deve ficar com RLS desativado sem justificativa explícita e auditada. Policies expressam: *quem* pode ler/atualizar/deletar *quais linhas* (`room_id/bar_id`, `host_id`, membership, papel dev, flags).
2. **CRUD genérico com cautela**: quando exposto via REST, RLS deve bastar p/ casos legítimos. Para **ações de negócio host-only, transacionais ou com projeção restrita** (moderação de fila, trocar música mantendo posição, encerrar sala, rotate player token, claim_next_song) usar **RPCs `security definer`** com validações internas explícitas (ownership/`is_host`, escopo por `room_id`/`room_code`, estados permitidos).
3. **Nunca confiar cegamente em `security definer`**. Todo RPC `security definer` **deve revalidar**: escopo (pertence ao mesmo bar/sala), papel (`is_host()`/membership), estado (sala ativa/encerrada), limites de domínio. Parâmetros são entrada não confiável.
4. **Regras de domínio = bypass-proof**. Limites de produto críticos (ex.: **1 bar = 1 karaokê**, criação restrita p/ não-host, teto de bares/salas por host, **auto-promoção bloqueada**, não re-apontar `bar_id` para bar alheio) são aplicados em **`BEFORE INSERT/UPDATE`** (`CREATE TRIGGER ... BEFORE INSERT/UPDATE`). Isso fecha vetores de `INSERT/UPDATE` direto via PostgREST que RLS sozinho não cobre completamente.
5. **Menor vazamento de colunas**: dados sensíveis (`rooms.player_token`, segredos operacionais) não precisam ser expostos via CRUD genérico. Preferir **views com projeção restrita** (ex.: `profiles_public` invoker) e **RPCs com `RETURNS TABLE` projetado**. Colunas sensíveis têm acesso restrito por role/policy.
6. **Auditoria medida**: validar com **smokes SQL** rodando com `set local role anon` e `set local role authenticated` (o `postgres` com BYPASSRLS não deve ser usado para "provar" parede). Separar casos **legítimos (devem passar)** de **ataques (devem falhar)** — um legítimo quebrado é alarme tão sério quanto ataque passando.
7. **Princípio: RLS decide por linha; domínio trava por invariantes**. Combinação complementar (não redundante desnecessária).

## 5. Trade-offs

| Ganhos (Segurança/Robustez) | Custos/Trade-offs (Complexidade) |
|---|---|
| **Defense-in-depth**: múltiplas camadas (policies + triggers + RPCs com validação). Isolamento resiste mesmo a chamadas diretas via REST/SQL. | **Mais SQL**: policies + triggers + RPCs exigem disciplina e revisão cuidadosa. |
| **Bypass-proof**: fecha caminhos que CRUD+RLS genérico deixaria abertos (inserção com escopo incorreto, limites por conta). | **Complexidade cognitiva**: mistura RLS (row-level, por role JWT) com `security definer` (contexto elevado) — exige documentação clara. |
| **Auditável deterministicamente**: smokes com `set local role` provam parede (sem confiar em BYPASSRLS). Matriz ataque vs. legítimo evita falso verde. | **Manutenção**: mudanças de domínio precisam atualizar triggers+policies+RPCs de forma consistente. |
| **Superfície explícita**: ações de negócio são contratos (RPCs) com retorno controlado (menos over-fetching/colunas sensíveis). | **Debugging**: erros de RLS aparecem como "permission denied" genéricos — exige `diagnose:*`/logs para rastrear (mitigado com `diagnose:queue`). |
| **Multi-tenancy comprovado**: `bar_id/room_id` obrigatório, isolamento medido por testes de ataque. | |
| **Segurança por padrão**: fail-closed — negar por padrão, permitir casos explícitos. | |

## 6. Consequências

### Positivas
- **Auditoria fechada com medida**: 58 casos verificados ([`smoke-rls-audit.sql`](../../scripts/smoke-rls-audit.sql)) — separa ataques que devem falhar vs. legítimos que devem passar. Resultado mensurável (`falhas==0`, `legitimos_quebrados==0`).
- **Isolamento resistente a bypass**: vetores identificados (F1–F7 na auditoria) foram fechados com combinação de **REVOKE/GRANT corretos**, **policies reforçadas**, **views invoker**, **triggers de domínio** e **RPCs host-only**. Sem depender só de aplicação.
- **Domínio travado no banco**: `bars/rooms` com BEFORE INSERT/UPDATE impedem criação além do teto (dev vs. não-dev), não-host não cria, não permite re-apontar `bar_id` para bar alheio, auto-promoção bloqueada — **bypass-proof** via PostgREST.
- **Superfície de ataque reduzida**: ações críticas (moderação fila, trocar música mantendo posição, encerrar sala, rotate player token, claim_next_song) expostas como **RPCs com contrato explícito** + validação interna. CRUD restrito por RLS.
- **Menor vazamento de PII/segredos**: `profiles_public` como **security_invoker** (visão por invocador), colunas sensíveis com acesso restrito, projeções controladas em RPCs.
- **Defesa em profundidade consistente**: combina com isolamento de player ([ADR-002](./ADR-002-player-isolated-by-token-and-kiosk-only.md)) (credencial distinta + escopo estrito).
- **Ferramentas de diagnóstico**: [`npm run diagnose:queue`](../../package.json) reproduz erro cru de action de fila (útil p/ distinguir "botão não faz nada" vs. violação de RLS/estado).

### Negativas
- **Overhead de complexidade SQL**: exige revisão de código em policies/triggers (menos trivial que ifs em TS). Mitigado com **documentação de auditoria + smokes**.
- **`security definer` exige disciplina**: alto privilégio de execução — **regra de ouro**: **nunca omitir revalidação** (owner, host, `room_id/bar_id`, estado). Qualquer parâmetro usado para escopo deve ser validado contra membership/ownership.
- **Mensagens de erro menos amigáveis**: violações de RLS retornam 403/permission denied genéricos via PostgREST — UX precisa traduzir casos de negócio (ex.: `OUTSIDE_BAR`) quando vierem de RPCs/actions (preferir retornar erro de domínio claro nos RPCs/actions, não só falha de policy).
- **Custo de manutenção**: renomear colunas/alterar chaves exige sincronizar policies/triggers. Coberto por migrations versionadas (`supabase/migrations/*`).
- **Risco de GRANT incorreto**: `TRUNCATE` ignora `REVOKE` de coluna, `GRANT` excessivos aumentam superfície — auditado e corrigido (F5 na auditoria). Requer atenção em ACLs.

## 7. Implementação (Referências)

### Auditoria & Smokes
- **Relatório de auditoria (fechamento):** [`docs/engenharia/auditoria-rls.md`](../engenharia/auditoria-rls.md) — descreve F1–F7, armadilhas (REVOKE de coluna, BYPASSRLS, PostgREST bypass), o que fecha cada defeito.
- **Smoke RLS Audit (69 casos, medido em 04/10):** [`scripts/smoke-rls-audit.sql`](../../scripts/smoke-rls-audit.sql) — roda com `set local role anon/authenticated`, separa **legítimos** vs. **ataques**, exige `falhas==0` e `legitimos_quebrados==0`.
- **Outros smokes relevantes:** [`scripts/smoke-dev-role.sql`](../../scripts/smoke-dev-role.sql) (15/15, inclui 5 casos de bypass INSERT/UPDATE direto), [`scripts/smoke-player-session.sql`](../../scripts/smoke-player-session.sql), [`scripts/smoke-playback.sql`](../../scripts/smoke-playback.sql).
- **Diagnóstico:** [`scripts/diagnose-queue-actions.mjs`](../../scripts/diagnose-queue-actions.mjs) (`npm run diagnose:queue`) — reproduz erro cru (Postgres/RLS) de actions de fila.

### Migrations (exemplos de endurecimento)
- Domínio/travas: [`supabase/migrations/20260930000036_hardening_bars_rooms.sql`](../../supabase/migrations/) — BEFORE INSERT/UPDATE p/ bars/rooms (teto dev, não-host, bypass-proof).
- Auditoria/endurecimento: [`supabase/migrations/20261002000038_rls_audit_fixes.sql`](../../supabase/migrations/), [`20261002000039_rls_audit_fixes_part2.sql`](../../supabase/migrations/) — correções F1–F7 medidas.
- Presença/regras de fila: [`supabase/migrations/20261003000040_room_members_presence.sql`](../../supabase/migrations/), [`20261003000041_presence_outside_bar.sql`](../../supabase/migrations/) — aplica regras de "fora do raio" no banco (`addSongToQueueAction`, `pick_mesa`, `claim_next_song`) com retornos de erro de domínio (`OUTSIDE_BAR`).
- Limite de fila: [`supabase/migrations/20261004000042_fila_uma_musica_ativa.sql`](../../supabase/migrations/) — `before insert` em `queue_items` garante **uma música ativa por participante não-host** (`pending`/`approved`/`playing`): pedir outra substitui a anterior, e pedir com uma tocando é recusado (`KF001`). É o exemplo mais limpo do padrão **trigger sem `security definer`**: o `delete` da substituição passa pela policy do autor (`queue_items_delete_own`), então a RLS é o muro em vez de um privilégio novo.

### Código (padrão prático)
- **RPCs/ações servidor:** [`src/lib/rooms/actions.ts`](../../src/lib/rooms/actions.ts), [`src/lib/rooms/*`](../../src/lib/rooms/) — ações de negócio (host-only) com validações + tratamento de erros de domínio.
- **Policies & schema:** `supabase/migrations/*` — fonte da verdade de RLS/triggers (versionado). Policies por tabela com `using`/`with check` explícitos.
- **Views com invoker:** `profiles_public` security_invoker (não security_definer) — evita elevar privilégios indevidamente p/ leitura pública controlada.

## 8. Boas Práticas (Hardening Checklist)

Ao alterar acesso a tabelas multi-tenant:

- [ ] **Default deny**: negar por padrão. Só permitir casos explícitos em policies/RPCs.
- [ ] **Multi-tenant obrigatório**: toda policy filtra por `bar_id` e/ou `room_id` (escopo estrito). Nunca "global" sem justificativa + auditoria.
- [ ] **Revalidar em `security definer`**: todo RPC security_definer valida `is_host()`/ownership, escopo (`room_id/bar_id`), estado (ativa/encerrada). **Nunca confie só em parâmetro**.
- [ ] **Bypass-proof de domínio**: invariantes críticos em `BEFORE INSERT/UPDATE` (triggers). Fechar caminho INSERT/UPDATE direto.
- [ ] **Testar com roles reais**: rodar `smoke-rls-audit.sql` (anon+authenticated) após mudanças de RLS/policies/triggers. Alvo: `falhas==0` **e** `legitimos_quebrados==0`.
- [ ] **Projeção mínima**: views/RPCs retornam apenas colunas necessárias. Colunas sensíveis não expostas via CRUD.
- [ ] **Diagnóstico quando "não faz nada"**: usar `npm run diagnose:queue` p/ obter erro cru (Postgres) antes de assumir bug de UI.
- [ ] **Evitar BYPASSRLS p/ prova**: prova de parede é com role da API (`anon/authenticated`), não `postgres` com BYPASSRLS.
- [ ] **Sem auto-promoção não intencional**: triggers bloqueiam elevação indevida de papel (host/dev). Policies impedem `with check` que permita escalar privilégios.

## 9. Revisão

Esta ADR permanece **Accepted**. Qualquer alteração significativa em modelo de acesso (reestruturação de roles, exposição de novas tabelas multi-tenant, mudança de superfície RPC/CRUD) **deve** ser acompanhada por:

1. Atualização de policies/triggers + migrations
2. Execução e passagem dos **smokes de RLS** (`smoke-rls-audit.sql` + `smoke-dev-role.sql`)
3. Revisão cruzada (mínimo) com referência a [`auditoria-rls.md`](../engenharia/auditoria-rls.md)

**Conclusão:** A combinação **RLS (parede primária, por linha) + RPCs `security definer` (operações explícitas com validação interna) + triggers `BEFORE INSERT/UPDATE` (invariantes de domínio, bypass-proof)** é o modelo correto para este projeto (multi-tenant + hardening mensurável). Supera abordagens apenas em aplicação, é auditável por testes determinísticos e está alinhado com a engenharia de produção já demonstrada.