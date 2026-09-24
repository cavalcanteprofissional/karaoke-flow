-- 'cancelled': fila interrompida quando o dono encerra a sala (terminal).
alter type public.queue_item_status add value if not exists 'cancelled';

-- Encerra a sala de forma atômica (apenas o host, checado no banco):
-- marca a sala como fechada, cancela toda a fila não finalizada e Expulsa
-- todos os membros. O client nunca escolhe essas operações separadamente.
create or replace function public.close_room(p_room_id uuid)
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
  set status = 'closed'
  where id = p_room_id
    and status <> 'closed';

  update public.queue_items
  set status = 'cancelled'
  where room_id = p_room_id
    and status in ('pending', 'approved', 'playing');

  delete from public.room_members
  where room_id = p_room_id;

  return true;
end;
$$;