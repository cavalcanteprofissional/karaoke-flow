# Análise de melhorias e débitos técnicos

> Revisão de arquitetura e maturidade de engenharia (2026-10-14). O objetivo é
> tornar o projeto **profissional e sustentável** sem reescrever o que já
> funciona. Cada achado é acionável e tem severidade, esforço e recomendação.
>
> Complementa [`arquitetura.md`](./arquitetura.md) e o
> [`CONTRIBUTING.md`](../../CONTRIBUTING.md). As decisões de produto pendentes
> continuam no [`roadmap-experiencia.md`](../produto/roadmap-experiencia.md).

## 1. Método

Foram revisados: configuração do projeto (`package.json`, `tsconfig`, `next.config`,
`eslint`, `prettier`, `vitest`), árvore de `src/`, `supabase/migrations/`,
`scripts/`, CI/infra, e a documentação existente. A referência de "estado
profissional" foi: *portões automáticos confiáveis, observabilidade, governança e
onboarding reproduzível*.

Legenda de severidade:

- **H (alta)** — risco de incidente, vazamento ou bloqueio de produção.
- **M (média)** — custo recorrente de manutenção ou lacuna de processo.
- **B (baixa)** — polimento / higiene.

## 2. Sumário executivo

O projeto tem um núcleo de engenharia **acima da média** para um MVP: domínio
puro testável, RLS auditada, smokes de banco, ADRs e documentação de fluxos.
O que falta é a camada de **operação e processo** que transforma "funciona
localmente" em "funciona e é observável em produção".

Os buracos mais caros, em ordem:

1. **Sem CI** — cada gate dependia de disciplina manual. _(endereçado neste passo)_
2. **Sem error boundaries nem error tracking** — uma exceção no client derruba a
   tela em branco, sem rastro. _(boundaries endereçados neste passo; tracking fica)_
3. **Sem hooks de pre-commit** — o gate roda tarde demais (no PR) ou nunca.
4. **Formatação não é gate** — 148 arquivos fora do Prettier; o `format:check`
   existe mas falha e ninguém vê.
5. **Rate limit em memória** — ineficaz no serverless (cada instância tem o seu).
6. **Sem automação de release** — versão presa em `0.1.0`, `CHANGELOG` manual.

## 3. Pontos fortes (não mexer sem motivo)

- Regra de negócio **pura e testada** (`src/lib/rooms/*`, `src/lib/bars/*`).
- **RLS como parede primária** + RPCs `security definer` + triggers
  bypass-proof, com auditoria e smoke dedicados.
- **~800 testes / 64 arquivos**, com duplos realistas (MSW, IFrame fake).
- **Smoke SQL por migration** — o contrato do banco é verificado, não presumido.
- **Documentação de decisão** (ADRs, `TODO.md`, `CHANGELOG.md`, post-mortems).
- **Consciência de custo** do free tier (footprint de realtime medido).

## 4. Achados priorizados

### Alta (H)

| ID | Área | Achado | Recomendação | Esforço |
| --- | --- | --- | --- | --- |
| H1 | Processo | Sem CI; gates manuais | `.github/workflows/ci.yml` com secrets/lint/typecheck/test/build | ✅ **feito neste passo** |
| H2 | Resiliência | Sem `error.tsx`/`global-error.tsx`/`not-found.tsx` | Boundaries do App Router com `retry()` e logging | ✅ **feito neste passo** |
| H3 | Observabilidade | Sem error tracking (exceções de produção invisíveis) | Sentry (ou equivalente) no server + client, com `digest` correlacionado | S |
| H4 | Segurança | Sem hook de pre-commit | `husky` + `lint-staged` rodando `scan:secrets --staged`, lint e format nos arquivos alterados | S |
| H5 | Segurança | Segredos dependem de disciplina | (mitigado por H1) rodar `scan:secrets --staged` no pre-commit + secret scanning do GitHub | ✅/S |

### Média (M)

| ID | Área | Achado | Recomendação | Esforço |
| --- | --- | --- | --- | --- |
| M1 | Formatação | `format:check` falha em **148 arquivos**; não é gate | Rodar `prettier --write` **em código** (não em `*.md`), commitar como `chore`, e então tornar o gate bloqueante | M |
| M2 | Segurança | `scan:secrets` vermelho por 7 fixtures falsas (treinava a ignorar o portão) | Allowlist por **marcador de valor falso** no próprio script | ✅ **feito neste passo** |
| M3 | Rate limit | `src/lib/youtube/rate-limit.ts` é in-memory (sem efeito entre lambdas) | Limite durável (Postgres/Upstash) ou aceitar e documentar o trade-off | M |
| M4 | Release | Sem automação; versão fixa em `0.1.0` | `changesets` ou `semantic-release` + tag; ligar versão ao `CHANGELOG` | M |
| M5 | Cobertura | `coverage` configurado sem threshold nem gate | Meta inicial realista (ex.: 70% em `src/lib/rooms`/`stores`) e `--coverage` no CI | S |
| M6 | Governança | Sem `CONTRIBUTING`, `SECURITY`, PR template, dependabot | ✅ docs adicionados neste passo; falta **dependabot** + branch protection | S |
| M7 | Testes E2E | Playwright adiado (por desenho) | Manter adiado, mas criar **um** smoke E2E do caminho crítico (entrar → pedir → tocar) quando a UX estabilizar | M |
| M8 | UX operacional | Sem `loading.tsx`/skeletons | Resolver na **fase de UX/UI** (não é débito técnico) | — |

### Baixa (B)

| ID | Área | Achado | Recomendação | Esforço |
| --- | --- | --- | --- | --- |
| B1 | Padrão | Sem `.editorconfig` | Adicionar (LF, 2 espaços, charset UTF-8) | XS |
| B2 | Runtime | Sem `engines`/`.nvmrc` | Fixar Node 24 para todos | XS |
| B3 | Tipos | `strict` mas sem `noUncheckedIndexedAccess`/`noUnusedLocals` | Habilitar de forma incremental (arquivo a arquivo) | M |
| B4 | Docs | Linha de "Estado atual" do README estava em Fase 18 | ✅ atualizada para Fase 19 neste passo | XS |
| B5 | Repo | Estrutura do histórico/público sem `CODE_OF_CONDUCT` | Opcional; `SECURITY.md` + `CONTRIBUTING.md` já cobrem o essencial | XS |

## 5. Backlog proposto — "Fase 20 · Fundação de produção"

Fase **não funcional**, antes de retomar o roadmap de produto, para que as fases
de UX/UI e produto tenham uma base observável e protegida.

- [ ] **H1 · CI** — workflow com `scan:secrets`, `lint`, `typecheck`, `test`,
      `build` (`format:check` não bloqueante até M1).
- [ ] **H2 · Error boundaries** — `error.tsx`, `global-error.tsx`,
      `not-found.tsx`, com botão "tentar de novo" (`retry()`).
- [ ] **M2 · `scan:secrets` verde** — allowlist por marcador; vira gate.
- [ ] **H4 · pre-commit** — `husky` + `lint-staged` (`scan:secrets --staged`,
      ESLint/Prettier nos arquivos alterados).
- [ ] **H3 · Observabilidade** — error tracking com correlação por `digest`.
- [ ] **M1 · Formatação** — `prettier --write` em código, depois gate bloqueante.
- [ ] **M5 · Cobertura** — threshold e `--coverage` no CI.
- [ ] **M6 · Governança** — `CONTRIBUTING`, `SECURITY`, PR template, dependabot,
      branch protection em `main`.
- [ ] **M4 · Release** — automação de versão/tag ligada ao `CHANGELOG`.
- [ ] **X · Higiene** — B1/B2 (`.editorconfig`, Node fixado).

> Depois da Fase 20: **UX/UI e estilização** (foco declarado pelo dono) e, na
> sequência, a próxima fase de produto (Fases 9–15 do roadmap).

## 6. Risco de segurança a registrar

- O **token do Supabase** (`sbp_…`) foi exposto em um canal de chat durante o
  desenvolvimento e **não foi rotacionado** por decisão do dono. Registrado aqui
  como débito: rotacionar em **Account ▸ Access Tokens** quando a conveniência
  permitir. Não está versionado (o `scan:secrets` cobre esse formato).
- O `SUPABASE_SERVICE_ROLE_KEY` e as chaves do YouTube são server-only; nunca
  expor no client nem em log (o `diagnostics.ts` já redige segredo em exceção).

## 7. Decisões de produto em aberto (bloqueiam fases)

Não são débitos técnicos, mas travam implementação — ver
[`roadmap-experiencia.md`](../produto/roadmap-experiencia.md) §"Ainda abertas":
**D6** (anonimato na mesa), **D7** (limite do teste grátis), **D8** (streak),
**D9** (`mesa_numero` desnormalizado), **D10** (recompensa), **D12** (pagamento),
**D13** (conteúdo), **D14** (teste grátis por bar × pessoa), **D15** (granularidade
da distância).
