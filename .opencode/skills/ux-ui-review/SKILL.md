---
name: ux-ui-review
description: Use when reviewing UX/UI, design-system adherence, accessibility (WCAG 2.2 AA), contrast, responsiveness, or screen states (empty/loading/error/toast) of the karaoke-flow frontend. Triggers — design review, auditoria de design, ux, ui, acessibilidade, a11y, contraste, responsivo, mobile, skeleton, empty state, loading, toast, screenshot, Playwright, design tokens, design system.
license: MIT
---

# UX/UI review — karaoke-flow

Revisão de interface **baseada em evidência** para o karaoke-flow. A meta não é
"achar problema no código", é **ver a tela real** quando possível e reportar
achados verificáveis com correção concreta. Ferramentas **sempre free tier**.

## Fonte única (leia antes de revisar)

- `docs/design/design-system.md` — tokens, tipografia, movimento, breakpoints,
  estados, fases. **É a fonte única do visual.**
- `src/app/globals.css` — os tokens de verdade (`:root` e `.dark`),
  `.kf-container`, `.kf-home-glow`, `--shadow-glow`, `--ease-neon`.
- `src/lib/theme/contrast.ts` + `contrast.test.ts` — contraste AA dos tokens
  (oklch→sRGB, WCAG 2.1). Rode o teste, não recalcule à mão.
- `src/components/shared/{empty-state,loading-skeletons}.tsx` — os estados
  canônicos. Tela nova deve **reusar**, não reinventar.
- `TESTING.md` — pirâmide de testes e o que depende de Playwright.

## Regras de ouro do projeto (não viole)

1. **Dark-first.** Só o tema escuro importa; o claro existe por segurança.
2. **Cor é sinal, não enfeite.** Estado → token semântico
   (`primary`/`highlight`/`success`/`warning`/`info`/`destructive`). **Zero**
   cor crua (`emerald`/`amber`/`rose`/`blue`/`zinc`/…) — hoje há 0 no `src/`.
3. **Nada de elemento novo na Tela 1 (home)** — spec §2.5.1: só estilo, sem
   hero/cards/copy de marketing.
4. **Mobile-first.** Largura única em `.kf-container` (28rem → 32rem em `md`).
   Não use `max-w-*` divergente.
5. **Player/TV é exceção:** `/player/[codigo]` é `fixed inset-0`/`h-dvh`,
   `dark` fixo, leitura a 3 m. Não aplicar `kf-container` nele.
6. **Acessibilidade é requisito:** AA no texto, foco visível,
   `prefers-reduced-motion` respeitado.

## Ferramentas (todas gratuitas / open source)

| Ferramenta | Licença | Papel |
| --- | --- | --- |
| **Playwright** + `@playwright/mcp` | Apache-2.0 | Browser real: screenshots, árvore de acessibilidade, computed styles |
| **axe-core** (`@axe-core/playwright`) | MPL-2.0 | Varredura WCAG 2.2 automática |
| **pour** (CLI / MCP / extensão) | OSS | Auditoria a11y em headless Chrome + 55+ simulações visuais |
| **Lighthouse CI** | Apache-2.0 | Performance/a11y/SEO/boas práticas |
| **Accessibility Insights for Web** | MIT | Verificação manual guiada WCAG 2.2 |
| **`contrast.test.ts`** (no repo) | interno | Contraste dos tokens como gate de CI |

O MCP do Playwright já está habilitado em `opencode.json`. Se ele **não**
estiver disponível na sessão, faça o passe **estático** (passo 1–2) e diga
claramente que a evidência visual ficou pendente — não invente achados de pixel.

## Fluxo

### 0. Escopo
Confirme a rota/arquivo. Rode o app local se for usar browser:
`npm run dev` (dados via `npm run seed`; Supabase local).

### 1. Passe estático (sempre)
- Cores cruas: `rg "(bg|text|border|ring)-(red|green|blue|amber|emerald|rose|zinc|slate|gray|orange|yellow|teal|cyan|indigo|violet|purple|fuchsia|pink|lime|sky)-[0-9]" src` → deve ser **0**.
- Valores arbitrários Tailwind: `-[a-z]*\[[0-9]` (aceitável só com justificativa).
- Estados: telas com lista/fila/dashboard usam `EmptyState`? rotas usam
  `loading.tsx`? erros têm boundary?
- Toque: alvos ≥ 44×44 px (`size-11`/`h-11`) para ações (WCAG 2.5.5).
- Foco: `focus-visible:*` presente nos interativos (o `Button` base já cobre).

### 2. Gates do repositório (sempre)
```
npm run lint && npm run typecheck && npm run format:check
npx vitest run src/lib/theme/contrast.test.ts
```
Qualquer regressão de token/contraste aparece aqui antes de qualquer olho.

### 3. Passe no browser (se o MCP Playwright estiver disponível)
Capture **evidência**, nesta ordem:
1. Navegue e estabilize (`networkidle`).
2. Screenshot em **3 viewports**: 1440×900, 768×1024, 375×812 — topo e
   página inteira.
3. **Árvore de acessibilidade** (o que o leitor de tela "vê").
4. **Computed styles** → diferencie contra os tokens de `globals.css` (drift =
   achado).
5. Cubra os **estados**: vazio, carregando, erro, sucesso, e mobile.

Ferramentas opcionais equivalentes: `npx pour <url>` (a11y em CI) ou
`npx design-auditor <url>` (score de design system).

### 4. Passe de acessibilidade
axe com `withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa'])`
e `violations` deve ser `[]`. Lembre: axe não cobre tudo — registre o que
exige julgamento humano (ordem de foco, rótulos, leitura).

## Rubrica (o que checar)

Combine os 10 heurísticos de Nielsen, WCAG 2.2 AA e os tokens do projeto:

- **Hierarquia/primeira impressão:** propósito da tela claro em 5 s; ação
  primária com maior peso e em `primary`.
- **Cor & contraste:** AA (4.5:1; 3:1 para texto grande). **Nunca** texto
  colorido sobre o tint da própria cor (foi o bug da Fase C: `text-primary`
  sobre `bg-primary/10` → usar `bg-primary/5`).
- **Ritmo & espaço:** escala consistente (múltiplos de 4/8); grupos próximos.
- **Tipografia:** hierarquia clara; corpo ≥ 14px (16px ideal); nada abaixo de 12px.
- **Estados:** hover/focus/active/disabled distintos; vazio/carregando/erro
  cobertos; cor nunca é o **único** sinal.
- **Responsivo:** sem overflow horizontal em 375; alvos ≥ 44px; nada cortado
  acima da dobra; `kf-container` respeitado.
- **Movimento:** sob `prefers-reduced-motion`; `--ease-neon` nas transições.
- **Consistência de design system:** raio/token/sombra iguais entre telas.

## Portão de evidência (obrigatório)

Todo achado precisa de **pelo menos um**:
- caminho de screenshot + viewport + seletor/DOM; **ou**
- `arquivo:linha` (achado puramente de código).

Sem isso, **não entra no relatório**. Severidade: **Crítico** (quebra/AA falha),
**Maior** (fricção/compreensão), **Menor** (cosmético).

## Formato do relatório (pt-BR, compacto)

```
## Resumo
<1–2 frases; o que foi exercitado; que ferramenta/evidência>

## Críticos
1. <título> — Por quê: <impacto>. Evidência: <arquivo:linha | screenshot@viewport>.
   Correção: <o quê, onde>.

## Maiores
...

## Menores
...

## Não verificado
<o que precisava de browser/manual e não foi possível>
```

## Anti-padrões a caçar

- Cor crua reintroduzida; `bg-primary/10` (ou `/20`) com `text-primary`.
- `max-w-*` solto em vez de `.kf-container`.
- Skeleton/`loading.tsx` que repete header/container do `AppShell`.
- `EmptyState` reinventado com `<p>` solto ou `Card` tracejado avulso.
- Toaster com `richColors` (o projeto sinaliza **só no ícone**, via tokens).
- Novo rótulo na home / elemento novo na Tela 1.
