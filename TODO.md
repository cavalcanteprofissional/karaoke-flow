# KaraokeFlow - Progresso do Projeto

## v1.0.0 - Setup & Authentication ✓

### Fase 1: Projeto Base ✓
- [x] 1.1 Criar projeto Next.js 14+ com App Router
- [x] 1.2 Configurar TailwindCSS
- [x] 1.3 Configurar Shadcn/ui
- [x] 1.4 Instalar dependências principais

### Fase 2: Supabase ✓
- [x] 2.1 Scripts SQL (profiles, songs, playlist, player_state, approval_queue)
- [x] 2.2 Row Level Security (RLS)
- [x] 2.3 Triggers (auto-create profile, timestamps)
- [x] 2.4 Cliente Supabase (browser + server)

### Fase 3: Autenticação ✓
- [x] 3.1 Login/Register forms
- [x] 3.2 Middleware de proteção
- [x] 3.3 Perfis user/admin

## v1.1.0 - Playlist & Player ✓

### Fase 4: YouTube Integration ✓
- [x] 4.1 YouTube Data API v3
- [x] 4.2 YouTube IFrame API Player

### Fase 5: Playlist ✓
- [x] 5.1 SongRequestForm (solicitar músicas)
- [x] 5.2 PlaylistTable
- [x] 5.3 Supabase Realtime

### Fase 6: Player ✓
- [x] 6.1 YouTubePlayer component
- [x] 6.2 PlayerControls
- [x] 6.3 NowPlaying
- [x] 6.4 Auto-play próxima música

## v1.2.0 - Admin Controls ✓

### Fase 7: Admin Controls ✓
- [x] 7.1 Dashboard admin
- [x] 7.2 Aprovações
- [x] 7.3 Playlist manager (reorder, remove)

## v1.3.0 - Google OAuth ✓

### Fase 8: Login Social ✓
- [x] 8.1 GoogleButton component
- [x] 8.2 Auth callback page
- [x] 8.3 LoginForm + Google
- [x] 8.4 RegisterForm + Google
- [x] 8.5 useAuth - sincroniza profile Google

## v2.0.0 - Deploy Vercel ✓

### Fase 9: Deploy
- [x] 9.1 Código pushado para GitHub
- [x] 9.2 Google OAuth configurado
- [x] 9.3 Deploy Vercel
- [x] 9.4 Testar funcionalidades em produção

---

## 📋 DEPLOY VERCEL - PASSO A PASSO

### PASSO 1: Obter Valores das Variáveis

Execute no terminal:
```bash
cat .env.local
```

Copie os valores de:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_YOUTUBE_API_KEY`

---

### PASSO 2: Configurar Variáveis na Vercel

Acesse: **https://vercel.com/karaoke-flow/settings/environment-variables**

Adicione cada variável para **Production, Preview e Development**:

| Nome | Valor | Ambientes |
|------|-------|-----------|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://kskoipyzqcacccepcqpc.supabase.co` | Todos |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | (do .env.local) | Todos |
| `SUPABASE_SERVICE_ROLE_KEY` | (do .env.local) | Todos |
| `NEXT_PUBLIC_YOUTUBE_API_KEY` | (do .env.local) | Todos |
| `NEXT_PUBLIC_APP_URL` | (URL da Vercel após deploy) | Production |

---

### PASSO 3: Redeploy

1. Vá em **Deployments** na Vercel
2. Clique em **"Redeploy"** no último deployment
3. Aguarde ~2-3 minutos para o build

---

### PASSO 4: Atualizar NEXT_PUBLIC_APP_URL

Após o deploy, a Vercel fornecerá uma URL como:
`https://karaoke-flow.vercel.app`

Adicione esta URL como variável `NEXT_PUBLIC_APP_URL` na Vercel.

---

### PASSO 5: Atualizar Google OAuth

No Google Cloud Console, adicione a URL de produção:
- Authorized redirect URIs:
  - `https://karaoke-flow.vercel.app/auth/callback`

No Supabase Dashboard, o callback já está configurado:
- `https://kskoipyzqcacccepcqpc.supabase.co/auth/v1/callback`

---

### PASSO 6: Testar

1. Acesse a URL de produção
2. Login com Google
3. Solicite uma música
4. Verifique playlist



## Estrutura do Projeto

```
karaoke-flow/
├── src/
│   ├── app/
│   │   ├── (auth)/           # Login, Register
│   │   ├── (dashboard)/      # Dashboard, Player, My Songs
│   │   ├── admin/            # Admin Dashboard, Approvals
│   │   ├── api/              # YouTube, Playlist, Admin APIs
│   │   ├── auth/callback/    # OAuth callback
│   │   └── page.tsx
│   ├── components/
│   │   ├── auth/             # LoginForm, RegisterForm, GoogleButton
│   │   ├── layout/           # Header
│   │   ├── player/           # YouTubePlayer, PlayerControls
│   │   ├── playlist/         # PlaylistTable, SongRequestForm
│   │   ├── shared/           # SearchBar, VideoCard
│   │   └── ui/               # Button, Card, Input, etc.
│   ├── hooks/                # useAuth, usePlaylist, useRealtime
│   ├── lib/                  # supabase, youtube
│   ├── store/                # authStore, playlistStore, playerStore
│   └── middleware.ts
├── supabase/migrations/       # SQL scripts
└── package.json
```

---

## Histórico de Versões

### v0.0.1 - Início (20/03/2026) ✓
- [x] Projeto iniciado

### v1.0.0 - Setup & Authentication (20/03/2026) ✓
- [x] Autenticação completa

### v1.1.0 - Playlist & Player (20/03/2026) ✓
- [x] YouTube + Playlist + Player

### v1.2.0 - Admin Controls (20/03/2026) ✓
- [x] Dashboard + Aprovações + Gerenciamento

### v1.3.0 - Google OAuth (20/03/2026) ✓
- [x] Login/Cadastro com Google

### v2.0.0 - Deploy (20/03/2026) ✓
- [x] Em produção: https://karaoke-flow.vercel.app

### v2.0.1 - Polling Fallback (20/03/2026) ✓
- [x] Realtime com fallback de polling
- [x] Playlist sincronizada sem Realtime

### v2.0.2 - Bug 11 Fix (21/03/2026) ✓
- [x] Loop infinito no dashboard corrigido
- [x] Novo hook useUser() para leitura apenas
- [x] useAuth simplificado com dependência vazia
- [x] Dashboard page usa useUser() sem duplicar initAuth

### v2.0.3 - Loop Infinitos Adicionais (21/03/2026) ✓
- [x] PlayerControls - usa useAuthStore ao invés de useAuth
- [x] ApprovalList - createClient fora do componente, dependência vazia
- [x] YouTubePlayer - interval fix
- [x] Admin Dashboard - usa useUser()
- [x] Renomeado Admin → Administração

### v2.0.4 - Design System & Navegação (21/03/2026) ✓
- [x] DESIGN.md criado como agente de design
- [x] Dark/Light mode implementado com next-themes
- [x] ThemeToggle component
- [x] Mobile Navigation com BottomNav e MobileNav (Sheet)
- [x] Header responsivo

### v2.0.5 - YouTube API Fix (21/03/2026) ✓
- [x] Corrigido parsing de item.id (acessa videoId corretamente)
- [x] Corrigido parsing de thumbnail URL
- [x] Interface TypeScript para resposta da API
- [x] SongRequestForm usa useUser() ao invés de useAuth()
- [x] API testada e funcionando

### v2.0.6 - YouTube API Key Environment (21/03/2026) ✓
- [x] Corrigido acesso à API key em server-side routes
- [x] Adicionado YOUTUBE_API_KEY (sem NEXT_PUBLIC_) para SSR
- [x] Atualizado youtube/api.ts para usar process.env.YOUTUBE_API_KEY
- [x] Atualizado .env.example com nova variável

---

## 🐛 BUGS CORRIGIDOS

### Bug 1: Loading Infinito no Dashboard (CRÍTICO)
**Causa:** React StrictMode executa `useEffect` duas vezes, causando race condition com `initAuth()`

**Solução:** Usar `useRef` para prevenir inicializações duplicadas
```typescript
const initRef = useRef(false);

useEffect(() => {
  if (initRef.current) return;  // Previne segunda execução
  initRef.current = true;
  // ...
}, []);
```

**Lição:** Sempre usar guards contra StrictMode em development

### Bug 2: Turbopack + Next.js 16.2.0 + PostCSS
**Causa:** Turbopack tem problemas com Tailwind CSS v4 e PostCSS

**Solução:** 
- Fazer downgrade para Tailwind CSS 3.4.0
- Usar PostCSS 8.4.31
- Garantir versões compatíveis no package.json

### Bug 3: Middleware cookies loop
**Causa:** Criar `NextResponse.next()` dentro da função `setAll()`

**Solução:** Apenas setar cookies na response existente
```typescript
setAll(cookiesToSet) {
  cookiesToSet.forEach(({ name, value, options }) => {
    request.cookies.set(name, value);
    supabaseResponse.cookies.set(name, value, options);
  });
}
```

### Bug 4: Loop de OAuth Google (CRÍTICO)
**Causa:** Rota `/auth/callback` não estava na lista de rotas públicas do middleware

**Problema:** Quando Google redirecionava para `/auth/callback`, o middleware interceptava antes da página carregar, verificava `getUser()` (que retornava null pois cookies ainda não existiam), e redirecionava para `/login`, causando loop infinito.

**Solução:** Adicionar `/auth/callback` às rotas públicas
```typescript
const publicRoutes = ["/", "/login", "/register", "/auth/callback"];
```

**Correção adicional:** Remover timeout de 5s que podia causar rejeição silenciosa em produção.
```typescript
// ANTES (problemático):
const timeoutPromise = new Promise<never>((_, reject) => {
  setTimeout(() => reject(new Error("Middleware timeout")), 5000);
});
const result = await Promise.race([authPromise, timeoutPromise]);

// DEPOIS (corrigido):
const { data, error } = await supabase.auth.getUser();
```

### Bug 5: Tela branca após OAuth (tela branca + ?code= na URL)
**Causa:** Callback usava `router.push()` que preservava query params, e `useAuth` retornava `isLoading: false` sempre.

**Solução:**
1. Callback usa `router.replace()` para limpar URL
2. `useAuth` retorna `isLoading` real do store
3. `useAuth` cria profile automaticamente se não existir (código `PGRST116` = not found)

### Bug 6: Registro requer confirmação de email
**Causa:** Supabase `signUp` envia email de confirmação por padrão, impedindo login automático.

**Problema:** Usuários se registram mas não conseguem acessar até confirmar email.

**Solução:** Usar `emailConfirm: false` para desenvolvimento ou mostrar aviso claro.

### Bug 7: Inconsistência nos redirects
**Causa:** `LoginForm` usa `window.location.href`, `GoogleButton` usa `router.push`.

**Solução:** Padronizar para `router.push()` ou `window.location.replace()`.

### Bug 8: Dashboard retorna null no erro
**Causa:** `dashboard/layout.tsx` retorna `null` quando `!user`, causando tela branca.

**Solução:** Mostrar mensagem de erro e link para tentar novamente.

### Bug 9: getSession vs getUser no callback
**Causa:** Callback usa `getSession()` em vez de `getUser()`.

**Solução:** Usar `getUser()` que valida tokens corretamente.

### Bug 10: Loading infinito após login
**Causa:** `createClient()` é chamado dentro do componente, criando nova instância a cada render.

**Problema:** Isso invalida `useCallback` e causa re-execução do `useEffect`, loop infinito.

**Solução:** Mover `createClient()` para fora do componente (nível de módulo) ou usar `useMemo`.

### Feature: Polling como Fallback para Realtime
**Problema:** Extensão `pg_realtime` não disponível no Supabase gratuito.

**Solução:** Implementar polling com `setInterval(5000)` como fallback quando Realtime falhar.

**Fluxo:**
1. Tentar Realtime primeiro
2. Se falhar, mudar para polling
3. Buscar playlist a cada 5 segundos

**Benefícios:**
- Playlist sincronizada entre todos usuários (com delay de ~5s)
- Funciona sem Realtime do Supabase
- Sem erros de WebSocket no console

---

## 🐛 BUG EM ANDAMENTO

### Bug 11: Loop Infinito no Dashboard após Login (CORRIGIDO)

**Status:** ✅ RESOLVIDO (21/03/2026)

**Causa Raiz:**
1. `useAuth(true)` era executado NO LAYOUT e NO PAGE simultaneamente
2. Ambos chamavam `initAuth()` → `setLoading(true)` → sobrescrevendo estado
3. Dependências do useEffect incluíam funções que mudavam de referência
4. `setLoading(true)` no início de `initAuth` causava loop de re-renders

**Solução Implementada:**

**1. Novo Hook `useUser()` (src/hooks/useUser.ts):**
```typescript
export function useUser(): Profile | null {
  const user = useAuthStore((state) => state.user);
  return user;
}
```
- Leitura apenas do user do store
- NÃO executa initAuth
- NÃO causa re-renders

**2. Simplificado `useAuth.ts` (src/hooks/useAuth.ts:67-109):**
```typescript
// ANTES (problemático):
useEffect(() => {
  // ...
}, [router, setUser, setLoading, requireAuth, syncProfile]);

// DEPOIS (corrigido):
useEffect(() => {
  if (initRef.current) return;
  initRef.current = true;
  
  setLoading(true);  // ← Movido para fora de initAuth
  
  const initAuth = async () => {
    try {
      // ... lógica de autenticação
    } finally {
      setLoading(false);
    }
  };
  
  initAuth();
}, []);  // ← Dependência VAZIA
```

**3. Modificado `dashboard/page.tsx`:**
```typescript
// ANTES (problemático):
const { user, isAdmin } = useAuth(true);  // ← Duas execuções!

// DEPOIS (corrigido):
const user = useUser();  // ← Apenas leitura
const isAdmin = useAuthStore((state) => state.user?.role === "admin");
```

**Fluxo Corrigido:**
```
1. /auth/callback → router.replace("/dashboard")
2. Dashboard Layout → useAuth(true) → initAuth() → UNA execução
3. Dashboard Page  → useUser() → apenas lê user do store → SEM initAuth
4. ✅ Sem loop, sem duplicação
```

**Arquivos Modificados:**
- `src/hooks/useUser.ts` (NOVO)
- `src/hooks/useAuth.ts` (simplificado useEffect)
- `src/app/(dashboard)/dashboard/page.tsx` (usa useUser)

**Testado por:** Usuário (localmente)

### Bug 12: YouTube API - Parsing Incorreto

**Status:** ✅ RESOLVIDO (21/03/2026)

**Sintoma:** Não era possível solicitar músicas - busca retornava dados vazios ou erro.

**Causa Raiz:**
1. `item.id` era tratado como string, mas a API retorna objeto `{ videoId: string }`
2. Thumbnail parsing estava incorreto - acessava objeto inteiro ao invés de `.url`

**Solução Implementada:**

**1. Interface TypeScript correta:**
```typescript
interface YouTubeSearchItem {
  id: { videoId: string; };
  snippet: {
    title: string;
    channelTitle: string;
    thumbnails: {
      high?: { url: string; width: number; height: number; };
      medium?: { url: string; width: number; height: number; };
      default?: { url: string; width: number; height: number; };
    };
  };
}
```

**2. Parsing correto:**
```typescript
const videos: YouTubeVideo[] = data.items.map((item: YouTubeSearchItem) => ({
  id: item.id.videoId,  // ← Acessa videoId do objeto
  title: item.snippet?.title || "Untitled",
  thumbnail: item.snippet?.thumbnails?.high?.url  // ← Acessa .url
    || item.snippet?.thumbnails?.medium?.url
    || item.snippet?.thumbnails?.default?.url
    || null,
  channelTitle: item.snippet?.channelTitle || "Unknown",
  duration: null,
  viewCount: null,
}));
```

**3. SongRequestForm:**
```typescript
// ANTES:
import { useAuth } from "@/hooks/useAuth";
const { user } = useAuth();

// DEPOIS:
import { useUser } from "@/hooks/useUser";
const user = useUser();
```

**Arquivos Modificados:**
- `src/lib/youtube/api.ts` (parsing corrigido)
- `src/components/playlist/SongRequestForm.tsx` (useUser)

**Testado por:** API curl - retornou dados corretos
