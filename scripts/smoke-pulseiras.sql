-- Fase 18 — pulseira: o ingresso de uso único do bar.
--
-- O QUE PROVA (autossuficiente, sem depender de bar de outra fase):
--   01 `create_bar` agora EXIGE o interruptor (contrato de 10 argumentos);
--   02 `create_bar` com pulseira ON persiste `pulseiras_ativadas = true`;
--   03 `get_entry_preview` já devolve `pulseiras_ativadas` (a /entrar lê daqui);
--   04 `gerar_pulseiras` com o default cria 10 códigos de 6 chars do alfabeto,
--      únicos e com validade de 24h (já nascem expirando "daqui a um dia");
--   05 `gerar_pulseiras` recusa 0, 101 e não-dono;
--   06 RLS: `pulseiras_codigos` é invisível para quem não é dono do bar;
--   07 preço: `upsert_preco_pulseira` cria faixa, recusa sobreposição,
--      `preco_vigente` devolve o valor de AGORA e `remover_preco_pulseira`
--      volta o preço a null;
--   08 `resgatar_pulseira` ativa, congela o preço, recusa segundo resgate
--      (JA_TEM_ACESSO), não reusa código (CODIGO_USADO), valida o código
--      (CODIGO_INVALIDO), tranca anônimo (ANONYMOUS) sem queimar a pulseira,
--      recusa bar sem pulseira (PULSEIRA_INATIVA) e RENOVA acesso expirado;
--   09 O gate de verdade: a trigger `queue_items_exige_pulseira` barra KF002 o
--      não-host sem acesso, deixa o HOST cantar de graça e libera quem está
--      com a pulseira ativa (mesmo que seja a 1ª música);
--   10 `member_entry_state` devolve `pulseira_exigida`/`tem_pulseira` (a UI
--      inteira — sala, busca e entrada — lê desta função);
--   11 nada disso persiste: `begin` … `rollback`.

-- Conta de teste: Bruno (…0003) cria o bar da smoke (não tem bar no seed e,
-- como não é dev, o teto "1 bar por dono" não atrapalha). Zé (host do ZEHBAR),
-- Ana (…0002) e Betânia (…0004) entram como participantes.
--
-- Rodar: node scripts/apply-sql.mjs scripts/smoke-pulseiras.sql 16000
-- Esperado: todas as linhas com `ok = true`.

begin;

create temporary table smoke18 (
  passo text primary key,
  resultado text not null,
  ok boolean not null
) on commit drop;

do $$
declare
  v_ze uuid;
  v_bru uuid := '00000000-0000-0000-0000-000000000003';
  v_ana uuid := '00000000-0000-0000-0000-000000000002';
  v_bet uuid := '00000000-0000-0000-0000-000000000004';
  v_bar uuid;
  v_bar_off uuid;
  v_room uuid;
  v_room_code text;
  v_ativadas boolean;
  v_cod text;
  v_cod2 text;
  v_out jsonb;
  v_erro text;
  v_count int;
  v_preco int;
  v_ate timestamptz;
  v_dia int;
  r record;
begin
  select host_id into v_ze from public.bars where code = 'ZEHBAR';
  if v_ze is null then
    raise exception 'rode `npm run seed` antes (esperado o bar ZEHBAR)';
  end if;

  -- ─────────────────────────── 01) contrato de create_bar ────────────────────
  -- A assinatura antiga (9 argumentos) foi dropada junto com a criação do
  -- campo: chamá-la agora é "function does not exist". Chamada com claims de
  -- Bruno (que ainda não tem bar): o erro é o DO CONTRATO, não o do teto.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);
  v_erro := null;
  begin
    select * into r from public.create_bar('Smoke 18', 'Fortaleza', '', 1,
      null, null, null, 500, null);
  exception when others then
    v_erro := sqlerrm;
  end;
  insert into smoke18 values ('01 create_bar sem interruptor recusa', jsonb_build_object(
    'erro', v_erro,
    'obs', 'esperado "function … does not exist"'
  )::text, v_erro is not null and v_erro like '%does not exist%');

  -- ──────────────────────── 02) criar com pulseira ON ───────────────────────
  select * into r from public.create_bar('Smoke Pulse', 'Fortaleza', '', 1,
    null, null, null, 500, 'SMKPUL', p_pulseiras_ativadas => true);
  v_bar := r.bar_id;
  v_room := r.room_id;
  v_room_code := r.room_code;
  select pulseiras_ativadas into v_ativadas from public.bars where id = v_bar;
  insert into smoke18 values ('02 create_bar grava o interruptor', jsonb_build_object(
    'bar', v_bar, 'room_code', v_room_code, 'pulseiras_ativadas', v_ativadas
  )::text, v_ativadas is true);

  -- ──────────────────── 03) get_entry_preview carrega o campo ───────────────
  select * into r from public.get_entry_preview(v_room_code, null);
  insert into smoke18 values ('03 preview do bar com pulseira', jsonb_build_object(
    'pulseiras_ativadas', r.pulseiras_ativadas,
    'bar_nome', r.bar_nome
  )::text, (r.pulseiras_ativadas is true));
  select * into r from public.get_entry_preview('ZEHBAR', null);
  insert into smoke18 values ('03b preview do ZEHBAR (sem pulseira)', jsonb_build_object(
    'pulseiras_ativadas', r.pulseiras_ativadas
  )::text, (r.pulseiras_ativadas is false));

  -- ──────────────────── 04) gerar_pulseiras (lote default) ──────────────────
  v_count := public.gerar_pulseiras(v_bar);
  select count(*) into v_count from public.pulseiras_codigos where bar_id = v_bar;
  insert into smoke18 values ('04 lote default de 10', v_count::text, v_count = 10);
  insert into smoke18 values ('04b 6 chars do alfabeto sem I/O/1/0', (
    select string_agg(codigo, ',') from public.pulseiras_codigos where bar_id = v_bar
  ), not exists (
    select 1 from public.pulseiras_codigos
    where bar_id = v_bar and codigo !~ '^[A-HJ-NP-Z2-9]{6}$'
  ));
  insert into smoke18 values ('04c códigos únicos e com 24h', (
    select count(distinct codigo)::text || ' distintos / '
      || count(*)::text || ' linhas'
    from public.pulseiras_codigos where bar_id = v_bar
  ), not exists (
    select 1 from public.pulseiras_codigos
    where bar_id = v_bar and expira_em - criado_em <> interval '24 hours'
  ));

  -- ──────────────────────── 05) gerar e ser dono ────────────────────────────
  v_erro := null;
  begin
    perform public.gerar_pulseiras(v_bar, 0);
  exception when others then v_erro := sqlerrm; end;
  insert into smoke18 values ('05a gera 0 recusa', coalesce(v_erro, 'SEM ERRO'), v_erro is not null);
  v_erro := null;
  begin
    perform public.gerar_pulseiras(v_bar, 101);
  exception when others then v_erro := sqlerrm; end;
  insert into smoke18 values ('05b gera 101 recusa', coalesce(v_erro, 'SEM ERRO'), v_erro is not null);

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ana::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_ana::text, true);
  v_erro := null;
  begin
    perform public.gerar_pulseiras(v_bar);
  exception when others then v_erro := sqlerrm; end;
  insert into smoke18 values ('05c não-dono recusa', v_erro,
    v_erro is not null and v_erro like '%bar não encontrado%');

  -- ──────────────── 06) RLS de pulseiras_codigos (host-only) ────────────────
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_bet::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
      true);
    perform set_config('request.jwt.claim.sub', v_bet::text, true);
    select count(*) into v_count from public.pulseiras_codigos where bar_id = v_bar;
    set local role postgres;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into smoke18 values ('06a códigos invisíveis ao não-dono',
      v_count::text, v_count = 0);
  exception when others then
    set local role postgres;
    insert into smoke18 values ('06a códigos invisíveis ao não-dono', 'erro ao ler', false);
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      jsonb_build_object('sub', v_bru::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
      true);
    perform set_config('request.jwt.claim.sub', v_bru::text, true);
    select count(*) into v_count from public.pulseiras_codigos where bar_id = v_bar;
    set local role postgres;
    perform set_config('request.jwt.claims', '', true);
    perform set_config('request.jwt.claim.sub', '', true);
    insert into smoke18 values ('06b dono vê a própria coleção',
      v_count::text, v_count = 10);
  exception when others then
    set local role postgres;
    insert into smoke18 values ('06b dono vê a própria coleção', 'erro ao ler', false);
  end;

  -- ──────────────── 07) faixa de valor (upsert / sobreposição / vigente) ───
  -- A faixa "hoje inteira" cobre AGORA não importa a hora em que o smoke roda
  -- (fuso de São Paulo), então o teste de preço não depende do horário.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);
  v_dia := extract(dow from now() at time zone 'America/Sao_Paulo')::int;
  perform public.upsert_preco_pulseira(v_bar, v_dia, '00:00', '24:00', 1500);
  select count(*) into v_count from public.pulseiras_precos where bar_id = v_bar;
  insert into smoke18 values ('07a upsert cria a faixa', v_count::text, v_count = 1);

  v_erro := null;
  begin
    perform public.upsert_preco_pulseira(v_bar, v_dia, '12:00', '13:00', 2000);
  exception when others then v_erro := sqlerrm; end;
  insert into smoke18 values ('07b sobreposição recusa', v_erro,
    v_erro is not null and v_erro like '%sobreposta%');

  select public.preco_vigente(v_bar) into v_preco;
  insert into smoke18 values ('07c valor de agora é o da faixa', coalesce(v_preco, 0)::text,
    v_preco = 1500);

  perform public.remover_preco_pulseira(v_bar, v_dia, '00:00');
  select public.preco_vigente(v_bar) into v_preco;
  insert into smoke18 values ('07d remover volta o preço a null',
    coalesce(v_preco, -1)::text, v_preco is null);

  -- ──────────────── 08) resgatar: ativa, congela e não reusa ────────────────
  -- Recoloca a faixa "hoje inteira" para o resgate congelar os 1500.
  perform public.upsert_preco_pulseira(v_bar, v_dia, '00:00', '24:00', 1500);

  select codigo into v_cod from public.pulseiras_codigos where bar_id = v_bar order by criado_em limit 1;
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ana::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_ana::text, true);
  v_out := public.resgatar_pulseira(v_bar, v_cod);
  insert into smoke18 values ('08a Ana ativa e congela o preço', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'preco', v_out ->> 'preco_centavos'
  )::text, (v_out ->> 'ok')::boolean = true and (v_out ->> 'preco_centavos')::numeric = 1500
    and (v_out ->> 'acesso_ate')::timestamptz > now() + interval '23 hours');

  -- Acesso vigente: segundo resgate (com outro código) recusa.
  select codigo into v_cod2 from public.pulseiras_codigos
  where bar_id = v_bar and codigo <> v_cod order by criado_em limit 1;
  v_out := public.resgatar_pulseira(v_bar, v_cod2);
  insert into smoke18 values ('08b acesso vigente recusa (JA_TEM_ACESSO)', jsonb_build_object(
    'code', v_out ->> 'code', 'acesso_ate', v_out ->> 'acesso_ate'
  )::text, (v_out ->> 'code') = 'JA_TEM_ACESSO');
  -- E o código novo NÃO foi queimado no processo.
  insert into smoke18 values ('08c código extra continua vivo', (
    select usado_em is null from public.pulseiras_codigos where codigo = v_cod2
  )::text, (select usado_em is null from public.pulseiras_codigos where codigo = v_cod2));

  -- Mesmo código não reusa: Betânia tenta o que já está no pulso de Ana.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bet::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bet::text, true);
  v_out := public.resgatar_pulseira(v_bar, v_cod);
  insert into smoke18 values ('08d código usado não reusa (CODIGO_USADO)',
    v_out ->> 'code', (v_out ->> 'code') = 'CODIGO_USADO');

  v_out := public.resgatar_pulseira(v_bar, 'ZZZZZZ');
  insert into smoke18 values ('08e código inventado (CODIGO_INVALIDO)',
    v_out ->> 'code', (v_out ->> 'code') = 'CODIGO_INVALIDO');

  -- Garante um código limpo para o teste de anônimo (Betânia ainda não ativou).
  select codigo into v_cod from public.pulseiras_codigos
  where bar_id = v_bar and usado_em is null order by criado_em desc limit 1;

  -- Anônimo: mesmo com código válido, a porta fecha sem queimar a pulseira.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bet::text, 'role', 'authenticated', 'is_anonymous', 'true')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bet::text, true);
  v_out := public.resgatar_pulseira(v_bar, v_cod);
  select (usado_em is null) into v_ativadas from public.pulseiras_codigos where codigo = v_cod;
  insert into smoke18 values ('08f anônimo recusado sem queimar', jsonb_build_object(
    'code', v_out ->> 'code',
    'codigo_ainda_vivo', v_ativadas
  )::text, (v_out ->> 'code') = 'ANONYMOUS' and v_ativadas is true);

  -- Bar sem pulseira: resgatar num bar de outro mundo não é "uso".
  select id into v_bar_off from public.bars where code = 'ZEHBAR';
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bet::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bet::text, true);
  v_out := public.resgatar_pulseira(v_bar_off, v_cod);
  insert into smoke18 values ('08g sem pulseira no bar (PULSEIRA_INATIVA)',
    v_out ->> 'code', (v_out ->> 'code') = 'PULSEIRA_INATIVA');

  -- Renovação de acesso expirado: Ana ganha 24h de novo com um código novo.
  -- (Volta a claims dela: desde o 08g o JWT é da Betânia, e o resgate age na
  -- pessoa da sessão.)
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ana::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_ana::text, true);
  -- Rewind também o `resgatado_em` para a janela `acesso_ate > resgatado_em`
  -- (check da tabela) continuar valendo: a linha fica expirada vs. `now()`,
  -- mas íntegra.
  update public.pulseiras_acessos
  set resgatado_em = now() - interval '2 hours',
      acesso_ate = now() - interval '1 hour'
  where bar_id = v_bar and user_id = v_ana;
  v_out := public.resgatar_pulseira(v_bar, v_cod2);
  select acesso_ate into v_ate from public.pulseiras_acessos
  where bar_id = v_bar and user_id = v_ana;
  insert into smoke18 values ('08h acesso expirado renova', jsonb_build_object(
    'ok', v_out ->> 'ok',
    'ate', v_ate
  )::text, (v_out ->> 'ok')::boolean = true and v_ate > now() + interval '23 hours');

  -- ─────────────────── 09) o gate de verdade (trigger KF002) ────────────────
  -- Betânia entra como membro SEM pulseira ativa: a trigger precisa barrar o
  -- primeiro pedido dela. (Bruno é o host da sala da smoke — e o host canta de
  -- graça, testado logo a seguir.)
  insert into public.room_members (room_id, user_id, status)
  values (v_room, v_bet, 'approved');
  insert into public.room_members (room_id, user_id, status)
  values (v_room, v_ana, 'approved');

  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bet::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bet::text, true);
  v_erro := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_bet, 'smoke18a', 'Smoke 18 a');
  exception when others then v_erro := sqlstate || ': ' || sqlerrm; end;
  insert into smoke18 values ('09a sem pulseira não canta (KF002)', coalesce(v_erro, 'SEM ERRO'),
    v_erro is not null and v_erro like '%KF002%');

  -- Agora mesmo (claims de quem ainda não ativou), o status EFETIVO diz a
  -- verdade: a casa exige e a pessoa não tem.
  v_out := public.member_entry_state(v_room);
  insert into smoke18 values ('10b quem não ativou (true/false)', jsonb_build_object(
    'exigida', v_out ->> 'pulseira_exigida',
    'tem', v_out ->> 'tem_pulseira'
  )::text, (v_out ->> 'pulseira_exigida')::boolean = true
    and (v_out ->> 'tem_pulseira')::boolean = false);

  -- Host isento: Bruno (dono da sala) pede sem ter ativado pulseira nenhuma.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);
  v_erro := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_bru, 'smoke18h', 'Smoke 18 host');
  exception when others then v_erro := sqlerrm; end;
  insert into smoke18 values ('09b host canta de graça', coalesce(v_erro, 'SEM ERRO'), v_erro is null);

  -- Pulseira ativa libera: Ana (com acesso) pede a primeira música e passa,
  -- mesmo sendo o primeiro item e sem aprovação de camarote.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ana::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_ana::text, true);
  v_erro := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_ana, 'smoke18b', 'Smoke 18 b');
  exception when others then v_erro := sqlerrm; end;
  insert into smoke18 values ('09c com pulseira ativa canta', coalesce(v_erro, 'SEM ERRO'), v_erro is null);

  -- Resgate liberta: Betânia ativa um código limpo e o próximo pedido passa.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bet::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_bet::text, true);
  select codigo into v_cod from public.pulseiras_codigos
  where bar_id = v_bar and usado_em is null order by criado_em desc limit 1;
  v_out := public.resgatar_pulseira(v_bar, v_cod);
  v_erro := null;
  begin
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room, v_bet, 'smoke18c', 'Smoke 18 c');
  exception when others then v_erro := sqlerrm; end;
  insert into smoke18 values ('09d resgate liberta o canto', jsonb_build_object(
    'resgate_ok', v_out ->> 'ok',
    'insert_erro', v_erro
  )::text, (v_out ->> 'ok')::boolean = true and v_erro is null);

  -- ──────────────── 10) member_entry_state conta a verdade ──────────────────
  -- A função lê `auth.uid()` quando o p_user_id é omitido; cada passo
  -- impersona a pessoa cujo estado quer ver (é o mesmo caminho do app).
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ana::text, 'role', 'authenticated', 'is_anonymous', 'false')::text,
    true);
  perform set_config('request.jwt.claim.sub', v_ana::text, true);
  v_out := public.member_entry_state(v_room);
  insert into smoke18 values ('10a quem tem acesso (true/true)', jsonb_build_object(
    'exigida', v_out ->> 'pulseira_exigida',
    'tem', v_out ->> 'tem_pulseira'
  )::text, (v_out ->> 'pulseira_exigida')::boolean = true
    and (v_out ->> 'tem_pulseira')::boolean = true);

  -- Ana também é membro do KARAOKE (sala do ZEHBAR, sem pulseira no bar).
  v_out := public.member_entry_state((select id from public.rooms where code = 'KARAOKE'));
  insert into smoke18 values ('10c bar sem pulseira (false/false)', jsonb_build_object(
    'exigida', v_out ->> 'pulseira_exigida',
    'tem', v_out ->> 'tem_pulseira'
  )::text, (v_out ->> 'pulseira_exigida')::boolean = false
    and (v_out ->> 'tem_pulseira')::boolean = false);
end;
$$;

-- 11) O rollback do arquivo é a prova de que nada ficou para trás (o contador
-- de bars do Bruno e os códigos gerados morrem junto com a transação).

select sum(ok::int) = count(*) as todos_ok, count(*) as passos
  from smoke18;
select string_agg(passo || ' = ' || ok::text, E'\n' order by passo) as relatorio
  from smoke18;

rollback;