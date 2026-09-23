import { z } from "zod";

import { MESA_MAX } from "@/types/bar";

export const mesaNumeroSchema = z
  .number()
  .int("A mesa deve ser um número inteiro.")
  .min(1, `A mesa mínima é 1.`)
  .max(MESA_MAX, `O bar aceita até ${MESA_MAX} mesas.`);

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
});

export type CreateBarInput = z.infer<typeof createBarSchema>;