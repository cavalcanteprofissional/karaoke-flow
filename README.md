# Karaokê Watch Party

Aplicação web **mobile-first** para karaokê ao vivo em ambientes com muitas pessoas (bares, restaurantes). O público adiciona músicas na fila pelo celular e a playlist é reproduzida em uma tela compartilhada (TV/projetor), controlada pelo dono da sala.

## Fluxo principal

1. Usuário faz login (Google/GitHub).
2. Cria uma sala (vira host) ou entra em uma existente via QR code/código.
3. Participantes buscam músicas no YouTube e adicionam à fila.
4. O host aprova entradas/músicas conforme a configuração da sala.
5. A tela da sala reproduz a fila em sequência; o host controla o playback pelo celular.

## Stack

- **Next.js 16** (App Router, TypeScript) — deploied na Vercel
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (free tier): Postgres, Auth (OAuth Google/GitHub), Realtime
- **YouTube Data API v3** (busca) + **YouTube IFrame Player API** (playback)
- **Zustand** (estado), **react-hook-form + zod** (forms/validação)

## Configuração local

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha as chaves:
   - `cp .env.example .env.local` (Windows: `copy .env.example .env.local`)
3. `npm run dev`

> **Importante:** nunca commite o `.env.local` (está no `.gitignore`).

## Arquitetura

- **Controller:** app web no celular do host/participante — busca, fila, aprovações, controle de playback.
- **Player device:** rota pública `/player/[codigoDaSala]` para navegador em modo quiosque — exibe o player do YouTube e a fila em tempo real.
- **Realtime:** Supabase Realtime, canais escopados por sala (`room:{id}`).

## Documentação

- `karaoke-watch-party-spec.md` — especificação técnica (decisões de arquitetura, segurança, UX).
- `karaoke-pesquisa-academica.md` — pesquisa acadêmica e de mercado que fundamenta o produto.
- `TODO.md` — plano de implementação por fases.
- `CHANGELOG.md` — histórico de mudanças por release.

## Testes

Estratégia completa, boas práticas e checklist funcional em [`TESTING.md`](./TESTING.md).

- **Unitário / Integração:** Vitest + React Testing Library.
- **Mock de redes:** MSW (Mock Service Worker) — serviços externos (YouTube, Supabase) nunca são chamados em teste.
- **E2E:** Playwright (navegador real, com YouTube IFrame Player API mockada).
- **Status:** stack definida; a instalação e configuração das ferramentas acontece nas próximas fases, junto do código que testam.

## Versionamento

O projeto segue [Versionamento Semântico](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`).

- **Versão atual:** `0.1.0` (em desenvolvimento — ainda sem release publicado).
- Todo o histórico de mudanças está registrado em [`CHANGELOG.md`](./CHANGELOG.md).
- Cada release deve receber uma tag git no padrão `v<versão>` (ex.: `v0.1.0`) e uma entrada correspondente no changelog.
