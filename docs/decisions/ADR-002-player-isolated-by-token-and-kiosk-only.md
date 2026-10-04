# ADR-002: Player isolado por token de capacidade + Gate humano obrigatório (Kiosk-only)

**Status:** `Accepted`  
**Data:** 2026-10-04  
**Autores:** Engenharia/Produto  
**Tags:** segurança, player, kiosk, TV, autoplay, isolamento, hardening

## 1. Contexto

A aplicação possui uma **rota pública de player** voltada à tela da casa (TV/projetor) em modo quiosque: [`/player/[codigo]`](../../src/app/player/[codigo]/page.tsx). Esta tela roda **sem login** e precisa:

- Exibir fila + vídeo em tempo real, legível à distância (kiosk).
- Ser controlada pelo celular do **host** (play/pause/pular), via Supabase Realtime + broadcast com poll de segurança (5s).
- **Não expor** credenciais/controle ao participante nem permitir que qualquer pessoa com sessão de participante controle a TV.
- Respeitar políticas de **autoplay** de navegadores/Android TV (Chrome, Android TV, Smart TVs).
- Ser resiliente a quedas de conexão e evitar hydration/dupla árvore no modo "armado".

O modelo de link único compartilhado entre controle e tela pública (padrão em watch-together genérico) não isola a **credencial da tela pública**. Além disso, iniciar reprodução automaticamente em ambientes de kiosk levanta riscos com políticas de autoplay e com UX não intencional.

## 2. Problema

Definir um modelo de **isolamento entre Player (TV/kiosk) e Controladores (host/participantes)** que:

1. Separe **link/credencial da TV** das sessões de participante (não exponha ao navegador do participante).
2. Garanta que o player **só inicie após ação humana explícita** (gate obrigatório de partida) — compliance com políticas de autoplay e segurança operacional.
3. Mantenha rota pública funcional (`/player/[codigo]`) sem login, com leitura mínima e segura do estado.
4. Seja resiliente (sem race conditions de hydration, com store externo para evitar dupla árvore).
5. Permita **rotação de token** pelo host (`rotate_player_token`) para revogar link comprometido.

## 3. Alternativas Consideradas

| Alternativa | Prós | Contras |
|---|---|---|
| **A. Link único da sala (sem token)** — `/player/[codigo]` compartilha mesma rota/credencial usada por participantes. Host/TV compartilham autorização por sessão (role membro/host). | Mais simples, menos estado. | **Sem isolamento**: link da TV circula entre participantes, não há separação de "credencial de kiosk". Dificulta revogação pontual da TV sem impactar sessões. Aumento de superfície de abuso (quem tem link tem visão/ambiente de player). |
| **B. Token de capacidade (isolado) + sessão por role** — `/player/[codigo]?token=…` válido p/ leitura/execução do player (claim/estado), **nunca** exposto ao participante. Token é rotacionável (host-only). Rota lê estado via RPCs/consultas com escopo por `room_code` + validação de token (ou claim vinculado ao player). | **Isolamento claro** (TV/kiosk vs. celulares). Revogação granular (rotate). Reduz vazamento: participante nunca recebe token. Alinha com "credencial operacional" (tratar link da TV como sensível). Compatível com público anônimo na TV. | Adiciona parâmetro `token` na URL (precisa ser tratado como **segredo** — documentação/prints). Requer cuidado p/ logs, histórico de commits, QR/compartilhamento. |
| **C. Sessão dedicada (login temporário p/ TV)** — gerar sessão anônima/login para dispositivo de TV via código curto. | Evita token em URL (pode usar storage), revogável por sessão. | Mais complexo (fluxo de pareamento TV↔host), UX pior p/ setup de bar (precisa parear a cada troca de dispositivo/navegador em modo quiosque), maior superfície de auth. Menos pragmático p/ kiosk de uso contínuo. |
| **D. Player inicia por autoplay (sem gate humano)** — confiar em `autoplay=1` com `mute` conforme políticas. | Menor atrito (inicia sozinho). | **Viola/depende de políticas** de Chrome/Android TV/Smart TVs (autoplay restritivo por user gesture). Inconsistente entre dispositivos (kiosks), pode falhar em produção (ambientes com bloqueio de autoplay). Risco operacional (inicia não-intencional). |
| **E. Gate humano obrigatório (armado por toque)** — player permanece **"desarmado"** até clique/toque humano explícito no DOM (ou ação do host iniciando). `autoplay: 0`. Estado "armed" mantido via store externo (evita hydration com dupla árvore). | Compatível com políticas de autoplay, previsível em TV/kiosk, elimina race de hydration, **fail-safe** (só toca com intenção humana). Testado e endurecido (Fase 8c). | Pequeno atrito: requer 1 toque inicial na TV (ou primeiro play via host após armar) — **trade-off aceito** (operacional/segurança). |

## 4. Decisão

**Aceitar (Accepted):**

1. **B — Token de capacidade isolado** para rota `/player/[codigo]?token=…`
   - Link da TV tratado como **credencial** (sensível). Nunca exposto ao participante.
   - Suportar **rotação de token** (`rotate_player_token`, host-only) — invalida link anterior na hora.
   - Leitura pública segura (sem login) com escopo estrito por `room_code` + validação/claim do player.

2. **E — Gate humano obrigatório de partida**
   - `autoplay: 0`. Player **só monta/solicita play** após **ação humana explícita** (toque/clique na tela do kiosk **ou** play iniciado pelo host após o player estar "armado").
   - Estado `armed` controlado via **store externo** (singleton) para **não hydrationar com duas árvores React** (evita flicker/race entre SSR/CSR).
   - Sem autoplay não-intencional. Compatível com Chrome/Android TV/Smart TVs.

## 5. Trade-offs

| Ganhos (Segurança/Operacional) | Custos/Trade-offs (UX) |
|---|---|
| **Isolamento de superfície**: TV/kiosk separado de celulares de participantes. Reduz vazamento/abuso acidental do link de controle. | **Atrito inicial**: 1 toque humano na TV antes da primeira reprodução (gate). Aceito p/ ambiente operacional (bar/TV pública). |
| **Revogação pontual**: `rotate_player_token` invalida link da TV sem derrubar todas as sessões. | **Token em URL**: precisa ser tratado como segredo (nunca em prints/issues/chats). Documentação reforça isso ([README](../../README.md#🔑-login-e-acesso), [scan:secrets](../../package.json)). |
| **Fail-closed p/ autoplay**: evita iniciar inesperado, previsível em produção. | **Setup**: ao trocar link da TV (rotate) o QR/link precisa ser atualizado na TV — fluxo esperado (host controla). |
| **Menor superfície de ataque por link compartilhado**: credencial de "tela pública" distinta de sessão de usuário. | |
| **Hardening testado**: desenho validado em Fase 8c (gate obrigatório). Sem race de hydration. | |

## 6. Consequências

### Positivas
- **Defesa em profundidade**: separação entre controlador (host) e display público (kiosk). Isolamento prático, fácil de auditar.
- **Operacionalmente seguro p/ bares**: link da TV pode ser rotacionado se exposto acidentalmente (sem quebrar fila/estado da sala de forma desnecessária).
- **Compatibilidade cross-browser/TV**: elimina fonte comum de falha (políticas de autoplay). Mais previsível em Android TV/Chromecast-like.
- **Sem dupla árvore/hydration race**: store externo (armado) evita re-renderizações inconsistentes entre SSR/CSR no player.
- **Rota pública mínima**: `/player/[codigo]?token=…` lê estado com escopo estrito, sem exigir login — bom p/ quiosque off-grid-like (navegador dedicado).
- **Alinha com postura "banco-como-parede + hardening medido"**: isolamento por credencial distinta, não só por role.

### Negativas
- **Token na query string**: URLs com `?token=…` podem aparecer em histórico de navegador, logs de acesso (proxies), analytics, referrers. **Mitigação**: tratar como credencial (nunca compartilhar), reforçar rotação em caso de suspeita, evitar logar query string com token em logs de aplicação (não ocorre hoje). Link é operacional (TV dedicada) — risco mitigado por ambiente controlado (kiosk).
- **Atrito UX mínimo**: 1 toque na primeira carga (aceitável para uso em TV pública/bar).
- **Necessidade de disciplina documental**: reforçar proibição de colar token em issues/chat/prints (já explicitado no README: _"O link da TV é uma credencial. […] nunca cole em issue, chat, print ou documentação"_). `scan:secrets` ajuda a prevenir vazamentos no repo.

## 7. Implementação (Referências)

- **Rota Player (página):** [`src/app/player/[codigo]/page.tsx`](../../src/app/player/[codigo]/page.tsx) — lê `searchParams.token`, renderiza Player com isolamento por token.
- **Componente Player:** [`src/components/player/youtube-player.tsx`](../../src/components/player/youtube-player.tsx) — **gate humano obrigatório**: inicia armado via store externo, `autoplay: 0`, só chama `playVideo()` após ação humana (clique/toque) ou play disparado pelo host com player pronto/armado.
- **Store externo (armed):** evita dupla árvore/hydration — estado "armado" fora da árvore React (singleton) para não hydrationar com duas árvores (conforme hardening Fase 8c).
- **Rotação de token:** [`rotate_player_token`](../../src/lib/rooms/player-token.ts) / ação RPC/servidor (host-only). Host pode gerar novo link da TV a qualquer momento.
- **Controle host→player:** Realtime (broadcast + poll de segurança 5s) — [`src/lib/rooms/playback.ts`](../../src/lib/rooms/playback.ts), [`src/components/rooms/room-player-controller.tsx`](../../src/components/rooms/room-player-controller.tsx).
- **Segurança/isolamento:** token nunca é enviado ao participante; participantes acessam `/player/[codigo]` via sessão (host/membro aprovado) sem token (fluxo separado). TV usa token.
- **Documentação de segurança:** [README — Login e acesso](../../README.md#🔑-login-e-acesso) (aviso "link da TV é uma credencial"), [TESTING.md](../../TESTING.md) §3.9·quater (validação do gate na TV real), [CHANGELOG.md](../../CHANGELOG.md) (Fase 8c).
- **Hardening/validação:** [Auditoria RLS](../engenharia/auditoria-rls.md), [Pos-mortem playback](../engenharia/pos-mortem-smoke-playback.md).

## 8. Diretrizes Operacionais (Uso Correto)

1. **Tratar `/player/[codigo]?token=…` como senha/credencial.** Nunca colar em issues, chats, prints, capturas de tela públicas, ou documentação versionada (exceção: exemplos com **fake/test tokens** apenas em `src/test/fake-player-token.ts`).
2. **Usar QR/links apenas no dispositivo da TV (kiosk).** Não compartilhar com participantes.
3. **Rotacionar em caso de comprometimento suspeito.** Host tem botão "gerar novo link" — troca token na hora e invalida anterior.
4. **Não logar token.** Em logs (app/infra), **nunca** registrar query string completa com `token`. Preferir logar evento (rotate, claim válido/inválido) sem valor do token.
5. **Ambiente kiosk dedicado**: navegador em modo quiosque/tela cheia, sem extensões que possam interferir, dispositivo físico da casa.
6. **Gate humano obrigatório é intencional.** Não tentar reintroduzir autoplay automático. É feature de segurança, não bug.

## 9. Revisão

Esta ADR permanece **Accepted** enquanto o modelo de player público for kiosk/TV. Caso evolua para "watch party web" 100% sem TV física, pode ser reavaliada — mas o requisito atual (bar/restaurante, tela compartilhada pública) justifica plenamente ambas as decisões (B + E).

**Conclusão:** Isolamento por **token de capacidade** + **gate humano obrigatório** é o equilíbrio correto entre **segurança operacional, compatibilidade com políticas de autoplay e pragmatismo de UX em ambiente de bar**.