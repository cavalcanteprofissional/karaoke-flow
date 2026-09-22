-- Fila de músicas da sala.
create type public.queue_item_status as enum (
  'pending', 'approved', 'playing', 'played', 'rejected', 'skipped'
);

create table if not exists public.queue_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms (id) on delete cascade,
  added_by_user_id uuid not null references auth.users (id) on delete cascade,
  youtube_video_id text not null,
  title text not null,
  thumbnail_url text,
  duration_seconds integer,
  status public.queue_item_status not null default 'pending',
  position integer not null,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists queue_items_room_position_idx
  on public.queue_items (room_id, position);
create index if not exists queue_items_room_status_idx
  on public.queue_items (room_id, status);

-- position computado no banco, sem condição de corrida:
-- advisory lock por sala garante que dois inserts simultâneos nunca caem
-- na mesma posição (spec seção 12.3).
create or replace function public.next_queue_position(p_room_id uuid)
returns integer
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_pos integer;
begin
  perform pg_advisory_xact_lock(hashtextextended('karaoke_queue:' || p_room_id::text, 0));
  select coalesce(max(position), 0) + 1 into v_pos
  from public.queue_items
  where room_id = p_room_id;
  return v_pos;
end;
$$;

create or replace function public.assign_queue_position()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.position is null then
    new.position := public.next_queue_position(new.room_id);
  end if;
  return new;
end;
$$;

drop trigger if exists queue_items_assign_position on public.queue_items;
create trigger queue_items_assign_position
  before insert on public.queue_items
  for each row execute function public.assign_queue_position();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists queue_items_touch_updated_at on public.queue_items;
create trigger queue_items_touch_updated_at
  before update on public.queue_items
  for each row execute function public.touch_updated_at();

-- RLS
alter table public.queue_items enable row level security;

-- Leitura: host ou membro aprovado da sala (nunca salas alheias).
drop policy if exists "queue_items_select_member_or_host" on public.queue_items;
create policy "queue_items_select_member_or_host"
  on public.queue_items
  for select
  using (
    public.is_host(room_id, auth.uid())
    or public.is_approved_member(room_id, auth.uid())
  );

-- Adicionar música: apenas membro aprovado da sala (ou host), adicionando para si.
drop policy if exists "queue_items_insert_member" on public.queue_items;
create policy "queue_items_insert_member"
  on public.queue_items
  for insert
  with check (
    added_by_user_id = auth.uid()
    and (public.is_host(room_id, auth.uid()) or public.is_approved_member(room_id, auth.uid()))
  );

-- Aprovar/rejeitar/reordenar/remover música: apenas o host (backend via policy,
-- nunca só escondendo botão na UI).
drop policy if exists "queue_items_update_host" on public.queue_items;
create policy "queue_items_update_host"
  on public.queue_items
  for update
  using (public.is_host(room_id, auth.uid()));

drop policy if exists "queue_items_delete_host" on public.queue_items;
create policy "queue_items_delete_host"
  on public.queue_items
  for delete
  using (public.is_host(room_id, auth.uid()));