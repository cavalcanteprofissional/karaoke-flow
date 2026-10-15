---
description: Auditoria de UX/UI (design system + acessibilidade AA + responsivo + estados) de uma tela ou rota
agent: build
---

Faça uma auditoria de UX/UI seguindo **exatamente** a skill `ux-ui-review`
(carregue-a com a ferramenta `skill` se ainda não estiver no contexto).

Alvo: `$ARGUMENTS`

Se o alvo estiver vazio, peça a rota/arquivo antes de começar.

Fluxo obrigatório:

1. Leia `docs/design/design-system.md` e os tokens em `src/app/globals.css`.
2. Passe estático (cores cruas, valores arbitrários, estados, alvos de toque).
3. Gates: `npm run lint`, `npm run typecheck`, `npm run format:check` e
   `npx vitest run src/lib/theme/contrast.test.ts`.
4. Passe no browser via Playwright MCP se estiver disponível (3 viewports +
   árvore de acessibilidade + computed styles). Se **não** estiver, diga isso
   em "Não verificado" — não invente achados de pixel.
5. Passe de acessibilidade (axe, tags WCAG 2.2 A/AA).

Reporte no formato da skill: Resumo, Críticos, Maiores, Menores, Não verificado.
Todo achado precisa de evidência (`arquivo:linha` ou screenshot@viewport).
Não edite código sem eu pedir; entregue o relatório primeiro.
