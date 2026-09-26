-- Trocar a música da fila mantendo posição e aprovação (Fase 5, Bloco D).
--
-- Regras fechadas com o PO (docs/flows/fluxos-do-sistema.md §5/§5.2):
--   D1 — quem troca: o AUTOR da música ou o host (o host troca qualquer item);
--   D2 — status preservado: em modo manual, uma música já aprovada continua
--        aprovada (troca 1:1, não volta para a fila de aprovação);
--   D3 — estados permitidos: 'pending' e 'approved' (enquanto não tocou).
--
-- Por que security definer e não UPDATE direto: hoje a policy
-- queue_items_update_host é host-only, então o AUTOR (que não é host) não
-- tem como escrever. A RPC autoriza os dois explicitamente — e assim o
-- client não ganha UPDATE em queue_items.
--
-- UPDATE in place (Opção A, já decidida): mantém id, position e status, então
-- o realtime vê UM único UPDATE e a referência de "tocando agora" não quebra.
-- updated_at é tocado pelo trigger queue_items_touch_updated_at.
create or replace function public.replace_queue_song(
  p_item_id uuid,
  p_youtube_video_id text,
  p_title text,
  p_thumbnail_url text,
  p_duration_seconds integer
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room_id uuid;
  v_added_by uuid;
  v_status public.queue_item_status;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select room_id, added_by_user_id, status
  into v_room_id, v_added_by, v_status
  from public.queue_items
  where id = p_item_id;

  if v_room_id is null then
    return false;
  end if;

  if not exists (
    select 1 from public.rooms where id = v_room_id and status = 'active'
  ) then
    raise exception 'sala encerrada';
  end if;

  -- D1: autor ou host.
  if v_added_by <> auth.uid() and not public.is_host(v_room_id, auth.uid()) then
    return false;
  end if;

  -- D3: só o que ainda não tocou.
  if v_status not in ('pending', 'approved') then
    raise exception 'esta música já saiu da fila';
  end if;

  if p_youtube_video_id is null
     or btrim(p_youtube_video_id) = ''
     or length(btrim(p_youtube_video_id)) > 40 then
    raise exception 'vídeo inválido';
  end if;

  if p_title is null or btrim(p_title) = '' or length(btrim(p_title)) > 200 then
    raise exception 'título inválido';
  end if;

  if p_duration_seconds is not null
     and (p_duration_seconds < 0 or p_duration_seconds > 86400) then
    raise exception 'duração inválida';
  end if;

  update public.queue_items
  set youtube_video_id = btrim(p_youtube_video_id),
      title = btrim(p_title),
      thumbnail_url = p_thumbnail_url,
      duration_seconds = p_duration_seconds
  where id = p_item_id;

  return true;
end;
$$;
