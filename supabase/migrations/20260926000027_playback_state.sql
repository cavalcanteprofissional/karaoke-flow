-- Fase 6/7 — estado de playback da sala + player quiosque público.
--
-- O player é uma TELA (TV Box/Fire Stick/notebook na TV do bar), não um
-- usuário: por isso ele entra com um token de capacidade na URL
-- `/player/<codigo>?token=<uuid>`, sem sessão e com o papel `anon`. A RLS de
-- `rooms`/`queue_items` não serve para ele (não é membro de nada), então as
-- leituras/escritas do player vão por RPC `security definer` que conferem o
-- token DENTRO da função — o token é a autorização.
--
-- Decisões fechadas com o PO:
--   P1 — o token é por sala, vive em `rooms.player_token` e é rotacionável
--        (`rotate_player_token`, host-only) para revogar URL vazada;
--   P2 — o playback mora na SALA (`playback_status` + `current_item_id` +
--        `current_item_started_at`), não no item: pular é "o item vira
--        terminal e o próximo entra", então o "tocando agora" precisa
--        sobreviver à troca de item, e o `rooms_sync_playback` garante o
--        invariante (sem item => idle; item que não está `playing` => idle);
--   P3 — quem avança é o PLAYER (`claim_next_song`), sob o mesmo advisory lock
--        da fila: dois players abertos na mesma TV não tocam duas músicas ao
--        mesmo tempo;
--   P4 — só entra o que está `approved`. Em modo manual (Fase 5) `pending`
--        espera o host; em modo auto o insert já nasce `approved`;
--   P5 — o host ajusta (`set_playback`: play/pause/skip/stop) e o player só
--        obedece e auto-avança;
--   P6 — `current_item_started_at` é só âncora para retomar a música depois de
--        a TV ligar no meio da faixa: enquanto `paused` ele é nulo, então
--        `elapsed_seconds` é uma aproximação de quem está TOCANDO (o cronômetro
--        de verdade é da Fase 13, com o player reportando posição).
create type public.playback_status as enum ('idle', 'playing', 'paused');

alter table public.rooms
  add column if not exists playback_status public.playback_status not null default 'idle',
  add column if not exists current_item_id uuid
    references public.queue_items (id) on delete set null,
  add column if not exists current_item_started_at timestamptz,
  add column if not exists player_token uuid not null default gen_random_uuid();

create index if not exists rooms_player_token_idx on public.rooms (player_token);

-- Invariante do playback na sala (P2): o item referenciado tem que estar
-- `playing`, e sem item a sala é `idle`. Também cobre o `on delete set null` da
-- FK: o host pode remover o item que está tocando (a policy de DELETE é
-- host-only e `playing` não é terminal), então sem este trigger a sala ficaria
-- `playing` sem música nenhuma.
create or replace function public.rooms_sync_playback()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.current_item_id is not null and not exists (
    select 1
    from public.queue_items
    where id = new.current_item_id and status = 'playing'
  ) then
    new.current_item_id := null;
    new.current_item_started_at := null;
    new.playback_status := 'idle';
  end if;

  if new.current_item_id is null then
    new.current_item_started_at := null;
    if new.playback_status <> 'idle' then
      new.playback_status := 'idle';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists rooms_sync_playback on public.rooms;
create trigger rooms_sync_playback
  before update on public.rooms
  for each row execute function public.rooms_sync_playback();

-- Payload de um item para o player/host: NUNCA `added_by_user_id` (uuid de
-- usuário) — só o nome de exibição, como no resto do app.
create or replace function public.player_item_payload(p_item public.queue_items)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select jsonb_build_object(
    'id', p_item.id,
    'position', p_item.position,
    'youtube_video_id', p_item.youtube_video_id,
    'title', p_item.title,
    'duration_seconds', p_item.duration_seconds,
    'status', p_item.status,
    'requested_by', (select name from public.profiles_public where id = p_item.added_by_user_id)
  );
$$;

-- Núcleo da transição "o que toca agora" (P3/P4), sem autorização: é chamado
-- só por `claim_next_song` e `set_playback`, que autorizam antes. Fica
-- `security definer` como os demais e é revogada de PUBLIC logo abaixo — o
-- dono da função (o definer das chamadoras) continua podendo chamar.
-- Retorna o item que entrou em `playing`, ou null se a sala ficou ociosa.
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

  update public.queue_items set status = 'playing' where id = v_next_id;
  update public.rooms
  set current_item_id = v_next_id,
      playback_status = 'playing',
      current_item_started_at = now()
  where id = p_room_id;

  return v_next_id;
end;
$$;

revoke all on function public.claim_next_queue_item(uuid) from public;
revoke all on function public.rooms_sync_playback() from public;
revoke all on function public.player_item_payload(public.queue_items) from public;

-- Estado completo da tela do player (Fase 6). Público por token: devolve só o
-- que a TV mostra (o que toca, a fila visível com "quem pediu" e o modo da
-- sala), nunca `host_id`, `youtube_api_key` nem uuid de usuário.
create or replace function public.get_player_state(p_room_code text, p_token uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_current public.queue_items%rowtype;
  v_pending integer;
begin
  if p_token is null or p_room_code is null or btrim(p_room_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_room_code)) and player_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  if v_room.current_item_id is not null then
    select * into v_current
    from public.queue_items
    where id = v_room.current_item_id;
  end if;

  select count(*) into v_pending
  from public.queue_items
  where room_id = v_room.id and status = 'pending';

  return jsonb_build_object(
    'ok', true,
    'room', jsonb_build_object(
      'code', v_room.code,
      'status', v_room.status,
      'playback_status', v_room.playback_status,
      'queue_approval_mode', v_room.queue_approval_mode,
      'require_song_confirmation', v_room.require_song_confirmation
    ),
    'current', case when v_current.id is null then null
      else public.player_item_payload(v_current) || jsonb_build_object(
        'started_at', v_room.current_item_started_at,
        'elapsed_seconds', case
          when v_room.playback_status = 'playing'
                and v_room.current_item_started_at is not null
          then floor(extract(epoch from (now() - v_room.current_item_started_at)))::integer
          else null
        end
      )
    end,
    'queue', coalesce((
      select jsonb_agg(public.player_item_payload(q) order by q.position)
      from public.queue_items q
      where q.room_id = v_room.id
        and (q.status = 'approved'
             or (q.status = 'playing' and q.id = v_room.current_item_id))
    ), '[]'::jsonb),
    'pending_count', v_pending
  );
end;
$$;

grant execute on function public.get_player_state(text, uuid) to anon, authenticated;

-- Auto-avanço do player (P3): chamada quando a música termina (e no boot, se
-- a sala estiver ociosa com algo aprovado). Idempotente enquanto `paused` — não
-- é para o player avançar a música que o host está segurando.
create or replace function public.claim_next_song(p_room_code text, p_token uuid)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_room_id uuid;
  v_item public.queue_items%rowtype;
  v_claimed_id uuid;
begin
  if p_token is null or p_room_code is null or btrim(p_room_code) = '' then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_room_code)) and player_token = p_token;

  if not found then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  v_room_id := v_room.id;

  if v_room.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'sala encerrada');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('karaoke_queue:' || v_room.id::text, 0)
  );

  -- Pausado: devolve o estado como está, sem pular nada.
  if v_room.playback_status = 'paused' and v_room.current_item_id is not null then
    select * into v_item from public.queue_items where id = v_room.current_item_id;
    return jsonb_build_object(
      'ok', true,
      'playback_status', v_room.playback_status,
      'item', public.player_item_payload(v_item)
    );
  end if;

  -- A música atual acabou: terminaliza. `played` (não `skipped`) porque o
  -- player terminou a faixa, não o host.
  if v_room.current_item_id is not null then
    update public.queue_items
    set status = 'played'
    where id = v_room.current_item_id and status = 'playing';
  end if;

  v_claimed_id := public.claim_next_queue_item(v_room_id);
  if v_claimed_id is not null then
    select * into v_item from public.queue_items where id = v_claimed_id;
  end if;

  select * into v_room from public.rooms where id = v_room_id;

  return jsonb_build_object(
    'ok', true,
    'playback_status', v_room.playback_status,
    'item', case when v_item.id is null then null
      else public.player_item_payload(v_item)
    end
  );
end;
$$;

grant execute on function public.claim_next_song(text, uuid) to anon, authenticated;

-- Ajuste do host (Fase 7): play (toca/retoma), pause, skip (termina a atual e
-- toca a próxima) e stop (termina a atual e deixa a sala ociosa).
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
  v_playback public.playback_status;
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
    -- Retomar o que já está tocando.
    if v_current.id is not null then
      update public.rooms
      set playback_status = 'playing', current_item_started_at = now()
      where id = p_room_id;
      return true;
    end if;

    -- Tocar um item escolhido pelo host...
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
      update public.queue_items set status = 'playing' where id = p_item_id;
      update public.rooms
      set current_item_id = p_item_id,
          playback_status = 'playing',
          current_item_started_at = now()
      where id = p_room_id;
      return true;
    end if;

    -- ...ou o próximo aprovado da fila.
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

  -- skip/stop: a música atual vira terminal e a sala segue.
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

-- Rotaciona o token do player (P1): o host gera a URL da TV e, se vazar,
-- gera outra — a antiga deixa de funcionar na hora.
create or replace function public.rotate_player_token(p_room_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_token uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  if not public.is_host(p_room_id, auth.uid()) then
    return null;
  end if;

  v_token := gen_random_uuid();

  update public.rooms
  set player_token = v_token
  where id = p_room_id;

  return v_token;
end;
$$;

grant execute on function public.rotate_player_token(uuid) to authenticated;
