# Auditoria de RLS: os 6 defeitos, o que fecha cada um e o que sobrou (2026-10-02)

> **Por que este documento existe:** a Fase 8c·B rodou a auditoria e deixou 6
> defeitos medidos ([`TODO.md`](../../TODO.md) §Fase 8c·B). Este fecha os 6, com
> as migrations aplicadas no projeto Cloud e o mesmo smoke de 55 casos verde.
> Ele registra também **o que o smoke não prova** e **o que ficou medido e em
> aberto** — porque uma auditoria que só lista o que passou ensina metade.
>
> Roteiro: [`scripts/smoke-rls-audit.sql`](../../scripts/smoke-rls-audit.sql) ·
> migrations [`20260930000038_auditoria_rls.sql`](../../supabase/migrations/20260930000038_auditoria_rls.sql)
> e [`20260930000039_admin_rpc_execute_public.sql`](../../supabase/migrations/20260930000039_admin_rpc_execute_public.sql) ·
> armadilhas do ferramental: [`pos-mortem-smoke-playback.md`](./pos-mortem-smoke-playback.md).

---

## 1. Resumo

|                                     |                                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| **Defeitos fechados**               | F1, F2, F3, F4, F5, F6 — e um sétimo (F7) que a própria 00038 criou e a medição seguinte pegou                |
| **Migrations**                      | `00038` (as 6) e `00039` (EXECUTE das RPCs)                                                                                |
| **Smoke `smoke-rls-audit`**         | 55 casos, **0 vermelho**, **14/14 legítimos** verdes (era 45 casos, 8 vermelhos)                                        |
| **Outros smokes**                   | `smoke-playback` 20/20, `smoke-player-session` 17/17, `smoke-dev-role` 15/15, `smoke-profiles-public` 9/9             |
| **Gates locais**                    | 424 testes/35 arquivos, tsc, lint, build e `scan:secrets` verdes                                                            |
| **Medição mais recente (2026-10-04)** | **69 casos, 0 vermelho, 0 legítimos quebrados** — o placar acima é o do fechamento da auditoria; depois dele entraram as séries **S** (regra do espectador, `20261003000041`) e **Q** (uma música ativa por participante, `20261004000042`), que são **regras de produto**, não defeitos: por isso a coluna `ref` delas aponta para a série e não para F1–F7 |
| **Custo real**                      | 3 defeitos do **instrumento** (não do produto) descobertos ao rodar, que estavam mascarando leitura de segurança — §6     |
| **Continua sem verificação**        | o player real numa TV (Playwright) e as 37 funções `public` que ainda herdam `EXECUTE` de `PUBLIC` — §7                  |

---

## 2. Os defeitos e o que fecha cada um

| #    | Defeito medido                                                  | Fechado por                                                                                                          |
| ---- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| F1   | `rooms.youtube_api_key` sem ACL de coluna: qualquer participante aprovado da sala lia a chave do dono | `REVOKE SELECT` na tabela + `GRANT` das 14 colunas públicas; escrita só via `admin_set_room_youtube_api_key` (host) |
| F2   | `rooms.player_token`: a credencial do link da TV, exposta à mesma policy | idem (coluna fora do `GRANT`) + leitura só via `admin_get_room_player_token` (host)                              |
| F3   | `bars` com `using (auth.uid() is not null)`: qualquer logado lia nome, endereço e coordenada de **todos** os bars | policy `bars_select_own_or_room_bar` (o próprio bar ou o bar de uma sala aprovada)                              |
| F4   | `mesas` com a mesma policy aberta (18 linhas de todos os bares) e **nenhum consumidor no app** | policy `mesas_select_bar_host`                                                                                   |
| F5   | 60 `GRANT` de `TRUNCATE`/`TRIGGER`/`REFERENCES` (10 tabelas × 2 papéis × 3 privilégios) — `TRUNCATE` não passa por RLS | revogação explícita + `ALTER DEFAULT PRIVILEGES` para o que vier depois                                 |
| F6   | `room_members` sem `WITH CHECK`: o host reescrevia `user_id` e transplantava a participação para outra conta | `REVOKE UPDATE` na tabela + `GRANT UPDATE (status)`; o trigger `room_members_sync_approved_at` segue funcionando porque o colisor é a linha nova, não o ator |
| F7   | `anon` continuava com `EXECUTE` nas RPCs `admin_*` — `CREATE FUNCTION` dá `EXECUTE` a `PUBLIC`, e `PUBLIC` vale para todo papel, então `REVOKE ... FROM anon` tirava o nominal e deixava o efetivo | migration `00039`: `REVOKE EXECUTE ... FROM public` + `GRANT` a `authenticated` e `service_role`; casos H4/H5 no smoke |

### Por que F7 é o mais instrutivo dos sete

As três `admin_*` se defendem por **código**: `is_host(p_room_id, auth.uid())`, e
`auth.uid()` é NULO para `anon`, o que barra. Ou seja — **nada vazava, e mesmo
assim a ACL estava errada.** A proteção real era o `if` dentro da função, não o
privilégio. Um `admin_*` novo sem o `if` nasceria com o caminho já aberto, e o
smoke (que só checava `authenticated`) não veria. É a mesma classe de bug do F6:
a barreira que a gente *acredita* estar no banco e está no código.

---

## 3. A armadilha que quase passou: `REVOKE` de coluna não revoga nada

O conserto inicial de F1/F2 era `REVOKE SELECT (youtube_api_key) ON rooms FROM
anon, authenticated`. No dry-run, a checagem de privilégio continuou passando
verde. A razão está no `pg_class.relacl`: a tabela **já tinha** um `GRANT SELECT`
de nível tabela, e o `REVOKE` de coluna é aplicado **por cima** dele. O
`REVOKE (coluna)` só remove o que foi concedido *em nível de coluna*; o grant de
tabela continua concedendo a coluna. Para fechar de verdade:

```sql
revoke select on public.rooms from anon, authenticated;   -- tabela primeiro
grant  select (id, code, ...) on public.rooms to anon, authenticated;  -- e as 14 colunas
```

É por isso que o smoke checa `has_column_privilege` (o que o banco realmente
vai responder) e não a linha do SQL.

---

## 4. O desenho: por que view + RPC, e não policy

RLS decide por **LINHA**. Nenhuma policy consegue esconder uma coluna de um
participante e mostrá-la ao host: os dois são `authenticated`, na mesma tabela, na
mesma policy. A única forma de "só o host" em nível de coluna é **ACL de coluna +
RPC `security definer`** que valida o vínculo dentro do banco:

- **`rooms_public`** — view `security_invoker` com as 14 colunas públicas. Substitui
  os `select *` do app (que quebrariam: `*` expande para a coluna revogada e o
  banco responde `permission denied`).
- **`admin_get_room_player_token(uuid)`** — devolve o token, só para host.
- **`admin_get_room_youtube_api_key(uuid)`** — devolve a chave, só para host.
- **`admin_set_room_youtube_api_key(uuid, text)`** — grava a chave, só para host.

O prefixo `admin_` evita endpoint de nome adivinhável, mas a política de execução
é a ACL (§2, F7), não o nome.

### Call sites que mudaram

| Arquivo                                                                             | Antes                              | Agora                                                                                     |
| ----------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------------- |
| `src/app/(app)/dashboard/page.tsx`                                                   | 2× `from("rooms").select("*")`     | 2× `from("rooms_public")`                                                                  |
| `src/app/(app)/salas/[codigo]/page.tsx`                                             | `select("*")` + `player_token`      | `rooms_public` + as duas RPCs; `PlaybackControls` só renderiza com token não nulo          |
| `src/app/(app)/salas/[codigo]/buscar/page.tsx`                                       | `select("*")`                       | `rooms_public`                                                                              |
| `src/lib/rooms/actions.ts`                                                           | `update({ youtube_api_key })`       | `admin_set_room_youtube_api_key`                                                            |
| `src/app/api/youtube/search/route.ts`                                                | —                                   | autoriza com o **client do usuário** via `rooms_public` e lê a chave com `createAdmin()`   |
| `src/types/room.ts`                                                                  | `Room` com as duas colunas         | `Room` sem segredos + `RoomSecrets`                                                         |

A rota de busca é o ponto que merece atenção: a chave da API do YouTube é do
**dono da sala**, e o participant precisa dela para montar o link. Autorizar pelo
client do usuário (RLS, com o vínculo real) e ler o segredo com `createAdmin()`
(server-only) mantém a chave fora do browser — mas a **autorização** não é feita
pelo service role, que passaria por cima.

---

## 5. O que não muda (e é o que os 14 casos legítimos provam)

O alvo não era "trancar tudo": era trancar o que é segredo sem quebrar o produto.
O smoke tem 14 casos `LEGITIMO` que existem para provar que continuam passando:

- participante aprovado lê a própria sala, o próprio bar, a **própria fila** e o
  bar da sua sala;
- host lê o próprio bar e todos os membros da própria sala, e **pega o
  `player_token` pela RPC** (é assim que a TV abre o link);
- participante grava e apaga o **próprio** pedido de música e o trigger decide o
  status inicial;
- `anon` continua lendo `profiles_public` (decisão de produto: é o preview do
  entry); e-mail segue intocável;
- `authenticated` continua **alcançando** as três RPCs `admin_*` (H5) — senão o
  conserto vira "todo mundo trancado fora" em vez de "só o host".

RLS barrado devolve **0 linhas sem erro**, então "não(exception)" não prova nada:
o script conta linhas, não ausência de erro.

---

## 6. O que a medição pegou que não era do produto

Três defeitos do **instrumento** apareceram durante a validação, e todos os três
produzem a mesma ilusão: **um caso `LEGITIMO` vermelho que parece regressão de
segurança e é deriva do próprio roteiro.** Detalhamento no
[pos-mortem do smoke de playback](./pos-mortem-smoke-playback.md) §3.

1. **`smoke-rls-audit` Q1 dependia de fila seedada.** Contava a fila da KARAOKE sem
   garantir item: em 2026-10-02 ela estava **vazia** (as sessões consumiram os
   itens `APPROVED`). O caso passou a inserir o próprio item dentro do bloco (some
   no `rollback`) — como o Q3 já fazia.
2. **`smoke-playback` escolhia a sala por `where exists (fila aprovada)`.** Com as
   duas filas drenadas, o `select ... into` não devolvia linha: `v_host` NULO,
   `set_config(..., NULL)` e `set_playback` estourava `não autenticado` — que se lê
   como falha de autenticação. Passou a escolher `where status = 'active'`.
3. **`smoke-playback` inseria os itens do roteiro tirando o doador da própria fila**
   (`lateral`). Com a fila vazia não havia doador → **zero itens inseridos** → o
   roteiro seguia e estourava `nada tocando` muito depois da causa. O doador é
   agora o **host da sala**, que sempre existe.

E o mais importante, que não é asserção e sim higiene: **`smoke-playback` não tinha
transação** (a própria tabela de resultado pedia `on commit drop` — o roteiro foi
escrito para rodar dentro de uma e ela foi esquecida no arquivo). Cada execução
**commitava** no projeto Cloud: os itens `smoke1..5` ficavam na fila da sala, e a
rodada seguinte nascia com a fila suja. Foi `begin;`/`rollback;` + limpeza do
resíduo, e o smoke passou a ser reexecutável (3 rodadas seguidas, idênticas, com o
banco igual ao encontrado). Os outros smokes foram conferidos: `smoke-player-session`
é autossuficiente (cria e apaga a sala SMOKE8) e `smoke-profiles-public` é
read-only.

Também houve um conserto de **veredito ausente**: 9 dos 20 casos do
`smoke-playback` devolviam só o JSON da RPC, sem `ok` próprio — nos ramos de
`exception` de 12/13/14 isso significava que uma regressão real apareceria como
"sem veredito" em vez de vermelho. Todos os 20 têm veredito explícito agora, e o
caso 03 passou a exigir que o payload do player **não** contenha
`player_token`/`youtube_api_key` (é `security definer` montando jsonb à mão: é
exatamente onde uma coluna nova entra sem ninguém notar).

---

## 7. Em aberto, medido (não adivinhado)

- **As 37 funções restantes de `public` herdam `EXECUTE` de `PUBLIC`.** Medido em
  2026-10-02: as 40 funções do schema `public` (incluindo as 3 `admin_*`) são
  executáveis por `anon`. A `00039` fecha as 3 que carregam segredo, que é o
  escopo desta auditoria (F1/F2). Fechar as outras 37 exige **inventário de quais
  papéis chamam quais funções no app** — revogar às cegas quebra produto de um
  jeito que o smoke não pega. É decisão de escopo, não descoberta.
- **`smoke-player-session`**: 10 dos 17 casos não têm veredito `ok` explícito
  (mesma inconsistência estrutural que o `smoke-playback` tinha). Está verde e é
  autossuficiente, então não foi tocado aqui.
- **Par de tenants (Fase 9, já planejado):** o `player_token` na URL é a credencial
  que o F2 expunha. A migration fecha a **leitura pela API**, mas a URL continua
  carregando o segredo; pairing por código de 6 dígitos + cookie `HttpOnly` é a
  correção de raiz.
- **Player real numa TV:** continua fora de qualquer smoke (jsdom não prova
  autoplay/D-pad). Roteiro manual em [`TESTING.md`](../../TESTING.md) §3.9·quater.

---

## 8. Como revalidar

```bash
# migration (uma vez, quando o banco ainda não tem a 00038/00039)
node scripts/apply-sql.mjs supabase/migrations/20260930000038_auditoria_rls.sql
node scripts/apply-sql.mjs supabase/migrations/20260930000039_admin_rpc_execute_public.sql

# os 5 smokes, pelo papel de verdade (anon/authenticated)
node scripts/apply-sql.mjs scripts/smoke-rls-audit.sql
node scripts/apply-sql.mjs scripts/smoke-playback.sql
node scripts/apply-sql.mjs scripts/smoke-player-session.sql
node scripts/apply-sql.mjs scripts/smoke-dev-role.sql
node scripts/apply-sql.mjs scripts/smoke-profiles-public.sql
```

`smoke-rls-audit` imprime `ok`/`falhas`/`ataques_passando`/`legitimos_quebrados`
e uma tabela com **primeiro as paredes que falharam, depois todos os legítimos**.
O alvo é `falhas = 0` e `legitimos_quebrados = 0`; `ataques_passando` é o número
de ATAQUE ainda vulneráveis e precisa ser 0 **junto** com os legítimos verdes —
ver o aviso no topo do script.

O `smoke-rls-audit` e o `smoke-dev-role` rodam em transação com `rollback`; o
`smoke-playback` foi corrigido para o mesmo (rodar duas vezes seguidas precisa dar
o mesmo resultado e deixar o banco como estava).
