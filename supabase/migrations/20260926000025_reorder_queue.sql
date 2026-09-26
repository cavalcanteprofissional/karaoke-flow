-- Reordena a fila do host em UMA chamada atômica (Fase 5, Bloco C).
--
-- Por que RPC e não N updates do client: (1) a fila não tem unique em
-- (room_id, position), então reescrever item a item abre janela para estado
-- intermediário inconsistente; (2) o UPDATE de cada item dispara o trigger
-- touch_updated_at e o realtime 'event: "*"' → N refetches da fila; (3) a
-- RLS queue_items_update_host é host-only, e a policy não tem WITH CHECK —
-- uma escrita solta poderia até trocar o room_id do item. Aqui a autorização é
-- feita dentro da função, com o mesmo padrão de close_room/reopen_room.
--
-- Contrato: p_item_ids traz a fila INTEIRA visível (pending + approved +
-- playing) na ordem desejada. Exigir o conjunto completo é o que mantém
-- position contígua (1..N) e sem empate — o banco não pode aceitar uma lista
-- parcial, que criaria posições repetidas. Itens terminais (played, skipped,
-- rejected, cancelled) ficam de fora: não aparecem na fila.
--
-- O advisory lock usa a MESMA chave de next_queue_position, então um insert
-- concorrente não consegue roubar uma posição para o meio do reorden.
create or replace function public.reorder_queue(
  p_room_id uuid,
  p_item_ids uuid[]
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_visible integer;
  v_matched integer;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if not public.is_host(p_room_id, auth.uid()) then
    return false;
  end if;

  if not exists (
    select 1 from public.rooms where id = p_room_id and status = 'active'
  ) then
    raise exception 'sala encerrada';
  end if;

  if p_item_ids is null or cardinality(p_item_ids) = 0 then
    raise exception 'fila vazia';
  end if;

  if (select count(distinct t.id) from unnest(p_item_ids) as t(id))
     <> cardinality(p_item_ids) then
    raise exception 'itens duplicados';
  end if;

  select count(*) into v_visible
  from public.queue_items
  where room_id = p_room_id
    and status in ('pending', 'approved', 'playing');

  if v_visible <> cardinality(p_item_ids) then
    raise exception 'fila desatualizada';
  end if;

  select count(*) into v_matched
  from public.queue_items
  where room_id = p_room_id
    and status in ('pending', 'approved', 'playing')
    and id = any (p_item_ids);

  if v_matched <> cardinality(p_item_ids) then
    raise exception 'item inválido';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('karaoke_queue:' || p_room_id::text, 0)
  );

  with ordered as (
    select t.id, row_number() over (order by t.ord) as new_position
    from unnest(p_item_ids) with ordinality as t(id, ord)
  )
  update public.queue_items q
  set position = o.new_position
  from ordered o
  where q.id = o.id;

  return true;
end;
$$;
