-- Tokens OAuth do YouTube por host (quota própria, spec §12 escalabilidade).
-- Acessado exclusivamente por rotas de servidor (service role), que ignoram
-- RLS — mesma convenção da song_cache: sem políticas, cliente anônimo/
-- autenticado fica bloqueado por padrão.
create table if not exists public.youtube_oauth_tokens (
  host_id uuid not null primary key references auth.users (id) on delete cascade,
  refresh_token text not null,
  channel_handle text,
  updated_at timestamptz not null default now()
);

alter table public.youtube_oauth_tokens enable row level security;