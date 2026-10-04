# Architecture Decision Records (ADRs)

Este diretório mantém **Architecture Decision Records** — decisões arquiteturais, técnicas e de produto com contexto, trade-offs e consequências.

## Objetivo

Registrar decisões significativas (não triviais) para preservar raciocínio ao longo do tempo, facilitar onboarding e evitar re-discussões sem contexto. Cada ADR deve ser conciso, factual e referenciar código/docs existentes quando aplicável.

## Quando criar um ADR?

Crie um ADR quando a decisão for:

- **Arquitetural**: impacto na estrutura (multi-tenancy, RLS vs. RPCs, isolamento de kiosk, etc.)
- **Técnica**: escolha entre abordagens com trade-offs claros (YouTube-first vs. licenciado, tokenização de player, etc.)
- **De produto com impacto técnico**: regras que viram barreiras no banco (1 bar=1 karaokê, presença física, etc.)
- **Crítica p/ segurança/hardening**: decisões que justificam auditoria (RLS como parede primária, bypass-proof)
- **Reversível mas cara**: decisões que dificultariam rollback se mudadas sem registro

## Convenção de nomenclatura

`ADR-XXX-titulo-curto.md` onde `XXX` é número sequencial em ordem crescente (000, 001, ...). Ex.: `ADR-001-youtube-first-vs-licensed-catalog.md`.

## Template sugerido

Cada ADR deve conter, no mínimo:

- **Status**: `Proposed | Accepted | Superseded by ADR-YYY | Rejected | Deprecated`
- **Contexto**: problema/necessidade, restrições, estado atual
- **Decisão**: o que foi decidido (claro, afirmativo)
- **Alternativas consideradas**: pelo menos 1–2 com prós/contras
- **Trade-offs**: ganhos x custos
- **Consequências**: positivas + negativas
- **Implementação**: referências (migrations, arquivos, docs)
- **Riscos/Mitigação**: quando aplicável
- **Data**: data de aceitação/revisão

## Status dos ADRs neste repositório

| ADR | Título | Status | Data |
|---|---|---|---|
| [ADR-001](./ADR-001-youtube-first-vs-licensed-catalog.md) | YouTube-first vs. Catálogo licenciado (karaokê) | **Accepted** | 2026-10-04 |
| [ADR-002](./ADR-002-player-isolated-by-token-and-kiosk-only.md) | Player isolado por token de capacidade + gate humano obrigatório (kiosk-only) | **Accepted** | 2026-10-04 |
| [ADR-003](./ADR-003-rls-as-primary-wall-plus-rpcs-security-definer.md) | RLS como parede primária + RPCs `security definer` + travas bypass-proof | **Accepted** | 2026-10-04 |

## Referências

- [ADR GitHub org](https://adr.github.io/)
- [Michael Nygard's ADRs](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions)