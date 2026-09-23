-- Realtime: a lista da fila (QueueList) escuta INSERT/UPDATE/DELETE em
-- queue_items (postgres_changes). Só adiciona se ainda não está na
-- publicação (idempotente), igual ao padrão da 0008 p/ room_members.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'queue_items'
  ) then
    alter publication supabase_realtime add table public.queue_items;
  end if;
end;
$$;