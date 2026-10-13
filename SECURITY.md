# Política de Segurança

O Karaokê Watch Party lida com dados de pessoas em bares (incluindo localização
aproximada e preferências musicais) e roda com credenciais de integração
(YouTube/OAuth, Supabase service role, token do player da TV). Levamos segurança
a sério.

## Reportando uma vulnerabilidade

**Não abra uma issue pública** para vulnerabilidades. Em vez disso, use o canal
privado do GitHub:

1. Vá em **Security ▸ Advisories ▸ "Report a vulnerability"** neste repositório
   (<https://github.com/cavalcanteprofissional/karaoke-flow/security/advisories/new>).
2. Inclua: descrição, impacto, passos de reprodução e, se possível, uma sugestão
   de correção.

Se preferir, envie um e-mail para o mantenedor indicado no perfil do repositório.
Você receberá uma confirmação de leitura; trabalhamos para responder em poucos
dias.

## Escopo

Fazem parte do escopo, entre outros:

- Contorno de RLS ou das RPCs `security definer` (acesso a dados de outra
  sala/bar, escalada de privilégio, bypass das travas `BEFORE INSERT/UPDATE`).
- Exposição do **token do player da TV** (`/player/<código>?token=…`) ou das
  chaves `YOUTUBE_*` / `SUPABASE_SERVICE_ROLE_KEY` ao browser.
- Account takeover via OAuth (`linkIdentity` / auto-link por e-mail).
- Falhas de autorização no host (controle de playback, aprovação de entrada,
  geração de pulseiras).

## Fora do escopo (por desenho — não é vulnerabilidade)

- **O link da TV é uma credencial de capacidade**: quem tem o link acessa o
  player. A mitigação é o botão "gerar novo link" (`rotate_player_token`), não um
  login na TV (ver [ADR-002](./docs/decisions/ADR-002-player-isolated-by-token-and-kiosk-only.md)).
- **A identidade do visitante anônimo é do navegador** (limpar os dados do site
  cria outra). É um limite declarado, não um bug — ver
  [`docs/flows/fluxos-do-sistema.md`](./docs/flows/fluxos-do-sistema.md) §3.1.2.
- Ausência de rate limiting distribuído / observabilidade avançada: está no
  backlog em [`docs/engenharia/melhorias.md`](./docs/engenharia/melhorias.md).

## Boas práticas para contribuidores

- Nunca versione segredos. O repositório é **público** e `npm run scan:secrets`
  roda no CI.
- Leia [`CONTRIBUTING.md`](./CONTRIBUTING.md) e
  [`docs/engenharia/auditoria-rls.md`](./docs/engenharia/auditoria-rls.md) antes
  de mexer em RLS, RPCs ou triggers.
