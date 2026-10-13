# Contribuindo com o Karaokê Watch Party

Obrigado pelo interesse em contribuir. Este documento é o caminho curto para
colocar o projeto de pé, entender **como o time trabalha** e devolver uma
mudança que passa nos portões de qualidade.

Antes de qualquer coisa, leia também:

- [`README.md`](./README.md) — visão geral, stack, scripts e estado atual.
- [`docs/engenharia/arquitetura.md`](./docs/engenharia/arquitetura.md) — como as
  camadas se conectam (leia isto antes de mexer em banco/RLS/realtime).
- [`AGENTS.md`](./AGENTS.md) — regras para agentes automatizados (inclusive IA).

> **O projeto é escrito em português.** Código, comentários de domínio, mensagens
> de commit, PRs e docs seguem PT-BR. Termos técnicos consagrados (hook, commit,
> deploy) ficam em inglês.

## Código de conduta

Seja respeitoso e objetivo nas discussões. Comentários revisam **código**, não
pessoas. Discorde com dados: o repositório valoriza decisões registradas (ADRs,
`TODO.md`, `CHANGELOG.md`) mais do que opinião.

## Pré-requisitos

| Ferramenta | Versão | Observação |
| --- | --- | --- |
| Node.js | **24+** | `node -v`; o projeto foi desenvolvido no Node 24 |
| npm | 10+ | `npm ci` usa o `package-lock.json` |
| Git | atual | O repositório é versionado e o histórico é **público** |
| Conta Supabase | free tier | Cloud ou `supabase start` local |

## Setup local

1. **Clone e instale**
   ```bash
   git clone https://github.com/cavalcanteprofissional/karaoke-flow.git
   cd karaoke-flow
   npm ci
   ```

2. **Configure o ambiente**
   ```bash
   cp .env.example .env.local      # Windows: copy .env.example .env.local
   ```
   Preencha `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e
   `SUPABASE_SERVICE_ROLE_KEY`. Ajude o Supabase remoto:
   `SUPABASE_ACCESS_TOKEN` (Dashboard ▸ Account ▸ Access Tokens).

   > **Nunca** versione o `.env.local` nem segredos. O `.gitignore` já cobre,
   > mas o repositório é público — um segredo commitado está queimado.

3. **(Opcional) dados de desenvolvimento**
   ```bash
   npm run seed        # 4 usuários + Bar 1 (KARAOKEDOZE) + Bar 2 (BARDAESQUINA)
   ```
   ⚠️ O seed **apaga e recria** as salas de dev. Não rode contra dados reais.

4. **Suba o app**
   ```bash
   npm run dev
   ```

## Portões de qualidade (os "gates")

Todo commit precisa passar, no mínimo, por:

```bash
npm run lint          # ESLint (eslint-config-next)
npm run typecheck     # tsc --noEmit
npm test              # Vitest (unit + integração)
npm run build         # next build (produção)
npm run scan:secrets  # portão de segredo: falha se algo parecer credencial
```

O **CI** (`.github/workflows/ci.yml`) roda exatamente isso em cada push/PR. A
formatação (`npm run format:check`) roda como checagem **não bloqueante**
enquanto o repositório não estiver 100% formatado — ver
[`docs/engenharia/melhorias.md`](./docs/engenharia/melhorias.md).

### Estilo

- **Prettier** define a forma: `npm run format` (write) e `npm run format:check`.
  Config em `.prettierrc.json` (`printWidth: 90`, aspas duplas, ponto e vírgula).
  ⚠️ **Prettier `--write` em `*.md` pode reflowar `>` (blockquotes) e quebrar
  tabelas/blocos de doc.** Formate docs com o editor, não em massa.
- **ESLint** com `core-web-vitals` + regras TypeScript do Next.
- **TypeScript `strict`**. Não use `any` sem justificar; prefira tipos de domínio
  em `src/types/`.
- **Sem comentários de ruído.** Comente o **porquê** de decisões não óbvias
  (o projeto faz isso extensivamente); não descreva o óbvio.
- **Imports** usam o alias `@/*` → `./src/*`.
- Não introduza dependência nova sem necessidade demonstrada. O free tier e o
  bundle são restrições reais.

## Fluxo de trabalho

1. **Crie um branch** a partir de `main`:
   ```bash
   git switch -c feat/nome-curto          # feat | fix | docs | chore | refactor
   ```
2. **Faça commits pequenos e temáticos.** A convenção é
   [Conventional Commits](https://www.conventionalcommits.org/), em PT-BR,
   **sem acentos** na descrição (o histórico segue assim):
   ```
   feat(no-stop): rodizio por rodadas, teto por pessoa e item fixado
   fix(app): seis correcoes da validacao no aparelho
   docs: guia de contribuicao e analise de melhorias
   chore(ci): portoes de qualidade no GitHub Actions
   ```
   Escopos comuns: `app`, `rooms`, `bars`, `queue`, `player`, `realtime`,
   `youtube`, `pulseira`, `ci`, `docs`.
3. **Rode os gates** antes de abrir o PR.
4. **Abra o PR** preenchendo o template. Descreva o **problema**, a **solução** e
   **como você verificou**. Se mexeu em banco, diga qual migration e qual smoke.
5. **Aguarde a revisão.** O merge em `main` dispara o deploy automático na
   Vercel — por isso o PR é o lugar do cuidado, não o push direto.

## Migrations (regra de ouro)

O banco é o **backend de verdade** deste projeto: regras de negócio moram em
RLS, RPCs `security definer` e triggers. Meia-noite de SQL errado quebra o
produto inteiro — então:

- **Nunca rode `supabase db push`.** O padrão do time é aplicar migration
  manualmente, de propósito, com revisão:
  ```bash
  node scripts/apply-sql.mjs supabase/migrations/20261014000001_no_stop_modo.sql
  ```
  O script usa `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_ACCESS_TOKEN` do
  `.env.local` e aplica via **Management API no projeto remoto** (o mesmo projeto
  do `.env.local`), em transação implícita.
- **Nomeie por timestamp**: `YYYYMMDDHHMMSS_titulo_curto.sql`. Migrations são
  **imutáveis depois de aplicadas** — corrija com uma nova.
- **Toda migration que muda comportamento vem com um smoke SQL** em
  `scripts/smoke-*.sql`, rodado contra o Cloud antes do merge. O smoke é a rede
  de segurança que os testes unitários não alcançam:
  ```bash
  node scripts/apply-sql.mjs scripts/smoke-no-stop.sql 12000
  ```
  Sempre que possível, o smoke roda dentro de `begin`/`rollback` para **não
  sujar dados reais** (ver a lição em
  [`docs/engenharia/pos-mortem-smoke-playback.md`](./docs/engenharia/pos-mortem-smoke-playback.md)).
- **RLS/ACL**: leia primeiro
  [`docs/engenharia/auditoria-rls.md`](./docs/engenharia/auditoria-rls.md) e o
  [ADR-003](./docs/decisions/ADR-003-rls-as-primary-wall-plus-rpcs-security-definer.md).
  Nesta camada, `REVOKE` de coluna, `security definer` e `search_path` são
  armadilhas conhecidas.
- **Decisões não triviais viram ADR** em `docs/decisions/` (há template em
  [`docs/decisions/README.md`](./docs/decisions/README.md)).

## Testes

- **Unitário / integração**: Vitest + Testing Library + jsdom. Testes ficam
  **ao lado do código** (`*.test.ts` / `*.test.tsx`). Rode com `npm test` ou
  `npm run test:watch`.
- **Rede externa**: use **MSW**; serviços externos **nunca** são chamados em
  teste. O duplo do YouTube vive em `src/test/fake-youtube.ts`.
- **Cobertura**: `npm run test:coverage` (relatório em `coverage/`).
- **Banco/RLS**: a prova é **smoke SQL**, não unit. Veja a tabela de smokes no
  `README.md`.
- A estratégia completa e o checklist funcional por fase estão em
  [`TESTING.md`](./TESTING.md).

## Segredos

O repositório é **público** e o link da TV (`/player/<código>?token=…`) é uma
**credencial** — quem tem o link, lê a sala. Portanto:

- Nunca cole token de player, chave de API ou link de TV em código, issue, PR,
  print ou doc. Se vazar, use **"gerar novo link"** (`rotate_player_token`,
  host-only) e avise quem recebeu.
- `npm run scan:secrets` roda no CI e pode ser rodado em `--staged` antes do
  commit. Falsos positivos conhecidos (valores **obviamente** falsos em fixtures)
  têm allowlist no próprio script — ao adicionar um, prefira valores com marcador
  (`NAO-LOGAR`, `SMOKE`, `FAKE`) em vez de ampliar a allowlist de arquivo.
- A `YOUTUBE_API_KEY` é **server-only** e só alcançável por conta `dev`. Não a
  referencie no client nem com prefixo `NEXT_PUBLIC_`.

## Encontrou uma vulnerabilidade?

Não abra issue pública. Veja [`SECURITY.md`](./SECURITY.md).

## Documentação e decisões

Mudança relevante deve deixar rastro:

- `CHANGELOG.md` — entrada por fase, com data.
- `TODO.md` — plano faseado (marque o que fechou; registre o que abriu).
- `docs/flows/*` — fluxos técnicos/usuário/banco (Mermaid, refletem o código).
- `docs/engenharia/*` — post-mortems e playbooks.
- `docs/decisions/*` — ADRs.

## Deploy

- O deploy de **produção** é manual e exige confirmação do dono
  (`vercel deploy --prod`, aliased em `https://karaoke-flow.vercel.app`).
- **Migrations aplicam-se antes** do client que depende delas, sempre de forma
  compatível (ex.: manter a assinatura antiga de uma RPC viva como invólucro —
  ver a migration `20261014000001`). Rollback de banco não existe; a saída é uma
  migration nova.

## Versionamento e release

- Seguimos [SemVer](https://semver.org/lang/pt-BR/) (`MAJOR.MINOR.PATCH`).
- Para publicar uma versão: atualize `version` no `package.json`, adicione a
  entrada no `CHANGELOG.md` e crie a tag:
  ```bash
  git tag v0.2.0 && git push origin v0.2.0
  ```
- A tag dispara [`.github/workflows/release.yml`](./.github/workflows/release.yml),
  que cria o **GitHub Release** com as notas geradas automaticamente. Não é
  preciso rodar nada à mão.
