# Aprofundamento da experiência do participante + monetizeção do bar

> **Status: planejamento apenas (2026-09-25).** Nenhum item deste documento foi implementado.
> As Fases 9–15 são o próximo bloco do roadmap depois da Fase 8; cada uma lista
> migration, UI, regra de permissão, testes e as decisões que ainda precisam ser
> respondidas. O checklist vivo está no [`TODO.md`](../../TODO.md).
>
> **Escopo do pedido que originou este documento:** (1) toggle do host que permita
> entrada de gente **fora do raio de presença**, sinalizada **só para o dono do
> bar**; (2) gente fora do raio **não pede música** — só entra, vê a fila e a
> mesa; (3) tela "quem está na minha mesa" + as músicas pedidas naquela mesa;
> (4) aprofundamento de experiência do participante (saber o nível de karaokê /
> som / microfone, sugestão de ajustes); (5) período de teste grátis com
> alarme/modal/countdown de música ("quantas faltam", "minutagem restante",
> "sua música é a próxima em 30s"); (6) dias consecutivos, alarme nas 2 primeiras
> solicitações do dia e recompensa por quantidade de músicas por bar; (7)
> pagamento e pedido de comida/bebida via mesa, contra o sistema que o bar já usa.

---

## 0. Ponto de partida (o que existe hoje)

Levantamento no código em 2026-09-25 — base de todas as fases:

| Peça                         | Estado real                                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Gate de presença             | `checkPresence` em `src/lib/bars/geo.ts:55` é **binário** (dentro/fora) e **não persiste nada**. Aplicado em 3 lugares de entrada (`getEntryPreviewAction:145` só calcula, `joinEntryAction:253` bloqueia, `enterRoomByCodeAction:414` bloqueia) e em 2 de música (`addSongToQueueAction` via `queue.ts:85`, `searchYouTubeForRoom` via `youtube/service.ts:101`) — hoje a **busca** também é bloqueada fora do raio. |
| `room_members`               | `(room_id, user_id)` PK, `status` (`pending`/`approved`/`rejected`), `joined_at`, `mesa_numero` solto (sem FK). **Não existe** coluna de presença/raio. RLS: SELECT só a própria linha ou se for host.                                                                                                                                                                                                                |
| `rooms`                      | `entry_mode` (`open`/`approval`), `queue_approval_mode`, `bar_id`. **Não existe** coluna para "permitir entrada remota".                                                                                                                                                                                                                                                                                              |
| `bars`                       | `raio_permitido_metros` default **500** (migration `20260925000024`), lat/lng, endereco, `quantidade_mesas`.                                                                                                                                                                                                                                                                                                          |
| Fila                         | `queue_items` por **sala** (compartilhada por todas as mesas), com `added_by_user_id` — mas **sem** `mesa_id`/`duracao executada`. `QueueList` é read-only e **nunca mostra quem pediu**.                                                                                                                                                                                                                             |
| Host                         | Sobe ver **apenas os `pending`** (`PendingEntries`, nome + "aguardando aprovação"). Não há painel de membros aprovados, nem por mesa, nem de presença.                                                                                                                                                                                                                                                                |
| Player                       | **Não existe** (`/player/[codigo]`, `PlayerControls`, transição para `playing` — tudo Fase 6/7). Sem `started_at`/`finished_at`, sem cronômetro, sem "próxima música".                                                                                                                                                                                                                                                |
| Anônimo                      | Login anônimo do Supabase (`is_anonymous` só no JWT). Pode entrar, ver a fila e **pedir música** (sujeito ao gate). Não tem e-mail; `profiles.name` cai no prefixo do e-mail → "usuário".                                                                                                                                                                                                                             |
| Perfis                       | `profiles` (name/email/avatar; API só `id/name/avatar` via view **invoker**) + view `profiles_public` (`security_invoker=true` desde `20260928000033`, email nunca exposto). **Sem** nível de karaokê, preferências, áudio ou microfone.                                                                                                                                                                              |
| Pagamento/pedido/gamificação | **Nada**: nenhuma tabela, nenhuma integração, nenhum item no roadmap. A monetization só aparece como pergunta de pesquisa (`questionario-donos-estabelecimento.md` Q6–Q9) e como "fora do MVP" na spec.                                                                                                                                                                                                               |

**Lacunas que as fases precisam fechar** (ordem importa):

1. O gate é binário e volátil → falta um **terceiro estado** ("entrou por permissão do host, fora do raio").
2. Falta **persistir** a decisão de presença junto do membro (hosta só veria algo que não existe).
3. Falta separar **"pode ver a fila"** de **"pode pedir música"** — hoje uma regra só para os dois.
4. Fila é por sala, `mesa_numero` não tem FK → "músicas da minha mesa" exige join em dois níveis.
5. Player não existe → timer, "minutagem" e "sua música é a próxima" dependem da Fase 6.
6. Nada de gamificação/pagamento/pedido — cada fase abaixo cria sua primeira tabela do gênero.

---

## Fase 9 — Entrada remota controlada + lista "fora do raio" (host)

**Objetivo:** o host decide se aceita gente de fora do raio; quem entra por essa via
fica **marcado como "fora do bar"** e isso só aparece para o dono.

**Decidido com o PO (2026-09-25):**

- **D1 — aprovação individual:** quem está fora do raio **não entra livre**; o
  toggle por sala faz a entrada cair como `pending` e o dono aprova/rejeita no
  painel que já existe (`PendingEntries`) — a lista "fora do raio" mostra quem
  está **aguardando** e quem já foi **aprovado marcado**.
- **D2 — o toggle é por sala:** coluna em `rooms` (a sessão), não em `bars`; o
  raio continua sendo do bar.
- **D4 — a lista do dono mostra a distância em metros:** `room_members.distancia_m`
  (snapshot do geo no momento da entrada, lido do cookie `kf-geo`) + tag "fora do
  bar" + tipo de conta (visitante sem login × usuário). **Dado sensível de
  localização**: exige consentimento explícito de quem entra fora (aviso antes de
  concluir a entrada), finalidade declarada ("o dono vê que você está fora e a
  distância aproximada") e prazo de retenção (some ao sair/fechar a sala + janela
  de retenção a fechar com a Fase 8 de LGPD).

**Além do QR e do código: link de convidado do dono (bloco 9B).** O dono também
gera um link próprio de entrada remota, que **pula a digitação do código**:

- Geração: `rooms.link_convidado` (token aleatório) + botão "Copiar link" e menu de compartilhamento. **D5 (2026-10-01): sem expiração e sem limite de usos** — quem entra por ele cai como `pending` e o dono aprova, então quem segura o link não abre a sala sozinho; a defesa é a aprovação do host, não a janela de validade. A **revogação é manual** (o host invalida o link na hora, como já faz com o link da TV).
- Compartilhamento: **Web Share API** (`navigator.share`) no mobile — abre a folha
  de compartilhamento do sistema, incluindo Instagram — + botões explícitos para
  **WhatsApp** (`wa.me/?text=`), **Telegram** (`t.me/share/url`), **Facebook**
  (`facebook.com/sharer`) e **X/Twitter** (`twitter.com/intent/tweet`).
  **Instagram feed/story não tem URL de compartilhamento web** (a API do Instagram
  é business-only): no desktop o fallback é "copiar link", no mobile o
  `navigator.share` cobre o app. Outros canais candidatos: e-mail (link em
  HTML), SMS, e o `RoomQr` já existente gerando PNG **com o link de convidado**
  impresso para a mesa.
- O link **não** pula a aprovação: ele só substitui o passo de localizar a sala
  (vai direto para a tela de espera). **Fechado em D5 (2026-10-01): não há segunda
  flag de "entra sem aprovar" no MVP.**

**Modelo (proposta):**

- `rooms` ganha `permite_entrada_fora_raio boolean not null default false` e
  `link_convidado text`. **D5 (2026-10-01) decidiu que `link_convidado_expira_em` e
  `link_convidado_usos` NÃO existem** — o link vive até o dono revogar.
- `room_members` ganha `fora_do_raio boolean not null default false` +
  `distancia_m integer` + `via_link_convidado boolean`, gravados no `join_room`.
- `checkPresence` deixa de ser booleano e passa a devolver **3 estados**:
  `inside` | `outside_allowed` (toggle ligado) | `outside_blocked`; o retorno de
  erro ganha `code: "OUTSIDE_BAR_ALLOWED"` para o caso "entra marcado".
- `room_members` ganha política de **SELECT** para o host continuar lendo tudo
  (já lê) e passa a poder ler o que precisa; participantes **não** podem ler a
  coluna nova de outras linhas (RLS por linha já isola; confirmar no teste de RLS).

**UI:**

- Toggle "Permitir entrada de quem está fora do raio" no card de raio de presença
  (`presence-gate-info.tsx`), com aviso de que a pessoa entra **sem poder pedir
  música**.
- Bloco "Link de convidado": gerar, copiar, compartilhar (com contador de usos e
  expiração quando definidos).
- Card "Fora do raio" para o host, ao lado do painel de membros: **nome/apelido +
  dados básicos**, **distância em metros**, **tag "fora do bar"** e o tipo de
  conta — **visitante sem login (anônimo)** ou **usuário** — + mesa + horário.
  Filtros: mesa, anônimo/usuário, aguardando/aprovado, "entrou há X min".

**Ainda aberto:** nada — **D5 foi resolvida em 2026-10-01** (ver tabela abaixo).

**Testes:** matriz do gate (dentro / fora com toggle off / fora com toggle on /
anônimo) na entrada por código, por QR e por link de convidado; RLS provando que
participante não lê `fora_do_raio`/`distancia_m` alheio; lista do host com as duas
variantes (anônimo/usuário) e com a distância; link expirado/usado demais.

## Fase 10 — Permissões: "fora do raio vê, mas não pede"

> **Parcialmente entregue em 2026-10-02, na frente do combinado.** A separação
> entre "pode entrar" e "pode pedir música" deixou de ser binária: `outside`
> **não bloqueia mais a entrada** e a pessoa entra **sem mesa**, só assistindo; a
> fila continua barrando (o corte está em `buildQueueSongItem`, que não foi
> tocado). Os predicados `canEnterAsViewer` / `needsLocationConsent` /
> `isOutsideBar` (`src/lib/bars/geo.ts`) são a fonte, e `geo-unavailable` — sem
> consentimento — **continua bloqueando**, porque sem o cookie de localização não
> dá para saber onde a pessoa está.
>
> **Fechada em 2026-10-03, e a regra subiu de camada:** o corte deixou de ser só
> de UI e passou a ser **do banco** (`20261003000041`). A fonte única é a
> `member_entry_state` (o estado efetivo, com a pré-aprovação de 24h), não mais
> `select status` em `room_members`: `addSongToQueueAction` recusa o espectador
> aprovado com `OUTSIDE_BAR` **antes** de tentar o `INSERT`, e `pick_mesa` recusa
> a mesa no servidor. `fora_do_raio` é gravado no `join_room`, então é
> **imutável para a sessão** — GPS posterior não "corrige" ninguém para dentro.
> No app, `canRequestSongs` / `canPickMesa` (`src/lib/rooms/spectator.ts`) são a
> mesma regra para a UI, e o `/buscar` redireciona quem não pode pedir.
> `geo-unavailable` — sem consentimento — **continua bloqueando a entrada**.
>
> **O que NÃO está entregue** (o resto da Fase 9 e da Fase 11):
>
> - **O toggle "Permitir entrada de quem está fora do raio" do host continua
>   inexistente.** Hoje quem está fora entra direto quando a sala está com
>   `entry_mode = open`, e cai como `pending` quando está com
>   `entry_mode = approval` — a aprovação individual da **D1** é o que acontece
>   hoje pela regra de `entry_mode` da sala — mas ainda não há um controle dedicado ao remoto.
> - **A lista "fora do raio" para o dono** não existe ainda como lista: a decisão
>   de presença **é persistida** (`fora_do_raio`, migration `00040`), o painel
>   mostra o **contador** de quantos estão fora, mas falta o card com nome,
>   distância e filtros (lacuna 2 acima, parcialmente fechada).
> - **A UI de dois níveis de visibilidade da Fase 11** (agregado por mesa) não existe, e o
>   aviso de "fora do bar" **não** foi escondido dos outros participantes (isto
>   sim é da Fase 11: exige o agregado, que também não existe).
> - **Reprodução simultânea em vários dispositivos** foi adiada com o PO
>   (2026-10-03): `/player/<código>` sem `player_token` é **modo espectador**
>   (mudo, sem gate, sem "Trancar TV", sem claim e sem autoavanço) e quem está
>   dentro do raio **também** cai nesse modo ao abrir o player no celular — a
>   música toca só na TV. Toque em "Trancar TV"/sessão na TV é o que fica para
>   uma fase futura.
> - **O CTA "Quero pedir música"** (levar o espectador a aprovar a localização)
>   **não** foi implementado: a decisão do PO foi manter o espectador como
>   espectador até o fim da sessão, sem caminho de "upgrade" no meio da karaokê.

**Objetivo (cumprido em 2026-10-03):** a regra virou **permissão**, não bloqueio:
quem está fora entra sem mesa, vê a fila da sala e o player em modo somente
leitura, e o botão de pedir música simplesmente não existe.

**Regra (fonte única):** `canAskSong = isHost || (!fora_do_raio && presence.ok)`.
Aplicada em:

- `buildQueueSongItem` (`src/lib/rooms/queue.ts`) e a **`addSongToQueueAction`**
  (`src/lib/rooms/queue-actions.ts`) → erro `OUTSIDE_BAR`, os dois no servidor.
- `searchYouTubeForRoom` (`src/lib/youtube/service.ts`) → **D3 resolvido: a busca
  some para quem está fora** — a busca é o passo que antecede o pedido, então
  mantê-la seria só criar a tentação de um botão que não pode funcionar. O
  `/buscar` escrito à mão redireciona para a sala.
- UI: esconder "Pedir música"/campo de busca para quem está fora, com aviso
  "Você entrou como visitante: pode ouvir, não pode pedir música" — **entregue**,
  e sem CTA de upgrade (ver o adendo acima).
- `pick_mesa` no banco recusa `fora_do_raio`, e o app esconde o `MesaPicker`.
- O aviso de "fora do bar" **nunca** aparece para outro participante — só o host.

**Testes:** matriz de permissão por papel (host, dentro, fora, nunca entrou,
pending) em `addSongToQueueAction`, na rota de busca e nos botões da UI —
entregue em `spectator.test.ts`, `queue-actions.test.ts`, `queue-list.test.ts` e
`player-kiosk.test.ts`.

---

## Adendo 2026-10-04 — Uma música ativa por participante

> **Entregue (migration `20261004000042`)**, e é uma regra de **permissão** como
> a da Fase 10: o motivo declarado do pedido era um visitante sem login autenticado
> com várias músicas suas em `ZEHBAR`, e a fila da TV ia Walkman sem que ninguém
> soubesse qual era o pedido ativo de quem.
>
> **Regra:** uma música **ativa** por participante, por sala. Ativa = `pending` +
> `approved` + `playing` — o que a fila mostra, não um estado novo. Pedir outra
> **substitui**; pedir com uma **tocando** é **recusado** (trocar a que toca
> cortaria o áudio da TV), e a vaga abre quando ela vira `played`. Vale para o
> anônimo, que é usuário Supabase de verdade. O host é isento **na própria sala**.
>
> **Sobeu para o banco pelo mesmo motivo da Fase 10:** o pedido é um `INSERT`
> direto e a policy só exige membro/host — um botão desabilitado seria furado
> por qualquer chamada autenticada. A trigger roda **sem `security definer`**,
> porque a policy do autor já autoriza o `delete` da substituição.
>
> **A tela avisa nos dois sentidos** (antes e depois), que é a parte que o banco
> não dá: o aviso cita o **título** da música que sai.
>
> **Limite declarado:** a identidade do visitante anônimo é **do navegador** —
> limpar os dados do site cria outra. Fechar isso é prova de identidade, não uma
> trigger. Detalhe em [`../flows/fluxos-do-sistema.md`](../flows/fluxos-do-sistema.md)
> §3.1.2 e roteiro em [`../../TESTING.md`](../../TESTING.md) §3.14.

---

## Adendo 2026-10-07 — Fase 8g: legenda OFF de propósito, busca que destrava sozinha e o card do Player ao vivo

**Três entregas, uma única causa raiz: o banco sabia o que terminava, a UI não.**

- **Legenda desligada de propósito, não por omissão (A):** `cc_load_policy: 0` em `src/components/rooms/youtube-stage.tsx`. O que o YouTube chama de legenda aqui é **transcrição automática por IA**, não letra de karaokê — numa sala de karaokê ela atrapalha o canto. Antes o OFF era "não passamos o parâmetro"; agora é uma **decisão explícita**. O contrato dos **8 `playerVars`** (`autoplay`, `controls`, `rel`, `fs`, `playsinline`, `iv_load_policy`, `cc_load_policy`, `origin`) passou a ser testado com `toEqual` (`youtube-stage.test.tsx`) — apagar `controls: 1` vira vermelho. Ver `fluxos-do-usuario.md` §5.

- **A fila não destravava a busca (B1):** enquanto a música do participante estava em `playing`, a página de busca só destravava no próximo render do servidor (navegar/F5). A virada `playing → played` acontece **dentro da TV** (`claim_next_song`), sem revalidar `/salas/<código>/buscar`. Foi unificada uma **única regra**: `ownActiveSongView` (`src/lib/rooms/queue.ts`) — lida por `readOwnActiveSong` (servidor) e `useOwnActiveSong` (cliente) — com `postgres_changes` em `queue_items`, broadcast da fila, poll de 10 s, relê no foco/visibilidade/online. `claimNextSongAction` e `setPlaybackAction` **revalidam** `/salas/<código>` e `/salas/<código>/buscar`. **O host não tem limite** e nunca era para ver o aviso: o leitor antigo saía antes de olhar `playing` para o host — a caixa "sua música vai sair" aparecia quando não podia aparecer. Corrigido. Roteiro em [`../../TESTING.md`](../../TESTING.md) §3.16.

- **Item preso em `playing` ao trancar a TV (B2):** com a TV trancada, `onEnded` não dispara e os guards de avanço se recusam a agir — a regra "uma música tocando não aceita novo pedido" (`KF001`) deixava aquele item em `playing` para sempre. A saída não era uma coluna `playback_held` (esta **nunca existiu** no banco — migrations saltam de `00031` para `00033`), mas a **própria TV** saber que trancou. Nova RPC `release_current_item` (`20261005000044`, `security definer`, mesma porta `player_room_id`) é chamada pelo quiosque **antes** de limpar o arm (`player-arm.ts`, localStorage), devolve a faixa para **`approved` na mesma posição**, põe a sala em `idle`, sob o mesmo advisory lock. Falha do RPC não impede o "Trancar TV"; **depois do release o cantor pede de novo**. Smoke 11/11 no Cloud `kskoipyzqcacccepcqpc`. Detalhe em [`../flows/fluxos-do-sistema.md`](../flows/fluxos-do-sistema.md) §4.4. **Limite declarado:** fechar o navegador no meio da faixa não dispara — o destravamento continua sendo Pular/Parar do host.

- **O card "Player da TV" ao vivo (C):** deixava de acompanhar a realidade da TV (aparecia "tocando" numa sala ociosa). Passou a ler o estado ao vivo (`usePlaybackLive`), pela **sessão do host** — não pelo token — com broadcast + poll de 10 s + relê no foco. A **TV também anuncia** (depois do `claim` e do release), evitando duplo canal e mantendo coerência entre os painéis.

**Gates:** lint, `tsc`, **705 testes / 52 arquivos** e `build` verdes; **`scan:secrets` vermelho por 7 achados pré-existentes** (fixtures de chave falsa de rodadas anteriores), sem allowlist nova (reportado no `TODO.md`); migration aplicada no Cloud, smoke 11/11.

---

## Fase 11 — Visibilidade em dois níveis: agregado da sala + detalhe da mesa

**Decidido com o PO (2026-09-25) — D3:** quem está fora do raio (após aprovado
pelo dono) vê **a fila/playlist e o player ao vivo** (watch party), e **dados
agregados por mesa** — quantas pessoas em cada mesa e quantas músicas foram
pedidas em cada mesa. **Não** vê nome, foto nem qualquer dado pessoal de ninguém.
**Somente quem está na mesma mesa** vê foto, nome e o que cada um pediu.

Isso fixa a arquitetura de leitura em **dois níveis**:

**Nível 1 — sala (todo mundo na sala, inclusive fora do raio):**

- fila/player ao vivo (o que já existe, mais o player da Fase 6);
- agregado por mesa: `Mesa 3 · 4 pessoas · 3 músicas`. Vem de uma contagem por
  `room_members.mesa_numero` e por `queue_items` dos mesmos usuários — **sem**
  join de nome/avatar, e **sem** distinguir dentro/fora do raio.

**Nível 2 — mesa (só quem compartilha o mesmo `mesa_numero`):**

- foto, nome e o que cada um pediu (título + status);
- leitura: `room_members` da mesa + `queue_items` por `added_by_user_id`.
  Opção de desempenho (**D9**): `queue_items.mesa_numero` desnormalizado, escrito
  no `addSongToQueueAction`.

**Regras de privacidade que continuam valendo:**

- a tag "fora do bar" (e a distância) é visível **só para o dono do bar** — nem
  os colegas de mesa veem;
- no nível 1, o agregado **conta** quem está fora (é inevitável e é o pedido do
  PO: "quantidades de usuários por mesa"), mas sem identificar;
- anônimo aparece como "visitante" no nível 2 (**D6** ainda aberta: nome/apelido,
  opt-in e denúncia/bloqueio por usuário).

**Testes:** agregado por mesa com 2+ mesas reais; música pedida na mesa A não
aparece no detalhe da mesa B; participante do nível 1 não consegue ler nome/avatar
da mesa A (teste de RLS/query); fora do raio aprovado vê só nível 1 + player;
colegas de mesa veem nível 2; Realtime quando alguém entra na mesa.

---

## Adendo 2026-10-03 — Painel do host: o que o dono olha de relance

**Pedido do PO:** o dono da sala quer olhar um painel e saber, sem abrir nada, como
está a noite — **quantas músicas estão aprovadas e quantas aguardando**, **quantas
pessoas em cada mesa e quantas estão fora do raio**, **quanto tempo de música ainda
falta** e **quantas músicas tem na lista**.

**Já entregue (2026-10-03, migration `20261003000040`):**

- **Quem está na sala, separado por raio e por mesa** — card `RoomOccupancyCard`
  (`src/components/rooms/room-occupancy.tsx`) na aba de configurações da sala, que
  só o host vê. Três números (na sala / dentro do raio / fora do raio), os
  pendentes ao lado e as **todas as mesas do bar desenhadas, inclusive as vazias**
  (mesa vazia é informação: mostra que o QR não colou em lugar nenhum).
- **A presença precisa ser gravada para ser contada.** Antes o `kf-geo` vivia só no
  cookie do navegador de cada um; o banco não tinha como saber de onde veio a
  pessoa. `join_room` agora grava `fora_do_raio` + `distancia_m` no momento da
  entrada, e `room_members` ganha `replica identity full` para o `DELETE` (quem
  sai) chegar no Realtime.
- **A contagem vem de uma RPC host-only** (`admin_room_occupancy`), não de um
  `select`: a RLS de `room_members` é por linha, então nem o host conseguiria somar
  os outros por cima da tabela. Só conta `approved`; `pending` sai separado; o host
  e a TV não têm linha e não entram na conta.
- **O número de "fora do raio" deixou de depender da UI** no mesmo passo
  (`20261003000041`): `addSongToQueueAction` recusa o espectador com `OUTSIDE_BAR`
  pelo estado efetivo (`member_entry_state`), `pick_mesa` recusa a mesa e
  `claim_next_song` passou a exigir o `player_token` da TV — sem token, nem
  espectador nem participante autenticado movem a fila. Isso é o que garante que
  as três contagens do card não dependam de ninguém respeitar a tela.

**Ficou registrado para as próximas fases (não implementado ainda):**

1. **Aprovadas × aguardando, da fila.** Hoje o `PendingEntries` mostra os
   *participantes* esperando; falta o parágrafo equivalente para as *músicas*
   (`queue_approval_mode = "approval"`): `12 aprovadas · 3 aguardando`, com Realtime
   em `queue_items`.
2. **Duração total da fila + a que está tocando.** "Quanto tempo de música ainda
   falta" é a soma das durações dos itens `approved`/`playing`, com a música em
   execução contada do `started_at` até agora. A duração precisa vir de algum
   lugar confiável (metadados do YouTube ou `duracao_segundos` em `queue_items` —
   hoje não existe coluna); enquanto isso, a soma por faixas de 3–4 min serve de
   aproximação, e a interface deve dizer que é estimativa ("~2h10", com margem de
   alguns minutos), nunca um número exato. É decisão de display, não de matemática:
   o dono precisa da ordem de grandeza para decidir se corta a songs.
3. **Total de músicas da lista ao vivo.** Um contador simples (`23 músicas na
   lista`), que é a soma de `approved + pending + playing + played` do dia — com
   Realtime em `queue_items`, no mesmo card.
4. **Filtros por mesa no card** (Fase 11 properamente dito): "Mesa 3 · 4 pessoas ·
   3 músicas", sem nome de ninguém, e com o corte dentro/fora do raio só para o
   host.

**Por que não entra no mesmo passo:** os quatro dependem de `queue_items` ganhar
duração confiável e de `queue_items.mesa_numero` desnormalizado (opção **D9** da
Fase 11). Fazer a contagem de pessoas agora era possível; a de músicas exige
decidir a fonte da duração primeiro, e mexer nisso às cegas darija a métrica que
o dono vai usar a noite inteira.

---

## Fase 12 — Perfil de karaokê: saber a experiência e sugerir ajustes

**Objetivo:** responder "como está o som/microfone" com sugestão concreta, em vez
de a pessoa desistir.

**Dados (novo):** `profiles.karaoke_level` (1–5, autodeclarado no onboarding e
editável) e um check-list de áudio — **"som muito alto"**, **"microfone muito
baixo"**, eco, delay, música alta demais. Plus, opcionalmente, um **teste de
microfone no app** (mede o nível de entrada via Web Audio e sugere ganho).

**Entrega:** um "Check de som" de 30 s antes da primeira música, com
diagnóstico e 1–2 sugestões acionáveis (abaixar o volume do dispositivo, aproximar
o microfone, desligar eco, etc.), gravando o resultado no perfil.

**Extras de experiência já anotados:** ao entrar na mesa, mostrar quem já cantou
(perfil de nível) e sugerir músicas compatíveis com o nível da mesa.

**Testes:** perfil salva/editar; check exibe a sugestão certa por sintoma; nada de
áudio gravado (só diagnóstico) — alinhar com LGPD.

---

## Fase 13 — Tempo de música, teste grátis e alarme (depende da Fase 6)

**Objetivo:** o participante sempre saber **quanto falta** e **quando é a vez dele**.

**Dependência:** Fase 6 (player) e Fase 7 (controle) primeiro — hoje não existe
`started_at`, nem transição para `playing`, nem "próxima". O plano assume o
player pronto.

**Mecânica:**

- `queue_items` ganha `started_at`/`finished_at` (minutagem real por música).
- Contador diário por participante: `usage_counters(user_id, room/bar_id, dia,
musicas, minutos)` — o número que alimenta "**quantas faltam**" e a
  "**minutagem restante**".
- **Alarme/modal** ao abrir a tela de música com: pedidoSongs restantes,
  minutos restantes, e o aviso de fechamento do período grátis.
- **Countdown de 30 s**: quando a próxima música da fila é a sua, um contador
  fixo avisa "sua música é a próxima" e depois "é a sua agora".
- **Alarme do dia:** o mesmo modal bloqueante/recolocável nas **2 primeiras
  solicitações do dia** de cada pessoa — apresentação do tempo antes de gastar.
- Ao estourar o limite: o que acontece? (D7: bloquear, sugerir plano, ou
  "última música grátis").

**Testes:** cálculo de "quantas faltam"/minutos; countdown respeita o
`position`; alarme aparece nas 2 primeiras do dia e só nas; sala com N pessoas
tem N contadores independentes.

---

## Fase 14 — Recompensas: dias consecutivos + quantify por bar

**Objetivo:** transformar frequência em hábito.

- **Dias consecutivos (streak):** +1 por dia com ≥1 música pedida; regras de
  quebra (D8: perde com quantos dias de folga; "congelador" para quem falta
  domingo?); marco visual (7/14/30 dias).
- **Recompensa por quantidade por bar:** contador **acumulado de músicas pedidas
  naquele bar** (não global) — é o número que o bar usa para programs de
  fidelidade; e contador **da sessão** (músicas pedidas hoje, nesta sala).
- **Ranking opcional do bar:** quem mais pediu na semana (só para o host, ou
  placar público da mesa).
- **O que a recompensa entrega (D10):** em desligar do produto, badge + número;
  ligar a **desconto no consumo** do bar (Fase 15) e/ou **tempo de canto extra**.

**Testes:** streak conta/quebra corretamente; contador por bar isola bares;
recompensa dispara uma vez no marco.

---

## Fase 15 — Pagamento + pedido de comida/bebida via mesa (com o sistema do bar)

**Objetivo:** o cliente pede **comida/bebida no sistema que o bar já usa** e
**música na mesma aplicação**; pagamento entra como modelo do bar
(assinatura do questionário) e/ou do participante.

**Três caminhos (D11 — adiado: a escolha será avaliada diretamente com o bar):**

1. **Deep-link para o sistema do bar** (WhatsApp/cardápio/QR do próprio bar):
   sem integração, sem dados, sem risco fiscal. A tela "Mesa N" ganha um botão
   "Pedir no bar" que abre o link com o número da mesa.
2. **Integração via API do sistema do bar** (se o sistema do bar tiver API/PDV):
   pedido sai do app e cai no sistema deles (comidinha pronta, status volta).
3. **Módulo nativo de pedido no app:** `table_orders` (mesa, itens, status,
   quem pediu) + confirmação do bar. Mais bonito, mas duplica o cardápio e cria
   obrigação fiscal (nota,-imposed, commissionamento).

**Pagamento:** assinatura mensal do **bar** (Q6–Q9 do questionário: "paga uma
vez, sem assinatura por assento") e/ou compra avulsa do participante (Pix/
cartão). Provedor a definir (D12). Comissão sobre bebidas é hipótese de pesquisa,
não compromisso.

**Dependências:** Fase 11 (mesa), Fase 14 (recompensa ligando a desconto), e
Fase 13 (tempo de canto como "moeda" do plano).

---

## Dependências e ordem sugerida

```
Fase 6 (player) ──┐
Fase 7 (controle) ┼─→ Fase 13 (tempo/teste grátis/alarme)
                  └─→ Fase 12 (check de som usa o áudio do player)

Fase 9 (toggle + lista) ─→ Fase 10 (permissão sem música)
                            └─→ Fase 11 (tela da mesa)
                                              └─→ Fase 14 (streak + contadores)
                                                          └─→ Fase 15 (pagamento + pedido)
```

## Decisões: o que já foi resolvido e o que continua aberto

### Resolvidas com o PO (2026-09-25)

| #   | Decisão                                                            | Resposta                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Toggle: livre × aprovação individual?                              | **Aprovação individual** — fora do raio cai como `pending` e o dono aprova; **mais** um **link de convidado** gerado pelo dono (além de QR/código), com botão de copiar e compartilhamento (Web Share API + WhatsApp/Telegram/Facebook/X; sem URL web para Instagram). O link não pula a aprovação.                                                                                                                                                                                                                                            |
| D2  | Escopo do toggle                                                   | **Por sala** (`rooms`); o raio continua sendo do bar.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| D3  | O que quem está fora enxerga                                       | **Fila/playlist + player ao vivo + agregados por mesa** (pessoas e músicas por mesa). Sem nome/foto de ninguém. **Detalhes (foto, nome, músicas de cada um) só entre quem está na mesma mesa.** A busca some para quem está fora.                                                                                                                                                                                                                                                                                                              |
| D4  | Dado do fora-do-raio na lista do dono                              | **Com distância em metros** + tag "fora do bar" + tipo de conta (visitante sem login × usuário) — com **consentimento explícito** e retenção a fechar na Fase 8 (LGPD).                                                                                                                                                                                                                                                                                                                                                                        |
| D11 | Pedido de comida/bebida                                            | **Adiado de propósito**: as opções (deep-link para o sistema do bar × API do PDV deles × módulo nativo) serão avaliadas **diretamente com o bar** antes de escolher.                                                                                                                                                                                                                                                                                                                                                                           |
| D5  | Link de convidado e teto de entradas fora do raio (**2026-10-01**) | **O link NÃO pula a aprovação** (cai como `pending`, igual a D1); **sem expiração**; **sem limite de usos**; **sem teto de entradas fora do raio por pessoa/dia**. A defesa é a aprovação do host, não a janela de validade: como quem chega por ele sempre passa por ele, o link só substitui o passo de digitar o código. Revogação é **manual** (o dono invalida na hora). **Consequência no modelo:** as colunas `link_convidado_expira_em` e `link_convidado_usos` do rascunho original **saem** — só `rooms.link_convidado` + revogação. |

### Ainda abertas (bloqueantes para implementar)

| #   | Decisão                                                                                                                                     | Por que é crítica                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| D6  | No detalhe da mesa, o anônimo aparece com nome/apelido? Opt-in de visibilidade? Denúncia/bloqueio?                                          | Privacidade social dentro do bar.                  |
| D7  | Ao estourar o teste grátis: **bloqueia** tudo, **sugere plano**, ou **última música** grátis?                                               | Primeira conversão de pago.                        |
| D8  | Regra de **quebra de dias consecutivos** (1 dia de tolerância? congelador?).                                                                | Política de gamificação do cliente.                |
| D9  | "Músicas da mesa": join em tempo real ou **coluna desnormalizada** `queue_items.mesa_numero`?                                               | Custo/performance em salas cheias.                 |
| D10 | A **recompensa** dá badge, desconto no consumo do bar, ou tempo extra de canto?                                                             | Define o valor e amarra a Fase 14 à Fase 15.       |
| D12 | Pagamento: **assinatura do bar** (mensal) ou **pago pelo participante**? Provedor (Pix/cartão)?                                             | Decide modelo e implementação.                     |
| D13 | Estratégia de conteúdo: manter **YouTube-first** pragmático ou migrar para **catálogo licenciado/híbrido**? (gatilhos + caminho reversível)   | Formalizado em [`ADR-001`](../decisions/ADR-001-youtube-first-vs-licensed-catalog.md); reavaliar por gatilhos comerciais/TOS. |
| D14 | O "teste grátis" é **por bar**, por participante, ou uma janela única do app? E o que é "canto": músicas pedidas ou **minutos**?            | Define o contador e o alarme.                      |
| D15 | A "distância em metros" da lista do dono: arredondada (100 m, 500 m) ou exata? E quem pode vê-la (só o dono que é o bar? também um gestor?) | Dado sensível; granularidade muda o risco de LGPD. |

> As Fases 9–15 já estão registradas no `TODO.md` como pendentes, com esses
> mesmos blocos de decisão.
