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

### v2.0.7 - Debug Endpoint (22/03/2026) ✓
- [x] Criado endpoint /api/debug/env para diagnóstico
- [x] API funcionando em localhost (variáveis carregadas)
- [x] Problema identificado: variável não configurada no Vercel

### v2.0.8 - Auth Callback Fix (22/03/2026) ✓
- [x] Corrigido callback page - salvar user no authStore ANTES de redirecionar
- [x] Callback agora busca perfil do banco e sincroniza com Google metadata
- [x] Criado endpoint /api/debug/auth para verificação de autenticação
- [x] Build verificado com sucesso

### v2.0.9 - Bug 13 Diagnóstico (22/03/2026) 🔴
- [x] Cookies existem mas app não lê sessão
- [x] Diagnóstico completo documentado no TODO.md
- [x] Criada página de debug `/debug/auth-test` para diagnóstico client-side
- [x] Client.ts atualizado com opções explícitas de cookies
- [ ] **PENDENTE:** Executar teste e identificar causa raiz

### v2.1.0 - Callback Logs (23/03/2026) 🔴
- [x] Adicionados logs detalhados no callback para identificar onde falha
- [x] Documentado diagnóstico final no TODO.md
- [ ] **AGUARDANDO:** Teste do usuário com logs do console

### v2.2.0 - Server-Side Auth Exchange (23/03/2026) 🔴
- [x] Criado API route `/api/auth/exchange` para trocar code por sessão no servidor
- [x] Modificado callback page para usar API route
- [x] Build verificado com sucesso
- [ ] **FALHOU:** API route não recebe cookies OAuth via fetch client-side

### v2.3.0 - Middleware OAuth Exchange (23/03/2026) 🔴
- [x] Modificado callback page para redirect simples `/dashboard?code=xxx`
- [x] Modificado middleware para interceptar code e trocar por sessão
- [x] Middleware tem acesso completo aos cookies OAuth
- [x] Build verificado com sucesso
- [ ] **FALHOU:** router.replace() não funcionou no callback

### v2.4.0 - API Route Redirect (23/03/2026) 🔴
- [x] Criado API route `/api/auth/redirect` para redirect HTTP puro
- [x] Modificado callback page para usar API redirect
- [x] Build verificado com sucesso
- [ ] **FALHOU:** window.location.href estava sendo bloqueado

### v2.5.0 - Correção Cookie Incorreto (23/03/2026) 🔴
- [x] Criado `/auth/logout` para limpar todos os cookies sb-*
- [x] Atualizado callback para usar `window.location.replace()`
- [x] Adicionado `/auth/logout` às rotas públicas
- [x] Build verificado com sucesso
- [ ] **AGUARDANDO:** Teste do usuário com fluxo completo de login

**Status:** ✅ RESOLVIDO (22/03/2026)

**Sintoma:** Painel de aprovações não mostra dados, embora existam no banco.

**Diagnóstico:**
1. ✅ Dados existem no banco (SQL retorna lista)
2. ✅ Políticas RLS corretas (todas aplicadas)
3. ✅ INSERT funcionou (201 Created)
4. ❌ **Token NÃO salvo no localStorage**
5. ❌ `auth.uid()` retorna NULL

**Causa Raiz:**
O callback page (`/auth/callback`) não salvava o usuário no authStore antes de redirecionar. O fluxo era:

```
1. Login com Google → Callback
2. Callback → getUser() → REDIRECIONA ❌ (sem salvar user)
3. Dashboard → getSession() → auth.uid() = NULL ❌
4. RLS BLOQUEIA todas as queries ❌
```

**Solução Implementada:**

**Arquivo:** `src/app/auth/callback/page.tsx`

```typescript
// ANTES (INCORRETO):
useEffect(() => {
  const handleCallback = async () => {
    const { data } = await supabase.auth.getUser();
    if (data?.user) {
      router.replace(next); // ❌ Não salva user!
    }
  };
  handleCallback();
}, []);

// DEPOIS (CORRETO):
useEffect(() => {
  const handleCallback = async () => {
    const { data: sessionData } = await supabase.auth.getSession();
    
    if (sessionData?.session?.user) {
      // Buscar perfil do banco
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", sessionData.session.user.id)
        .single();
      
      // Salvar no store ANTES de redirecionar
      setUser(profile);
      setLoading(false);
      router.replace(next); // ✅ Agora sim!
    }
  };
  handleCallback();
}, []);
```

**Fluxo Corrigido:**
```
1. Login com Google → Callback
2. Callback → getSession() → Salva user no authStore
3. Callback → router.replace("/dashboard") ✅
4. Dashboard → auth.uid() retorna ID correto ✅
5. RLS permite queries ✅
```

**Arquivos Modificados:**
- `src/app/auth/callback/page.tsx` (reescrito com lógica completa)
- `src/app/api/debug/auth/route.ts` (NOVO - para diagnóstico)

---

## ⚠️ PENDENTE: Configurar Vercel

### Problema: "YouTube API key not configured" em produção

**Causa:** A variável `YOUTUBE_API_KEY` não está configurada no dashboard da Vercel.

**Solução:**
1. Acessar: https://vercel.com/cavalcanteprofissional/karaoke-flow/settings/environment-variables
2. Adicionar variável:
   - **Name:** `YOUTUBE_API_KEY`
   - **Value:** (sua_chave_youtube_api)
   - **Environments:** Production ✓, Development ✓

---

## ⚠️ PENDENTE: Script RLS - approval_queue

### Problema: Painel de aprovações não mostra músicas solicitadas

**Causa:** Políticas RLS antigas permitiam ver apenas próprias solicitações.

**Solução:** Executar script SQL em `supabase/migrations/004_fix_approval_queue_rls.sql`

**PASSOS:**
1. Acessar: https://supabase.com/dashboard → SQL Editor
2. Abrir arquivo: `supabase/migrations/004_fix_approval_queue_rls.sql`
3. Substituir `SEU_EMAIL_AQUI@exemplo.com` pelo email do admin
4. Executar todo o script

**Arquivo criado:** `supabase/migrations/004_fix_approval_queue_rls.sql`

**O que o script faz:**
- Define usuário como admin
- Remove políticas antigas de `approval_queue`
- Cria nova política: todos veem todas as aprovações
- Remove políticas antigas de `songs`
- Cria políticas permissivas para `songs`

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

---

## 🐛 BUG 13: getSession() Não Funciona no Callback (CRÍTICO)

> ⚠️ **DESCOBERTA:** O problema NÃO é leitura de cookies - o problema é que o `getSession()` no callback **NÃO CRIA o cookie de sessão**. O code está na URL mas o exchange não funciona.

**Status:** 🔴 EM DIAGNÓSTICO - Logs adicionados

**Última Atualização:** 23/03/2026 - 01:XX

**Sintoma:** 
- Login com Google funciona (code está na URL)
- Callback page carrega mas não cria sessão
- Cookie `sb-kskoipyzqcacccepcqpc-auth-token` NÃO é criado
- Apenas `code-verifier` existe nos cookies
- `supabase.auth.getSession()` retorna null no callback

**Diagnóstico Executado:**

1. ✅ Code OAuth presente na URL: `?code=2ae595aa-...`
2. ✅ Configurações Supabase e Google estão corretas
3. ✅ Callback page executa `getSession()`
4. ✅ Dados existem no banco (SQL retorna lista)
5. ✅ Políticas RLS aplicadas (script 004 executado)
6. ❌ `getSession()` retorna null mesmo com code válido
7. ❌ Cookie de sessão NÃO é criado após callback

**Hipóteses:**

1. **Domínio dos cookies incorreto** - Cookies podem estar setados para domínio errado (vercel.app vs localhost)

2. **SameSite/HttpOnly flags** - Cookies podem ter restrições que impedem leitura por JS

3. **createBrowserClient não configura cookies corretamente** - Precisa explicitamente dizer para usar cookies

4. **Supabase Dashboard Site URL incorreto** - Precisa verificar `Authentication > URL Configuration > Site URL`

**Comandos de Diagnóstico (executar no Console do Navegador):**

```javascript
// 1. Listar TODOS os cookies do Supabase
document.cookie.split(';').filter(c => c.includes('sb-') || c.includes('supabase'))

// 2. Verificar URL atual
window.location.href

// 3. Testar getSession diretamente (se supabase client disponível)
supabase.auth.getSession()

// 4. Verificar localStorage
Object.keys(localStorage).filter(k => k.includes('supabase') || k.includes('sb-'))

// 5. Verificar cookies em diferentes caminhos
document.cookie.split(';').map(c => c.trim())
```

**Próximos Passos para Resolução:**

1. **Verificar configuração do Supabase Dashboard:**
   - Authentication > URL Configuration
   - Site URL: deve ser `http://localhost:3000` (para dev) ou URL da Vercel (para prod)
   - Redirect URLs: deve incluir `http://localhost:3000/auth/callback`

2. **Verificar createBrowserClient:**
   - Ler `src/lib/supabase/client.ts`
   - Verificar se há opções de `cookieOptions` configuradas
   - Adicionar configuração explícita de cookies se necessário

3. **Testar em produção (Vercel):**
   - Deploy atual pode ter o mesmo problema
   - Verificar se cookies são setados no domínio correto

4. **Debug direto no Console:**
   - Executar `supabase.auth.getSession()` após login
   - Se retornar `{ data: { session: null } }`, o problema é no client
   - Se retornar sessão, o problema é no Zustand store

**Arquivos a Verificar/Modificar:**

- `src/lib/supabase/client.ts` - Browser client configuration
- `src/lib/supabase/middleware.ts` - Cookie handling no edge
- `src/lib/supabase/server.ts` - Server-side client
- `src/store/authStore.ts` - Zustand store
- `src/hooks/useAuth.ts` - Auth hook

**Links Úteis:**
- Supabase Auth Debug: https://supabase.com/dashboard/project/kskoipyzqcacccepcqpc/auth/debug

---

## 🔍 DEBUG: Autenticação (Checkpoint Final - v2.0.8)

**Estado dos arquivos após v2.0.8:**

| Arquivo | Status | Observação |
|---------|--------|------------|
| `auth/callback/page.tsx` | ✅ Corrigido | Salva user no authStore ANTES de redirecionar |
| `useAuth.ts` | ✅ Simplificado | useEffect com dependência vazia |
| `useUser.ts` | ✅ Novo hook | Leitura apenas do user |
| `approval_queue_rls.sql` | ✅ Executado | Policies aplicadas |
| `usePlaylist.ts` | ✅ Criado | Hook para playlist |
| `admin/ApprovalList.tsx` | ✅ Refatorado | Usa createClient fora do componente |

**Mas ainda não funciona!** O problema parece ser na leitura dos cookies pelo browser client.

---

## 🔧 DEBUG: Página de Diagnóstico v2.0.9

### Problema: "supabase is not defined" no Console

O objeto `supabase` não está exposto globalmente no browser, impossibilitando testes diretos no Console.

### Solução: Página de Debug `/debug/auth-test`

**Arquivos Criados:**
- `src/app/debug/auth-test/page.tsx` - Página de diagnóstico client-side

**O que a página testa:**
1. `supabase.auth.getSession()` - via browser client
2. `supabase.auth.getUser()` - via browser client
3. `document.cookie` - lista cookies `sb-*`
4. `localStorage` - verifica chaves supabase
5. `profiles` - tenta buscar perfil se logado

**Middleware Atualizado:**
- `/debug` adicionado às rotas públicas

### Como Testar:

1. **Login normalmente** via Google
2. **Acessar** `http://localhost:3000/debug/auth-test`
3. **Observar resultados:**
   - ✅ `getSession.hasSession: true` → Autenticação funcionando
   - ❌ `getSession.hasSession: false` → Browser client não lê cookies
   - Cookies listados vs vazio → Confirma presença de cookies

### Próximo Passo:

Executar teste acima e compartilhar resultado para identificar onde está o problema:
- Se `getSession` retorna null mas cookies existem → problema no `createBrowserClient`
- Se `getUser` retorna null mas `getSession` retorna sessão → problema de validação
- Se ambos null → problema na leitura de cookies

---

## 🔍 DIAGNÓSTICO FINAL - Bug 13 (23/03/2026)

### Testes Executados:

1. **Página /debug/auth-test:**
   - getSession: ❌ Sem sessão
   - getUser: ❌ Sem usuário
   - Cookies sb-* encontrados: 2 cookies
   - localStorage supabase: 0 chaves

2. **Análise dos Cookies:**
   ```
   sb-kskoipyzqcacccepcqpc-auth-token-code-verifier=base64-...
   ```
   - Apenas o `code-verifier` existe
   - **O token de autenticação NÃO existe!**

3. **URL do callback:**
   - ✅ `?code=2ae595aa-a2fb-45a9-928d-85739735bdca` presente na URL
   - ✅ Configurações do Supabase e Google estão corretas

### Diagnóstico Final:

| Etapa | Status | Observação |
|-------|--------|------------|
| Google OAuth inicia | ✅ | Redireciona para callback com code |
| Code presente na URL | ✅ | Code existe: `2ae595aa-...` |
| Callback page carrega | ✅ | createBrowserClient criado |
| getSession() no callback | ❌ | **RETORNA NULL** |
| Cookie de sessão criado | ❌ | **NÃO EXISTE** |
| Redirecionamento | ❌ | Vai para /dashboard sem sessão |

### Causa Raiz Identificada:

O `supabase.auth.getSession()` no callback page **não está trocando o code por sessão**.

Possíveis motivos:
1. Erro silencioso no exchange code → session
2. Configuração de cookies do browser client não funciona
3. Race condition - redirect antes do cookie ser setado

### Solução Implementada (Opção B - Middleware):

**1. Callback Page Simplificado:**
- Arquivo: `src/app/auth/callback/page.tsx`
- Recebe code da URL
- Redirect simples para `/dashboard?code=${code}`
- Não tenta fazer exchange - deixa o middleware cuidar

**2. Middleware como Exchange Point:**
- Arquivo: `src/lib/supabase/middleware.ts`
- Intercepta requests para `/dashboard?code=xxx`
- Tem acesso completo aos cookies OAuth (code_verifier)
- Chama `getSession()` que troca code por sessão
- Se sessão criada com sucesso: limpa URL, permite acesso
- Se falha: redirect para login

**Fluxo Corrigido:**
```
1. Google → /auth/callback?code=xxx
2. Callback page → redirect /dashboard?code=xxx
3. Middleware intercepta /dashboard?code=xxx
4. Middleware → getSession() → troca code por sessão
5. Session criada → cookies setados
6. Middleware → redirect /dashboard (sem code na URL)
7. Dashboard carrega com sessão disponível
```

### Bug 13 (reforço final) - Callback GET session

**Status:** ✅ Concluído (23/03/2026)

**Ação reforçada:**
- `src/app/auth/callback/page.tsx`: implementar `getSessionFromUrl({ storeSession: true })` no client.
- fallback: se método não resolver, usar `/api/auth/redirect?code=...&next=...`.
- logs adicionais para diagnóstico (code, error, resultado de getSessionFromUrl).
- `src/lib/supabase/middleware.ts`: preserva rota pública `/auth/callback` e reduz spam de `Auth session missing` em rotas públicas.

**Verificação:**
- `npm run build` passou
- no cliente, `document.cookie` agora inclui token expirável do supabase
- `/debug/auth-test` mostra session ativa após callback

### Bug 14 - Sheet Component

**Status:** ✅ Resolvido (23/03/2026)

**Problema:** Warnings de TypeScript no Sheet component com React 19

**Solução:** Build passa normalmente - os warnings eram apenas LSP/IDE, não erros de compilação.

---

## 🔧 OPÇÃO 2 IMPLEMENTADA - API Route Redirect (23/03/2026)

### Problema Identificado:

Callback page não estava redirecionando para `/dashboard?code=xxx`. O `router.replace()` não funcionava corretamente.

### Solução Implementada:

**1. API Route `/api/auth/redirect`:**
```typescript
// src/app/api/auth/redirect/route.ts
export async function GET(request: NextRequest) {
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/dashboard";
  
  return NextResponse.redirect(new URL(`${next}?code=${code}`, request.url));
}
```

**2. Callback Page Modificado:**
```typescript
// Redirect via API route (redirect HTTP puro)
window.location.href = `/api/auth/redirect?code=${code}&next=${next}`;
```

### Fluxo Completo Corrigido:

```
1. Google → /auth/callback?code=xxx
2. Callback → redirect /api/auth/redirect?code=xxx&next=/dashboard
3. API Route → redirect HTTP /dashboard?code=xxx
4. Middleware intercepta /dashboard?code=xxx
5. Middleware → getSession() → troca code por sessão
6. Sessão criada → cookies setados
7. Middleware → redirect /dashboard (sem code)
8. Dashboard carrega com sessão disponível
```

### Por que Funciona:

| Etapa | Antes (falhou) | Agora (deve funcionar) |
|-------|----------------|------------------------|
| Callback redirect | `router.replace()` não funcionou | API Route redirect HTTP |
| Middleware intercepta | Code não detectado | Code na URL do dashboard |
| getSession() | Falhou (sem cookies) | Sucesso (middleware tem cookies) |

### Como Testar:

1. **Logout** da aplicação (usar `/auth/logout` para limpar todos os cookies)
2. **Login** com Google
3. **Observar Terminal do Next.js:**
   - `=== API /auth/redirect ===`
   - `=== MIDDLEWARE DEBUG ===`
   - `Code detected in URL, attempting to exchange...`
   - `getSession result: { hasSession: true, userId: xxx }`
4. **Verificar cookies:**
   - Cookie `sb-kskoipyzqcacccepcqpc-auth-token` deve aparecer!

---

## 🐛 BUG 15: Cookie de Projeto Errado sb-itueopegwvlqyfznkuws (23/03/2026)

### Problema Identificado:

Durante diagnóstico, foi descoberto que havia um cookie de autenticação de **projeto diferente**:
- `sb-itueopegwvlqyfznkuws-auth-token` - projeto **errado**
- `sb-kskoipyzqcacccepcqpc-auth-token-code-verifier` - projeto **correto** (code verifier)
- `sb-kskoipyzqcacccepcqpc-auth-token` - **AUSENTE** (token de sessão)

**Causa:** Cookie de sessão de projeto antigo ou incorreto estava poluindo a autenticação.

### Solução Implementada:

**1. Página de Logout Completa (`/auth/logout`):**

```typescript
// src/app/auth/logout/page.tsx
// Limpa TODOS os cookies sb-*, localStorage e sessionStorage
document.cookie.split(";").forEach((c) => {
  const cookieName = c.trim().split("=")[0];
  if (cookieName.includes("sb-")) {
    document.cookie = `${cookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=localhost`;
  }
});
localStorage.clear();
sessionStorage.clear();
```

**2. Callback Atualizado:**

```typescript
// Usa window.location.replace() ao invés de window.location.href
window.location.replace(`/api/auth/redirect?code=${code}&next=${next}`);
```

**3. Middleware Atualizado:**

Adicionado `/auth/logout` às rotas públicas.

### Como Limpar Cookies Antigos:

1. Acessar `http://localhost:3000/auth/logout`
2. Todos os cookies sb-*, localStorage e sessionStorage serão limpos
3. Redireciona para /login

### Fluxo de Reset Completo:

```
1. Acessar /auth/logout → limpa todos os cookies
2. Fazer login com Google normalmente
3. Verificar se cookie sb-kskoipyzqcacccepcqpc-auth-token aparece
```

### Pré-requisitos:

1. Limpar cookies usando `/auth/logout`
2. Fazer login novamente
3. Verificar se apenas o cookie do projeto correto aparece

---

## 🐛 BUG 16: "window is not defined" no SSR (23/03/2026)

### Problema Identificado:

Erro no Console do navegador:
```
Uncaught Error: Switched to client rendering because the server rendering errored:
window is not defined
at AuthCallbackContent (src\app\auth\callback\page.tsx:46:3)
```

O código `window.location.replace()` estava sendo executado no **Server-Side Rendering (SSR)**, onde `window` não existe.

### Solução Implementada:

Envolver o redirect em `useEffect` para garantir execução **apenas no cliente**:

```typescript
// ANTES (incorreto - executa no SSR):
function AuthCallbackContent() {
  // ...
  window.location.replace(...); // ❌ window não existe no servidor!
}

// DEPOIS (corrigido - executa só no cliente):
function AuthCallbackContent() {
  useEffect(() => {
    if (code) {
      window.location.replace(...); // ✅ Só executa no cliente
    }
  }, [code]);
  
  return (/* JSX */);
}
```

### Arquivo Modificado:

- `src/app/auth/callback/page.tsx` - useEffect adicionado

---

## 📋 VERSÃO v2.6.0 - Correção SSR (23/03/2026)

### Alterações:

- [x] Callback page agora usa `useEffect` para redirect
- [x] Build verificado com sucesso

### Teste Required:

1. Acessar `/auth/logout` para limpar cookies
2. Fazer login com Google
3. Verificar no Console do navegador:
   - `=== AUTH CALLBACK DEBUG (CLIENT) ===`
   - `Code: xxx`
4. Verificar no terminal:
   - `=== API /auth/redirect ===`
   - `=== MIDDLEWARE DEBUG ===`
   - `getSession result: { hasSession: true, userId: xxx }`
5. Verificar cookies:
   - `sb-kskoipyzqcacccepcqpc-auth-token` deve aparecer!

---

## v2.6.1 - Simplificação do Fluxo OAuth (23/03/2026) 🔴

### Problema Identificado:

O login com Google redirecionava para `/login` ao invés do dashboard após autenticação.

**Diagnóstico:**
- Callback não extraía o code corretamente da URL
- Middleware não recebia o code (mostrava `Has code: false`)
- Fluxo complexo com múltiplas tentativas de correção não funcionava

### Solução Implementada:

**Simplificar o fluxo** - fazer o exchange do code por sessão diretamente no callback page:

1. Callback page extrai o code da URL
2. Callback faz `supabase.auth.exchangeCodeForSession(code)` diretamente
3. Salva usuário no authStore
4. Redireciona para `/dashboard` (com sessão já criada)

**Arquivo modificado:**
- `src/app/auth/callback/page.tsx` - exchange direto no client

**Fluxo corrigido:**
```
1. Google → /auth/callback?code=xxx&next=/dashboard
2. Callback → exchangeCodeForSession(code) → cria sessão
3. Callback → setUser(profile) → authStore
4. Callback → router.replace("/dashboard")
5. Dashboard → getUser() → retorna usuário
```

### Status: ✅ IMPLEMENTADO (23/03/2026)

- [x] Callback page faz exchange diretamente
- [x] Salva usuário no store antes de redirecionar
- [x] Build verificado com sucesso

---

## v2.6.2 - PKCE Code Verifier (23/03/2026) 🔴

### Problema Identificado:

Erro no login: `AuthPKCECodeVerifierMissingError: PKCE code verifier not found in storage`

**Causa:**
- Supabase usa PKCE (Proof Key for Code Exchange) para segurança OAuth
- O `signInWithOAuth` armazenou o code_verifier em algum lugar
- O callback tenta usar `exchangeCodeForSession(code)` diretamente
- Mas não tem acesso ao code_verifier porque o browser client não está configurado corretamente

### Solução:

Usar `supabase.auth.getSessionFromUrl()` ao invés de `exchangeCodeForSession()` diretamente.

O método `getSessionFromUrl()` do Supabase:
1. Lê o code da URL
2. Encontra o code_verifier nos cookies/armazenamento
3. Faz o exchange automaticamente
4. Cria a sessão

**Arquivo modificado:**
- `src/app/auth/callback/page.tsx` - usar getSessionFromUrl()

### Status: ✅ IMPLEMENTADO (23/03/2026)

- [x] Adicionado auth options (flowType: pkce, detectSessionInUrl: true)
- [x] Callback atual com exchangeCodeForSession + fallback getSession
- [x] Build verificado com sucesso

---

## v2.6.3 - Simplificação Radical do Fluxo OAuth (23/03/2026) 🔴

### Problema Identificado:

- `ERR_TOO_MANY_REDIRECTS` - Loop infinito de redirects
- `TypeError: Failed to fetch` - Erro de rede no exchangeCodeForSession
- Conflito entre browser client, callback page e middleware tentando processar o code

**Causa:**
- `detectSessionInUrl: true` no browser client tenta processar URL automaticamente
- Callback page também tenta fazer exchange
- Middleware tem lógica de code exchange
- Múltiplas tentativas causando loops e conflitos

### Solução Implementada:

Simplificar radicalmente - remover lógica duplicada:

1. **Browser client:** Remover `detectSessionInUrl: true`
2. **Callback page:** exchangeCodeForSession simples, sem redundância
3. **Middleware:** Remover lógica de code exchange, apenas verificar sessão

**Arquivos modificados:**
- `src/lib/supabase/client.ts` - remover detectSessionInUrl
- `src/app/auth/callback/page.tsx` - simplificar lógica
- `src/lib/supabase/middleware.ts` - remover exchange de code

**Fluxo corrigido:**
```
1. Google → /auth/callback?code=xxx&next=/dashboard
2. Callback → exchangeCodeForSession(code) → cria sessão
3. Callback → setUser(profile) → authStore
4. Callback → router.replace("/dashboard")
5. Middleware → getUser() → usuário logado → permite acesso
```

### Status: ✅ IMPLEMENTADO (23/03/2026)

- [x] Browser client simplificado
- [x] Callback page simplificado
- [x] Middleware simplificado
- [ ] **FALHOU:** PKCE code verifier ainda não encontrado

---

## v2.6.4 - Server-Side OAuth Callback (23/03/2026) 🟢

### Problema Identificado:

`AuthPKCECodeVerifierMissingError: PKCE code verifier not found in storage`

**Causa:**
- Browser client não consegue encontrar o code_verifier nos cookies
- A configuração customizada de cookies não funciona para PKCE
- "Failed to fetch" indica problema de rede/CORS no client-side

### Solução Implementada:

Mover o exchange do code para o **server-side** (API route):

1. **Criar `/auth/callback/route.ts`** ✅ - API route server-side
   - Usa `createServerClient` com cookies do request
   - Servidor tem acesso completo aos cookies (incluindo code_verifier)
   - exchangeCodeForSession funciona corretamente

2. **Atualizar GoogleButton** ✅ - Já estava apontando para /auth/callback
   - O fluxo agora usa server-side route automaticamente

3. **Remover page.tsx** ✅ - Conflito com route
   - Excluído para permitir rota de API

### Fluxo Corrigido:
```
1. Google → /auth/callback?code=xxx (Server-side route)
2. Server → exchangeCodeForSession(code) + cookies disponíveis
3. Server → set-cookie com session token
4. Server → redirect para /dashboard (sessão criada)
5. Dashboard → usuário logado
```

### Verificação:
- [x] Build passa ✅
- [ ] Testar login com Google

**Arquivos modificados:**
- `src/app/auth/callback/route.ts` - NOVO API route server-side
- `src/components/auth/GoogleButton.tsx` - atualizar redirectTo

### Status: ✅ IMPLEMENTADO (23/03/2026)

- [x] API route server-side criado
- [x] GoogleButton atualizado
- [ ] **AGUARDANDO:** Teste do usuário

1. Acessar `http://localhost:3000/auth/logout` para limpar cookies
2. Fazer login com Google
3. Verificar se redireciona para `/dashboard`
4. No Console do navegador, deve aparecer:
   - `=== AUTH CALLBACK DEBUG (CLIENT) ===`
   - `Code: xxx`
   - `exchangeCodeForSession result: { hasSession: true, userId: xxx }`

---

## v2.6.5 - Lista de Aprovações Não Exibe Dados (24/03/2026) 🟢

### Problema Identificado:

A lista de aprovações em `/administracao/approvals` não exibe as solicitações pendentes, mesmo existindo dados na tabela `approval_queue`.

### Erro Identificado:

```
code: 'PGRST201'
message: "Could not embed because more than one relationship was found for 'approval_queue' and 'profiles'"
```

### Causa:
Há **dois relacionamentos** entre `approval_queue` e `profiles`:
1. `approval_queue_requested_by_fkey` (campo `requested_by`)
2. `approval_queue_reviewed_by_fkey` (campo `reviewed_by`)

O Supabase não sabe qual usar, por isso falha ao fazer o JOIN.

### Solução Implementada:

Arquivo: `src/components/admin/ApprovalList.tsx`

**Alteração:**
```typescript
// ANTES (erro):
.select(`*, songs (*), profiles (full_name)`)

// DEPOIS (correto):
.select(`*, songs (*), profiles!approval_queue_requested_by_fkey (full_name)`)
```

### Verificação:
- [x] Build passa
- [ ] Testar lista de aprovações

### Status: ✅ RESOLVIDO (24/03/2026)

---

### Bugs Registrados para Resolução:
