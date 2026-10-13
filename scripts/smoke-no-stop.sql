-- Smoke da Fase 19 (20261014000001): modo no-stop / rodízio por rodadas.
--
-- Prova, contra o banco real, sem encostar em sala de verdade (cria SMOKENOSTOP
-- e apaga no fim):
--   01 o rodízio intercala a 1ª de cada um, depois a 2ª...
--   02 o teto max_active_songs recusa com KF001 (sem substituir)
--   03 o host é isento do teto
--   04 desempate: quem cantou há mais tempo vem antes (nunca-cantou primeiro)
--   05 reorder fixa o item movido e o rodízio não o desloca
--   06 a assinatura antiga (2 args) de reorder_queue ainda funciona
--   07 as colunas novas existem em rooms_public
--   08 com no_stop desligado, volta a "1 ativa" (substitui a antiga)
--
-- Rodar: `node scripts/apply-sql.mjs scripts/smoke-no-stop.sql 12000`
create temporary table smokens (
  passo text primary key,
  detalhe jsonb not null
) on commit drop;

do $$
declare
  v_code text := 'SMOKENOSTOP';
  v_room uuid;
  v_host uuid;
  v_a uuid;
  v_b uuid;
  v_a1 uuid;
  v_a2 uuid;
  v_a3 uuid;
  v_b1 uuid;
  v_b2 uuid;
  v_err text;
  v_ok boolean;
  v_order text;
  v_pinned boolean;
  v_pos_pin integer;
  v_pos_after integer;
  v_ativas integer;
  v_cols integer;
  v_overloads integer;
begin
  select host_id into v_host from public.bars where code = 'KARAOKEDOZE';
  select id into v_a from auth.users where id = '00000000-0000-0000-0000-000000000002';
  select id into v_b from auth.users where id = '00000000-0000-0000-0000-000000000003';
  if v_host is null or v_a is null or v_b is null then
    insert into smokens values
      ('00 setup', jsonb_build_object('erro', 'host do KARAOKEDOZE ou usuarios de teste ausentes: rode npm run seed'));
    return;
  end if;

  -- Rerrodada limpa.
  delete from public.rooms where code = v_code;

  insert into public.rooms (
    code, host_id, entry_mode, queue_approval_mode, require_song_confirmation,
    pre_approval_24h, status, no_stop, max_active_songs
  )
  values (v_code, v_host, 'approval', 'manual', false, true, 'active', true, 3)
  returning id into v_room;

  insert into public.room_members (room_id, user_id, status)
  values (v_room, v_a, 'approved'), (v_room, v_b, 'approved');

  -- A pede A1, A2, A3; B pede B1, B2 — em ordem intercalada de propósito.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_a, 'nsA1', 'A1') returning id into v_a1;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_b, 'nsB1', 'B1') returning id into v_b1;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_a, 'nsA2', 'A2') returning id into v_a2;
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_a, 'nsA3', 'A3') returning id into v_a3;

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_b, 'nsB2', 'B2') returning id into v_b2;

  select string_agg(title, ',' order by position) into v_order
  from public.queue_items where room_id = v_room;
  insert into smokens values ('01 rodizio', jsonb_build_object(
    'ordem', v_order,
    'esperado', 'A1,B1,A2,B2,A3',
    'tudo_approved', not exists (
      select 1 from public.queue_items where room_id = v_room and status <> 'approved'
    ),
    'obs', 'no-stop forca aprovacao automatica'
  ));

  -- 02: A já tem 3 ativas -> a 4ª é recusada (KF001), sem substituir.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_err := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_a, 'nsA4', 'A4');
  exception when others then
    v_err := sqlstate || ': ' || sqlerrm;
  end;
  select count(*) into v_ativas
  from public.queue_items
  where room_id = v_room and added_by_user_id = v_a
    and status in ('pending', 'approved', 'playing');
  insert into smokens values ('02 teto recusa (KF001)', jsonb_build_object(
    'erro', v_err,
    'ativas_do_a', v_ativas,
    'obs', 'esperado KF001 e exatamente 3 ativas (sem substituir)'
  ));

  -- 03: host é isento do teto.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  v_err := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_host, 'nsH1', 'H1');
  exception when others then
    v_err := sqlstate || ': ' || sqlerrm;
  end;
  insert into smokens values ('03 host isento', jsonb_build_object(
    'erro', v_err, 'obs', 'esperado erro null'
  ));

  -- 04: desempate por quem cantou há mais tempo (nunca-cantou primeiro).
  -- A cantou A1 há 2h; B cantou B1 há 1h; host e a 2ª/3ª nunca cantaram.
  update public.queue_items set started_at = now() - interval '2 hours' where id = v_a1;
  update public.queue_items set started_at = now() - interval '1 hour'  where id = v_b1;
  perform public.recompute_queue_positions(v_room);
  select string_agg(title, ',' order by position) into v_order
  from public.queue_items where room_id = v_room;
  insert into smokens values ('04 tie-break', jsonb_build_object(
    'ordem', v_order,
    'esperado', 'H1,A1,B1,A2,B2,A3',
    'obs', 'rodada 1: nunca-cantou (H1) primeiro, depois quem cantou ha mais tempo (A 2h, B 1h)'
  ));

  -- 05: reorder fixa o item movido. Inverte a fila e fixa A2.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  v_ok := public.reorder_queue(
    v_room,
    array(
      select id from public.queue_items
      where room_id = v_room and status in ('pending', 'approved', 'playing')
      order by position desc
    ),
    v_a2
  );
  select position into v_pos_pin from public.queue_items where id = v_a2;
  select pinned into v_pinned from public.queue_items where id = v_a2;

  -- B pede mais uma (B3): o recompute roda e o fixado não pode sair do lugar.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_b::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_b::text, true);
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_b, 'nsB3', 'B3');

  select position into v_pos_after from public.queue_items where id = v_a2;
  insert into smokens values ('05 pinned nao desloca', jsonb_build_object(
    'reorder_ok', v_ok,
    'a2_pinned', v_pinned,
    'pos_apos_reorder', v_pos_pin,
    'pos_apos_novo_pedido', v_pos_after,
    'obs', 'esperado reorder_ok true, pinned true e as posicoes iguais'
  ));

  -- 06: assinatura antiga (2 args) ainda funciona.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_host::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  v_ok := public.reorder_queue(
    v_room,
    array(
      select id from public.queue_items
      where room_id = v_room and status in ('pending', 'approved', 'playing')
      order by position
    )
  );
  insert into smokens values ('06 overload 2 args', jsonb_build_object(
    'ok', v_ok, 'obs', 'esperado true (compat do app antigo)'
  ));

  -- 07: colunas novas na view + as duas assinaturas no catálogo.
  select count(*) into v_cols
  from information_schema.columns
  where table_schema = 'public' and table_name = 'rooms_public'
    and column_name in ('no_stop', 'max_active_songs');
  select count(*) into v_overloads
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'reorder_queue';
  insert into smokens values ('07 catalogo', jsonb_build_object(
    'rooms_public_colunas', v_cols,
    'reorder_overloads', v_overloads,
    'obs', 'esperado 2 colunas e 2 assinaturas'
  ));

  -- 08: desligar o no-stop volta ao "1 ativa" (substitui a antiga).
  update public.rooms set no_stop = false where id = v_room;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_a::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_a::text, true);
  v_err := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_a, 'nsA5', 'A5');
  exception when others then
    v_err := sqlstate || ': ' || sqlerrm;
  end;
  select count(*) into v_ativas
  from public.queue_items
  where room_id = v_room and added_by_user_id = v_a
    and status in ('pending', 'approved', 'playing');
  insert into smokens values ('08 no-stop off volta a 1 ativa', jsonb_build_object(
    'erro', v_err,
    'ativas_do_a', v_ativas,
    'obs', 'esperado erro null e exatamente 1 ativa (a nova substituiu as antigas)'
  ));

  -- Limpeza.
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.rooms where code = v_code;
  insert into smokens values ('09 cleanup', jsonb_build_object(
    'sala_ainda_existe', exists (select 1 from public.rooms where code = v_code)
  ));
end;
$$;

select jsonb_object_agg(passo, detalhe order by passo) as relatorio from smokens;
