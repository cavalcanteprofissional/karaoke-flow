-- Preview unificada de entrada no bar:
--   - p_code pode ser código de BAR ou código de room (QR legado de sala);
--   - se p_mesa informado, valida e retorna a mesa (entrada direta por QR de mesa);
--   - security definer: leitor ainda não é membro e a policy de SELECT de
--     rooms não abre leitura para não-membros.
drop function if exists public.get_room_preview(text); -- substituída por get_entry_preview

create or replace function public.get_entry_preview(p_code text, p_mesa int default null)
returns table (
  bar_id uuid,
  bar_code text,
  bar_nome text,
  bar_cidade text,
  quantidade_mesas int,
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

-- join_room estendido: participante escolhe a mesa (obrigatória quando o bar
-- tem mais de 1 mesa; default 1 quando só há uma). Host continua bloqueado.
drop function if exists public.join_room(text);

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
    if found then
      if p_mesa is null then
        if v_bar.quantidade_mesas > 1 then
          raise exception 'escolha uma mesa';
        end if;
        v_mesa := 1;
      else
        if p_mesa < 1 or p_mesa > v_bar.quantidade_mesas then
          raise exception 'mesa inválida';
        end if;
        if not exists (select 1 from public.mesas where bar_id = v_bar.id and numero = p_mesa) then
          raise exception 'mesa não existe';
        end if;
        v_mesa := p_mesa;
      end if;
    end if;
  else
    v_mesa := p_mesa;
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