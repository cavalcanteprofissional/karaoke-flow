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
| Perfis                       | `profiles` (name/email/avatar, RLS só o próprio) + view `profiles_public` (id/name/avatar, ignora RLS). **Sem** nível de karaokê, preferências, áudio ou microfone.                                                                                                                                                                                                                                                   |
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

**Modelo (proposta):**

- `rooms` (ou `bars` — ver D2) ganha `permite_entrada_fora_raio boolean not null default false`.
- `room_members` ganha `fora_do_raio boolean not null default false` +
  `distancia_m integer` (opcional; ver D4) gravados no `join_room`.
- `checkPresence` passa a devolver **3 estados**: `inside` | `outside_allowed`
  (toggle ligado) | `outside_blocked`. O gate deixa de ser booleano; o retorno de
  erro ganha `code: "OUTSIDE_BAR_ALLOWED"` para o caso "entra marcado".
- `room_members` ganha política de **SELECT** para o host continuar lendo tudo
  (já lê) e passa a poder ler o que precisa; participantes **não** podem ler a
  coluna nova de outras linhas (RLS por linha já isola; confirmar no teste de RLS).

**UI:**

- Toggle "Permitir entrada de quem está fora do raio" no card de raio de presença
  (`presence-gate-info.tsx`), com aviso de que a pessoa entra **sem poder pedir música**.
- Card "Fora do raio" para o host, ao lado do painel de membros: cada linha com
  **nome/apelido + "dados básicos"**, **tag "fora do bar"** e o tipo de conta
  — **visitante sem login (anônimo)** ou **usuário** — + mesa + horário.
  Filtros: mesa, anônimo/usuário, "entrou há X min".

**Perguntas bloqueantes:** D1 (aprovação individual × livre), D2 (escopo
sala × bar), D4 (quanto dado ver/guardar + consentimento), D5 (limite por
pessoa/dia).

**Testes:** matriz do gate (dentro / fora com toggle off / fora com toggle on /
anônimo) na entrada por código e por QR; RLS provando que participante não lê
`fora_do_raio` alheio; lista do host com as duas variantes (anônimo/usuário).

---

## Fase 10 — Permissões: "fora do raio vê, mas não pede"

**Objetivo:** a regra vira **permissão**, não bloqueio: quem está fora entra,
escolhe mesa e vê a fila/player, e o botão de pedir música simplesmente não existe.

**Regra (fonte única):** `canAskSong = isHost || (!fora_do_raio && presence.ok)`.
Aplicada em:

- `buildQueueSongItem` (`src/lib/rooms/queue.ts`) → erro `OUTSIDE_BAR_CANNOT_ASK`.
- `searchYouTubeForRoom` (`src/lib/youtube/service.ts`) → **decisão D3**: bloquear
  a busca ou devolver o catálogo em modo somente leitura (navegar ≠ pedir).
- UI: esconder "Pedir música"/campo de busca para quem está fora, com aviso
  "Você entrou como visitante: pode ouvir, não pode pedir música" e CTA
  "Quero pedir música" (leva o participante a **aprovar a localização**).
- O aviso de "fora do bar" **nunca** aparece para outro participante — só o host.

**Testes:** matriz de permissão por papel (host, dentro, fora, anônimo, pending) em
`addSongToQueueAction`, na rota de busca e nos botões da UI.

---

## Fase 11 — Tela "Mesa": quem está comigo + as músicas da mesa

**Objetivo:** participants veem **quem está na mesma mesa** e **quais músicas
foram pedidas naquela mesa** (a fila e o player continuam sendo os da sala,
iguais para todas as mesas).

**Leitura (sem mudar a fila):** `room_members` agrupado por `mesa_numero` da sala +
`queue_items` por `added_by_user_id` dos mesmos usuários. Opção de
desempenho (D9): `queue_items.mesa_numero` desnormalizado, escrito no
`addSongToQueueAction`.

**UI (por participante):** "Mesa N" — avatares/nomes dos colegas, o que cada um
pediu (título + status), e as músicas pedidas na mesa. Filtro por "minhas" /
"mesa inteira".

**Moderação e privacidade (D6):** opt-in de visibilidade (apelido em vez do nome
real), ocultar anônimos do ponto de vista dos colegas, denúncia/bloqueio por
usuário, e a regra de que a tag "fora do bar" é visível **só para o host**.

**Testes:** agrupamento por mesa com 2+ mesas reais, música pedida na mesa A não
aparece na mesa B, participante anônimo aparece como "visitante" (conforme D6),
Realtime ao entrar alguém na mesa.

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
  naquele bar** (não global) — é o número que o bar usa paraprograms de
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

**Três caminhos (D11 — qual o primeiro):**

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

## Decisões em aberto (bloqueantes)

| #   | Decisão                                                                                           | Por que é crítica                                                |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| D1  | O toggle libera **livre** ou o host **aproveva um a um**?                                         | Define a UX da entrada remota e o volume de modulateção do dono. |
| D2  | Toggle é **por sala** ou **por bar**?                                                             | Sala é a unidade de sessão; bar é a unidade de casa.             |
| D3  | Fora do raio pode **navegar no catálogo** ou a busca some?                                        | "Ver a fila" vs "procurar música" é a fronteira da restrição.    |
| D4  | Na lista do host, mostrar **distância** e quais dados? Tag "fora do bar" **exige consentimento**? | LGPD: dado de localização é sensível.                            |
| D5  | Algum **limite** de entradas fora do raio por pessoa/dia?                                         | Sem limite, o bar vira karaokê online.                           |
| D6  | Na tela da mesa, colegas veem o **visitante**? Anonymous aparece com nome?                        | Privacidade social dentro do bar.                                |
| D7  | Ao estourar o teste grátis: **bloqueia** tudo, **sugere plano**, ou **última música**?            | Define a primeira conversão de pago.                             |
| D8  | Regra de **quebra de dias consecutivos** (1 dia de tolerância? congelador?).                      | Politica de gamificação do cliente.                              |
| D9  | "Músicas da mesa": join em tempo real ou **coluna desnormalizada** na fila?                       | Custo/performance em salas cheias.                               |
| D10 | A **recompensa** dá badge, desconto no bar, ou tempo extra de canto?                              | Define o valor e amarra Fase 14 à Fase 15.                       |
| D11 | Pedido no bar: **deep-link**, **API do sistema deles**, ou **módulo nativo** primeiro?            | O bar já tem sistema; duplicar cardápio é o caminho caro.        |
| D12 | Pagamento: **assinatura do bar** (mensal) ou **pago pelo participante**? Provedor?                | Decide modelo e implementação.                                   |

> Os itens acima ficam abertos até o PO responder; as fases 9–15 já estão
> registradas no `TODO.md` como pendentes, com esses mesmos blocos de decisão.
