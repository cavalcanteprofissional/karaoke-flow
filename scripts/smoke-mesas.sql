-- Fase 16 — mesas: 1 por padrão, até 10, sem perguntar mesa quando há só uma.
--
-- O QUE PROVA (autossuficiente, sem depender de bar de outra fase):
--   01 create_bar recusa 11 mesas (antes aceitava 1–999);
--   02 create_bar cria com 10 e materializa 10 linhas de `mesas`;
--   03 o check de `bars.quantidade_mesas` barra um insert direto de 11;
--   04 o check de `mesas.numero` barra uma linha 11;
--   05 ZEHBAR ficou com 10 mesas e nenhuma linha acima de 10;
--   06 update_bar_mesas pelo dono reduz 10→2, apaga as linhas e realoca quem
--      estava na mesa 5 para a mesa 1;
--   07 update_bar_mesas recusa quem não é dono;
--   08 update_bar_mesas recusa 0, 11 e null;
--   09 join_room em bar de 1 mesa senta na mesa 1 sem p_mesa (a auto-mesa-1);
--   10 join_room em bar de 2 mesas sem p_mesa continua sem mesa;
--   11 espectador (fora_do_raio) em bar de 1 mesa continua sem mesa;
--   12 cleanup: o bar de teste sumiu.
--
-- Conta de teste: usa o Bruno (…0003), que não tem bar no seed, para o teto de
-- "1 bar por dono" não atrapalhar a medição do teto de mesas. Ana (…0002),
-- o host do ZEHBAR (…0001) e a Betânia (…0004) entram como membros.
--
-- Rodar: node scripts/apply-sql.mjs scripts/smoke-mesas.sql 9000

create temporary table smoke16 (passo text primary key, detalhe jsonb not null) on commit drop;

do $$
declare
  v_ze uuid;
  v_bru uuid := '00000000-0000-0000-0000-000000000003';
  v_ana uuid := '00000000-0000-0000-0000-000000000002';
  v_bet uuid := '00000000-0000-0000-0000-000000000004';
  v_rec record;
  v_out jsonb;
  v_bar uuid;
  v_room uuid;
  v_room_code text;
  v_erro text;
  v_qtd int;
  v_mesas int;
  v_mesa int;
begin
  select host_id into v_ze from public.bars where code = 'ZEHBAR';
  if v_ze is null then
    insert into smoke16 values ('00 setup', jsonb_build_object('erro', 'rode npm run seed'));
    return;
  end if;

  -- Rerrodada limpa: qualquer bar sobrando do Bruno cai (cascade limpa mesas,
-- membros e fila). `rooms.bar_id` é `on delete set null`, então a sala pode
-- sobreviver ao bar — ela é apagada à parte, senão o gatilho "1 sala por dono"
-- (00036) barraria o `create_bar` do próximo passo.
  delete from public.rooms where host_id in (v_bru, v_ana);
  delete from public.bars where host_id in (v_bru, v_ana);

  -- 01) create_bar recusa 11 (primeira chamada do Bruno: sem bar, então o teto
  -- de 1 bar não é o que dispara — quem barra é a regra de mesas).
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);
  v_erro := null;
  begin
    select * into v_rec from public.create_bar('Smoke 16', 'Fortaleza', '', 11);
  exception when others then
    v_erro := sqlerrm;
  end;
  insert into smoke16 values ('01 create_bar recusa 11', jsonb_build_object(
    'erro', v_erro,
    'obs', 'esperado erro citando 1–10; null = o teto de 999 ainda vale'
  ));

  -- 02 create_bar com 10 cria o bar e as 10 mesas.
  select * into v_rec
    from public.create_bar('Smoke Mesas', 'Fortaleza', '', 10, null, null, null, 500, 'SMKMES1');
  v_bar := v_rec.bar_id;
  v_room := v_rec.room_id;
  v_room_code := v_rec.room_code;
  select count(*) into v_mesas from public.mesas where bar_id = v_bar;
  select quantidade_mesas into v_qtd from public.bars where id = v_bar;
  insert into smoke16 values ('01 create_bar aceita 10', jsonb_build_object(
    'bar_criado', v_bar is not null,
    'room_code', v_room_code,
    'quantidade', v_qtd,
    'linhas_de_mesas', v_mesas,
    'obs', 'esperado quantidade 10 e 10 linhas'
  ));

  -- 03 check do banco em `bars.quantidade_mesas` (insert direto de 11).
  -- Impersona a Ana, que NÃO tem bar: o gatilho `bars_guard_insert` (00036)
  -- barraria o insert do Bruno ("já tem um bar") antes do check, escondendo a
  -- violação que este passo quer medir.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ana::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ana::text, true);
  v_erro := null;
  begin
    insert into public.bars (host_id, code, nome, quantidade_mesas)
    values (v_ana, 'BADCHK', 'Bad check', 11);
  exception when others then
    v_erro := sqlstate || ': ' || sqlerrm;
  end;
  insert into smoke16 values ('02 check bars barra 11', jsonb_build_object(
    'erro', v_erro,
    'obs', 'esperado violacao de check (23514); null = o teto de 999 continua'
  ));
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);

  -- 04 check do banco em `mesas.numero` (linha 11).
  v_erro := null;
  begin
    insert into public.mesas (bar_id, numero) values (v_bar, 11);
  exception when others then
    v_erro := sqlstate || ': ' || sqlerrm;
  end;
  insert into smoke16 values ('03 check mesas barra 11', jsonb_build_object(
    'erro', v_erro,
    'obs', 'esperado violacao de check (23514)'
  ));

  -- 05 ZEHBAR depois da migration: 10 mesas, nada acima de 10.
  insert into smoke16 values ('04 zehbar com 10 mesas', jsonb_build_object(
    'quantidade', (select quantidade_mesas from public.bars where code = 'ZEHBAR'),
    'linhas', (select count(*) from public.mesas m join public.bars b on b.id = m.bar_id
                where b.code = 'ZEHBAR'),
    'acima_de_10', (select count(*) from public.mesas m join public.bars b on b.id = m.bar_id
                     where b.code = 'ZEHBAR' and m.numero > 10),
    'obs', 'esperado quantidade 10, linhas 10, acima_de_10 0'
  ));

  -- Ana senta na mesa 5 (válida num bar de 10) — para o teste de realocação.
  insert into public.room_members (room_id, user_id, status, mesa_numero)
  values (v_room, v_ana, 'approved', 5);

  -- 06 update_bar_mesas pelo dono (Bruno): 10 → 2.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);
  v_out := public.update_bar_mesas(v_bar, 2);
  select count(*) into v_mesas from public.mesas where bar_id = v_bar;
  select quantidade_mesas into v_qtd from public.bars where id = v_bar;
  select mesa_numero into v_mesa from public.room_members
   where room_id = v_room and user_id = v_ana;
  insert into smoke16 values ('05 update reduz para 2 e realoca', jsonb_build_object(
    'retorno', v_out::text,
    'quantidade', v_qtd,
    'linhas_de_mesas', v_mesas,
    'ana_mesa', v_mesa,
    'obs', 'esperado quantidade 2, linhas 2, Ana na mesa 1, reallocados 1'
  ));

  -- 07 quem não é dono é recusado (Ana).
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ana::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ana::text, true);
  v_erro := null;
  begin
    perform public.update_bar_mesas(v_bar, 3);
  exception when others then
    v_erro := sqlstate || ': ' || sqlerrm;
  end;
  insert into smoke16 values ('05 nao-dono recusa', jsonb_build_object(
    'erro', v_erro,
    'obs', 'esperado bar nao encontrado (sem permissao)'
  ));

  -- 07 quantidades inválidas (dono).
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);
  declare
    v_e0 text;
    v_e11 text;
    v_enull text;
  begin
    begin perform public.update_bar_mesas(v_bar, 0); exception when others then v_e0 := sqlerrm; end;
    begin perform public.update_bar_mesas(v_bar, 11); exception when others then v_e11 := sqlerrm; end;
    begin perform public.update_bar_mesas(v_bar, null); exception when others then v_enull := sqlerrm; end;
    insert into smoke16 values ('06 update recusa 0/11/null', jsonb_build_object(
      'zero', v_e0, 'onze', v_e11, 'nulo', v_enull,
      'obs', 'esperado os tres com quantidade de mesas invalida (1-10)'
    ));
  end;

  -- 08 Bar de 1 mesa: update para 1 e o host do ZEHBAR entra SEM p_mesa.
  perform public.update_bar_mesas(v_bar, 1);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_ze::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_ze::text, true);
  select mesa_numero into v_mesa
    from public.join_room(v_room_code, null, false, null);
  insert into smoke16 values ('07 auto-mesa-1 em bar de 1 mesa', jsonb_build_object(
    'mesa_numero', v_mesa,
    'obs', 'esperado 1 (quem entra nao escolhe mesa em bar de mesa unica)'
  ));

  -- 09 Espectador em bar de 1 mesa continua SEM mesa.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bet::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_bet::text, true);
  select mesa_numero into v_mesa
    from public.join_room(v_room_code, null, true, null);
  insert into smoke16 values ('08 espectador sem mesa', jsonb_build_object(
    'mesa_numero', v_mesa,
    'obs', 'esperado null: quem esta de fora nao senta'
  ));

  -- 10 Bar de 2 mesas: quem entra sem p_mesa continua sem mesa (auto-mesa-1 é
  -- só para bar de mesa única). Betânia reentra de dentro, sem escolher.
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bru::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_bru::text, true);
  perform public.update_bar_mesas(v_bar, 2);
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', v_bet::text, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', v_bet::text, true);
  select mesa_numero into v_mesa
    from public.join_room(v_room_code, null, false, null);
  insert into smoke16 values ('09 bar de 2 mesas segue sem mesa', jsonb_build_object(
    'mesa_numero', v_mesa,
    'obs', 'esperado null: com mais de uma mesa a escolha é dentro da sala'
  ));

  -- Limpeza (cascade: sala, mesas, membros).
  perform set_config('request.jwt.claims', '', true);
  perform set_config('request.jwt.claim.sub', '', true);
  delete from public.rooms where host_id in (v_bru, v_ana);
  delete from public.bars where host_id in (v_bru, v_ana);
  insert into smoke16 values ('10 cleanup', jsonb_build_object(
    'bar_ainda_existe', exists (select 1 from public.bars where id = v_bar),
    'sala_ainda_existe', exists (select 1 from public.rooms where id = v_room)
  ));
end;
$$;

select jsonb_object_agg(passo, detalhe order by passo) as relatorio from smoke16;