-- Salas.
create type public.room_entry_mode as enum ('open', 'approval');
create type public.room_status as enum ('active', 'closed');

create table if not exists public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (char_length(code) = 6),
  qr_code_url text,
  host_id uuid not null references auth.users (id) on delete cascade,
  entry_mode public.room_entry_mode not null default 'open',
  queue_approval_mode text not null default 'auto' check (queue_approval_mode in ('auto', 'manual')),
  require_song_confirmation boolean not null default false,
  youtube_api_key text,
  status public.room_status not null default 'active',
  created_at timestamptz not null default now()
);

create index if not exists rooms_code_idx on public.rooms (code);
create index if not exists rooms_host_id_idx on public.rooms (host_id);

-- RLS
alter table public.rooms enable row level security;

-- Leitura: host ou membro aprovado da própria sala (nunca salas alheias).
drop policy if exists "rooms_select_member_or_host" on public.rooms;
create policy "rooms_select_member_or_host"
  on public.rooms
  for select
  using (
    host_id = auth.uid()
    or public.is_approved_member(id, auth.uid())
  );

-- Criação de sala: quem cria é o host.
drop policy if exists "rooms_insert_host" on public.rooms;
create policy "rooms_insert_host"
  on public.rooms
  for insert
  with check (host_id = auth.uid());

-- Configurações e fechamento de sala: apenas o host.
drop policy if exists "rooms_update_host" on public.rooms;
create policy "rooms_update_host"
  on public.rooms
  for update
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

drop policy if exists "rooms_delete_host" on public.rooms;
create policy "rooms_delete_host"
  on public.rooms
  for delete
  using (host_id = auth.uid());