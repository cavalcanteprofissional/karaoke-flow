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
  return isActiveParticipant(membership) && !membership.fora_do_raio;
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
 * Membro de verdade: aprovado e com estado de entrada utilizável. O predicado
 * de tipo é o que deixa `membership.fora_do_raio` acessível na linha seguinte,
 * sem `!` e sem repetir a checagem de nulo nos dois chamadores.
 */
function isActiveParticipant(membership: MemberEntryState | null): membership is MemberEntryState {
  return membership !== null && membership.status === "approved";
}