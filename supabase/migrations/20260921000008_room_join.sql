-- Preview pública de sala p/ o fluxo de entrada (join em 1-2 toques).
-- O participante ainda NÃO é membro aprovado: a policy de SELECT de `rooms`
-- só permite host/membro aprovado, então precisamos de uma função security
-- definer que devolva o mínimo necessário antes do pedido de entrada:
-- código, dono da sala (nome de exibição) e modo de entrada.
-- Pode mudar o tipo de retorno conforme a feature evolui; drop é idempotente.
drop function if exists public.get_room_preview(text);

create or replace function public.get_room_preview(p_code text)
returns table (
  room_id uuid,
  code text,
  host_id uuid,
  host_name text,
  entry_mode public.room_entry_mode,
  status public.room_status
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_host_name text;
begin
  select * into v_room
  from public.rooms r
  where r.code = upper(btrim(p_code));

  if not found or v_room.status <> 'active' then
    raise exception 'sala não encontrada ou inativa';
  end if;

  select p.name into v_host_name
  from public.profiles p
  where p.id = v_room.host_id;

  room_id := v_room.id;
  code := v_room.code;
  host_id := v_room.host_id;
  host_name := coalesce(v_host_name, 'dono da sala');
  entry_mode := v_room.entry_mode;
  status := v_room.status;

  return next;
end;
$$;

-- Realtime: o painel de aprovação de entrada do host escuta INSERT/UPDATE em
-- room_members. Só adiciona se ainda não está na publicação (idempotente).
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_members'
  ) then
    alter publication supabase_realtime add table public.room_members;
  end if;
end;
$$;