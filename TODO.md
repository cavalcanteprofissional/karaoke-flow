# TODO — Karaokê Watch Party (rebuild)

Plano de implementação faseado para reconstrução do projeto a partir da `karaoke-watch-party-spec.md`.

**Decisões técnicas assumidas:**

- Next.js 16 (App Router, TypeScript, Tailwind CSS) — deploy na Vercel
- shadcn/ui para componentes
- Zustand (estado client), react-hook-form + zod (forms/validação)
- Supabase (Postgres + Auth + Realtime) — free tier obrigatório
- Docs/UI em português

**Escopo:** MVP da spec (seções 1–14). Roadmap futuro (seção 15) documentado ao final, fora do MVP.

---

## Fase 0 — Fundação

- [x] Scaffold Next.js 16 (App Router, TypeScript, Tailwind) + Vercel deploy inicial
- [x] Setup do shadcn/ui (config, componentes base: button, input, card, dialog, drawer/sheet, tabs, slider, dropdown-menu, label)
- [x] Estrutura de pastas (`src/app`, `src/components`, `src/lib`, `src/hooks`, `src/stores`, `src/types`)
- [x] ESLint + prettier configurados
- [x] Tema escuro por default (next-themes)
- [x] Shell mobile-first base: header, bottom nav, containers responsivos
- [x] `.env.example` com todas as variáveis e documentação:
  - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `YOUTUBE_API_KEY` (chave default do desenvolvedor)
  - Config dos provedores OAuth (Google, GitHub)
- [x] Layout raiz + globals (dark, mobile-first)

## Fase 1 — Banco de dados + RLS (Supabase)

> **Pendência externa:** aguardando credenciais válidas — o projeto Supabase vinculado (`kskoipyzqcacccepcqpc`) não resolve no DNS (foi removido) e a `YOUTUBE_API_KEY` atual retorna `401/400 API key not valid`. Necessário: (1) reativar/criar projeto no Supabase e passar `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`; (2) gerar nova YouTube API key.

- [ ] Migration: `profiles` (id, nome, email, avatar, authProvider)
- [ ] Migration: `rooms` (id, code único 6 chars, qrCodeUrl, hostId, entryMode, queueApprovalMode, requireSongConfirmation, youtubeApiKey nullable, status, createdAt)
- [ ] Migration: `room_members` (roomId, userId, status pending|approved|rejected, joinedAt)
- [ ] Migration: `queue_items` (roomId, addedByUserId, youtubeVideoId, title, thumbnailUrl, durationSeconds, status, position, addedAt)
- [ ] `position` da fila computado no banco (sequência do Postgres) — evita condição de corrida
- [ ] Migration: `song_cache` (query normalizada, resultados, timestamp)
- [ ] Trigger que cria `profile` ao criar usuário no Supabase Auth
- [ ] RLS ligado desde o dia 1:
  - Leitura/escrita da fila apenas para `RoomMember.status = approved` da sala (nunca salas alheias)
  - Host actions validadas no backend via policies (nunca só escondendo botão na UI)
- [ ] `roomId` em toda tabela relevante (multi-tenancy desde já, nunca assumir sala única)
- [ ] Scripts de seed + limpeza de dados quentes (played/rejected antigos)
- [ ] Validação dos limites do free tier: linhas/storage do Postgres, conexões concorrentes do Realtime (anotar resultados)

## Fase 2 — Autenticação (Google + GitHub)

- [ ] Configurar providers Google e GitHub no projeto Supabase
- [ ] Helpers Supabase SSR: `client`, `server`, middleware/proxy de sessão
- [ ] Página de login com botões OAuth (Google, GitHub)
- [ ] Rota de callback + exchange de código
- [ ] Rota/logout
- [ ] Store de auth no client (Zustand), sincronizada com a sessão
- [ ] Layout protegido para rotas autenticadas (dashboard/salas)
- [ ] Arquivo de config de providers desacoplado (facilita adicionar X/Meta no futuro sem retrabalho)

## Fase 3 — Salas: criar e entrar

- [ ] Criar sala → gera `code` único com entropia suficiente (6 chars, não sequenciais) + URL de QR
- [ ] Gerar QR code no backend/frontend ao criar a sala (lib `qrcode`)
- [ ] Entrar na sala via código digitado e via scan de QR (lib `@zxing/browser` / `html5-qrcode`)
- [ ] Fluxo de entrada em 1–2 toques: abrir QR → nome da sala → confirmar entrada (sem formulários longos)
- [ ] `entryMode = open`: participante entra direto
- [ ] `entryMode = approval`: pedido de entrada fica `pending`; host aprova/rejeita
- [ ] Painel de aprovação de entrada (drawer/modal, ações rápidas, sem navegação para outra página)
- [ ] Sair da sala; host pode fechar a sala (`status = closed`)
- [ ] Toggles de config da sala persistidos no banco (`entryMode`, `queueApprovalMode`, `requireSongConfirmation`)
- [ ] Toggle `requireSongConfirmation` na UI de config da sala ("Pedir confirmação antes de adicionar música")

## Fase 4 — Busca no YouTube (Data API v3)

- [ ] Rota de servidor `/api/youtube/search` — chave injetada apenas no backend, **nunca no client**
- [ ] `safeSearch=strict` no `search.list` (moderação básica de conteúdo)
- [ ] Campo de busca único e persistente no topo; resultados com thumbnail + título + duração
- [ ] Botão "Adicionar à fila" grande (alvo de toque generoso, ambiente de bar)
- [ ] Debounce na busca (dispara após pausa de digitação, não por tecla)
- [ ] `song_cache` compartilhado entre salas (query normalizada; reusar resultados recentes antes de chamar a API)
- [ ] Rate limiting por usuário/IP na rota de busca (independente da cota do YouTube)
- [ ] Fallback amigável de cota esgotada ("tente novamente mais tarde", sem erro cru)

## Fase 5 — Fila (queue)

- [ ] Adicionar música via rotas/mutations de servidor, `position` atribuído no banco (sem corrida)
- [ ] Estados da fila e transições: `pending → approved → playing → played`; `rejected`, `skipped`
- [ ] `queueApprovalMode = auto`: entra direto na fila
- [ ] `queueApprovalMode = manual`: entra como `pending` até host aprovar
- [ ] `requireSongConfirmation = true`: modal de confirmação (Dialog) com thumbnail/título/duração antes de enviar à fila; só persiste após "Confirmar"
- [ ] Realtime da fila via canal `room:{id}` (especificamente por sala, nunca canal global)
- [ ] Painel de aprovação de fila (drawer, ações aprovar/rejeitar sem sair da tela principal)
- [ ] Reordenar e remover itens (host)
- [ ] Feedback visual claro por estado: `pendente de aprovação` vs `na fila` vs `tocando agora`
- [ ] Indicador "quem está cantando agora" e "próximo da fila" sempre visíveis, mesmo rolando

## Fase 6 — Player device (tela `/player/[codigoDaSala]`)

- [ ] Rota pública (/player/[code]) **sem login**, para navegador em modo quiosque (TV Box/Fire Stick/notebook via HDMI)
- [ ] Integração YouTube IFrame Player API (lib/componente player)
- [ ] Destrave de autoplay: primeira reprodução exige toque inicial (restrição de navegadores mobile)
- [ ] Consumir eventos Realtime escopados por `roomId` (`play`, `pause`, `skip`, `queueUpdated`, `reorder`) manipulando o objeto do player já carregado, sem reload de página
- [ ] Pré-carregar o próximo vídeo enquanto o atual toca (transições sem tela preta/loading)
- [ ] UI kiosk: vídeo ocupando a maior parte da tela, **sem overlays sobre o player** (restrição TOS YouTube)
- [ ] Faixa lateral/inferior fixa com a fila: fonte grande/legível a distância, posição + título + quem pediu (sem thumbnails pequenas)
- [ ] Destaque visual forte para a "próxima música"
- [ ] Estado vazio: QR code grande da sala + "escaneie para adicionar uma música" (CTA em vez de tela em branco)
- [ ] Estabilidade de sessão por horas: reconexão do canal Realtime, sem exigir refresh manual
- [ ] Latência alvo < 2s entre ação no controller e reflexo na tela

## Fase 7 — Controle de playback (host, pelo celular)

- [ ] Controles play/pause/skip/next no celular do host
- [ ] Publicar eventos no canal `room:{id}` (play, pause, skip, next, reorder)
- [ ] Sincronizar estado `playing`/item atual na fila (persistido na `room`/`queue_items`)
- [ ] Controle do host sem tocar no dispositivo da TV

## Fase 8 — Não-funcionais, segurança, LGPD e polimento

- [x] Estratégia de testes documentada: `TESTING.md` (Vitest + RTL + MSW + Playwright, checklist funcional por fase, DoD)
- [ ] Auditoria completa de RLS — isolar salas; threads/admin; host actions autorizadas no backend
- [ ] Rate limiting em rotas sensíveis (busca, entrada, ações de host)
- [ ] Validação de limites do free tier Supabase Realtime (mensagens/eventos por segundo, conexões simultâneas) — Firebase como plano B anotado
- [ ] Teste de concorrência: múltiplos usuários adicionando à fila ao mesmo tempo, sem posições duplicadas
- [ ] LGPD: política de retenção de dados + caminho de exclusão de conta/dados
- [ ] Rotina de limpeza de `played`/`rejected` antigos (agregar/arquivar)
- [ ] Polimento mobile: alvos de toque ≥ 44px, contraste adequado, tema escuro consistente (controller + tela)
- [ ] Latência realtime < 2s validada entre controller e tela

## Roadmap (fora do MVP — documentado, não implementar agora)

- [ ] OAuth X (Twitter) e Meta (Facebook) — iniciar app review com antecedência
- [ ] Catálogo pré-indexado de clássicos de karaokê (~500–1000 músicas) como fallback quando a cota de busca se esgotar
- [ ] Aumento de cota YouTube via auditoria Google Cloud + pool/rotação de chaves quando 10+ salas
- [ ] Escala 5.000 usuários: pausar/reconectar canais Realtime em background; verificar teto de conexões do free tier (Firebase como plano B)
- [ ] Hardware dedicado (Raspberry Pi/appliance) só se o modelo kiosk mostrar limitação real
