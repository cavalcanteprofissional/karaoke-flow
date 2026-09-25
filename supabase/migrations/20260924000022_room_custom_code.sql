-- Código de entrada da sala configurável pelo host (default "KARAOKE") +
-- entrada direta por código (sem mesa) com escolha de mesa dentro da sala.
--
--  1) rooms.code: de 6 fixos para 3–12 alfanuméricos em maiúsculas.
--  2) unique_room_code(p_code): deduplica contra rooms E bars (a resolução de
--     entrada tenta o bar primeiro — código de sala não pode colidir com bar).
--  3) default_room_code(): "KARAOKE", depois KARAOKE2, KARAOKE3… (até 99).
--  4) room_code_available(p_code): usado pela client action de troca de código.
--  5) create_bar ganha p_codigo (opcional): null → default; preenchido → unique.
--  6) join_room: p_mesa opcional — quem entra por código passa a sala SEM mesa
--     (a mesa passa a ser escolhida dentro da sala; QR de mesa continua trazendo).
--  7) pick_mesa(p_room_id, p_mesa): membro aprovado marca a sua mesa.
--  8) Renomeia a sala do seed KARAOK → KARAOKE.

-- 1) rooms.code: 3–12 letras/números em maiúsculas (sem acentos/espaços).
alter table public.rooms drop constraint if exists rooms_code_check;
alter table public.rooms add constraint rooms_code_check
  check (length(code) between 3 and 12 and code = upper(code) and code ~ '^[A-Z0-9]+$');

-- 2) Dedup contra rooms e bars, com sufixos 2..99 e truncamento a 12 chars.
drop function if exists public.unique_room_code(text);
create or replace function public.unique_room_code(p_code text)
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
       and not exists (select 1 from public.bars where code = v_candidate) then
      return v_candidate;
    end if;
  end loop;

  raise exception 'sem código de sala disponível (todos os sufixos ocupados)';
end;
$$;

-- 3) Default: "KARAOKE", senão KARAOKE2, KARAOKE3…
drop function if exists public.default_room_code();
create or replace function public.default_room_code()
returns text
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  return public.unique_room_code('KARAOKE');
end;
$$;

-- 4) Disponível para o host trocar o código (ignora RLS do client).
drop function if exists public.room_code_available(text);
create or replace function public.room_code_available(p_code text)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_code text := upper(btrim(p_code));
begin
  return not exists (select 1 from public.rooms where code = v_code)
     and not exists (select 1 from public.bars where code = v_code);
end;
$$;

-- 5) create_bar ganha p_codigo (opcional) ao final; notação nomeada preservada.
drop function if exists public.create_bar(text, text, text, int, text[], numeric, numeric, int);
drop function if exists public.create_bar(text, text, text, int, text[], numeric, numeric, int, text);

create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[] default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_raio_permitido_metros int default 150,
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
    raise exception 'longitude inválida';
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

-- 6) join_room: p_mesa opcional. Entrada por código entra SEM mesa (escolha
-- dentro da sala). Se mesa informada, valida existência no bar da sala.
drop function if exists public.join_room(text);
drop function if exists public.join_room(text, int);

create or replace function public.join_room(p_code text, p_mesa int default null)
returns public.room_members
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_bar public.bars%rowtype;
  v_status public.member_status;
  v_mesa int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_code))
    and status = 'active';

  if not found then
    raise exception 'sala não encontrada ou inativa';
  end if;

  if v_room.host_id = auth.uid() then
    raise exception 'você já é o dono desta sala';
  end if;

  v_mesa := null;
  if v_room.bar_id is not null then
    select * into v_bar from public.bars where id = v_room.bar_id;
    if found and p_mesa is not null then
      if p_mesa < 1 or p_mesa > v_bar.quantidade_mesas then
        raise exception 'mesa inválida';
      end if;
      if not exists (select 1 from public.mesas where bar_id = v_bar.id and numero = p_mesa) then
        raise exception 'mesa não existe';
      end if;
      v_mesa := p_mesa;
    end if;
  end if;

  v_status := case when v_room.entry_mode = 'open' then 'approved'::public.member_status
                   else 'pending'::public.member_status end;

  insert into public.room_members (room_id, user_id, status, mesa_numero)
  values (v_room.id, auth.uid(), v_status, v_mesa)
  on conflict (room_id, user_id)
    do update set
      status = case
        when public.room_members.status = 'rejected' then excluded.status
        else public.room_members.status
      end,
      mesa_numero = coalesce(excluded.mesa_numero, public.room_members.mesa_numero);

  return (
    select rm
    from public.room_members rm
    where room_id = v_room.id
      and user_id = auth.uid()
  );
end;
$$;

-- 7) Membro aprovado escolhe a sua mesa (dentro da sala).
drop function if exists public.pick_mesa(uuid, int);
create or replace function public.pick_mesa(p_room_id uuid, p_mesa int)
returns public.room_members
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_bar public.bars%rowtype;
  v_member public.room_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if p_mesa is null or p_mesa < 1 then
    raise exception 'mesa inválida';
  end if;

  select * into v_room from public.rooms where id = p_room_id and status = 'active';
  if not found then
    raise exception 'sala não encontrada ou inativa';
  end if;

  select * into v_member
  from public.room_members
  where room_id = p_room_id
    and user_id = auth.uid();
  if not found then
    raise exception 'você não é membro desta sala';
  end if;
  if v_member.status <> 'approved' then
    raise exception 'aguarde a aprovação para escolher a mesa';
  end if;

  if v_room.bar_id is null then
    raise exception 'sala sem bar vinculado';
  end if;
  select * into v_bar from public.bars where id = v_room.bar_id;
  if not found then
    raise exception 'sala sem bar vinculado';
  end if;
  if p_mesa > v_bar.quantidade_mesas then
    raise exception 'mesa inválida';
  end if;
  if not exists (select 1 from public.mesas where bar_id = v_bar.id and numero = p_mesa) then
    raise exception 'mesa não existe';
  end if;

  update public.room_members
  set mesa_numero = p_mesa
  where room_id = p_room_id
    and user_id = auth.uid();

  return (
    select rm
    from public.room_members rm
    where room_id = p_room_id
      and user_id = auth.uid()
  );
end;
$$;

-- 8) Sala do seed: KARAOK → KARAOKE (código configurável default).
update public.rooms set code = 'KARAOKE' where code = 'KARAOK';