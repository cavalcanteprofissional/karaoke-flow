# PLANO DE CORREÇÕES UX/UI — Auditoria 2026-10-15

**Base:** Relatório de auditoria UX/UI runtime (Playwright MCP + axe WCAG 2.2 AA) realizado em 15/10/2026.

**Objetivo:** Corrigir achados priorizados sem alterar escopo funcional. Validar com lint, typecheck, format:check e contraste.

**Status geral:** P0 e P1 **implementados e verificados**. P2 parcial (ver §3). Deferidos que exigem olho humano/device estão consolidados em §7 (próxima fase).

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
- Verificação visual (fase da §9): `docs/design/evidencias-visual-2026-10-15/` — `audit-results.json` (axe/overflow/alvos), `inspect-results.json` e `inspect-light-results.json` (contraste/fontes/árvore, dark e light), `headings-after.json`, `nested-check.json` + screenshots 375/768/1440. **Local (gitignored)**: binários pesados e o JSON do player podia conter `?token=`.
- Medições/axe via Playwright MCP (sessão 2026-10-15)
- Alterações em `src/**` listadas acima; `TODO.md` aponta para este plano

## 6. Dívidas residuais (próxima passada)

- `Input` `h-8` (32px) e demais alvos <44px (nav desktop, avatar, rodapé)
- Hex do Leaflet em `presence-radius-map.tsx`
- Textos <12px das telas compactas de pulseira/mapa
- Tokens semânticos de mapa (se o mapa ganhar variações de tema)

## 7. Próxima fase — verificação visual e manual

Esta fase reúne o que **não** é capturável apenas por axe/estático: exige olho humano,
interação real e/ou device. **Fase parcialmente executada em 2026-10-15** — ver §9
para o relatório, os commits e o que ficou pendente de device.

### 7.1 Touch targets e ergonomia
- [ ] `Input` default `h-8` (32px): decidir elevar para `h-9`/`h-10` e varrer todos os formulários (código da sala, mesas, busca, pulseira, login). **Ainda aberto.**
- [x] Alvos standalone medidos em 3 viewports (375/768/1440): elevados para ≥24px em `BackLink`, "Voltar ao início" (`/bar`), "Voltar à sala" (`/buscar`), "Baixar QR", links do mapa (`6057f11`). Isentos mantidos com motivo documentado: `Switch` (alvo efetivo é o `Label htmlFor`), `Sobre` do rodapé (exceção `spacing`), atribuição Leaflet/OpenStreetMap/Google Cloud.
- [x] WCAG 2.5.8 (mínimo **24px**) verificado programaticamente: 0 alvos <24px não isentos nas 12 rotas em 3 viewports. Os <44px restantes são **AAA (2.5.5)**, fora do portão do projeto — toque real segue em §7.5.

### 7.2 Contraste e tema
- [x] `presence-radius-map.tsx` — nodes “incomplete” do axe: **0 incomplete e 0 violations** na re-execução das 12 rotas (`audit-results.json`). Contraste dos textos sobre o mapa medido = 0 abaixo do mínimo AA. O contraste **visual** do círculo/anel/marcador (não-textual) segue para device.
- [ ] Hex do Leaflet → tokens semânticos (avaliar `getComputedStyle` em runtime): **mantido como dívida** (§6).
- [x] Tema claro auditado: toggle aplicado (`html.light`), **axe=0** e **0 violações de contraste** nas 12 rotas (`inspect-light-results.json`).
- [x] Textos <12px: **aceitos formalmente** no design-system §10 (legendas de contexto em `pulseira-codes-card`, `pulseira-prices-card`, `presence-radius-map`); revisar se virarem texto de leitura.

### 7.3 Movimento, estados e mídia
- [x] `prefers-reduced-motion`: **0 elementos com `animation-name` ≠ none** na home/onboarding sob a media query. Animações do player seguem para device.
- [x] Skeletons: verificado em código que `loading.tsx` renderiza **dentro** do `<main>` do `AppShell` (sem header/`kf-container` duplicados). Flash/layout shift real segue para device.
- [ ] Estados vazios (`EmptyState`) e `error.tsx`/`global-error.tsx`: revisar no device. **Ainda aberto.**

### 7.4 Fluxos E2E manuais
- [ ] Entrada: login anônimo → código → mesa → fila.
- [ ] Aprovação de pedido pelo host (`entry-approval-wait` + `PendingEntries`).
- [ ] Troca de código da sala (`RoomCodeCard` → novo link/QR).
- [ ] Leitura de QR (mesa/pulseira/TV) em tela real.
- [ ] Entrada fora do raio do bar (espectador) e gate de presença.
- [ ] Player TV kiosk: autoplay, gate de som, reconexão.

### 7.5 Verificação em device
- [ ] DevTools mobile + iOS real (Safari) — citado em `TODO.md` (Fase 4 design) e ainda em aberto.

## 8. Registro de commits da auditoria (2026-10-15)

- `feat(design)` `5c28f47` — tokens de status, `EmptyState`, skeletons e navegação desktop.
- `docs` `e6f60a7` — reorganização de documentos + este plano + evidências.
- `fix(a11y)` `c915436` — correções da auditoria UX/UI (rótulos, overflow, contraste, navegação).
- `test(queue)` `1d653dc` — seletor do CTA de pedido (`role:button` → `role:link`).
- `fix(design)` `d1edb80` — rodapé sai de `<main>` vira `contentinfo` top-level; botão do gate do player não estoura em 375.
- `fix(a11y)` `6057f11` — alvos de toque standalone elevados para 24px (2.5.8).
- `fix(a11y)` `f097b44` — interativo aninhado removido no CTA de conectar YouTube.
- `fix(a11y)` `acfa5c6` — `CardTitle` vira `h2`; ações/notas saem do nome do heading.

## 9. Relatório da verificação visual (2026-10-15)

### Resumo
12 rotas (home, login, sobre, dashboard, entrar, sala, buscar, sala-config, player-config, pulseiras, bar, player-TV) verificadas em **375/768/1440** com Playwright headless: screenshots (viewport + full), axe WCAG 2.2 AA, overflow horizontal, alvos <24px, contraste renderizado, fontes <12px, árvore de acessibilidade, pirâmide de headings, interativos aninhados, ids duplicados, `alt`, tema claro e `prefers-reduced-motion`. Evidências locais em `docs/design/evidencias-visual-2026-10-15/` (gitignored: binários pesados e JSON com `?token=`).

### Críticos
Nenhum novo. `axe = 0` e `overflow = 0` em todas as rotas/viewports, antes e depois das correções.

### Maiores (corrigidos)
1. **Interativo aninhado no CTA "Conectar conta do YouTube"** (`youtube-settings-card.tsx`) — `<a href>` envolvendo `<button>`; axe não sinalizou. Virou `Button asChild` + `Link`; o `Label htmlFor` do bloco apontava para esse link e virou `role="group"` + `aria-labelledby`. Verificado: 0 aninhados nas 12 rotas.
2. **Pirâmide de headings chapada** — títulos de card eram `<div data-slot="card-title">`; leitor de tela navegava só pelo `h1`. `CardTitle` agora é `h2` por padrão (Preflight torna a mudança visual nula): 18 títulos em 6 telas viraram seção navegável. Resultado: h1+h2 nas 12 rotas, 0 pulos de nível.
3. **Nomes acessíveis concatenando ação/nota no heading** — "Fila de músicasPedir música" (ação dentro do `CardTitle` → movida para o slot `CardAction`, que já existia no design system) e "Quem está na salaatualiza sozinho" (nota com `ml-auto` → wrapper flex). h1 de `/buscar` lia "KARAOKEDOZEhost aprova" → espaço antes do `Badge`.

### Menores (corrigidos)
4. **Alvos de toque <24px** — "Voltar à sala" (20px), "Voltar ao início", "Baixar QR", "Abrir no Google Maps"/"OpenStreetMap" → ≥24px via `py-1` removido. Isentos documentados (switch, rodapé `Sobre`, atribuições).

### Menores (mantidos como dívida — §6/design-system §10)
5. Hex do Leaflet em `presence-radius-map.tsx`; textos <12px das telas compactas; `Input` `h-8` (32px).

### Segurança
6. **Link do player com `?token=` real** apareceu na árvore de acessibilidade de telas com o botão "Abrir player na TV" e foi gravado em `inspect-light-results.json`. **Token rotacionado via UI** (antigo passa a servir "Player não autorizado"; novo abre o player ao vivo), JSON **sanitizado** (`REDACTED-TOKEN`) e pasta de evidências **gitignored**.

### Não verificado (exige device/humano)
- Toque real (24px medido programaticamente, não com dedo), flash/layout shift dos skeletons, estados vazios/erro na tela, player TV (autoplay, gate de som, reconexão), leitura de QR, entrada fora do raio, e os fluxos E2E manuais da §7.4.
- `fix(a11y)` `c915436` — P0/P1/P2 da auditoria UX/UI.
- `chore(tooling)` `0b12e1a` — opencode (MCP/skill/comando) + `.gitignore`.

Sem push; `main` à frente de `origin/main`.
