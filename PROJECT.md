# KaraokeFlow - Sistema de Karaokê Online

Sistema de karaokê web com YouTube integrado, autenticação via Supabase e sincronização em tempo real.

## Stack Tecnologica

- **Frontend**: Next.js 14+ (App Router), TailwindCSS, Shadcn/ui, Zustand
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Player**: YouTube IFrame API (conta Premium do admin)
- **API Externa**: YouTube Data API v3
- **Hospedagem**: Vercel

## Autenticação

- Supabase Auth (email/senha)
- Perfis: `user` (padrão) e `admin` (pré-definido)
- Middleware para proteção de rotas

## Sincronização em Tempo Real

- **Supabase Realtime** (primário) para sincronização do player entre todos os usuários
- Alternativa stateless: servidor como fonte da verdade com polling

## YouTube OAuth

Duas opções para controle do player com conta Premium:
1. **Stateful**: Admin faz login OAuth, tokens salvos no servidor
2. **Stateless**: Tokens gerados sob demanda no servidor

---

## Requisitos Funcionais

### Sistema de Autenticação

- Usuário cria conta (nome, email, senha)
- Login de usuário
- Dois perfis: user (padrão) e admin (um único admin pré-definido)

### Gerenciamento de Músicas

- Usuário comum pode buscar músicas no YouTube e enviar para aprovação
- Envio contém: URL do YouTube, título sugerido, ID do usuário solicitante
- Admin recebe notificação e pode aprovar ou rejeitar cada solicitação
- Apenas músicas aprovadas aparecem na playlist principal

### Playlist

- Todos os usuários logados visualizam a playlist pública
- Exibe: título da música, nome do usuário que solicitou, status (apenas para admin visualizar pendências)
- Colunas: Ordem, Música, Solicitante, Ações (admin)

### Controle do Admin (apenas)

- Executar (play/pause)
- Pular música
- Remover música da playlist
- Alterar ordem (drag and drop ou botões subir/descer)
- Controle de fila atual (reprodução em sequência)

### Reprodução

- Utilizar API do YouTube (com conta Premium do admin) para controle do player
- Embed do player do YouTube com controles customizados pela aplicação
- Sincronizar estado da música com a fila (quando terminar, tocar próxima)

REQUISITOS FUNCIONAIS
Sistema de Autenticação:

Usuário cria conta (nome, email, senha)

Login de usuário

Dois perfis: user (padrão) e admin (um único admin pré-definido)

Gerenciamento de Músicas:

Usuário comum pode buscar músicas no YouTube e enviar para aprovação

Envio contém: URL do YouTube, título sugerido, ID do usuário solicitante

Admin recebe notificação e pode aprovar ou rejeitar cada solicitação

Apenas músicas aprovadas aparecem na playlist principal

Playlist:

Todos os usuários logados visualizam a playlist pública

Exibe: título da música, nome do usuário que solicitou, status (apenas para admin visualizar pendências)

Colunas: Ordem, Música, Solicitante, Ações (admin)

Controle do Admin (apenas):

Executar (play/pause)

Pular música

Remover música da playlist

Alterar ordem (drag and drop ou botões subir/descer)

Controle de fila atual (reprodução em sequência)

Reprodução:

Utilizar API do YouTube (com conta Premium do admin) para controle do player

Embed do player do YouTube com controles customizados pela aplicação

Sincronizar estado da música com a fila (quando terminar, tocar próxima)

---

# Escopo de Implementação

## Estrutura do Projeto

Organização Next.js 14+ (App Router):
```
src/
├── app/           # Rotas (App Router)
├── components/    # Componentes React
├── lib/           # Configurações e utilitários
├── hooks/         # Hooks customizados
├── store/         # Zustand stores
├── types/         # TypeScript types
└── middleware.ts  # Proteção de rotas
```

## v1.0.0 - Setup & Authentication ✓

### Fase 1: Projeto Base ✓
- [x] Criar projeto Next.js 14+ com App Router
- [x] Configurar TailwindCSS + Shadcn/ui
- [x] Instalar dependências (supabase-js, @supabase/ssr, zod, react-hook-form)

### Fase 2: Supabase ✓
- [x] Scripts SQL (tabelas: profiles, songs, playlist, player_state, approval_queue)
- [x] Row Level Security (RLS)
- [x] Cliente Supabase (browser + server)
- [x] Middleware de autenticação

### Fase 3: Autenticação ✓
- [x] Forms login/register com Supabase Auth
- [x] Rotas protegidas (/dashboard, /admin)
- [x] Perfis user/admin
- [x] Separação de rotas por perfil

## v1.1.0 - Playlist & Player ✓

### Fase 4: YouTube Integration ✓
- [x] Busca via YouTube Data API v3
- [x] Player com YouTube IFrame API
- [x] OAuth admin Premium (stateful ou stateless)

### Fase 5: Playlist ✓
- [x] CRUD músicas (solicitar, aprovar, rejeitar)
- [x] Fila de aprovação admin
- [x] Playlist pública
- [x] Supabase Realtime para sincronização

## v1.2.0 - Admin Controls ✓

### Fase 6: Admin Dashboard ✓
- [x] Gerenciamento da playlist (ordem, remoção)
- [x] Controles do player (play/pause, skip)
- [x] Dashboard de aprovação

## v2.0.0 - Deploy (Pendente)
- [ ] Deploy na Vercel
- [ ] Variáveis de ambiente
- [ ] Testes finais

---

## OBSERVAÇÕES IMPORTANTES

- A conta Premium do YouTube será usada apenas no lado do servidor ou via OAuth do admin; usuários comuns não precisam autenticar no YouTube
- O player deve refletir exatamente o que está tocando na fila, com sincronização em tempo real para todos os usuários (usar Supabase Realtime)
- Priorize segurança: RLS no Supabase, validação de inputs, proteção de rotas admin
- Código deve ser tipado com TypeScript


karaoke-flow/
│
├── public/                          # Arquivos estáticos
│   ├── favicon.ico
│   └── logo.svg
│
├── src/
│   ├── app/                         # Next.js App Router
│   │   ├── (auth)/                  # Grupo de rotas de autenticação
│   │   │   ├── login/
│   │   │   │   └── page.tsx
│   │   │   ├── register/
│   │   │   │   └── page.tsx
│   │   │   └── layout.tsx
│   │   │
│   │   ├── (dashboard)/             # Grupo de rotas protegidas
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx         # Playlist pública
│   │   │   ├── player/
│   │   │   │   └── page.tsx         # Player em tela cheia
│   │   │   ├── my-songs/
│   │   │   │   └── page.tsx         # Minhas solicitações
│   │   │   └── layout.tsx
│   │   │
│   │   ├── admin/                   # Rotas exclusivas do admin
│   │   │   ├── dashboard/
│   │   │   │   └── page.tsx         # Admin panel
│   │   │   ├── approvals/
│   │   │   │   └── page.tsx         # Aprovação de músicas
│   │   │   ├── playlist-manager/
│   │   │   │   └── page.tsx         # Gerenciamento avançado
│   │   │   └── layout.tsx
│   │   │
│   │   ├── api/                     # API Routes
│   │   │   ├── youtube/
│   │   │   │   ├── search/
│   │   │   │   │   └── route.ts
│   │   │   │   └── player/
│   │   │   │       └── route.ts     # Controle do player autenticado
│   │   │   ├── playlist/
│   │   │   │   ├── reorder/
│   │   │   │   │   └── route.ts
│   │   │   │   └── remove/
│   │   │   │       └── route.ts
│   │   │   └── admin/
│   │   │       └── approve/
│   │   │           └── route.ts
│   │   │
│   │   ├── layout.tsx               # Root layout
│   │   ├── page.tsx                 # Landing page
│   │   └── globals.css
│   │
│   ├── components/                  # Componentes React
│   │   ├── ui/                      # Shadcn/ui components
│   │   │
│   │   ├── layout/                  # Componentes estruturais
│   │   │   ├── Header.tsx
│   │   │   └── Sidebar.tsx
│   │   │
│   │   ├── auth/                    # Autenticação
│   │   │   ├── LoginForm.tsx
│   │   │   ├── RegisterForm.tsx
│   │   │   └── AuthGuard.tsx
│   │   │
│   │   ├── playlist/                # Playlist components
│   │   │   ├── PlaylistTable.tsx
│   │   │   ├── PlaylistItem.tsx
│   │   │   ├── SongRequestForm.tsx
│   │   │   └── QueueControls.tsx
│   │   │
│   │   ├── player/                  # YouTube Player
│   │   │   ├── YouTubePlayer.tsx
│   │   │   ├── PlayerControls.tsx
│   │   │   └── NowPlaying.tsx
│   │   │
│   │   ├── admin/                   # Admin components
│   │   │   ├── ApprovalList.tsx
│   │   │   └── PlaylistManager.tsx
│   │   │
│   │   └── shared/                  # Componentes compartilhados
│   │       ├── LoadingSpinner.tsx
│   │       └── Toast.tsx
│   │
│   ├── lib/                         # Bibliotecas e configurações
│   │   ├── supabase/
│   │   │   ├── client.ts            # Cliente Supabase para browser
│   │   │   ├── server.ts            # Cliente Supabase para server
│   │   │   └── types.ts             # Tipos gerados do Supabase
│   │   │
│   │   ├── youtube/
│   │   │   ├── api.ts               # YouTube Data API
│   │   │   ├── oauth.ts             # OAuth para conta Premium
│   │   │   └── player.ts            # IFrame API helpers
│   │   │
│   │   └── utils/
│   │       ├── constants.ts
│   │       └── helpers.ts
│   │
│   ├── hooks/                       # Hooks customizados
│   │   ├── useAuth.ts
│   │   ├── usePlaylist.ts
│   │   └── useRealtime.ts           # Supabase Realtime
│   │
│   ├── types/                       # TypeScript types
│   │   ├── user.ts
│   │   ├── song.ts
│   │   └── playlist.ts
│   │
│   ├── store/                       # Zustand stores
│   │   ├── authStore.ts
│   │   ├── playlistStore.ts
│   │   └── playerStore.ts
│   │
│   └── middleware.ts                # Next.js middleware
│
├── supabase/
│   ├── migrations/                  # Migrações SQL
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_rls_policies.sql
│   │   └── 003_triggers.sql
│   │
│   └── seed.sql                     # Dados de exemplo
│
├── .env.local                       # Variáveis de ambiente
├── .env.example                     # Template de .env
├── .gitignore
├── package.json
├── tailwind.config.ts
├── tsconfig.json
├── next.config.js
├── components.json                  # Shadcn/ui config
└── README.md