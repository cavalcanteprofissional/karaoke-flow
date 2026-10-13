-- Tira `room_members` do realtime de linha (2026-10-13).
--
-- Continuação do `20261013000001_realtime_fanout`: lá saiu o `postgres_changes`
-- de `queue_items`; aqui sai o de `room_members`, a última tabela que ainda
-- fan-outava uma mensagem de realtime por aparelho inscrito a cada linha tocada.
--
-- As três telas que liam `room_members` por `postgres_changes`
-- (`entry-approval-wait`, `pending-entries`, `room-occupancy`) passaram a usar o
-- canal de broadcast `room-members:<roomId>` (`src/lib/rooms/member-channel.ts`):
-- quem muta avisa por REST (`httpSend`) e quem ouve relê pela RLS. Broadcast não
-- passa pela publicação nem pela RLS de linha — por isso a tabela não precisa
-- mais estar em `supabase_realtime`.
--
-- `replica identity full` só existia para o evento de DELETE chegar com a linha
-- inteira (o card de ocupação do host). Sem `postgres_changes`, ninguém consome
-- esse payload; volta para `default` (a PK), mais barato em cada UPDATE.
--
-- Idempotente: só derruba se estiver na publicação. Nenhum dado é migrado.

do $$
begin
  if exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_members'
  ) then
    alter publication supabase_realtime drop table public.room_members;
  end if;
end;
$$;

alter table public.room_members replica identity default;
