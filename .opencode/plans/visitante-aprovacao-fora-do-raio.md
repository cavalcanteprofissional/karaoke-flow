# Visitante aprovado parado no spinner + QR do player + fora do raio

> Origem: teste manual em rede, **deploy na Vercel**, usuário visitante **anônimo**
> (sem login autenticado). Relatado em 2026-10-02.

---

## Diagnóstico

### BUG 1 — "Entrada aprovada!" é um spinner terminal sem recuperação

`src/components/bars/entry-approval-wait.tsx:63-73`

```ts
const redirected = useRef(false);

const finish = useCallback(() => {
  if (redirected.current) return;
  redirected.current = true;
  setStatus("approved");
  if (destination !== null) {
    router.replace(destination ?? `/salas/${roomCode}`);
  }
  router.refresh(); // <-竞corre com o replace
}, [destination, roomCode, router]);
```

O estado `approved` renderiza só um `<LoaderCircle className="animate-spin" />`
(`entry-approval-wait.tsx:185-202`). **Não há timeout, não há `catch`, não há botão
de recuperação.** Se a navegação cliente não completar, a tela fica presa para
sempre — exatamente o sintoma relatado.

Por que a navegação não completa (2 candidatos, ambos no código):

- **`router.replace()` e `router.refresh()` no mesmo tick.** O `refresh()` revalida
  a rota atual. Depois da aprovação, `/entrar?…` **continua devolvendo** a tela de
  espera (`entrar/page.tsx:65` — `showWait = !!result.membership`), e o refresh
  preserva o estado do client component. `redirected.current` continua `true`, então
  `finish()` nunca roda de novo. Estado terminal.
- **`destination={null}`** em `src/app/(app)/salas/[codigo]/page.tsx:88`. Nesse
  caminho o guard `if (destination !== null)` é **falso**: não há `router.replace`
  nenhum, só `router.refresh()`. Caminho 100% morto por construção.

**Por que os testes não pegam:** `entry-approval-wait.test.tsx:10-12` troca o
router por `{ replace: vi.fn(), refresh: vi.fn() }`. As asserções
(`entry-approval-wait.test.tsx:170-171`) provam que `replace` foi **chamado**, nunca
que a navegação **funcionou** — e a linha 171 **consagra** o `replace` + `refresh`
como comportamento correto.

### BUG 2 — o destino é `/salas/<código>`, que exige login

`entry-approval-wait.tsx:70` manda para `/salas/${roomCode}`. Mas `/salas` está em
`PROTECTED_PREFIXES` (`src/proxy.ts:8`). Para o visitante anônimo o caminho depende
de a RLS de `rooms` deixar passar: a policy `rooms_select_member_or_host`
(`supabase/migrations/20260921000003_rooms.sql:26-32`) só libera
`host_id = auth.uid() or is_approved_member(id, auth.uid())`. Se a aprovação não
tiver sido persistida (ou a regra das 24h já tiver vencido), `room` volta `null` e a
página cai justamente no `destination={null}` do BUG 1.

O destino correto é **`/player/<código>`**: rota pública (o comentário de
`src/app/player/[codigo]/page.tsx:9-21` diz que `/player` não está em
`PROTECTED_PREFIXES`) e cuja RPC `get_player_state` já autoriza sessão de membro
`approved` via `player_room_id(p_room_code, null)`
(`supabase/migrations/20260927000029_player_session_access.sql:74-95`).

### BUG 3 — o QR do player aponta para o host errado

`.env.local:31` e `.env.example:71` têm `NEXT_PUBLIC_APP_URL=http://localhost:3000`, e
**não há env nenhuma configurada na Vercel**. `roomJoinUrl`
(`src/lib/rooms/utils.ts:49-56`) cai no fallback `"http://localhost:3000"`, e
`player-kiosk.tsx:381` chama `roomJoinUrl(state.room.code)` **sem** passar `appUrl`.

Resultado: o QR da TV codifica `http://localhost:3000/entrar?code=…`. Celular
escaneia → `localhost` do celular → não entra. `barJoinUrl` e `mesaJoinUrl`
(`src/lib/bars/qr.ts:74-80, 93-99`) têm o mesmo problema.

### BUG 4 — `RoomQr` engole o erro e fica em loading para sempre

`src/components/rooms/room-qr.tsx:38-40`

```ts
.catch(() => {
  if (active) setDataUrl(null);     // sem log, sem fallback
});
```

`dataUrl === null` renderiza `<Skeleton>` (`room-qr.tsx:46-47`). Qualquer falha →
skeleton eterno sem nenhuma pista. E **não existe teste do `RoomQr`**: os testes do
`player-kiosk` só checam o texto irmão `"Escaneie para adicionar uma música"`
(`player-kiosk.test.tsx:256, 318, 625, 744`).

_(A lib em si está saudável: `qrcode@1.5.4` resolve a variant browser e gera o PNG
em ~15 ms; o bundle client usa a variant browser, não a de Node.)_

### BUG 5 — fora do raio, o visitante nem consegue entrar

`PresenceDecision.reason` (`src/lib/bars/geo.ts:9-18`) **já distingue** os dois casos:

| `reason`          | Significado                                         | Comportamento novo                              |
| ----------------- | --------------------------------------------------- | ----------------------------------------------- |
| `geo-unavailable` | sem cookie de consentimento, ou bar sem coords/raio | **bloqueia** a entrada — obriga o consentimento |
| `outside`         | tem coords, está genuinamente fora do raio          | **não bloqueia** — entra só para assistir       |

Hoje os dois bloqueiam igual, em três lugares:
`entrar/page.tsx:66` (`showGate`), `entry-preview.tsx:53, 146` (`geoBlocked` desabilita
o botão) e `actions.ts:369` / `actions.ts:530` (`if (!presence.ok) return`).

O bloqueio de **pedir música** fora do raio **já existe e deve ser mantido**:
`buildQueueSongItem` (`src/lib/rooms/queue.ts:81-99`) devolve
`OUTSIDE_BAR` / `GEO_UNAVAILABLE` com `geoRequired: true`.

### NÃO É BUG — "entrada livre" desligada gerar pedido

Com `entry_mode = "approval"` o visitante **tem** de mandar pedido; é o modo
correto. `joinEntryAction` (`actions.ts:380-383`) usa
`preview.entry_mode === "open" ? "approved" : "pending"` como fallback quando a RPC
não devolve a linha. Nenhuma ação de código aqui.

---

## Plano de execução

### Fase 0 — Vercel: `NEXT_PUBLIC_APP_URL` (bloqueante, sem código)

Sem isso **nada** do QR funciona e nenhum teste de celular é válido.

1. Descobrir o domínio do deploy (Settings → Domains no projeto Vercel).
2. Vercel → Project → Settings → Environment Variables:
   - `NEXT_PUBLIC_APP_URL` = `https://<seu-dominio>` (sem barra final, sem path)
   - Marcar em **Production**, **Preview** e **Development**.
3. Redeploy (env `NEXT_PUBLIC_*` é **inlinada no bundle em build time** — trocar a
   env não muda o que já está no ar).
4. Conferir: `curl -s https://<dominio>/player/<CODIGO> | grep -o 'localhost:3000'`
   não deve encontrar nada.

> Durante o desenvolvimento local, o `.env.local` continua em
> `http://localhost:3000` — é o que a Fase 4 resolve.

### Fase 1 — Tirar o spinner eterno

`src/components/bars/entry-approval-wait.tsx`

1. Separar "navegou" de "tentou": trocar o latch `redirected` por um `useState` de
   **tempo decorrido** (`const [navTimeout, setNavTimeout] = useState(false)`,
   disparado por `setTimeout` de ~4 s dentro de `finish`).
2. `finish()` faz **um** `router.replace(target)` e **nada** de `router.refresh()`.
3. Normalizar o destino: `const target = destination ?? \`/player/${roomCode}\``—
remover o guard`if (destination !== null)`, que hoje trata `undefined`e`null`de forma invertida. Trocar o tipo da prop para`destination?: string`.
4. Quando `navTimeout` for `true`, o card `approved` passa a oferecer
   **"Abrir o karaokê agora →"** (`router.push(target)`) em vez de girar para
   sempre. Isso converte uma classe inteira de falha silenciosa em estado
   recuperável.
5. Corrigir o mesmo par `replace + refresh` em `cancel()` (linhas 181-182) e no
   botão "Enviar novo pedido" (linhas 258-259).

`src/app/(app)/salas/[codigo]/page.tsx:88` — remover `destination={null}`.

### Fase 2 — Destino `/player`

1. `entry-approval-wait.tsx:70` — default passa a `/player/${roomCode}`.
2. `entry-preview.tsx:73-84` e `enter-room-by-code.tsx:68-76` passam a passar
   `destination` explicitamente quando a origem for o QR de mesa (para o
   convidado com mesa continuar caindo na sala, onde há `MesaPicker`).
3. Verificar que `/player/<código>` mostra a fila para membro `approved` **sem
   token** — é o caminho novo do visitante, e hoje é exercitado por outro motivo
   (`playback-controls.tsx:62` monta o link da TV com token).

### Fase 3 — Fora do raio: entra e só assiste

1. `src/lib/bars/geo.ts` — novo helper puro, com a tabela de verdade testável:
   ```ts
   /** Só a falta de consentimento/coord bloqueia a entrada; `outside` não. */
   export function canEnterAsViewer(presence?: PresenceDecision): boolean {
     return !presence || presence.ok || presence.reason === "outside";
   }
   ```
2. `src/app/(app)/entrar/page.tsx:66` — `showGate` passa a ser
   `presence.reason === "geo-unavailable"`.
3. `src/components/bars/entry-preview.tsx`
   - `geoBlocked` (linhas 53, 146) → só `geo-unavailable`; `outside` não bloqueia.
   - `outside`: esconder o `MesaGrid` (linhas 107-119), mostrar um aviso
     "Você está fora do bar: pode assistir ao vivo, mas não pode pedir músicas",
     e o botão vira **"Assistir ao karaokê"** chamando `joinEntryAction(code, null)`.
   - `singleMesa` deixa de controlar o hide da grade nesse caminho.
4. `src/lib/bars/actions.ts`
   - `joinEntryAction` (linha 335): assinatura `mesa: number | null`; no
     `if (!presence.ok)` (linha 369) só barra `geo-unavailable`.
   - `enterRoomByCodeAction` (linha 489): mesma troca no `if (!presence.ok)`
     (linha 530).
5. **Não mexer** em `src/lib/rooms/queue.ts:81-99` — é o que garante
   "não pode pedir música". Só confirmar que a matriz existente continua verde.
6. `src/components/bars/entry-token-form.tsx` — o caminho `?code=` precisa
   passar a respeitar a mesma regra ao escolher `?bar=` vs `?code=`.

### Fase 4 — QR com a base correta

1. Novo hook `src/lib/use-client-origin.ts` — devolve `null` no SSR e no primeiro
   render, `window.location.origin` depois do mount. Sem leitura de `window` no
   render, para não quebrar hydration (`player-kiosk.tsx:47-54` documenta que o
   quiosque é SSR-rendered e o primeiro render do cliente precisa casar com o HTML).
2. `roomJoinUrl(code, appUrl?)` (`src/lib/rooms/utils.ts:49`) — a precedência já
   está pronta; falta o caller passar o origin. Idem `barJoinUrl` e `mesaJoinUrl`,
   que hoje **não têm** parâmetro `appUrl` (`src/lib/bars/qr.ts:74, 93`) —
   adicionar, para o comportamento ficar simétrico e testável.
3. `player-kiosk.tsx:381` → `roomJoinUrl(state.room.code, origin ?? undefined)`.
4. Callers de `barJoinUrl`/`mesaJoinUrl`: `salas/[codigo]/page.tsx:289, 296` e
   `mesa-qr-dialog.tsx:43-58`.
5. Hardening do `src/components/rooms/room-qr.tsx`:
   - `console.error` no `.catch` (hoje o erro morre em silêncio);
   - `dataUrl === null` **depois de tentada** mostra o fallback — o código da sala
     em texto grande, para o convidado digitar em `/entrar` — em vez de skeleton
     eterno;
   - distinguir "ainda gerando" de "falhou" (ex.: `null` vs `"error"`).

### Fase 5 — Testes

| Arquivo                                                   | O que entra                                                                                                                                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/components/bars/entry-approval-wait.test.tsx` (novo) | router mockado que **falha** a navegação → botão de recuperação aparece e navega; `refresh` **não** é chamado junto do `replace`; `destination` ausente → `/player/<código>`; `destination` explícito → respeitado |
| `src/components/rooms/room-qr.test.tsx` (novo)            | `toDataURL` resolve → `<img>`; **rejeita** → erro logado + fallback com o código, **não** skeleton eterno                                                                                                          |
| `src/lib/bars/geo.test.ts` (existe)                       | tabela de verdade de `canEnterAsViewer` para `ok` / `outside` / `geo-unavailable` / `undefined`                                                                                                                    |
| `src/lib/rooms/queue.test.ts` (existe)                    | confirmar que `OUTSIDE_BAR` e `GEO_UNAVAILABLE` **continuam** barrando a fila                                                                                                                                      |
| `src/lib/bars/qr.test.ts` (existe)                        | `barJoinUrl` / `mesaJoinUrl` aceitando `appUrl` explícito                                                                                                                                                          |
| `src/components/rooms/player-kiosk.test.tsx` (existe)     | `roomJoinUrl` recebe o origin do cliente                                                                                                                                                                           |

Rodar `npm test`, `npm run typecheck`, `npm run lint`.

### Fase 6 — Registrar

- **`TESTING.md`** — nova subseção no roteiro do visitante anônimo: (a) aprovação
  cai em `/player`, (b) **fora do raio** entra sem mesa e a fila mostra o aviso de
  `OUTSIDE_BAR` ao tentar pedir, (c) **sem consentimento** o `LocationGate` bloqueia
  mesmo fora do raio, (d) roteiro na **Vercel em rede** (as fases locais em
  `localhost` não valem para o QR).
- **`TODO.md`** — entrada da Fase com o diagnóstico e a causa-raiz.
- **`CHANGELOG.md`** — versão `0.1.0`, seção de correção.
- **`.env.example`** — documentar que `NEXT_PUBLIC_APP_URL` precisa ser o domínio
  **público** em deploy, e que é build-time.
- **`README.md` / `docs/flows/fluxos-do-usuario.md`** — a regra nova: _entrar para
  assistir é livre; pedir música exige estar no raio; o consentimento de localização
  é obrigatório para os dois._

---

## Riscos e pontos de atenção

- **Fase 3 muda uma regra de produto já validada.** O gate de presença tem smoke
  próprio (`scripts/smoke-rls-audit.sql`, 55/55) e matriz na suíte. A mudança é
  deliberada e **só afrouxa a entrada** — a barreira de pedir música fica intacta.
  Se a intenção de produto for outra, essa fase é a que deve ser revista.
- **Visitante anônimo sem mesa** nunca passa por `MesaPicker`. Se a Fase 2 mandar
  todo mundo para `/player`, a página `/salas` fica restrita a quem tem mesa ou é o
  host — conferir se `PendingEntryRequests` (`entrar/page.tsx:127`) ainda faz
  sentido para o anônimo.
- **Fase 0 exige redeploy.** A env é inlinada no bundle; trocar a variable não altera
  o que já está publicado.
- **Ordem importa:** Fase 0 antes de qualquer verificação, senão o QR continua
  apontando para `localhost` e o teste de celular não significa nada.
