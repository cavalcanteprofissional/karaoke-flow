-- Smoke da Fase 8g (B2): `release_current_item` (migration 20261005000044).
--
-- O caso que ele existe para provar: a TV é trancada com a música no ar e o
-- cantor fica bloqueado em `KF001` para sempre, porque nada mais termina a
-- faixa. Sem a RPC, o item fica `playing` eterno; com ela, volta para
-- `approved` na MESMA posição e a sala volta a `idle`.
--
-- Autossuficiente (mesmo formato do `smoke-player-session.sql`): cria a sala
-- SMOKE8G, roda o roteiro e apaga no fim. Não encosta na fila de sala real.
--
-- Rodar: `node scripts/apply-sql.mjs scripts/smoke-release-current-item.sql 8000`
create temporary table smoke8g (
  passo text primary key,
  detalhe jsonb not null
) on commit drop;

do $$
declare
  v_code text := 'SMOKE8G';
  v_room uuid;
  v_token uuid;
  v_host uuid;
  v_membro uuid;
  v_forasteiro uuid;
  v_item uuid;
  v_pos_antes integer;
  v_erro text;
  v_out jsonb;
  v_linha public.rooms%rowtype;
  v_ativo integer;
begin
  select host_id into v_host from public.bars where code = 'ZEHBAR';
  select id into v_membro from auth.users where id = '00000000-0000-0000-0000-000000000002';
  select id into v_forasteiro from auth.users where id = '00000000-0000-0000-0000-000000000003';
  if v_host is null or v_membro is null or v_forasteiro is null then
    insert into smoke8g values
      ('00 setup', jsonb_build_object('erro', 'host do ZEHBAR ou usuarios de teste ausentes: rode npm run seed'));
    return;
  end if;

  -- Rerrodada limpa.
  delete from public.rooms where code = v_code;

  insert into public.rooms (
    code, host_id, entry_mode, queue_approval_mode, require_song_confirmation,
    pre_approval_24h, status
  )
  values (v_code, v_host, 'approval', 'auto', false, true, 'active')
  returning id, player_token into v_room, v_token;

  insert into public.room_members (room_id, user_id, status)
  values (v_room, v_membro, 'approved');

  -- Fila: a do membro (posição 1) e a do host (posição 2), para o release
  -- ter o que devolver E o que não pode mexer.
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_membro, 'smoke8g1', 'Smoke 8g 1')
  returning id into v_item;
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_host, 'smoke8g2', 'Smoke 8g 2');
  update public.queue_items set status = 'approved' where room_id = v_room;

  select position into v_pos_antes from public.queue_items where id = v_item;

  -- A música no ar: claim pela TV, como o quiosque faz.
  v_out := public.claim_next_song(v_code, v_token, null);
  insert into smoke8g values ('01 claim da tv poe no ar', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'tocando', v_out -> 'item' ->> 'title',
    'status', (v_out ->> 'playback_status')
  ));

  -- Enquanto toca, o cantor NÃO consegue pedir (a trigger de uma música
  -- ativa). É a regra que o release existe para destravar.
  v_erro := null;
  begin
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_membro::text, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', v_membro::text, true);
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_membro, 'smoke8g3', 'Smoke 8g 3');
  exception when others then
    v_erro := sqlstate || ': ' || sqlerrm;
  end;
  insert into smoke8g values ('02 tocando recusa o pedido (KF001)', jsonb_build_object(
    'erro', v_erro,
    'obs', 'esperado KF001; null = a regra de uma musica ativa nao barrou'
  ));

  -- O release: a TV trancada paga a conta.
  v_out := public.release_current_item(v_code, v_token);
  select * into v_linha from public.rooms where id = v_room;
  insert into smoke8g values ('03 release devolve para approved e idle', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'released', v_out ->> 'released',
    'playback_status_retorno', v_out ->> 'playback_status',
    'item_status', (select status::text from public.queue_items where id = v_item),
    'mesma_posicao', (select position = v_pos_antes from public.queue_items where id = v_item),
    'current_item_id_nulo', v_linha.current_item_id is null,
    'room_playback_status', v_linha.playback_status::text,
    'obs', 'ok/released true, item approved na mesma posicao, sala idle'
  ));

  -- Sem música no ar: sucesso, mas released false (não há o que devolver).
  v_out := public.release_current_item(v_code, v_token);
  insert into smoke8g values ('04 release sem nada no ar nao inventa', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'released', v_out ->> 'released',
    'obs', 'esperado ok true / released false'
  ));

  -- Token errado nunca cai para sessão (link velho da TV).
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  v_out := public.release_current_item(v_code, gen_random_uuid());
  insert into smoke8g values ('05 token errado nao cai pra sessao', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'erro', v_out ->> 'error',
    'obs', 'esperado ok false / player invalido'
  ));

  -- Porta 2: o host resolve pela própria sessão, sem token nenhum.
  v_out := public.claim_next_song(v_code, v_token, null);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  v_out := public.release_current_item(v_code, null);
  insert into smoke8g values ('06 host libera pela sessao', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'released', v_out ->> 'released',
    'obs', 'esperado ok/released true sem passar token'
  ));

  -- Quem não tem vínculo com a sala não libera nada.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_forasteiro::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_forasteiro::text, true);
  v_out := public.release_current_item(v_code, null);
  insert into smoke8g values ('07 forasteiro nao libera', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'erro', v_out ->> 'error',
    'obs', 'esperado ok false / player invalido'
  ));

  -- Sala encerrada: mesmo com música no ar, recusa como o claim.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  v_out := public.claim_next_song(v_code, v_token, null);
  update public.rooms set status = 'closed' where id = v_room;
  v_out := public.release_current_item(v_code, v_token);
  insert into smoke8g values ('08 sala encerrada recusa', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'erro', v_out ->> 'error',
    'obs', 'esperado ok false / sala encerrada'
  ));
  update public.rooms set status = 'active' where id = v_room;

  -- A música que o claim do passo 08 pôs no ar continua lá (o release daquele
  -- passo foi recusado junto com a sala fechada): liberando de verdade antes
  -- de medir o destravamento, senão o KF001 do 09 seria a regra certa atrapalhando
  -- a medição.
  v_out := public.release_current_item(v_code, v_token);
  insert into smoke8g values ('08b release apos reabrir', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'released', v_out ->> 'released'
  ));

  -- O ponto do produto: depois do release, o cantor volta a conseguir pedir
  -- (e o pedido novo substitui a devolvida — a regra de uma ativa manda).
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_membro::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_membro::text, true);
  v_erro := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_membro, 'smoke8g4', 'Smoke 8g 4');
  exception when others then
    v_erro := sqlstate || ': ' || sqlerrm;
  end;
  select count(*) into v_ativo
  from public.queue_items
  where room_id = v_room and added_by_user_id = v_membro
    and status in ('pending', 'approved', 'playing');
  insert into smoke8g values ('09 cantor destravado apos o release', jsonb_build_object(
    'erro', v_erro,
    'ativas_do_membro', v_ativo,
    'obs', 'esperado erro null e exatamente 1 ativa (a nova substituiu a devolvida)'
  ));

  -- Limpeza.
  delete from public.rooms where code = v_code;
  insert into smoke8g values ('10 cleanup', jsonb_build_object(
    'sala_ainda_existe', exists (select 1 from public.rooms where code = v_code)
  ));
end;
$$;

select jsonb_object_agg(passo, detalhe order by passo) as relatorio from smoke8g;
