-- Bar = perfil-personificação do host (1:1 com auth.users).
-- O host "é" o bar. O bar tem 1..N salas/karaokês (rooms), default 1;
-- multi-sala fica desabilitado na UI nesta fase (só affordance).
create table if not exists public.bars (
  id uuid primary key default gen_random_uuid(),
  host_id uuid not null unique references auth.users (id) on delete cascade,
  code text not null unique check (char_length(code) = 6),
  nome text not null,
  cidade text,
  endereco text,
  quantidade_mesas int not null default 1
    check (quantidade_mesas >= 1 and quantidade_mesas <= 999),
  criado_em timestamptz not null default now()
);

create index if not exists bars_host_id_idx on public.bars (host_id);
create index if not exists bars_code_idx on public.bars (code);

-- Helper RLS: é o dono do bar? (espelho de is_host, adaptado a bars).
create or replace function public.is_bar_host(p_bar_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  return exists (
    select 1
    from public.bars
    where id = p_bar_id
      and host_id = p_user_id
  );
end;
$$;

-- Código de bar: 6 caracteres, mesmo charset da sala (sem I/O/1/0).
create or replace function public.generate_bar_code()
returns text
language plpgsql
volatile
set search_path = public, pg_catalog
as $$
declare
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.bars where code = v_code);
  end loop;
  return v_code;
end;
$$;

-- RLS
alter table public.bars enable row level security;

-- Leitura: qualquer sessão autenticada (autêntica OU anônima — auth.uid() não nulo).
drop policy if exists "bars_select_authenticated" on public.bars;
create policy "bars_select_authenticated"
  on public.bars
  for select
  using (auth.uid() is not null);

-- Escrita: apenas o dono (host). A exigência de login real (não anônimo)
-- é reforçada na server action createBarAction (checagem de provider).
drop policy if exists "bars_insert_own" on public.bars;
create policy "bars_insert_own"
  on public.bars
  for insert
  with check (host_id = auth.uid());

drop policy if exists "bars_update_own" on public.bars;
create policy "bars_update_own"
  on public.bars
  for update
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

drop policy if exists "bars_delete_own" on public.bars;
create policy "bars_delete_own"
  on public.bars
  for delete
  using (host_id = auth.uid());
