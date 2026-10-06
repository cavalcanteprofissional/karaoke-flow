-- Smoke da política de credencial do YouTube (Fase 8f, migration 20261005000043).
--
-- O que este arquivo garante (e o que a suíte Vitest NÃO consegue provar):
--   1. `own_only` é o default de todo bar já existente — a migration não muda o
--      comportamento de ninguém por surprise;
--   2. a coerência policy↔pool é recusada **no banco**: `own_only` com pool
--      apontado, e `platform_pool` sem pool / com pool inativo / com pool
--      inexistente;
--   3. `platform_pool` com pool ativo é aceito (o caminho feliz precisa existir,
--      senão o smoke passa só pelo lado negativo);
--   4. o FK do pool é `ON DELETE RESTRICT`, e não `SET NULL`: com `set null`, o
--      DELETE na outra tabela deixaria o bar em `platform_pool` sem pool — o
--      estado que o trigger recusa na escrita, alcançado por fora dela;
--   5. `youtube_credential_pools` é invisível ao cliente autenticado (RLS sem
--      policy) e não aceita INSERT dele — a chave da plataforma não é legível
--      nem gravável pelo PostgREST;
--   6. a RPC `admin_youtube_credential_health` recusa não-dev, responde ao dev,
--      e **não devolve a chave nem o refresh token** (o texto do jsonb é
--      conferido contra a chave de mentira criada aqui);
--   7. `auth.uid() is null` (service role, seed, painel do dev) não é barrado —
--      a coerência é para clientes, não para a ferramenta que configura;
--   8. a barreira é o trigger, não o RLS: `bars` continua com policy de UPDATE
--      que não conhece `youtube_pool_id`.
--
-- NÃO DESTRUTIVO: `begin` … `rollback`. Nada é gravado no projeto.
-- O pool criado aqui é de mentira e some com a transação; nenhum bar real é
-- alterado de forma permanente.
--
-- Como os papéis funcionam aqui:
--   - Os testes de trigger e de RPC rodam como `postgres` com
--     `request.jwt.claims` trocado: as claims é o que `auth.uid()` lê, então o
--     trigger "vê" um usuário e o `is_dev()` responde. O papel da conexão não
--     interfere porque o trigger é `security definer`.
--   - Os testes de RLS (5) precisam rodar COMO `authenticated` — o `postgres` da
--     Management API tem BYPASSRLS e passaria verde de mentira. Por isso há
--     `set local role`, e como fica dentro de um bloco com `exception`, um erro
--     faz rollback da subtransação e restaura o papel.
--
-- Uso: node scripts/apply-sql.mjs scripts/smoke-youtube-credential.sql 8000
-- Esperado: todas as linhas com `ok = true`.

begin;

create temporary table smoke_youtube_credential (
  passo text primary key,
  resultado text not null,
  ok boolean not null
) on commit drop;

do $$
declare
  v_dev uuid;      -- host de ZEHBAR: o dev
  v_nd uuid;       -- host de BARSEG: host comum, NÃO dev
  v_bar_dev uuid;
  v_bar_nd uuid;
  v_pool uuid;
  v_pool_off uuid;
  v_json text;
  v_policy text;
  v_count integer;
begin
  select host_id into v_dev from public.bars where code = 'ZEHBAR';
  select host_id into v_nd  from public.bars where code = 'BARSEG';

  if v_dev is null or v_nd is null then
    raise exception 'rode `npm run seed` antes (esperados ZEHBAR e BARSEG)';
  end if;

  select id into v_bar_dev from public.bars where host_id = v_dev limit 1;
  select id into v_bar_nd  from public.bars where host_id = v_nd  limit 1;

  -- Pools de mentira, dentro da transação. A chave tem cara de chave (o CHECK
  -- exige 10..200 chars) e NÃO é uma chave: `AIzaSmOKE` + lixo.
  insert into public.youtube_credential_pools (label, api_key, daily_search_budget)
  values ('Smoke Pool', 'AIzaSmOKE-p00l-nao-e-chave-de-verdade', 80)
  returning id into v_pool;

  insert into public.youtube_credential_pools (label, api_key, active, daily_search_budget)
  values ('Smoke Pool Inativo', 'AIzaSmOKE-p00l-inativo', false, 80)
  returning id into v_pool_off;

  ---------------------------------------------------------------- 1) default
  insert into smoke_youtube_credential
  select '1a todo bar nasce em own_only',
         (select count(*)::text from public.bars where youtube_credential_policy <> 'own_only'),
         (select count(*) from public.bars where youtube_credential_policy <> 'own_only') = 0;

  ------------------------------------------ 2) coerência recusada no banco
  perform set_config('request.jwt.claims',
    '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', false);

  begin
    update public.bars
       set youtube_credential_policy = 'own_only', youtube_pool_id = v_pool
     where id = v_bar_nd;
    insert into smoke_youtube_credential values
      ('2a own_only apontando para pool', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_youtube_credential values ('2a own_only apontando para pool', 'recusado', true);
  end;

  begin
    update public.bars set youtube_credential_policy = 'platform_pool'
     where id = v_bar_nd;
    insert into smoke_youtube_credential values
      ('2b platform_pool sem pool', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_youtube_credential values ('2b platform_pool sem pool', 'recusado', true);
  end;

  -- Pool inativo, com a política já em `platform_pool`. As DUAS colunas vão no
  -- mesmo UPDATE de propósito: em dois statements o trigger dispararia no meio
  -- do caminho, com `platform_pool` + pool nulo, e a recusa viria da regra
  -- errada — o teste passaria sem nunca exercitar "pool inativo".
  begin
    update public.bars
       set youtube_credential_policy = 'platform_pool',
           youtube_pool_id = v_pool_off
     where id = v_bar_nd;
    insert into smoke_youtube_credential values
      ('2c platform_pool com pool inativo', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_youtube_credential values ('2c platform_pool com pool inativo', 'recusado', true);
  end;

  -- Pool inexistente: aqui quem recusa é o FK, não o trigger. Importa que
  -- recuse — um `youtube_pool_id` pendente passaria a política e a busca cairia
  -- na cadeia vazia sem ninguém entender por quê.
  begin
    update public.bars
       set youtube_credential_policy = 'platform_pool',
           youtube_pool_id = '00000000-0000-0000-0000-0000000000ff'
     where id = v_bar_nd;
    insert into smoke_youtube_credential values
      ('2d platform_pool apontando para pool inexistente', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_youtube_credential values
      ('2d platform_pool apontando para pool inexistente', 'recusado', true);
  end;

  ------------------------------------------------- 3) caminho feliz: aceito
  begin
    update public.bars
       set youtube_credential_policy = 'platform_pool',
           youtube_pool_id = v_pool
     where id = v_bar_nd;
    select b.youtube_credential_policy into v_policy
      from public.bars b where b.id = v_bar_nd;
    insert into smoke_youtube_credential
    select '3a platform_pool com pool ativo',
           'policy gravada = ' || coalesce(v_policy, 'nenhuma'),
           v_policy = 'platform_pool';
  exception when others then
    insert into smoke_youtube_credential values
      ('3a platform_pool com pool ativo', 'RECUSOU (BUG)', false);
  end;

  ------------------------------------------------ 4) o FK é RESTRICT, não SET NULL
  -- Este é o teste que impede a regressão do `on delete set null`: com ele, o
  -- DELETE do pool escreveria em `bars` por baixo do trigger (que só acorda em
  -- insert/update de `bars`) e deixaria `platform_pool` sem pool.
  begin
    delete from public.youtube_credential_pools where id = v_pool;
    insert into smoke_youtube_credential values
      ('4a apagar pool em uso', 'PERMITIU (BUG: deixaria platform_pool sem pool)', false);
  exception when others then
    insert into smoke_youtube_credential values
      ('4a apagar pool em uso', 'recusado pelo FK', true);
  end;

  insert into smoke_youtube_credential
  select '4b o FK declara RESTRICT',
         (select confdeltype::text from pg_constraint
           where conname = 'bars_youtube_pool_id_fkey'),
         (select confdeltype from pg_constraint
           where conname = 'bars_youtube_pool_id_fkey') = 'r';

  -- O caminho de saída é o inverso: primeiro o bar volta para `own_only`, e só
  -- então o pool pode sair. Sem pool em uso, o DELETE passa.
  update public.bars
     set youtube_credential_policy = 'own_only', youtube_pool_id = null
   where id = v_bar_nd;
  begin
    delete from public.youtube_credential_pools where id = v_pool;
    insert into smoke_youtube_credential values
      ('4c apagar pool depois de o bar sair dele', 'apagou', true);
  exception when others then
    insert into smoke_youtube_credential values
      ('4c apagar pool depois de o bar sair dele', 'RECUSOU (BUG)', false);
  end;

  ------------------------------------ 5) pools invisíveis/imedáveis via cliente
  begin
    set local role authenticated;
    select count(*) into v_count from public.youtube_credential_pools;
    set local role postgres;
    insert into smoke_youtube_credential values
      ('5a pools invisiveis ao cliente', v_count || ' pool(s)', v_count = 0);
  exception when others then
    set local role postgres;
    insert into smoke_youtube_credential values
      ('5a pools invisiveis ao cliente', 'ERRO: leu ou falhou', false);
  end;

  begin
    set local role authenticated;
    insert into public.youtube_credential_pools (label, api_key)
    values ('Smoke Invasor', 'AIzaSmOKE-invasor-0000000000');
    set local role postgres;
    insert into smoke_youtube_credential values
      ('5b cliente autenticado grava pool', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_youtube_credential values
      ('5b cliente autenticado grava pool', 'bloqueado por RLS', true);
  end;

  ----------------------------------------------------- 6) a RPC de saúde
  begin
    perform public.admin_youtube_credential_health(v_bar_dev);
    insert into smoke_youtube_credential values
      ('6a RPC de saude para nao-dev', 'PERMITIU (BUG)', false);
  exception when others then
    insert into smoke_youtube_credential values ('6a RPC de saude para nao-dev', 'recusado', true);
  end;

  perform set_config('request.jwt.claims',
    '{"sub":"' || v_dev || '","role":"authenticated","is_anonymous":"false"}', false);
  v_json := public.admin_youtube_credential_health(v_bar_dev)::text;

  insert into smoke_youtube_credential
  values ('6b RPC de saude responde ao dev',
          v_json::text,
          v_json::text like '%own_only%' or v_json::text like '%platform_pool%');

  -- A resposta é conferida contra a chave de mentira: se algum dia alguém
  -- resolver "facilitar" e devolver `api_key`, esta linha quebra.
  insert into smoke_youtube_credential
  values ('6c a RPC nao devolve a chave do pool',
          case when v_json::text like '%AIzaSmOKE%' then 'VAZOU a chave (BUG)' else 'nenhuma chave no corpo' end,
          v_json::text not like '%AIzaSmOKE%');

  insert into smoke_youtube_credential
  values ('6d a RPC devolve booleanos, nao refresh_token',
          case when v_json::text ilike '%refresh_token%' then 'VAZOU (BUG)'
               else 'nenhum refresh_token no corpo' end,
          v_json::text not ilike '%refresh_token%');

  ------------------------------ 7) service role nao e barrado (seed/painel do dev)
  -- Sem claims, `auth.uid()` é null e o trigger deixa passar de propósito: quem
  -- configura a política (service role, painel do dev) não pode ficar refém da
  -- invariante que existe para proteger o cliente. Sem este teste, uma correção
  -- futura do trigger pode quebrar o seed — e o smoke continuaria verde.
  perform set_config('request.jwt.claims', '', false);
  begin
    -- O pool **inativo** de propósito: com o bypass funcionando, o trigger nem
    -- olha a linha e a escrita passa; com o bypass quebrado, a checagem de
    -- "platform_pool exige pool ativo" recusa. Ou seja, este teste só passa se
    -- o bypass for real — e o pool ainda existe porque o `4c` apagou o outro.
    update public.bars
       set youtube_credential_policy = 'platform_pool', youtube_pool_id = v_pool_off
     where id = v_bar_nd;
    insert into smoke_youtube_credential values
      ('7a service role escreve platform_pool sem trigger', 'escreveu', true);
  exception when others then
    insert into smoke_youtube_credential values
      ('7a service role escreve platform_pool sem trigger', 'BLOQUEADO (BUG)', false);
  end;

  -- E volta ao estado do seed, para o `rollback` do fim não ser a única defesa.
  perform set_config('request.jwt.claims',
    '{"sub":"' || v_nd || '","role":"authenticated","is_anonymous":"false"}', false);
  update public.bars
     set youtube_credential_policy = 'own_only', youtube_pool_id = null
   where id = v_bar_nd;

  ------------------------------------------------ 8) a barreira é o trigger
  insert into smoke_youtube_credential
  select '8a trigger da coerência existe e está ativo',
         (select coalesce(string_agg(tgname, ', '), 'nenhum')
            from pg_trigger
           where tgname = 'bars_guard_youtube_credential_policy' and tgenabled = 'O'),
         exists (
           select 1 from pg_trigger
            where tgname = 'bars_guard_youtube_credential_policy' and tgenabled = 'O'
         );

  insert into smoke_youtube_credential
  select '8b nenhuma policy de bars conhece a coluna nova',
         (select count(*)::text from pg_policies
           where schemaname = 'public' and tablename = 'bars'
             and policyname is not null
             and (with_check like '%youtube_pool_id%' or qual like '%youtube_pool_id%')),
         (select count(*) from pg_policies
           where schemaname = 'public' and tablename = 'bars'
             and policyname is not null
             and (with_check like '%youtube_pool_id%' or qual like '%youtube_pool_id%')) = 0;

  insert into smoke_youtube_credential
  select '8c youtube_credential_pools nao tem policy nenhuma',
         (select count(*)::text from pg_policies
           where schemaname = 'public' and tablename = 'youtube_credential_pools'),
         (select count(*) from pg_policies
           where schemaname = 'public' and tablename = 'youtube_credential_pools') = 0;
end;
$$;

select passo, resultado, ok from smoke_youtube_credential order by passo;

rollback;