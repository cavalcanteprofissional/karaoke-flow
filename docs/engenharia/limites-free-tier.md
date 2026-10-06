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

### 3.2 O aviso de fila — **onde está o problema**

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

### 3.4 A soma — e a resposta ao item do `TODO.md`

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

| Achado                                                            | Ação                                                                                                                                                                                | Onde                                     |
| ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Aviso de fila custa 1,3 s, dos quais 1,3 s é abrir/fechar conexão | **Servir o aviso por um canal de longa duração** em vez de assinar/dessinar por mutação. Espera: `criar + assinar + enviar + fechar` → só `enviar` (0 ms), e o `removeChannel` some | `TODO.md`, Bloco da Fase 8               |
| Limite de 200 conexões não aperta                                 | Nenhuma ação. **Firebase deixa de ser plano B obrigatório**                                                                                                                         | `TODO.md` — item de validação de limites |
| Anônimo cria uma linha em `auth.users` por participante, sem teto | Voltar a este doc quando a Fase 9 liberar entrada remota; o crescimento de `auth.users` é o custo real do "link do dono"                                                            | Bloco 9A                                 |
| Banda e mensagens não medidas                                     | Medir com tráfego real (várias salas, fila mutando) quando houver uso de verdade — não antes                                                                                        | §2 deste doc                             |
| 2 s no p95 ainda não garantido                                    | Fixar o aviso (linha 1) e **só então** revalidar; hoje o número é 2039 ms                                                                                                           | `TESTING.md` §3.9·ter                    |

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
