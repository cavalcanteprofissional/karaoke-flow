-- Mesas: etiquetas do bar (1..N por bar, alinhadas a bars.quantidade_mesas).
-- Sem função além de etiquetar: todas as mesas do bar compartilham a
-- playlist da (única) sala. O QR por mesa permite entrada direta na sala
-- com a mesa pré-selecionada. Rótulos opcionais ("mesa da janela", etc.).
create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id) on delete cascade,
  numero int not null check (numero >= 1 and numero <= 999),
  rotulo text,
  criado_em timestamptz not null default now(),
  unique (bar_id, numero)
);

create index if not exists mesas_bar_id_idx on public.mesas (bar_id);

-- RLS
alter table public.mesas enable row level security;

-- Leitura: qualquer sessão autenticada (autêntica ou anônima).
drop policy if exists "mesas_select_authenticated" on public.mesas;
create policy "mesas_select_authenticated"
  on public.mesas
  for select
  using (auth.uid() is not null);

-- Escrita: apenas o dono do bar.
drop policy if exists "mesas_insert_host" on public.mesas;
create policy "mesas_insert_host"
  on public.mesas
  for insert
  with check (public.is_bar_host(bar_id, auth.uid()));

drop policy if exists "mesas_update_host" on public.mesas;
create policy "mesas_update_host"
  on public.mesas
  for update
  using (public.is_bar_host(bar_id, auth.uid()))
  with check (public.is_bar_host(bar_id, auth.uid()));

drop policy if exists "mesas_delete_host" on public.mesas;
create policy "mesas_delete_host"
  on public.mesas
  for delete
  using (public.is_bar_host(bar_id, auth.uid()));