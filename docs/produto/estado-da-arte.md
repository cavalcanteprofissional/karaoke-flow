# Estado da Arte — Karaokê Watch Party

## 1. Objetivo

Este documento posiciona o **Karaokê Watch Party** frente a soluções existentes (comerciais e open source), identifica lacunas de mercado, diferenciais competitivos, riscos e trade-offs relevantes para a evolução do produto.

O foco é embasar tecnicamente as decisões de produto (YouTube-first vs. catálogo licenciado), arquitetura (isolamento do player/kiosk), modelo operacional (bar/mesas) e hardening (RLS + auditoria).

## 2. Critérios de comparação

Para avaliar soluções similares, consideramos os seguintes critérios:

| Critério | Descrição |
|---|---|
| **Watch-together / Sync de vídeo** | Capacidade de sincronizar playback entre múltiplos dispositivos em tempo real. |
| **Fila/Queue** | Suporte a fila de músicas, reordenação, moderação e aprovação de pedidos. |
| **Moderação/Aprovação** | Nível de controle do host (aprovar/rejeitar, mover, remover, permissões por papel). |
| **Salas/Links/QR** | Forma de ingresso (link genérico vs. contexto físico: bar/mesa/QR). |
| **Karaokê (letras)** | Suporte nativo a letras, sincronização ou apenas reprodução de vídeo. |
| **B2B (estabelecimento/bar)** | Adequação ao fluxo operacional de bares/restaurantes (staff, múltiplas mesas, fila pública). |
| **Presença física/raio** | Capacidade de distinguir quem está dentro/fora do espaço físico e aplicar regras (não pediu). |
| **Isolamento de Kiosk/TV** | Separação entre controle (celular host/participante) e tela pública (link isolado/sem login). |
| **Multi-tenancy & Isolamento de dados** | Isolamento por bar/sala com barreiras no banco (RLS, RPCs com escopo). |
| **Self-host** | Possibilidade de auto-hospedagem. |
| **Licença/Modelo** | Comercial vs. OSS, implicações (SaaS, derivados). |
| **Gestão de Direitos/Conteúdo** | Catálogo próprio/licenciado vs. conteúdo de terceiros (YouTube). |

## 3. Soluções existentes

### 3.1 Watch-together (genérico)

| Projeto | Tipo | Sync Vídeo | Fila/Queue | Moderação/Aprovação | QR/Salas | Karaoke (letras) | B2B (bar/mesa) | Presença Física | Kiosk/TV isolado | Self-host | Licença | Observação |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Watch2Gether (w2g.tv)](https://w2g.tv/pt) | Comercial | Excelente | Sim (playlist/queue) | Básica (host controla) | Links/Salas | Limitado | Não | Não | Não | Não | Proprietário | Muito forte em sincronização. Foco social/online. Não modela bar/mesas, aprovação granular por fluxo de público rotativo nem isolamento de link da TV. |
| [CyTube](https://cytu.be/) ([GitHub](https://github.com/calzoneman/cytube)) | OSS | Muito bom | Avançada (queue, votos, movimentos) | Muito forte (ranks, bans, filtros, permissões) | Links/Salas | Opcional (plugins) | Não | Não | Não nativo | **Sim** | [GPLv3](https://github.com/calzoneman/cytube/blob/master/LICENSE) | Referência clássica para watch-together + moderação + fila. Diferencia-se por não ter tenancy por bar/mesas, QR contextualizado ou modelo operacional de estabelecimento. |
| [Metastream](https://getmetastream.com/) ([GitHub](https://github.com/Metastream/Metastream)) | OSS | Muito bom (multi-fonte) | Sim (queue) | Host-driven | Links/Salas | Não nativo | Não | Não | Não nativo | **Sim** | [MIT](https://github.com/Metastream/Metastream/blob/main/LICENSE) | Arquitetura limpa, real-time e fácil de self-host. Mais próximo em "queue + player compartilhado". Falta aprovação granular, multi-tenant com barreiras de banco, fluxo físico (QR/mesas) e distinção presença física. |
| [Kosmi](https://www.kosmi.io/) | Comercial | Bom (YT + jogos) | Sim | Moderado | Salas | Tem salas de karaokê | Não | Não | Não | Não | Proprietário | Mistura jogos + watch/karaokê. Foco social/gaming, menos gestão de fila orientada a bar/público anônimo em lote. |
| [Rave](https://rave.io/) | Comercial | Excelente (multi-plataformas) | Sim/Playlist | Leve | Links | Não foco karaokê | Não | Não | Não | Não | Proprietário | Mobile-first, sync sólido. Sem modelo B2B físico (mesas/QR por estabelecimento), nem aprovação por fluxo com rotatividade de público. |
| [WatchParty](https://www.watchparty.me/) | Comercial | Bom (vários provedores) | Sim | Básico | Links | Limitado | Não | Não | Não | Não | Proprietário | Simples, bom para grupos. Menor ênfase em moderação/fluxo de aprovação com fila pública. |

### 3.2 Karaokê comercial (B2B/B2C)

| Projeto | Tipo | Sync Vídeo | Fila/Queue | Moderação/Aprovação | QR/Salas | Karaoke (letras) | B2B (bar/mesa) | Presença Física | Kiosk/TV isolado | Self-host | Licença | Observação |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [Singa](https://singa.com/pt) | Comercial (B2B) | Karaoke próprio/licenciado | Fila (business) | Host/Staff | Dispositivos | **Muito forte** (letras + catálogo) | **Sim** (estabelecimento) | Limitado | Kiosks próprios | Híbrido | Proprietário (SaaS) | Mais próximo no **lado B2B de karaokê comercial**. Diferencial vs. nós: catálogo próprio/licenciado (com royalties), hardware/app dedicado e modelo SaaS p/ estabelecimentos. |
| [Karafun](https://www.karafun.com/pt) | Comercial (B2B/B2C) | Karaoke licenciado | Fila/Host | Staff | Kiosks/Terminais | **Muito forte** | **Sim** (B2B) | Limitado | Kiosks proprietários | Parcial | Proprietário | Padrão em bares (hardware+software). Forte em licenças/direitos autorais. Ecossistema fechado, menos "watch party" social e menos voltado a "público pede pelo próprio celular sem app instalado" com isolamento por tenant. |
| [Stingray Karaoke](https://www.stingray.com/pt-br/karaoke) | Comercial (B2B) | Licenciado | Gestão (staff) | Staff | Profissional/Kiosks | **Muito forte** | **Sim** (B2B enterprise) | Limitado | Fechado | Fechado | Proprietário | Foco enterprise/B2B. Sem YouTube-first, sem QR por mesa como UX viral, sem modelo de fila pública pelo cliente com o nível de isolamento e hardening apresentados aqui. |

## 4. Lacunas no mercado

Ao cruzar watch-together + karaokê + fluxo operacional de estabelecimento, identificam-se lacunas claras:

| Lacuna | Explicação | Por que importa (bar/restaurante) |
|---|---|---|
| **Contexto físico (bar → mesas)** | Soluções existentes usam salas genéricas por link. Não mapeiam mesa física no fluxo de entrada. | Público escolhe mesa, quer "entrar na mesa X" com 1 toque. QR por `bar + mesa` reduz atrito e organiza fila por contexto físico. |
| **QR contextualizado (por bar e por mesa)** | W2G/CyTube/Metastream não oferecem `?bar=…&mesa=…` com preview de entrada antes do join. | Facilita uso por público não-técnico (anônimo, sem instalar app), ideal para fluxo de alto giro em bar. |
| **Fluxo de aprovação + pré-aprovação por rotatividade** | CyTube tem ranks/moderação, mas não modela "aprovado volta por 24h (só autenticado)" com toggle de produto travado. | Bares têm público rotativo (mesas diferentes ao longo da noite). Equilibra moderação (controle do host) vs. fricção (não re-aprovar toda vez quem já foi liberado). |
| **Player/Kiosk isolado por token de capacidade** | Maioria compartilha o mesmo link da sala entre controle e tela pública. | Isolamento operacional: `/player/[codigo]?token=…` **nunca** é exposto ao participante, separa credencial de "tela pública" da sessão do cliente. Reduz risco de vazamento/abuso do link da TV. |
| **Gate obrigatório de partida (toque humano)** | Autoplay é tratado de forma genérica na maioria dos projetos. Poucos tratam políticas de Chrome/Android TV com disciplina de produto. | Essencial p/ kiosks em TV (políticas de autoplay, evitar autoplay não intencional, garantir ação humana antes de iniciar). Reforça segurança operacional. |
| **Presença física + distinção "fora do raio"** | Nenhuma das soluções acima modela "dentro/fora do raio do bar" com regras de permissão aplicadas (ver/assistir vs. pedir música). | Diferencial B2B real: quem está fora do raio **entra sem mesa, só assiste** (sem busca/sem picker). Conecta mundo físico → digital com regras aplicadas no banco. |
| **Multi-tenancy com barreiras no banco (RLS auditado)** | Projetos OSS clássicos modelam rooms simples (roles em memória/DB único). Faltam auditorias sistemáticas com casos de ataque legítimos vs. ilegítimos. | Essencial p/ evolução multi-bar (SaaS) com isolamento forte por tenant. Seu desenho é **banco-como-parede** (RLS + RPCs `security definer` + smokes SQL). |
| **Limites de produto travados no banco (bypass-proof)** | Regras de domínio (ex.: 1 bar = 1 karaokê, criação restrita por papel) raramente são travadas em `BEFORE INSERT/UPDATE` contra bypass via PostgREST. | Fecha caminho de bypass (RLS decide por linha, não fecha inserção direta). Hardening de domínio, não só de acesso. |
| **YouTube-first pragmático + fallback por cota do host** | Soluções B2B profissionais optam por catálogo licenciado (custo+complexo). Watch-together opta por multi-fonte genérico sem otimização de cota por estabelecimento. | Reduz barreira de entrada (custo/tempo), viabiliza MVP rápido. Modelo pragmático com trade-off explícito (TOS/direitos) vs. licença fechada. |

## 5. Diferenciais competitivos (Moat)

Com base nas lacunas acima, o posicionamento diferencial é claro:

| Diferencial | Descrição vs. SOTA |
|---|---|
| **1. Operacional de Venue (Bar/Restaurante)** | Diferente de watch-together "social online" (W2G/Metastream/CyTube), foca em **experiência de estabelecimento físico**: fila pelo cliente, controle pelo staff/host, tela pública operacional. |
| **2. QR por Bar + Mesa (contextualizado)** | Único entre watch-together/karaokê online com ingresso contextualizado por mesa física + preview de entrada. Reduz atrito para público anônimo. |
| **3. Player TV isolado por token de capacidade** | Separa "tela pública/kiosk" do celular do participante (`token` nunca exposto a este). Pouco comum no ecossistema OSS e fortalece segurança operacional. |
| **4. Gate humano obrigatório + autoplay: 0** | Tratamento disciplinado de políticas de autoplay em TV/Android TV (Fase 8c). Diferencia por ser tratado como requisito de produto + hardening, não apenas detalhe de implementação. |
| **5. Banco-como-parede + auditoria sistemática** | RLS auditado com **matriz de 58 casos** (ataques que **devem falhar** vs. legítimos que **devem passar**), com verificação via smoke SQL. Isso vai além do típico "RLS presente" — é **medido e fechado**. |
| **6. Presença física aplicada como regra de negócio** | "Fora do raio vê, mas não pede música" + painel de ocupação (`room_members`) aplicados no banco (`addSongToQueueAction`, `pick_mesa`, `claim_next_song`). Conecta mundo físico→digital de forma acionável. |
| **7. Domínio travado contra bypass (bypass-proof)** | Regras críticas em `BEFORE INSERT/UPDATE` + RPCs host-only + `dev_accounts` com teto por papel. Fecha vetores que RLS sozinho não cobre (inserção direta via PostgREST). |
| **8. YouTube-first + arquitetura pragmática** | Alternativa viável vs. catálogo licenciado (Singa/Karafun). Equilíbrio entre **velocidade/MVP, UX, custo e complexidade** — com trade-offs explícitos e reversíveis. |

**Conclusão:** Não existe projeto OSS ou comercial que combine **watch-together + fila de karaokê + QR por mesa + fluxo operacional de bar + kiosk isolado por token + gate humano + presença física + tenancy com RLS auditado + YouTube-first**. Esse é o nicho de diferenciação mais claro do projeto.

## 6. Análise de Licenças (Trade-offs)

| Projeto base | Licença | Implicações p/ este projeto | Observação |
|---|---|---|---|
| [CyTube](https://github.com/calzoneman/cytube) | **GPLv3** | Forte copyleft. Se incorporar código derivado e distribuir/modificar (ou ofertar como SaaS com alterações significativas distribuídas), exige disponibilizar fontes sob GPLv3. | **Não incorporamos código do CyTube** (comparação por estado da arte apenas). Atenção ao incorporar forks/plugins GPLv3 no futuro. |
| [Metastream](https://github.com/Metastream/Metastream) | **MIT** | Permissiva (uso comercial, modificação, fechamento). Sem obrigação de re-distribuir fontes. | **Mais alinhado** a evoluções internas/forks e eventual oferta SaaS. Boa referência arquitetural sem travas de copyleft. |
| [Karaokê Flow (este repo)](../../LICENSE) | **MIT** ([package.json](../../package.json)) | Coerente com arquitetura pragmática e permite evolução comercial/SaaS sem restrições de copyleft. | Decisão consistente com atual estado (código próprio, sem deriva GPLv3). |

**Recomendação:** manter **MIT**. Ao avaliar incorporar código OSS no futuro, priorizar licenças permissivas (MIT/Apache-2.0) para evitar acoplamento a copyleft forte (GPLv3/AGPLv3), a menos que haja justificativa estratégica explícita.

## 7. Riscos e Trade-offs (YouTube-first)

O modelo **YouTube-first** é intencional e pragmático. Deve permanecer explícito na documentação.

| Risco | Natureza | Mitigação/Trade-off |
|---|---|---|
| **YouTube TOS (IFrame Player API)** | Legal/Compliance | Uso dentro das regras do [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference). Não re-hospedamos vídeos, apenas embed. Evitar sobreposições/controles que violem TOS (já respeitado: sem overlays indevidos sobre player). Trade-off aceito para MVP. |
| **Políticas de Autoplay** | Técnico (UX em TV) | Endereçado via **gate obrigatório de partida (toque humano)** + `autoplay: 0`, sem forçar autoplay não intencional. Documentado em Fase 8c. |
| **Cotas YouTube Data API v3** | Técnico/Operacional | Cadeia de credenciais: chave do bar (OAuth por-host, **cota do projeto/dono**) → OAuth do app → chave dev. Cache compartilhado + rate limit. Reduz pressão por cota única. Pode evoluir p/ whitelist/catalogo interno se escalar. |
| **Conteúdo/DMCA** | Legal/Operacional | YouTube gerencia takedowns/DMCA no próprio ecossistema. Estabelecimento opera com reprodução via embed (plataforma terceira). Diferente de hospedar arquivos. Requer monitoramento/whitelist caso haja casos recorrentes por estabelecimento. |
| **Escalabilidade (multi-estabelecimentos)** | Operacional/Custo | YouTube-first viabiliza entrada. Se volume justificar (B2B enterprise com muitos bares simultâneos), avaliar **híbrido** (YouTube + catálogo licenciado com whitelist + conteúdo próprio) — sem bloquear MVP. |
| **Monetização futura (tela pública em bar)** | Legal/Produto | Uso comercial de reprodução via embed pode ter interpretações distintas por caso. Trade-off conhecido e **reversível**: arquitetura permite trocar fonte de catálogo sem reescrever núcleo (fila/player). Decisão documentada (ADR-001). |

## 8. Referências

- [Watch2Gether](https://w2g.tv/pt) — watch-together comercial
- [CyTube](https://cytu.be/) / [GitHub](https://github.com/calzoneman/cytube) — OSS (GPLv3)
- [Metastream](https://getmetastream.com/) / [GitHub](https://github.com/Metastream/Metastream) — OSS (MIT)
- [Kosmi](https://www.kosmi.io/) — comercial
- [Rave](https://rave.io/) — comercial
- [Singa](https://singa.com/pt) — karaokê B2B
- [Karafun](https://www.karafun.com/pt) — karaokê B2B/B2C
- [Stingray Karaoke](https://www.stingray.com/pt-br/karaoke) — karaokê enterprise
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) — referência TOS/técnica
- [YouTube Data API v3](https://developers.google.com/youtube/v3) — cotas/uso

## 9. Conclusão

O **Karaokê Watch Party** não compete diretamente com watch-together genérico nem com karaokê profissional licenciado — **ocupa o espaço intermediário**: combina a viralidade/baixo atrito do watch-together (YouTube-first, links/QR, anônimo) com o rigor operacional de um produto B2B para estabelecimentos (fila controlada, kiosk isolado, presença física, hardening com barreiras medidas no banco).

Esse posicionamento, aliado a **documentação de engenharia séria** (auditoria de RLS + post-mortems + smokes SQL), reforça o diferencial competitivo e justifica manter o trade-off **YouTube-first pragmático**, com caminho de evolução reversível caso surjam requisitos comerciais/direitos autorais mais restritivos.