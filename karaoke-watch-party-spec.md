# Especificação Técnica — Karaokê Watch Party

## 1. Visão Geral

Aplicação web, **mobile-first**, hospedada na Vercel, cujo objetivo é facilitar, controlar, organizar e agilizar a dinâmica de karaokê ao vivo em ambientes com muitas pessoas (bares, restaurantes).

Modelo central: **watch party**. Uma "sala" possui uma única fila/playlist compartilhada, controlada por um dono, e reproduzida em um dispositivo de tela (TV/projetor) desacoplado do celular de quem controla.

Fase 1 (MVP) = cobrir o fluxo de watch party descrito abaixo. Qualquer coisa fora disso (hardware dedicado, apps nativos, monetização) fica para fases seguintes.

## 2. Papéis (Actors)

- **Dono da sala (host):** cria a sala, controla configurações, aprova entradas/músicas (conforme toggles), controla playback pelo celular.
- **Participante (guest):** entra na sala via QR code ou código, busca músicas no YouTube, adiciona à fila (sujeito a aprovação conforme config da sala).
- **Tela da sala (player device):** dispositivo burro que só exibe o player do YouTube e o estado da fila; não tem controle próprio, só reage a eventos em tempo real vindos do host/sala.

## 3. Fluxo Principal

1. Usuário faz login.
2. Usuário cria uma sala (vira host) OU entra em uma sala existente escaneando QR code ou digitando um código.
3. Se a sala exigir aprovação de entrada, o host recebe e aprova/rejeita pedidos de entrada.
4. Dentro da sala, qualquer participante busca músicas (via YouTube Data API) e adiciona à fila.
5. Se a fila exigir aprovação, o item entra como "pendente" até o host aprovar; senão, entra direto na fila.
6. A tela da sala (TV/projetor) reproduz a fila em sequência, tocando o próximo item automaticamente ao fim do atual.
7. O host controla playback (pular, pausar, reordenar, remover) pelo próprio celular, através da aplicação web — sem precisar tocar no dispositivo da TV.

## 4. Configurações da Sala (Room Settings)

Ambos os campos abaixo são toggles controlados pelo host, persistidos na sala:

| Campo                     | Valores              | Efeito                                                                                                                                                                                                                                                          |
| ------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entryMode`               | `open` \| `approval` | `open`: qualquer um com código/QR entra direto. `approval`: pedido de entrada fica pendente até o host aprovar.                                                                                                                                                 |
| `queueApprovalMode`       | `auto` \| `manual`   | `auto`: música entra direto na fila ao ser adicionada. `manual`: música fica pendente até o host aprovar.                                                                                                                                                       |
| `requireSongConfirmation` | `true` \| `false`    | `true`: ao adicionar música, um popup de confirmação (thumbnail + título + duração) é exibido antes de enviar à fila — o próprio usuário confirma/cancela. `false`: adiciona direto. Não substitui `queueApprovalMode` (aprovação do host); são complementares. |

## 5. Entidades de Dados (rascunho)

```
User
- id, nome, email, avatar, authProvider

Room
- id, code (código curto único), qrCodeUrl, hostId
- entryMode: open | approval
- queueApprovalMode: auto | manual
- requireSongConfirmation: boolean (modal de confirmação antes de adicionar música)
- youtubeApiKey (opcional; se nulo, usa a chave default de `YOUTUBE_API_KEY` do `.env.local`)
- status: active | closed
- createdAt

RoomMember
- roomId, userId, status: pending | approved | rejected, joinedAt

QueueItem
- id, roomId, addedByUserId
- youtubeVideoId, title, thumbnailUrl, durationSeconds
- status: pending | approved | playing | played | rejected | skipped
- position (ordem na fila)
- addedAt

SongCache (mitigação de quota da YouTube API)
- query normalizada, resultados (videoId, title, thumb, duration), timestamp
- usado para evitar repetir search.list para termos já buscados recentemente/por outras salas
```

## 6. Integração com YouTube — Restrições e Estratégia

**Restrições confirmadas dos Termos de Serviço da YouTube API (válidas em 2026):**

- `search.list` custa 100 unidades por chamada; cota padrão diária é 10.000 unidades/projeto → ~100 buscas/dia no plano gratuito. Isso é insuficiente para uso em produção com múltiplas salas simultâneas.
- Não é permitido sobrepor overlays/elementos visuais sobre o player embutido do YouTube, incluindo seus controles — a UI do app (fila, letra, avatar de quem canta) deve ficar ao redor do player, nunca por cima.
- Uma mesma tela não pode ter mais de um player do YouTube autoplayando simultaneamente (favorável ao nosso modelo, que já é "um vídeo por vez").
- Autoplay sem gesto do usuário é bloqueado por navegadores mobile; a primeira reprodução no dispositivo da TV exige um toque inicial para destravar áudio.
- Não é permitido baixar vídeo/áudio, nem armazenar dados de visualização do usuário indefinidamente sem consentimento.

**Estratégia recomendada:**

1. Solicitar aumento de cota via formulário de auditoria do Google Cloud assim que houver tração real (não garantido, sem prazo definido).
2. Implementar `SongCache` compartilhado entre salas para reduzir chamadas repetidas de busca.
3. Debounce nas buscas (disparo só após confirmação/pausa de digitação, não por tecla).
4. Considerar um catálogo pré-indexado de músicas populares de karaokê, alimentado localmente, como fallback quando a cota de busca se esgotar.
5. Rotina de fallback amigável: se a cota estourar, avisar o usuário para tentar novamente mais tarde em vez de erro cru.

**Observação fora do escopo técnico:** execução pública de música com fins comerciais em estabelecimento (bar/restaurante) normalmente envolve licenciamento próprio (ex: ECAD no Brasil), responsabilidade do estabelecimento — deve constar nos termos de uso do produto.

## 7. Arquitetura do Dispositivo de Tela (Player Device)

Decisão para o MVP: **sem hardware/IoT dedicado**, usando qualquer navegador em modo quiosque (TV Box/Fire Stick).

- Rota dedicada e sem necessidade de login: `/player/[codigoDaSala]`.
- UI minimalista: player do YouTube (IFrame Player API) + informações da fila/próxima música.
- Dispositivos compatíveis: TV Box Android barato, Fire TV Stick, Chromecast com Google TV, notebook via HDMI, Smart TV com navegador — todos rodando essa mesma URL em modo quiosque (ex: app "Fully Kiosk Browser" no Android).
- Comunicação em tempo real entre o controller (celular do host) e o player (tela): canal via WebSocket / Firebase Realtime Database / Supabase Realtime, escopado por `roomId`.
- Eventos trafegados: `play`, `pause`, `skip`, `queueUpdated`, `reorder`.
- O player recebe eventos e manipula o objeto do IFrame Player já carregado (sem reload de página) para transições suaves entre músicas.
- Fase futura (não MVP): hardware dedicado (Raspberry Pi, appliance próprio) só se o modelo "navegador em kiosk" mostrar limitação real.

## 8. Stack Definida

- **Frontend/Framework:** Next.js (App Router), mobile-first, deploy na Vercel.
- **Estilo:** Tailwind CSS.
- **Backend/Banco/Tempo real:** Supabase (free tier obrigatório) — Postgres para dados de usuários/salas/fila, e **Supabase Realtime** (canais/broadcast ou replication de tabela) para sincronizar fila, controller e tela em tempo real. Firebase (Realtime DB/Firestore) fica como alternativa caso o free tier do Supabase Realtime se mostre insuficiente para o volume de mensagens necessário.
- **Autenticação (MVP):** Supabase Auth, com provedores OAuth **Google e GitHub** apenas. **X (Twitter) e Meta (Facebook) ficam no roadmap para uma fase futura** — não implementar agora, mas manter o design do sistema de auth desacoplado o suficiente pra adicionar provedores depois sem retrabalho (ambos tendem a exigir processo de app review externo antes de produção, o que deve ser iniciado com antecedência quando chegar a hora).
- **YouTube:** YouTube Data API v3 (busca) + YouTube IFrame Player API (playback embutido).
- **QR Code:** geração no backend/frontend ao criar a sala (ex: lib `qrcode`), leitura via câmera no navegador (ex: `@zxing/browser` ou `html5-qrcode`).

**Restrição transversal do projeto:** toda escolha de serviço (banco, auth, realtime, hosting) deve caber no **free tier**. Isso deve ser validado explicitamente durante a implementação — ex: limites de conexões simultâneas do Supabase Realtime no free tier, limite de linhas/armazenamento no Postgres gratuito, e limite de mensagens/eventos por segundo — antes de assumir que a solução escala para "muitas pessoas em um bar".

## 9. Requisitos Não-Funcionais

- Viewport mobile é prioridade absoluta de design; desktop é secundário.
- Uma sala deve suportar múltiplos participantes simultâneos adicionando à fila sem condição de corrida na ordenação.
- Estado da fila deve refletir em tempo real (idealmente < 2s de latência) em todos os clientes conectados à sala (controller e player).
- Sessão do player (tela) deve se manter estável por longos períodos (horas) sem exigir refresh manual.

## 10. Decisões Já Tomadas

- Tempo real e banco: **Supabase** (free tier), com **Firebase** como plano B se o free tier do Supabase Realtime não comportar o volume de eventos.
- Autenticação (MVP): **Supabase Auth** com OAuth de **Google e GitHub**. X e Meta ficam no roadmap futuro (ver seção 15).
- Tela do projetor/TV: **navegador em modo quiosque** (TV Box/Fire Stick), sem hardware dedicado no MVP.
- Restrição global: toda a stack deve operar em **free tier**.
- Escala-alvo: protótipo com **1 sala e ~50 usuários simultâneos**, evoluindo para **10+ salas e ~5.000 usuários** (detalhes na seção 12).
- YouTube API: modelo **chave por host** — cada sala/host pode ter sua própria chave, mas há uma **chave default fornecida pelo desenvolvedor via variável de ambiente (`.env.local`)** usada quando o host não configurar a própria. YouTube Premium não concede nenhum benefício de cota (é assinatura de consumo, sem relação com o Google Cloud/API).
- Letra de música: **não sincronizada** — o vídeo do YouTube é exibido como está.

## 11. Decisões Pendentes

Nenhuma pendência crítica de arquitetura no momento — os itens anteriores foram resolvidos e movidos para as seções 10 e 15.

## 15. Roadmap Futuro (fora do MVP)

- **Login via X (Twitter) e Meta (Facebook)**, além de Google/GitHub já implementados. Iniciar o processo de app review desses provedores com antecedência, pois normalmente não é aprovação instantânea.
- Reavaliar o modelo de chave de API do YouTube quando o número de hosts crescer: hoje é "chave por host com default do desenvolvedor via `.env.local`"; em escala maior, considerar pool de chaves rotativas ou aumento de cota oficial via auditoria do Google.

## 12. Escalonamento — de 1 sala/50 usuários para 10+ salas/5.000 usuários

Escala-alvo confirmada: protótipo com **1 sala e ~50 usuários simultâneos**; arquitetura deve suportar evolução para **10+ salas e ~5.000 usuários** sem reescrita estrutural.

O MVP (1 sala, 50 usuários) roda confortavelmente no free tier de qualquer um dos serviços cogitados. Os pontos que **vão quebrar primeiro** ao escalar, em ordem de prioridade:

1. **Cota de busca do YouTube (maior risco).** 100 buscas/dia é suficiente pra 1 sala de teste, mas inviável para 10 salas em bares distintos no mesmo dia. Ações, em ordem de implementação:
   - Cache de busca compartilhado (tabela `SongCache` já prevista na seção 5) — reaproveitar resultados entre salas diferentes para o mesmo termo.
   - Pré-indexar um catálogo próprio de "clássicos de karaokê" (as ~500-1000 músicas mais pedidas), evitando busca ao vivo na maior parte dos pedidos.
   - Ao aproximar-se da escala de 10 salas, iniciar o processo de auditoria/extensão de cota junto ao Google **com antecedência** (não é aprovação instantânea) — alternativa complementar ao modelo de chave por host abaixo.
   - Modelo adotado: **chave por host** — cada sala pode ter sua própria chave de API configurada pelo dono; quando não configurada, o sistema usa uma **chave default fornecida pelo desenvolvedor via variável de ambiente (`YOUTUBE_API_KEY` em `.env.local`)**. Isso isola parte do consumo de cota por sala assim que os hosts começarem a configurar as próprias chaves (protótipo atual usa só a chave default, já que **YouTube Premium não concede nenhum benefício de cota** — a cota é vinculada ao projeto no Google Cloud, não à assinatura do usuário).

2. **Conexões simultâneas do Supabase Realtime (free tier tem teto de conexões concorrentes).** Com 5.000 usuários, nem todos precisam de canal realtime aberto o tempo todo — só quem está com a tela do app ativa. Estratégia: desconectar/pausar o canal quando o app vai para background (mobile) e reconectar ao voltar; e escopar canais por sala (`room:{id}`), nunca um canal global, para não multiplicar tráfego desnecessário.

3. **Escritas de fila com concorrência (muita gente adicionando música ao mesmo tempo).** Usar `position` da fila como campo calculado no banco (ex: sequência do Postgres) em vez de calculado no client, evitando duas músicas caírem na mesma posição quando dois usuários adicionam ao mesmo tempo.

4. **Banco de dados (linhas/armazenamento no free tier do Supabase).** Rotina de limpeza: itens de fila com status `played`/`rejected` mais antigos que X dias podem ser arquivados/agregados, já que não precisam ficar na tabela "quente" indefinidamente.

5. **Multi-tenancy simples desde já.** Mesmo com 1 sala hoje, desenhar o schema já com `roomId` em toda tabela relevante (nunca assumir sala única implicitamente no código) evita retrabalho ao chegar em 10+ salas.

## 13. Segurança — pontos a corrigir/prever desde o MVP

- **Row Level Security (RLS) do Supabase ligado desde o dia 1**, mesmo no protótipo: um participante só pode ler/escrever na fila da sala em que está aprovado (`RoomMember.status = approved`), nunca em salas alheias.
- **Nunca expor a chave de API do YouTube no client.** Toda chamada de `search.list` deve passar por uma rota de servidor (API Route/Edge Function) que injeta a chave no backend — o frontend nunca deve carregar a chave do YouTube diretamente, senão qualquer pessoa pode extraí-la do bundle e consumir a cota livremente (ou pior, usá-la fora do seu app).
- **Rate limiting por usuário/IP na rota de busca**, independente da cota da própria YouTube API — evita que um único participante mal-intencionado esgote a cota do dia sozinho.
- **Validação de entrada na sala:** código de sala deve ter tamanho/entropia suficiente pra não ser adivinhado por força bruta (ex: 6 caracteres alfanuméricos, não sequenciais); QR code deve apontar para uma URL assinada/com token de curta duração, não só o código puro, se quiser reforçar contra fraude.
- **Autorização de ações de host** (aprovar entrada, aprovar música, pular, remover) sempre validada no backend (RLS/policy), nunca só escondendo o botão na UI — qualquer participante pode inspecionar a rede e tentar chamar o endpoint direto.
- **Moderação básica de conteúdo:** como a busca é livre no YouTube, considerar um filtro simples de categoria/idade (ex: usar `safeSearch=strict` no `search.list`) para evitar que vídeos impróprios sejam tocados publicamente em um ambiente comercial.
- **LGPD:** já que o Supabase vai guardar dados de usuários (login social, e-mails), definir desde já política de retenção e um caminho de exclusão de conta/dados.

## 14. Padrões de UX/UI recomendados

**Para o controller (celular do host/participante):**

- Fluxo de entrada em 1-2 toques: abrir QR → nome da sala aparece → confirmar entrada (sem formulários longos).
- Busca de música como campo único e persistente no topo, resultados em lista com thumbnail + título + duração, botão "Adicionar à fila" grande o suficiente pra ambiente de bar (uso com uma mão, pouca luz, possivelmente sob efeito de álcool — alvo de toque generoso, texto com bom contraste).
- Feedback imediato ao adicionar música: estado visual claro de "pendente de aprovação" vs "na fila" vs "tocando agora".
- Para o host: painel de aprovação (entrada de participantes e fila) como lista com ações rápidas (aprovar/rejeitar) sem sair da tela principal — modal ou drawer, não navegação para outra página.
- Indicador visual de "quem está cantando agora" e "próximo da fila" sempre visível, mesmo rolando a lista.

**Para a tela do projetor/TV (player device) — a lista de fila:**

- Layout pensado para visão a distância: vídeo do YouTube ocupando a maior parte da tela, sem overlays sobre o player (respeitando a restrição da seção 6), e uma faixa lateral ou inferior fixa mostrando a fila.
- A fila na TV deve mostrar só o essencial e em fonte grande/legível a distância: posição, título da música e (se fizer sentido) nome/apelido de quem pediu — sem thumbnails pequenas que ninguém enxerga do outro lado do salão.
- Destaque visual forte para "próxima música" (ex: linha maior, cor de destaque) — é a informação mais útil para quem está na fila esperando a vez.
- Estado vazio bem definido: quando a fila esvazia, tela deve exibir algo convidativo (ex: QR code grande da sala + "escaneie para adicionar uma música"), transformando o momento de silêncio em call-to-action para mais gente entrar/participar, em vez de tela em branco.
- Transição entre músicas sem tela preta/loading perceptível — pré-carregar o próximo vídeo do IFrame Player enquanto o atual ainda toca, se a API permitir.

**Geral:**

- Tema escuro por padrão (ambiente de bar/balada, tanto no controller quanto na tela) para não ofuscar o ambiente nem cansar os olhos com luz do celular no escuro.
- Todo o app pensado mobile-first (conforme já definido), com a tela do projetor sendo a única exceção "desktop-like" da experiência.
