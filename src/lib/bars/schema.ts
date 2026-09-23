import { z } from "zod";

import { MESA_MAX } from "@/types/bar";

export const mesaNumeroSchema = z
  .number()
  .int("A mesa deve ser um número inteiro.")
  .min(1, `A mesa mínima é 1.`)
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

export const createBarSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome do bar.").max(80, "Nome muito longo."),
  cidade: z
    .string()
    .trim()
    .min(1, "Informe a cidade.")
    .max(80, "Cidade muito longa."),
  endereco: z.string().trim().max(160, "Endereço muito longo.").optional().or(z.literal("")),
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
  raio_permitido_metros: z.coerce
    .number()
    .int("O raio deve ser inteiro.")
    .min(50, "O raio mínimo é 50 m.")
    .max(1000, "O raio máximo é 1000 m.")
    .default(150),
}).refine((v) => (v.latitude === null) === (v.longitude === null), {
  message: "Localização incompleta: informe latitude e longitude juntas.",
  path: ["latitude"],
});

export type CreateBarInput = z.infer<typeof createBarSchema>;