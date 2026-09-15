# Changelog

Todas as mudanças notáveis deste projeto são documentadas aqui.

O formato segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/) e o projeto adere ao [Versionamento Semântico](https://semver.org/lang/pt-BR/).

**Versão atual:** `0.1.0` (em desenvolvimento — `main` ainda não recebeu tag de release).

## [Unreleased]

### Adicionado

- **Fase 0 — Fundação do projeto (rebuild a partir do zero):**
  - Scaffold do Next.js 16.3.5 (App Router, TypeScript, Tailwind v4, ESLint, Turbopack).
  - Inicialização do shadcn/ui (v4, style `radix-nova`) com componentes base: `button`, `input`, `card`, `dialog`, `sheet`, `tabs`, `slider`, `dropdown-menu`, `label`, `switch`, `badge`, `separator`, `scroll-area`, `sonner`, `skeleton`, `tooltip`.
  - Prettier configurado (`prettier-plugin-tailwindcss`) com scripts `format`/`format:check` e script `typecheck`.
  - Tema escuro por padrão via `next-themes` (`ThemeProvider` + `ThemeToggle`).
  - Layout raiz em `pt-BR` com providers globais (`ThemeProvider`, `TooltipProvider`, `Toaster`) e metadados do app.
  - Estrutura de pastas pronta (`src/app`, `src/components`, `src/lib`, `src/hooks`, `src/stores`, `src/types`).
  - Correção de segurança no `.env.example`/`.env.local`: remoção da chave pública do YouTube (`NEXT_PUBLIC_YOUTUBE_API_KEY`) — a chave agora existe apenas como `YOUTUBE_API_KEY` (server-side), alinhado à spec (seção 13).
  - Correção do `.gitignore` para não ignorar `next.config.ts`.

### Alterado

- **Plano de implementação (`TODO.md`) e spec (`karaoke-watch-party-spec.md`):**
  - Novo campo de configuração da sala `requireSongConfirmation` (toggle do host: "pedir confirmação antes de adicionar música"), que exibe um modal de confirmação (thumbnail + título + duração) para o próprio usuário antes de enviar a música à fila. Complementar ao `queueApprovalMode`, não substituto.

### Excluído

- Nada ainda.

### Corrigido

- Nada ainda.

### Segurança

- Chave do YouTube removida do bundle público (`NEXT_PUBLIC_YOUTUBE_API_KEY` não é mais definida).

### Testes

- `TESTING.md`: estratégia de testes do projeto — pirâmide unitário/integração/e2e, stack adotada (Vitest + React Testing Library, MSW para mock de redes, Playwright), boas práticas (testes determinísticos, MSW em vez de chamadas reais de API, isolamento da cota do YouTube), checklist funcional por fase (auth, salas, busca, fila com `requireSongConfirmation`, player, host, segurança/LGPD) e definição de pronto (DoD).
- Configuração das ferramentas de teste: **pendente** — será instalada nas próximas fases junto do código a testar (Vitest/RTL desde a Fase 3, Playwright na Fase 6+).

### Documentação

- README.md atualizado com seção de versionamento e tópico dedicado a Testes.

### Decisões de projeto

- Migrations do Supabase: padrão `supabase/migrations` via Supabase CLI.
- Chave YouTube por sala: modelo "API key do host + OAuth Google + fallback default" (alinhado à seção 12 da spec).
- Deploy Vercel: adiado para fim do MVP.
