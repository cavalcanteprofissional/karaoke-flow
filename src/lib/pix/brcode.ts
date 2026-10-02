/**
 * BR Code ("Pix copia e cola") estático, o formato EMV/BCB que a página
 * `/sobre` usa para a doação.
 *
 * Por que construir a mão em vez de pegar uma lib: o BR Code estático é
 * "TLV+CRC16" — meia dúzia de campos e um CRC de 16 bits. Uma dependência a
 * menos no bundle de uma tela que o dono não precisa pagar, e o formato
 * **testável**, que é o ponto: a parte que dá trabalho do Pix é não gerar um
 * payload que o app do banco recusa, e o jeito de saber é conferindo campo por
 * campo + CRC num teste.
 *
 * Especificação: "QR Code Pix" (Bacen, Manual de Padrões para Iniciação do
 * Pix) — TLV aninhado, ASCII, CRC16/CCITT-FALSE com polinômio 0x1021,
 * seed 0xFFFF, resultado em HEX MAIÚSCULO sobre o payload + "6304".
 */

const GUI = "br.gov.bcb.pix";
const COUNTRY = "BR";
const CURRENCY_BRL = "986";

/**(txid vazio é "***" no manual: sem referência, e o banco aceita.) */
const TXID_PADRAO = "***";

export type PixPayloadInput = {
  /** Chave Pix (CPF/CNPJ, e-mail, telefone ou chave aleatória). */
  chave: string;
  /** Nome do recebedor — campo 59, máximo 25 caracteres. */
  nome: string;
  /** Cidade do recebedor — campo 60, máximo 15 caracteres. */
  cidade: string;
  /** Valor em reais. Fracional vai com ponto e dois dígitos ("5.00"). */
  valor?: number | null;
  /** txid (campo 54 no aninhamento 05). Padrão `***`. */
  txid?: string | null;
};

export class PixPayloadError extends Error {}

/** TLV: id (2) + tamanho em 2 dígitos + valor ASCII. */
function tlv(id: string, value: string): string {
  const ascii = semAcento(value);
  if (ascii.length > 99) {
    throw new PixPayloadError(`Campo ${id} excede 99 caracteres (tem ${ascii.length}).`);
  }
  return `${id}${String(ascii.length).padStart(2, "0")}${ascii}`;
}

/**
 * O manual do Bacen exige ASCII no payload: acento é convite pro app do banco
 * recusar. Sobremposições ditas pelo manual valem (`ã`→`a`, `ç`→`c`); qualquer
 * outra coisa vira `?` — nunca quebramos o payload silenciosamente.
 */
function semAcento(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[ºª]/g, "")
    .replace(/[^\x20-\x7E]/g, "?");
}

/**
 * Documento de CPF/CNPJ vem do usuário com máscara (`000.000.000-00`), mas o
 * BR Code quer só os dígitos: o app do banco compara a chave com a cadastrada
 * na conta, e a máscara faz a comparação falhar.
 *
 * A normalização é **delimitada** de propósito — só remove pontuação quando o
 * que sobra são 11 (CPF) ou 14 (CNPJ) dígitos. Não é um `replace(/\D/g, "")`
 * geral, porque chave de e-mail e de telefone usam `.`, `-` e `+` como parte
 * legítima da chave. A `/` entra na lista porque é a máscara do CNPJ
 * (`11.222.333/0001-81`), não porque o e-mail use.
 */
function soDigitos(chave: string): string | null {
  const semSeparador = chave.replace(/[.\-/\s]/g, "");
  if (!/^\d+$/.test(semSeparador)) return null;
  if (semSeparador.length === 11 || semSeparador.length === 14) {
    return semSeparador;
  }
  return null;
}

function limpar(chave: string): string {
  const original = semAcento(chave).trim();
  if (!original) throw new PixPayloadError("A chave Pix está vazia.");
  const valor = soDigitos(original) ?? original;
  if (valor.length > 77) {
    throw new PixPayloadError(`A chave Pix excede 77 caracteres (tem ${valor.length}).`);
  }
  return valor;
}

/** Palavras que não podem ficar penduradas no fim de um nome cortado. */
const CONECTIVOS = new Set(["da", "das", "de", "do", "dos", "e"]);

function nomeCurto(valor: string, limite: number, campo: string): string {
  const texto = semAcento(valor).trim().replace(/\s+/g, " ");
  if (!texto) throw new PixPayloadError(`${campo} está vazio.`);
  if (texto.length > limite) {
    // Cortar no meio de uma palavra gera nome ilegível no app do banco; melhor
    // cortar na última palavra inteira antes do limite.
    const cortado = texto.slice(0, limite);
    const ultimoEspaco = cortado.lastIndexOf(" ");
    const inteiro = (ultimoEspaco > limite / 2 ? cortado.slice(0, ultimoEspaco) : cortado).trim();

    // E uma palavra de ligação sobrando no fim ("LUCAS CAVALCANTE DOS") é pior
    // que faltar o sobrenome: some com ela também. A alternativa seria cortar
    // menos ainda, mas aí o app mostra um nome que não é o do titular.
    const palavras = inteiro.split(" ");
    const ultima = palavras[palavras.length - 1].toLowerCase();
    if (palavras.length > 1 && CONECTIVOS.has(ultima)) {
      palavras.pop();
    }
    return palavras.join(" ");
  }
  return texto;
}

/** 5.5 → "5.50"; arredonda em centavos, como o manual exige. */
export function formatarValorPix(valor: number): string {
  if (!Number.isFinite(valor) || valor <= 0) {
    throw new PixPayloadError(`Valor inválido para Pix: ${valor}.`);
  }
  // `toFixed` arredonda em HalfUp para 2 dígitos; abaixo de 0.005 some, então
  // recusamos o que não sobrevive ao centavo.
  const centavos = Math.round(valor * 100) / 100;
  if (centavos < 0.01) {
    throw new PixPayloadError("O valor precisa ser de pelo menos R$ 0,01.");
  }
  if (centavos > 1_000_000) {
    throw new PixPayloadError("Valor alto demais para o Pix (limite de R$ 1.000.000).");
  }
  return centavos.toFixed(2);
}

/** CRC16/CCITT-FALSE: polinômio 0x1021, seed 0xFFFF, sem xor final. */
export function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i += 1) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/**
 * Monta o payload completo, CRC incluído.
 *
 * A ordem dos campos importa para o que o app do banco mostra, então segue a
 * do manual: GUI (00) → Merchant Account (26) → moeda (53) → valor (54, só se
 * houver) → país (58) → nome (59) → cidade (60) → additional data (62, com o
 * txid) → CRC (63).
 */
export function buildPixPayload(input: PixPayloadInput): string {
  const chave = limpar(input.chave);
  const nome = nomeCurto(input.nome, 25, "Nome do recebedor");
  const cidade = nomeCurto(input.cidade, 15, "Cidade do recebedor");
  const txid = semAcento(input.txid ?? TXID_PADRAO).trim().slice(0, 25) || TXID_PADRAO;

  // 26 → Merchant Account Information: GUI + chave. A chave é o campo 01
  // dentro dele; é o que faz o app reconhecer a chave e mostrar o nome.
  const conta = tlv("00", GUI) + tlv("01", chave);
  const adicionais = tlv("05", txid);

  let payload = tlv("00", GUI);
  payload += tlv("26", conta);
  payload += tlv("53", CURRENCY_BRL);
  if (input.valor !== null && input.valor !== undefined) {
    payload += tlv("54", formatarValorPix(input.valor));
  }
  payload += tlv("58", COUNTRY);
  payload += tlv("59", nome);
  payload += tlv("60", cidade);
  payload += tlv("62", adicionais);

  return payload + tlv("63", crc16(payload + "6304"));
}

export type PixPayloadLeitura = {
  gui: string;
  chave: string;
  nome: string;
  cidade: string;
  valor: string | null;
  txid: string | null;
  crc: string;
  crcValido: boolean;
};

/**
 * Lê de volta o payload gerado. Existe para os testes (e para depurar no
 * console): é o que prova que tamanho, aninhamento e CRC batem, em vez de
 * confiar que "parece um Pix".
 */
export function readPixPayload(payload: string): PixPayloadLeitura {
  const campos = lerTlv(payload);
  const conta = campos.get("26") ? lerTlv(campos.get("26")!) : new Map<string, string>();
  const adicionais = campos.get("62") ? lerTlv(campos.get("62")!) : new Map<string, string>();

  // O CRC é calculado sobre tudo que vem **antes** do campo 63, mais o "6304"
  // que o manual manda concatenar como seed final.
  //
  // O corte é pelos **8 últimos caracteres** (id+len+4 hex), e não por
  // `lastIndexOf("63")`: o "63" também pode aparecer dentro do próprio CRC
  // (`...6304B63F`), dentro da chave ou de qualquer valor, e aí o índice cairia
  // no lugar errado e um payload válido seria dado como inválido.
  const corpo = payload.slice(0, -8);

  const crc = campos.get("63") ?? "";

  return {
    gui: campos.get("00") ?? "",
    chave: conta.get("01") ?? "",
    nome: campos.get("59") ?? "",
    cidade: campos.get("60") ?? "",
    valor: campos.get("54") ?? null,
    txid: adicionais.get("05") ?? null,
    crc,
    crcValido: crc !== "" && crc === crc16(corpo + "6304"),
  };
}

/** Lê TLV de dois dígitos; devolve Map id → valor. */
function lerTlv(texto: string): Map<string, string> {
  const campos = new Map<string, string>();
  let i = 0;
  while (i + 4 <= texto.length) {
    const id = texto.slice(i, i + 2);
    const tamanho = Number(texto.slice(i + 2, i + 4));
    if (!/^\d{2}$/.test(id) || Number.isNaN(tamanho)) {
      throw new PixPayloadError(`TLV inválido na posição ${i} (id "${id}").`);
    }
    const valor = texto.slice(i + 4, i + 4 + tamanho);
    if (valor.length !== tamanho) {
      throw new PixPayloadError(
        `Campo ${id} declara ${tamanho} caracteres e tem ${valor.length}.`
      );
    }
    campos.set(id, valor);
    i += 4 + tamanho;
  }
// Sobra é um tamanho declarado curto demais: sem esta checagem o parser
  // "aceita" o payload truncado e o CRC passa a ser conferido sobre a metade
  // errada do texto.
  if (i !== texto.length) {
    throw new PixPayloadError(
      `Payload sobrou ${texto.length - i} caractere(s) fora de qualquer campo.`
    );
  }
  return campos;
}
