-- Reabre uma sala/karaokê encerrado (apenas o host, checado no banco):
-- volta o status para 'active'. A fila cancelada permanece cancelada
-- (terminal — não ressuscita itens); os membros expulsos reentram do zero
-- via get_entry_preview/join_room.
create or replace function public.reopen_room(p_room_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  if not public.is_host(p_room_id, auth.uid()) then
    return false;
  end if;

  update public.rooms
  set status = 'active'
  where id = p_room_id
    and status = 'closed';

  return true;
end;
$$;