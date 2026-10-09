import { z } from "zod";

import {
  MESA_MAX,
  PULSEIRA_LOTE_MAX,
  RAIO_MAX_METROS,
  RAIO_MIN_METROS,
  RAIO_PADRAO_METROS,
} from "@/types/bar";
import { normalizeRoomCode } from "@/lib/rooms/utils";

export const mesaNumeroSchema = z
  .number()
  .int("A mesa deve ser um número inteiro.")
  .min(1, `A mesa mínima é 1.`)
  .max(MESA_MAX, `O bar aceita até ${MESA_MAX} mesas.`);

/**
 * Quantidade de mesas do bar — mesma faixa do `check` do banco
 * (`bars_quantidade_mesas_check`, migration `20261008000001`): 1 por padrão,
 * até 10. Aceita string (input do formulário) como o resto dos inputs numéricos.
 */
export const barMesasSchema = z.coerce
  .number({ message: "Quantidade de mesas inválida." })
  .int("Quantidade de mesas deve ser inteira.")
  .min(1, "O bar tem no mínimo 1 mesa.")
  .max(MESA_MAX, `O bar aceita até ${MESA_MAX} mesas.`);

/** Coordenada opcional: vazio/null vira null (não 0). */
function nullableCoord(schema: z.ZodNumber) {
  return z.preprocess((value) => {
    if (value === "" || value === null || value === undefined) return null;
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }, schema.nullable());
}

const optionalLatitude = nullableCoord(z.number().min(-90).max(90));
const optionalLongitude = nullableCoord(z.number().min(-180).max(180));

/**
 * Raio de presença em metros — mesma faixa do `check` do banco
 * (`bars_raio_check`, 50..1000). Aceita string (input do formulário) e number;
 * campo vazio vira erro explícito em vez de virar 0.
 */
export const barRadiusSchema = z.preprocess(
  (value) => (typeof value === "string" && value.trim() === "" ? Number.NaN : value),
  z.coerce
    .number({ message: "Informe o raio de presença em metros." })
    .int("O raio deve ser inteiro.")
    .min(RAIO_MIN_METROS, `O raio mínimo é ${RAIO_MIN_METROS} m.`)
    .max(RAIO_MAX_METROS, `O raio máximo é ${RAIO_MAX_METROS} m.`)
);

/** Mesma validação, já com o padrão do bar (500 m) quando o host não informa. */
export const barRadiusInputSchema = barRadiusSchema.default(RAIO_PADRAO_METROS);

export const createBarSchema = z
  .object({
    nome: z.string().trim().min(1, "Informe o nome do bar.").max(80, "Nome muito longo."),
    cidade: z.string().trim().min(1, "Informe a cidade.").max(80, "Cidade muito longa."),
    endereco: z
      .string()
      .trim()
      .max(160, "Endereço muito longo.")
      .optional()
      .or(z.literal("")),
    quantidade_mesas: z.coerce
      .number({ message: "Quantidade de mesas inválida." })
      .int("Quantidade de mesas deve ser inteira.")
      .min(1, "O bar tem no mínimo 1 mesa.")
      .max(MESA_MAX, `O bar aceita até ${MESA_MAX} mesas.`)
      .default(1),
    /** Rótulos opcionais, um por mesa na ordem (i → mesa i+1). */
    rotulos: z.array(z.string().trim().max(40, "Rótulo muito longo.")).default([]),
    /** Localização física do bar — gate de presença (Requisito, 2026-09-23). */
    latitude: optionalLatitude,
    longitude: optionalLongitude,
    raio_permitido_metros: barRadiusInputSchema,
    /** Código de entrada opcional: vazio → default pelo nome do bar (KARAOKE). */
    codigo_entrada: z.preprocess(
      (value) =>
        typeof value === "string" && value.trim() !== ""
          ? normalizeRoomCode(value)
          : undefined,
      z
        .string()
        .min(3, "O código de entrada tem no mínimo 3 caracteres.")
        .max(12, "O código de entrada tem no máximo 12 caracteres.")
        .regex(/^[A-Z0-9]+$/, "Use apenas letras e números, sem acentos ou espaços.")
        .optional()
    ),
    /**
     * Fase 18: o bar nasce com ou sem pulseira. O switch é obrigatório na tela
     * (sempre presente no submit), então o default cobre só chamadas
     * programáticas — `false` é o comportamento de sempre.
     */
    pulseiras_ativadas: z.boolean().default(false),
  })
  .refine((v) => (v.latitude === null) === (v.longitude === null), {
    message: "Localização incompleta: informe latitude e longitude juntas.",
    path: ["latitude"],
  });

export type CreateBarInput = z.infer<typeof createBarSchema>;

/**
 * Código de entrada de uma sala nova dentro de um bar existente
 * (RPC `create_room`, migration `20260930000034`). Mesmas regras do
 * `codigo_entrada` do bar — 3–12 alfanuméricos, maiúsculo; vazio → o banco
 * resolve (`unique_room_code` sobre "KARAOKE", que dedup KARAOKE2, KARAOKE3…).
 */
export const createRoomSchema = z.object({
  bar_id: z.string().uuid("Bar inválido."),
  codigo_entrada: z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== ""
        ? normalizeRoomCode(value)
        : undefined,
    z
      .string()
      .min(3, "O código de entrada tem no mínimo 3 caracteres.")
      .max(12, "O código de entrada tem no máximo 12 caracteres.")
      .regex(/^[A-Z0-9]+$/, "Use apenas letras e números, sem acentos ou espaços.")
      .optional()
  ),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;

/**
 * Fase 18 — pulseira. Os códigos nascem em lote (1–100, a RPC repete a faixa) e
 * as faixas de valor são dia da semana + janela HH:MM.
 */
export const pulseiraToggleSchema = z.object({
  bar_id: z.string().uuid("Bar inválido."),
  ativadas: z.boolean(),
});

export const gerarPulseirasSchema = z.object({
  bar_id: z.string().uuid("Bar inválido."),
  qtd: z.coerce
    .number({ message: "Quantidade inválida." })
    .int("A quantidade deve ser inteira.")
    .min(1, "Gere ao menos 1 pulseira.")
    .max(PULSEIRA_LOTE_MAX, `O lote aceita até ${PULSEIRA_LOTE_MAX} pulseiras.`)
    .default(10),
});

const horaSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use um horário no formato HH:MM.");

export const precoPulseiraSchema = z
  .object({
    bar_id: z.string().uuid("Bar inválido."),
    dia_semana: z.coerce
      .number({ message: "Dia inválido." })
      .int()
      .min(0, "Dia inválido.")
      .max(6, "Dia inválido."),
    inicio: horaSchema,
    fim: horaSchema,
    preco_centavos: z.coerce
      .number({ message: "Informe o valor." })
      .int("O valor deve ser em centavos inteiros.")
      .min(0, "O valor não pode ser negativo.")
      .max(9_999_99, "Valor muito alto."),
  })
  .refine((v) => v.inicio < v.fim, {
    message: "O fim da faixa precisa ser depois do início.",
    path: ["fim"],
  });

export const removerPrecoPulseiraSchema = z.object({
  bar_id: z.string().uuid("Bar inválido."),
  dia_semana: z.coerce.number().int().min(0).max(6),
  inicio: horaSchema,
});

export const resgatarPulseiraSchema = z.object({
  bar_id: z.string().uuid("Bar inválido."),
  codigo: z
    .string()
    .trim()
    .min(3, "Digite o código da pulseira.")
    .max(12, "Código inválido.")
    .transform((value) => value.toUpperCase()),
});
