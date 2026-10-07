-- Fase 8g (B2) — trancar a TV com música no ar devolve a música para a fila.
--
-- O BLOQUEIO QUE ESTE CASO CRIA
-- `queue_items_one_active_per_participant` (migration `20261004000042`) recusa
-- um novo pedido com `KF001` enquanto o participante tem algo em `playing` — e
-- recusa de propósito, porque cortar o áudio da TV não é aceitável. Mas esse
-- portão pressupõe que a música VAI terminar sozinha, e há um caminho em que
-- ela não termina: o host aperta "Trancar TV" com a faixa no ar.
--
-- O que acontece no quiosque (`player-kiosk.tsx`): o arm é limpo, o stage some
-- (`showPlayer = Boolean(current) && effectiveArmed`) — o vídeo para de vez,
-- nada mais vai disparar `onEnded` — e `shouldAutoAdvance`/`shouldClaimFromIdle`
-- passam a responder `false` por `armed = false`. Ou seja: nenhum `claim_next_song`
-- acontece nunca mais. O item fica em `playing` eternamente e o cantor não consegue
-- pedir nada **nunca mais**. Não é demora, é bloqueio permanente; o único
-- destravamento que existia era o host lembrar de apertar Pular/Parar.
--
-- POR QUE O BANCO NÃO CONSEGUE DECIDIR ISSO SOZINHO
-- O estado "desarmada" mora no `localStorage` da TV (`src/lib/rooms/player-arm.ts`);
-- `rooms` não tem coluna nenhuma de arm, e não vai ter: sem isso, qualquer trigger
-- ou `claim_next_song` olhando "o player está desarmado?" estaria adivinhando. Quem
-- SABE que trancou é a própria TV, e é ela quem paga a conta — antes de apagar a
-- marcação, ela devolve o que estava segurando.
--
-- POR QUE `approved`, E NÃO `played`/`skipped`
-- A faixa não terminou (o vídeo parou no meio), então `played` seria mentira e
-- `skipped` roubaria a vez do cantor. De volta para `approved` na MESMA posição:
-- quem estava atrás dele não muda de lugar, e a música toca de novo quando a TV
-- for rearmada. É a mesma disciplina de `resolveOwnActiveSong`, que recusa a troca
-- da `playing` justamente para não cortar o áudio — aqui o áudio já parou, então
-- devolver é o ato coerente.
--
-- SEGURANÇA: mesma porta de `claim_next_song` — `player_room_id` (migration
-- `20260927000029`) resolve pelo token da TV OU pela sessão de quem está chamando.
-- Ninguém de fora da sala consegue mexer na fila por aqui.

create or replace function public.release_current_item(
  p_room_code text,
  p_token uuid default null
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
  v_released uuid;
begin
  v_room_id := public.player_room_id(p_room_code, p_token);
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  select * into v_room from public.rooms where id = v_room_id;

  if v_room.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'sala encerrada');
  end if;

  -- Mesma chave do `claim_next_song`: liberação e avanço não podem correr em
  -- paralelo, senão uma devolve o item para `approved` enquanto a outra o lê
  -- como "tocando" e puxa a próxima faixa por cima.
  perform pg_advisory_xact_lock(
    hashtextextended('karaoke_queue:' || v_room_id::text, 0)
  );

  if v_room.current_item_id is null then
    -- Nada no ar: a sala já está ociosa e não há o que liberar. Sucesso,
    -- porque o estado desejado já é este — o quiosque chama isto ao travar sem
    -- saber se havia música, e "já está liberado" não é erro.
    return jsonb_build_object(
      'ok', true,
      'released', false,
      'playback_status', v_room.playback_status
    );
  end if;

  -- `where ... and status = 'playing'` é a confirmação de que ainda é a música
  -- que a sala diz estar tocando. Se outra aba já a terminalizou, o update não
  -- casa nenhuma linha e `released` sai `false` — nada foi devolvido porque
  -- nada estava preso.
  update public.queue_items
  set status = 'approved'::public.queue_item_status
  where id = v_room.current_item_id
    and status = 'playing'::public.queue_item_status
  returning id into v_released;

  update public.rooms
  set current_item_id = null,
      playback_status = 'idle'::public.playback_status,
      current_item_started_at = null
  where id = v_room_id;

  return jsonb_build_object(
    'ok', true,
    'released', v_released is not null,
    'playback_status', 'idle'::text
  );
end;
$$;

revoke all on function public.release_current_item(text, uuid) from public;
grant execute on function public.release_current_item(text, uuid) to anon, authenticated;

comment on function public.release_current_item(text, uuid) is
  'Devolve a música presa em `playing` para `approved` quando a TV é trancada com ela no ar (Fase 8g/B2). Sem isso o cantor fica bloqueado em KF001 para sempre. Porta igual à de claim_next_song: token da TV ou sessão de membro.';

-- Mesma lição do PGRST201 de 27/09: argumento opcional muda a assinatura que o
-- PostgREST cacheia, e sem o notify a RPC nova aparece como "não encontrada".
notify pgrst, 'reload schema';
