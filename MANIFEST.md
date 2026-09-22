# MANIFESTO — Karakê Watch Party

> **Status do documento:** rascunho em validação — v0.1 (2026-09-21)
> **Fonte de verdade técnica:** [`karaoke-watch-party-spec.md`](./karaoke-watch-party-spec.md)
> **Validação de mercado:** [`questionario-donos-estabelecimento.md`](./questionario-donos-estabelecimento.md)
>
> Este manifesto não é a especificação. A especificação diz *como* o sistema funciona;
> este manifesto diz *por que* ele existe. É lido devagar, é assinado de volta, e é revisto
> pela camada de pessoas que esta casa serve — cantores e donos — antes de ser canônico.

---

## 1. Preâmbulo

Há uma casa em que a voz é hóspede de honra. Nela, quem canta é aplaudido pelo garfo que pousa,
o copo que espera e o olhar que se vira. Nela, o dono não é caixa nem porteiro: é quem segura a
luz para o palco alheio arder. Esta casa já existe — a música em si é sua. O que falta a esta
geração é o *elo discreto*: a fila, o pedido, o aplauso que atravessa a mesa sem atravessar o
trabalho de quem atende.

**Karakê Watch Party** é esse elo. Não é mais um player. É a **fila da casa** que os celulares
alcançam e o quiosque exibe, com a música sendo tocada onde o vídeo já toca: na televisão, de
uma cota própria de concessão — leal, barata e pública da casa.

Nós não construímos para o YouTube construir em nosso lugar. Construímos **para o dono**
(de quem é o esforço e a conta), **para o cantor** (de quem é a coragem) e **para a cidade**
(que é quem aplaude ao fundo).

---

## 2. Nós acreditamos

1. **A voz primeiro.** Uma noite de karaokê é uma sucessão de coragens particulares. Tudo na
   tela — a fila, o tempo de espera, o aviso do seu nome — deve tratar cada coragem como evento
   único, e não como número de uma fila.
2. **O dono é a casa.** Sem saúde financeira do estabelecimento não há palco. O que for cobrado
   deve caber no bolso da casa e parecer nada ao cantor; o que for grátis deve caber na
   generosidade de quem planta a noite. O dono comanda: aprova, reordena, pausa — e a casa
   obedece.
3. **A música é do cantor.** A fila é do cantor. Ela não morre quando ele vai ao banheiro nem
   recomeça quando a conexão engasga. O sistema é *submisso* à pessoa que canta — a tecnologia é
   a mesa de apoio, nunca o artista principal.
4. **O mínimo basta.** Fila, aprovação, rótulos de estilo e playback controlado. Tudo além disso
   é enfeite que envelhece. Preferimos poucos recursos profundos a muitos superficiais.
5. **Privacidade é parede.** Dados de quem entra numa sala são daquela noite — e ficam nela.
   Sem tracking de perfil, sem publicidade dirigida, sem vazar a frequência de ninguém. O
   anonimato é arquitetural (ver Apêndice §7).
6. **O palco é público, o custo é privado.** A cota do YouTube é da casa (via chave por host), e
   é paga uma vez, sem assinatura por assento — assim a sala canta de graça e quem segura o
   custo contrata a graça.

---

## 3. Compromissos

Prometemos, a partir de hoje, **em relação ao produto e às pessoas:**

- **Com o dono:** cobrança transparente, nunca surpresa, e a possibilidade de rodar de graça nos
  limites da cota gratuita da casa.
- **Com o cantor:** fila previsível, posição honesta, sem favor por pagamento — e o direito de
  saber quanto falta para o seu nome.
- **Com o estabelecimento:** nenhum dado do cliente sai da noite; nenhum dado da casa é
  reexportado para parcerias de publicidade.
- **Com o tempo:** quebrar o serviço é pior do que adiar recurso. RLS valida no banco o que a
  interface apenas sugere.
- **Com o código:** o que não está em migration, não existe; o que não está em fluxo, não é
  verdade (ver [`docs/flows`](./docs/flows)).

Não prometemos perfeição. Prometemos **arquitetura de reparação**: errar é humano e constar no
`CHANGELOG.md` é fino.

---

## 4. Para quem canta

Quem se aproxima do quiosque segura um coração e uma escolha. O sistema deve tratá-lo como a
casa trata um recém-chegado: com a porta aberta, o nome na boca e a noite na frente.

- A fila mostra **quantas músicas e quantos minutos** você espera — nada de mistério.
- O seu turno **alerta sem gritar** (sinal do seu celular + destaque na TV) para você não
  precisar olhar para o relógio do medo.
- A apresentação é sua: **tocar a sua música é tocar no seu momento**, e o quiosque entende
  isso — o controle de playback fica discreto, respeita o momento e volta para a fila.
- Errou o tom? A verificação **deixa substituir a música sem perder a posição** — porque voz é
  ensaio, não prova.
- Você **não precisa de conta** para cantar. Anonimato é a porta da frente desta casa.

---

## 5. Para quem é dono

Cada franquia desta casa é única — e o dono é o rei dela. O que o sistema faz:

- **Comanda a noite** na palma da mão e na mesma TV: aprova, reordena, remove e pausa em
  tempo real, sem interromper o gingle se o gingle for do momento.
- **Vê o estado da casa**: esta é uma ferramenta de gestão do fluxo do cliente e da performance
  da sala — não um painel de "engajamento".
- **Tem sua cota na mão**: usa a própria chave do YouTube (gratuita e suficiente para o
  funcionamento do karaokê) e administra seus limites — com honestidade sobre qual conta paga
  o quê.
- **Valida com a casa, não com o fornecedor**: nossa pesquisa de campo está em
  [`questionario-donos-estabelecimento.md`](./questionario-donos-estabelecimento.md) — e é
  preenchida por donos, para donos.

---

## 6. Acerca das Belas Artes

> *Seção pessoal do autor do sistema. O tom aqui é íntimo — a licença poética do manifesto.
> Baseada em dados reais do meu ouvido: históricos de escuta/canal do YouTube (Google Takeout –
> "YouTube and YouTube Music"), conforme planejado na spec §16/§17.*

> **⟨ rascunho pendente — aguardando dados. O Google Takeout ("YouTube and YouTube Music")
> foi solicitado em 2026-09-21 e o Google ainda não enviou o link. Quando os dados chegarem,
> rodarei a ferramenta pessoal isolada `ler-takeout.mjs` (fora do repositório,
> `Temp\opencode\yt-music`), extrairei o sinal musical (histórico YT Music, sem Shorts) e
> escreverei esta seção com o retrato real. ⟩**

---

## 7. Apêndice técnico: LGPD & privacidade

1. **Finalidade:** a fila e a sala existem para a noite; dados não têm dono fora da noite.
2. **Minimização:** não coletamos nome/email de quem canta (MVP). Apenas o host autentica
   (Supabase Auth) — e só o necessário para a identidade da sala.
3. **RLS como parede de verdade:** todas as leituras de sala passam por políticas do Supabase;
   participantes não enxergam nada além do que a função de “convidado da sala” permite.
4. **Nenhuma reexportação:** nada de analytics de terceiros, pixels ou publicidade dirigida.
5. **Registro e retenção:** `rooms`/`queue` são descartáveis; o direito do titular (solicitar
   cópia ou eliminação) é uma rota de dev futura, com operador registando o pedido.
6. **Na nuvem:** Supabase = Postgres gerenciado, RLS nativa e Realtime. Custo previsível no
   Free Tier para MVP; decisão de Stack documentada na spec (§4/§5).
7. **Este manifesto não é aconselhamento jurídico.** A conformidade LGPD é verificada por
   checklist de lançamento antes de qualquer dado real de usuário.

### Custo e generosidade

- **Free Tier** do Supabase + **propriedade do CDN** (projeto `karaoke-flow-509317`) para
  desenvolvimento.
- A chave default do YouTube é dev; produção exige **chave por estabelecimento** (spec §12/§13),
  o que mantém a França deste produto: **a casa paga a conta, o cantor nunca.**

---

## 8. Status & assinaturas

| Campo             | Valor                                        |
| ----------------- | -------------------------------------------- |
| Versão            | 0.1 (rascunho)                               |
| Data              | 2026-09-21                                   |
| Estado            | `Em validação` — aguarda revisão de donos    |
| Fontes            | spec §2.5/§16/§17, questionário do dono, análise das curtidas (§5 §6) |

**Assinado por:**

- ✍ **O autor** — *o dev desta casa* — §§1–6, v0.1.

**Fica convidado a assinar:**
- O **dono** de um estabelecimento que responda ao questionário (pergunta 15 ou assinatura
  física na ficha).
- O **cantor** que aparecer no nosso primeiro evento de validação.
- O **leitor silencioso** que notar erro — que o relate como quem aponta uma nota desafinada:
  com gentileza e no tempo certo.

---

*Nada neste documento é contrato. É a constituição da casa — e a casa, sendo do dono, pode ser
reformada — desde que a reforma preserve a voz, o bolso e o ânimo desta gente.*

— Karakê Watch Party, 2026