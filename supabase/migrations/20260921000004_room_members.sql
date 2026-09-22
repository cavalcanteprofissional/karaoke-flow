-- Participação em salas.
create type public.member_status as enum ('pending', 'approved', 'rejected');

create table if not exists public.room_members (
  room_id uuid not null references public.rooms (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status public.member_status not null default 'pending',
  joined_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

create index if not exists room_members_user_id_idx on public.room_members (user_id);

-- RLS
alter table public.room_members enable row level security;

-- Leitura: a própria participação, ou tudo da própria sala quando for o host
-- (host precisa ver a lista de pedidos pending para aprovar).
drop policy if exists "room_members_select_self_or_host" on public.room_members;
create policy "room_members_select_self_or_host"
  on public.room_members
  for select
  using (
    user_id = auth.uid()
    or public.is_host(room_id, auth.uid())
  );

-- Inserir: sempre como 'pending' para si mesmo. O approved direto (entryMode=open)
-- acontece apenas via RPC join_room (security definer), nunca por insert direto.
drop policy if exists "room_members_insert_pending" on public.room_members;
create policy "room_members_insert_pending"
  on public.room_members
  for insert
  with check (user_id = auth.uid() and status = 'pending');

-- Aprovar/rejeitar entrada: apenas o host.
drop policy if exists "room_members_update_host" on public.room_members;
create policy "room_members_update_host"
  on public.room_members
  for update
  using (public.is_host(room_id, auth.uid()));

-- Sair da sala (self) ou remover membro (host).
drop policy if exists "room_members_delete_self_or_host" on public.room_members;
create policy "room_members_delete_self_or_host"
  on public.room_members
  for delete
  using (
    user_id = auth.uid()
    or public.is_host(room_id, auth.uid())
  );

-- Entrada na sala via código/QR (spec Fase 3):
-- entryMode = open    -> já entra aprovado.
-- entryMode = approval-> fica pending aguardando o host.
create or replace function public.join_room(p_code text)
returns public.room_members
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_status public.member_status;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_code))
    and status = 'active';

  if not found then
    raise exception 'sala não encontrada ou inativa';
  end if;

  if v_room.host_id = auth.uid() then
    raise exception 'você já é o dono desta sala';
  end if;

  v_status := case when v_room.entry_mode = 'open' then 'approved'::public.member_status
                   else 'pending'::public.member_status end;

  insert into public.room_members (room_id, user_id, status)
  values (v_room.id, auth.uid(), v_status)
  on conflict (room_id, user_id)
    do update set status =
      case
        when public.room_members.status = 'rejected' then excluded.status
        else public.room_members.status
      end;

  return (select rm from public.room_members rm where room_id = v_room.id and user_id = auth.uid());
end;
$$;