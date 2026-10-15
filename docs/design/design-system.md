# Design system e estilização (UI/UX)

> **Status:** em execução (2026-10-14). Direção aprovada pelo dono: **neon/festa**,
> dark-first. A Tela 1 (home) permanece **só estilo**, respeitando a spec §2.5.1
> (apenas dois botões + consentimento — sem hero/cards/copy de marketing).

Este documento é a **fonte única** do visual: tokens, tipografia, movimento, o
plano por fases e onde mexer por tela. Antes dele não havia nenhum guia de
design; os tokens viviam apenas em `src/app/globals.css`.

## 1. Princípios

1. **Dark-first, mobile-first** (spec §14): bar/balada, pouca luz, uso com uma mão.
2. **Cor é sinal, não enfeite:** o magenta marca a ação primária ("quero
   cantar", botões), o ciano marca estado vivo ("tocando", "próximo", ativo).
3. **Acessibilidade é requisito:** contraste AA no texto, `prefers-reduced-motion`
   respeitado, foco visível.
4. **Poucos tokens, um só lugar:** tudo deriva de `globals.css`; repintar o app é
   mexer num arquivo.
5. **Nada de novo elemento na Tela 1:** nela o neon entra por fundo, tipografia e
   estilo dos botões existentes.

## 2. Paleta (magenta de palco)

Valores em `oklch`. O `primary` é o **magenta**; `highlight` (novo) é o **ciano**
de destaque.

| Token                    | Claro                          | Escuro                         |
| ------------------------ | ------------------------------ | ------------------------------ |
| `--background`           | `oklch(1 0 0)`                 | `oklch(0.145 0.012 300)`       |
| `--foreground`           | `oklch(0.145 0 0)`             | `oklch(0.985 0 0)`             |
| `--card` / `--popover`   | `oklch(1 0 0)`                 | `oklch(0.19 0.015 300)`        |
| `--primary`              | `oklch(0.60 0.24 350)`         | `oklch(0.68 0.25 350)`         |
| `--primary-foreground`   | `oklch(0.14 0.02 350)`         | `oklch(0.15 0.02 350)`         |
| `--accent` (hover/superfície) | `oklch(0.96 0.02 350)`    | `oklch(0.30 0.05 330)`         |
| `--highlight`            | `oklch(0.62 0.12 200)`         | `oklch(0.80 0.14 200)`         |
| `--ring`                 | `oklch(0.60 0.24 350)`         | `oklch(0.70 0.22 345)`         |
| `--border`               | `oklch(0.9 0.01 350)`          | `oklch(1 0 0 / 12%)`           |
| `--success`              | `oklch(0.52 0.15 152)`         | `oklch(0.78 0.16 152)`         |
| `--warning`              | `oklch(0.55 0.13 70)`          | `oklch(0.82 0.15 78)`          |
| `--info`                 | `oklch(0.52 0.13 245)`         | `oklch(0.75 0.12 235)`         |
| `--chart-1..5`           | rampa neon (ciano→magenta→violeta→âmbar→verde) | idem |

**Tokens de status (cor é sinal):** `--success`/`--warning`/`--info` (com seus
`-foreground`) substituem as cores cruas (`emerald`/`amber`/`rose`/`blue`) que
sinalizavam estado. Cada um traz um `-foreground` escuro no tema escuro para uso
como **texto sobre** a própria cor/tint e leitura AA.

**Contraste:** o texto do botão (`--primary-foreground`) é **escuro** sobre o
magenta nos dois temas — é o que garante AA e dá o look neon. O `--foreground`
sobre `--background` mantém a razão atual (quase-preto/branco).

### 2.1 Contraste (WCAG 2.1 AA) — medido e testado

A razão de contraste é verificada automaticamente:
`src/lib/theme/contrast.ts` (conversão oklch→oklab→sRGB linear + fórmula WCAG) e
`src/lib/theme/contrast.test.ts` lê o bloco `.dark` de `globals.css` e afirma
`≥ 4.5:1`. Ratios medidos no tema escuro:

| Par | Ratio |
| --- | ----- |
| `foreground` / `background` | 18.98 |
| `muted-foreground` / `card` | 7.42 |
| `primary-foreground` / `primary` | 6.03 |
| `success` / `card` | 5.65 |
| `destructive/5` (tint) sobre `card` | 5.03 |
| `success/10` (tint) sobre `card` | 5.22 |
| `warning/10` (tint) sobre `card` | 5.37 |
| `info/10` (tint) sobre `card` | 4.85 |

Regra que saiu da auditoria: **texto colorido sobre o tint da própria cor**
(`text-primary` sobre `bg-primary/10`) fica abaixo de AA — os tints de fundo
caíram para `/5` (nav ativo, `badge`/`button` destructive, banners de erro).

## 3. Tipografia

- **Geist Sans** (corpo) + **Geist Mono** (código/valores), via `next/font`.
- **Correção de wiring:** o tema declarava `--font-sans: var(--font-sans)`
  (autorreferência), enquanto o layout expõe `--font-geist-sans` — a Geist Sans
  **não** estava sendo aplicada. Passa a `--font-sans: var(--font-geist-sans)`.
- `--font-heading` e `--font-display` apontam para `--font-sans`, deixando a
  porta aberta para trocar só o display no futuro (sem espalhar a mudança).
- Decisão do dono (2026-10-14): **não** adicionar fonte de display por ora.

## 4. Movimento e profundidade

- `--shadow-glow`: brilho do primário para foco/destaque (botão principal, card
  ao vivo). Substitui sombra preta por **luz**.
- `--ease-neon`: `cubic-bezier(0.2, 0.8, 0.2, 1)` para entradas e hovers.
- Durações por classe (`duration-150/200/420`); entradas discretas.
- Tudo sob `@media (prefers-reduced-motion: reduce)`.

## 5. Breakpoints e layout responsivo

O app é **mobile-first**; o desktop é secundário, mas **não pode ficar sem
navegação** (era o buraco: o `BottomNav` some em `md+`).

| Faixa                  | Largura     | Comportamento                                                                                                                                                     |
| ---------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Mobile** (base)      | `< 640px`   | Coluna única `max-w-md`; `BottomNav` fixo embaixo.                                                                                                                |
| **Tablet** (`sm`/`md`) | `640–1023px` | A partir de `768px` (`md`): largura sobe para `max-w-lg`, o `BottomNav` some e a navegação vai para o **topo** (`DesktopNav`); o `pb` do `main` encolhe (`pb-28` → `md:pb-10`). |
| **Desktop** (`lg`)     | `≥ 1024px`  | Mesma coluna `max-w-lg`; o glow da home é atenuado (`opacity: 0.6`).                                                                                              |

- **Fonte única da largura:** o utilitário **`kf-container`** (`globals.css`)
  define `max-width: 28rem` (mobile) → `32rem` (`md`) e o `padding-inline`. O
  `main` do shell, o `Header`, o `SiteFooter` e as páginas públicas (`/login`,
  `/sobre`) usam **a mesma classe** — nada de `max-w-*` divergente.
- **Navegação:** `BottomNav` é `md:hidden`; `DesktopNav` (`hidden md:flex`)
  **reusa `NAV_ITEMS`** (`app-nav.tsx`), então itens e item ativo têm uma só
  definição. O `Header` alinha logo/nav/ações com `kf-container`, na mesma
  largura do conteúdo.
- **Diálogos:** `DialogContent` agora usa **`sm:max-w-md`** como base (era
  `sm:max-w-sm`); o `qr-scanner` continua estreito (`sm:max-w-sm`) de propósito,
  e o consent da home segue em `max-w-md`.
- **Exceção — player/TV:** `/player/[codigo]` é `fixed inset-0`/`h-dvh` e **não**
  usa `kf-container` — tela cheia de propósito para leitura a 3 m (o
  `SiteFooter` documenta o motivo).
- **Safe areas:** `pt-safe`/`pb-safe`/`pl-safe`/`pr-safe` seguem cobertos —
  conferir em iOS com notch.
- **Movimento:** `prefers-reduced-motion` continua desligando `kf-rise`,
  `radius-sprite` e o glow.

### Checklist de verificação (DevTools)

iPhone SE (375), iPhone 14 Pro (393), iPad Air (820), 1366×768 e 1440×900 —
conferir a transição `sm`/`md`/`lg`, o `Header` alinhado ao conteúdo, a nav do
topo aparecendo em `md+`, safe areas e `prefers-reduced-motion`.

## 6. Plano por fases

| Fase | Escopo | Arquivos |
| ---- | ------ | -------- |
| 1 | Tokens de cor/fonte/glow/motion | `src/app/globals.css`, `src/app/layout.tsx` |
| 2 | Home: fundo neon, hierarquia dos 2 botões, consent via Radix, copy | `src/components/onboarding/onboarding.tsx`, `src/lib/i18n/dictionaries.ts` |
| 3 | Shell: logo, item ativo, rodapé | `src/components/shell/*` |
| 4 | Telas-chave + auditoria de contraste | `dashboard`, `entrar`, `salas/[codigo]`, `player` |
| 5 | **Responsividade:** `kf-container`, nav no topo (`md+`), diálogos, glow em `lg` | `globals.css`, `shell/*`, `ui/dialog.tsx`, `login`/`sobre` |
| 6 | Este documento + guia de personalização | `docs/design/design-system.md`, `README`/`CHANGELOG`/`TODO` |

**Verificação por fase:** `lint`, `typecheck`, `test`, `build`, `format:check`.

### 6.1 Execução (ordem A → C → B → D)

A Fase 4 foi executada em quatro passos, do token ao polimento:

- **A — tokens semânticos:** `success`/`warning`/`info` (§2); substituição das
  cores cruas em ~18 componentes.
- **C — contraste AA:** §2.1 + guarda automatizada (`contrast.test.ts`); tints
  de fundo corrigidos.
- **B — `<Skeleton>` nos `loading.tsx`:** `src/components/shared/loading-skeletons.tsx`
  + `loading.tsx` por segmento (grupo `(app)` como fallback, `dashboard`,
  `entrar`, `salas/[codigo]` e filhas, `bar/[codigo]`, `player/[codigo]`,
  `login`). Resolve o débito **M8** (`docs/engenharia/melhorias.md`).
- **D — estados e polimento:** `EmptyState` com duas variantes (§7), toaster
  sonner sem `richColors` (estados coloridos só no ícone, tokens semânticos),
  zinc→tokens no player/kiosk.

## 7. Estados de tela (vazio, carregando, feedback)

- **Vazio/aviso:** `src/components/shared/empty-state.tsx`. Variante
  `bordered` (caixa tracejada + ícone em selo + título + descrição + ação) para
  telas/estados de destaque; variante `quiet` (texto discreto centralizado)
  para seções internas (fila, listas). Antes havia três idiomas visuais
  conviventes.
- **Carregando:** `src/components/shared/loading-skeletons.tsx`
  (`SkeletonTitle`, `SkeletonCard`, `SkeletonList`, `ScreenSkeleton`) — server
  components usados por `loading.tsx`. Renderizam **dentro** do `<main>` do
  `AppShell`, sem repetir container/cabeçalho.
- **Feedback transitório:** toaster (`sonner`) em `ui/sonner.tsx`; a cor é sinal
  só no **ícone** (`[data-type="success|error|warning|info"]`), via tokens — sem
  `richColors`, para não despejar cor de fundo e manter o contraste.

## 8. Onde mexer por tela (guia de personalização manual)

| Quero mudar... | Vá em |
| -------------- | ----- |
| Cor de marca, tema claro/escuro, glow | `src/app/globals.css` (`:root` / `.dark`) |
| Fontes | `src/app/layout.tsx` (import) + `globals.css` (`--font-*`) |
| Tela inicial (botões, fundo, consentimento) | `src/components/onboarding/onboarding.tsx` + textos em `src/lib/i18n/dictionaries.ts` |
| Largura do conteúdo (mobile/desktop) | `globals.css` (`.kf-container`) |
| Cabeçalho / nome no topo | `src/components/shell/header.tsx` |
| Itens e ordem da navegação | `src/components/shell/app-nav.tsx` (`NAV_ITEMS`) |
| Navegação inferior (mobile) | `src/components/shell/bottom-nav.tsx` |
| Navegação do topo (tablet/desktop) | `src/components/shell/desktop-nav.tsx` |
| Rodapé | `src/components/shell/site-footer.tsx` |
| Estado vazio/aviso | `src/components/shared/empty-state.tsx` |
| Esqueletos de carregamento | `src/components/shared/loading-skeletons.tsx` + `loading.tsx` por rota |
| Toaster (feedback) | `src/components/ui/sonner.tsx` + `globals.css` (`.cn-toast`) |
| Ícones | `lucide-react` (usados direto nas telas) |

## 9. Restrições e riscos

- **Spec §2.5.1 (Tela 1):** só os dois botões + consentimento. Embelezar a home
  é permitido **apenas por estilo** (cor, tipografia, fundo, movimento) — nada
  de hero, cards ou copy de marketing; revisar a spec seria outra decisão.
- **Tokens são globais:** qualquer mudança de cor atinge todas as telas; por
  isso o passe é central (Fase 1) e a auditoria de contraste é a Fase 4.
- **Testes de UI:** `onboarding.test.tsx` afirma rótulos/`role` — manter os
  rótulos "Quero cantar"/"Sou dono" evita quebrar a suíte.
- **Copy de consentimento** segue marcada `[REVISAR]` (LGPD) em
  `dictionaries.ts`; falta validação jurídica.

## 10. Auditoria e padronização (varredura estática, 2026-10-14)

Varredura do `src/` contra os próprios tokens. O que está **consistente**:

- **Cores cruas: 0.** Nenhuma classe `*-{red|emerald|rose|amber|sky|zinc|…}-N`
  no `src/` — o passe de tokens (Fase A) fechou a dívida.
- **Valores arbitrários: 4, todos justificados** — `min-w-[96px]`
  (`ui/dropdown-menu.tsx`, largura mínima do Radix), `min-h-[70vh]`
  (`app/error.tsx` e `app/not-found.tsx`, centragem de tela) e
  `max-h-[65vh]` (`rooms/mesa-qr-dialog.tsx`, dialogo de QR). Nada de
  espaçamento/tipografia arbitrários.
- **Ritmo/tipografia/raio:** sem excessões fora dos primitivos — `gap`/`p` em
  escala (2,3,4,6,8), raio por token (`sm…4xl`), sombra só `shadow-glow`/`sm`.
- **Alvos de toque:** `Button` base `h-11` (44 px) e ícone `size-11`; `Input`
  `h-8` (32 px) ≥ 24 px do WCAG 2.2 AA (2.5.8).
- **Foco visível:** presente nos primitivos (`ui/*`) via `focus-visible:*`.

Dívidas **menores** anotadas (não bloqueiam):

- **Texto < 12px em 4 pontos** (`text-[10px]`/`text-[11px]`): rótulos do mapa
  (`bars/presence-radius-map.tsx:218`), selo/legenda das pulseiras
  (`rooms/pulseiras/pulseira-codes-card.tsx:143,160`) e o marcador de preço
  aplicado (`pulseira-prices-card.tsx:217`). Aceitável por serem legendas de
  contexto; revisar se virarem texto de leitura.
- **CTA primário como `<Link>` cru (4×)** com
  `bg-primary … rounded-xl px-6 py-3 text-sm font-semibold`
  (`salas/[codigo]/page.tsx:43,108`, `salas/[codigo]/buscar/page.tsx:58,102`).
  É o mesmo alvo de `<Button asChild size="lg">` — candidato a padronizar para
  herdar foco/estados e não divergir do `Button`.
- **Foco nos CTAs crus:** dependem do outline do navegador (os primitivos usam
  `focus-visible`). Resolver junto do item acima.

**Ferramentas de auditoria contínua:** skill `ux-ui-review`
(`.opencode/skills/ux-ui-review/SKILL.md`) + comando `/ux-audit`, com Playwright
MCP (free) para evidência visual e o gate de contraste do repo. Todas as
ferramentas recomendadas são **free tier** (Playwright/Apache-2.0, axe-core/
MPL-2.0, pour, Lighthouse CI). Não substituem a verificação humana de
WCAG — apenas a direcionam.
