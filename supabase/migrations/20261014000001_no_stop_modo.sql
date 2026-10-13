-- Fase 19 — Modo no-stop: rodízio por rodadas na fila.
--
-- D16 (decidida): "sem parar" = pedir música SEM esperar a anterior acabar e SEM
-- aprovação; o máximo é de `max_active_songs` (default 3) ativas por usuário,
-- ajustável pelo host. A fila prioriza a 1ª música de cada usuário, depois a 2ª,
-- depois a 3ª; músicas da casa (`source='house'`) ficam sempre por último.
--
-- A REGRA MORA NO BANCO, como as demais. O `position` continua sendo um número
-- simples que a TV e os celulares leem; o que muda é QUEM o recalcula e QUANDO:
-- com `no_stop` ligado, `recompute_queue_positions` reordena sob o mesmo advisory
-- lock da fila a cada pedido/cancelamento/virada de faixa. Sem `no_stop`, o
-- comportamento atual (position max+1, KF001 de 1 ativa, reorder manual) fica
-- exatamente como está.
--
-- ── Rodada ───────────────────────────────────────────────────────────────────
-- Rodada de uma música = a posição dela entre as `approved` do PRÓPRIO usuário,
-- na ordem em que ele pediu. A `playing` NÃO conta: quando a música de alguém
-- começa a tocar, a próxima dele volta a ser rodada 1 e compete de igual.
--
-- ── Desempate (recomendação 1, confirmada) ───────────────────────────────────
-- Quem cantou há mais tempo vem primeiro, com quem NUNCA cantou na frente de
-- todos, e a ordem de chegada só decide o empate final. A base é
-- `queue_items.started_at`, carimbado quando o item vira `playing`.
--
-- ── Fixado à mão (recomendação 2, confirmada) ────────────────────────────────
-- Uma música movida à mão pelo host vira `pinned` e o rodízio NÃO a desloca: o
-- recompute reancora cada fixado no slot que ele ocupava antes do recálculo, e a
-- rodada só ordena os demais.

-- ── Colunas ──────────────────────────────────────────────────────────────────
alter table public.rooms
  add column if not exists no_stop boolean not null default false,
  add column if not exists max_active_songs integer not null default 3;

alter table public.rooms
  drop constraint if exists rooms_max_active_songs_check;
alter table public.rooms
  add constraint rooms_max_active_songs_check
  check (max_active_songs between 1 and 10);

alter table public.queue_items
  add column if not exists started_at timestamptz,
  add column if not exists pinned boolean not null default false,
  add column if not exists source text not null default 'user';

alter table public.queue_items
  drop constraint if exists queue_items_source_check;
alter table public.queue_items
  add constraint queue_items_source_check check (source in ('user', 'house'));

-- `rooms` tem ACL de COLUNA (migration 20260930000038): as colunas novas
-- precisam do próprio privilégio, senão nem a view nem o UPDATE enxergam.
grant select (no_stop, max_active_songs) on public.rooms to anon, authenticated;
grant update (no_stop, max_active_songs) on public.rooms to authenticated;

-- ── rooms_public com as colunas novas ────────────────────────────────────────
create or replace view public.rooms_public
with (security_invoker = true)
as
select
  id,
  code,
  qr_code_url,
  host_id,
  entry_mode,
  queue_approval_mode,
  require_song_confirmation,
  status,
  created_at,
  bar_id,
  playback_status,
  current_item_id,
  current_item_started_at,
  pre_approval_24h,
  youtube_safe_search,
  no_stop,
  max_active_songs
from public.rooms;

grant select on public.rooms_public to anon, authenticated;

-- ── Status inicial: no-stop força aprovação automática ───────────────────────
-- D16 fala "sem aprovação". Com `no_stop`, todo pedido nasce `approved` — o
-- toggle de aprovação da sala deixa de ter efeito (a UI o trava).
create or replace function public.queue_items_initial_status()
returns trigger
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_mode text;
  v_no_stop boolean;
begin
  if public.is_host(new.room_id, new.added_by_user_id) then
    new.status := 'approved'::public.queue_item_status;
    return new;
  end if;

  select queue_approval_mode, no_stop into v_mode, v_no_stop
  from public.rooms
  where id = new.room_id;

  new.status := case
    when v_mode = 'auto' or coalesce(v_no_stop, false)
      then 'approved'::public.queue_item_status
    else 'pending'::public.queue_item_status
  end;
  return new;
end;
$$;

-- ── KF001: teto de `max_active_songs` no no-stop ─────────────────────────────
-- Sem no-stop, tudo igual (1 ativa, substitui a mais antiga, recusa se toca).
-- Com no-stop, não substitui: permite até o teto (host isento) e recusa o
-- excedente. Pedir enquanto a sua toca passa a ser permitido — a faixa no ar
-- nunca é cortada por isso (o reorder do rodízio nunca mexe na `playing`).
create or replace function public.queue_items_one_active_per_participant()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_no_stop boolean;
  v_max integer;
  v_tocando uuid;
  v_ativas integer;
  v_restantes integer;
begin
  -- Sem sessão não há participante: seed/Management API passam direto.
  if auth.uid() is null then
    return new;
  end if;

  -- Dono da SALA: quantas quiser, sem troca.
  if public.is_host(new.room_id, auth.uid()) then
    return new;
  end if;

  select no_stop, max_active_songs into v_no_stop, v_max
  from public.rooms
  where id = new.room_id;

  if coalesce(v_no_stop, false) then
    select count(*) into v_ativas
    from public.queue_items q
    where q.room_id = new.room_id
      and q.added_by_user_id = auth.uid()
      and q.status in ('pending'::public.queue_item_status,
                       'approved'::public.queue_item_status,
                       'playing'::public.queue_item_status);

    if v_ativas >= v_max then
      raise exception using
        errcode = 'KF001',
        message = format(
          'Você já tem %s músicas na fila nesta sala. Cancele uma para pedir outra.',
          v_max
        );
    end if;

    return new;
  end if;

  -- ── Sem no-stop: comportamento original (20261004000042) ───────────────────
  select q.id into v_tocando
  from public.queue_items q
  where q.room_id = new.room_id
    and q.added_by_user_id = auth.uid()
    and q.status = 'playing'::public.queue_item_status
  limit 1;

  if v_tocando is not null then
    raise exception using
      errcode = 'KF001',
      message = 'Você já tem uma música tocando nesta sala. Dá para pedir outra quando ela terminar.';
  end if;

  delete from public.queue_items q
  where q.room_id = new.room_id
    and q.added_by_user_id = auth.uid()
    and q.status in ('pending'::public.queue_item_status,
                     'approved'::public.queue_item_status);

  select count(*) into v_restantes
  from public.queue_items q
  where q.room_id = new.room_id
    and q.added_by_user_id = auth.uid()
    and q.status in ('pending'::public.queue_item_status,
                      'approved'::public.queue_item_status,
                      'playing'::public.queue_item_status);

  if v_restantes > 0 then
    raise exception using
      errcode = 'KF001',
      message = 'Não foi possível substituir sua música anterior na fila.';
  end if;

  return new;
end;
$$;

revoke execute on function public.queue_items_one_active_per_participant() from public;

comment on function public.queue_items_one_active_per_participant() is
  'Uma música ativa (pending/approved/playing) por participante não-host, por sala. Sem no-stop: tocando -> recusa (KF001); senão substitui as ativas que não tocam. Com no-stop (rooms.no_stop): permite até rooms.max_active_songs ativas e recusa o excedente (KF001). Espelho em src/lib/rooms/queue.ts:resolveOwnActiveSong.';

-- ── started_at: carimba a vez de quem canta ──────────────────────────────────
create or replace function public.claim_next_queue_item(p_room_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_next_id uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended('karaoke_queue:' || p_room_id::text, 0)
  );

  select q.id into v_next_id
  from public.queue_items q
  where q.room_id = p_room_id and q.status = 'approved'
  order by q.position
  limit 1;

  if v_next_id is null then
    update public.rooms
    set current_item_id = null,
        playback_status = 'idle',
        current_item_started_at = null
    where id = p_room_id;
    return null;
  end if;

  update public.queue_items
  set status = 'playing', started_at = now()
  where id = v_next_id;

  update public.rooms
  set current_item_id = v_next_id,
      playback_status = 'playing',
      current_item_started_at = now()
  where id = p_room_id;

  return v_next_id;
end;
$$;

revoke all on function public.claim_next_queue_item(uuid) from public;

-- `set_playback` com o carimbo no "play por item" (o host escolhendo a faixa).
create or replace function public.set_playback(
  p_room_id uuid,
  p_action text,
  p_item_id uuid default null
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_current public.queue_items%rowtype;
  v_next_id uuid;
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

  if p_action not in ('play', 'pause', 'skip', 'stop') then
    raise exception 'comando inválido';
  end if;

  select q.* into v_current
  from public.rooms r
  join public.queue_items q on q.id = r.current_item_id
  where r.id = p_room_id and q.status = 'playing';

  if p_action = 'play' then
    if v_current.id is not null then
      update public.rooms
      set playback_status = 'playing', current_item_started_at = now()
      where id = p_room_id;
      return true;
    end if;

    if p_item_id is not null then
      if not exists (
        select 1
        from public.queue_items
        where id = p_item_id and room_id = p_room_id and status = 'approved'
      ) then
        raise exception 'item inválido';
      end if;

      perform pg_advisory_xact_lock(
        hashtextextended('karaoke_queue:' || p_room_id::text, 0)
      );
      update public.queue_items
      set status = 'playing', started_at = now()
      where id = p_item_id;
      update public.rooms
      set current_item_id = p_item_id,
          playback_status = 'playing',
          current_item_started_at = now()
      where id = p_room_id;
      return true;
    end if;

    v_next_id := public.claim_next_queue_item(p_room_id);
    if v_next_id is null then
      raise exception 'nada para tocar';
    end if;
    return true;
  end if;

  if p_action = 'pause' then
    if v_current.id is null then
      raise exception 'nada tocando';
    end if;
    update public.rooms
    set playback_status = 'paused', current_item_started_at = null
    where id = p_room_id;
    return true;
  end if;

  if v_current.id is null then
    raise exception 'nada tocando';
  end if;

  update public.queue_items set status = 'skipped' where id = v_current.id;

  if p_action = 'stop' then
    update public.rooms
    set current_item_id = null,
        playback_status = 'idle',
        current_item_started_at = null
    where id = p_room_id;
    return true;
  end if;

  perform public.claim_next_queue_item(p_room_id);
  return true;
end;
$$;

grant execute on function public.set_playback(uuid, text, uuid) to authenticated;

-- ── Núcleo do rodízio ────────────────────────────────────────────────────────
-- Recalcula `position` (1..N) sob o advisory lock da fila. Só age com no_stop
-- ligado; é no-op nas demais salas. Grava apenas quem muda de posição — escrita
-- idêntica não gera evento de realtime nem reescreve `updated_at`.
create or replace function public.recompute_queue_positions(p_room_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_no_stop boolean;
  v_pos integer := 0;
  v_playing_id uuid;
  r record;
begin
  select no_stop into v_no_stop from public.rooms where id = p_room_id;
  if coalesce(v_no_stop, false) = false then
    return;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('karaoke_queue:' || p_room_id::text, 0)
  );

  -- 1) A faixa no ar fica sempre na posição 1.
  select q.id into v_playing_id
  from public.queue_items q
  where q.room_id = p_room_id and q.status = 'playing'
  order by q.position
  limit 1;

  if v_playing_id is not null then
    v_pos := 1;
    update public.queue_items set position = v_pos
    where id = v_playing_id and position is distinct from v_pos;
  end if;

  -- 2) Fila: rodízio por rodadas; fixados reancorados no slot atual.
  -- A "ordem de chegada" é o `position` atual (pre_rank), NÃO `added_at`: dentro
  -- de uma mesma transação `added_at`/`now()` é igual para todas as linhas, e o
  -- desempate cairia no `id` (aleatório). `position` foi atribuído na inserção
  -- em ordem crescente, então é ele que guarda quem chegou antes.
  for r in
    with waiting as (
      select
        q.id, q.source, q.pinned, q.added_at, q.added_by_user_id,
        row_number() over (order by q.position, q.added_at, q.id) as pre_rank
      from public.queue_items q
      where q.room_id = p_room_id and q.status = 'approved'
    ),
    perf as (
      select added_by_user_id, max(started_at) as last_started_at
      from public.queue_items
      where room_id = p_room_id and started_at is not null
      group by added_by_user_id
    ),
    ranked as (
      select
        w.id, w.source, w.pinned, w.added_at, w.pre_rank,
        p.last_started_at,
        row_number() over (
          partition by w.added_by_user_id order by w.pre_rank
        ) as rodada
      from waiting w
      left join perf p on p.added_by_user_id = w.added_by_user_id
    ),
    rr as (
      select id,
        row_number() over (
          order by (source = 'house'), rodada,
                   last_started_at asc nulls first, pre_rank
        ) as rr_rank
      from ranked
      where not pinned
    ),
    slots as (
      select gs as slot from generate_series(1, (select count(*) from waiting)) gs
    ),
    assignment as (
      select
        s.slot,
        (select w.id from waiting w where w.pinned and w.pre_rank = s.slot) as pinned_id,
        s.slot - (select count(*) from waiting w where w.pinned and w.pre_rank <= s.slot) as rr_slot
      from slots s
    )
    select coalesce(
             a.pinned_id,
             (select r2.id from rr r2 where r2.rr_rank = a.rr_slot)
           ) as id
    from assignment a
    order by a.slot
  loop
    v_pos := v_pos + 1;
    update public.queue_items set position = v_pos
    where id = r.id and position is distinct from v_pos;
  end loop;
end;
$$;

revoke all on function public.recompute_queue_positions(uuid) from public;

-- ── Gatilhos de recálculo ────────────────────────────────────────────────────
-- O recompute só escreve `position`, e este gatilho é `update of status` — então
-- o próprio recálculo não se re-dispara.
create or replace function public.queue_items_no_stop_resequence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room_id uuid := coalesce(new.room_id, old.room_id);
  v_no_stop boolean;
begin
  select no_stop into v_no_stop from public.rooms where id = v_room_id;
  if coalesce(v_no_stop, false) then
    perform public.recompute_queue_positions(v_room_id);
  end if;
  return null;
end;
$$;

drop trigger if exists queue_items_no_stop_resequence on public.queue_items;
create trigger queue_items_no_stop_resequence
  after insert or delete or update of status on public.queue_items
  for each row execute function public.queue_items_no_stop_resequence();

revoke all on function public.queue_items_no_stop_resequence() from public;

-- Ligar o no-stop numa fila existente reordena na hora; desligar não mexe (o
-- rodízio é só dele). Ao ligar, aprova o que estava `pending`: no-stop não tem
-- aprovação, e um pendente sobraria fora do rodízio com `position` velha.
create or replace function public.rooms_no_stop_resequence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if new.no_stop then
    update public.queue_items
    set status = 'approved'
    where room_id = new.id
      and status = 'pending';

    perform public.recompute_queue_positions(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_no_stop_resequence on public.rooms;
create trigger rooms_no_stop_resequence
  after update of no_stop on public.rooms
  for each row execute function public.rooms_no_stop_resequence();

revoke all on function public.rooms_no_stop_resequence() from public;

-- ── reorder_queue com fixação ────────────────────────────────────────────────
-- Assinatura nova (3 args): `p_pinned_id` marca a música que o host moveu à mão
-- como fixada. A antiga (2 args) NÃO sai: vira um invólucro que delega para a 3
-- com `p_pinned_id = null`, para o app antigo (que ainda chama 2 args na janela
-- entre esta migration e o deploy) continuar reordenando.
--
-- IMPORTANTE: a de 3 args NÃO tem `default` — com default, o Postgres acha as
-- DUAS candidatas para uma chamada de 2 args e recusa ("function ... is not
-- unique"). Sem default, 2 args casam só com a de 2 e 3 args só com a de 3; o
-- PostgREST manda os nomes exatos que o cliente envia (`p_pinned_id` inclusive
-- quando nulo), então cada cliente cai na sua. O `notify` no fim avisa o cache.
drop function if exists public.reorder_queue(uuid, uuid[], uuid);
drop function if exists public.reorder_queue(uuid, uuid[]);

create or replace function public.reorder_queue(
  p_room_id uuid,
  p_item_ids uuid[],
  p_pinned_id uuid
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
  v_no_stop boolean;
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

  select no_stop into v_no_stop from public.rooms where id = p_room_id;

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
    -- Só quem MUDA de posição vira UPDATE (fan-out do realtime, 20261013000001).
    and q.position is distinct from o.new_position;

  -- O fixado só existe no no-stop e só se for um item da fila visível.
  if coalesce(v_no_stop, false) and p_pinned_id is not null then
    update public.queue_items
    set pinned = true
    where id = p_pinned_id
      and room_id = p_room_id
      and status in ('pending', 'approved', 'playing');
  end if;

  return true;
end;
$$;

grant execute on function public.reorder_queue(uuid, uuid[], uuid) to authenticated;

-- Compat: a assinatura antiga de 2 args segue viva até o app antigo sair de
-- circulação; ela só delega (sem fixação) para a de 3.
create or replace function public.reorder_queue(
  p_room_id uuid,
  p_item_ids uuid[]
)
returns boolean
language sql
security definer
set search_path = public, pg_catalog
as $$
  select public.reorder_queue(p_room_id, p_item_ids, null);
$$;

grant execute on function public.reorder_queue(uuid, uuid[]) to authenticated;

notify pgrst, 'reload schema';
