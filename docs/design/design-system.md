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
| `--chart-1..5`           | rampa neon (ciano→magenta→violeta→âmbar→verde) | idem |

**Contraste:** o texto do botão (`--primary-foreground`) é **escuro** sobre o
magenta nos dois temas — é o que garante AA e dá o look neon. O `--foreground`
sobre `--background` mantém a razão atual (quase-preto/branco).

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

## 5. Plano por fases

| Fase | Escopo | Arquivos |
| ---- | ------ | -------- |
| 1 | Tokens de cor/fonte/glow/motion | `src/app/globals.css`, `src/app/layout.tsx` |
| 2 | Home: fundo neon, hierarquia dos 2 botões, consent via Radix, copy | `src/components/onboarding/onboarding.tsx`, `src/lib/i18n/dictionaries.ts` |
| 3 | Shell: logo, item ativo, rodapé | `src/components/shell/*` |
| 4 | Telas-chave + auditoria de contraste | `dashboard`, `entrar`, `salas/[codigo]`, `player` |
| 5 | Este documento + guia de personalização | `docs/design/design-system.md`, `README`/`CHANGELOG`/`TODO` |

**Verificação por fase:** `lint`, `typecheck`, `test`, `build`, `format:check`.

## 6. Onde mexer por tela (guia de personalização manual)

| Quero mudar... | Vá em |
| -------------- | ----- |
| Cor de marca, tema claro/escuro, glow | `src/app/globals.css` (`:root` / `.dark`) |
| Fontes | `src/app/layout.tsx` (import) + `globals.css` (`--font-*`) |
| Tela inicial (botões, fundo, consentimento) | `src/components/onboarding/onboarding.tsx` + textos em `src/lib/i18n/dictionaries.ts` |
| Cabeçalho / nome no topo | `src/components/shell/header.tsx` |
| Navegação inferior | `src/components/shell/app-nav.tsx` / `bottom-nav.tsx` |
| Rodapé | `src/components/shell/site-footer.tsx` |
| Ícones | `lucide-react` (usados direto nas telas) |

## 7. Restrições e riscos

- **Spec §2.5.1 (Tela 1):** só os dois botões + consentimento. Embelezar a home
  é permitido **apenas por estilo** (cor, tipografia, fundo, movimento) — nada
  de hero, cards ou copy de marketing; revisar a spec seria outra decisão.
- **Tokens são globais:** qualquer mudança de cor atinge todas as telas; por
  isso o passe é central (Fase 1) e a auditoria de contraste é a Fase 4.
- **Testes de UI:** `onboarding.test.tsx` afirma rótulos/`role` — manter os
  rótulos "Quero cantar"/"Sou dono" evita quebrar a suíte.
- **Copy de consentimento** segue marcada `[REVISAR]` (LGPD) em
  `dictionaries.ts`; falta validação jurídica.
