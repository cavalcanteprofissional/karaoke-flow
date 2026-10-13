## O que muda

<!-- Descreva o problema e a solução. Se fecha uma issue, use "Closes #123". -->

## Como verificar

<!-- Passos de reprodução/validação. Se aplicável, cite o smoke SQL e o roteiro
     do TESTING.md (§). -->

## Tipo de mudança

- [ ] Correção de bug
- [ ] Nova funcionalidade
- [ ] Refatoração / dívida técnica
- [ ] Documentação
- [ ] Infra / CI

## Checklist

- [ ] Rodei `npm run scan:secrets`, `lint`, `typecheck`, `test` e `build`.
- [ ] Se mexi no banco: migration nova (nunca editei uma aplicada) **e** smoke
      SQL verde no Cloud.
- [ ] Se mexi em RLS/RPC/trigger: li
      [`docs/engenharia/auditoria-rls.md`](../docs/engenharia/auditoria-rls.md).
- [ ] Atualizei `CHANGELOG.md` (e `TODO.md`/docs quando fez sentido).
- [ ] Não versionei segredo nem link de TV com token.
- [ ] O rollout é compatível (banco antes do client, sem janela de quebra).
