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

---

## 4. Checklist antes de rodar o próximo smoke

- [ ] A sequência inteira está desenhada em papel/na cabeça: quantos itens, o que cada passo **deixa** para o próximo, e qual passo é o que consome mais.
- [ ] Toda leitura do "depois" de uma RPC está em statement separada (ou via variável) — nada de subquery dentro do mesmo `jsonb_build_object`.
- [ ] Todo passo que pode levantar está em `begin … exception … end`.
- [ ] Toda seleção termina em `order by` determinístico.
- [ ] O limite de caracteres do `apply-sql.mjs` está alto, e o JSON está sendo parseado por máquina antes de ser lido.
- [ ] `npm run seed` rodou antes, e está anotado que roda de novo depois.

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

---

## 6. Lição de método (a que mais custou)

O erro de processo não foi técnico: foi **validar o script contra o ambiente
real como se fosse um REPL**. Um `DO` block remoto não é iterável como uma
função — cada tentativa custa seed + round-trip. A alternativa que eu não fiz na
época: **simular o roteiro localmente com dados em memória** (ou um `select` de
diagnóstico que devolve o estado da fila) para acertar a sequência antes da
primeira aplicação. O smoke já devolve um relatório completo justamente para
isso — bastava eu ler o relatório inteiro na primeira rodada, em vez de inferir
o estado a partir de exceções parciais.
