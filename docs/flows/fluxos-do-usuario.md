# Fluxos do usuário

Jornadas por persona no MVP. Foco em telas, toques e decisões — o "quê" e o "porquê"; o "como" técnico está em [`fluxos-do-sistema.md`](./fluxos-do-sistema.md).

Personas:

- **Host** — dono do bar/restaurante que controla a sala.
- **Participante** — cliente que escaneia o QR e adiciona músicas.
- **Tela kiosk** — TV/projetor em modo quiosque (rota pública `/player/[codigoDaSala]`).

---

## 1. Primeiro acesso (todos)

Tela de bifurcação (MVP — spec §2.5): antes de qualquer login, o usuário escolhe o perfil ("Quero cantar" / "Sou dono"). O texto dos botões segue o idioma do navegador; a coleta de idioma/geolocalização e o cookie de preferências (idioma + último perfil) só ocorrem após o **aceite de cookies** (LGPD/GDPR), independentemente do botão escolhido. Se já há sessão, o proxy pula para o dashboard (real) ou `/entrar` (anônimo).

```mermaid
flowchart TD
    A["Abre o app"] --> B{Tem sessão?}
    B -->|anônimo| B1["/entrar (entrar no bar via QR/código)"]
    B -->|conta real| G["/dashboard"]
    B -->|não| C["Tela 1 — Onboarding<br/>2 botões (Quero cantar / Sou dono) + aceite de cookies"]
    C --> D{"Perfil"}
    D -->|cantar| E["/login"]
    D -->|dono| F["/login"]
    E --> E1["/login: 'Continuar sem login' → signInAnonymously → /entrar<br/>ou logar com provedor → /dashboard"]
    F --> G
    G --> H["Diferença fica nas ações:<br/>host cria/gerencia bar e aprovações;<br/>participante entra via QR/código, escolhe a mesa e adiciona músicas"]
```

Após o login, o fluxo de sessão/dashboard é comum aos dois perfis (ver [`fluxos-do-sistema.md`](./fluxos-do-sistema.md) §1).

---

## 2. Host — criar bar e começar a noite

```mermaid
flowchart TD
    A["/dashboard"] --> B["'Criar meu bar' (Dialog): nome, cidade, endereço,<br/>quantidade de mesas"]
    B --> C["Bar criado: código 6 chars + QR do bar + QR das mesas"]
    C --> D["Configura: modo de entrada (open/aprovação),<br/>fila (auto/manual), confirmação de música"]
    D --> E["Tela do host: fila + painéis de aprovação"]
    E --> F["Publica QR das mesas (cartaz) p/ participantes"]
    F --> G["Host acompanha em aprovação realtime e controla playback pelo celular"]
    G --> H["Fim da noite: fechar a sala (não aceita mais ninguém)"]
```

---

## 3. Participante — entrar e adicionar música

```mermaid
flowchart TD
    A["Escaneia QR do bar (escolhe mesa)<br/>QR da mesa (mesa já vem) / digita code"] --> P["get_entry_preview: preview do bar + karaokê único ativo"]
    P --> M{"Mesa definida?"}
    M -->|não| M1["Escolhe a mesa (grid 1..N)"]
    M -->|sim| M1
    M1 --> B["join_room(room_code, mesa) (RPC)"]
    B --> C{Sala em modo open?}
    C -->|sim| D["Entra direto — vê a fila e busca ('Bar · Mesa N')"]
    C -->|não| E["Pedido pendente — 'aguardando aprovação do host'"]
    E --> F{Host aprova?}
    F -->|sim| D
    F -->|não| G["Aviso: entrada recusada (pode tentar de novo)"]
    D --> H["Busca música (YouTube)"]
    H --> I{Sala pede confirmação?}
    I -->|sim| J["Confirma thumbnail/título/duração"]
    J --> K["Música adicionada à fila"]
    I -->|não| K
    K --> L{Modo de fila da sala}
    L -->|auto| M2["Entrou direto (na fila)"]
    L -->|manual| N["Ficou 'pendente' até host aprovar"]
    M2 --> O["Participante acompanha a fila ao vivo (Realtime)"]
    N --> O
```

### 3.3 Participante — trocar a própria música mantendo a posição (Proposta, Fase 5)

```mermaid
flowchart TD
    A["Item em 'meus pedidos' (ainda não tocou)"] --> B["'Trocar música'"]
    B --> C["Abre a mesma busca da Fase 4"]
    C --> D["Escolhe novo vídeo"]
    D --> E{Sala pede confirmação?}
    E -->|sim| F["Modal confirmação do novo vídeo"]
    E -->|não| G["Troca aplicada"]
    F --> G
    G --> H["Item mantém a POSIÇÃO na fila (não volta ao fim)"]
    G --> I["Status preservado: approved segue approved<br/>(mesmo em sala manual)"]
    H --> J["Fila atualiza ao vivo na tela (Realtime)"]
    I --> J
```

---

## 4. Host — aprovar entradas e músicas

```mermaid
flowchart TD
    A["Notificação realtime (entrada ou música pendente)"] --> B["Painel/drawer de aprovação sem sair da tela"]
    B --> C{Decisão}
    C -->|entrada aprovada| D["Participante entra / fica 'na fila'"]
    C -->|entrada recusada| E["Participante em 'rejected'"]

    C -->|música aprovada| F["Vira próximo da fila"]
    C -->|música recusada| G["Some da fila com aviso"]
    D --> H["Host continua em aprovação de fila + playback"]
    F --> H
```

---

## 5. Tela kiosk — do vazio ao show

```mermaid
flowchart TD
    A["Estado vazio: QR grande + 'escaneie para adicionar'"] --> B["1º participante entra/adiciona (open ou após aprovação)"]
    B --> C["1º toque destrava autoplay (restrição mobile)"]
    C --> D["Toca; fila lateral legível a distância; destaque para 'próxima'"]
    D --> E["Eventos realtime sem reload: play/pause/skip/reorder"]
    E --> F["Fim da noite: sala fechada → tela de encerramento ou volta ao CTA de QR"]
```

---

## 6. Controle de playback (host, pelo celular)

```mermaid
flowchart LR
    A["Host no celular (qualquer lugar da casa)"] --> B["Botões play/pause/skip/next"]
    B --> C["Publica evento no canal room:{id}"]
    C --> D["Player kiosk reage (vídeo muda/para/pula)"]
    D --> E["Fila persistida reflete o estado atual (backend)"]
```

---

## Anexo — decisões que afetam os fluxos acima (fechadas com o PO)

| #   | Decisão                            | Impacto                                                                                       |
| --- | ---------------------------------- | --------------------------------------------------------------------------------------------- |
| D1  | Quem pode trocar a música          | §3.3: **autor ou host** (host também **reordena** a playlist)                                 |
| D2  | Status ao trocar em sala manual    | §3.3: **mantém aprovada** — não volta ao fim nem re-aprovação                                 |
| D3  | Estados em que a troca é permitida | §3.3: `pending`+`approved`; host adiciona músicas **sem limite**, respeitando a ordem da fila |

As opções detalhadas estão na **seção 5 de [`fluxos-do-sistema.md`](./fluxos-do-sistema.md)**.
