-- Item 6 da validação no aparelho — filtro de conteúdo explícito por sala.
--
-- A busca sempre foi `safeSearch=strict` fixo (`searchYouTube`). O host agora
-- pode desligar o filtro na sala (`rooms.youtube_safe_search`): ligado (padrão)
-- mantém `strict`; desligado manda `none`.
--
--  1) Coluna `youtube_safe_search` (default true) + SELECT e UPDATE de coluna
--     (a `20260930000038` concede privilégio COLUNA A COLUNA em `rooms`).
--  2) Recria `rooms_public` com a coluna nova (view security_invoker; sem isso
--     nenhuma tela consegue ler o valor).

alter table public.rooms
  add column if not exists youtube_safe_search boolean not null default true;

-- Coluna nova precisa do próprio privilégio: a auditoria revogou o SELECT/UPDATE
-- de TABELA e concedeu coluna a coluna.
grant select (youtube_safe_search) on public.rooms to anon, authenticated;
grant update (youtube_safe_search) on public.rooms to authenticated;

-- A view que o app lê no lugar de `rooms` (Fase 8c·C). Recreate com a coluna.
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
  youtube_safe_search
from public.rooms;

grant select on public.rooms_public to anon, authenticated;

notify pgrst, 'reload schema';
