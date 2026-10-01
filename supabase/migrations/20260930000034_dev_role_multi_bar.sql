-- Fase 8b·quater — papel `dev` + multi-bar/multi-sala para o dono da casa.
--
-- POR QUE: o dono/develop quer que a CONTA DELE (a conta GitHub) seja a canônica
-- e tenha privilégios acima de qualquer host — em especial poder criar quantas
-- salas quiser, e não só uma. Até aqui o modelo era 1 bar por usuário, e a
-- "multi-sala" era só uma affordance desligada na UI.
--
-- O QUE ESTA MIGRATION FAZ (tudo no banco — a RLS é a parede de verdade, a UI
-- só sugere):
--
--  1. `public.dev_accounts`: quem é dev. Tabela separada, RLS ligado e SEM
--     NENHUMA policy — espelha `youtube_oauth_tokens`, ou seja, só o service role
--     escreve. Deliberadamente NÃO é coluna em `profiles`: a policy
--     `profiles_update_own` (id = auth.uid()) deixaria qualquer usuário
--     promoting a si mesmo, que é justamente o que um papel de dev não pode ser.
--  2. `public.is_dev()`: helper `security definer` (sem isso a RLS da tabela
--     acima esconderia a linha do próprio dev).
--  3. Tira o `unique` de `bars.host_id` (o limite de 1 bar por usuário era
--     estrutural, não só de UI). O índice `bars_host_id_idx` continua.
--  4. `create_bar`: dev unlimited; qualquer outro continua com 1 bar (a regra do
--     produto — o dono "é a casa", MANIFEST §5). É o ÚNICO lugar onde a regra
--     mora, para não ter duas cópias para divergirem.
--  5. `create_room(p_bar_id, p_codigo)`: nova RPC — antes não existia caminho
--     para criar uma 2ª sala dentro de um bar existente (`create_bar` sempre
--     nasce com exatamente 1 sala). Exige ser dono do bar; reusa
--     `unique_room_code`, que já deduplica contra rooms E bars.
--
-- O QUE NÃO MUDA: as policies de `bars`/`rooms` continuam host-only, e
-- `create_room` não abre brecha — quem não é dono é recusado na própria RPC,
-- antes de qualquer escrita.

-- ---------------------------------------------------------------------------
-- 1) Quem é dev
-- ---------------------------------------------------------------------------
create table if not exists public.dev_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- RLS sem policy = ninguém via Data API lê/escreve; só o service role.
alter table public.dev_accounts enable row level security;

-- ---------------------------------------------------------------------------
-- 2) is_dev(): o usuário da sessão é dev?
-- ---------------------------------------------------------------------------
create or replace function public.is_dev()
returns boolean
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select exists (
    select 1 from public.dev_accounts d where d.user_id = auth.uid()
  );
$$;

grant execute on function public.is_dev() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3) Multi-bar: 1 bar por usuário deixa de ser estrutural
-- ---------------------------------------------------------------------------
alter table public.bars drop constraint if exists bars_host_id_key;
-- O índice já existe (20260923000010); recriado aqui para o caso de o projeto
-- ter vindo de fora sem ele.
create index if not exists bars_host_id_idx on public.bars (host_id);

-- ---------------------------------------------------------------------------
-- 4) create_bar: dev unlimited, os demais com 1 bar
-- ---------------------------------------------------------------------------
-- ATENÇÃO — overload legado. `20260923000014` deixou uma create_bar de 5
-- argumentos (p_nome, p_cidade, p_endereco, p_quantidade_mesas, p_rotulos),
-- anterior à de raio/coords/código, e ela continua `security definer` com
-- EXECUTE para `authenticated`. Se ficasse, seria um bypass: ela não tem a
-- regra "um bar por host" (e nem tem os parâmetros de raio, que viraram
-- obrigatórios no produto). A UI só chama a versão de 9 argumentos, então
-- dropar a de 5 não quebra ninguém — e é o que fecha o teto de 1 bar.
drop function if exists public.create_bar(text, text, text, int, text[]);

drop function if exists public.create_bar(
  text, text, text, int, text[], numeric, numeric, int, text
);

create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[] default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_raio_permitido_metros int default 500,
  p_codigo text default null
)
returns table (bar_id uuid, bar_code text, room_id uuid, room_code text)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_bar_id uuid := gen_random_uuid();
  v_room_id uuid := gen_random_uuid();
  v_bar_code text;
  v_room_code text;
  v_raio int;
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para criar o seu bar';
  end if;
  -- Regra do produto (MANIFEST §5): o dono "é a casa". Quem não é dev fica com
  -- UM bar; o dev (a conta do dono do projeto) não tem esse teto.
  if not public.is_dev() and exists (
    select 1 from public.bars b where b.host_id = auth.uid()
  ) then
    raise exception 'você já tem um bar — cada dono tem uma casa';
  end if;
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'informe o nome do bar';
  end if;
  if p_quantidade_mesas < 1 or p_quantidade_mesas > 999 then
    raise exception 'quantidade de mesas inválida (1–999)';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'localização incompleta';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'latitude inválida';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'longitude inválido';
  end if;
  v_raio := p_raio_permitido_metros;
  if v_raio is null or v_raio < 50 or v_raio > 1000 then
    raise exception 'raio de presença inválido (50–1000 m)';
  end if;

  v_bar_code := public.generate_bar_code();
  v_room_code := public.unique_room_code(coalesce(nullif(btrim(p_codigo), ''), 'KARAOKE'));

  insert into public.bars (
    id, host_id, code, nome, cidade, endereco, quantidade_mesas,
    latitude, longitude, raio_permitido_metros
  )
  values (
    v_bar_id,
    auth.uid(),
    v_bar_code,
    btrim(p_nome),
    nullif(btrim(coalesce(p_cidade, '')), ''),
    nullif(btrim(coalesce(p_endereco, '')), ''),
    p_quantidade_mesas,
    p_latitude,
    p_longitude,
    v_raio
  );

  for v_n in 1..p_quantidade_mesas loop
    insert into public.mesas (bar_id, numero, rotulo)
    values (
      v_bar_id,
      v_n,
      case
        when p_rotulos is not null and v_n <= array_length(p_rotulos, 1)
          then nullif(btrim(coalesce(p_rotulos[v_n], '')), '')
        else null
      end
    );
  end loop;

  insert into public.rooms (id, bar_id, code, host_id)
  values (v_room_id, v_bar_id, v_room_code, auth.uid());

  bar_id := v_bar_id;
  bar_code := v_bar_code;
  room_id := v_room_id;
  room_code := v_room_code;
  return next;
end;
$$;

grant execute on function public.create_bar(
  text, text, text, int, text[], numeric, numeric, int, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) create_room: uma 2ª (3ª, Nª) sala dentro de um bar que já existe
-- ---------------------------------------------------------------------------
create or replace function public.create_room(
  p_bar_id uuid,
  p_codigo text default null
)
returns table (room_id uuid, room_code text)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room_id uuid := gen_random_uuid();
  v_room_code text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para abrir uma sala';
  end if;
  -- Autorização ANTES de qualquer escrita: dono do bar, e a sala tem que estar
  -- ativa. `is_bar_host` é security definer, então enxerga a linha do bar.
  if not exists (
    select 1 from public.bars b
     where b.id = p_bar_id and b.host_id = auth.uid()
  ) then
    raise exception 'bar não encontrado';
  end if;

  v_room_code := public.unique_room_code(
    coalesce(nullif(btrim(p_codigo), ''), 'KARAOKE')
  );

  insert into public.rooms (id, bar_id, code, host_id)
  values (v_room_id, p_bar_id, v_room_code, auth.uid());

  room_id := v_room_id;
  room_code := v_room_code;
  return next;
end;
$$;

grant execute on function public.create_room(uuid, text) to authenticated;