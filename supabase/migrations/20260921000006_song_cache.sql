-- Cache compartilhado de buscas do YouTube (mitigação de cota, spec seções 6/12).
-- Acessado exclusivamente por rotas de servidor (service role), que ignoram RLS.
-- Nenhuma policy é criada de propósito: com RLS habilitado e sem policy,
-- clientes anônimos/autenticados ficam bloqueados por padrão.

create table if not exists public.song_cache (
  id bigint generated always as identity primary key,
  query_normalized text not null unique,
  results jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists song_cache_created_at_idx on public.song_cache (created_at desc);

alter table public.song_cache enable row level security;