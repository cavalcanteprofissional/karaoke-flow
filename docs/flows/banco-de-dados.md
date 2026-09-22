# Banco de dados

Modelo relacional, matriz de RLS e regras de integridade do MVP (reflete `supabase/migrations/2026092100*.sql`).

---

## 1. Modelo relacional (ERD)

```mermaid
erDiagram
    auth_users ||--o| profiles : "1:1 (id)"
    auth_users ||--o{ rooms : "host de"
    auth_users ||--o{ room_members : "participa"
    auth_users ||--o{ queue_items : "adiciona"

    rooms ||--o{ room_members : "tem"
    rooms ||--o{ queue_items : "contém"
    rooms {
        uuid id PK
        text code UK "6 chars, sem ambíguos"
        text qr_code_url
        uuid host_id FK "auth.users.id"
        room_entry_mode entry_mode "open | approval"
        text queue_approval_mode "auto | manual"
        boolean require_song_confirmation
        text youtube_api_key "nullable (chave do host)"
        room_status status "active | closed"
        timestamptz created_at
    }

    room_members {
        uuid room_id PK,FK "rooms.id"
        uuid user_id PK,FK "auth.users.id"
        member_status status "pending|approved|rejected"
        timestamptz joined_at
    }

    queue_items {
        uuid id PK
        uuid room_id FK "rooms.id"
        uuid added_by_user_id FK "auth.users.id"
        text youtube_video_id
        text title
        text thumbnail_url
        integer duration_seconds
        queue_item_status status "pending|approved|playing|played|rejected|skipped"
        integer position "max+1 por sala (advisory lock)"
        timestamptz added_at
        timestamptz updated_at
    }

    profiles {
        uuid id PK,FK "auth.users.id (criado por trigger)"
        text name
        text email
        text avatar_url
        text auth_provider
        timestamptz created_at
    }

    consents {
        uuid user_id PK,FK "auth.users.id"
        text terms_version
        jsonb cookies_preferences
        jsonb geolocation
        timestamptz accepted_at
        timestamptz updated_at
    }

    song_cache {
        bigint id PK "identity"
        text query_normalized UK "normalizada (case/acentos)"
        jsonb results
        timestamptz created_at
    }
```

> `song_cache` (migration `20260921000006`) **não tem políticas RLS** — só o service role lê/escreve (cache da busca do YouTube).

> `consents` (migration `20260921000009`, spec §2.5/§13): registro de aceite LGPD/GDPR por usuário — RLS restrito ao próprio usuário (`consents_select_own`).

---

## 2. Regras de integridade no banco

```mermaid
flowchart LR
    subgraph INSERT queue_items
        A[insert] --> B["position = max+1 por sala"]
        B --> C["advisory xact lock por sala"]
        C --> D{queue_approval_mode}
        D -- auto --> E[status = approved]
        D -- manual --> F[status = pending]
        A --> G["added_by = auth.uid() (policy)"]
    end
    subgraph UPDATE queue_items
        H[update] --> I["host-only (policy)"]
        I --> J["updated_at = now() (trigger)"]
    end
    subgraph INSERT room_members
        K[insert direto] --> L["sempre pending"]
        L --> M["authorizado? via RPC join_room"]
        M --> N{entry_mode}
        N -- open --> O[approved]
        N -- approval --> P[pending]
    end
```

---

## 3. Matriz de RLS

| Tabela         | SELECT                                                                  | INSERT                                               | UPDATE                  | DELETE                         |
| -------------- | ----------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------- | ------------------------------ |
| `rooms`        | host ou membro aprovado da sala                                         | host (`host_id = auth.uid()`)                        | host                    | host                           |
| `room_members` | a própria participação **ou** tudo da sala (host precisa ver pendentes) | só self como `pending` (approved só via `join_room`) | host (aprovar/rejeitar) | self **ou** host               |
| `queue_items`  | host ou membro aprovado da sala                                         | membro aprovado/host, adicionando para si            | **host-only**           | host only                      |
| `profiles`     | via view `profiles_public` (id/name/avatar_url, sem email)             | trigger `handle_new_user` (ninguém insere direto)    | próprio profile         | —                              |
| `consents`     | só o próprio usuário                                                     | próprio usuário (ou service role)                    | próprio usuário (ou service role) | —                          |
| `song_cache`   | sem política                                                            | sem política                                         | sem política            | sem política (só service role) |

### Pontos de atenção (segurança)

- **Host actions nunca relaxam na UI**: aprovar/reordenar/deletar fila e aprovar/rejeitar entrada são host-only no banco.
- **Status inicial da fila é derivado** (`queue_items_initial_status`): o client não escolhe; remove auto-aprovação por INSERT.
- **Aprovação de entrada** só via RPC `join_room` (`security definer`) — INSERT direto sempre vira `pending`.
- **Multi-tenancy**: toda tabela de domínio tem `room_id`; nada de assumir sala única.

---

## 4. Máquina de estados da fila

```mermaid
stateDiagram-v2
    direction LR
    [*] --> pending: sala manual
    [*] --> approved: sala auto
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

---

## 5. Fluxo de DB da operação "trocar música" (Proposta — Fase 5)

Na proposta em discussão (atualização in place via RPC `replace_queue_song` — ver [`fluxos-do-sistema.md`](./fluxos-do-sistema.md) §5), **position não muda** e o `updated_at` é tocado pelo trigger. Diagrama:

```mermaid
sequenceDiagram
    autonumber
    participant C as Client (authorizado)
    participant R as RPC replace_queue_song (security definer)
    participant DB as queue_items
    participant RT as Realtime room:{id}

    C->>R: item_id + novo vídeo (yt_id, title, thumb, duração)
    R->>DB: SELECT room/status/autor (validações)
    DB-->>R: item atual (position, status, added_by, room)
    R->>R: verifica: room active · autor OU host · status permitido
    R->>DB: UPDATE youtube_video_id, title, thumbnail_url, duration_seconds
    DB-->>R: item atualizado
    R->>DB: trigger updated_at = now()
    R-->>C: item atualizado (position intacta)
    DB-->>RT: broadcast de mudança (single UPDATE)
    RT-->>C: fila na UI reflete (sem reload)
```

---

## 6. Seed de dev (`npm run seed`)

```mermaid
flowchart TD
    A["node scripts/seed.mjs"] --> B["Auth Admin API: 3 usuários (IDs fixos)"]
    B --> C["trigger handle_new_user cria profiles"]
    C --> D["INSERT rooms (KARAOK, BAR2FO) + room_members + queue_items (idempotente)"]
    D --> E["Login dev: dono/ana/bruno @exemplo.com · senha123"]
```

> Usuários **não** são criados por SQL raw em `auth.users` (deixa o serviço Auth instável) — sempre Auth Admin API.
