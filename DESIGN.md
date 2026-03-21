# KaraokeFlow - Design System Agent

## Agent de Design

Este documento serve como **agente de design** para o projeto KaraokeFlow. Todas as decisões de design devem seguir estas diretrizes.

---

## 1. Visão e Princípios

### 1.1 Filosofia de Design

```
KaraokeFlow é um sistema de karaokê online que prioriza:
- ✅ Clareza sobre beleza
- ✅ Consistência sobre diversidade
- ✅ Minimalismo funcional
- ✅ Acessibilidade como padrão
- ✅ Feedback visual imediato
```

### 1.2 Princípios Fundamentais

| Princípio | Descrição | Implementação |
|-----------|-----------|---------------|
| **Clareza** | Usuários entendem imediatamente | Labels claros, ícones consistentes |
| **Consistência** | Padrões previsíveis | Mesmo componente em todo lugar |
| **Feedback** | Respostas para cada ação | Loading, success, error states |
| **Acessibilidade** | Funciona para todos | WCAG AA, keyboard nav, contrast |
| **Mobile-First** | Começa mobile, expande desktop | Breakpoints progressivos |

---

## 2. Design Tokens

### 2.1 Sistema de Cores

#### Paleta Semântica

| Token | Light Mode | Dark Mode | Uso |
|-------|-----------|-----------|-----|
| `--primary` | `#4864D4` | `#5590E8` | Ações primárias, links |
| `--primary-foreground` | `#FFFFFF` | `#FFFFFF` | Texto sobre primary |
| `--secondary` | `#F1F5F9` | `#2A3441` | backgrounds secundários |
| `--secondary-foreground` | `#0F172A` | `#F8FAFC` | Texto sobre secondary |
| `--destructive` | `#DC2626` | `#EF4444` | Ações destrutivas |
| `--destructive-foreground` | `#FFFFFF` | `#FFFFFF` | Texto sobre destructive |
| `--muted` | `#F1F5F9` | `#2A3441` | backgrounds sutis |
| `--muted-foreground` | `#64748B` | `#94A3B8` | Texto secundário |
| `--accent` | `#F1F5F9` | `#2A3441` | Hover states, destaques |
| `--accent-foreground` | `#0F172A` | `#F8FAFC` | Texto sobre accent |

#### Tokens de Superfície

| Token | Light Mode | Dark Mode | Uso |
|-------|-----------|-----------|-----|
| `--background` | `#FFFFFF` | `#0A1912` | Fundo da página |
| `--foreground` | `#0D121F` | `#F8FAFC` | Texto principal |
| `--card` | `#FFFFFF` | `#0F1A14` | Cards, painéis |
| `--card-foreground` | `#0D121F` | `#F8FAFC` | Texto em cards |
| `--popover` | `#FFFFFF` | `#0F1A14` | Dropdowns, modals |
| `--popover-foreground` | `#0D121F` | `#F8FAFC` | Texto em popovers |

#### Tokens de Estrutura

| Token | Light Mode | Dark Mode | Uso |
|-------|-----------|-----------|-----|
| `--border` | `#D5DBE5` | `#2A3441` | Bordas |
| `--input` | `#D5DBE5` | `#2A3441` | Inputs |
| `--ring` | `#4864D4` | `#5590E8` | Focus rings |

### 2.2 Tipografia

#### Font Stack
```css
font-family: 'Inter', ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
```

#### Escala Tipográfica

| Classe | Size | Line Height | Uso |
|--------|------|-------------|-----|
| `text-xs` | 12px (0.75rem) | 1.4 | Labels, badges |
| `text-sm` | 14px (0.875rem) | 1.5 | Texto secundário |
| `text-base` | 16px (1rem) | 1.5 | Texto principal |
| `text-lg` | 18px (1.125rem) | 1.5 | Subtítulos |
| `text-xl` | 20px (1.25rem) | 1.4 | Títulos menores |
| `text-2xl` | 24px (1.5rem) | 1.3 | Títulos de seção |
| `text-3xl` | 30px (1.875rem) | 1.2 | Títulos de página |
| `text-4xl` | 36px (2.25rem) | 1.1 | Hero headings |

#### Peso da Fonte
```css
font-weight-normal: 400;
font-weight-medium: 500;
font-weight-semibold: 600;
font-weight-bold: 700;
```

### 2.3 Espaçamento

#### Base: 4px (0.25rem)

| Token | Size | Uso |
|-------|------|-----|
| `space-1` | 4px | Entre elementos muito próximos |
| `space-2` | 8px | Entre elementos relacionados |
| `space-3` | 12px | Padding interno compacto |
| `space-4` | 16px | Padding padrão |
| `space-6` | 24px | Padding expansivo |
| `space-8` | 32px | Margens de seção |
| `space-12` | 48px | Margens de página |
| `space-16` | 64px | Seções grandes |

### 2.4 Bordas e Sombras

#### Border Radius
```css
--radius-sm: 4px;   /* Inputs, badges */
--radius-md: 6px;   /* Buttons, cards */
--radius-lg: 8px;   /* Modals, panels */
--radius-xl: 12px;  /* Cards grandes */
--radius-2xl: 16px; /* Containers especiais */
```

#### Shadows
```css
--shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
--shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
--shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
--shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
```

### 2.5 Transições

```css
/* Velocidades */
--transition-fast: 150ms;
--transition-base: 200ms;
--transition-slow: 300ms;

/* Easing */
--ease-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-in: cubic-bezier(0.4, 0, 1, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);

/* Aplicação padrão */
transition: all var(--transition-base) var(--ease-out);
```

---

## 3. Dark/Light Mode

### 3.1 Implementação

#### Estrutura
```
┌─────────────────────────────────────────────────────────┐
│                    THEME SYSTEM                          │
├─────────────────────────────────────────────────────────┤
│  1. CSS Variables em :root (light) e .dark (dark)      │
│  2. Tailwind via dark: variant                         │
│  3. next-themes para toggle + persistência             │
│  4. Transições suaves via CSS                          │
└─────────────────────────────────────────────────────────┘
```

#### Arquitetura de Arquivos
```
src/
├── app/
│   └── globals.css          # Tokens CSS
├── providers/
│   └── theme-provider.tsx   # ThemeProvider (next-themes)
├── components/
│   ├── layout/
│   │   └── Header.tsx       # ThemeToggle integrado
│   └── ui/
│       └── button.tsx       # Usa CSS variables
└── lib/
    └── utils.ts             # Funções utilitárias
```

### 3.2 Paletas de Cores

#### Light Mode (Default)
```css
:root {
  --background: #FFFFFF;
  --foreground: #0D121F;
  --card: #FFFFFF;
  --card-foreground: #0D121F;
  --popover: #FFFFFF;
  --popover-foreground: #0D121F;
  --primary: #4864D4;
  --primary-foreground: #FFFFFF;
  --secondary: #F1F5F9;
  --secondary-foreground: #0F172A;
  --muted: #F1F5F9;
  --muted-foreground: #64748B;
  --accent: #F1F5F9;
  --accent-foreground: #0F172A;
  --destructive: #DC2626;
  --destructive-foreground: #FFFFFF;
  --border: #D5DBE5;
  --input: #D5DBE5;
  --ring: #4864D4;
  --radius: 0.5rem;
}
```

#### Dark Mode
```css
.dark {
  --background: #0A1912;
  --foreground: #F8FAFC;
  --card: #0F1A14;
  --card-foreground: #F8FAFC;
  --popover: #0F1A14;
  --popover-foreground: #F8FAFC;
  --primary: #5590E8;
  --primary-foreground: #FFFFFF;
  --secondary: #2A3441;
  --secondary-foreground: #F8FAFC;
  --muted: #2A3441;
  --muted-foreground: #94A3B8;
  --accent: #2A3441;
  --accent-foreground: #F8FAFC;
  --destructive: #EF4444;
  --destructive-foreground: #FFFFFF;
  --border: #2A3441;
  --input: #2A3441;
  --ring: #5590E8;
}
```

### 3.3 Toggle de Tema

#### Localização
- **Desktop**: Header, lado direito, próximo ao avatar do usuário
- **Mobile**: Header, após menu hamburger

#### Comportamento
```
┌─────────────────────────────────────────────────────────┐
│                    THEME TOGGLE                          │
├─────────────────────────────────────────────────────────┤
│  Dropdown com 3 opções:                                 │
│  ☀️ Light  - Força modo claro                          │
│  🌙 Dark   - Força modo escuro                         │
│  💻 System - Segue preferência do sistema               │
│                                                         │
│  Ícone muda conforme tema atual:                        │
│  - Light ativo: ☀️ (sol com rotação)                  │
│  - Dark ativo: 🌙 (lua com rotação)                   │
│  - System ativo: 💻 (monitor)                         │
└─────────────────────────────────────────────────────────┘
```

#### Persistência
- Salva preferência no localStorage
- Aplica classe `.dark` ou `data-theme="dark"` no `<html>`
- Respeita `prefers-color-scheme` do sistema como default

---

## 4. Navegação

### 4.1 Desktop (≥1024px)

```
┌──────────────────────────────────────────────────────────────────┐
│  🎤 KaraokeFlow    Playlist   Player   Minhas Músicas   [Admin] │
│                                                              [👤 User ▼] [🌙] │
└──────────────────────────────────────────────────────────────────┘
```

#### Características
- Header fixo no topo (sticky)
- Navegação horizontal
- Máximo 7 itens (Lei de Miller)
- Indicador visual da página atual (background + text color)
- Theme toggle no canto direito

### 4.2 Tablet (768px - 1023px)

```
┌────────────────────────────────────────────────────┐
│  🎤 KaraokeFlow                            [☰]   │
├────────────────────────────────────────────────────┤
│  Playlist   Player   Minhas Músicas              │
└────────────────────────────────────────────────────┘
```

#### Características
- Navegação horizontal compactada
- Menu collapse com "Mais" opcional
- Touch-friendly (mínimo 44x44px por item)

### 4.3 Mobile (<768px)

```
┌─────────────────────────┐
│  🎤 KaraokeFlow    [☰] │
├─────────────────────────┤
│                         │
│   [Conteúdo Principal]  │
│                         │
├─────────────────────────┤
│  Playlist | Player | 🎵 │
└─────────────────────────┘
```

#### Características
- Header minimalista (logo + hamburger)
- Menu lateral (Sheet/Drawer)
- **Bottom navigation** para páginas principais
- Touch targets mínimo 44x44px

### 4.4 Hierarquia de Navegação

```
┌─────────────────────────────────────────────────────────┐
│                    NAVE GA ÇÃO                           │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PÚBLICAS (sem login)                                  │
│  ├── / (landing)                                        │
│  ├── /login                                            │
│  └── /register                                         │
│                                                         │
│  AUTENTICADAS (usuário comum)                          │
│  ├── /dashboard  ← Playlist + Solicitar Música          │
│  ├── /player     ← Player YouTube                       │
│  └── /my-songs   ← Minhas músicas solicitadas           │
│                                                         │
│  ADMIN (apenas role=admin)                              │
│  ├── /administracao/dashboard                          │
│  ├── /administracao/approvals                          │
│  └── /administracao/playlist-manager                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 5. Layout e Grid

### 5.1 Container

```css
/* Container principal */
.container {
  width: 100%;
  max-width: 1280px;
  margin-left: auto;
  margin-right: auto;
}

/* Padding responsivo */
.container {
  padding-left: 1rem;    /* 16px - mobile */
  padding-right: 1rem;
}

@media (min-width: 768px) {
  .container {
    padding-left: 1.5rem;  /* 24px - tablet */
    padding-right: 1.5rem;
  }
}

@media (min-width: 1024px) {
  .container {
    padding-left: 2rem;    /* 32px - desktop */
    padding-right: 2rem;
  }
}
```

### 5.2 Grid System

```
┌─────────────────────────────────────────────────────────────────┐
│                        GRID LAYOUTS                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  MOBILE (< 768px)          TABLET (768px - 1023px)             │
│  ┌─────────────────┐      ┌──────────────────────────────┐      │
│  │     Col 1       │      │       Col 1      │   Col 2   │      │
│  │     (100%)      │      │       (50%)      │   (50%)   │      │
│  └─────────────────┘      └──────────────────────────────┘      │
│                                                                 │
│  DESKTOP (≥ 1024px)                                            │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Col 1  │  Col 2  │  Col 3  │  Col 4  │  Col 5  │     │
│  │  (20%)  │  (20%)  │  (20%)  │  (20%)  │  (20%)  │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                 │
│  GUTTER (gap)                                                   │
│  Mobile: gap-4 (16px)                                           │
│  Desktop: gap-6 (24px)                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Hierarquia Visual de Página

```
┌─────────────────────────────────────────────────────────────────┐
│                     PAGE STRUCTURE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─ PAGE HEADER ─────────────────────────────────────────────┐  │
│  │  h1: text-3xl font-bold                                  │  │
│  │  p: text-muted-foreground text-base                      │  │
│  │  mb-8 (margin-bottom: 2rem)                             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ SECTION ─────────────────────────────────────────────────┐  │
│  │  Card ou Container com border                            │  │
│  │  mb-6 ou mb-8                                           │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ COMPONENT GROUP ────────────────────────────────────────┐  │
│  │  space-y-4 (gap: 1rem)                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
│  ┌─ FEEDBACK STATES ────────────────────────────────────────┐  │
│  │  Loading: centered spinner + text                        │  │
│  │  Empty: icon + message + CTA                            │  │
│  │  Error: alert icon + message + retry button             │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Componentes UI

### 6.1 Componentes shadcn/ui

#### Componentes Base (Instalados)
```
✅ Button          ✅ Card           ✅ Input
✅ Label           ✅ Slider         ✅ Tabs
✅ DropdownMenu    ✅ Separator
```

#### Componentes Recomendados (A Instalar)
```
📋 Badge           ← Labels, status, counters
👤 Avatar         ← Imagens de perfil
📋 Dialog          ← Modais, confirmações
🔔 Toast           ← Notificações
📋 Sheet           ← Sidebars mobile
📋 Command         ← Busca com comandos
🔲 Tooltip         ← Dicas ao hover
```

### 6.2 Estrutura de Componentes

```
src/components/
├── ui/                          # shadcn/ui (NÃO MODIFICAR DIRETAMENTE)
│   ├── button.tsx
│   ├── card.tsx
│   ├── badge.tsx               # ← A INSTALAR
│   ├── avatar.tsx              # ← A INSTALAR
│   └── ...
│
├── layout/                      # Componentes de layout
│   ├── Header.tsx
│   ├── Footer.tsx
│   └── Sidebar.tsx
│
├── features/                    # Componentes de domínio
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   ├── playlist/
│   │   ├── PlaylistTable.tsx
│   │   └── SongRequestForm.tsx
│   └── player/
│       ├── YouTubePlayer.tsx
│       └── NowPlaying.tsx
│
└── shared/                      # Componentes compartilhados
    ├── ThemeToggle.tsx          # ← NOVO
    ├── LoadingSpinner.tsx
    └── EmptyState.tsx
```

### 6.3 Padrões de Uso

#### Button Variants
```tsx
// Ações primárias - variant="default"
<Button variant="default">Solicitar Música</Button>

// Ações destrutivas - variant="destructive"
<Button variant="destructive">Remover</Button>

// Ações secundárias - variant="outline"
<Button variant="outline">Cancelar</Button>

// Ações sutis - variant="ghost"
<Button variant="ghost">Ver Detalhes</Button>

// Links - variant="link"
<Button variant="link">Saiba Mais</Button>
```

#### Button Sizes
```tsx
<Button size="sm">Pequeno</Button>
<Button size="default">Padrão</Button>
<Button size="lg">Grande</Button>
<Button size="icon">🔍</Button>
```

#### Card Structure
```tsx
<Card>
  <CardHeader>
    <CardTitle>Título do Card</CardTitle>
    <CardDescription>Descrição opcional</CardDescription>
  </CardHeader>
  <CardContent>
    {/* Conteúdo */}
  </CardContent>
  <CardFooter>
    {/* Ações - opcional */}
  </CardFooter>
</Card>
```

### 6.4 Estados de UI

#### Loading State
```tsx
<div className="flex items-center justify-center py-12">
  <Loader2 className="h-6 w-6 animate-spin text-primary" />
  <span className="ml-2 text-muted-foreground">Carregando...</span>
</div>
```

#### Empty State
```tsx
<div className="text-center py-12">
  <Music className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
  <h3 className="text-lg font-semibold mb-2">Nenhuma música</h3>
  <p className="text-muted-foreground mb-4">
    Solicite músicas para adicionar à playlist
  </p>
  <Button>Solicitar Música</Button>
</div>
```

#### Error State
```tsx
<div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
  <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
  <p className="text-sm text-destructive flex-1">
    Erro ao carregar dados
  </p>
  <Button variant="outline" size="sm" onClick={onRetry}>
    Tentar novamente
  </Button>
</div>
```

---

## 7. Acessibilidade (WCAG AA)

### 7.1 Requisitos Obrigatórios

#### Contraste de Cores
```
Texto normal: mínimo 4.5:1
Texto grande (18pt+): mínimo 3:1
Componentes UI: mínimo 3:1
```

#### Focus Visible
```css
/* CSS base - TODOS os elementos interativos */
*:focus-visible {
  outline: 2px solid var(--ring);
  outline-offset: 2px;
}
```

#### Labels
```tsx
// TODOS os inputs DEVEM ter labels
<Label htmlFor="email">Email</Label>
<Input id="email" type="email" />

// Botões de ícone DEVEM ter aria-label
<Button variant="ghost" size="icon" aria-label="Fechar">
  <X className="h-4 w-4" />
</Button>
```

#### Skip Link
```tsx
// Primeira coisa no body
<a 
  href="#main-content"
  className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4"
>
  Pular para o conteúdo principal
</a>
```

### 7.2 Navegação por Teclado

| Tecla | Ação |
|-------|------|
| `Tab` | Avança para próximo elemento focável |
| `Shift + Tab` | Retrocede para elemento anterior |
| `Enter` | Ativa botão/link |
| `Space` | Ativa botões |
| `Escape` | Fecha modais, dropdowns, menus |
| `Arrow Down/Up` | Navega em menus, selects |

### 7.3 Testes de Acessibilidade

```bash
# Checklist antes de cada PR:
# 
# ☐ Contraste verificado (4.5:1 para texto)
# ☐ Navegação por teclado funciona
# ☐ Focus visible em todos elementos
# ☐ Labels em todos inputs
# ☐ aria-label em botões de ícone
# ☐ Skip link presente
# ☐ Error states com role="alert"
```

---

## 8. Performance

### 8.1 Imagens

```tsx
// Usar next/image sempre
import Image from 'next/image';

<Image
  src={thumbnail}
  alt={title}
  width={200}
  height={150}
  className="object-cover rounded-lg"
/>

// Para imagens externas, adicionar unoptimized
<Image
  src={externalUrl}
  alt={title}
  width={200}
  height={150}
  unoptimized  // Para YouTube thumbnails
/>
```

### 8.2 Lazy Loading

```tsx
// Componentes pesados
import { lazy, Suspense } from 'react';

const YouTubePlayer = lazy(() => import('@/components/player/YouTubePlayer'));

export function PlayerPage() {
  return (
    <Suspense fallback={<PlayerSkeleton />}>
      <YouTubePlayer videoId={videoId} />
    </Suspense>
  );
}
```

### 8.3 Fonts

```tsx
// globals.css - Font com display swap
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;  // Evita FOIT (Flash of Invisible Text)
  src: url('/fonts/inter.woff2') format('woff2');
}
```

---

## 9. Processos e Governança

### 9.1 Adicionando Componentes

```
┌─────────────────────────────────────────────────────────────────┐
│                   ADDING NEW COMPONENTS                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. VERIFICAR SHADCN/UI                                        │
│     npx shadcn@latest add badge                                 │
│     └── Se existir, usar com customização via CSS              │
│                                                                 │
│  2. CRIAR COMPONENTE CUSTOMIZADO                                │
│     src/components/features/[feature]/                          │
│     └── Se não existir no shadcn, criar em features/          │
│                                                                 │
│  3. DOCUMENTAR                                                 │
│     - Adicionar ao DESIGN.md                                    │
│     - Criar exemplo de uso                                     │
│     - Documentar props e variantes                              │
│                                                                 │
│  4. TESTAR                                                     │
│     - Light mode                                                │
│     - Dark mode                                                 │
│     - Acessibilidade                                           │
│     - Responsividade                                            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.2 Modificando Tokens

```
┌─────────────────────────────────────────────────────────────────┐
│                 MODIFYING DESIGN TOKENS                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. globals.css                                                 │
│     - Alterar valores das CSS variables                        │
│                                                                 │
│  2. tailwind.config.ts                                         │
│     - Atualizar extend.colors se necessário                    │
│                                                                 │
│  3. TESTAR                                                      │
│     - npm run dev                                               │
│     - Verificar light mode                                      │
│     - Verificar dark mode                                       │
│     - Verificar componentes afetados                           │
│                                                                 │
│  4. ATUALIZAR DESIGN.md                                         │
│     - Documentar nova cor/valor                                │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 9.3 Code Review Checklist

```markdown
## Design Review Checklist

### Estrutura
- [ ] Componente está na pasta correta (ui/ vs features/ vs shared/)
- [ ] Nomenclatura consistente (PascalCase)
- [ ] Props tipadas com TypeScript

### Acessibilidade
- [ ] Labels em inputs
- [ ] aria-label em botões de ícone
- [ ] Focus visible
- [ ] Contraste adequado

### Responsividade
- [ ] Mobile-first CSS
- [ ] Breakpoints corretos (sm, md, lg)
- [ ] Touch targets 44x44px mínimo

### Theming
- [ ] Usa CSS variables (não hardcoded colors)
- [ ] Funciona em light mode
- [ ] Funciona em dark mode

### Performance
- [ ] Images com next/image
- [ ] Lazy loading se necessário
- [ ] Sem console.log em produção
```

---

## 10. Referências

### Links Importantes
- [Tailwind CSS](https://tailwindcss.com/)
- [shadcn/ui](https://ui.shadcn.com/)
- [Radix UI](https://www.radix-ui.com/)
- [next-themes](https://github.com/pacocoursey/next-themes)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [Design Tokens](https://designtokens.org/)

### Ferramentas
- [Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Tailwind Typography](https://github.com/tailwindcss/typography)
- [Lucide Icons](https://lucide.dev/)

---

## Histórico de Versões

| Versão | Data | Descrição |
|--------|------|-----------|
| 1.0.0 | 21/03/2026 | Criação do Design System Agent |
