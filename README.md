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
3. (Opcional, para o seed de dev) `npm run seed`
4. `npm run dev`

> **Importante:** nunca commite o `.env.local` (está no `.gitignore`).

### Login OAuth (Google/GitHub)

Os botões de login OAuth dependem de provedores configurados **no projeto Supabase** (credenciais ficam no dashboard, não no `.env`):

1. **Google:** crie um OAuth Client ID em <https://console.cloud.google.com/apis/credentials> e adicione a origem de redirect `https://<ref>.supabase.co/auth/v1/callback`.
2. **GitHub:** crie uma OAuth App em <https://github.com/settings/developers> com a mesma URL de callback.
3. Em **Supabase → Authentication → Providers**, habilite Google e GitHub e cole os `Client ID`/`Secret` correspondentes.

Enquanto os providers não forem habilitados, o login funciona apenas pela seção "Acesso de desenvolvimento" (e-mail/senha, exibida somente em dev) usando os usuários criados pelo `npm run seed` (`dono@exemplo.com`, `ana@exemplo.com`, `bruno@exemplo.com`, senha `senha123`).

## Arquitetura

- **Controller:** app web no celular do host/participante — busca, fila, aprovações, controle de playback.
- **Player device:** rota pública `/player/[codigoDaSala]` para navegador em modo quiosque — exibe o player do YouTube e a fila em tempo real.
- **Realtime:** Supabase Realtime, canais escopados por sala (`room:{id}`).

### Credenciais de integração (dev)

O projeto usa dois planos de credencial no Google Cloud (projeto `karaoke-flow-509317`, YouTube Data API v3):

| Uso                                   | Tipo OAuth      | Credencial                                                                                                             | Onde fica                    |
| ------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| Busca de músicas (chave default)      | API key (pública) | `YOUTUBE_API_KEY` (só dev — **não vai para produção**, ver spec §12/§13)                                             | `.env.local` (valor não versionado) |
| Ferramentas dev / manifest pessoal    | **Desktop app** | Client ID `555657479128-nou62soqjjneto0as5fcivck7ijlkeg9.apps.googleusercontent.com` (público) — OAuth YouTube `readonly` | `.env.local` + JSON gitignored |
| OAuth por-host (Fase 4 — futuro)      | Web app         | *a criar no Google Cloud* (redirect `http://localhost:3000`); client antigo foi deletado                                 | —                            |

- **O Client ID é público** e pode aparecer neste README; o **Client Secret nunca** (apenas em `.env.local` e no JSON baixado em `credentials/`, ambos ignorados pelo git).
- JSON original do Google (Desktop): `credentials/oauth/oauth-dev-desktop.json` (fora do versionamento).

## Documentação

- `karaoke-watch-party-spec.md` — especificação técnica (decisões de arquitetura, segurança, UX, roadmap pós-MVP).
- `questionario-donos-estabelecimento.md` — questionário de validação (15 perguntas) para donos de estabelecimentos.
- `MANIFEST.md` — manifesto do produto (visão, princípios e a camada social futura).
- `karaoke-pesquisa-academica.md` — pesquisa acadêmica e de mercado que fundamenta o produto.
- `TODO.md` — plano de implementação por fases.
- `CHANGELOG.md` — histórico de mudanças por release.
- `docs/ciencia-de-dados/segmentacao-sentimental.md` — etapa futura de ciência de dados (segmentação sentimental do ouvinte; nasce neste repo, vira o repo independente `karaoke-flow-data`).

### Fluxos do MVP (`docs/flows`)

Diagramas em **Mermaid** (rendezam nativamente no GitHub, VS Code com a extensão "Mermaid Preview", ou em <https://mermaid.live> copiando/colando o trecho).

| Arquivo                                          | Conteúdo                                                                                                                                                                    |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`docs/flows/fluxos-do-sistema.md`](./docs/flows/fluxos-do-sistema.md) | Fluxos técnicos de ponta a ponta: autenticação/sessão, ciclo de vida da sala, fila (regras de banco), player/playback e a proposta de **trocar música mantendo a posição**. |
| [`docs/flows/fluxos-do-usuario.md`](./docs/flows/fluxos-do-usuario.md) | Jornadas por persona: host, participante e tela kiosk/player. Foco em UX (toques, telas, decisões).                                                                         |
| [`docs/flows/banco-de-dados.md`](./docs/flows/banco-de-dados.md)       | Modelo relacional (ERD), matriz de RLS, máquina de estados da fila e regras de `position`/status do banco.                                                                  |

**Convenções dos diagramas:** em `flowchart`, o **quadrado** é uma tela/ação, o **losango** uma decisão e o **verde** um fim de sucesso. Eventos de **Realtime** aparecem como `publica: room:{id}`. Regras validadas **no banco** (RLS/policies/triggers) são marcadas com `(backend)`. Itens `Em aberto` dependem de decisão de produto.

**Como manter:** todo diagrama reflete o **código real** (`supabase/migrations/*`, `src/proxy.ts`, helpers SSR) — se uma migration mudar, atualize o diagrama correspondente no mesmo PR. Fluxos de UI só aparecem depois que a tela existir (ou como proposta marcada com `Proposta`). _Versão da doc de fluxos: corresponde ao estado do MVP após a Fase 3 (Salas) — Fase 3.5 (bar/mesas/karaokês) em andamento; novas fases são adicionadas conforme implementadas._

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
