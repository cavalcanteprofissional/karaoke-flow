# Post-mortem: validar o playback contra o Supabase remoto (2026-09-27)

> **Por que este documento existe:** a validação da Fase 6/7 (player da TV) ficou
> pronta e commitada, mas custou ~8 rodadas de execução contra o banco remoto e
> várias premissas erradas minhas. As armadilhas são do **ferramental** (SQL
> verificável por script), não do produto — então valem para toda verificação
> futura que rode SQL contra o `dev` compartilhado. Leia antes de escrever o
> próximo smoke.
>
> Contexto do que foi validado: migrations `20260926000027_playback_state.sql` e
> `20260926000028_claim_next_song_finished.sql`, o roteiro de
> [`scripts/smoke-playback.sql`](../../scripts/smoke-playback.sql) e o roteiro
> manual em [`TESTING.md`](../../TESTING.md) §3.8.

---

## 1. Resumo

|                                               |                                                                                                                                                          |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entregue**                                  | 20 passos de contrato do playback verdes no remoto; 308 testes, typecheck, lint e build verdes; 2 commits (`5dc4f43`, `6e078aa`)                         |
| **Custo**                                     | ~8 rodadas de `apply-sql` + `seed`, cada uma com round-trip ao Management API e dados de dev recriados                                                   |
| **Causa raiz do custo**                       | eu escrevi o smoke **por raciocínio** e fui descobrindo o estado real do banco **dentro** do loop, em vez de planejar a sequência inteira antes de rodar |
| **Ganho no meio do caminho**                  | uma **correção real** de produto: a corrida entre o `onEnded` do player e o poll pulava a música em reprodução (virou a migration `00028`)               |
| **O que continua sem verificação automática** | o player real do YouTube num navegador de TV — depende de Playwright                                                                                     |

---

## 2. Linha do tempo: o que eu acreditei vs. o que aconteceu

| #   | Rodada                                       | Premissa errada                                           | Sinal real                                                                          | Correção                                                                             |
| --- | -------------------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| 1   | smoke inicial                                | `set_playback` só retorna erro se falta a coluna          | exceção `P0001: não autenticado`                                                    | `set_config('request.jwt.claim.sub')` para simular sessão                            |
| 2   | reler o relatório                            | o relatório vem inteiro                                   | JSON **cortado no meio**                                                            | `apply-sql.mjs` truncava em 2000 chars → passei a aceitar limite por argumento       |
| 3   | escolher a sala do roteiro                   | a primeira por `created_at` é a fila do seed              | caiu em `BAR2FO` (fila vazia) — o seed dá `created_at` **igual** para as duas salas | `order by r.code` (determinístico)                                                   |
| 4   | testar "pause" depois de um avanço           | o passo anterior **não** consumiu a música atual          | `nada tocando`                                                                      | era premissa minha errada no roteiro, não bug do banco                               |
| 5   | avançar duas vezes para provar idempotência  | passar o item **atual** como "item que acabou" é um no-op | second call avançava de verdade                                                     | `p_finished_item_id` repetido é que é no-op (foi a migration `00028`)                |
| 6   | inserir itens para o roteiro                 | `insert … status='approved'` aprova                       | voltaram `pending`                                                                  | o trigger `queue_items_initial_status` decide no INSERT; aprovar é **UPDATE depois** |
| 7   | ler "playback" no mesmo `jsonb_build_object` | a subquery lê o valor **depois** da RPC                   | "pausar" parecia não pausar                                                         | **ordem de avaliação dos argumentos não é garantida**                                |
| 8   | com 3 itens, o roteiro inteiro cabe          | o `stop` final ainda tinha música                         | `nada tocando` de novo                                                              | material dimensionado pelo maior consumo do roteiro                                  |

Duas dessas oito rodadas acharam **defeito de verdade** (itens 4/5 → corrida do
claim; item 6 expôs que eu não conhecia bem o trigger). As outras seis eram
**premissas erradas sobre o ambiente**.

---

## 3. As armadilhas, e a regra que evita cada uma

### 3.1 `jsonb_build_object` não tem ordem de avaliação

```sql
-- ERRADO: a subquery pode ser avaliada ANTES da função → lê o valor antigo
jsonb_build_object('ok', public.set_playback(v_room_id, 'pause'),
                   'playback', (select playback_status from public.rooms where id = v_room_id))
-- CERTO: a chamada vai para uma variável, o insert só grava
v_ok := public.set_playback(v_room_id, 'pause');
insert ... jsonb_build_object('ok', v_ok, 'playback', (select playback_status …));
```

**Regra:** em PL/pgSQL, toda RPC que muda estado entra em **variável** antes de
compor o relatório. Se a leitura do "depois" importa, ela é outra statement.

### 3.2 `DO` aborta inteiro no primeiro `raise`

Uma exceção não tratada no meio do `DO` mata a transação inteira: o relatório
(você guardou tudo numa temp table) **evapora**. Por isso seemed tentador ler o
erro do topo do log — mas aí se perde todo o contexto.

**Regra:** cada passo que possa levantar vai dentro de `begin … exception … end`
gravando `{'erro': sqlerrm}` na tabela. O relatório sempre sai inteiro, e a
falha fica **visível como dado** em vez de abortar o roteiro.

### 3.3 A saída do `apply-sql.mjs` era truncada

`console.log(text.slice(0, 2000))` escondia o fim do JSON. Eu li a resposta
cortada como se fosse o resultado e levei a conclusões erradas.

**Regra:** `node scripts/apply-sql.mjs <arquivo> <max_chars>` — para relatório,
passe um número alto (`100000`). E valide o JSON **programaticamente**
(`json.loads`) antes de concluir qualquer coisa: o erro de parse é o alarme.

### 3.4 O estado do banco de dev não é previsível

O seed dá `created_at` **igual** para as duas salas, então "primeira por
`created_at`" é sorteio. Além disso, a primeira versão do smoke dependia de a
sala escolhida ter `player_token` não nulo.

**Regra:** toda seleção do smoke termina em `order by … limit 1` sobre uma chave
**determinística** (código da sala, id). E `npm run seed` antes de rodar.

### 3.5 O roteiro precisa de material para o **maior** consumo, não para o primeiro passo

Com 2 itens aprovados, o roteiro quebrava no `stop` (não sobrava música) e no
`play` de reentrada. A aprovação do `pending` do seed também não bastava: em
sala manual o insert nasce `pending` de novo.

**Regra:** dimensione a fila pelo passo que **mais** consome itens, e faça a
aprovação (ou criação) **antes** do primeiro claim — remembering que status no
INSERT é ignorado pelo trigger.

### 3.6 O smoke mexe nos dados de verdade

Ele cria itens "Smoke N" com vídeo falso, marca itens como `played`/`skipped` e
**apaga um**. Sem `seed` depois, o dev fica com lixo e o próximo teste herda.

**Regra:** `npm run seed` → smoke → `npm run seed`. Sempre.

### 3.7 O duplo de teste era **mais permissivo** que a API real

Mesma família da 3.5, vista pelo lado do teste: a suíte do player (333 testes)
passava porque o `window.YT` falso devolvia do construtor uma instância **com
`loadVideoById`/`playVideo` prontas**. A IFrame API real devolve um objeto
**parcial** — os métodos só existem depois do `onReady` do iframe, e o handle
documentado é o `event.target` desse evento. Resultado: a TV quebrou no primeiro
approve com `player.loadVideoById is not a function`, e o `destroy()` do cleanup
estourava pelo mesmo motivo. Só apareceu em **browser real**, depois de meses de
suíte verde.

**Regra:** antes de confiar num teste que envolve API de terceiro, confira o
duplo contra o **contrato documentado** da API — em especial a ordem dos
eventos e **quais métodos existem quando**. Um duplo que antecipa o ciclo de
vida da dependência não é um teste fraco, é um teste **enganoso**: ele aprova
código que não roda. Hoje o duplo vive em
[`src/test/fake-youtube.ts`](../../src/test/fake-youtube.ts) e só dá os métodos
na hora do `onReady`.

### 3.8 O `destroy()` do YouTube roda depois do React — 2º incidente, mesma causa-raiz

O teste manual na TV, na sequência "toca, termina, aprova outra, toca", mostrou
`Console NotFoundError` / `Failed to execute 'removeChild' on 'Node': The node to
be removed is not a child of this node.` em `player/[codigo]/page.tsx`. A causa
não era a readiness (3.7, já corrigida): a IFrame API **destrói o player
removendo o iframe do pai**, e o `destroy()` estava no cleanup do `useEffect` —
fase **passiva**, que o React roda **depois** de já ter removido o DOM. O
`removeChild` do YouTube era, portanto, sobre um nó órfão: o método.exists, o
`event.target` está lá, e mesmo assim ele estoura.

O detalhe quecustou tempo: **o mesmo crash tinha dois gatilhos**, e só um deles
estava no relato:

| Gatilho | Caminho | Por que desmonta o stage |
|---|---|---|
| Fim da última música | `onEnded` → claim → fila vazia | `state.current = null` |
| **Host clica "Parar"** | `set_playback('stop')` → sala `idle` sem item | `state.current = null` |

Nos dois, `player-kiosk.tsx` deixa de renderizar `<YouTubeStage>` (render
condicional por `state.current`). Por isso o botão "Parar" derrubava a TV do mesmo
jeito que a fila vazia — e a ordem importa mais que o `try/catch`: destruir
depois do React já ter mexido no DOM é inútil. A correção é o cleanup em
**`useLayoutEffect`** (que o React roda no commit, antes de mexer no DOM), com
`try/catch` como segunda rede, porque a ordem do DOM do player é território do
YouTube.

O teste que trava isso não é "não lança": é **onde** o `destroy()` acontece. O
duplo de `fake-youtube.ts` ficou configurável para lançar `NotFoundError` e o
teste grava, dentro do `destroy()`, se o stage ainda estava no documento
(`document.querySelector('[data-testid="youtube-stage"]')`). Verificado: com o
cleanup passivo o teste **falha** (`expected false to be true`), com o de layout
passa.

**Regra:** `useEffect` serve para efeito colateral assíncrono; **cleanup que
depende do DOM estar intacto** (ou seja: que a biblioteca vai removê-lo) é
`useLayoutEffect`. E, para qualquer API de terceiro, liste os gatilhos de
desmontagem — um só costuma esconder o resto.

### 3.9 O CTA de "toque para começar" rearmava sozinho (o poll é um `play()`)

Mesmo arquivo, mesmo dia: a TV mostrava "Toque para começar" **repetidamente por
cima de um vídeo que já estava tocando**. O pedido de gesto (o probe de autoplay)
era armado em **todo** `play()`, e o quiosque chama `play()` a cada leitura de
estado — o poll de 5s, e cada leitura devolve um objeto `current` novo do banco,
o que reexecuta o efeito de aplicação.

Duas regras saíram daí:

- o probe só é armado por eventos que realmente significam "carregou e não
  começou": um `loadVideoById` de verdade, `CUED`/buffering **antes** da faixa
  tocar a primeira vez, ou um `play()` explicitamente marcado como gesto do
  usuário;
- o CTA **sai** no `PLAYING` (callback `onPlaying` novo), e não no clique nem no
  `setNeedsGesture(false)`.

`BUFFERING` é o detalhe que impedia o conserto ingênuo: rearmar em todo
`BUFFERING` troca o spam do poll por spam de reconexão de rede. Por isso o
componente guarda `playedRef` — antes da faixa tocar uma vez, buffering é "ainda
subindo" e vale esperar; depois, é só buffer.

**Regra:** antes de "corrigir" um efeito que reexecuta sozinho, conte quantas
vezes ele roda no mundo real (poll? foco? websocket?) e teste a suíte com o
temporizador do produto rodando. Um teste que só monta e desmonta não vê nada
disso.

### 3.10 A lista do participante parava de atualizar — e ninguém sabia por quê

"Na minha lista não atualiza quando o host aprova" é o pior tipo de bug: a
funcionalidade existe, o código parece certo, e nenhuma pista. As três causas
possíveis, todas verdadeiras ao mesmo tempo:

1. **`postgres_changes` filtra, e filtro de DELETE não funciona sem
   `REPLICA IDENTITY FULL`.** A `QueueList` escuta com
   `filter: room_id=eq.<id>`. Para INSERT/UPDATE o Realtime usa a linha nova e o
   filtro casa; para DELETE ele precisa da linha **antiga**, que só vem com
   `replica identity full` — sem isso o evento sai sem `old_record`, o filtro não
   casa e a remoção simplesmente não chega (sem erro visível). Isso explica
   "aprovar às vezes funciona, tirar da fila nunca".
2. **celular de participante dorme o WebSocket** e a reconexão só acontece quando
   o app volta ao primeiro plano.
3. **ninguém avisava os aparelhos da sala.** O aviso de "a fila mudou" ia só para
   a TV (`announcePlaybackChange`); o participante não tinha caminho rápido
   nenhum.

**Regra:** atualização "ao vivo" em produto de bar/celular é redundância em
camadas — broadcast de quem mutou (não depende de RLS nem de publicação), poll de
segurança, e relê em `visibilitychange`/`focus`/`online`. E **log do estado da
assinatura**: realtime que falha é silencioso por natureza, e sem log o próximo
"não atualiza" é caça ao tesouro. Vale conferir `replica identity` sempre que
houver filtro em `postgres_changes` sobre coluna que não é a PK.

### 3.11 O link da TV é uma **credencial**, e o repositório é público

Achado de verificação, não de sintoma: o token de player estava escrito à mão em
três arquivos de teste (`const TOKEN = "3f2a9c1e-…"`). O valor era **falso** —
conferido no banco: duas salas existem, e nenhuma tem aquele `player_token` — ou
seja, nada foi exposto. O problema é outro: **a forma é idêntica à de um link
real**, e o link da TV (`/player/<código>?token=…`) é credencial de verdade —
quem tem o link lê o estado da sala e a fila, sem login. Bastava alguém colar o
link num bug report, num chat ou numa captura de tela para vazar.

Dois erros de processo, vale registrar os dois:

1. **valor de teste digitado em vez de importado.** Cada arquivo repetia o
   literal; nada no código dizia "isto aqui é fixture, não é credencial". Agora
   existe **uma fonte só** — `src/test/fake-player-token.ts` (`FAKE_PLAYER_TOKEN`,
   `FAKE_ROTATED_PLAYER_TOKEN`) — e o valor é obviamente falso.
2. **a revisão confiou no Argumento "é só teste".** O commit passou porque a
   pessoa que escreveu lembrava que era fixture. Nenhum automatismo questionou.
   Um repo público precisa da pergunta feita por máquina.

**Regra:** segredo de teste não é menos segredo — é segredo com sorte. Duas
coisas, sempre: (a) **fonte única** de valores falsos, com nome que grita
(`FAKE_*`), para nenhum arquivo inventar credencial; (b) **scanner no repositório**
(`npm run scan:secrets`, `scripts/scan-secrets.mjs`) que falha em UUID fora dos
fixtures e em formato de chave conhecida, rodando com `-- --staged` antes do
commit. O scanner foi testado com um link de TV plantado e com uma chave `sbp_`
plantada — ambos sinalizados, com arquivo e linha.

E o que fazer se um token real entrar: **rotacionar**, não apagar. O botão "gerar
novo link" do host chama `rotate_player_token` (host-only) e invalida o anterior
na hora; a partir daí o link vazado não abre mais nada. Apagar do arquivo depois
do push é só faxina — o histórico é público.

---

## 4. Checklist antes de rodar o próximo smoke

- [ ] A sequência inteira está desenhada em papel/na cabeça: quantos itens, o que cada passo **deixa** para o próximo, e qual passo é o que consome mais.
- [ ] Toda leitura do "depois" de uma RPC está em statement separada (ou via variável) — nada de subquery dentro do mesmo `jsonb_build_object`.
- [ ] Todo passo que pode levantar está em `begin … exception … end`.
- [ ] Toda seleção termina em `order by` determinístico.
- [ ] O limite de caracteres do `apply-sql.mjs` está alto, e o JSON está sendo parseado por máquina antes de ser lido.
- [ ] `npm run seed` rodou antes, e está anotado que roda de novo depois.
- [ ] Se o passo toca o player (ou qualquer API de terceiro), o duplo de teste reproduz o ciclo de vida real dessa API — suíte verde não substitui browser real.
- [ ] Os **gatilhos de desmontagem** do player estão enumerados (fim de música, fila vazia, botão Parar, troca de faixa, saída da página) — e o cleanup que fala com a API está em `useLayoutEffect`, não em `useEffect`.
- [ ] Se a tela tem poll de estado, existe teste que roda o temporizador do produto (senão o efeito de aplicação é exercitado uma vez e nunca de novo).
- [ ] Se a tela escuta `postgres_changes` **com filtro**, a tabela tem `replica identity full` quando algum evento é `DELETE`.
- [ ] Se a lista é "ao vivo" para o celular do participante, existe poll de segurança e relê em `visibilitychange`/`focus` — e o estado da assinatura é logado.
- [ ] Avisos de "a fila mudou" são enviados para **todos** os públicos (TV + sala), não só para quem já estava sincronizando.
- [ ] `npm run scan:secrets -- --staged` passou **antes** do commit (o repo é público e o link da TV é credencial). Nenhum UUID escrito à mão fora de `src/test/fake-player-token.ts`.
- [ ] Ao colar link da TV em bug/chat/captura: avisar e mandar o host **rotacionar** ("gerar novo link"), não confiar em apagar o texto depois.

---

## 5. O que o smoke cobre — e o que não cobre

**Cobre** (contrato do banco, rápido e determinístico): token de capacidade
(inválido / rotacionado / sala inexistente), só `approved` entra em `playing`,
boot e avanço automático, claim repetido como no-op, pausa do host e o player
**não** avançando em pausa, retomada, comando inválido, skip, stop, play
reentrando na fila, participante sem poder de host, item que sai da fila
deixando a sala `idle`, fila esgotada recusando `play`, e sala encerrada não
avançando.

**Não cobre** (precisa de browser — Playwright, adiado): o player real do YouTube
(IFrame API, autoplay com toque, erro 101/150, vídeo que não embute), a
renderização real do quiosque, a latência < 2s ponta a ponta, e a reconexão fina
do canal Realtime. O manual em [`TESTING.md`](../../TESTING.md) §3.8 é o
intermediário até o Playwright existir.

**Atualização 2026-09-27 (depois da Fase 8a):** o browser Common do dev rodou o
player de verdade e **achou o crash de prontidão** que 333 testes não pegaram
(ver 3.7). Ou seja: o item "IFrame API" da lista acima já foi exercitado em
browser, e o que falta é o **TV de verdade** (tela, som, rede do bar) e o
Playwright. O duplo de teste agora segue o ciclo de vida real da API, e a
correção está em [`src/components/rooms/youtube-stage.tsx`](../../src/components/rooms/youtube-stage.tsx)
— `onReady` real + `event.target` + intenção pendente, em vez de "pronto" no
construtor.

**Atualização 2026-09-27 (depois do segundo round no browser, mesma causa-raiz):**
o `destroy()` em cleanup passivo (3.8) e o CTA rearmando pelo poll (3.9) só
apareceram com o **timing de verdade** — o quiosque leyendo o estado a cada 5s e o
host clicando "Parar". E a lista do participante (3.10) nunca teve bug de frontend
único: faltava `replica identity full`, que **não** aparece em suíte unitária
porque filtro de Realtime é do banco. A 4ª lição do dia: **`replica identity` e
ordem de cleanup são contrato, não detalhe** — os dois bugs passaram por 379
testes verdes.

---

## 6. Segunda rodada: o mesmo roteiro, cinco dias depois (2026-10-02)

A validação da Fase 8c (RLS) rodou este smoke como regressão e ele **estourou** —
mas nenhum dos quatro problemas era do produto. Vale registrar porque todos
produzem a **mesma** ilusão: um erro que se lê como falha de segurança e é deriva
do próprio instrumento.

| # | Sintoma                                                                     | Causa real                                                                                          | Correção                                                                              |
| - | --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 1 | `set_playback` → `não autenticado`                                          | a sala era escolhida por `where exists (fila aprovada)`; com as filas do seed drenadas o `into` não devolvia linha, `v_host` ficou NULO e `set_config(..., NULL)` | escolher `where status = 'active' order by code` (determinístico, sem depender de fila) |
| 2 | `set_playback` → `nada tocando` (bem depois da causa)                     | os itens do roteiro tiravam o `added_by_user_id` da **própria fila** (`lateral`); fila vazia ⇒ doador NULO ⇒ o `insert` nascia com **zero linhas** | doador passa a ser o **host da sala**, que sempre existe                              |
| 3 | o roteiro só passava na **primeira** execução; a segunda falhava            | **não havia transação**: cada rodada commitava os itens `smoke1..5` na fila, e a rodada seguinte herdava a sujeira (a tabela de resultado já pedia `on commit drop` — a transação foi esquecida no arquivo) | `begin;` no topo e `rollback;` no fim; resíduo limpo uma vez                          |
| 4 | o relatório misturava "a parede segurou" com "o instrumento quebrou"       | casos que devolviam o JSON da RPC, cujo `ok: false` é **recusa esperada**; e 9 dos 20 casos sem veredito `ok` próprio — nos ramos de `exception` de 12/13/14 isso esconderia regressão como "sem veredito" | veredito `ok` explícito nos 20 casos; nos que esperam erro, o `ok` compara com a mensagem |

A 5ª lição, na mesma linha da 6ª: **instrumento que depende de estado que o mundo
consome não é instrumento.** A fila do seed é consumida por sessão real de
karaokê — usar a fila do seed como premissa de teste é usar dado de produção como
constante. E a 6ª: **smoke que só passa na primeira execução não é smoke**; o
critério de aceitação de um roteiro com escrita é "rode duas vezes seguidas e o
banco fica igual".

O caso 3 do `smoke-rls-audit` (Q1, que só contava a fila seedada e ficou vermelho
`LEGITIMO` sem nenhuma mudança de segurança) é o mesmo defeito. Lá a correção foi
o item ser inserido dentro do próprio caso — o `smoke-playback` precisava de
`rollback` porque **escreve na fila que outros casos leem**.

---

## 7. Lição de método (a que mais custou)

O erro de processo não foi técnico: foi **validar o script contra o ambiente
real como se fosse um REPL**. Um `DO` block remoto não é iterável como uma
função — cada tentativa custa seed + round-trip. A alternativa que eu não fiz na
época: **simular o roteiro localmente com dados em memória** (ou um `select` de
diagnóstico que devolve o estado da fila) para acertar a sequência antes da
primeira aplicação. O smoke já devolve um relatório completo justamente para
isso — bastava eu ler o relatório inteiro na primeira rodada, em vez de inferir
o estado a partir de exceções parciais.
