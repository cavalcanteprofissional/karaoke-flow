-- Smoke da Fase 8a: player por SESSÃO + pré-aprovação de 24h.
--
-- Cobre o que os testes manuais de 27/09 quebraram e o que os testes unitários
-- não alcançam (as regras vivem no banco):
--   1. as DUAS portas do player: token (a TV) e sessão (participante/dono);
--   2. a pré-aprovação de 24h: ON/OFF, dentro/fora da janela, anônimo, e a
--      propagação para o player (membro pendente não assiste).
--
-- Diferente do `smoke-playback.sql`, este é AUTOSSUFICIENTE: cria a sala SMOKE8,
-- roda o roteiro nela e apaga no fim. Não precisa de `npm run seed` antes nem
-- depois e não encosta na fila das salas reais. Precisa apenas dos USUÁRIOS do
-- seed (identificados pelo ID FIXO — o e-mail deles pode ter sido personalizado
-- via SEED_* no .env.local).
--
-- Rodar: `node scripts/apply-sql.mjs scripts/smoke-player-session.sql`
-- (o relatório sai em `relatorio`).
--
-- Duas armadilhas já conhecidas (mesmas do smoke-playback.sql):
--   1. a ordem de avaliação dos argumentos de `jsonb_build_object` não é
--      garantida — toda RPC vai para uma variável antes de entrar no relatório;
--   2. `queue_items_initial_status` decide o status no INSERT, então item criado
--      'approved' numa sala `manual` volta 'pending'. Aqui a sala é `auto`, e o
--      smoke usa UPDATE mesmo assim para não depender disso.
--
-- O caso anônimo é simulado pelo CLAIM `is_anonymous` do JWT (criar um
-- auth.users anônimo por SQL é justamente o que o pos-mortem de 27/09 proíbe:
-- derruba o serviço Auth). A regra lê só o claim, então o teste é fiel; a prova
-- de ponta a ponta com `signInAnonymously` fica no checklist manual do
-- TESTING.md.
create temporary table smoke8a (
  passo text primary key,
  detalhe jsonb not null
) on commit drop;

do $$
declare
  v_code text := 'SMOKE8';
  v_room uuid;
  v_token uuid;
  v_host uuid;
  v_membro uuid;
  v_forasteiro uuid;
  v_estado jsonb;
  v_out jsonb;
  v_membro_row public.room_members;
  v_approved_at timestamptz;
begin
  -- O host vem do bar canônico (ZEHBAR), não de um id fixo: o dono do projeto
  -- é a conta OAuth real (SEED_HOST_USER_ID), e o …0001 do seed foi apagado
  -- por ficar órfão. Sobrevive a renomear e-mails e a trocar a conta do host.
  -- Ana e Bruno seguem ids fixos (contas de teste do seed).
  select host_id into v_host from public.bars where code = 'ZEHBAR';
  select id into v_membro from auth.users where id = '00000000-0000-0000-0000-000000000002';
  select id into v_forasteiro from auth.users where id = '00000000-0000-0000-0000-000000000003';
  if v_host is null or v_membro is null or v_forasteiro is null then
    insert into smoke8a values
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

  -- Membro aprovado agora (a janela de 24h nasce aqui, por trigger).
  insert into public.room_members (room_id, user_id, status)
  values (v_room, v_membro, 'approved');

  ------------------------------------------------------------------
  -- 1. As duas portas do player
  ------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_forasteiro::text, true);

  v_out := public.get_player_state(v_code, v_token);
  insert into smoke8a values
    ('01 tv com token', jsonb_build_object('ok', v_out ->> 'ok'));

  perform set_config('request.jwt.claim.sub', v_host::text, true);
  v_out := public.get_player_state(v_code, null);
  insert into smoke8a values
    ('02 host por sessao', jsonb_build_object('ok', v_out ->> 'ok'));

  perform set_config('request.jwt.claim.sub', v_membro::text, true);
  v_out := public.get_player_state(v_code, null);
  insert into smoke8a values
    ('03 membro aprovado por sessao', jsonb_build_object('ok', v_out ->> 'ok'));

  v_out := public.get_player_state(v_code, gen_random_uuid());
  insert into smoke8a values
    ('04 token errado nao cai pra sessao', jsonb_build_object(
      'ok', v_out ->> 'ok',
      'obs', 'deveria ser false: link velho da TV precisa continuar dando erro'
    ));

  perform set_config('request.jwt.claim.sub', v_forasteiro::text, true);
  v_out := public.get_player_state(v_code, null);
  insert into smoke8a values
    ('05 usuario de fora nao assiste', jsonb_build_object('ok', v_out ->> 'ok'));

  ------------------------------------------------------------------
  -- 2. Claim: só a TV (migration 00041, 03/10)
  --
  -- Antes desta migration, o `claim_next_song` aceitando a porta da sessão
  -- (a "porta 2" que a 00029 criou para o player VER) fazia cada celular com
  -- `/player/<código>` ser um segundo claimeador. O par dos casos é o que
  -- importa: o celular recusa E a TV continua andando.
  ------------------------------------------------------------------
  insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
  values (v_room, v_membro, 'smoke8a', 'Smoke 8a');

  perform set_config('request.jwt.claim.sub', v_membro::text, true);
  v_out := public.claim_next_song(v_code, null, null);
  insert into smoke8a values
    ('06 celular nao avanca a fila', jsonb_build_object(
      'ok', v_out ->> 'ok',
      'erro', v_out ->> 'error',
      'obs', 'deveria ser false: quem so assiste nao puxa a proxima'
    ));

  v_out := public.claim_next_song(v_code, v_token, null);
  insert into smoke8a values
    ('06b tv com token avanca', jsonb_build_object(
      'ok', v_out ->> 'ok',
      'tocando', v_out -> 'item' ->> 'title'
    ));

  perform set_config('request.jwt.claim.sub', v_host::text, true);
  perform public.set_playback(v_room, 'stop');

  ------------------------------------------------------------------
  -- 3. Pré-aprovação de 24h
  ------------------------------------------------------------------
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_membro::text, 'role', 'authenticated'
  )::text, true);
  perform set_config('request.jwt.claim.sub', v_membro::text, true);

  v_estado := public.member_entry_state(v_room);
  insert into smoke8a values
    ('07 preapproval ligada, autenticado aprovado agora', jsonb_build_object(
      'status', v_estado ->> 'status',
      'pre_approval', v_estado -> 'pre_approval',
      'obs', 'deveria ser approved/true'
    ));

  -- Anônimo: mesmo usuário, MESMA linha approved, mesmo instante — só o claim
  -- muda. É o requisito do PO: usuário sem login nunca é pré-aprovado.
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_membro::text, 'role', 'authenticated', 'is_anonymous', true
  )::text, true);
  v_estado := public.member_entry_state(v_room);
  insert into smoke8a values
    ('07b anonimo nunca e pre-aprovado', jsonb_build_object(
      'status', v_estado ->> 'status',
      'pre_approval', v_estado -> 'pre_approval',
      'obs', 'deveria ser pending/false mesmo aprovada agora'
    ));
  perform set_config('request.jwt.claims', jsonb_build_object(
    'sub', v_membro::text, 'role', 'authenticated'
  )::text, true);

  -- Fora da janela: 25h atrás, sem mexer em `status` (o trigger de
  -- approved_at só reage a mudança de status).
  update public.room_members
  set approved_at = now() - interval '25 hours'
  where room_id = v_room and user_id = v_membro;
  v_estado := public.member_entry_state(v_room);
  insert into smoke8a values
    ('08 preapproval vencida (25h)', jsonb_build_object(
      'status', v_estado ->> 'status',
      'pre_approval', v_estado -> 'pre_approval',
      'obs', 'deveria ser pending/false com entrada livre OFF'
    ));

  -- join_room grava o que a regra decidiu (e zera a janela).
  -- `join_room` devolve `room_members` (composto): atribuir direto num jsonb
  -- quebra, porque o texto da linha é "(...)(...)" e não é JSON.
  v_membro_row := public.join_room(v_code);
  insert into smoke8a values
    ('09 join_room persiste o status efetivo', jsonb_build_object(
      'status', v_membro_row.status,
      'approved_at_zerado', v_membro_row.approved_at is null
    ));

  -- A janela vencida NÃO expulsa de onde a pessoa está: a linha continua
  -- approved e o player libera. Quem rebaixa para pending é o join_room
  -- (passo 09), e é aí que o player passa a negar.
  update public.room_members
  set status = 'approved'
  where room_id = v_room and user_id = v_membro;
  update public.room_members
  set approved_at = now() - interval '25 hours'
  where room_id = v_room and user_id = v_membro;
  v_out := public.get_player_state(v_code, null);
  insert into smoke8a values
    ('10 janela vencida com linha aprovada ainda entra', jsonb_build_object(
      'ok', v_out ->> 'ok',
      'obs', 'ok=true e o esperado: 24h governa a ENTRADA, nao expulsa de dentro'
    ));

  -- E depois que o join rebaixa para pending, o player nega de verdade.
  perform set_config('request.jwt.claim.sub', v_membro::text, true);
  v_membro_row := public.join_room(v_code);
  v_out := public.get_player_state(v_code, null);
  insert into smoke8a values
    ('10b pending nao entra no player', jsonb_build_object(
      'status', v_membro_row.status,
      'player_ok', v_out ->> 'ok'
    ));

  -- Toggle OFF: ninguém é pré-aprovado.
  update public.rooms set pre_approval_24h = false where id = v_room;
  update public.room_members
  set status = 'approved', approved_at = now()
  where room_id = v_room and user_id = v_membro;
  v_estado := public.member_entry_state(v_room);
  insert into smoke8a values
    ('11 toggle OFF', jsonb_build_object(
      'status', v_estado ->> 'status',
      'pre_approval', v_estado -> 'pre_approval',
      'obs', 'deveria ser pending/false mesmo aprovada agora'
    ));
  update public.rooms set pre_approval_24h = true where id = v_room;

  -- Reaprovar quem já está aprovado NÃO renova a janela.
  update public.room_members
  set approved_at = now() - interval '25 hours'
  where room_id = v_room and user_id = v_membro;
  select approved_at into v_approved_at
  from public.room_members where room_id = v_room and user_id = v_membro;
  update public.room_members
  set status = 'approved'
  where room_id = v_room and user_id = v_membro;
  insert into smoke8a values
    ('12 reaprovar nao renova a janela', jsonb_build_object(
      'approved_at_intacto', (
        select approved_at = v_approved_at
        from public.room_members where room_id = v_room and user_id = v_membro
      )
    ));

  -- Estado de outra pessoa é null para o chamador.
  v_estado := public.member_entry_state(v_room, v_forasteiro);
  insert into smoke8a values
    ('13 estado de terceiro e null', jsonb_build_object('retorno', v_estado));

  -- Sala encerrada: `get_player_state` continua respondendo (o quiosque mostra
  -- o aviso de sala encerrada a partir de `room.status`); quem recusa é o
  -- `claim_next_song`, com 'sala encerrada'. O claim vai pelo TOKEN (a porta da
  -- sessão foi fechada na 00041), senão o caso mediria 'só a TV avança a fila'.
  update public.rooms set status = 'closed' where id = v_room;
  v_out := public.get_player_state(v_code, null);
  v_estado := public.claim_next_song(v_code, v_token, null);
  insert into smoke8a values
    ('14 sala encerrada (tv)', jsonb_build_object(
      'le_ok', v_out ->> 'ok',
      'claim_ok', v_estado ->> 'ok',
      'claim_erro', v_estado ->> 'error'
    ));
  update public.rooms set status = 'active' where id = v_room;

  -- Limpeza: cascade leva membros, fila e o resto.
  delete from public.rooms where code = v_code;
  insert into smoke8a values
    ('15 cleanup', jsonb_build_object('sala_ainda_existe', exists (
      select 1 from public.rooms where code = v_code
    )));
end;
$$;

select jsonb_object_agg(passo, detalhe order by passo) as relatorio from smoke8a;
