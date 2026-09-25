# Registro de decisões Fase 5 + commit/push do estado atual (26/09)

> Aguardando aprovação do usuário para sair do plan mode e executar.

## Objetivo
- **Não** implementar código da Fase 5 hoje.
- Registrar nos docs as decisões de escopo da Fase 5 (aprovação de música do host, reordenar ⬆/⬇ + drag-and-drop, deferimento do canal `room:{id}`).
- Commit + push do estado atual da working tree.

## Mudanças planejadas

### 1. `TODO.md` — seção `## Fase 5 — Fila: realtime, aprovação e confirmação`
Adicionar bloco "> **Escopo registrado (26/09) — implementação começa em 27/09 (blocos A–F):**" com:
- Bloqueio de UI de aprovação: backend pronto (RLS `queue_items_update_host`/`delete_host` + triggers), **sem UI/action** (`QueueList` read-only).
- Bloco A — host aprovar/rejeitar/remover (actions `.select()` + painel espelhando `PendingEntries`).
- Bloco B — modal `requireSongConfirmation` (Dialog antes do `addSongToQueueAction`).
- Bloco C — reordenar: **mover ⬆/⬇ E drag-and-drop (AMBOS)** + remover.
- Bloco D — `replace_queue_song` RPC `security definer` (D1–D3) + botão "Trocar".
- Bloco E — feedback visual ("quem pediu", estados).
- Bloco F — testes + docs.
- Canal `room:{id}` broadcast deferido para Fase 6/7 (hoje `postgres_changes` por sala `queue-{roomId}`).

E atualizar itens da lista:
- `queueApprovalMode = manual` → anotar "(**painel de aprovação no Bloco A**)".
- `Realtime da fila via canal room:{id}` → anotar "**deferido p/ Fase 6/7**".
- `Reordenar e remover itens (host)` → "mover ⬆/⬇ **e drag-and-drop (ambos)** — Bloco C".
- `Trocar a própria música…` → "— Bloco D".
- `Feedback visual…` → "(+ \"quem pediu\") — Bloco E".

### 2. `docs/flows/fluxos-do-sistema.md` — §5
Após o blockquote sobre reordenar (linha ~364), adicionar: "**Formas de reordenar (Fase 5, decidido 26/09):** mover ⬆/⬇ por item **e** drag-and-drop (ambos); `position` reescrito de forma atômica no backend."

### 3. Formatação
`npx prettier --write TODO.md docs/flows/fluxos-do-sistema.md`

### 4. Commit + push (tudo da working tree)
- `git add` dos arquivos modificados/novos da sessão (listados no `git status`): docs, `scripts/seed.mjs`, `src/**` (incl. novo `enter-room-by-code.tsx`, `location-gate.tsx`, `mesa-*`), migrations `00020`–`00023`.
- **Não** incluir `.env.local` nem `credentials/` (verificar `.gitignore` antes).
- Mensagem (estilo convencional do repo, pt-BR):
  ```
  feat: código de sala configurável (3–12) + entrada direta por código + aprovação de música por padrão

  - migrations 00020 (reopen_room), 00021 (fix 42702), 00022 (código 3–12,
    create_bar/join_room/pick_mesa, KARAOKE), 00023 (queue_approval_mode default 'manual')
  - /entrar: código puro entra direto na sala via Server Action no mount
    (EnterRoomByCode) — corrige "revalidatePath during render" do Next 16
  - MesaPicker obrigatório dentro da sala; RoomSettings "Código de entrada"; QR de mesa
  - toggle "Música com aprovação" (ON = manual, default ativo)
  - coords do Bar 1 (ZEHBAR) = casa do testador (Fortaleza), persistidas no seed
  - docs TESTING/CHANGELOG/TODO/fluxos; 159 testes verdes
  ```
- `git push`.

## Verificação pós-execução
- `git status` limpo (exceto eventuais arquivos gitignored), `git log -1` e remoto atualizado.