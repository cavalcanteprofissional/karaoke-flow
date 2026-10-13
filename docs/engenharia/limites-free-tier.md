# Limites do free tier e latência do realtime — medido em 2026-10-01

> **Por que este documento existe.** O `TODO.md` trazia dois itens da Fase 8 sem
> número desde a Fase 6: _"validação de limites do free tier do Supabase Realtime"_ e
> _"latência realtime < 2s validada entre controller e tela"_. Não são bugs: são
> decisões de arquitetura. Quantas conexões o projeto aguenta? O aviso de fila
> chega em menos de 2 segundos? Sem número, todo mundo opinava.
>
> **Como medir:** `npm run measure:limits` (`scripts/measure-limits.mjs`). As
> seções 1–4 são **somente-leitura** (SELECT e assinaturas de canal). A seção 5
> faz **uma** escrita, declarada: um `UPDATE` que não muda status, posição nem
> conteúdo, mas cujo trigger `touch_updated_at` reescreve `updated_at` para
> `now()` — a linha muda mesmo. Ela existe porque só assim o caminho de escrita
> é medido pelo mesmo caminho que o app usa (Data API + sessão real de host, já
> que a policy é host-only). Com `--no-write` a rodada vira leitura pura. **Nada é
> criado e nada é apagado em nenhum modo.** As migrations aplicadas no Cloud não
> mudam com o que está escrito aqui; se mudarem, o script é a fonte do número novo.
>
> **Atualização de 2026-10-13 — leia §8 antes.** A implementação do aviso de fila
> mudou (`httpSend`, sem abrir WebSocket) e os números de §3.2/§3.4 são
> **históricos** (medem a versão antiga, de assinar/dessinar). O §8 traz o motivo
> (o pico de 776 conexões de 01/out), as seis correções de footprint e o que
> revalidar. Os números de §2 (teto de 200 conexões) seguem válidos.
>
> **Regra do projeto que este doc cumpre:** _"suíte verde não substitui browser
> real"_ vale dobrado para medição. O script mede a rede e o banco; a TV e o
> celular continuam sendo validação manual (`TESTING.md` §3.9·ter).

## Ambiente medido

|                   |                                                                      |
| ----------------- | -------------------------------------------------------------------- |
| Projeto           | `kskoipyzqcacccepcqpc`                                               |
| Data              | 2026-10-01                                                           |
| Origem da medição | uma máquina de desenvolvimento (Windows), rede doméstica             |
| Plano             | gratuito (número do plano **não** lido por API — ver ressalva em §5) |

## 1. Postgres

| Métrica              | Medido                             | Teto publicado           |
| -------------------- | ---------------------------------- | ------------------------ |
| Tamanho do banco     | **13,33 MB** (2,7%)                | 500 MB                   |
| Conexões do Postgres | 17 (2 ativas · 7 ociosas)          | gerenciado pelo Supabase |
| Contas de Auth       | 22 (**4 com login** · 18 anônimos) | —                        |
| Maior tabela         | `rooms` (0,14 MB)                  | —                        |

Tamanho por tabela do domínio (as únicas com conteúdo de verdade):

```
rooms                 0,14 MB      queue_items          0,09 MB
bars                  0,11 MB      room_members         0,07 MB
consents              0,05 MB      dev_accounts         0,02 MB
```

**Leitura.** O banco não está perto de nada: 2,7% do teto, com duas salas e duas
bar de desenvolvimento. O item _"linhas/storage do Postgres"_ do `TODO.md` (Fase 1)
pode ser considered **medido e folgado** — não há risco de encher o banco antes de
a Fase 11 criar a primeira consulta agregada.

Duas ressalvas honestas:

1. **O número de linhas do relatório é estimativa do planner** (`reltuples`), e
   aparece como `-1` nas tabelas que nunca sofreram `ANALYZE`. Para volume real,
   o número a acompanhar é o **tamanho em disco**, que é exato.
2. **Anônimo não tem teto por conta.** As 18 contas anônimas são de sessões de
   teste do próprio desenvolvimento. Se a Fase 9 liberar "quem está fora do raio
   entra pelo link do dono", o custo por participante passa a ser **um registro em
   `auth.users`**, e aí sim é um vetor de crescimento sem freio. Fica anotado em
   §4.

## 2. Conexões simultâneas do Realtime

| Passo   | Novas conexões | Falhas | Duração do passo |
| ------- | -------------- | ------ | ---------------- |
| 1       | 1              | 0      | 1473 ms          |
| 10      | 9              | 0      | 761 ms           |
| 25      | 15             | 0      | 1037 ms          |
| 50      | 25             | 0      | 820 ms           |
| 100     | 50             | 0      | 881 ms           |
| **200** | **100**        | **0**  | 1009 ms          |

**Resultado: 200 conexões simultâneas abriram, nenhuma falhou** — exatamente o
teto publicado do plano gratuito, com a assinatura mais lenta da rampa dentro de
1,5 s.

**O que isto compra.** O produto é _watch party num bar_: uma TV (1 conexão), o
celular do dono (1) e um participante por pessoa. **O teto de 200 conexões
sustenta ~99 pessoas numa única sala**, ou o mesmo bar com várias salas, com folga
de sobra. Não é o gargalo do produto — e isso é um resultado, porque a alternativa
(Firebase como plano B, anotada no `TODO.md` da Fase 8) era uma decisão tomada no
escuro.

**O que este teste NÃO prova:**

- **Banda e mensagens.** As 200 conexões ficaram **ociosas**: o teste mede o teto
  de _conexões_, não o consumo de banda (5 GB/mês) nem de mensagens. Um produto
  real envia "releia" algumas vezes por segundo por sala — precisa ser medido com
  tráfego, não com canal vazio.
- **Várias salas ao mesmo tempo.** O teste usou **um** canal. Salas diferentes =
  canais diferentes, no mesmo projeto; o limite é do projeto, mas vale registrar
  que a medição é de um canal só.
- **Uma máquina só.** 200 conexões abertas de um processo Node é mais pesado para
  o _cliente_ do que para o servidor. Não mede o comportamento com aparelhos
  distintos em redes distintas.

## 3. Latência

Três medições, porque "latência do realtime" no `TODO.md` são três coisas
diferentes que somem num número só.

### 3.1 O broadcast em si — o termo dominante

Broadcast entre dois clientes, 60 envios, aguardando confirmação de entrega:

```
entregues: 60 · perdidos/timeout: 0
min 160 ms · p50 161 ms · p95 166 ms · máx 175 ms
```

**Veredito: o alvo de < 2 s é viável, com 12× de folga.** A rede entre o
hospedeiro do projeto e o aparelho não é o problema.

### 3.2 O aviso de fila — **onde estava o problema** (medido em 2026-10-01)

> **Histórico — superseded em 2026-10-13.** Os números abaixo medem a versão que
> **assinia** o canal a cada aviso. A implementação atual usa `httpSend` (um
> `POST`, sem WebSocket) e o aviso deixou de abrir/fechar conexão — ver §8. A
> conclusão ("o custo era abrir/fechar a conexão, não o aviso") foi a que motivou
> a correção.

`announceQueueChange` (`src/lib/rooms/room-channel.ts:47`) é o que toda action de
fila chama depois de gravar no banco: _"a fila mudou, releia"_. A implementação
cria um client novo, **assina o canal, envia e desassina**, a cada mutação. O
script mediu essa sequência exata, fase por fase:

```
p50 1321 ms · p95 1339 ms · máx 1339 ms   (criar + assinar + enviar + fechar)
  criar    p50     0 ms
  assinar  p50   708 ms     ← abrir o WebSocket
  enviar   p50     0 ms     ← o aviso em si é instantâneo
  fechar   p50   614 ms     ← desassinar espera o servidor confirmar
```

**O aviso em si custa 0 ms. Abrir e fechar a conexão custa 1,3 s — 99% do
tempo.** E `fechar` (614 ms) é puro desperdício: o `removeChannel` espera o
servidor confirmar a saída de um canal que existiu por 700 ms.

### 3.3 A escrita do host no banco

`UPDATE` + `select` numa `queue_items`, com sessão real de host (a policy é
host-only):

```
p50 306 ms · p95 700 ms (n=5)
```

### 3.4 A soma — e a resposta ao item do `TODO.md` (histórico)

> **Histórico — superseded em 2026-10-13.** A linha "Avisar a sala" media o canal
> assinado/dessinado por mutação. Com `httpSend` (§8) ela deixa de dominar a soma.

O que o celular do dono espera, por ação de fila:

| Caminho                | p50         | p95         |
| ---------------------- | ----------- | ----------- |
| Gravar no banco (§3.3) | 306 ms      | 700 ms      |
| Avisar a sala (§3.2)   | 1321 ms     | 1339 ms     |
| **Total**              | **1627 ms** | **2039 ms** |

**Veredito: o alvo de "latência realtime < 2s entre controller e tela" é
atingido no p50 e furado no p95** — e a causa não é a rede nem o banco: é o
realtime abrindo e fechando uma conexão por mutação.

O pior caso real é outro e é bem pior: **se o broadcast falhar**, quem relê é o
poll — 5 s no player (`PlayerKiosk`) e 10 s na fila (`QueueList`). Ou seja, a
latência que o usuário sente num bar é bimodal: **~1,6 s quando o realtime
funciona, 5–10 s quando não funciona**. Não há estado intermediário, e é por isso
que a redundância em camadas da Fase 8b (§"ordem de confiança": broadcast → poll →
relê no foco) é o desenho certo.

## 4. O que fazer com estes números

| Achado                                                            | Ação                                                                                                                                                              | Onde                       |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Aviso de fila custa 1,3 s, dos quais 1,3 s é abrir/fechar conexão | ~~Servir o aviso por um canal de longa duração~~ **Feito em 2026-10-13** de outro jeito: `httpSend` (POST, sem WebSocket). Revalidar a latência (§8)              | §8 / `TESTING.md` §3.9·ter |
| Limite de 200 conexões não aperta                                 | Nenhuma ação no produto — mas o **pico de 776 em 01/out** estourou o teto e veio da rampa do `measure:limits` (ver §8). Firebase deixa de ser plano B obrigatório | §8 / `TODO.md`             |
| Anônimo cria uma linha em `auth.users` por participante, sem teto | Voltar a este doc quando a Fase 9 liberar entrada remota; o crescimento de `auth.users` é o custo real do "link do dono"                                          | Bloco 9A                   |
| Banda e mensagens não medidas                                     | Medir com tráfego real (várias salas, fila mutando) quando houver uso de verdade — não antes                                                                      | §2 deste doc               |
| 2 s no p95 ainda não garantido                                    | O aviso foi enxugado (§8); revalidar a soma no aparelho quando houver tráfego                                                                                     | `TESTING.md` §3.9·ter      |

## 5. O que este documento NÃO afirma

- **O número do plano.** O Management API devolve o _identificador_ do plano, não
  os tetos; os 500 MB e as 200 conexões aqui são os **valores publicados** na
  documentação da Supabase, e a medição bateu com eles. Se a Supabase mudar o
  plano, `LIMITES_PUBLICADOS_FREE` em `scripts/measure-limits.mjs` precisa mudar
  junto — o script imprime "publicado × medido" lado a lado justamente para isso.
- **Latência de ponta a ponta na TV.** O script mede rede e banco. O que aparece
  na tela da TV — render, o quiosque, o `set_playback`, o poll de 5 s — só se
  confirma no aparelho, no roteiro de `TESTING.md` §3.9·ter.
- **Comportamento com o celular dormindo.** O caso real do bar (SO em segundo
  plano, WebSocket caído) é justamente o que o poll de 10 s cobre, e nenhum script
  aqui o reproduz.

## 6. Reproduzir

```bash
npm run measure:limits                 # relatório completo
npm run measure:limits -- --no-ramp    # sem a rampa de 200 conexões (rápido)
npm run measure:limits -- --no-write    # zero escrita no banco
npm run measure:limits -- --ramp-max 50
npm run measure:limits -- --json       # despeja os números em JSON
```

Só precisa de `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` no
`.env.local`; com `SUPABASE_ACCESS_TOKEN` a seção do Postgres aparece inteira.
**Não imprime nenhuma chave, senha ou token de player.**

## 7. A cota que a Fase 8f tornou visível — a do YouTube Data API

Este documento mede o free tier **do Supabase**, e a busca de músicas não passa
por ele. A busca tem o próprio teto, do outro lado da integração, e ele é o que
transformou um 502 genérico em "o dono do produto está pagando a cota de todos os
barros" (Fase 8f, 2026-10-05).

**Os números publicados** (documentação da YouTube Data API v3, plano padrão sem
faturamento — o mesmo critério de "publicado × medido" do §5, sem medição
própria aqui):

- **10.000 unidades por dia**, por **projeto** do Google Cloud. Não por usuário,
  não por chave, não por sala.
- `search.list` custa **100 unidades** por requisição. Um `maxResults=25` não
  encarece mais que um `maxResults=5`: o custo é da chamada.
- Uma busca por segundo no dia inteiro passaria do teto em pouco mais de um dia;
  o uso real de um bar (uma busca a cada poucos segundos, por/bar) é uma fração
  pequena disso **por bar** — mas **somar** alguns bars no mesmo projeto é o que
  estoura.

**O que a Fase 8f mudou em cima disto:**

- O default `own_only` (`bars.youtube_credential_policy`) impede que um bar use a
  cota de outro: cada dono traz a chave do **seu** projeto, ou conecta a conta
  dele. `platform_pool` existe como opt-in explícito, para chave de conta de
  empresa — com teto de **configuração** por bar, que ainda não é contador.
- O portão `is_dev` impede o degrau final da cadeia (OAuth do app e
  `YOUTUBE_API_KEY`) de virar custo silencioso de terceiros.
- **`GET /api/youtube/diagnostics` não gasta cota** por padrão; `?probe=1` gasta
  100 unidades de propósito e de forma explícita. Por isso o relatório de
  ambiente pode ser rodado à vontade num incidente.

**O que este documento não afirma sobre a cota do YouTube:** que exista cota
separada por conta conectada via OAuth (**não existe** — o OAuth autoriza leitura
e a cobrança fica no projeto da credencial), nem que `daily_search_budget` de um
pool seja aplicado por requisição (hoje é rótulo, ver `TODO.md` Fase 8f).

## 8. 2026-10-13 — o pico de 776 conexões e as seis correções de footprint

### 8.1 O que o relatório mostrou

Reports → Realtime → **Peak Connections** registrou **776 conexões simultâneas em
01/out**, num projeto de plano gratuito cujo teto é **200**. O app **não** tem
como abrir isso: `createBrowserClient` é memoizado (`src/lib/supabase/client.ts`),
então cada **aba** usa **um** WebSocket, e não há Realtime server-side (nenhuma
rota ou action abre canal). O emissor massivo do dia foi a **rampa do
`scripts/measure-limits.mjs`** (`npm run measure:limits`, commit `009e92e` de
01/out): cada passo mantém as conexões anteriores abertas e o teto fixo da rampa
era `[1, 10, 25, 50, 100, 200]`.

**O 776 não se explica só pela rampa.** Com o teto em 200, a rampa sozinha para em
200; 776 exige ou rodadas múltiplas/interrompidas, ou tráfego externo na URL
pública, ou a agregação do próprio relatório.

**Investigação fechada (2026-10-13, read-only pela Management API + docs).** Nada
aponta para **tráfego externo**; o 776 é **auto-infligido** (a própria rampa/uso de
dev), e não é reconstruível. O que foi apurado:

1. **A métrica cobrada é clara e é "conexões", não canais.** `Realtime Peak
   Connections` = *maior número de conexões concorrentes por projeto no ciclo*,
   **somado entre os projetos da organização**; só conexões **bem-sucedidas**
   contam; o Free para em **200** (Realtime Pricing + Manage Your Usage). A frase
   "total de canais assinados" da página Concepts é a divergente. `config/realtime`
   confirmou `max_concurrent_users: 200`.
2. **Não há soma de organização.** `GET /v1/projects` devolveu **um único**
   projeto (`karaoke-flow`) — não existem outros projetos somando no pico.
3. **Os logs não podem reconstruir 01/out.** O Realtime **não** registra conexão
   por padrão (exige `log_level: 'info'` no cliente, que o app não usa) e a
   retenção do Free é de **~1 dia** — o evento tem 12 dias. `realtime_logs` chega a
   ter `measurements.connected/limit`, mas o dado já expirou.
4. **A rampa sozinha não chega a 776.** `measure-limits.mjs` está no teto
   `[1,10,25,50,100,200]` desde o único commit (`009e92e`); uma rodada para em
   **200**. 776 exige **rodadas múltiplas/interrompidas** na mesma janela, ou
   agregação do relatório sobre conexões **efêmeras** (o restante do script abre e
   fecha clientes em rajada: broadcast 60 pings, announces) — sempre **de dentro
   de casa**, nunca de IPs de terceiros.

**Conclusão.** Fechado como **artefato auto-infligido** (rampa + churn de dev), sem
evidência de abuso; a prevenção já está no item 6 do §8.2 (teto + aviso no script)
e no item 2 do §8.4 (**feito** em 2026-10-13: o socket é fechado com a aba
oculta), que é o único que mexe no **pico de conexões**. O que o app
**contribuía** era consumo de mensagens e fan-out, e isso foi cortado.

### 8.2 As seis correções (código)

| #   | Correção                                                                                             | Onde                                                           |
| --- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 1   | Announces por `channel.httpSend` (POST, sem abrir WebSocket)                                         | `room-channel.ts`, `player-channel.ts`                         |
| 2   | `postgres_changes` de `queue_items` fora do cliente; TV emite `announceQueueChange` no claim/release | `queue-list.tsx`, `use-own-active-song.ts`, `player-kiosk.tsx` |
| 3   | (moot) o pgr do próprio cantor já era filtrado por `added_by_user_id` e saiu junto do item 2         | `use-own-active-song.ts`                                       |
| 4   | Fan-out do banco: `reorder_queue` com `is distinct from` + `touch_updated_at` com guard de no-op     | migration `20261013000001_realtime_fanout.sql`                 |
| 5   | Poll só com a tela visível (5 s no kiosque, 8 s na aprovação)                                        | `player-kiosk.tsx`, `entry-approval-wait.tsx`                  |
| 6   | Rampa do `measure:limits` limitada ao teto publicado + aviso de impacto em produção                  | `scripts/measure-limits.mjs`                                   |

**Por que `httpSend` funciona sem assinar.** É um `POST` para o endpoint de
broadcast do Realtime (`RealtimeChannel.httpSend`); o servidor entrega aos
assinantes **sem** que o emissor abra WebSocket. Requer Realtime server
**v2.97.0+** (o Cloud em dia) e o cliente `@supabase/supabase-js` **2.107.0+**
(aqui, 2.116.0). O emissor **não** entra na conta de "conexões simultâneas" do
relatório: quem paga conexão é só quem **escuta**.

**Por que o guard do `touch_updated_at` é seguro para a UI.** `queue_items` e
`consents` usam o trigger. `setQueueItemStatusAction` (`src/lib/rooms/queue-actions.ts`)
faz `.update(...).select("id, status")` e trata `data.length === 0` como conflito;
transições válidas sempre mudam `status`, então o guard só cancela escritas **sem
mudança** — exatamente as que não deveriam virar evento.

### 8.3 O que revalidar (aparelho)

A regressão de design é: **com o pgr fora**, a fila e a TV ainda atualizam ao vivo?
A cobertura é broadcast (rápido) + poll de 10 s + relê no foco/visibilidade, e a
primeira leitura agora é disparada pelo `SUBSCRIBED` do canal. Roteiro em
`TESTING.md` §3.9·ter — mutar a fila no host e ver a TV e um celular refletirem
sem F5; depois com o realtime derrubado, conferir que o poll cobre.

### 8.4 Próximas fases

1. ~~**Migrar os `postgres_changes` de `room_members`**~~ **Feito em 2026-10-13.**
   Os três canais (`entry-approval:<roomId>` em `entry-approval-wait.tsx`,
   `entries:<roomId>` em `pending-entries.tsx` e `room-occupancy:<roomId>` em
   `room-occupancy.tsx`) saíram; as telas assinam o canal único
   `room-members:<roomId>` (`src/lib/rooms/member-channel.ts`) e quem muta
   `room_members` (entrar, aprovar/rejeitar, escolher mesa, sair, cancelar pedido,
   encerrar sala) avisa por `httpSend`. `pending-entries` e `room-occupancy`
   ganharam o poll de 10 s (antes **não tinham** nenhum) e a primeira leitura vem
   no `SUBSCRIBED`. A migration `20261013000002` tira a tabela da publicação
   `supabase_realtime` e volta o `replica identity` para `default` — **aplicada
   no Cloud em 2026-10-13, depois do deploy do client**: o cliente antigo ainda
   dependia do pgr de `room_members` nos cards do host, por isso a ordem.
   Verificado depois de aplicar: `room_members` fora da publicação e
   `replica identity=default` (só `queue_items` segue na publicação, sem
   consumidor — nenhum `postgres_changes` sobrou no cliente).
2. ~~**Fechar o socket quando a aba está oculta**~~ **Feito em 2026-10-13.**
   O `@supabase/phoenix` **já** reage à visibilidade, mas só para **não
   reconectar** com a aba oculta: o socket que já está aberto **continua aberto**,
   contando para o teto. O gate `subscribeWhileVisible`
   (`src/lib/supabase/visibility-channel.ts`) desassina no `visibilitychange:
   hidden` e reassina no retorno — os três canais (`room-channel`,
   `player-channel`, `member-channel`) passam por ele. Remover o último canal do
   client memoizado faz o realtime-js agendar o `disconnect()`
   (`_disconnectOnEmptyChannelsAfterMs` = 2 × heartbeat de 25 s = **~50 s**);
   reassinar antes cancela o agendamento, então ir e voltar rápido não derruba a
   conexão. Montar já com a aba oculta não abre socket. **Nada se perde:** quem
   chama já tem poll que pula a aba oculta e relê no `visibilitychange`/`focus`,
   e o kiosque da TV fica sempre visível — ao voltar, o `SUBSCRIBED` (que dispara
   a primeira leitura) + o poll reconciliam. **Custo:** reconexão do WebSocket e
   rejoin do canal ao voltar. É o item que mexe no **pico de conexões** (§8.5).
   Cobertura: `src/lib/supabase/visibility-channel.test.ts` (ciclo
   subscribe/unsubscribe, aba oculta no mount, SSR) e
   `src/lib/rooms/room-channel.test.ts` (fiação). Suíte **799 → 808** / 64
   arquivos. **Falta:** validar no aparelho que ao esconder a aba o socket cai e
   ao voltar a fila/TV reconectam sozinhas (estender `TESTING.md` §3.9·ter).
3. **Medir com tráfego** (várias salas mutando) e comparar `Peak Connections` e
   `total_realtime_requests` antes/depois.
4. **Conferir a cota nas settings do Realtime** — o campo **Max concurrent
   clients** (1 até o teto do plano; default = teto) é o que recusa a conexão
   nova com `429 Too many connected users`. No Free o valor útil é o próprio 200;
   em plano maior é aqui que se sobe. Acompanhar em Reports → Realtime →
   **Connected Clients** durante o uso real (métrica viva); o "Peak" do relatório
   só marca o máximo do ciclo.

### 8.5 O que o teto de conexões faz — e o que ele não faz

**1 conexão = 1 WebSocket = 1 aba.** Canais são multiplexados na mesma conexão
(`createBrowserClient` memoizado em `src/lib/supabase/client.ts`): uma aba assina
fila, player e os `postgres_changes` que sobraram **sem** abrir socket extra. O
teto do Free (**200**) é, então, "quantas abas podem ter atualização ao vivo ao
mesmo tempo", **por projeto** — todas as salas e bares compartilham os mesmos 200.

**Escala do produto.** TV (1) + dono (1) + 1 por pessoa: **200 conexões ≈ ~198
participantes simultâneos** numa sala, ou o mesmo bar com várias salas. Um bar de
30 pessoas gasta ~32. Não é o gargalo do produto — em plano pago o teto é 500
(Pro/Team), com over-usage de **US$10/1.000** conexões de pico.

**O que acontece ao estourar (documentado pela Supabase).** Conexões **novas**
são recusadas com **`429 Too many connected users`**; as **existentes não caem**.
Aqui isso degrada **com elegância**, porque a arquitetura tem rede de segurança: a
aba que não conecta continua atualizando pelo **poll** (fila 10 s, kiosk 5 s,
aprovação 8 s) e quem **avisa** usa `httpSend` (POST REST, não gasta conexão).
Resultado: as abas mais novas perdem o "instantâneo", **sem perda de dado**.

**O risco real não é o 429, é o Fair Use.** O **776 de 01/out** é ~4× o teto. A
cota de conexões só vira número de relatório/cobrança, mas a Supabase **revisa e
pode suspender** projeto que estoura **repetidamente** por margem grande
(reconnection loop, criação de canal descontrolada, tráfego runaway). É por isso
que o pico merecia investigação (§8.1) — **fechada em 2026-10-13 como
auto-infligida, sem tráfego externo** — mesmo sem impacto no app.

**O que estoura antes do teto, num bar cheio.** As outras cotas do Realtime Free
são menores e são as que primeiro apertam: **100 joins de canal/s**, **100 msgs/s**
(média móvel de 1 min) e **2M msgs/mês**. Broadcast = 1 enviada + 1 por ouvinte;
**poll é REST e não conta como mensagem**. Uma sala enchendo de uma vez gasta ~1
join por pessoa num segundo; várias salas simultâneas é que chega perto dos 100/s
— o mesmo vetor do YouTube (§7): **a cota é do projeto, some os bares**.

**O teto não limita:** banco, número de músicas, salas, REST/API nem auth. Limita
**só** a atualização ao vivo das abas mais novas quando há > 200 abertas — e é
cota de **conexões**, não de canais: migrar os `postgres_changes` de
`room_members` para broadcast (§8.4, item 1) corta **mensagens/fan-out**; fechar o
socket com a aba oculta (item 2, **feito**) é o que mexe no **pico de conexões**.

Fonte: `Realtime Settings` (Max concurrent clients), `Realtime Reports`
(Connected Clients × Peak Connections) e a doc de Troubleshooting da cota de
"Concurrent Peak Connections".

### 8.6 Plano registrado — canal único por sala (fila + playback + membros)

> **Status:** plano de fase 2, **não implementado** (registrado em 2026-10-13).
> A investigação do **776** (§8.1) foi **fechada** como auto-infligida e o item 2
> do §8.4 (fechar o socket com a aba oculta) — o único que mexe no **pico de
> conexões** — foi **feito**. Este plano é higiene de cota (channel joins) e
> consistência de chave, não redução de pico.

**O que ainda não está unificado.** A lógica da fila (solicitação, aprovação,
inserção) **já** compartilha um canal broadcast desde a Fase 8b
(`room-queue-<CODE>`, `room-channel.ts`) — não sobrou `postgres_changes` de
`queue_items`. O que continua separado é **fila × playback × membros**, em três
canais por sala e com **chaves divergentes**:

| Canal                     | Chave                     | Evento             | Emissores                                 | Assinantes                                  |
| ------------------------- | ------------------------- | ------------------ | ----------------------------------------- | ------------------------------------------- |
| `room-queue-<CODE>`       | **code** (`room-channel`) | `queue-changed`    | `song-search`, `queue-list`, `player-kiosk` | `queue-list`, `use-own-active-song`       |
| `player-<CODE>`           | **code** (`player-channel`) | `playback-changed` | `playback-controls`, `queue-list`, `player-kiosk` | `player-kiosk`, `use-playback-live` |
| `room-members-<ID>`       | **roomId** (`member-channel`, §8.4 item 1) | `members-changed` | 8 pontos de mutação | `entry-approval-wait`, `pending-entries`, `room-occupancy` |

**Alvo.** Um canal por sala, chaveado por **`roomId`** (UUID imutável), com três
eventos de "releia" — `queue-changed`, `playback-changed`, `members-changed`.
Módulo único `src/lib/rooms/room-live.ts`: `roomLiveChannelName(roomId)` →
`room-<roomId>`, `announceRoomChange(roomId, event)` (httpSend) e
`subscribeToRoomChanges(roomId, { onQueue, onPlayback, onMembers }, onStatus)` —
um `.channel()` com três `.on("broadcast", {event})`. `room-channel.ts`,
`player-channel.ts` e `member-channel.ts` saem.

**Por que `roomId` e não o código.** `rooms.code` é **mutável**: `update_bar_code`
espelha o código do bar na sala (`20261012000001_codigo_do_bar.sql:387`,
`update public.rooms set code = v_code where bar_id = r.id`). Hoje um rename
órfã os canais `room-queue`/`player` em silêncio até o poll; `roomId` fecha esse
furo e casa com a chave que a fase 1 já adotou.

**O único bloqueador: a TV.** `player-kiosk.tsx` recebe só `roomCode` + token, e
`get_player_state` devolve `room.code` mas **não** `room.id`
(`20260927000029_player_session_access.sql:110-116`; `playback.ts:41-47`). Todos
os demais (`queue-list`, `song-search`, `playback-controls`) já têm `roomId`. O
caminho é a migration **`20261013000003`**: acrescentar `'id', v_room.id` ao jsonb
`room` de `get_player_state`; `playerStateSchema.room` ganha `id` (o zod ignora
chave extra no cliente antigo, então aplicar a migration **antes** do deploy é
seguro) e `PlayerKiosk` ganha a prop `roomId` (de `result.state.room.id`). O
`use-playback-live` passa a receber `roomId` de `playback-controls`.

**O que isto NÃO resolve.** Canais são multiplexados no mesmo WebSocket (§8.5):
unificar canais **não** reduz o teto de conexões nem o **776** — só a taxa de
*channel joins* (cota de **100/s**, §8.5) e a contabilidade de mensagens. O ganho
é higiene de cota, consistência de chave e um módulo a menos; o **pico de
conexões** depende do item 2 do §8.4 — já **feito** (gate de visibilidade).

**Ordem de deploy.** (a) aplicar `20261013000003` no Cloud → (b) `vercel deploy`
do cliente (canais unificados; a TV lê `room.id`) → (c) aplicar
`20261013000002` (tirar `room_members` da publicação, §8.4 item 1). A janela de
versões cruzadas é coberta pelo poll (5/8/10 s) + relê no foco, como na fase 1.

**Escopo/verificação.** ~12 arquivos de call site + 1 migration + 1 tipo + ajuste
dos mocks dos `*.test.tsx` que hoje mockam os três módulos; suíte ~799 → ~805;
gates `lint`/`typecheck`/`test`/`build`. Esforço comparável ao da fase 1 (§8.4
item 1).
