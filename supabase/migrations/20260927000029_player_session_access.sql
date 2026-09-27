-- Fase 8a (1/2) — o player aceita sessão, não só token.
--
-- Problema encontrado nos testes manuais de 27/09: o participante que pede uma
-- música precisa ver a watch party da SALA DELE, e a única porta era
-- `/player/<codigo>?token=...` — o token que o host só tem na página da sala. O
-- caminho do participante virava "pedi a música, recebi um toast e fiquei na
-- tela de busca".
--
-- Decisão: a autorização do player tem DUAS portas, e o `player_token` nunca
-- é entregue ao navegador do participante:
--   1. `p_token` preenchido  → a TV (anon, sem sessão), como antes;
--   2. `p_token` nulo        → a sessão de quem está chamando: dono da sala ou
--                              membro com status `approved`.
-- A porta 2 usa `auth.uid()` dentro da função, nunca um id vindo do cliente:
-- o argumento `p_user` seria forjável, o claim da sessão não.
--
-- Token errado NUNÃO cai para a sessão (link velho da TV precisa continuar
-- dando "player inválido", senão o quiosque para de avisar que o link morreu).
--
-- O membro `pending` não entra: pré-aprovação de 24h (migration 30) também
-- vale para cá — só entra no player quem está `approved` de verdade.

create or replace function public.player_room_id(p_room_code text, p_token uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_code text;
  v_id uuid;
  v_uid uuid := auth.uid();
begin
  v_code := upper(btrim(coalesce(p_room_code, '')));
  if v_code = '' then
    return null;
  end if;

  -- Porta 1: a TV, com o token da sala.
  if p_token is not null then
    select r.id into v_id
    from public.rooms r
    where r.code = v_code and r.player_token = p_token;
    return v_id;
  end if;

  -- Porta 2: a sessão de quem está chamando (dono ou membro aprovado).
  if v_uid is null then
    return null;
  end if;

  select r.id into v_id
  from public.rooms r
  where r.code = v_code
    and (
      r.host_id = v_uid
      or exists (
        select 1
        from public.room_members m
        where m.room_id = r.id
          and m.user_id = v_uid
          and m.status = 'approved'
      )
    );

  return v_id;
end;
$$;

revoke all on function public.player_room_id(text, uuid) from public;
grant execute on function public.player_room_id(text, uuid) to anon, authenticated;

-- Estado do player. `p_token` passa a ser opcional: nulo = usar a sessão.
create or replace function public.get_player_state(
  p_room_code text,
  p_token uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_room_id uuid;
  v_current public.queue_items%rowtype;
  v_pending integer;
begin
  v_room_id := public.player_room_id(p_room_code, p_token);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  select * into v_room from public.rooms where id = v_room_id;

  if v_room.current_item_id is not null then
    select * into v_current
    from public.queue_items
    where id = v_room.current_item_id;
  end if;

  select count(*) into v_pending
  from public.queue_items
  where room_id = v_room_id and status = 'pending';

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
      where q.room_id = v_room_id
        and (q.status = 'approved'
             or (q.status = 'playing' and q.id = v_room.current_item_id))
    ), '[]'::jsonb),
    'pending_count', v_pending
  );
end;
$$;

-- Claim do auto-avanço: mesma porta, então a TV por token e o participante por
-- sessão avançam a fila do mesmo jeito.
create or replace function public.claim_next_song(
  p_room_code text,
  p_token uuid default null,
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
  v_room_id := public.player_room_id(p_room_code, p_token);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  select * into v_room from public.rooms where id = v_room_id;

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
    -- Sem item finished: só pega a fila quando a sala está ociosa. Com música
    -- no ar, o player não manda claim — e se mandar, aqui é no-op.
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

revoke all on function public.get_player_state(text, uuid) from public;
revoke all on function public.claim_next_song(text, uuid, uuid) from public;
grant execute on function public.get_player_state(text, uuid) to anon, authenticated;
grant execute on function public.claim_next_song(text, uuid, uuid) to anon, authenticated;

-- A porta 2 é uma função nova com argumento opcional: o cache de schema do
-- PostgREST precisa saber disso, senão a RPC continua "não encontrada" até o
-- primeiro reload (a lição do PGRST201, pos-mortem 27/09).
notify pgrst, 'reload schema';
