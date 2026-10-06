-- Fase 8f — política de credencial do YouTube por bar (spec §12/§13).
--
-- O PROBLEMA QUE ESTA MIGRATION FECHA (e que a auditoria de RLS não pegou,
-- porque não é brecha — é fair-share):
--
-- A rota de busca resolve a credencial por uma cadeia de 4 degraus
-- (`src/lib/youtube/credentials.ts`): chave do bar → OAuth do host → OAuth do
-- app → `YOUTUBE_API_KEY`. O 4º degrau é a chave de desenvolvimento do dono, e
-- era alcançado por QUALQUER sala que não tivesse nada nos 3 primeiros — porque
-- a única condição era "a env existe". Na prática: qualquer bar que aparecesse no
-- produto passou a gastar a cota pessoal do dono, sem ele saber e sem poder
-- recusar. O sintoma em produção foi a busca respondendo 502 para um dono que
-- nunca configurou nada, com mensagem genérica que escondia a causa
-- (`toFriendlyYouTubeError` descartava o `reason` do Google).
--
-- DECISÃO DO DONO (2026-10-05): padrão `own_only` — o bar é responsável pela
-- própria credencial (chave que ele cola, ou a conta Google que ele conecta). O
-- "pool da plataforma" (chaves de uma conta de EMPRESA, distribuídas pelo dev
-- com teto por bar) existe como opção EXPLÍCITA por bar, desligada por padrão.
-- E a chave de dev continua existindo, mas apenas para quem tem o papel `dev`
-- — assim a conta dele funciona local E remoto sem virar fallback de ninguém.
--
-- ONDE A REGRA MORA: no banco, como trigger — não em `if` de TypeScript.
-- `own_only` com pool apontado, ou `platform_pool` sem pool, é estado
-- IMPOSSÍVEL, e nenhum caminho de escrita (Data API direto, RPC, management)
-- consegue produzi-lo. Mesmo padrão de `20260930000036` (regras de negócio que
-- RLS não expressa).
--
-- `auth.uid() is null` = service_role / seed / migration / Management API: não
-- enforce. A política é escolha do dono do bar, mas o seed e a manutenção do
-- pool precisam poder escrever qualquer combinação.

-- ---------------------------------------------------------------------------
-- 1) O pool: chaves da conta de EMPRESA, com orçamento diário
-- ---------------------------------------------------------------------------
-- RLS ligado e SEM NENHUMA policy: só o service role lê e escreve. Espelha
-- `song_cache` e `youtube_oauth_tokens` — a chave nunca é legível pelo papel
-- `authenticated`, nem por uma RPC "só para membros": o participante chamaria a
-- RPC pelo PostgREST e leria a chave do mesmo jeito (o mesmo argumento da
-- auditoria F1, migration `20260930000038`).
create table if not exists public.youtube_credential_pools (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  -- Chave do YouTube Data API da conta de EMPRESA. Sem restrição de origem: a
  -- chamada é server-side e não manda Referer (ver `errors.ts`, `KEY_RESTRICTED`).
  api_key text not null check (char_length(api_key) between 10 and 200),
  -- Teto de buscas NÃO cacheadas por dia UTC. O `search.list` custa 100
  -- unidades e o plano gratuito dá 10.000/dia (≈99 buscas) — o orçamento
  -- existe para o erro chegar como "cota deste bar", não como "cota do projeto".
  daily_search_budget int not null default 80
    check (daily_search_budget between 1 and 10000),
  active boolean not null default true,
  criado_em timestamptz not null default now()
);

alter table public.youtube_credential_pools enable row level security;

-- ---------------------------------------------------------------------------
-- 2) A política do bar
-- ---------------------------------------------------------------------------
alter table public.bars
  add column if not exists youtube_credential_policy text not null default 'own_only',
  add column if not exists youtube_pool_id uuid;

-- O FK vai por partes, e não como `references ... on delete set null` na mesma
-- linha acima, por dois motivos:
--   1) `on delete set null` ANULAVA a invariante que o trigger de baixo
--      existe para sustentar. Apagar um pool deixaria o bar em
--      `platform_pool` com `youtube_pool_id` nulo — o estado que o trigger
--      recusa na escrita, alcançado por fora dela. O trigger é `before insert
--      or update of bars`, então um `DELETE` na outra tabela nem o acorda.
--      `restrict` transforma isso em recusa explícita: primeiro o bar volta para
--      `own_only` (ou aponta outro pool), só então o pool sai.
--   2) `alter table ... add column if not exists ... references` falha se a
--      coluna já existir (o `if not exists` cobre a coluna, não a constraint),
--      o que quebraria a reaplicação da migration num banco já parcial.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bars_youtube_pool_id_fkey'
  ) then
    alter table public.bars
      add constraint bars_youtube_pool_id_fkey
      foreign key (youtube_pool_id)
      references public.youtube_credential_pools (id) on delete restrict;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'bars_youtube_credential_policy_check'
  ) then
    alter table public.bars
      add constraint bars_youtube_credential_policy_check
      check (youtube_credential_policy in ('own_only', 'platform_pool'));
  end if;
end;
$$;

create index if not exists bars_youtube_pool_id_idx
  on public.bars (youtube_pool_id)
  where youtube_pool_id is not null;

-- ---------------------------------------------------------------------------
-- 3) A coerência policy↔pool, no banco
-- ---------------------------------------------------------------------------
-- Por que só em `bars` e não também em `rooms`: a chave de API é coluna de
-- `rooms` (o dono cola por sala, via `admin_set_room_youtube_api_key`), mas a
-- *política* é decisão do dono do bar e vale para todas as salas dele. Guardar
-- nos dois lugares seria duas cópias para divergirem — exatamente o que o
-- comentário da `20260930000036` diz para não fazer. A busca herda a política
-- pelo `room.bar_id`.
create or replace function public.trg_bars_guard_youtube_credential_policy()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  -- `own_only`: o bar é responsável pela própria credencial. Apontar um pool
  -- aqui seria estado que mente — a política diz "traga a sua" e a infra diz
  -- "use a nossa", e ninguém descobre qual das duas vale.
  if new.youtube_credential_policy = 'own_only' and new.youtube_pool_id is not null then
    raise exception 'a política "own_only" não usa pool da plataforma'
      using errcode = '22023';
  end if;

  -- `platform_pool`: sem pool — ou com pool inativo — a busca cai para a cadeia
  -- vazia e o participante ganha "Nenhuma credencial configurada" sem ninguém
  -- saber que o bar pediu para usar o pool. Melhor recusar na escrita.
  if new.youtube_credential_policy = 'platform_pool' then
    if new.youtube_pool_id is null then
      raise exception 'a política "platform_pool" exige um pool ativo'
        using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.youtube_credential_pools
      where id = new.youtube_pool_id and active
    ) then
      raise exception 'o pool da plataforma apontado não existe ou está inativo'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists bars_guard_youtube_credential_policy on public.bars;
create trigger bars_guard_youtube_credential_policy
  before insert or update of youtube_credential_policy, youtube_pool_id on public.bars
  for each row execute function public.trg_bars_guard_youtube_credential_policy();

-- ---------------------------------------------------------------------------
-- 4) A saúde da credencial, por bar — só dev, sem segredo
-- ---------------------------------------------------------------------------
-- Por que RPC e não `select`: (a) `youtube_credential_pools` não tem policy, ou
-- seja, via Data API é invisível — mesmo DEFAULT PRIVILEGES do projeto já
-- esconde a tabela de quem não é service role; (b) o host não pode ler
-- `rooms.youtube_api_key` desde a auditoria F1 (00038), e a resposta precisa ser
-- a mesma para todos os bars, sem vazar chave nenhuma.
--
-- O que devolve: booleanos e rótulos. `pool_label` é texto escolhido por
-- alguém no painel do dev — não é segredo, é o que o dono do bar precisa ler na
-- tela ("usando o pool Karaokê Party").
create or replace function public.admin_youtube_credential_health(p_bar_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog, pg_temp
as $$
declare
  v_bar public.bars%rowtype;
  v_pool_label text;
  v_pool_active boolean;
  v_rooms_total int;
  v_rooms_with_key int;
begin
  -- Só dev. Não é `is_host`: a tela é de gestão de todos os bars, e o dono
  -- do bar vê a própria saúde pela página da sala (que usa
  -- `admin_get_room_youtube_api_key`, host-only).
  if auth.uid() is null or not public.is_dev() then
    raise exception 'sem permissão'
      using errcode = '42501';
  end if;

  select * into v_bar from public.bars where id = p_bar_id;
  if not found then
    raise exception 'bar não encontrado'
      using errcode = 'P0002';
  end if;

  if v_bar.youtube_pool_id is not null then
    select label, active into v_pool_label, v_pool_active
    from public.youtube_credential_pools
    where id = v_bar.youtube_pool_id;
  end if;

  select
    count(*),
    count(*) filter (where r.youtube_api_key is not null)
  into v_rooms_total, v_rooms_with_key
  from public.rooms r
  where r.bar_id = p_bar_id;

  return jsonb_build_object(
    'bar_id', v_bar.id,
    'host_id', v_bar.host_id,
    'policy', v_bar.youtube_credential_policy,
    'pool_label', v_pool_label,
    'pool_active', coalesce(v_pool_active, false),
    'pool_id', v_bar.youtube_pool_id,
    'rooms_total', coalesce(v_rooms_total, 0),
    'rooms_with_own_key', coalesce(v_rooms_with_key, 0),
    -- A conta do dono do bar tem OAuth do YouTube conectado? (o refresh_token
    -- NUNCA sai daqui: só o booleano.)
    'host_oauth_connected', exists (
      select 1 from public.youtube_oauth_tokens t where t.host_id = v_bar.host_id
    ),
    -- Cota que o BARMG vai herdar se a política for platform_pool. 0 quando
    -- `own_only`, porque nesse caso o orçamento é do projeto do próprio dono.
    'inherits_pool_budget', v_bar.youtube_credential_policy = 'platform_pool'
  );
end;
$$;

-- Mesma armadilha da `admin_room_occupancy` (00040): `FROM public` sozinho não
-- tira o `anon` (default privileges do projeto). Revoke nos dois, grant só no
-- papel certo — e `authenticated`, não `anon`, porque `is_dev()` já falha
-- fechado para quem não tem linha em `dev_accounts`.
revoke execute on function public.admin_youtube_credential_health(uuid) from public;
revoke execute on function public.admin_youtube_credential_health(uuid) from anon;
grant execute on function public.admin_youtube_credential_health(uuid) to authenticated;

-- O card do dev é ao vivo e o trigger acima mudou a assinatura de `bars` para o
-- PostgREST (coluna nova). Sem isto, a primeira leitura pós-deploy recebe
-- `PGRST204` até o schema recarregar.
notify pgrst, 'reload schema';