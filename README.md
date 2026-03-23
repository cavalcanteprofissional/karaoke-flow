# KaraokeFlow 🎤

Sistema de karaokê online com YouTube integrado, autenticação e reprodução em tempo real.

![Next.js](https://img.shields.io/badge/Next.js-14+-black)
![TypeScript](https://img.shields.io/badge/TypeScript-5+-blue)
![Supabase](https://img.shields.io/badge/Supabase-Auth%20%7C%20Realtime-green)
![License](https://img.shields.io/badge/License-MIT-yellow)

## ✨ Funcionalidades

- **Autenticação**: Cadastro, login e logout com Supabase Auth + Google OAuth
- **Perfis**: Usuário comum e Administrador
- **Busca YouTube**: Pesquise e solicite músicas diretamente
- **Playlist Pública**: Todos os usuários veem a mesma playlist
- **Aprovações**: Admin aprova/rejeita músicas solicitadas
- **Player**: Reprodução com YouTube IFrame API
- **Tempo Real**: Sincronização instantânea via Supabase Realtime
- **Controle Admin**: Play, pause, skip, reorder e remove

## 🚀 Quick Start

### Pré-requisitos

- Node.js 18+
- npm ou yarn
- Conta no [Supabase](https://supabase.com)
- Chave da [YouTube Data API v3](https://developers.google.com/youtube/v3)

### Instalação

```bash
# Clone o repositório
git clone https://github.com/cavalcanteprofissional/karaoke-flow.git
cd karaoke-flow

# Instale as dependências
npm install

# Copie o arquivo de exemplo
cp .env.example .env.local
```

### Configuração

1. **Supabase**:
   - Crie um projeto em [supabase.com/dashboard](https://supabase.com/dashboard)
   - Vá em **Settings > API** e copie:
     - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
     - `anon/public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY`

2. **YouTube API**:
   - Crie um projeto no [Google Cloud Console](https://console.cloud.google.com)
   - Habilite **YouTube Data API v3**
   - Crie uma **API Key** → `NEXT_PUBLIC_YOUTUBE_API_KEY`

3. **Google OAuth (Login com Google)**:
   - No [Google Cloud Console](https://console.cloud.google.com), vá em **APIs & Services > Credentials**
   - Crie ou edite **OAuth 2.0 Client ID** (Web Application)
   - Em **Authorized JavaScript origins**, adicione: `http://localhost:3000`
   - Em **Authorized redirect URIs**, adicione:
     - `https://seu-projeto.supabase.co/auth/v1/callback` (use seu URL do Supabase)
     - `http://localhost:3000/auth/callback`
   - Copie o **Client ID** e **Client Secret**
   - No Supabase Dashboard, vá em **Authentication > Providers > Google**
   - Habilite Google e insira as credenciais

3. **Execute os scripts SQL**:
   - No Supabase Dashboard, vá em **SQL Editor**
   - Execute os arquivos em `supabase/migrations/` na ordem:
     - `001_initial_schema.sql`
     - `002_rls_policies.sql`
     - `003_triggers.sql`

4. **Defina o Admin**:
   ```sql
   UPDATE profiles SET role = 'admin' WHERE email = 'seu_email@exemplo.com';
   ```

5. **Edite `.env.local`** com suas credenciais

### Executando

```bash
# Desenvolvimento
npm run dev

# Build para produção
npm run build

# Iniciar produção
npm start
```

Acesse [http://localhost:3000](http://localhost:3000)

## 🏗️ Estrutura do Projeto

```
karaoke-flow/
├── src/
│   ├── app/              # Rotas (Next.js App Router)
│   │   ├── (auth)/      # Login, Register
│   │   ├── (dashboard)/ # Playlist, Player, Minhas Músicas
│   │   ├── administracao/  # Painel de Administração
│   │   └── api/         # API Routes
│   ├── components/       # Componentes React
│   ├── hooks/           # Hooks customizados
│   ├── lib/
│   │   ├── supabase/   # Cliente Supabase
│   │   └── youtube/     # Utilitários YouTube
│   ├── store/           # Zustand stores
│   └── types/           # TypeScript types
├── supabase/
│   └── migrations/      # Scripts SQL do banco
├── .env.example         # Template de variáveis
└── package.json
```

## 👥 Perfis de Usuário

| Recurso | Usuário | Admin |
|---------|---------|-------|
| Visualizar playlist | ✅ | ✅ |
| Solicitar músicas | ✅ | ✅ |
| Controlar player | ❌ | ✅ |
| Aprovar músicas | ❌ | ✅ |
| Reordenar playlist | ❌ | ✅ |
| Remover músicas | ❌ | ✅ |

## 🔄 Fluxo do Sistema

### Arquitetura de Autenticação

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FLUXO DE AUTENTICAÇÃO                         │
└─────────────────────────────────────────────────────────────────────┘

1. USUÁRIO ACESSA /dashboard
   │
   ├─→ Middleware (middleware.ts)
   │   └─→ Verifica cookies de sessão
   │       └─→ Redireciona para /login se não autenticado
   │
   └─→ DashboardLayout (layout.tsx)
       └─→ useAuth(true) ← Executa initAuth UMA vez
           │
           ├─→ supabase.auth.getSession()
           │   └─→ Busca perfil no banco
           │       └─→ syncProfile() ← Atualiza authStore
           │
           └─→ setUser(profile) ← Atualiza store Zustand
               │
               └─→ TODOS os componentes subscritos re-renderizam
                   │
                   ├─→ Header (useUser)
                   ├─→ DashboardPage (useUser)
                   └─→ usePlaylist (acionado pela mudança de user)
```

### Fluxo de Renderização do Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FLUXO DE RENDERIZAÇÃO                            │
└─────────────────────────────────────────────────────────────────────┘

DashboardLayout
├─ useAuth(true) ─→ initRef flag previne execução dupla
│   └─→ setLoading(true) → setLoading(false)
│       └─→ setUser(profile) ← Atualiza store
│
└─ children (DashboardPage)
    ├─ useUser() ─→ Lê user da store (NÃO executa initAuth)
    └─ usePlaylist() ─→ Acionado quando user muda no store
        └─→ fetchPlaylist() ← Busca dados
        └─→ setupRealtime() OU setupPolling()
```

### Estrutura de Hooks

```
┌─────────────────────────────────────────────────────────────────────┐
│                         HOOKS DO SISTEMA                              │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────┐
│   useAuth()     │ ← Executa initAuth (uma vez por app)
│   requireAuth   │
└────────┬────────┘
         │
         ├─→ Lê: user, isLoading do authStore
         ├─→ Escreve: setUser, setLoading
         └─→ Retorna: user, isLoading, isAdmin, signOut

┌─────────────────┐
│   useUser()     │ ← Leitura apenas do user
└────────┬────────┘
         │
         └─→ Lê: user do authStore
             └─→ NÃO causa re-renders extras

┌─────────────────────────┐
│   usePlaylist()         │ ← Gerencia playlist + realtime
└────────────┬────────────┘
             │
             ├─→ Efeito único com dependência [user]
             │   └─→ cleanup() ao desmontar
             │
             ├─→ Realtime (Supabase)
             │   └─→ Canal: playlist-sync
             │       ├─→ Tabela: playlist
             │       └─→ Tabela: player_state
             │
             └─→ Polling (fallback)
                 └─→ Interval: 5 segundos

┌─────────────────────────┐
│   Stores (Zustand)       │
└─────────────────────────┘

authStore ──────────────→ user, isLoading
                              ↑
                              └─ useAuth → setUser()

playlistStore ───────────→ playlist[], currentSong, playerState
                              ↑
                              └─ usePlaylist → fetchPlaylist()

playerStore ─────────────→ videoId, isPlaying, isMuted, volume
                              ↑
                              └─ YouTubePlayer → setIsPlaying()
```

### Fluxo de Dados (Playlist)

```
┌─────────────────────────────────────────────────────────────────────┐
│                     FLUXO DE DADOS - PLAYLIST                         │
└─────────────────────────────────────────────────────────────────────┘

1. USUÁRIO SOLICITA MÚSICA
   └─→ SongRequestForm
       └─→ POST /api/youtube/search
           └─→ YouTube Data API
               └─→ Lista de vídeos

2. USUÁRIO SELECIONA VÍDEO
   └─→ Insere em songs (se não existir)
       └─→ Insere em approval_queue (pendente)

3. ADMIN APROVA
   └─→ POST /api/admin/approve
       └─→ Insere em playlist (position = última)
           └─→ Supabase Realtime notifica

4. PLAYER TOCAR MÚSICA
   └─→ Admin clica "Play"
       └─→ UPDATE player_state (current_song_id, status)
           └─→ usePlaylist detecta mudança
               └─→ YouTubePlayer carrega vídeo
```

### Middleware (Proteção de Rotas)

```
┌─────────────────────────────────────────────────────────────────────┐
│                       MIDDLEWARE - PROTECTION                         │
└─────────────────────────────────────────────────────────────────────┘

Middleware (middleware.ts)
├─→ createServerClient() ← Lê cookies
├─→ supabase.auth.getUser()
│   └─→ Valida token JWT
│
├─→ Rotas públicas: /, /login, /register, /auth/callback
│   └─→ Permite acesso sem autenticação
│
└─→ Rotas protegidas: /dashboard, /player, /administracao/*
    └─→ Redireciona para /login se !user
```

### Estados do Player

```
┌─────────────────────────────────────────────────────────────────────┐
│                       ESTADOS DO PLAYER                               │
└─────────────────────────────────────────────────────────────────────┘

player_state (tabela Supabase)
│
├─ status: "idle" | "playing" | "paused"
│   └─→ playerStore.isPlaying
│
├─ current_song_id: string | null
│   └─→ playlistStore.currentSong
│
└─ updated_at: timestamp
    └─→ Sincronizado via Realtime
```

### Performance & Boas Práticas

1. **useAuth executa UMA vez** via `initRef`
2. **usePlaylist usa efeito único** com dependência `[user]`
3. **Realtime com fallback de polling** (5s) para estabilidade
4. **Zustand selectors otimizados** para evitar re-renders
5. **Cleanup em todos os useEffects** para evitar vazamento de memória

### Debug (Desenvolvimento)

Para identificar problemas, adicione logs nos arquivos:

```typescript
// src/hooks/useAuth.ts
console.log("[useAuth] effect executing", { initRef, user, isLoading });

// src/store/authStore.ts  
console.log("[authStore] setUser", { user });

// src/hooks/usePlaylist.ts
console.log("[usePlaylist] effect", { user, playlist });
```

## 🌐 API Routes

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/youtube/search` | GET | Busca vídeos no YouTube |
| `/api/youtube/player` | POST | Controle do player |
| `/api/playlist/reorder` | POST | Reordenar playlist |
| `/api/playlist/remove` | POST | Remover da playlist |
| `/api/admin/approve` | POST | Aprovar/rejeitar |

## 📦 Tech Stack

- **Frontend**: Next.js 14+, React 19, TypeScript
- **Estilização**: TailwindCSS, Shadcn/ui
- **Estado**: Zustand
- **Backend**: Supabase (PostgreSQL + Auth + Realtime)
- **Player**: YouTube IFrame API
- **Hospedagem**: Vercel (recomendado)

## 🚢 Deploy

### Vercel (Recomendado)

1. Conecte seu repositório GitHub ao Vercel
2. Adicione as variáveis de ambiente:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `NEXT_PUBLIC_YOUTUBE_API_KEY`
   - `NEXT_PUBLIC_APP_URL`
3. Deploy!

### Variáveis de Ambiente

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=sua_url_do_projeto
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua_chave_anonima
SUPABASE_SERVICE_ROLE_KEY=sua_chave_service_role

# YouTube
NEXT_PUBLIC_YOUTUBE_API_KEY=sua_chave_youtube_data_api

# App
NEXT_PUBLIC_APP_URL=https://seu-dominio.vercel.app

# Google OAuth (redirect URIs no Google Cloud Console)
# https://seu-projeto.supabase.co/auth/v1/callback
# http://localhost:3000/auth/callback
```

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Commit suas mudanças (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📋 Changelog

### v2.6.5 (24/03/2026)
- **Fix**: Lista de aprovações não exibia dados (erro PGRST201 - múltiplos relacionamentos)
- **Corrigido**: Especificado relacionamento `profiles!approval_queue_requested_by_fkey`

### v2.6.4 (23/03/2026)
- **Fix**: OAuth Google login redirecionava para `/login` ao invés de `/dashboard`
- **Melhoria**: Movido callback OAuth para server-side (`/auth/callback/route.ts`)
- **Removido**: Callback page (`page.tsx`) substituído por API route

### v2.6.3 (22/03/2026)
- **Fix**: Painel de aprovações não mostrava dados
- **Script**: Adicionado `004_fix_approval_queue_rls.sql` com políticas RLS corrigidas

### v2.6.0+
- Autenticação com Supabase Auth + Google OAuth
- Sistema de aprovações de músicas
- Playlist em tempo real com YouTube
- Painel admin com controles completos

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 🙏 Créditos

- [Next.js](https://nextjs.org/)
- [Supabase](https://supabase.com/)
- [TailwindCSS](https://tailwindcss.com/)
- [Shadcn/ui](https://ui.shadcn.com/)
- [Lucide Icons](https://lucide.dev/)

---

Feito com ❤️ para amantes de karaokê!
