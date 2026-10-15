# PLANO DE CORREÇÕES UX/UI — Auditoria 2026-10-15

**Base:** Relatório de auditoria UX/UI runtime (Playwright MCP + axe WCAG 2.2 AA) realizado em 15/10/2026.

**Objetivo:** Corrigir achados priorizados sem alterar escopo funcional. Validar com lint, typecheck, format:check e contraste.

**Status geral:** P0 e P1 **implementados e verificados**. P2 parcial (ver §3).

## 1. Críticos (P0) — concluído

### 1.1 Inputs sem rótulo (WCAG 1.3.1/3.3.2/4.1.2)
- [x] `src/components/rooms/settings/room-code-card.tsx` — `<Label htmlFor="room-code">` adicionado
- [x] `src/components/rooms/settings/mesas-bar-card.tsx` — `<Label htmlFor="bar-mesas">` adicionado

### 1.2 Overflow horizontal no dashboard (375px)
- [x] `src/components/bars/create-bar-dialog.tsx` — `cn("w-full", triggerClassName)` (override possível)
- [x] `src/app/(app)/dashboard/page.tsx` — `triggerClassName="w-auto"` no header
- [x] Mantido `w-full` no grid vazio (`GridDemoBar`)

**Verificado no browser:** `clientWidth 375 == scrollWidth 375` (antes 451); axe `/dashboard` @375 → **0 violações**; axe `/salas/KARAOKEDOZE/sala` → **0 violações** (antes: `label` crítico, 2 nodes).

## 2. Maiores (P1) — concluído

### 2.1 Interativos aninhados
- [x] `src/components/rooms/queue-list.tsx` — 2 pontos trocados por `Button asChild` + `Link`
- [x] Verificado: `document.querySelectorAll('a button, button a').length === 0` na fila

### 2.2 CTAs crus sem estados do DS
- [x] `src/app/(app)/salas/[codigo]/page.tsx` — 2 CTAs (`RoomClosedNotice`, "Entrar na sala")
- [x] `src/app/(app)/salas/[codigo]/buscar/page.tsx` — 2 CTAs (mesma causa-raiz, corrigidos juntos)

### 2.3 Contraste com `opacity-60` < 4.5:1 (AA)
- [x] `room-behavior-card.tsx` — removido `opacity-60` do wrapper; opacidade só no `Switch` (não-textual)
- [x] `pulseira-codes-card.tsx` — `opacity-60` → `border-dashed` (mantém `aria-disabled`)
- [x] `pulseira-prices-card.tsx` — idem

### 2.4 Acessibilidade estrutural
- [x] `src/components/shell/bottom-nav.tsx` — `aria-label="Navegação principal"`
- [x] `src/components/ui/card.tsx` — `CardTitle` ganhou `asChild` (Radix `Slot`) retrocompatível
- [x] `src/app/player/[codigo]/page.tsx` + `player-kiosk.tsx` — `<main>` + `<h1>`; `buscar` e `login` usam `CardTitle asChild` com `<h1>`

**Verificado no browser:** axe `/player/KARAOKEDOZE` → **0 violações** (antes 3 moderate), `main` presente, h1 "Karaokê ao vivo — sala KARAOKEDOZE"; axe `/salas/KARAOKEDOZE/buscar` → **0 violações** (antes `page-has-heading-one`).

### 2.5 Touch targets — parcial
- [x] Confirmado que `Button` default = `h-11` (44px) e `size="lg"` = `h-12`; CTAs migrados para `Button` ganharam 44px
- [ ] `Input` default `h-8` (32px) — **deferido**: mudar o primitivo afeta todos os formulários; requer varredura visual dedicada

## 3. Menores (P2) — parcial

- [x] `src/app/global-error.tsx` — botão cru → `<Button>` (default 44px)
- [ ] `presence-radius-map.tsx:184,186,194,196` — hex Leaflet → tokens: **deferido**. Leaflet (SVG) exige cor concreta em runtime; migrar para `getComputedStyle` adiciona complexidade desproporcional ao ganho. Registrado como dívida.
- [ ] Textos <12px (`pulseira-*`, `presence-radius-map`): **mantidos** como dívida aceita do design-system §10 (design compacto)

## 4. Validação (executada)

```bash
npm run lint          # 0
npm run typecheck     # 0
npm run format:check  # clean
npx vitest run src/lib/theme/contrast.test.ts   # 23/23
```

Axe (WCAG 2.2 AA) pós-correção: `/dashboard` (375), `/salas/KARAOKEDOZE/sala`, `/salas/KARAOKEDOZE`, `/salas/KARAOKEDOZE/buscar`, `/salas/KARAOKEDOZE/pulseiras`, `/player/KARAOKEDOZE` → **0 violações**.

## 5. Evidências

- Screenshots da auditoria: `docs/design/evidencias-auditoria-2026-10-15/` (`01-home-1440.png` … `10-sala-mobile-375.png`)
- Medições/axe via Playwright MCP (sessão 2026-10-15)
- Alterações em `src/**` listadas acima; `TODO.md` aponta para este plano

## 6. Dívidas residuais (próxima passada)

- `Input` `h-8` (32px) e demais alvos <44px (nav desktop, avatar, rodapé)
- Hex do Leaflet em `presence-radius-map.tsx`
- Textos <12px das telas compactas de pulseira/mapa
- Tokens semânticos de mapa (se o mapa ganhar variações de tema)
