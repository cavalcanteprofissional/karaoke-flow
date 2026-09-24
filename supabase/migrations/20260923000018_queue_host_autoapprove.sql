-- O DONO da própria sala nunca espera aprovação: músicas pedidas por ele
-- entram direto como 'approved', mesmo em `queue_approval_mode = manual`.
-- Para os demais segue a regra da configuração da sala (spec máquina de estados).

create or replace function public.queue_items_initial_status()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_mode text;
begin
  if public.is_host(new.room_id, new.added_by_user_id) then
    new.status := 'approved'::public.queue_item_status;
    return new;
  end if;

  select queue_approval_mode into v_mode
  from public.rooms
  where id = new.room_id;

  new.status := case when v_mode = 'auto' then 'approved'::public.queue_item_status
                     else 'pending'::public.queue_item_status end;
  return new;
end;
$$;

drop trigger if exists queue_items_initial_status on public.queue_items;
create trigger queue_items_initial_status
  before insert on public.queue_items
  for each row execute function public.queue_items_initial_status();