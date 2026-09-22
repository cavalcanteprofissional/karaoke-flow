-- Status inicial da fila computado no banco (spec: "backend, nunca só UI").
-- O cliente envia qualquer status; o trigger redefine conforme a config da sala:
--   queue_approval_mode = auto   -> entra 'approved'
--   queue_approval_mode = manual -> entra 'pending' (aguarda host)
-- Isso impede auto-aprovação por INSERT direto (participantes não escolhem status).

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

-- Política de INSERT refeita: membro adiciona apenas para si; status é
-- derivado no banco (não entra como condição de checagem RLS).
drop policy if exists "queue_items_insert_member" on public.queue_items;
drop policy if exists "queue_items_insert_host" on public.queue_items;
create policy "queue_items_insert_member_or_host"
  on public.queue_items
  for insert
  with check (
    added_by_user_id = auth.uid()
    and (public.is_host(room_id, auth.uid())
         or public.is_approved_member(room_id, auth.uid()))
  );