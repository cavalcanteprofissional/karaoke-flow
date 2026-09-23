-- Requisito: presença física obrigatória (registrado em 2026-09-23).
-- O bar passa a ter localização geográfica (para validar que o participante
-- está no estabelecimento via GPS) e um raio de tolerância configurável.
-- Participação na sala EXIGE: consentimento + geo concedida + distância
-- (haversine) <= raio do bar. Host isento. Bar SEM coords registradas:
-- participante não comprova presença => bloqueado.

-- 1) Colunas de localização em bars.
alter table public.bars add column if not exists latitude numeric(9, 6);
alter table public.bars add column if not exists longitude numeric(9, 6);
alter table public.bars add column if not exists raio_permitido_metros int not null default 150;
alter table public.bars drop constraint if exists bars_raio_check;
alter table public.bars add constraint bars_raio_check
  check (raio_permitido_metros >= 50 and raio_permitido_metros <= 1000);

-- Sanidade básica de coordenadas (aceita null = localização não registrada).
alter table public.bars drop constraint if exists bars_lat_check;
alter table public.bars add constraint bars_lat_check
  check (latitude is null or (latitude >= -90 and latitude <= 90));
alter table public.bars drop constraint if exists bars_lng_check;
alter table public.bars add constraint bars_lng_check
  check (longitude is null or (longitude >= -180 and longitude <= 180));
alter table public.bars drop constraint if exists bars_geo_pair_check;
alter table public.bars add constraint bars_geo_pair_check
  check ((latitude is null and longitude is null) or (latitude is not null and longitude is not null));

-- 2) create_bar aceita localização + raio (default 150 m). Parametros novos
-- ficam ao final p/ não quebrar chamadas existentes (notação nomeada).
drop function if exists public.create_bar(text, text, text, int, text[], numeric, numeric, int);

create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[] default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_raio_permitido_metros int default 150
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
  v_room_code := public.generate_room_code();

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

-- 3) get_entry_preview retorna a localização do bar (usada no gate de
-- presença da entrada e da fila).
drop function if exists public.get_entry_preview(text, int);

create or replace function public.get_entry_preview(p_code text, p_mesa int default null)
returns table (
  bar_id uuid,
  bar_code text,
  bar_nome text,
  bar_cidade text,
  quantidade_mesas int,
  bar_latitude numeric,
  bar_longitude numeric,
  bar_raio_permitido_metros int,
  room_id uuid,
  room_code text,
  host_id uuid,
  host_name text,
  entry_mode public.room_entry_mode,
  status public.room_status,
  mesa_numero int,
  mesa_rotulo text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_bar public.bars%rowtype;
  v_room public.rooms%rowtype;
  v_host_name text;
  v_code text;
  v_rotulo text;
begin
  v_code := upper(btrim(p_code));
  if v_code = '' then
    raise exception 'código vazio';
  end if;

  select * into v_bar from public.bars where code = v_code;
  if not found then
    select * into v_room from public.rooms where code = v_code;
    if found then
      select * into v_bar from public.bars where id = v_room.bar_id;
    end if;
    if not found then
      raise exception 'bar não encontrado';
    end if;
  end if;

  select * into v_room
  from public.rooms
  where bar_id = v_bar.id
    and status = 'active'
  order by created_at
  limit 1;
  if not found then
    raise exception 'bar sem sala ativa';
  end if;

  select p.name into v_host_name from public.profiles p where p.id = v_room.host_id;

  bar_id := v_bar.id;
  bar_code := v_bar.code;
  bar_nome := v_bar.nome;
  bar_cidade := v_bar.cidade;
  quantidade_mesas := v_bar.quantidade_mesas;
  bar_latitude := v_bar.latitude;
  bar_longitude := v_bar.longitude;
  bar_raio_permitido_metros := v_bar.raio_permitido_metros;
  room_id := v_room.id;
  room_code := v_room.code;
  host_id := v_room.host_id;
  host_name := coalesce(v_host_name, 'dono do bar');
  entry_mode := v_room.entry_mode;
  status := v_room.status;

  if p_mesa is not null then
    if p_mesa < 1 or p_mesa > v_bar.quantidade_mesas then
      raise exception 'mesa inválida';
    end if;
    select rotulo into v_rotulo
    from public.mesas
    where bar_id = v_bar.id
      and numero = p_mesa;
    if not found then
      raise exception 'mesa não existe';
    end if;
    mesa_numero := p_mesa;
    mesa_rotulo := v_rotulo;
  end if;

  return next;
end;
$$;