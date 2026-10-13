-- Item 3 da validação no aparelho — "código único = nome do bar".
--
-- Antes existiam DOIS códigos: `bars.code` (6 chars aleatórios, no QR do bar e
-- no login) e `rooms.code` (configurável, derivado do nome, no QR da sala e no
-- card "Código de entrada"). O host via "Bar criado! Código ZEHBAR" e, na
-- sequência, um código diferente (KARAOKE) no card — dois códigos para a mesma
-- casa, um deles impossível de lembrar.
--
-- Agora é UM código só, derivado do nome: `bars.code` passa a aceitar 3–12
-- (mesmo padrão de `rooms.code`) e `rooms.code` espelha o código do bar. A
-- resolução de entrada já tentava o bar primeiro (`get_entry_preview`), então
-- código de bar == código de sala continua resolvendo para o bar e sua sala.
--
--  1) bars.code: de 6 fixos para 3–12 alfanuméricos em maiúsculas.
--  2) unique_bar_code(p_code, p_bar_id): dedup entre bars e salas de OUTRO bar.
--  3) unique_room_code(p_code, p_bar_id): passa a ignorar o próprio bar (a sala
--     espelha o código dele); sufixos 2..99 continuam valendo para multi-sala.
--  4) create_bar: código do bar = código da sala (o p_codigo do app já vem
--     derivado do nome via `deriveRoomCodeFromName`).
--  5) create_room: base = código do bar quando o host não informa nada.
--  6) update_bar_code(p_bar_id, p_code): troca o código do bar e espelha na
--     sala (host-only), usada pelo card "Código de entrada".
--  7) Backfill: ZEHBAR/KARAOKE → KARAOKEDOZE, BARSEG/BAR2FO → BARDASESQUIN.

-- 1) bars.code: 3–12 letras/números em maiúsculas (mesmo padrão de rooms).
alter table public.bars drop constraint if exists bars_code_check;
alter table public.bars add constraint bars_code_check
  check (
    char_length(code) between 3 and 12
    and code = upper(code)
    and code ~ '^[A-Z0-9]+$'
  );

-- 2) Dedup entre bars e salas de OUTRO bar (a própria sala do bar espelha o
--    código dele e não conta como colisão).
drop function if exists public.unique_bar_code(text);
drop function if exists public.unique_bar_code(text, uuid);
create or replace function public.unique_bar_code(
  p_code text,
  p_bar_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_code text := upper(btrim(p_code));
  v_candidate text;
  v_suffix int;
begin
  -- Transliteração PT-BR antes de descartar o resto: "Karaokê" → KARAOKE, e
  -- não KARAOK (que perderia o E com o é cortado).
  v_code := translate(
    v_code,
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNY'
  );
  v_code := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
  if length(v_code) < 3 then
    v_code := 'KARAOKE';
  end if;
  v_code := left(v_code, 12);

  v_candidate := v_code;
  for v_suffix in 0..99 loop
    if v_suffix > 0 then
      v_candidate := left(v_code, 12 - length(v_suffix::text)) || v_suffix::text;
    end if;
    if not exists (
         select 1 from public.bars
          where code = v_candidate
            and (p_bar_id is null or id <> p_bar_id)
       )
       and not exists (
         select 1 from public.rooms
          where code = v_candidate
            and (p_bar_id is null or bar_id is distinct from p_bar_id)
       ) then
      return v_candidate;
    end if;
  end loop;

  raise exception 'sem código de bar disponível (todos os sufixos ocupados)';
end;
$$;

-- 3) unique_room_code: p_bar_id opcional — ignora o próprio bar na dedup (a
--    sala espelha o código dele). Sem p_bar_id (default_room_code) o
--    comportamento antigo é preservado.
drop function if exists public.unique_room_code(text);
drop function if exists public.unique_room_code(text, uuid);
create or replace function public.unique_room_code(
  p_code text,
  p_bar_id uuid default null
)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_code text := upper(btrim(p_code));
  v_candidate text;
  v_suffix int;
begin
  v_code := translate(
    v_code,
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNY'
  );
  v_code := regexp_replace(v_code, '[^A-Z0-9]', '', 'g');
  if length(v_code) < 3 then
    raise exception 'código de sala inválido (3–12 letras ou números, sem acentos)';
  end if;
  v_code := left(v_code, 12);

  v_candidate := v_code;
  for v_suffix in 0..99 loop
    if v_suffix > 0 then
      v_candidate := left(v_code, 12 - length(v_suffix::text)) || v_suffix::text;
    end if;
    if not exists (select 1 from public.rooms where code = v_candidate)
       and not exists (
         select 1 from public.bars
          where code = v_candidate
            and (p_bar_id is null or id <> p_bar_id)
       ) then
      return v_candidate;
    end if;
  end loop;

  raise exception 'sem código de sala disponível (todos os sufixos ocupados)';
end;
$$;

-- 4) create_bar: o código do bar vira o mesmo da sala (nome do bar).
drop function if exists public.create_bar(
  text, text, text, int, text[], numeric, numeric, int, text, boolean
);

create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[],
  p_latitude numeric,
  p_longitude numeric,
  p_raio_permitido_metros int,
  p_codigo text,
  p_pulseiras_ativadas boolean
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

  -- CÓDIGO ÚNICO (item 3): o bar usa o código derivado do nome; a sala espelha.
  v_bar_code := public.unique_bar_code(
    coalesce(nullif(btrim(p_codigo), ''), p_nome, 'KARAOKE'),
    v_bar_id
  );
  v_room_code := v_bar_code;

  insert into public.bars (
    id, host_id, code, nome, cidade, endereco, quantidade_mesas,
    latitude, longitude, raio_permitido_metros, pulseiras_ativadas
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
    v_raio,
    coalesce(p_pulseiras_ativadas, false)
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
  text, text, text, int, text[], numeric, numeric, int, text, boolean
) to authenticated;

-- 5) create_room: base = código do bar quando o host não informa nada
--    (multi-sala do dev ganha sufixo via unique_room_code).
drop function if exists public.create_room(uuid, text);

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
  v_bar_code text;
  v_room_code text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para abrir uma sala';
  end if;
  -- Autorização ANTES de qualquer escrita: quem não é dono do bar é recusado
  -- aqui, sem criar nada.
  if not exists (
    select 1 from public.bars b
     where b.id = p_bar_id and b.host_id = auth.uid()
  ) then
    raise exception 'bar não encontrado';
  end if;
  -- Teto de 1 karaokê por dono, exceto dev (mesma exceção de `create_bar`).
  if not public.is_dev() and exists (
    select 1 from public.rooms r where r.host_id = auth.uid()
  ) then
    raise exception 'você já tem uma sala — cada dono tem um karaokê';
  end if;

  select b.code into v_bar_code from public.bars b where b.id = p_bar_id;

  v_room_code := public.unique_room_code(
    coalesce(nullif(btrim(p_codigo), ''), v_bar_code, 'KARAOKE'),
    p_bar_id
  );

  insert into public.rooms (id, bar_id, code, host_id)
  values (v_room_id, p_bar_id, v_room_code, auth.uid());

  room_id := v_room_id;
  room_code := v_room_code;
  return next;
end;
$$;

grant execute on function public.create_room(uuid, text) to authenticated;

-- 6) Troca do código de entrada pelo host: muda o bar e espelha na sala.
drop function if exists public.update_bar_code(uuid, text);
create or replace function public.update_bar_code(p_bar_id uuid, p_code text)
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_new text;
  v_old text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if not public.is_bar_host(p_bar_id, auth.uid()) then
    raise exception 'bar não encontrado';
  end if;

  v_new := upper(btrim(p_code));
  v_new := translate(
    v_new,
    'ÁÀÂÃÄÅÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑÝ',
    'AAAAAAEEEEIIIIOOOOOUUUUCNY'
  );
  v_new := regexp_replace(v_new, '[^A-Z0-9]', '', 'g');
  if length(v_new) < 3 or length(v_new) > 12 then
    raise exception 'código de bar inválido (3–12 letras ou números)';
  end if;

  select code into v_old from public.bars where id = p_bar_id;
  if v_new = v_old then
    return v_new;
  end if;

  if exists (
    select 1 from public.bars
     where code = v_new and id <> p_bar_id
  ) then
    raise exception 'este código já pertence a outro bar';
  end if;
  if exists (
    select 1 from public.rooms
     where code = v_new and bar_id is distinct from p_bar_id
  ) then
    raise exception 'este código já pertence a outro karaokê';
  end if;

  update public.bars set code = v_new where id = p_bar_id;
  -- Espelha nas salas que usavam o código antigo do bar (na prática, a única).
  update public.rooms
     set code = v_new
   where bar_id = p_bar_id
     and code = v_old;

  return v_new;
end;
$$;

grant execute on function public.update_bar_code(uuid, text) to authenticated;

-- 7) Backfill: um código por bar, derivado do nome; salas espelham.
do $$
declare
  r record;
  v_code text;
begin
  for r in
    select id, nome from public.bars order by criado_em, id
  loop
    v_code := public.unique_bar_code(r.nome, r.id);
    update public.bars set code = v_code where id = r.id;
    update public.rooms set code = v_code where bar_id = r.id;
  end loop;
end $$;

notify pgrst, 'reload schema';
