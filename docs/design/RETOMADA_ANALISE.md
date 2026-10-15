# Retomada — análise de breakpoints e viewports

**Data do checkpoint:** 2026-10-14
**Commit-base:** `89dcb86` — docs(design): adiciona design system e plano de estilizacao neon
**Direção aplicada:** neon/festa (magenta de palco + ciano), dark-first, home só estilo, consent Radix.

## Status: ✅ responsividade aplicada (2026-10-14)

A análise pedida abaixo foi feita e **executada**. O registro canônico passou
para a seção **"5. Breakpoints e layout responsivo"** em
[`design-system.md`](./design-system.md). Este arquivo fica como histórico do
checkpoint.

### Decisões tomadas

- **Navegação no topo (`md+`)**: o `BottomNav` é `md:hidden` e **nada o
  substituía** — no desktop o app ficava sem navegação. Novo `DesktopNav`
  (`hidden md:flex`) reusando `NAV_ITEMS`.
- **Alargamento moderado**: `max-w-md` → `md:max-w-lg`, via utilitário
  `kf-container` (fonte única para shell, header, rodapé e páginas públicas).

### O que foi feito

- `globals.css`: utilitário `.kf-container` + glow da home atenuado em `lg`.
- `shell/`: `DesktopNav` novo; `Header` alinhado com `kf-container` e prop
  `nav`; `AppShell` com `headerNav` e `main` responsivo (`pb-28` → `md:pb-10`).
- `ui/dialog.tsx`: base `sm:max-w-sm` → `sm:max-w-md`; overrides redundantes
  removidos (`qr-scanner` segue estreito).
- Páginas públicas (`/login`, `/sobre`) e `SiteFooter` com `kf-container`.
- Home: bloco de botões `max-w-sm` → `md:max-w-md`.
- Teste `desktop-nav.test.tsx` (3 casos). Suíte **818 → 821**.

### Ainda em aberto (não desta rodada)

- ~~**Fase 4 do design system:** estilização das telas-chave (`dashboard`,
  `entrar`, `salas/[codigo]`, `player`) + auditoria de contraste AA.~~
  **Entregue em 2026-10-14** (ordem A→C→B→D): tokens de status, contraste AA
  testado, `loading.tsx`/skeletons, `EmptyState` unificado e toaster. Ver a
  seção **6.1** e a **§7** do [`design-system.md`](./design-system.md).
- Verificação visual manual no DevTools (iPhone SE, iPad Air, 1366×768,
  1440×900) e em iOS com notch.

## Como retomar

1. Abrir o [`design-system.md`](./design-system.md) §5.
2. Fazer a análise visual em DevTools (device toolbar) com os viewports acima.
3. Anotar mudanças desejadas (arquivo + classe + motivo) na Fase 4.
4. Aplicar em pequenos commits, rodar gates (`lint/typecheck/test/build/format:check/scan:secrets`).
