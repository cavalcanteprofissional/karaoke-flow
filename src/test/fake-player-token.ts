/**
 * Tokens de player **falsos**, para teste. Valor único no repositório de
 * propósito — nenhum outro arquivo pode inventar token.
 *
 * O token da TV (`/player/<código>?token=…`) é uma **credencial**: quem tem o
 * link lê o estado da sala e a fila dela. Token de verdade não entra no
 * repositório — o repo é público. Estes valores são inventados (e não casam com
 * nenhuma sala: conferido no banco em 2026-09-27).
 *
 * Se um teste precisar de token, importe daqui. `npm run scan:secrets` falha
 * quando aparece um UUID fora dos arquivos de fixture permitidos, e a rotação
 * de um token de verdade é o botão "gerar novo link" do host
 * (`rotate_player_token`, host-only).
 */
export const FAKE_PLAYER_TOKEN = "deadbeef-dead-4bee-8eef-deadbeefdead";

/** Token "novo" do teste de rotação de link. */
export const FAKE_ROTATED_PLAYER_TOKEN = "c0dec0de-1234-4abc-8def-0123456789ab";
