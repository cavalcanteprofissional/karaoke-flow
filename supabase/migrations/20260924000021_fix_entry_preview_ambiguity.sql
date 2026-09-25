-- Fix: get_entry_preview quebrava com ERROR 42702 "column reference bar_id is
-- ambiguous" porque o `returns table(bar_id uuid, ..., status room_status, ...)`
-- declara OUT params que colidem com as colunas de public.rooms/public.mesas
-- usadas sem qualificar no WHERE. Passa a qualificar os nomes colidentes
-- (bar_id e status); mesma assinatura e comportamento.
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

  -- 1) código de bar? senão 2) código de room (QR legado) → bar da room.
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

  -- Sala ativa do bar (multi-sala desabilitado: pré-seleciona a única ativa).
  select * into v_room
  from public.rooms
  where public.rooms.bar_id = v_bar.id
    and public.rooms.status = 'active'
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
    where public.mesas.bar_id = v_bar.id
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