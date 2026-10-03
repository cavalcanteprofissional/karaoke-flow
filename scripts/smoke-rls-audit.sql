-- Auditoria de RLS pela Data API (Fase 8c·B) — o smoke que tenta furar.
--
-- POR QUE ESTE ARQUIVO EXISTE
-- As regras de negócio deste projeto já nasceram dentro das RPCs DUAS vezes e
-- foram contornadas pelo PostgREST (`00034`/`00035` vs `00036`). Ler as policies
-- não basta: o que vale é o que o banco devolve para um cliente comum, com o
-- papel `authenticated` e um JWT de verdade.
--
-- O QUE ELE GARANTE (a UI não prova nenhum disto)
--   1. Isolamento entre salas: participante de A não lê a fila nem a sala de B;
--   2. Isolamento entre BARS: participante não lê latitude/longitude/endereço de
--      um bar em que não está — nem de todos os bares do sistema;
--   3. `rooms.youtube_api_key` (segredo) e `rooms.player_token` (credencial da
--      TV) invisíveis ao participante; legíveis só pelo host;
--   4. Negação por default nas tabelas de serviço (`song_cache`,
--      `youtube_oauth_tokens`, `dev_accounts`);
--   5. Moderação não burlável: participante não se auto-aprova, não entra como
--      `approved`, não insere pedido em nome de outro, não mexe em item alheio;
--   6. `profiles` não vaza e-mail para a API; `profiles_public` continua
--     -readable por `anon`;
--   7. Regressão do `00036`: as cotas de bar/sala e o `bar_id` continuam
--      barrados no INSERT/UPDATE direto, não só dentro das RPCs;
--   8. A regra do espectador (`00041`): `claim_next_song` só pelo token da TV e
--      `pick_mesa` recusando quem entrou fora do raio (série S, no fim).
--
-- COMO LER O RESULTADO
--   classe `ATAQUE`   → precisa ser BARRADO. Ok = a parede existe.
--   classe `LEGITIMO` → precisa FUNCIONAR. Ok = o app ainda funciona.
--   Um `LEGITIMO` vermelho é tão grave quanto um `ATAQUE` verde: significa que a
--   correção quebrou o produto. Por isso os casos legítimos existem.
--
-- NÃO DESTRUTIVO: `begin` … `rollback`. Nada é gravado no projeto.
-- As identidades vêm do PRÓPRIO DOMÍNIO (bars ZEHBAR/BARSEG, salas
-- KARAOKE/BAR2FO e seus membros), sem UUID fixo de pessoa — roda em outro
-- projeto sem edição. Rode `npm run seed` antes.
--
-- POR QUE PRECISA DE `set local role`
-- A conexão do Management API é `postgres`, que tem BYPASSRLS: TODOS os testes
-- de RLS passariam verdes de mentira. Por isso o papel é trocado para
-- `authenticated`/`anon` de verdade. `set local` + o fato de estar dentro de
-- um bloco com `exception` (subtransação) fazem o papel se restaurar sozinho.
-- A tabela temporária pertence à sessão `postgres`, então dentro do papel
-- alternativo o smoke só faz `SELECT … INTO` — escrever nela daria
-- permission denied e mascararia a checagem real.
--
-- REGRA DE OURO DESTE ARQUIVO: conte LINHAS, nunca confie em "não exception".
-- RLS barrado devolve 0 linhas e NÃO levanta erro. "Consegui ler" é o sinal de
-- problema, "não exception" é o de que nada aconteceu.
--
-- Uso: node scripts/apply-sql.mjs scripts/smoke-rls-audit.sql 15000
--
-- ESTADO MEDIDO (2026-10-01, projeto Cloud `kskoipyzqcacccepcqpc`)
--   45 casos · 37 ok · **8 vermelhos, que são os bugs** · 13/13 legítimos ok.
--   Os 8 vermelhos, com o que cada um provou no banco:
--     B2/B3/B4  (F3) logado sem vínculo lê os 2 bars do sistema, e o membro de
--               KARAOKE lê o bar de BARSEG — nome, endereço e a coordenada
--               (latitude/longitude) de bares em que nunca entrou. A policy é
--               `using (auth.uid() is not null)`: "está logado" e só.
--     M1        (F4) `mesas` idem — 18 linhas de todos os bares, e o app não lê
--               `mesas` em lugar nenhum.
--     R5        (F2) o participante aprovado extrai `rooms.player_token`, que é a
--               credencial do link da TV.
--     H2        (F1/F2) `rooms.youtube_api_key` e `rooms.player_token` sem ACL de
--               coluna → herdando o SELECT da tabela. Hoje 0 salas com chave
--               configurada, mas o primeiro host que configurar expõe o segredo.
--     H1        (F5) 60 concessões de TRUNCATE/TRIGGER/REFERENCES a anon e
--               authenticated nas tabelas públicas. TRUNCATE não passa por RLS.
--     P8        (F6) o host reescreve o `user_id` de um membro (a policy de
--               UPDATE não tem `with check`) — transplanted uma participação
--               para outra conta. Baixa: o host já manda na sala.
--   Ou seja: este arquivo fica **vermelho de propósito** até a migration
--   `20260930000038` fechar F1–F6. Um `LEGITIMO` vermelho é o alarme sério:
--   significa que a correção quebrou o produto.
--
-- ESTADO MEDIDO (2026-10-03, projeto Cloud `kskoipyzqcacccepcqpc`)
--   62 casos · 62 ok · 0 ataques passando · 0 legítimos quebrados.
--   A série S (a regra "quem entra de fora do raio só assiste", migration
--   `20261003000041`) é a única que não é sobre RLS de tabela: S1 é um `claim`
--   por sessão e S3/S4 um `pick_mesa` — duas RPCs que já eram `security
--   definer` e, sem a checagem nova, deixavam o espectador mandar na fila e
--   sentar numa mesa com DevTools aberto.

begin;

create temporary table smoke_rls (
  passo text primary key,
  classe text not null,      -- 'ATAQUE' | 'LEGITIMO'
  ref text not null,         -- rastreio do achado (F1..F6) ou ''
  resultado text not null,
  ok boolean not null
) on commit drop;

do $$
declare
  -- Personas, todas vindas do domínio (nada de UUID fixo de pessoa).
  v_host_a   uuid;   -- dono do bar ZEHBAR (dev)
  v_host_b   uuid;   -- dono do bar BARSEG (NÃO dev)
  v_bar_a    uuid;
  v_bar_b    uuid;
  v_room_a   uuid;   -- KARAOKE: open/manual/confirm, bar ZEHBAR
  v_room_b   uuid;   -- BAR2FO: approval/auto, bar BARSEG
  v_membro   uuid;   -- aprovado em KARAOKE
  v_colega   uuid;   -- aprovado em KARAOKE, ≠ v_membro
  v_pendente uuid;   -- pending em BAR2FO (≈ a mesma pessoa que é membro de A;
                     --  o teste de auto-aprovação usa o vínculo PENDENTE)
  v_estranho uuid;   -- logado, sem nenhum vínculo
  v_n integer;
  v_rec record;
  v_json jsonb;
  v_ok boolean;
  v_err text;
  v_txt text;
  -- Só o S1/S2 (a TV), lidos antes de trocar o papel.
  v_code_a text;
  v_token_a uuid;
begin
  select host_id into v_host_a   from public.bars where code = 'ZEHBAR';
  select id      into v_bar_a    from public.bars where code = 'ZEHBAR';
  select host_id into v_host_b   from public.bars where code = 'BARSEG';
  select id      into v_bar_b    from public.bars where code = 'BARSEG';
  select id      into v_room_a   from public.rooms where code = 'KARAOKE';
  select id      into v_room_b   from public.rooms where code = 'BAR2FO';
  select user_id into v_membro   from public.room_members
    where room_id = v_room_a and status = 'approved' order by user_id limit 1;
  select user_id into v_colega   from public.room_members
    where room_id = v_room_a and status = 'approved' and user_id <> v_membro limit 1;
  select user_id into v_pendente from public.room_members
    where room_id = v_room_b and status = 'pending' limit 1;
  v_estranho := gen_random_uuid();

  if v_host_a is null or v_host_b is null or v_room_a is null
     or v_room_b is null or v_membro is null or v_colega is null
     or v_pendente is null then
    raise exception 'rode `npm run seed` antes (esperados ZEHBAR, BARSEG, KARAOKE, BAR2FO e membros)';
  end if;

  -- ===========================================================================
  -- bars — isolamento entre TENANTS
  -- ===========================================================================
  -- B1 ATAQUE (F3): `anon` não vê bar nenhum.
  v_n := 0; v_err := '';
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from public.bars;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('B1 anon le bars', 'ATAQUE', 'F3',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- B2 ATAQUE (F3): qualquer logado lê TODOS os bars, incluindo
  -- latitude/longitude/endereço de bares em que nunca entrou. A policy é
  -- `using (auth.uid() is not null)` — ou seja, "está logado" e só.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_estranho || '","role":"authenticated"}', true);
    select count(*) into v_n from public.bars;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('B2 logado sem vinculo le todos os bars', 'ATAQUE', 'F3',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- B3 ATAQUE (F3): participante de KARAOKE lê também o bar alheio (BARSEG).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.bars where id = v_bar_b;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('B3 membro de KARAOKE le o bar de BARSEG', 'ATAQUE', 'F3',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- B4 ATAQUE (F3): o bar traz coordenada. Confere o PIOR campo, não só a
  -- contagem: mesmo que a contagem viesse 0, o teste documenta o que era
  -- exposto. Espera o mesmo número de linhas que B2.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_estranho || '","role":"authenticated"}', true);
    select count(*) into v_n from public.bars
      where latitude is not null or longitude is not null or endereco is not null;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('B4 logado sem vinculo le lat/long/endereco de bars', 'ATAQUE', 'F3',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- B5 LEGITIMO: o app precisa ler o bar DA PRÓPRIA sala (a página da sala e a
  -- de busca leem `.eq("id", room.bar_id)` para a latitude/raio do check de
  -- presença). É o caso que a correção tem de preservar.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.bars where id = v_bar_a;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('B5 membro le o bar da propria sala', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n >= 1);

  -- B6 LEGITIMO: o host lê o próprio bar.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_a || '","role":"authenticated"}', true);
    select count(*) into v_n from public.bars where id = v_bar_a;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('B6 host le o proprio bar', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 1);

  -- ===========================================================================
  -- mesas — isolamento entre tenants
  -- ===========================================================================
  -- M1 ATAQUE (F4): `mesas` é lida por qualquer sessão autenticada, e o app
  -- NÃO LÊ `mesas` em lugar nenhum (`grep from("mesas")` vazio): é exposição
  -- pura, sem nenhum consumidor legítimo.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_estranho || '","role":"authenticated"}', true);
    select count(*) into v_n from public.mesas;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('M1 logado le as mesas de todos os bares', 'ATAQUE', 'F4',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- M2 ATAQUE (F4): e `anon` também não.
  v_n := 0; v_err := '';
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from public.mesas;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('M2 anon le mesas', 'ATAQUE', 'F4',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- ===========================================================================
  -- rooms — segredo e credencial
  -- ===========================================================================
  -- R1 LEGITIMO: membro aprovado lê a própria sala.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.rooms where id = v_room_a;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R1 membro le a propria sala', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 1);

  -- R2 ATAQUE: membro não lê a sala alheia.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.rooms where id = v_room_b;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R2 membro le a sala alheia', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- R3 ATAQUE: `anon` não vê sala nenhuma.
  v_n := 0; v_err := '';
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from public.rooms;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R3 anon le rooms', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- R4 ATAQUE (F1): `youtube_api_key` é SEGREDO e a policy libera a linha
  -- inteira. Hoje a coluna está vazia (0 salas com chave) — o teste é o que
  -- impede que o primeiro host que configure a chave a exponha.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.rooms
      where id = v_room_a and youtube_api_key is not null;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'bloqueado: ' || sqlerrm;
  end;
  v_ok := (v_n = 0) or (v_err like 'bloqueado%');
  insert into smoke_rls values ('R4 membro le youtube_api_key da propria sala', 'ATAQUE', 'F1',
    case when v_err <> '' then v_err else v_n::text || ' linha(s) com chave' end, v_ok);

  -- R5 ATAQUE (F2): `player_token` é a credencial da TV — o próprio repo trata o
  -- link da TV como segredo (`scan:secrets`). A policy de SELECT libera a linha
  -- inteira, então qualquer participante aprovado extrai o link da tela.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.rooms
      where id = v_room_a and player_token is not null;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'bloqueado: ' || sqlerrm;
  end;
  v_ok := (v_n = 0) or (v_err like 'bloqueado%');
  insert into smoke_rls values ('R5 membro le player_token da propria sala', 'ATAQUE', 'F2',
    case when v_err <> '' then v_err else v_n::text || ' linha(s) com token' end, v_ok);

  -- R6 LEGITIMO: o HOST precisa do `player_token` para montar o link da tela.
  -- Depois do F2 ele não lê a coluna: a coluna saiu do alcance de
  -- `authenticated` e o valor vem da RPC `admin_get_room_player_token`, que é
  -- `security definer` e só obedece ao dono. A troca de "1 linha na tabela"
  -- para "1 valor da RPC" é de propósito — o comentário original deste caso já
  -- previa isso, e o RPC conferido aqui é o mesmo que a página da sala chama.
  v_n := 0; v_err := ''; v_txt := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_a || '","role":"authenticated"}', true);
    select public.admin_get_room_player_token(v_room_a) into v_txt;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R6 host le o player_token pela RPC host-only', 'LEGITIMO', 'F2',
    case when v_err <> '' then v_err else 'token de ' || length(coalesce(v_txt, '')) || ' chars' end,
    v_err = '' and v_txt is not null);

  -- R7 ATAQUE (F2): a RPC que devolve o token é host-only, e o participante
  -- não vira host chamando ela. Este é o caso que fecha o F2 de verdade: sem
  -- ele, bastaria a coluna sumir e a RPC virar um endpoint público com o
  -- segredo atrás.
  v_n := 0; v_err := ''; v_txt := null;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select public.admin_get_room_player_token(v_room_a) into v_txt;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R7 membro chama a RPC host-only do token', 'ATAQUE', 'F2',
    case when v_err <> '' then v_err else 'PERMITIU: ' || length(coalesce(v_txt, '')) || ' chars' end,
    v_err <> '' and v_txt is null);

  -- R8 LEGITIMO: o participante CONTINUA lendo a própria sala — agora pela view
  -- `rooms_public`, que é o que o app faz nos quatro pontos de leitura. Se este
  -- caso quebrar, a correção do F1/F2 quebrou o produto.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.rooms_public where id = v_room_a;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R8 membro le a propria sala pela view rooms_public', 'LEGITIMO', 'F1/F2',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 1);

  -- R9 ATAQUE (F1/F2): com o privilégio em nível de COLUNA, um `select *` em
  -- `rooms` passa a responder `permission denied` — o `*` cobre as colunas não
  -- concedidas. É o que impede o segredo de vazar por um `select *` distraído,
  -- e é também a razão de a view existir.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    for v_rec in select * from public.rooms loop null; end loop;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R9 select * em rooms nao traz o segredo', 'ATAQUE', 'F1/F2',
    case when v_err <> '' then v_err else 'PERMITIU: leu a tabela inteira' end, v_err <> '');

  -- R10 ATAQUE (F1): a escrita da chave é host-only, e recusar tem de ter
  -- efeito — não basta a RPC reclamar, o valor no banco tem de continuar como
  -- estava. KARAOKE não tem chave configurada no seed, então o teste grava uma,
  -- tenta a reescrita por um não-dono, confere que não mudou e desfaz.
  v_err := ''; v_txt := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_a || '","role":"authenticated"}', true);
    perform public.admin_set_room_youtube_api_key(v_room_a, 'rlsAuditKeyOriginal');
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    perform public.admin_set_room_youtube_api_key(v_room_a, 'rlsAuditKeyInjected');
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  select youtube_api_key into v_txt from public.rooms where id = v_room_a;
  insert into smoke_rls values ('R10 membro nao reescreve a chave do YouTube', 'ATAQUE', 'F1',
    'chave no banco: ' || coalesce(v_txt, '(null)'),
    v_err <> '' and coalesce(v_txt = 'rlsAuditKeyOriginal', false));

  -- R11 ATAQUE (F1): nem o dono de um bar mexe na chave da sala de outro bar —
  -- o `is_host` é da SALVA, não do bar.
  v_err := ''; v_txt := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_b || '","role":"authenticated"}', true);
    perform public.admin_set_room_youtube_api_key(v_room_a, 'rlsAuditKeyCrossTenant');
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  select youtube_api_key into v_txt from public.rooms where id = v_room_a;
  insert into smoke_rls values ('R11 host de outro bar nao escreve a chave', 'ATAQUE', 'F1',
    'chave no banco: ' || coalesce(v_txt, '(null)'),
    v_err <> '' and coalesce(v_txt = 'rlsAuditKeyOriginal', false));

  -- A chave que o R10 gravou era de mentira e precisa sair: o smoke roda em
  -- `begin`/`rollback`, mas o resto do arquivo continua rodando na mesma
  -- transação e não deve ver uma chave que não existe em produção.
  update public.rooms set youtube_api_key = null where id = v_room_a;

  -- R7 ATAQUE: logado sem vínculo não vê sala nenhuma.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_estranho || '","role":"authenticated"}', true);
    select count(*) into v_n from public.rooms;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R7 logado sem vinculo le rooms', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- R8 ATAQUE: host não mexe em sala alheia (UPDATE).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_b || '","role":"authenticated"}', true);
    update public.rooms set status = 'closed' where id = v_room_a;
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R8 host_b UPDATE na sala de host_a', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- R9 ATAQUE: host não apaga sala alheia (DELETE).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_b || '","role":"authenticated"}', true);
    delete from public.rooms where id = v_room_a;
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R9 host_b DELETE na sala de host_a', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- R10 ATAQUE (regressão `00036`): não-dev cria 2ª sala por INSERT direto,
  -- furando a cota que hoje vive no trigger.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_b || '","role":"authenticated"}', true);
    insert into public.rooms (code, host_id, bar_id, status)
      values ('RLAUDIT', v_host_b, v_bar_b, 'active');
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R10 nao-dev: INSERT direto de 2a sala', 'ATAQUE', '00036',
    case when v_err <> '' then v_err else 'PERMITIU: ' || v_n::text || ' linha(s)' end,
    v_n = 0);

  -- R11 ATAQUE (regressão `00036`): e não re-aponta a própria sala para o bar
  -- alheio. UPDATE barrado por RLS devolve 0 linhas SEM erro — daí contar.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_b || '","role":"authenticated"}', true);
    update public.rooms set bar_id = v_bar_a where host_id = v_host_b and bar_id = v_bar_b;
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('R11 nao-dev: UPDATE bar_id da propria sala -> alheio', 'ATAQUE', '00036',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- ===========================================================================
  -- room_members — auto-aprovação e privacidade na sala
  -- ===========================================================================
  -- P1 LEGITIMO: o participante lê a própria participação (a UI depende disso).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.room_members
      where room_id = v_room_a and user_id = v_membro;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P1 membro le a propria participacao', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 1);

  -- P2 ATAQUE: participante não lê a participação do colega (D3: ninguém vê o
  -- detalhe de quem não está na sua mesa).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.room_members
      where room_id = v_room_a and user_id = v_colega;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P2 membro le a participacao de colega na mesma sala', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- P3 LEGITIMO: o host lê todos os membros da própria sala (é assim que
  -- aprova/rejeita pendentes).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_a || '","role":"authenticated"}', true);
    select count(*) into v_n from public.room_members
      where room_id = v_room_a and user_id <> v_estranho;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P3 host le todos os membros da propria sala', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n >= 2);

  -- P4 ATAQUE: o ataque clássico do karaokê — pendente se auto-aprova.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_pendente || '","role":"authenticated"}', true);
    update public.room_members set status = 'approved'
      where room_id = v_room_b and user_id = v_pendente;
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P4 pendente se auto-aprova (UPDATE)', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s) alterada(s)' end, v_n = 0);

  -- P5 ATAQUE: e o status NÃO mudou, conferido por releitura (o P4 contou
  -- linhas; isto prova o efeito, não só a intenção).
  v_txt := ''; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_pendente || '","role":"authenticated"}', true);
    select status::text into v_txt from public.room_members
      where room_id = v_room_b and user_id = v_pendente;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P5 pendente continua pending', 'ATAQUE', '',
    case when v_err <> '' then v_err else coalesce(v_txt, '(null)') end, v_txt = 'pending');

  -- P6 ATAQUE: participante não entra já `approved` por INSERT direto (a
  -- aprovação é do host via RPC `join_room`).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_estranho || '","role":"authenticated"}', true);
    insert into public.room_members (room_id, user_id, status)
      values (v_room_a, v_estranho, 'approved');
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P6 INSERT proprio com status=approved', 'ATAQUE', '',
    case when v_err <> '' then v_err else 'PERMITIU: ' || v_n::text || ' linha(s)' end,
    v_n = 0);

  -- P7 ATAQUE: nem em nome de outra pessoa.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    insert into public.room_members (room_id, user_id, status)
      values (v_room_b, v_colega, 'approved');
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P7 INSERT de membro em nome de outro', 'ATAQUE', '',
    case when v_err <> '' then v_err else 'PERMITIU: ' || v_n::text || ' linha(s)' end,
    v_n = 0);

  -- P8 ATAQUE (F6): a policy de UPDATE do host não tem `with check`, então o
  -- host pode reescrever o `user_id` da linha — plantar uma participação em
  -- nome de quem não pediu, ou mover o vínculo para outra conta. Gravidade
  -- baixa (o host já manda na sala), mas é uma parede que não existe.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_b || '","role":"authenticated"}', true);
    -- `v_colega` e real e nao e membro de BAR2FO: se a policy deixar, a linha
    -- do pendente e trasplantada para outra conta (FK satisfeita de verdade).
    update public.room_members set user_id = v_colega
      where room_id = v_room_b and user_id = v_pendente;
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P8 host reescreve user_id de um membro', 'ATAQUE', 'F6',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- P9 ATAQUE: participante não remove o colega da sala.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    delete from public.room_members where room_id = v_room_a and user_id = v_colega;
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('P9 membro DELETE na participacao de colega', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- ===========================================================================
  -- queue_items — a fila e a moderação
  -- ===========================================================================
  -- Q1 LEGITIMO: participante aprovado lê a fila da própria sala.
  --
  -- O item é INSERIDO dentro do próprio caso (e some no rollback). A versão
  -- anterior só contava a fila que o seed deixou, e isso transformou um caso
  -- LEGITIMO vermelho sem nenhuma mudança de segurança: em 2026-10-02 a fila da
  -- KARAOKE já estava vazia no projeto Cloud (a sessão consumiu os itens
  -- APPROVED), e o smoke passou a acusar uma regressão que não existia. Um
  -- instrumento que depende de estado que o mundo consome não é um instrumento.
  v_n := 0; v_err := '';
  begin
    set local role postgres;
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
      values (v_room_a, v_membro, 'rlsAuditQ1', 'Smoke RLS Audit Q1');
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.queue_items
      where room_id = v_room_a and youtube_video_id = 'rlsAuditQ1';
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('Q1 membro le a fila da propria sala', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' item(ns)' end, v_n >= 1);

  -- Q2 ATAQUE: e não a fila da sala alheia.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.queue_items where room_id = v_room_b;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('Q2 membro le a fila da sala alheia', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' item(ns)' end, v_n = 0);

  -- Q3 LEGITIMO: pede música na própria sala e o item nasce `pending`, porque
  -- a KARAOKE é `queue_approval_mode = 'manual'`. Este caso mata a hipótese
  -- "membro injeta status='approved' e pula a aprovação": quem decide é o
  -- trigger `queue_items_initial_status`, não o cliente.
  --
  -- O modo de aprovação **é mutável pelo app** (o host mexe nas configurações da
  -- sala), então o smoke não pode depender de a KARAOKE ainda estar como o seed
  -- criou: quem testou pelo celular e deixou em `auto` fazia o caso falhar com
  -- `approved`, blaming o trigger por uma configuração. Forçamos `manual` aqui
  -- como postgres — o `rollback` no fim do arquivo desfaz.
  update public.rooms set queue_approval_mode = 'manual' where id = v_room_a;

  v_n := 0; v_err := ''; v_txt := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
      values (v_room_a, v_membro, 'rlsAudit01', 'Smoke RLS Audit');
    select status::text into v_txt from public.queue_items
      where youtube_video_id = 'rlsAudit01';
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('Q3 pedido do membro nasce pending (trigger decide)', 'LEGITIMO', '',
    case when v_err <> '' then v_err else coalesce(v_txt, '(null)') end, v_txt = 'pending');

  -- Q4 LEGITIMO: e o participante pode tirar o PRÓPRIO pedido da fila
  -- (botão "Tirar da fila", policy `queue_items_delete_own` de `00031`).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    delete from public.queue_items where youtube_video_id = 'rlsAudit01';
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('Q4 membro apaga o proprio pedido', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' item(ns)' end, v_n = 1);

  -- Q5 ATAQUE: não insere pedido na fila alheia.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
      values (v_room_b, v_membro, 'rlsAudit02', 'Smoke RLS Audit 2');
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('Q5 INSERT de item na fila alheia', 'ATAQUE', '',
    case when v_err <> '' then v_err else 'PERMITIU: ' || v_n::text || ' linha(s)' end,
    v_n = 0);

  -- Q6 ATAQUE: nem pedir em nome de outra pessoa.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
      values (v_room_a, v_colega, 'rlsAudit03', 'Smoke RLS Audit 3');
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('Q6 INSERT de item em nome de outro', 'ATAQUE', '',
    case when v_err <> '' then v_err else 'PERMITIU: ' || v_n::text || ' linha(s)' end,
    v_n = 0);

  -- Q7 ATAQUE: participante não edita item (só o host muda status/posição).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    update public.queue_items set title = 'hack' where room_id = v_room_a;
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('Q7 membro UPDATE em item da fila', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- ===========================================================================
  -- tabelas de serviço — negação por default
  -- ===========================================================================
  -- S1 ATAQUE: `youtube_oauth_tokens` guarda refresh_token do YouTube do host.
  -- RLS ligado e **zero** policies de propósito: quem não tem policy é
  -- barrado. Se um dia aparecer uma policy "por host", este teste avisa.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_a || '","role":"authenticated"}', true);
    select count(*) into v_n from public.youtube_oauth_tokens;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('S1 host le youtube_oauth_tokens (refresh_token)', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- S2 ATAQUE: nem escrita — não se planta um token falso para o host.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_host_a || '","role":"authenticated"}', true);
    insert into public.youtube_oauth_tokens (host_id, refresh_token)
      values (v_host_a, 'rls-audit-falso');
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('S2 INSERT em youtube_oauth_tokens', 'ATAQUE', '',
    case when v_err <> '' then v_err else 'PERMITIU: ' || v_n::text || ' linha(s)' end,
    v_n = 0);

  -- S3 ATAQUE: `song_cache` é cache de busca, exclusivo do servidor.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.song_cache;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('S3 membro le song_cache', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- S4 ATAQUE: `dev_accounts` decide teto de bar/sala. Se o cliente auto-
  -- promovesse a dev, furava a cota. (regressão do `00034`/`00035`)
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    insert into public.dev_accounts (user_id) values (v_membro);
    get diagnostics v_n = row_count;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'recusado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('S4 auto-promoção a dev via INSERT direto', 'ATAQUE', '',
    case when v_err <> '' then v_err else 'PERMITIU: ' || v_n::text || ' linha(s)' end,
    v_n = 0);

  -- ===========================================================================
  -- profiles / consents — privacidade
  -- ===========================================================================
  -- V1 ATAQUE: e-mail só é do próprio usuário.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.profiles where id = v_colega;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('V1 membro le id/nome/avatar de outro perfil', 'LEGITIMO', 'D3',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n >= 1);

  -- V2 ATAQUE: `select email` na tabela é barrado pelo grant por coluna do
  -- `00033` — inclusive na PRÓPRIA linha, porque a coluna não é concedida.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.profiles where email is not null;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'bloqueado: ' || sqlerrm;
  end;
  insert into smoke_rls values ('V2 select email from profiles', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s) com email' end,
    (v_n = 0) or (v_err like 'bloqueado%'));

  -- V3 LEGITIMO: a view `profiles_public` continua pública para `anon` — é o
  -- que mostra o nome do dono na tela de espera.
  v_n := 0; v_err := '';
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from public.profiles_public;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('V3 anon le profiles_public', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n >= 1);

  -- V4 LEGITIMO: o dono escreve o próprio consentimento (LGPD, tela 1).
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    update public.consents set terms_version = 'rls-audit'
      where user_id = v_membro;
    get diagnostics v_n = row_count;
    if v_n = 0 then
      insert into public.consents (user_id, terms_version)
        values (v_membro, 'rls-audit');
      get diagnostics v_n = row_count;
    end if;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('V4 membro atualiza o proprio consentimento', 'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 1);

  -- V5 ATAQUE: e não o do colega.
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    select count(*) into v_n from public.consents where user_id = v_colega;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('V5 membro le consentimento de outro', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- V6 ATAQUE: e `anon` não vê consentimento de ninguém.
  v_n := 0; v_err := '';
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from public.consents;
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('V6 anon le consents', 'ATAQUE', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s)' end, v_n = 0);

  -- ===========================================================================
  -- privilégios de tabela (higiene) — o teste que a RLS não cobre
  -- ===========================================================================
  -- H1 ATAQUE (F5): `anon`/`authenticated` com TRUNCATE/TRIGGER/REFERENCES nas
  -- tabelas públicas. TRUNCATE **não passa por RLS** (não é uma operação de
  -- linha), então um privilégio de TRUNCATE é uma porta que nenhuma policy
  -- fecha. O PostgREST não expõe TRUNCATE hoje, o que é exatamente o motivo de
  -- ser um drillinglatente: depende do PostgREST, não do banco.
  v_n := 0; v_err := '';
  select count(*) into v_n
    from information_schema.role_table_grants
   where table_schema = 'public'
     and table_name in (select tablename from pg_tables where schemaname = 'public')
     and grantee in ('anon', 'authenticated')
     and privilege_type in ('TRUNCATE', 'TRIGGER', 'REFERENCES');
  insert into smoke_rls values ('H1 TRUNCATE/TRIGGER/REFERENCES concedidos a anon/authenticated',
    'ATAQUE', 'F5', v_n::text || ' concessao(oes)', v_n = 0);

  -- H2 ATAQUE (F1/F2): as duas colunas de segredo de `rooms` não podem ter
  -- SELECT/INSERT/UPDATE para nenhum dos dois papéis da Data API. Este caso
  -- usava o proxy `attacl is null` (coluna sem ACL própria = herda o GRANT da
  -- tabela = anybody lê), que é o que a auditoria encontrou. Depois da
  -- `20260930000038` a verificação é o PRIVILÉGIO EFFECTIVO, não a ausência de
  -- ACL: o caminho que fecha a coluna é revogar o SELECT de nível tabela e
  -- conceder de volta coluna a coluna, e nesse desenho `attacl` deixa de ser null
  -- justamente para as colunas inócuas. Conferir `attname` e `attacl` aqui
  -- mediria a forma do remédio em vez do efeito.
  v_n := 0;
  select count(*) into v_n
    from (select unnest(array['anon', 'authenticated']) as papel) g
   where has_column_privilege(g.papel, 'public.rooms', 'youtube_api_key', 'SELECT')
      or has_column_privilege(g.papel, 'public.rooms', 'player_token', 'SELECT')
      or has_column_privilege(g.papel, 'public.rooms', 'youtube_api_key', 'UPDATE')
      or has_column_privilege(g.papel, 'public.rooms', 'player_token', 'UPDATE')
      or has_column_privilege(g.papel, 'public.rooms', 'youtube_api_key', 'INSERT')
      or has_column_privilege(g.papel, 'public.rooms', 'player_token', 'INSERT');
  insert into smoke_rls values ('H2 rooms: colunas de segredo sem privilegio para a API',
    'ATAQUE', 'F1/F2', v_n::text || ' papel(es) com privilegio', v_n = 0);

  -- H3 ATAQUE (F6): em `room_members` o papel `authenticated` só pode mexer no
  -- `status`. A policy do host sem `with check` permitia reescrever o `user_id`
  -- de um membro e transplantar a participação para outra conta; o conserto é
  -- privilégio de coluna, então é aqui que se prova que `user_id` e `room_id`
  -- ficaram fora.
  v_n := 0;
  select count(*) into v_n
    from (select unnest(array['anon', 'authenticated']) as papel) g
   where has_column_privilege(g.papel, 'public.room_members', 'user_id', 'UPDATE')
      or has_column_privilege(g.papel, 'public.room_members', 'room_id', 'UPDATE')
      or has_column_privilege(g.papel, 'public.room_members', 'mesa_numero', 'UPDATE');
  insert into smoke_rls values ('H3 room_members: UPDATE so no status', 'ATAQUE', 'F6',
    v_n::text || ' papel(es) com privilegio de UPDATE', v_n = 0);

  -- H4 ATAQUE (F1/F2): as RPCs `admin_*` não podem ser EXECUTADAS por `anon`.
  --
  -- A 00038 fez `revoke execute ... from anon` e a medição seguinte mostrou
  -- `anon` com EXECUTE = true: `CREATE FUNCTION` dá EXECUTE para `PUBLIC`, e
  -- PUBLIC vale para todo papel, então revogar de `anon` tira o nominal e deixa
  -- o efetivo. Hoje nada vaza porque as funções checam `is_host(...)` com
  -- `auth.uid()` NULO, mas aí a proteção é o `if`, não a ACL — e uma `admin_*`
  -- nova sem o `if` nasceria já aberta. A 00039 fecha.
  v_n := 0;
  select count(*) into v_n
    from unnest(array[
      'public.admin_get_room_player_token(uuid)',
      'public.admin_get_room_youtube_api_key(uuid)',
      'public.admin_set_room_youtube_api_key(uuid,text)'
    ]) as f
   where has_function_privilege('anon', f, 'execute');
  insert into smoke_rls values ('H4 admin_*: anon nao executa a RPC host-only',
    'ATAQUE', 'F1/F2', v_n::text || ' RPC(s) executaveis por anon', v_n = 0);

  -- H5 ATAQUE (F1/F2): e o `authenticated` continua ALCANCANDO, senão o
  -- conserto vira "todo mundo trancado fora" em vez de "só o host".
  v_n := 0;
  select count(*) into v_n
    from unnest(array[
      'public.admin_get_room_player_token(uuid)',
      'public.admin_get_room_youtube_api_key(uuid)',
      'public.admin_set_room_youtube_api_key(uuid,text)'
    ]) as f
   where not has_function_privilege('authenticated', f, 'execute');
  insert into smoke_rls values ('H5 admin_*: authenticated ainda executa',
    'LEGITIMO', 'F1/F2', v_n::text || ' RPC(s) bloqueadas para authenticated',
    v_n = 0);

  -- H6/H7/H8 ATAQUE (F1/F2): a 00040 introduced `admin_room_occupancy`, que e
  -- `security definer` justamente porque o RLS de `room_members` esconde a sala
  -- por linha: o host nao conseguiria somar os outros com um `select`. A
  -- protecao tem tres pernas (ACL, filtro no corpo, `search_path`) e o smoke
  -- vigia as tres -- o mesmo desenho das `admin_*` da 00038/00039.
  v_n := 0;
  select count(*) into v_n
   where has_function_privilege('anon', 'public.admin_room_occupancy(uuid)', 'execute');
  insert into smoke_rls values ('H6 admin_room_occupancy: anon nao executa',
    'ATAQUE', 'F1/F2', v_n::text || ' com EXECUTE para anon', v_n = 0);

  -- Perna 2 (corpo): `security definer` sem o filtro de host deixa qualquer
  -- participante ler o agregado dos outros.
  v_n := 0;
  select count(*) into v_n
    from pg_proc p
   where p.oid = 'public.admin_room_occupancy(uuid)'::regprocedure
     and pg_get_functiondef(p.oid) not like '%is_host%';
  insert into smoke_rls values ('H7 admin_room_occupancy: corpo filtra por is_host',
    'ATAQUE', 'F1/F2', v_n::text || ' funcao(es) sem o filtro is_host', v_n = 0);

  -- Perna 3: `search_path` fixado, senao um objeto sombra criado no schema
  -- `public` por outro papel trocaria a resolucao dentro da funcao definer.
v_n := 0;
  select count(*) into v_n
   from pg_proc p
   where p.oid = 'public.admin_room_occupancy(uuid)'::regprocedure
     and (p.proconfig is null
          or not exists (select 1 from unnest(p.proconfig) c where c like 'search\_path=%'));
  insert into smoke_rls values ('H8 admin_room_occupancy: search_path fixado (anti shadowing)',
    'ATAQUE', 'F1/F2', v_n::text || ' funcao(es) sem search_path no proconfig', v_n = 0);

  ------------------------------------------------------------------
  -- S — "quem entra de fora do raio só assiste" (Fase 9, migration 00041)
  --
  -- A UI esconde o botão (Bloco 1) e a action recusa no servidor
  -- (`addSongToQueueAction`), mas a regra que VALE é a do banco: enquanto
  -- `claim_next_song` aceitasse a porta da sessão e `pick_mesa` não olhasse
  -- `fora_do_raio`, um espectadorApproved com DevTools aberto ainda mandava na
  -- fila e ainda sentava numa mesa. Estes quatro casos contam linhas e mensagens,
  -- nunca "não exception".
  ------------------------------------------------------------------

  -- S1 ATAQUE: celular do convidado tentando puxar a próxima faixa. Precisa
  -- recusar — e o erro tem que dizer que é a TV que avança, senão o quiosque
  -- mostra "player inválido" e o diagnóstico perde o motivo real.
  --
  -- Sem `set_playback` antes: a nova 00041 recusa o token nulo ANTES de olhar a
  -- sala, então o estado de reprodução não é parte da pergunta. (E `set_playback`
  -- aqui levantava 'não autenticado', porque o claim do JWT que sobrou do bloco H
  -- não era de ninguém — o teste estava medindo o `set_playback`, não o claim.)
  v_n := 1; v_err := ''; v_txt := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    v_json := public.claim_next_song(v_code_a, null, null);
    set local role postgres;
    v_n := case when (v_json ->> 'ok') = 'false' then 0 else 1 end;
    v_txt := coalesce(v_json ->> 'error', '');
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('S1 claim_next_song por sessao e recusado',
    'ATAQUE', 'F1/F2',
    case when v_err <> '' then v_err
         else v_n::text || ' (erro devolvido: ' || coalesce(nullif(v_txt, ''), '-') || ')' end,
    v_n = 0);

  -- S2 LEGITIMO: a TV (token) continua avançando a fila. É o par do S1 — sem
  -- ele, "recusar tudo" também deixaria o teste verde.
  --
  -- Código e token saem lidos como `postgres`: como `anon` (que é o papel real da
  -- TV) a RLS de `rooms` esconde `player_token` — ler ali dentro dava
  -- "permission denied for table rooms" e o teste media o RLS, não o claim.
  v_n := 0; v_err := ''; v_txt := '';
  begin
    select code, player_token into v_code_a, v_token_a
      from public.rooms where id = v_room_a;
    insert into public.queue_items (room_id, added_by_user_id, youtube_video_id, title)
    values (v_room_a, v_membro, 'smokeS', 'Smoke S')
    on conflict do nothing;
    update public.queue_items
       set status = 'approved'
     where room_id = v_room_a and youtube_video_id = 'smokeS';
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    v_json := public.claim_next_song(v_code_a, v_token_a, null);
    set local role postgres;
    v_n := case when (v_json ->> 'ok') = 'true' then 1 else 0 end;
    v_txt := coalesce(v_json ->> 'error', 'sem erro');
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  insert into smoke_rls values ('S2 TV com token continua avancando a fila',
    'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' (claim: ' || v_txt || ')' end,
    v_n = 1);

  -- S3 ATAQUE: o espectador aprovado escolhendo a própria mesa pela RPC. A
  -- chamada tem de RECUSAR, e `mesa_numero` tem de continuar NULL.
  --
  -- Os `update` ficam FORA do bloco com `exception` de propósito: o bloco é uma
  -- subtransação, e a recusa do `pick_mesa` desfazia junto o `set mesa_numero =
  -- null` preparado logo antes — o teste via "sentou" numa mesa que ele mesmo
  -- tinha posto, e o vermelho era do teste, não da regra. (Erro de 03/10,
  -- corrigido aqui: o estado é posto antes de entrar no bloco.)
  update public.room_members
     set fora_do_raio = true, status = 'approved', mesa_numero = null
   where room_id = v_room_a and user_id = v_membro;
  update public.rooms set bar_id = v_bar_a where id = v_room_a;
  v_n := 1; v_txt := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    perform public.pick_mesa(v_room_a, 1);
    set local role postgres;
  exception when others then
    set local role postgres; v_txt := sqlerrm;
  end;
  v_n := (select count(*) from public.room_members
           where room_id = v_room_a and user_id = v_membro and mesa_numero is not null);
  insert into smoke_rls values ('S3 espectador nao senta (pick_mesa)',
    'ATAQUE', 'F1/F2',
    case when v_txt = ''
         then 'a RPC NAO recusou e deixou ' || v_n::text || ' linha(s) sentada(s)'
         else v_txt end,
    v_n = 0);

  -- S4 LEGITIMO: quem está dentro do raio continua escolhendo a mesa. É o par
  -- do S3 — se a correção trancasse todo mundo, S3 ficaria verde sem meaning.
  update public.room_members
     set fora_do_raio = false, status = 'approved', mesa_numero = null
   where room_id = v_room_a and user_id = v_membro;
  v_n := 0; v_err := '';
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      '{"sub":"' || v_membro || '","role":"authenticated"}', true);
    perform public.pick_mesa(v_room_a, 1);
    set local role postgres;
  exception when others then
    set local role postgres; v_err := 'erro: ' || sqlerrm;
  end;
  v_n := (select count(*) from public.room_members
           where room_id = v_room_a and user_id = v_membro and mesa_numero = 1);
  insert into smoke_rls values ('S4 quem esta no raio ainda senta',
    'LEGITIMO', '',
    case when v_err <> '' then v_err else v_n::text || ' linha(s) com mesa 1' end,
    v_n = 1);

  -- Limpeza do item criado pelo S2 (o rollback desfaz, mas deixar explícito
  -- mantém o smoke legível para quem roda por partes).
  delete from public.queue_items where room_id = v_room_a and youtube_video_id = 'smokeS';
end;
$$;

select
  count(*) filter (where ok)                                   as ok,
  count(*) filter (where not ok)                               as falhas,
  count(*) filter (where not ok and classe = 'ATAQUE')         as ataques_passando,
  count(*) filter (where not ok and classe = 'LEGITIMO')       as legitimos_quebrados
  from smoke_rls;
-- Relatório: primeiro as paredes que falharam (são os bugs), depois o resto.
select passo, classe, ref, resultado, ok
  from smoke_rls
 where not ok
    or classe = 'LEGITIMO'
 order by ok, classe, passo;
rollback;
