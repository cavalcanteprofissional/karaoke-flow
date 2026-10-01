-- Smoke do papel `dev` + multi-bar/multi-sala (Fase 8b·quater).
--
-- O que este arquivo garante (e o que a UI NÃO consegue provar sozinha):
--   1. `is_dev()` é verdadeiro para o host de um bar e falso para os demais;
--   2. o dev NÃO tem teto: cria 2º bar e mais 3 salas;
--   3. host que NÃO é dev continua com 1 bar = 1 karaokê (a regra do produto,
--      migration `20260930000035`) — a UI esconde o botão, o banco recusa;
--   4. `create_room` num bar alheio é recusado;
--   5. auto-promoção a dev via INSERT direto é BLOQUEADA pelo RLS de
--      `dev_accounts` (0 policies) — a parede de verdade;
--   6. `dev_accounts` é invisível para o cliente autenticado;
--   7. **as mesmas regras valem fora das RPCs**: cota de bar/sala e
--      pertencimento do `bar_id` são barrados no INSERT/UPDATE direto que o
--      PostgREST permite (migration `20260930000036`) — o bypass que a UI
--      escondia e o RLS não cobria;
--   8. nada disso persiste (tudo em transação + ROLLBACK).
--
-- NÃO DESTRUTIVO: `begin` … `rollback`. Nada é gravado no projeto.
-- As identidades vêm do PRÓPRIO DOMÍNIO (host de ZEHBAR / BARSEG / um
-- participante), sem UUID fixo de pessoa — roda em outro projeto sem edição.
--
-- Como os papéis funcionam aqui:
--   - Os testes de RPC (1–4) rodam com `request.jwt.claims` trocado. As RPCs
--     são `security definer` e autorizam por `auth.uid()`, que lê essas claims,
--     então o papel da conexão não interfere.
--   - Os testes de RLS (5–6) precisam rodar COMO `authenticated` (o `postgres`
--     da conexão tem BYPASSRLS e passaria por cima de qualquer policy). Por isso
--     há `set local role` — e como fica dentro de um bloco com `exception`, um
--     erro faz rollback da subtransação e restaura o papel sozinho.
--
-- Uso: node scripts/apply-sql.mjs scripts/smoke-dev-role.sql 8000
-- Esperado: todas as linhas com `ok = true`.

begin;

create temporary table smoke_dev_role (
  passo text primary key,
  resultado text not null,
  ok boolean not null
) on commit drop;

do $$
declare
  v_dev uuid;   -- host de ZEHBAR: o dev
  v_nd uuid;    -- host de BARSEG: host comum, NÃO dev
  v_nh uuid;    -- participante: não é host de nada
  v_bar_dev uuid;
  v_bar_nd uuid;
  v_json text;
  i integer;
  v_count integer;
begin
  select host_id into v_dev from public.bars where code = 'ZEHBAR';
  select host_id into v_nd  from public.bars where code = 'BARSEG';
  select user_id into v_nh  from public.room_members limit 1;

  if v_dev is null or v_nd is null or v_nh is null then
    raise exception 'rode `npm run seed` antes (esperados ZEHBAR, BARSEG e membros)';
  end if;

  select id into v_bar_dev from public.bars where host_id = v_dev limit 1;
  select id into v_bar_nd  from public.bars where host_id = v_nd  limit 1;

  ------------------------------------------------------------------ 1) is_dev
  perform set_config('request.jwt.claims',
    '{"sub":"' || v_dev || '","role":"authenticated","is_anonymous":"false"}', false);
  insert into smoke_dev_role values
    ('1a is_dev() do host de ZEHBAR', public.is_dev()::text, public.is_dev() is true);

  perform set_config('request.jwt.claims',
    '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', false);
  insert into smoke_dev_role values
    ('1b is_dev() do host de BARSEG', public.is_dev()::text, public.is_dev() is false);

  ------------------------------------------------- 2) dev: 2o bar e mais salas
  perform set_config('request.jwt.claims',
    '{"sub":"' || v_dev || '","role":"authenticated","is_anonymous":"false"}', false);

  perform public.create_bar('Smoke Bar 2', 'Smoke', 'Smoke st 2', 1, null, -23.5, -46.6, 500, null);
  insert into smoke_dev_role
  select '2a dev cria 2o bar',
         (select count(*)::text from public.bars where host_id = v_dev),
         (select count(*) from public.bars where host_id = v_dev) >= 2;

  for i in 1..3 loop
    perform public.create_room(v_bar_dev, 'SMOKE' || i);
  end loop;
  insert into smoke_dev_role
  select '2b dev cria 3 salas extra (dedup de codigo)',
         (select string_agg(code, ',' order by created_at) from public.rooms where host_id = v_dev),
         (select count(*) from public.rooms where host_id = v_dev) >= 4;

  --------------------------------- 3) nao-dev: teto de 1 bar e de 1 karaoke
  perform set_config('request.jwt.claims',
    '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', false);

  begin
    perform public.create_bar('Smoke Invasor', 'Smoke', 'Smoke st 9', 1, null, -23.5, -46.6, 500, null);
    insert into smoke_dev_role values ('3a nao-dev cria 2o bar', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_dev_role values ('3a nao-dev cria 2o bar', 'recusado', true);
  end;

  begin
    perform public.create_room(v_bar_nd, 'SMOKEND');
    insert into smoke_dev_role values ('3b nao-dev cria 2o karaoke', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_dev_role values ('3b nao-dev cria 2o karaoke', 'recusado', true);
  end;

  --------------------------------------- 4) nao-host nao mexe em bar alheio
  perform set_config('request.jwt.claims',
    '{"sub":"' || v_nh || '","role":"authenticated","is_anonymous":"false"}', false);

  begin
    perform public.create_room(v_bar_dev, 'SMOKEHACK');
    insert into smoke_dev_role values ('4a nao-host cria sala no bar alheio', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_dev_role values ('4a nao-host cria sala no bar alheio', 'recusado', true);
  end;

  ------------------------------------------- 5) dev_accounts: parede de verdade
  -- Aqui o papel PRECISA ser `authenticated`: o postgres da conexão tem
  -- BYPASSRLS e o teste passaria verde com a policy furada.
  begin
    set local role authenticated;
    insert into public.dev_accounts (user_id) values (v_nh);
    set local role postgres;
    insert into smoke_dev_role values ('5a auto-promoção a dev', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_dev_role values ('5a auto-promoção a dev', 'bloqueado por RLS', true);
  end;

  begin
    set local role authenticated;
    -- Lê para uma variável do plpgsql: a tabela temporária deste smoke é da
    -- sessão `postgres`, então escrever nela com o papel `authenticated` daria
    -- permission denied e mascararia o resultado real da checagem.
    select count(*) into v_count from public.dev_accounts;
    set local role postgres;
    insert into smoke_dev_role values
      ('5b dev_accounts invisivel ao cliente', v_count::text, v_count = 0);
  exception when others then
    set local role postgres;
    insert into smoke_dev_role values ('5b dev_accounts invisivel ao cliente', 'ERRO: leu ou falhou', false);
  end;

  -- 6) Confere que o smoke REALMENTE exercitou o caminho do dev dentro da
  -- transação. O estado do banco depois é o do `rollback` do fim do arquivo —
  -- não dá (e não deve) conferir o "voltou ao normal" daqui de dentro.
  -- Contagem das salas do dev: 1 (KARAOKE, do seed) + 1 (a que `create_bar`
  -- cria junto com o bar novo) + 3 (SMOKE1..3) = 5.
  insert into smoke_dev_role
  select '6a smoke exercitou 2 bars + 5 salas do dev',
         (select count(*)::text from public.bars where host_id = v_dev)
           || ' bars / '
           || (select count(*)::text from public.rooms where host_id = v_dev)
           || ' salas',
         (select count(*) from public.bars where host_id = v_dev) = 2
           and (select count(*) from public.rooms where host_id = v_dev) = 5;

  ---------------------------------------------------------------------------
  -- 7) BYPASS: as regras acima valem no BANCO, não só dentro das RPCs.
  --
  -- Os testes 1–6 passam por `create_bar`/`create_room`. O app fala com o
  -- PostgREST, e o RLS libera INSERT/UPDATE direto em `bars`/`rooms` para
  -- `host_id = auth.uid()` — sem olhar cota nem `bar_id`. Foi por aí que um
  -- cliente autenticado contornou tudo (migration 000036). Estes testes rodam o
  -- MESMO ataque sem passar por RPC, e por isso precisam do papel
  -- `authenticated`: como `postgres` (BYPASSRLS) passariam verdes de mentira.
  ---------------------------------------------------------------------------
  -- 7a) INSERT direto de 2o bar, furando a cota de 1
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', true);
    insert into public.bars (host_id, code, nome) values (v_nd, 'HACK01', 'bypass');
    set local role postgres;
    insert into smoke_dev_role values ('7a nao-dev: INSERT direto de 2o bar', 'PERMITIU (BUG)', false);
  exception when others then
    set local role postgres;
    insert into smoke_dev_role values ('7a nao-dev: INSERT direto de 2o bar', 'recusado', true);
  end;

  -- 7b) INSERT direto de 2a sala, furando a cota de 1 karaokê
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', true);
    insert into public.rooms (code, host_id, bar_id, status)
    values ('HACK02', v_nd, v_bar_nd, 'active');
    set local role postgres;
    insert into smoke_dev_role values ('7b nao-dev: INSERT direto de 2a sala', 'PERMITIU (BUG)', false);
  exception when others then
    set local role postgres;
    insert into smoke_dev_role values ('7b nao-dev: INSERT direto de 2a sala', 'recusado', true);
  end;

  -- 7c) Sala dentro de bar ALHEIO (o RLS só checava host_id, não bar_id)
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', true);
    insert into public.rooms (code, host_id, bar_id, status)
    values ('HACK03', v_nd, v_bar_dev, 'active');
    set local role postgres;
    insert into smoke_dev_role values ('7c nao-dev: INSERT sala em bar alheio', 'PERMITIU (BUG)', false);
  exception when others then
    set local role postgres;
    insert into smoke_dev_role values ('7c nao-dev: INSERT sala em bar alheio', 'recusado', true);
  end;

  -- 7d) UPDATE do bar_id da PRÓPRIA sala para um bar alheio
  -- (conta linhas: RLS barrado devolve 0 linhas e NÃO levanta erro, então
  --  "não exception" não provaria nada aqui)
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', true);
    update public.rooms set bar_id = v_bar_dev where host_id = v_nd and bar_id = v_bar_nd;
    get diagnostics v_count = row_count;
    set local role postgres;
    insert into smoke_dev_role
    values ('7d nao-dev: UPDATE bar_id da propria sala -> alheio',
            v_count || ' linha(s)',
            v_count = 0);
  exception when others then
    set local role postgres;
    insert into smoke_dev_role values ('7d nao-dev: UPDATE bar_id da propria sala -> alheio', 'recusado', true);
  end;

  -- 7e) O RLS sozinho (sem o trigger) barraria o 7a? Se sim, o trigger é
  -- redundante e o bypass nunca existiu — a assertion prova que a defesa é
  -- mesmo do trigger, e não do RLS.
  insert into smoke_dev_role
  select '7e cota do bar é do trigger, nao do RLS',
         'RLS so checa host_id = auth.uid(); logo o trigger e a unica barreira',
         exists (
           select 1 from pg_policies
            where schemaname = 'public' and tablename = 'bars'
              and cmd = 'INSERT' and with_check not like '%count(%'
         )
         and exists (
           select 1 from pg_trigger
            where tgname = 'bars_guard_insert' and tgenabled = 'O'
         );
end;
$$;

select passo, resultado, ok from smoke_dev_role order by passo;

rollback;
