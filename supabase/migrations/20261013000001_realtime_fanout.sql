-- Reduz o fan-out do realtime na fila (2026-10-13).
--
-- Contexto: o pico de 776 conexões concorrentes em 01/out estourou o teto de 200
-- do plano free. O cliente já perdeu a maior fonte de mensagens — o
-- `postgres_changes` de `queue_items` saiu de `queue-list.tsx` e de
-- `use-own-active-song.ts`, e o quiosque passou a avisar a fila por broadcast no
-- claim/release. Esta migration ataca a outra metade: o UPDATE em massa que o
-- `reorder_queue` fazia, e o `updated_at` reescrito em escritas sem mudança.
--
--  1. `reorder_queue` reescrevia a `position` de TODOS os itens visíveis, mesmo os
--     que ficavam na mesma posição. Cada linha mexida dispara o trigger
--     `queue_items_touch_updated_at` → um UPDATE real → um evento de realtime por
--     item. Reordenar 1 posição numa fila de 30 itens custava 30 updates. Agora o
--     `is distinct from` pula as linhas que já estão na posição certa.
--
--  2. `touch_updated_at` passa a CANCELAR o UPDATE quando a linha não mudou de
--     conteúdo (`new is not distinct from old`), em vez de reescrever `updated_at`
--     para `now()` a cada escrita idêntica. Vale para toda tabela que usa o
--     trigger (hoje `queue_items` e `consents`): escrita sem mudança de dado não
--     deve gerar evento de realtime nem tocar `updated_at`.
--
-- Idempotente: `create or replace` das duas funções. Nenhum dado é migrado.

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
  where q.id = o.id
    -- Só quem MUDA de posição vira UPDATE: sem esta linha, reordenar disparava o
    -- trigger (e um evento de realtime por item) para a fila inteira.
    and q.position is distinct from o.new_position;

  return true;
end;
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  -- Nada mudou de conteúdo: cancela o UPDATE. Evita evento de realtime e escrita
  -- inútil em reenvios idênticos (retry, poll, UPDATE de valor igual).
  if new is not distinct from old then
    return null;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
