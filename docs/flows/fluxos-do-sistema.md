# Fluxos do sistema

Fluxos técnicos end-to-end no estado atual do MVP (Fase 2 concluída) + propostas.

---

## 1. Autenticação e sessão

### 1.1 Login OAuth (Google/GitHub)

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant L as /login (page)
    participant S as Supabase Auth (browser)
    participant CB as /auth/callback (route)
    participant D as /dashboard (protected)
    actor P as Provider (Google/GitHub)

    U->>L: toca botão do provedor
    L->>S: signInWithOAuth({ provider, redirectTo })
    S-->>P: redireciona (autorização OAuth)
    P-->>CB: volta com ?code=
    CB->>S: exchangeCodeForSession(code)
    S-->>CB: cria sessão + grava cookie (sb-<ref>-auth-token)
    CB->>D: redirect (next, validado relativo)
    D-->>U: tela autenticada
```

### 1.2 Login dev (e-mail/senha — somente `NODE_ENV=development`)

```mermaid
flowchart TD
    A["/login (§ dev)"] --> B["signInWithPassword(email, senha)"]
    B --> C{Sucesso?}
    C -- não --> E[toast: credenciais inválidas]
    C -- sim --> F["router.push('/dashboard') + refresh"]
```

### 1.3 Manutenção de sessão (proxy)

Em Next 16 o middleware chama-se `proxy` (`src/proxy.ts`). Roda em toda request, renova o token e delega o controle de rota.

```mermaid
flowchart TD
    A["Request"] --> B["createServerClient (cookies do request)"]
    B --> C["supabase.auth.getUser()"]
    C --> D{Rota protegida?<br/>/dashboard* · /salas*}
    D -- sim, sem usuário --> E["redirect → /login"]
    D -- não --> F{Rota de auth?<br/>/login}
    F -- sim, com usuário --> G["redirect → /dashboard"]
    F -- não --> H["Set-Cookie: private, no-store"]
    H --> I["response (com cookies de refresh atualizados)"]
```

### 1.4 Logout

```mermaid
sequenceDiagram
    autonumber
    actor U as Usuário
    participant UM as UserMenu
    participant S as Supabase Auth
    participant R as Router

    U->>UM: clica "Sair"
    UM->>S: signOut()
    S-->>UM: sessão limpa
    UM->>UM: store → setSession(null)
    UM->>R: replace('/login') + refresh
```

### 1.5 Sincronização da store (client)

```mermaid
flowchart TD
    A["AuthSessionProvider (monta)"] --> B["createBrowserClient (singleton)"]
    B --> C["getSession()"]
    C --> D["store.setSession(user | null)"]
    B --> E["onAuthStateChange (subscribe)"]
    E --> D
    D --> F["UI reativa (UserMenu, guards)"]
```

---

## 2. Ciclo de vida da sala

### 2.1 Criar sala (Fase 3 — Proposta)

```mermaid
flowchart TD
    A["Dashboard"] --> B["Criar sala (botão)"]
    B --> C["INSERT rooms (host_id = auth.uid()) `(backend)`"]
    C --> D["code gerado: 6 chars, sem ambíguos `(backend)`"]
    D --> E["qr_code_url gerada"]
    E --> F["redirect → /salas/[id]"]
    F --> G["Mostra QR + código (entrada 1 toque)"]
```

### 2.2 Entrar na sala (código/QR) — RPC `join_room`

```mermaid
flowchart TD
    A["Participante escaneia QR / digita code"] --> B["RPC join_room(code) `(backend, security definer)`"]
    B --> C{Sala ativa?}
    C -- não --> Z[erro: sala não encontrada/inativa]
    C -- sim --> D{É o host?}
    D -- sim --> Y[erro: você já é o dono]
    D -- não --> E{entry_mode = open?}
    E -- sim --> F["status = approved (entra direto) `(backend)`"]
    E -- não --> G["status = pending (aguarda host) `(backend)`"]
    F --> H["Participante vê a fila"]
    G --> I["Notifica host (Realtime room:{id})"]
    I --> J{Host aprova?}
    J -- sim --> H
    J -- não --> K[status = rejected - pode reentrar depois `(backend)`]
```

Regra de reentrada (migration `20260921000004`): `rejected` pode reentrar (RPC atualiza), mas `approved`/`pending` existentes **não** são rebaixados.

### 2.3 Fechar sala / sair (host)

```mermaid
flowchart TD
    A["Host: Fechar sala"] --> B["UPDATE rooms.status = closed `(backend: host-only)`"]
    B --> C["Canal Realtime encerra as operações"]
    A2["Participante: Sair"] --> B2["DELETE room_members (self) `(backend)`"]
```

---

## 3. Fila (regras de banco)

### 3.1 Adicionar música

```mermaid
flowchart TD
    A["Participante busca + toca 'Adicionar'"] --> B{requireSongConfirmation?}
    B -- sim --> C["Modal confirmação (título/thumb/duração)"]
    C --> D["INSERT queue_items"]
    B -- não --> D
    D --> E["Trigger position: advisory lock por sala, max+1 `(backend)`"]
    D --> F["Trigger status: lê queue_approval_mode `(backend)`"]
    F --> G{Modo da sala}
    G -- auto --> H["status = approved (entra na fila)"]
    G -- manual --> I["status = pending (fila de aprovação)"]
    H --> J["Realtime room:{id} → tela atualiza"]
    I --> J
```

### 3.2 Aprovação (host)

```mermaid
flowchart TD
    A["Item pending"] --> B["Host: aprovar/rejeitar"]
    B -- aprovar --> C["UPDATE status = approved `(backend: host-only)`"]
    B -- rejeitar --> D["UPDATE status = rejected `(backend: host-only)`"]
    C --> E["Realtime room:{id}"]
    D --> E
```

### 3.3 Reprodução e transições

```mermaid
stateDiagram-v2
    direction LR
    [*] --> pending: modo manual
    [*] --> approved: modo auto
    pending --> approved: host aprova
    pending --> rejected: host rejeita
    approved --> playing: player inicia
    approved --> rejected: host rejeita (antes de tocar)
    playing --> played: termina
    playing --> skipped: host pula
    rejected --> [*]
    played --> [*]
    skipped --> [*]
```

> A operação de **trocar música** (ver §5) mantém o item no mesmo estado de status em que está (com re-regra opcional conforme decisão de produto) — não cria um estado novo.

---

## 4. Player device (tela `/player/[codigoDaSala]`)

```mermaid
sequenceDiagram
    autonumber
    actor T as Tela kiosk (TV/Projetor)
    participant P as /player/[code] (público, sem login)
    participant YT as YouTube IFrame Player
    participant RT as Realtime (canal room:{id})
    participant C as Controller (celular host/participante)

    T->>P: abre a URL pública
    P->>P: carrega a sala (bypass RLS via código)
    P->>YT: carrega o player (não-embutido, sem overlays)
    T->>T: 1º toque p/ destravar autoplay
    P->>RT: subscribe room:{id}
    C-->>RT: publica play/pause/skip/reorder
    RT-->>P: evento → manipula player carregado (sem reload)
    P-->>C: estado no banco persiste (queue_items/status)
```

> Latência alvo < 2s entre ação no controller e reflexo na tela (Fase 6).

---

## 5. Proposta — Trocar a própria música mantendo a posição na fila

> Registrado no `TODO.md` (Fase 5). Decisões de fluxo **em aberto** (ver questões ao final).

### Contexto

Cada item da fila é uma linha de `queue_items` com `position` atribuído no banco. **Reordenar** (host, Fase 5) apenas reescreve `position`. **Trocar a música** é substituir o conteúdo de um item **sem mover a posição** — ex.: pedi "Aleatório" mas coloquei a versão errada, ou mudei de ideia antes de tocar.

### 5.1 Opções de implementação

| Opção                                                  | O que é                                                                                 | Prós                                                                                        | Contras                                                                                                | Veredito                   |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------- |
| **A — UPDATE in place via RPC `replace_queue_song`**   | Mantém a mesma linha (`id`, `position`, `status`) e só troca vídeo/título/thumb/duração | Posição garantida; atômico; Realtime é um único UPDATE; sem furo de histórico de `position` | Sobrescreve a música original (sem histórico); precisa de RPC + policy nova                            | **Recomendada para o MVP** |
| **B — DELETE + INSERT na mesma posição**               | Apaga o item e recria naquela posição (reajustando as demais)                           | "Histórico" do slot preservado (novo id)                                                    | `id` novo quebra a referência de "tocando agora" e o Realtime; 2 operações; risco de corrida           | Não recomendada            |
| **C — Normalizar `songs` e referenciar por `song_id`** | Tabela de catálogo; trocar = trocar FK                                                  | Modelo "correto" p/ futuro/catálogo                                                         | Retrabalho grande; mesma música por 2 pessoas vira 1 linha (perde "quem pediu o quê"); overkill no MVP | Roadmap                    |

**Decisão assumida: Opção A (RPC `security definer`), com regras de negócio fechadas com o PO:**

- **Quem troca (D1):** o **autor** da música, **ou o host** (host pode trocar qualquer item). O host **também pode reordenar** a playlist (movimenta `position`, funcionalidade já prevista na Fase 5 — complementar à troca, que **não** mexe em `position`).
- **Status preservado (D2):** a troca **mantém a aprovação** — no modo manual, uma música já aprovada, quando trocada, continua `approved` (troca 1:1, não volta ao fim nem à fila de aprovação).
- **Estados permitidos (D3):** `pending` e `approved` (enquanto ainda não tocou). Host **pode adicionar quantas músicas quiser, sem limite**, e a ordem da fila é sempre respeitada (o limite — se algum dia houver — nunca é imposto no insert de host).

```mermaid
flowchart TD
    A["Item na minha fila: botão 'Trocar música'"] --> B["Abre busca (mesmo flow da Fase 4)"]
    B --> C{requireSongConfirmation?}
    C -- sim --> D["Modal confirmação do vídeo novo"]
    D --> E["RPC replace_queue_song(item_id, yt_video, title, thumb, duration) `(backend)`"]
    C -- não --> E
    E --> F{Validações no banco}
    F --> F1["item existe e room está active"]
    F --> F2["added_by = auth.uid() OU is_host(room)"]
    F --> F3["status ∈ {pending, approved}"]
    F --> F4["youtube_video_id não vazio"]
    F -- ok --> G["UPDATE das colunas de conteúdo (position e status intocados)"]
    G --> H["updated_at atualizado (trigger)"]
    G --> I["Realtime room:{id} → fila reflete (single UPDATE)"]
    F -- qualquer falha --> K["Erro retornado ao client (sem mudança)"]
```

> **Reordenar (host) é operação distinta**: reescreve `position` de vários itens (pendências de Fase 5); a troca nunca muda a ordem.

**Payload da RPC (sugestão):** `p_item_id uuid`, `p_youtube_video_id text`, `p_title text`, `p_thumbnail_url text`, `p_duration_seconds integer`. Retorna o item atualizado ou levanta exceção com mensagem legível.

**RLS impactada:** hoje `queue_items` só aceita UPDATE de host (`queue_items_update_host`). A RPC `security definer` roda como superuser/definer e impõe as checagens acima explicitamente — **o client não ganha UPDATE direto** (nada de relaxar a policy).

### 5.2 Questões de fluxo — resolvidas com o PO ✅

| #   | Pergunta                                   | Resposta                                                                                       |
| --- | ------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| D1  | Quem pode trocar?                          | **Autor + host** (e host também reordena a playlist).                                          |
| D2  | Modo manual: música aprovada que é trocada | **Mantém aprovada** (não volta ao fim nem à aprovação).                                        |
| D3  | Estados permitidos para trocar             | **`pending` e `approved`** (ainda não tocou). Extras: host adiciona **sem limite** de músicas. |

### 5.3 Impacto na UI (proposta, vide `fluxos-do-usuario.md`)

- Botão "Trocar" em **meus pedidos** (itens ainda não tocados).
- O mesmo componente de busca/confirmação da Fase 4 é reutilizado.
- Feedback otimista + rollback em falha; interceptar no toast de erro da RPC.
