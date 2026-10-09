import type { MemberEntryState } from "@/types/room";

/**
 * Quem pode mexer na sala — a regra que decide **o que a tela oferece**.
 *
 * O coração da regra (migration `20261003000040`): quem entrou de fora do raio do
 * bar vira **espectador**. Ele entra, vê a fila ao vivo e pode abrir o player,
 * mas nunca pede música e nunca escolhe mesa — não porque o servidor recuse, e
 * sim porque a regra é essa.
 *
 * Por que um módulo só, e não um `fora_do_raio` espalhado pelos componentes:
 * a tela da sala já escondia o `MesaPicker` do espectador e mantinha o "Pedir
 * música" na mesma página — duas respostas para a mesma pergunta na mesma tela.
 * Quando a resposta mora em um lugar, a página e a busca não discordam.
 *
 * **O que manda é o registro da entrada**, não a posição de agora: `fora_do_raio`
 * foi gravado no join pela decisão do servidor, é o mesmo número que o host vê no
 * card de ocupação, e é o que o banco devolve em `member_entry_state`. Reavaliar a
 * posição a cada render traria duas consequências ruins — a pessoa mudaria de
 * permissão com o celular no bolso (e o cache do GPS é de minutos), e o registro
 * que o host viu deixaria de corresponder ao que a tela mostra.
 */
export type RoomAudienceRule = {
  isHost: boolean;
  /** Estado efetivo do participante; `null` = nunca entrou (ou erro na RPC). */
  membership: MemberEntryState | null;
};

/** Está na sala e pode pedir música? O host é isento, como em `requirePresence`. */
export function canRequestSongs({ isHost, membership }: RoomAudienceRule): boolean {
  if (isHost) return true;
  return (
    isActiveParticipant(membership) &&
    !membership.fora_do_raio &&
    !pulseiraBarrada({ isHost, membership })
  );
}

/**
 * Está na sala e pode escolher mesa? Mesmo corte do pedido: o espectador nunca
 * teve mesa (o join grava `null`), e oferecer uma seria prometer algo que a
 * página dele não pode cumprir.
 */
export function canPickMesa({ isHost, membership }: RoomAudienceRule): boolean {
  if (isHost) return true;
  return isActiveParticipant(membership) && !membership.fora_do_raio;
}

/**
 * O que o espectador lê no lugar do botão. Diz a regra, não a ausência: um botão
 * desabilitado ou um sumiço sem explicação lê como defeito — foi a complaint que
 * a entrada fora do raio já gerou uma vez, e a correção foi dar caminho, não
 * esconder a causa.
 */
export const SPECTATOR_QUEUE_NOTICE =
  "Você entrou de fora do raio do bar: dá para acompanhar a fila, mas não para pedir música.";

/**
 * O bar exige pulseira e a pessoa não ativou (Fase 18). Texto do membro
 * autenticado — o anônimo não consegue resgatar, então lê a versão própria.
 */
export const PULSEIRA_QUEUE_NOTICE =
  "O bar exige pulseira para pedir música. Peça a sua no balcão e ative pelo QR ou pelo código.";

/** O anônimo não pode usar o QR: o resgate exige conta real (migration 00002). */
export const PULSEIRA_ANON_QUEUE_NOTICE =
  "Crie uma conta para usar a pulseira deste bar: só ela libera o pedido de música.";

/**
 * A pessoa é membro aprovado, dentro do raio, mas o bar usa pulseira e ela não
 * tem a dela ativa. Separada da `pulseiraBarrada` por um motivo: o espectador e
 * o sem-pulseira são impedimentos DIFERENTES — o primeiro também não escolhe
 * mesa, o segundo só não canta — e as mensagens (e o que a tela oferece) seguem
 * cada causa.
 */
export function pulseiraBarrada({ isHost, membership }: RoomAudienceRule): boolean {
  if (isHost) return false;
  return (
    isActiveParticipant(membership) &&
    !membership.fora_do_raio &&
    membership.pulseira_exigida &&
    !membership.tem_pulseira
  );
}

/**
 * Membro de verdade: aprovado e com estado de entrada utilizável. O predicado
 * de tipo é o que deixa `membership.fora_do_raio` acessível na linha seguinte,
 * sem `!` e sem repetir a checagem de nulo nos dois chamadores.
 */
function isActiveParticipant(membership: MemberEntryState | null): membership is MemberEntryState {
  return membership !== null && membership.status === "approved";
}