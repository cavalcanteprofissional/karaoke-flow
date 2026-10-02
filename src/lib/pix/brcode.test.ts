import { describe, expect, it } from "vitest";

import {
  buildPixPayload,
  crc16,
  formatarValorPix,
  PixPayloadError,
  readPixPayload,
} from "./brcode";

const base = {
  chave: "cavalcante.profissional@outlook.com",
  nome: "Lucas Cavalcante",
  cidade: "Sao Paulo",
};

/**
 * O que quebra um Pix não é o QR, é o payload: um TLV com tamanho errado ou um
 * CRC divido é recusado pelo app do banco, e a única forma de saber antes de
 * mandar alguém doar é ler o payload de volta — que é o que estes testes fazem.
 */
describe("buildPixPayload", () => {
  it("monta um payload sem valor, com CRC válido", () => {
    const payload = buildPixPayload(base);
    const lido = readPixPayload(payload);

    expect(lido.gui).toBe("br.gov.bcb.pix");
    expect(lido.chave).toBe(base.chave);
    expect(lido.nome).toBe("Lucas Cavalcante");
    expect(lido.cidade).toBe("Sao Paulo");
    expect(lido.valor).toBeNull();
    expect(lido.txid).toBe("***");
    expect(lido.crcValido).toBe(true);
    expect(lido.crc).toHaveLength(4);
  });

  it("embute o valor em reais quando há valor", () => {
    const payload = buildPixPayload({ ...base, valor: 5 });
    const lido = readPixPayload(payload);

    expect(lido.valor).toBe("5.00");
    expect(lido.crcValido).toBe(true);
  });

  it("mantém o payload só em ASCII (o manual exige)", () => {
    const payload = buildPixPayload({ ...base, nome: "José Conceição", cidade: "São Paulo" });
    const lido = readPixPayload(payload);

    expect(payload).toMatch(/^[\x20-\x7E]+$/);
    expect(lido.nome).toBe("Jose Conceicao");
    expect(lido.cidade).toBe("Sao Paulo");
  });

  it("corta nome e cidade no limite do manual sem quebrar o TLV", () => {
    const payload = buildPixPayload({
      chave: "12345678909",
      nome: "Lucas Cavalcante de Oliveira Santos",
      cidade: "São José dos Campos",
    });
    const lido = readPixPayload(payload);

    expect(lido.nome.length).toBeLessThanOrEqual(25);
    expect(lido.cidade.length).toBeLessThanOrEqual(15);
    expect(lido.crcValido).toBe(true);
    expect(lido.chave).toBe("12345678909");
  });

  it("aceita chave com espaço acidental  حول (usuário digita errado)", () => {
    const payload = buildPixPayload({ ...base, chave: "  lucas@exemplo.com  " });
    expect(readPixPayload(payload).chave).toBe("lucas@exemplo.com");
  });

  it("corta o nome sem deixar palavra de ligação pendurada", () => {
    // Caso real: "LUCAS CAVALCANTE DOS SANTOS" tem 27 e o manual limita a 25.
    // O corte ingênuo deixaria "LUCAS CAVALCANTE DOS" — nome que o app do banco
    // mostra ao doador e que não é o do titular.
    const lido = readPixPayload(buildPixPayload({ ...base, nome: "LUCAS CAVALCANTE DOS SANTOS" }));
    expect(lido.nome).toBe("LUCAS CAVALCANTE");
    expect(lido.nome.length).toBeLessThanOrEqual(25);
  });

  it("mantém um nome que já cabe, mesmo terminando em conectivo", () => {
    expect(readPixPayload(buildPixPayload({ ...base, nome: "MARIA DA SILVA" })).nome).toBe(
      "MARIA DA SILVA"
    );
  });

  it("tira a máscara de CPF/CNPJ, porque o app compara a chave com a conta", () => {
    // CPF/CNPJ mascarado é o caso real: o dono copia da receita e cola com ponto e hífen.
    // CPF sintético (DV válido, mas não é de ninguém) — a chave real do PO fica na env.
    expect(readPixPayload(buildPixPayload({ ...base, chave: "111.444.777-35" })).chave).toBe(
      "11144477735"
    );
    expect(readPixPayload(buildPixPayload({ ...base, chave: " 111.444.777-35 " })).chave).toBe(
      "11144477735"
    );
    expect(readPixPayload(buildPixPayload({ ...base, chave: "11.222.333/0001-81" })).chave).toBe(
      "11222333000181"
    );
  });

  it("não mexe em chave de e-mail nem de telefone (lá o ponto e o + valem)", () => {
    expect(readPixPayload(buildPixPayload({ ...base, chave: "lucas.cavalcante@outlook.com" })).chave).toBe(
      "lucas.cavalcante@outlook.com"
    );
    expect(readPixPayload(buildPixPayload({ ...base, chave: "+5511987654321" })).chave).toBe(
      "+5511987654321"
    );
    // 10 dígitos não é CPF nem CNPJ: fica como está, em vez de virar outra coisa.
    expect(readPixPayload(buildPixPayload({ ...base, chave: "1234567890" })).chave).toBe("1234567890");
  });

  it("recusa chave vazia em vez de gerar QR que ninguém paga", () => {
    expect(() => buildPixPayload({ ...base, chave: "   " })).toThrow(PixPayloadError);
  });

  it("recusa chave maior que 77 caracteres", () => {
    expect(() => buildPixPayload({ ...base, chave: "a".repeat(78) })).toThrow(/77 caracteres/);
  });

  it("trunca txid longo e nunca deixa o campo 05 vazio", () => {
    const longo = readPixPayload(buildPixPayload({ ...base, txid: "x".repeat(40) }));
    expect(longo.txid).toHaveLength(25);

    const vazio = readPixPayload(buildPixPayload({ ...base, txid: "   " }));
    expect(vazio.txid).toBe("***");
  });
});

describe("formatarValorPix", () => {
  it("escreve dois dígitos, como o manual pede", () => {
    expect(formatarValorPix(5)).toBe("5.00");
    expect(formatarValorPix(0.5)).toBe("0.50");
    expect(formatarValorPix(12.3)).toBe("12.30");
    expect(formatarValorPix(10)).toBe("10.00");
  });

  it("recusa valor que não sobrevive ao centavo", () => {
    expect(() => formatarValorPix(0)).toThrow(PixPayloadError);
    expect(() => formatarValorPix(-3)).toThrow(PixPayloadError);
    expect(() => formatarValorPix(Number.NaN)).toThrow(PixPayloadError);
    expect(() => formatarValorPix(0.004)).toThrow(/0,01/);
  });
});

describe("crc16", () => {
  /**
   * Vetor conhecido do CCITT-FALSE: "123456789" → 0x29B1. Se a implementação
   * mudar de polinômio/seed, este teste quebra antes de um doador mandar
   * dinheiro para o vazio.
   */
  it("bate com o vetor de referência", () => {
    expect(crc16("123456789")).toBe("29B1");
  });

  it("devolve sempre 4 dígitos em HEX maiúsculo", () => {
    for (const entrada of ["", "a", "br.gov.bcb.pix", "x".repeat(50)]) {
      expect(crc16(entrada)).toMatch(/^[0-9A-F]{4}$/);
    }
  });

  it("o CRC do payload confere quando relido", () => {
    const payload = buildPixPayload({ ...base, valor: 20 });
    // Corte pelos 8 últimos: "63" + "04" + 4 hex, e não por `lastIndexOf("63")`
    // — que cairia dentro do próprio CRC quando ele contém "63".
    expect(payload.endsWith(crc16(payload.slice(0, -8) + "6304"))).toBe(true);
  });
});

describe("readPixPayload", () => {
  it("rejeita TLV com tamanho declarado curto (sobra fora de campo)", () => {
    // O valor tem 14 caracteres e declara 13 — o resto ficaria "solto" e o CRC
    // seria conferido sobre metade errada do texto.
    expect(() => readPixPayload("0013br.gov.bcb.pix")).toThrow(/sobrou 1 caractere/);
  });

  it("detecta CRC adulterado (o teste que prova que o checksum serve)", () => {
    const payload = buildPixPayload(base);
    const adulterado = payload.slice(0, -4) + "0000";
    expect(readPixPayload(adulterado).crcValido).toBe(false);
  });

  it("valida payload cujo CRC contém '63' (o corte não pode usar lastIndexOf)", () => {
    // Regressão: `payload.lastIndexOf("63")` acha o "63" **dentro do próprio CRC**
    // (`...630463F0`), recorta o corpo no lugar errado e dá um payload válido
    // como inválido. Procuramos um caso real em vez de cravar um CRC na mão.
    const com63 = Array.from({ length: 400 }, (_, i) => buildPixPayload({ ...base, txid: `t${i}` })).find(
      (p) => p.slice(-4).includes("63")
    );

    expect(com63).toBeDefined();
    expect(readPixPayload(com63!).crcValido).toBe(true);
  });
});
