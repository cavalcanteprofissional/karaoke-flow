# ADR-001: YouTube-first vs. Catálogo licenciado (Karaokê)

**Status:** `Accepted`  
**Data:** 2026-10-04  
**Autores:** Engenharia/Produto  
**Tags:** conteúdo, direitos autorais, arquitetura, TOS, reversibilidade

## 1. Contexto

O projeto precisa definir a **fonte primária de conteúdo** para reprodução de karaokê (vídeos) na tela compartilhada. Duas abordagens principais existem no mercado (ver [Estado da Arte](../produto/estado-da-arte.md)):

1. **Catálogo licenciado/proprietário** (Singa, Karafun, Stingray): garante licenciamento de direitos autorais para uso comercial em estabelecimentos (B2B), porém tem custo recorrente, onboarding de catálogo mais lento e menor alcance de títulos.
2. **YouTube-first (embed via IFrame Player API)**: enorme catálogo, baixo atrito/MVP rápido, zero custo de licenciamento de acervo inicial e alinhado a UX de "público pede pelo celular". Porém traz trade-offs com [YouTube Terms of Service](https://www.youtube.com/static?template=terms), políticas de autoplay, cotas de API e questões de uso comercial em tela pública.

A decisão impacta: velocidade de execução, custo, risco jurídico/operacional, UX e viabilidade de escalar para B2B enterprise.

## 2. Problema

Escolher a estratégia de conteúdo que melhor equilibra **velocidade de validação (MVP)**, **viabilidade operacional para bares/restaurantes**, **custo/complexidade** e **reversibilidade futura**, sem bloquear evolução para modelo híbrido/licenciado.

## 3. Alternativas Consideradas

| Alternativa | Prós | Contras |
|---|---|---|
| **A. YouTube-first (padrão)** — usar YouTube Data API v3 (busca) + IFrame Player API (reprodução). Fallbacks: OAuth por-host (cota do dono), OAuth do app e chave dev. | Catálogo massivo, tempo de MVP mínimo, baixa barreira/custo inicial, fácil de experimentar com clientes, arquitetura desacoplada (fonte de busca+reprodução isolada). | Dependência de TOS do YouTube (embed), políticas de autoplay, cotas de API, risco de vídeos indisponíveis/privados/removidos, DMCA/takedowns, incertezas de uso comercial em tela pública por estabelecimento. |
| **B. Catálogo licenciado (100% B2B)** — integrar fornecedor de karaokê licenciado (tracks com letras/licença comercial). | Clareza de direitos autorais p/ uso comercial (B2B), melhor controle de qualidade (karaokê oficial), menos variabilidade (removidos). | Alto custo recorrente (royalties/SaaS por bar), tempo de integração longo, catálogo menor vs. YouTube, atrito p/ prototipagem/validação com early adopters, aumenta complexidade (gestão de catálogo, licenças por estabelecimento). |
| **C. Híbrido (YouTube-first + Whitelist licenciada)** — permitir YouTube por padrão + catálogo interno/licenciado com curadoria (whitelist) + blacklist. | Mitiga riscos (críticos/muito tocados podem vir de catálogo licenciado), mantém catálogo amplo no MVP, caminho de migração gradual e **reversível**. | Mais complexidade (fonte de dados com múltiplos provedores, UI p/ origem, feature flag por bar), ainda requer negociação/licenciamento se quiser cobrir maioria. |
| **D. Auto-hospedagem de vídeos (karaokê)** — baixar/hospedar vídeos/licenças próprias. | Controle total. | Altíssimo custo (direitos, storage/CDN, encoding), complexo legalmente, inviável p/ MVP/early stage. |

## 4. Decisão

**Aceitar (Accepted): Alternativa A — YouTube-first como estratégia primária, com arquitetura preparada para evolução reversível para C (híbrido/licenciado).**

Justificativa:

- **Viabilidade de MVP e validação com mercado (bar)**: prioriza aprender com fluxo real (público pedindo pelo celular, fila, aprovação, TV) antes de assumir custo fixo de licenciamento por estabelecimento.
- **Alinhamento ao posicionamento** ([Estado da Arte](../produto/estado-da-arte.md)): combina viralidade/watch-together (baixo atrito, anônimo) com operacional B2B. Diferencia de Karafun/Singa (fechados/licenciados) sem abrir mão de evolução futura.
- **Arquitetura desacoplada**: busca (YouTube Data API) e reprodução (IFrame Player) estão isolados. Trocar fonte de catálogo não exige reescrever núcleo de fila/player/Realtime — decisão **reversível**.
- **Mitigações pragmáticas já implementadas**: cadeia de credenciais com cota por-host (`RoomSettings` OAuth Google do host), fallback OAuth do app + chave dev, cache compartilhado, rate limit, e hardening de player (gate humano obrigatório) — endereçam pontos técnicos relevantes.
- **Trade-off explícito**: risco de TOS/comercial é conhecido, aceito no estágio atual e **documentado** (ver §5 + [Estado da Arte §7](../produto/estado-da-arte.md#7-riscos-e-trade-offs-youtube-first)).

## 5. Trade-offs

| Ganhos | Custos/Riscos |
|---|---|
| **Velocidade**: MVP funcional sem negociações de licenciamento. | **Compliance**: depende de interpretação/adesão ao YouTube TOS p/ uso em tela pública comercial. Requer vigilância contínua. |
| **Custo**: $0 de acervo inicial (API quotas gerenciáveis). | **Disponibilidade**: vídeos podem ser removidos/tornados privados/restringidos (regiões). |
| **UX/Catálogo**: cobre grande maioria de pedidos populares de karaokê (versões com letra). | **DMCA/Takedowns**: passíveis via ecossistema YouTube (diferente de licença garantida). |
| **Reversibilidade**: núcleo (queue, playback state, Realtime, RLS) independe de provedor de vídeos. | **Autoplay/Políticas**: exige gate humano obrigatório (já endereçado — ADR-002). |
| **Validação de produto**: confirma demanda real antes de comprometer OPEX com licenças. | **Escalabilidade B2B enterprise**: alguns estabelecimentos (grandes redes) exigirão licença comercial garantida. |

## 6. Consequências

### Positivas
- Libera iteração rápida e validação com early adopters (bares).
- Mantém produto leve e focado em **experiência operacional (fila+TV+kiosk)**, não em curadoria/licenciamento pesado.
- Permite **migração gradual**: pode introduzir `video_provider` (youtube|licensed|hybrid), `video_origin`, whitelist por bar e feature flag (`NEXT_PUBLIC_*`/DB) sem breaking change arquitetural.
- Alinha-se a licença MIT e evita travas de copyleft desnecessárias.

### Negativas
- Requer manter seção explícita de riscos/TOS na documentação (feito em [Estado da Arte §7](../produto/estado-da-arte.md#7-riscos-e-trade-offs-youtube-first)).
- Necessidade de revisão periódica (YouTube TOS pode mudar). Deve-se monitorar alterações relevantes.
- Caso haja adoção B2B enterprise com requisitos rígidos de direitos, será necessário executar plano de migração para **C (Híbrido)** (não urgente hoje).

## 7. Implementação (Referências)

- Busca: [`src/app/api/youtube/search/route.ts`](../../src/app/api/youtube/search/route.ts) — usa cadeia YouTube (por-host/app/dev) com Bearer OAuth quando conectado.
- Player: [`src/components/player/youtube-player.tsx`](../../src/components/player/youtube-player.tsx), [`src/app/player/[codigo]/page.tsx`](../../src/app/player/[codigo]/page.tsx) — IFrame Player API, gate humano (armado por clique).
- Config por-host: [`src/lib/rooms/settings.ts`](../../src/lib/rooms/settings.ts), [`RoomSettings`](../../src/components/rooms/room-settings.tsx) — conexão Google (OAuth por-host) para aproveitar cota do dono.
- Fallbacks/cadeia: [`src/lib/youtube/*`](../../src/lib/youtube/) — estratégia de credenciais com prioridade por-host → app → dev.
- Docs: [Estado da Arte](../produto/estado-da-arte.md#7-riscos-e-trade-offs-youtube-first), [Especificação](../../karaoke-watch-party-spec.md#125-consideracoes-legais-youtube-tos), [Manifesto](../../MANIFEST.md).

## 8. Plano de Evolução (Futuro, não bloqueante)

1. **Adicionar enum `video_provider`** em domínio (DB + tipos) com valores `youtube | licensed`.
2. **Suporte a `video_origin`/metadados** por item de fila (rastreabilidade de origem p/ auditoria).
3. **Whitelist por bar** (curadoria) + feature flag (`bar_settings.content_allowlist_enabled`).
4. **Abordagem Híbrida (C)** quando houver demanda comercial explícita (B2B enterprise) ou volume justificar OPEX de licenciamento — **sem alterar decisão atual**.

## 9. Revisão

Revisar esta ADR **sempre que** houver mudança relevante no YouTube TOS/IFrame API, cotas, ou surgir requisito comercial formal de licença garantida para estabelecimentos. Mantém-se **Accepted** enquanto YouTube-first for viável para estágio atual.

**Risco residual:** conhecido e aceito. Arquitetura permanece **reversível**.