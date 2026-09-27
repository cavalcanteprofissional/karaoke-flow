-- Fase 6/7 — `claim_next_song` passa a dizer QUAL música terminou.
--
-- Problema encontrado no smoke de 27/09: `claim_next_song` terminalizava
--whatever estivesse tocando, então um segundo claim (duas abas da TV, ou o
-- evento de "terminou" chegando junto com o poll) pulava a música que estava
-- no ar. O player agora manda o id do item que acabou de terminar, e o banco
-- só avança se esse item ainda for o atual — claim repetido é no-op, e o
-- boot (sem item finished) nunca pula o que está tocando.
create or replace function public.claim_next_song(
  p_room_code text,
  p_token uuid,
  p_finished_item_id uuid default null
)
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
    hashtextextended('karaoke_queue:' || v_room_id::text, 0)
  );

  -- Retomada da sala (o que está tocando agora, se houver).
  if v_room.current_item_id is not null then
    select * into v_item from public.queue_items where id = v_room.current_item_id;
  end if;

  -- Pausado: devolve o estado como está, sem pular nada.
  if v_room.playback_status = 'paused' then
    return jsonb_build_object(
      'ok', true,
      'playback_status', v_room.playback_status,
      'item', public.player_item_payload(v_item)
    );
  end if;

  if p_finished_item_id is null then
    -- Boot: só pega a fila quando a sala está ociosa. Com música no ar, o
    -- player não manda claim — e se mandar, aqui é no-op.
    if v_room.current_item_id is not null then
      return jsonb_build_object(
        'ok', true,
        'playback_status', v_room.playback_status,
        'item', public.player_item_payload(v_item)
      );
    end if;
  elsif v_room.current_item_id is distinct from p_finished_item_id then
    -- Outra claim já aconteceu (outra aba, ou o poll chegou antes): no-op.
    return jsonb_build_object(
      'ok', true,
      'playback_status', v_room.playback_status,
      'item', public.player_item_payload(v_item),
      'already_advanced', true
    );
  else
    -- A música terminou: terminaliza. `played` (não `skipped`) porque quem
    -- terminou a faixa foi o player, não o host.
    update public.queue_items
    set status = 'played'
    where id = p_finished_item_id and status = 'playing';
  end if;

  v_claimed_id := public.claim_next_queue_item(v_room_id);
  if v_claimed_id is not null then
    select * into v_item from public.queue_items where id = v_claimed_id;
  else
    v_item.id := null;
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

drop function if exists public.claim_next_song(text, uuid);

grant execute on function public.claim_next_song(text, uuid, uuid) to anon, authenticated;
