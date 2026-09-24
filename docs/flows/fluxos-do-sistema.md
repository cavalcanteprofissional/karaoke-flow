# Fluxos do sistema

Fluxos técnicos end-to-end no estado atual do MVP (Fases 1–3.5 **e Fase 4 — busca + fila** concluídas) + propostas.

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

### 1.2 Acesso anônimo (visitante sem conta)

Fase 3.5 habilita **anonymous sign-ins** (Management API `AuthConfig.external_anonymous_users_enabled` + `supabase/config.toml`), para a galera pedir música pelo QR **sem criar conta**. Anônimo **não** cria bar (RPC `create_bar` recusa `is_anonymous`); host exige login real.

```mermaid
flowchart TD
    A["/login → 'Continuar sem login'"] --> B["signInAnonymously()"]
    B --> C["Sessão criada (is_anonymous = true)"]
    C --> D["proxy: anônimo em / · /login → /entrar; anônimo em /dashboard → /entrar"]
    D --> E["Participante entra no bar via QR/código e escolhe a mesa"]
```

### 1.3 Login dev (e-mail/senha — somente `NODE_ENV=development`)

```mermaid
flowchart TD
    A["/login (seção dev)"] --> B["signInWithPassword(email, senha)"]
    B --> C{Sucesso?}
    C -->|não| E["toast: credenciais inválidas"]
    C -->|sim| F["router.push('/dashboard') + refresh"]
```

### 1.4 Manutenção de sessão (proxy)

Em Next 16 o middleware chama-se `proxy` (`src/proxy.ts`). Roda em toda request, renova o token e delega o controle de rota.

```mermaid
flowchart TD
    A["Request"] --> B["createServerClient (cookies do request)"]
    B --> C["supabase.auth.getUser()"]
    C --> D{Rota protegida?<br/>/dashboard* · /salas* · /entrar}
    D -->|sem usuário| E["redirect → /login"]
    D -->|não| F{Rota de auth?<br/>/ ou /login}
    F -->|com usuário| G["anônimo → /entrar · real → /dashboard"]
    F -->|anônimo no dashboard| G2["redirect → /entrar"]
    F -->|não| H["Set-Cookie: private, no-store"]
    H --> I["response (com cookies de refresh atualizados)"]
```

### 1.5 Logout

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

## 2. Ciclo de vida do bar e do karaokê

### 2.1 Criar bar (vira perfil + mesas + karaokê único)

Fase 3.5: **1 host = 1 bar** (`bars.host_id` único), que por padrão tem **1 karaokê** (`rooms.bar_id`; multi-sala desabilitado na UI — affordance "Adicionar sala" desabilitada). O QR/código do bar já resolve direto para o karaokê único ativo.

Requisito presença (2026-09-23): o cadastro também registra a **localização física** (geocode Nominatim com fallback GPS do dispositivo) e o **raio de presença** (`raio_permitido_metros`, default 150 m) — base do gate de presença (§2.2 e §2.2.1).

```mermaid
flowchart TD
    A["Dashboard → 'Criar meu bar' (Dialog)"] --> B["RPC create_bar(nome, cidade, endereco, quantidade_mesas, rotulos, latitude, longitude, raio) — (backend, security definer)"]
    B --> C["bar + mesas 1..N + room única criados em transação (backend)"]
    C --> D["Exige login real (anônimo → erro 'crie uma conta')"]
    D --> E["redirect → /salas/[code]"]
    E --> F["Mostra QR do bar + QR de cada mesa (entrada 1 toque)"]
```

### 2.2 Entrar no bar (código/QR) — preview unificada + RPC `join_room` com mesa

A RPC `get_room_preview` **foi substituída** pela `get_entry_preview(p_code, p_mesa)` (migration `20260923000013`): `p_code` aceita **código de bar** **ou** código de room (QR legado de sala); o karaokê é a **única sala ativa do bar**.

**Gate de presença física** (requisito 2026-09-23): antes de `join_room`, o servidor lê o cookie `kf-geo` (geo do participante coletada sob consentimento §2.5) e compara com as coordenadas do bar (haversine ≤ `raio_permitido_metros`). **Participante fora do raio/sem geo → bloqueado** (banner + CTA "Permitir localização"); **host isento**; sem geo o participante mantém only-view (não entra).

```mermaid
flowchart TD
    A["Participante digita code / escaneia QR de bar ou de mesa"] --> V["RPC get_entry_preview(p_code, p_mesa) — (backend, security definer)"]
    V --> W["Resolve bar → karaokê único ativo → preview<br/>(bar_nome, host, entry_mode, status, quantidade_mesas, coords)"]
    W --> X{Bar tem mesa pré-selecionada?}
    X -->|sim| X1["Mesa pré-selecionada (QR / ?mesa=N): valida p_mesa (1..quantidade_mesas e existe em mesas)"]
    X -->|não| X2["UI pede a mesa (grid 1..N); default 1 quando mesa única"]
    X1 --> X3["Confirmar entrada"]
    X2 --> X3
    X3 --> P{"Presente no bar? (kf-geo × coords ± raio)"}
    P -->|não| P1["bloqueado: banner geo + permitir localização (host isento)"]
    P -->|sim| B["RPC join_room(p_code=room_code, p_mesa) — (backend, security definer)"]
    B --> C{Sala ativa?}
    C -->|não| Z["erro: sala não encontrada/inativa"]
    C -->|sim| D{É o host?}
    D -->|sim| Y["erro: você já é o dono desta sala"]
    D -->|não| E{Mesa válida?}
    E -->|não| E1["erro: mesa inválida / fora de 1..quantidade_mesas ou inexistente"]
    E -->|sim| E2{entry_mode = open?}
    E2 -->|sim| F["status = approved · mesa_numero gravado (backend)"]
    E2 -->|não| G["status = pending · mesa_numero gravado (backend)"]
    F --> H["Participante vê a fila ('Bar · Mesa N')"]
    G --> I["Notifica host (Realtime room:{id})"]
    I --> J{Host aprova?}
    J -->|sim| H
    J -->|não| K["status = rejected - pode reentrar depois (backend)"]
```

Regra de reentrada (migration `20260921000004`): `rejected` pode reentrar (RPC atualiza), mas `approved`/`pending` existentes **não** são rebaixados. O `mesa_numero` é atualizado no reentrar (`coalesce(excluded.mesa_numero, ...)`).

### 2.3 Fechar/sair

```mermaid
flowchart TD
    A["Host: Fechar sala (botão, confirm modal)"] --> B["RPC close_room(room_id) — (backend, security definer)"]
    B --> B1{É o host? (is_host)}
    B1 -->|não| B2["erro: só o dono pode encerrar a sala"]
    B1 -->|sim| C["rooms.status = closed"]
    C --> D["queue_items pendentes/approved/playing → cancelled (fila cancelada e interrompida)"]
    C --> E["DELETE room_members (todos expulsos)"]
    D --> F["Realtime → fila some da tela; participantes veem 'sala encerrada'"]
    A2["Participante: Sair"] --> G["DELETE room_members (self) (backend)"]
```

---

## 3. Fila (regras de banco)

### 3.1 Adicionar música

**Matriz de presença física (Fase 4):** antes do `INSERT`, a server action `addSongToQueueAction` revalida **membro aprovado/pendente** e a **presença** do participante (`kf-geo` × coords do bar ± raio) — mesmos códigos da busca: `GEO_UNAVAILABLE` (bar sem coords ou geo ausente) / `OUTSIDE_BAR` (fora do raio); **host isento**.

```mermaid
flowchart TD
    A["Participante busca + toca 'Adicionar' em /buscar"] --> G{"Membro + presente?<br/>addSongToQueueAction (server)"}
    G -->|não| G1["403: NOT_MEMBER/PENDING/GEO_UNAVAILABLE/OUTSIDE_BAR<br/>(banner geo + re-permitir localização)"]
    G -->|sim| B{requireSongConfirmation?}
    B -->|sim| C["Modal confirmação (título/thumb/duração)"]
    C --> D["INSERT queue_items (.select() p/ validar RLS)"]
    B -->|não| D
    D --> E["Trigger position: advisory lock por sala, max+1 (backend)"]
    D --> F["Trigger status: is_host(added_by) → approved; senão lê queue_approval_mode (backend)"]
    F --> G2{Added_by é o dono?}
    G2 -->|sim| H["status = approved (nunca espera a própria aprovação)"]
    G2 -->|não| G3{Modo da sala}
    G3 -->|auto| H
    G3 -->|manual| I["status = pending (fila de aprovação)"]
    H --> J["revalidatePath + Realtime → QueueList atualiza"]
    I --> J
```

## 3.1.1 Busca de música no YouTube (Fase 4 — implementado)

Rota `/api/youtube/search` consumida pelo `SongSearch` (rota filha `/salas/[codigo]/buscar`). Credencial é resolvida **apenas no servidor** (service role); cache `song_cache` compartilhado entre karaokês; rate limit independente da cota da Google.

```mermaid
sequenceDiagram
    autonumber
    actor P as Participante (mobile)
    participant S as SongSearch (client)
    participant R as /api/youtube/search (server)
    participant DB as Supabase (RLS + service role)
    participant YT as YouTube Data API v3

    P->>S: digita (debounce 500ms + AbortController)
    S->>R: GET /api/youtube/search?room=CODE&q=...
    R->>DB: auth → rooms + bars (coords/raio) + membership (RLS)
    alt não membro / pendente
        R-->>S: 403 (NOT_MEMBER / PENDING)
    else participante
        R->>DB: presença: kf-geo × coords (host isento)
        alt fora do raio / sem geo
            R-->>S: 403 (OUTSIDE_BAR / GEO_UNAVAILABLE, geoRequired)
        end
    end
    R->>R: rate limit ip:userId 60/h
    alt estourou
        R-->>S: 429 + Retry-After
    end
    R->>DB: song_cache (query normalizada em bucket)
    alt cache fresco
        R-->>S: 200 { results, cached: true }
    else cache miss
        R->>R: credencial: chave do bar → OAuth host → OAuth app → dev
        R->>YT: search.list (safeSearch=strict, videoEmbeddable) + videos.list (duração)<br/>OAuth (app/host) via `Authorization: Bearer`; API key via `?key=`
        YT-->>R: itens
        R->>DB: song_cache.upsert (TTL 7d)
        R-->>S: 200 { results, cached: false, source }
    end
    S-->>P: lista (thumbnail + título + duração) + "Adicionar à fila"
```

**OAuth por-host:** bloco "Conta do YouTube" no `RoomSettings` (mostra "conectado à conta Google + data" quando há token, com botão "Remover conexão" que **revoga na Google** e apaga a linha) → `/auth/youtube/authorize` (estado nonce em cookie httpOnly, `access_type=offline&prompt=consent`) → Google → `/auth/youtube/callback` (exchange → `youtube_oauth_tokens`, **sem policies — service role**) → redirect à sala. Fallback do app: `scripts/youtube-app-oauth.mjs` (loopback) coleta o `YOUTUBE_APP_REFRESH_TOKEN` para o `.env.local`.

### 3.2 Aprovação (host)

```mermaid
flowchart TD
    A["Item pending"] --> B["Host: aprovar/rejeitar"]
    B -->|aprovar| C["UPDATE status = approved (backend: host-only)"]
    B -->|rejeitar| D["UPDATE status = rejected (backend: host-only)"]
    C --> E["Realtime room:{id}"]
    D --> E
```

### 3.3 Reprodução e transições

```mermaid
stateDiagram-v2
    direction LR
    [*] --> pending: modo manual (não-host)
    [*] --> approved: modo auto, ou pedido do DONO da sala
    pending --> approved: host aprova
    pending --> rejected: host rejeita
    approved --> playing: player inicia
    approved --> rejected: host rejeita (antes de tocar)
    playing --> played: termina
    playing --> skipped: host pula
    pending --> cancelled: dono encerra a sala
    approved --> cancelled: dono encerra a sala
    playing --> cancelled: dono encerra a sala (interrompe)
    rejected --> [*]
    played --> [*]
    skipped --> [*]
    cancelled --> [*]
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
    C -->|sim| D["Modal confirmação do vídeo novo"]
    D --> E["RPC replace_queue_song(item_id, yt_video, title, thumb, duration) — (backend)"]
    C -->|não| E
    E --> F{Validações no banco}
    F --> F1["item existe e room está active"]
    F --> F2["added_by = auth.uid() OU is_host(room)"]
    F --> F3["status ∈ {pending, approved}"]
    F --> F4["youtube_video_id não vazio"]
    F -->|ok| G["UPDATE das colunas de conteúdo (position e status intocados)"]
    G --> H["updated_at atualizado (trigger)"]
    G --> I["Realtime room:{id} → fila reflete (single UPDATE)"]
    F -->|qualquer falha| K["Erro retornado ao client (sem mudança)"]
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
