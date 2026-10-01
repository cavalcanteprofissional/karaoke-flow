# Segurança: assinatura de commits GPG — diagnóstico, o que já foi feito e o que falta

> **Por que este documento existe:** em 2026-09-28 investigatei por que os commits
> apareciam como **Unverified** no GitHub quando antes estavam **Verified**. A causa
> não foi config quebrada: foram 11 commits criados numa janela de 2h11m com a
> assinatura burlada, e nada no setup impedia isso de acontecer de novo em silêncio.
> Este doc registra o diagnóstico, a correção já aplicada (fases 1–3) e o plano
> restante (fase 4) para eu retomar depois de um reinício do PC sem reconstruir o
> contexto.
>
> **Escopo:** apesar de morar neste repositório, quase tudo aqui é de escopo
> **global** — um hook em `~/.githooks` e uma ruleset em **41 repos** da conta
> `cavalcanteprofissional`. Este repo é só o registro. Ver §7 para mover o doc.

---

## 1. Resumo

| Item | Estado |
| --- | --- |
| Chave GPG na conta GitHub | OK — `2ED9BC95BC8746A1`, email verificado, vence 2028-08-22 |
| `commit.gpgsign` no `~/.gitconfig` | OK — `true` (sempre esteve) |
| Commits novos | OK — assinados e `verified=true` no GitHub |
| Commits de 2026-09-25 14:55–17:06 | **11 sem assinatura, sem correção** (decisão conscious) |
| Proteção contra regressão | **parcial** — hook `pre-commit` + ruleset na branch default |
| Backup da chave privada | **AUSENTE** — maior risco em aberto |
| Branches não-default | **sem proteção** — pendente (fase 4a) |

---

## 2. Diagnóstico

A assinatura **nunca deixou de estar configurada**. O que existia era um buraco
pontual.

**Evidência** — `git log --format='%G?'` na branch default do `karaoke-flow`:

```
63e6341 N 2026-09-25 17:06   docs: fecha D1–D4 no plano…
3bae0f1 N 2026-09-25 16:56   docs: registra as Fases 9–15…
…  (mais 9, todos em 2026-09-25)
0cd5b86 G 2026-09-25 02:29   feat: código de sala configurável…
1ce0da8 G 2026-09-26 19:09   feat: raio de presença configurável…
```

`N` = commit sem assinatura nenhuma (não apenas assinatura inválida). A janela
é **`f8c06b9` (25/09 14:55:55) → `63e6341` (25/09 17:06:48)**, 11 commits. O
commit imediatamente anterior e todos os posteriores estão `G`.

Confirmação de que a chave está sadia: `git cat-file commit` mostra header
`gpgsig` nos commits bons e nenhum nos ruins, e a API do GitHub responde
`verified=true, reason=valid` para os assinados.

**Conclusão:** em algum momento daquela janela o signing foi deliberadamente
desligado no comando (`--no-gpg-sign` / `-n` / `-c commit.gpgsign=false`) —
provavelmente por um agente de código ou hook de commit. Não dá para determinar
o agente exato a partir do git. **O ponto de falha é não existir nada que
impedisse isso.**

### Falso alarme que vale registrar

`labgas-manager` tem 1 commit com `%G? = E` (não verificável), chave
`B5690EEEBB952194`, que **não** está no meu keyring nem na conta. Suspeitei de
chave perdida. Não é:

```
$ git cat-file commit 770e0f0
committer GitHub <noreply@github.com> 1777400706 -0300
gpgsig -----BEGIN PGP SIGNATURE-----
```

É merge criado pela **UI do GitHub**, assinado pela chave `web-flow` do GitHub
(RSA2048, 2017-08-16). O GitHub reporta `verified=true, reason=valid`.
**Não é chave minha e não há nada a recuperar.** Anotei porque `%G? = E`
continua aparecendo e vai confundir uma auditoria futura.

---

## 3. Fase 1 — push dos commits pendidos (FEITA)

`main` estava 7 commits à frente de `origin/main`, todos já assinados
(`%G? = G`). Push feito, GitHub confirma `verified=true / reason=valid` nos 7.

---

## 4. Fase 2 — prevenção, camada local e global (FEITA)

### 4.1 `gpg.format` fixado (FEITO)

```
git config --global gpg.format openpgp
```

Estava implícito (default). Fixar evita que mudança de versão ou de resolução de
config faça o git escolher backend `ssh` e quebrar a assinatura calada.

### 4.2 Hook `pre-commit` global (FEITO)

`C:\Users\muito\.githooks\pre-commit`, ativado por
`git config --global core.hooksPath C:/Users/muito/.githooks`.
Vale para **todos os repos da máquina** (não existe outro override local —
verificado nos repos clonados).

Aborta o commit se:
- `commit.gpgsign != true`
- `user.signingkey` vazio
- `gpg.program` configurado não existe no PATH/disco
- a chave não está no keyring (`gpg --list-secret-keys`)
- `gpg.format` é `ssh` → nesse caso só checa `user.signingkey` e libera

Escape: `SKIP_GPG_CHECK=1 git commit ...`

**Testado:** com `commit.gpgsign=false` → aborta com
`COMMIT BLOQUEADO — assinatura ausente ou quebrada`; com chave inexistente →
aborta em `chave assinatura ausente no keyring`; escape hatch → passa. Testado
também em `labgas-manager` (prova que é global, não local). Nenhum commit de
teste sobrou.

### 4.3 Ruleset "require signed commits" (FEITA, com correção)

Ruleset `signed-commits` criada em `karaoke-flow/main`, depois replicada nos
outros repos (fase 3).

**A armadilha que quase anulou tudo:** a primeira versão usava
`bypass_actors: [{RepositoryRole admin, bypass_mode: "always"}]`, com o
rational de "não me trancar se o gpg quebrar". **Eu sou o admin de todos esses
repos, então o bypass me deixava burlar a própria regra.** Descobri testando de
verdade, não lendo doc: subi um commit sem assinatura e o GitHub imprimiu o
aviso e **aceitou o push** (`verified=false` no remoto). O commit de teste foi
removido com force-push e o repo voltou ao estado anterior.

Correção: `bypass_mode: "pull_request"`. Semântica atual
(`current_user_can_bypass: "pull_requests_only"`):

- push direto na default **sempre** exige assinatura
- o escape hatch passou a ser abrir um PR

Retesteado depois da correção: `! [remote rejected] main -> main (push declined
due to repository rule violations)`. Os dois commits de teste do ensaio foram
apagados; `labgas-manager` está em `f0ee4af` e a árvore local limpa.

---

## 5. Fase 3 — replicação (FEITA)

- **41/41 repos** próprios (não-fork) com ruleset `signed-commits`
- IDs de `24096460` a `24096544`
- `enforcement: active`, regra única `required_signatures`
- `ref_name.include: ["~DEFAULT_BRANCH"]` — alias dinâmico, acompanha se o
  repo trocar `main` por `master`. Usei alias em vez do nome fixo de propósito.
- 0 falhas

Estado atual do tip da branch default: **5/41 assinados**, 36 sem assinatura.
Os 36 são história anterior à ruleset — não é bug, e o próximo push em cada um
já sai assinado. Reescrever isso seria 36 rewrites; decisão já tomada de não
reescrever histórico.

**Armadilha de verificação:** `GET /repos/{o}/{r}/rulesets` (endpoint de lista)
retorna um **resumo sem `bypass_actors` e sem `conditions`**. Validar por ele dá
falso negativo. Usar `GET /repos/{o}/{r}/rulesets/{id}` (individual).

---

## 6. Fase 4 — pendente

### 6.1 `4a` — hook `pre-push` global (A FAZER)

**Furo atual:** a ruleset cobre só `~DEFAULT_BRANCH`. Um commit sem assinatura
criado com `SKIP_GPG_CHECK=1` pode ser enviado para **qualquer branch que não
seja a default** sem nenhum aviso — o `deprecated`, branches de feature etc. O
commit fica público sem assinatura até ser mergeado, e só aí a default rejeita.
O hook `pre-commit` não pega esse caminho porque dá pra desligá-lo.

**Solução:** `C:\Users\muito\.githooks\pre-push` (mesmo diretório; o
`core.hooksPath` já aponta para lá, não muda config nenhuma).

Lê stdin no formato `LOCAL_REF LOCAL_SHA REMOTE_REF REMOTE_SHA` e por ref:

- `REMOTE_SHA` existe → `git rev-list REMOTE_SHA..LOCAL_SHA` (só commits novos)
- `REMOTE_SHA` = `000…0` (branch nova) → `git rev-list LOCAL_SHA --not
  --remotes=$2` (só o que não existe em nenhuma branch remota — **essencial**,
  senão a história antiga sem assinatura do `labgas` dispararia o hook à toa)
- `LOCAL_SHA` = `000…0` (deleção) → pula

Classificação por `%G?`:

| Código | Significado | Ação |
| --- | --- | --- |
| `N` | sem assinatura | **bloqueia** |
| `B` | assinatura inválida | **bloqueia** |
| `R` | chave revogada | **bloqueia** |
| `G` `U` `X` `Y` | assinatura criptograficamente boa | passa |
| `E` | não verificável localmente | passa com aviso |

O caso `E` precisa passar: merge criado pela UI do GitHub é assinado pela
`web-flow`, que não está no meu keyring — bloquear `E` geraria falso positivo
em qualquer repo com merge do GitHub (ver §2). Quem decide o que é válido de
verdade é o servidor; o hook só garante que nenhum commit nasce ou sobe sem
assinatura nenhuma.

Escape: `git push --no-verify` (nativo do git, não precisa de código extra).
Mensagem de erro deve listar os commits e sugerir `git fetch origin --prune`,
porque tracking ref desatualizada é a causa provável de lista longa.

**A fazer:** escrever o script, testar os 4 cenários (§8) e limpar as branches
de teste.

### 6.2 `4b` — backup da chave privada (A FAZER, prioridade alta)

`C:\Users\muito\.gnupg\private-keys-v1.d` é o **único** lugar com a chave
privada. Não existe export em lugar nenhum. Se esse perfil do Windows for
perdido ou formatado, eu paro de assinar — e o pior: como a chave pública já
está na conta, o GitHub continua exibindo **Verified** nos commits antigos
enquanto **todo commit novo fica sem assinatura para sempre**. Falha silenciosa
e permanente.

O certificado de revogação **já existe** em disco e nunca foi backupado:

```
C:\Users\muito\.gnupg\openpgp-revocs.d\880A68E4D53E4345ECA9F2292ED9BC95BC8746A1.rev
```

Passos, **comigo e o usuário na frente da máquina** (abre popup de passphrase):

1. Copiar o `.rev` para um arquivo legível e guardá-lo junto da chave
2. `gpg --armor --export-secret-keys 2ED9BC95BC8746A1` → arquivo em
   `Temp\opencode\`
3. Conferir com `gpg --show-keys` que a fingerprint do export bate com
   `880A68E4D53E4345ECA9F2292ED9BC95BC8746A1`
4. Usuário cola no gerenciador de senhas
5. Apagar o arquivo temporário

**Regra dura: nunca imprimir a chave no terminal.** Isso colocaria o material
secreto no transcript da sessão. Só reportar fingerprint e tamanho.

Por que o passo 1 importa: se a chave privada vazar, o `.rev` é o que permite
revogar na conta do GitHub.

### 6.3 `4c` — regra em branches não-default (DESCARTADO)

Duas opções consideradas: segunda ruleset `refs/heads/*`, ou deixar só a default
+ hook local. Escolhido **hook local** — menos superfície no servidor, e o `4a`
cobre o mesmo chão. Uma ruleset `~ALL` foi descartada por incluir tags e poder
atrapalhar push de tag.

### 6.4 `4d` — filtro `signer_email_pattern` (DESCARTADO)

A API rejeitou com `422 Unexpected parameter`. Só dá pra fazer pela UI em 41
repos, e o `required_signatures` já rejeita assinatura de chave desconhecida.
Ganho quase zero para 41 cliques manuais.

### 6.5 `4e` — linha no AGENTS.md (EM ABERTA, 2 linhas)

Regra de texto: nunca usar `--no-verify`, `SKIP_GPG_CHECK=1`, `-n` nem
`--no-gpg-sign`. É exatamente a classe de coisa que produziu os 11 commits de
25/09, e um agente que leia o arquivo não burlaria. **Perguntar se entra.**

---

## 7. Inventário do que existe hoje

| Caminho / recurso | O que é |
| --- | --- |
| `C:\Users\muito\.gitconfig` | `commit.gpgsign=true`, `tag.gpgsign=true`, `gpg.format=openpgp`, `gpg.program=C:\Program Files\Git\usr\bin\gpg.exe`, `user.signingkey=2ED9BC95BC8746A1`, `core.hooksPath=C:/Users/muito/.githooks` |
| `C:\Users\muito\.githooks\pre-commit` | hook global, feito |
| `C:\Users\muito\.githooks\pre-push` | **planejado, não existe** |
| `C:\Users\muito\.gnupg\` | chave privada; único ponto de falha se o profile se perder |
| ruleset `signed-commits` | 41 repos, `required_signatures`, `~DEFAULT_BRANCH`, bypass só por PR |
| scripts de aplicação | `Temp\opencode\apply-rulesets.sh`, `fix-rulesets.sh`, `ruleset.json`, `ruleset-fix.json` — **temporários**, podem ser apagados |

Sobre o doc em si: este arquivo é de escopo global mas mora num repo público
(só um dos 41) e não é versionado nos outros 40. Nenhum segredo aqui (key ID,
email e fingerprint já são públicos via conta). Se preferir fora de qualquer
repo, mover para `C:\Users\muito\SEGURANCA-GIT-ASSINATURA.md`.

---

## 8. Como revalidar depois de um reinício

```bash
# 1. config global intacto
git config --show-origin --get-regexp "^(user\.signingkey|commit\.gpgsign|gpg\.format|gpg\.program|core\.hooksPath)$"

# 2. hooks presentes
ls C:/Users/muito/.githooks/

# 3. hook bloqueia sem assinatura
git -c commit.gpgsign=false commit --allow-empty -m teste   # deve abortar

# 4. 41/41 rulesets (usar endpoint INDIVIDUAL, ver §5)
#    esperar: bypass=pull_request, enforcement=active, ~DEFAULT_BRANCH, required_signatures

# 5. karaoke-flow em dia
git log --format='%h %G?' -7     # tudo G
gh api repos/cavalcanteprofissional/karaoke-flow/commits \
  --jq '.[0:3][] | "\(.sha[0:7]) \(.commit.verification.verified)"'

# 6. chave ainda no keyring
gpg --list-secret-keys --keyid-format=long 2ED9BC95BC8746A1
```

Testes do `4a` quando existir, em branch descartável do `labgas-manager`:

| Cenário | Esperado |
| --- | --- |
| commit assinado em branch nova | passa |
| branch nova sem commits novos (história antiga sem assinatura) | **não dispara** — valida o `--not --remotes` |
| `SKIP_GPG_CHECK=1` + `commit.gpgsign=false` + push | bloqueia |
| o mesmo com `--no-verify` | passa — valida o escape |

Depois: apagar as branches de teste e conferir `git status` limpo nos dois repos.

---

## 9. Decisões tomadas

1. **Não reescrever histórico.** Os 11 commits de 25/09, a branch `deprecated`
   (59/60 sem assinatura) e o histórico do `labgas-manager` (239/243) ficam como
   estão. Reescrever troca SHA de tudo abaixo, exige force-push, quebra outros
   clones e PRs, e os SHAs antigos com o selo *Unverified* ficam órfãos no
   GitHub de qualquer forma.
2. **Bypass só por PR**, não `always` —porque `always` me deixava burlar a
   própria regra (§4.3).
3. **Hook local no lugar de segunda ruleset** para branches não-default (§6.3).
4. **Backup da chave é o item mais urgente** que sobrou (§6.2).

---

## 10. Retomada

Reiniciar o PC não quebra nada do que foi feito: config global, hooks e rulesets
são todos externos ao ambiente. Ao voltar:

- [ ] perguntar se o `4e` (linha no `AGENTS.md`) entra
- [ ] escrever o `pre-push` do §6.1 e rodar os 4 testes do §8
- [ ] fazer o `4b` do §6.2 **com o usuário presente** para a passphrase
- [ ] apagar `Temp\opencode\apply-rulesets.sh`, `fix-rulesets.sh` e os `*.json`
- [ ] confirmar árvore limpa em `karaoke-flow` e `labgas-manager`
