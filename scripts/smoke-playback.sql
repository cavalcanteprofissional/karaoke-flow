-- Smoke de transição do playback (Fase 6/7) contra o banco remoto.
--
-- Roda como postgres e simula a sessão com `set_config('request.jwt.claim.sub')`
-- para exercitar `auth.uid()`: assim o caminho do HOST (set_playback,
-- rotate_player_token) e o do PLAYER (token) são testados no mesmo lugar, em
-- ordem, num único statement final.
--
-- Duas armadilhas que o próprio smoke pagou (e que valem para qualquer
-- verificação por jsonb aqui dentro):
--   1. a ordem de avaliação dos argumentos de `jsonb_build_object` não é
--      garantida — ler a sala dentro do mesmo comando que chama a RPC devolve o
--      valor ANTES da chamada. Por isso toda RPC vai para uma variável antes
--      do insert no relatório;
--   2. `queue_items_initial_status` decide o status no INSERT, então um item
--      criado já com 'approved' volta como 'pending' em sala manual — a
--      aprovação é um UPDATE depois.
--
-- Requer o seed: `npm run seed` antes (a sala precisa ter itens) e de novo
-- depois, para devolver o estado de dev. Rodar: `npm run seed` ->
-- `node scripts/apply-sql.mjs scripts/smoke-playback.sql 100000` ->
-- `npm run seed`.
--
-- Custo deste arquivo: cada execução é um round-trip ao Management API contra
-- um banco cujo estado NÃO é previsível, e o smoke mexe nos dados — então
-- planeje a sequência inteira (quantos itens, o que cada passo deixa para o
-- próximo) antes de rodar, senão cada rodada de adjustment custa um seed + uma
-- aplicação. As duas vezes que isso aconteceu estão comentadas no topo.
--
-- `begin;`/`rollback;` no fim: a tabela de resultado já pedia `on commit drop`,
-- ou seja, o roteiro foi ESCRITO para rodar dentro de uma transação e ela foi
-- esquecida no arquivo. Sem isso o smoke COMMITAVA no projeto Cloud: os itens
-- `smoke1..5` ficavam na fila da sala, e a rodada seguinte nascia com a fila
-- suja (itens em `playing` de uma rodada anterior) e estourava "nada tocando"
-- muito depois da causa — o que se lê como defeito de segurança e é resíduo do
-- próprio instrumento. Um smoke que só funciona na primeira execução não é um
-- smoke; para ser reexecutável ele tem de devolver o banco como encontrou.
begin;

create temporary table playback_smoke (
  passo text primary key,
  detalhe jsonb not null
) on commit drop;

do $$
declare
  v_room_id uuid;
  v_code text;
  v_token uuid;
  v_host uuid;
  v_novo uuid;
  v_a uuid;
  v_b uuid;
  v_out jsonb;
  v_ok boolean;
  v_playing integer;
  v_leitura jsonb;
  v_antigo_morreu boolean;
  v_novo_funca boolean;
begin
  -- Sala com fila (o seed dá created_at igual para as duas salas, então
  -- "primeira por created_at" seria sorteio).
  --
  -- A escolha NÃO pode depender de a fila já existir: em 2026-10-02 as duas
  -- salas do projeto Cloud estavam com a fila drenada (as sessões consumiram os
  -- itens APPROVED), e este `where exists` passou a devolver NADA — daí `v_host`
  -- NULL, `set_config(..., NULL)` e o `set_playback` estourando "não
  -- autenticado", que parece defeito de segurança e é deriva de fixture. O
  -- roteiro monta a fila dele logo abaixo (insere o que faltar para chegar a 5),
  -- então basta uma sala ativa: determinismo continua, dependência de estado
  -- externo some.
  select r.id, r.code, r.player_token, r.host_id
  into v_room_id, v_code, v_token, v_host
  from public.rooms r
  where r.status = 'active'
  order by r.code
  limit 1;

  perform set_config('request.jwt.claim.sub', v_host::text, true);

  -- Fila determinística para o roteiro inteiro: 5 itens aprovados (o seed traz
  -- 1 aprovado + 1 pending; o resto é criado aqui para ter material depois
  -- dos advances).
  --
  -- O doador é o HOST da sala, não um item da fila. Buscar o doador na própria
  -- fila parecia elegante e era um beco sem saída: com a fila vazia o `lateral`
  -- não devolveva linha nenhuma e o `insert` inteiro nascia com ZERO itens —
  -- o roteiro seguia e estourava "nada tocando" muito depois, longe da causa.
  insert into public.queue_items (
    room_id, added_by_user_id, youtube_video_id, title, duration_seconds, position
  )
  select v_room_id, v_host, 'smoke' || g, 'Smoke ' || g, 180, 10 + g
  from generate_series(
    1,
    greatest(0, 5 - (select count(*) from public.queue_items where room_id = v_room_id))
  ) as g;

  update public.queue_items
  set status = 'approved'
  where room_id = v_room_id and status in ('pending', 'approved');

  insert into playback_smoke values
    ('00 preparo', jsonb_build_object(
      'ok', (
        select count(*) >= 5 from public.queue_items
        where room_id = v_room_id and status = 'approved'
      ),
      'sala', v_code,
      'fila', (
        select jsonb_agg(jsonb_build_object('pos', position, 'status', status))
        from (
          select position, status from public.queue_items
          where room_id = v_room_id order by position
        ) as fila
      )
    ));

  -- 1. token errado não abre nada (nem leitura nem avanço)
  --
  -- As duas RPCs vão para variáveis antes (a ordem de avaliação dos argumentos
  -- do `jsonb_build_object` não é garantida — ver a nota do topo do arquivo).
  v_leitura := public.get_player_state(v_code, gen_random_uuid());
  v_out := public.claim_next_song(v_code, gen_random_uuid(), null);
  insert into playback_smoke values
    ('01 token invalido', jsonb_build_object(
      'ok', coalesce(v_leitura ->> 'error', '') = 'player inválido'
       and coalesce(v_out ->> 'error', '') = 'player inválido',
      'leitura', v_leitura,
      'avanco', v_out
    ));

  -- 2. sala inexistente
  --
  -- Este caso (e o 19) devolvem o JSON da própria RPC, que traz `ok: false`
  -- porque a RPC RECUSA. Sem embrulhar, o relatório mistura "a parede segurou"
  -- com "o instrumento quebrou" e quem lê por `ok` não distingue. Aqui a
  -- expectativa fica explícita: recusou com o erro esperado.
  v_out := public.get_player_state('ZZZZZZ', gen_random_uuid());
  insert into playback_smoke values
    ('02 sala inexistente', jsonb_build_object(
      'ok', coalesce(v_out ->> 'error', '') = 'player inválido',
      'resposta', v_out
    ));

  -- 3. leitura com o token certo: só o que a TV pode mostrar
  --
  -- O veredito também exige que o payload do player NÃO traga
  -- `player_token`/`youtube_api_key`. A RPC é `security definer` e devolve
  -- jsonb montado à mão: é exatamente o tipo de função onde um `jsonb_build_object`
  -- novo Include uma coluna a mais sem ninguém notar. Esta linha é a que pega.
  v_out := public.get_player_state(v_code, v_token);
  insert into playback_smoke values
    ('03 leitura publica', jsonb_build_object(
      'ok', not (v_out::text like '%added_by%')
       and not (v_out::text like '%player_token%')
       and not (v_out::text like '%youtube_api_key%')
       and jsonb_array_length(v_out -> 'queue') >= 1,
      'sem_uuid_de_usuario', not (v_out::text like '%added_by%'),
      'sem_segredos', not (v_out::text like '%player_token%')
                   and not (v_out::text like '%youtube_api_key%'),
      'tem_fila', jsonb_array_length(v_out -> 'queue'),
      'estado', v_out -> 'room',
      'primeiro_da_fila', v_out -> 'queue' -> 0
    ));

  -- 4. boot: sala ociosa com fila aprovada entra a primeira
  v_out := public.claim_next_song(v_code, v_token, null);
  v_a := (v_out -> 'item' ->> 'id')::uuid;
  insert into playback_smoke values
    ('04 boot pega a fila', v_out || jsonb_build_object(
      'sala_aponta_para_o_item', (
        select current_item_id = v_a from public.rooms where id = v_room_id
      ),
      'item_esta_playing', (
        select status = 'playing' from public.queue_items where id = v_a
      )
    ));

  -- 5. terminou A: A vira played e B entra
  v_out := public.claim_next_song(v_code, v_token, v_a);
  v_b := (v_out -> 'item' ->> 'id')::uuid;
  insert into playback_smoke values
    ('05 avanco apos o fim', v_out || jsonb_build_object(
      'anterior_virou_played', (
        select status = 'played' from public.queue_items where id = v_a
      ),
      'trocou_de_item', v_b is distinct from v_a
    ));

  -- 6. claim repetido com o MESMO item terminado é no-op (migration 00028)
  v_out := public.claim_next_song(v_code, v_token, v_a);
  select count(*) into v_playing
  from public.queue_items where room_id = v_room_id and status = 'playing';
  insert into playback_smoke values
    ('06 claim repetido e no-op', v_out || jsonb_build_object(
      'tocando', v_playing,
      'continua_no_b', (v_out -> 'item' ->> 'id')::uuid = v_b
    ));

  -- 7. set_playback sem host => false
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  v_ok := public.set_playback(v_room_id, 'pause');
  insert into playback_smoke values
    ('07 participante nao controla', jsonb_build_object(
      'ok', v_ok is not true,
      'resultado', v_ok
    ));

  -- 8. host segura (a âncora some: paused não acumula tempo)
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  v_ok := public.set_playback(v_room_id, 'pause');
  insert into playback_smoke values
    ('08 host pausa', jsonb_build_object(
      'ok', v_ok,
      'playback', (select playback_status from public.rooms where id = v_room_id),
      'ancora_zerada', (
        select current_item_started_at is null from public.rooms where id = v_room_id
      ),
      'item_continua_playing', (
        select status = 'playing' from public.queue_items where id = v_b
      )
    ));

  -- 9. player não pula enquanto o host segura
  v_out := public.claim_next_song(v_code, v_token, v_b);
  insert into playback_smoke values
    ('09 player nao pula em pausa', v_out || jsonb_build_object(
      -- `already_advanced` ausente é o sinal de que NÃO pulou; a sala continua
      -- pausada. Se a RPC começar a avançar durante a pausa, isto vira false.
      'ok', coalesce((v_out ->> 'ok')::boolean, false)
       and not (v_out ? 'already_advanced')
       and (select playback_status from public.rooms where id = v_room_id) = 'paused',
      'playback', (select playback_status from public.rooms where id = v_room_id)
    ));

  -- 10. host retoma
  v_ok := public.set_playback(v_room_id, 'play');
  insert into playback_smoke values
    ('10 host retoma', jsonb_build_object(
      'ok', v_ok,
      'playback', (select playback_status from public.rooms where id = v_room_id),
      'ancora_volta', (
        select current_item_started_at is not null from public.rooms where id = v_room_id
      )
    ));

  -- 11. comando inválido
  --
  -- Este caso e o 18 ESPERAM erro. Nos dois ramos o `ok` é explícito: sem ele,
  -- o ramo que levanta exceção (o bom) fica sem veredito e o ramo que NÃO
  -- levanta (o defeito) também — indistinguíveis na leitura.
  begin
    v_ok := public.set_playback(v_room_id, 'rewind');
    insert into playback_smoke values
      ('11 comando invalido', jsonb_build_object('ok', false, 'resultado', v_ok, 'obs', 'deveria ter levantado erro'));
  exception when others then
    insert into playback_smoke values
      ('11 comando invalido', jsonb_build_object(
        'ok', coalesce(sqlerrm, '') = 'comando inválido',
        'erro', sqlerrm
      ));
  end;

  -- 12. host pula: a atual vai para skipped e a próxima entra
  v_b := (select current_item_id from public.rooms where id = v_room_id);
  begin
    v_ok := public.set_playback(v_room_id, 'skip');
    insert into playback_smoke values
      ('12 host pula', jsonb_build_object(
        'ok', v_ok,
        'anterior_virou_skipped', (
          select status = 'skipped' from public.queue_items where id = v_b
        ),
        'playback', (select playback_status from public.rooms where id = v_room_id),
        'tocando', (
          select count(*) from public.queue_items
          where room_id = v_room_id and status = 'playing'
        )
      ));
  exception when others then
    insert into playback_smoke values
      ('12 host pula', jsonb_build_object('ok', false, 'erro', sqlerrm));
  end;

  -- 13. host para: sala ociosa, sem item atual
  begin
    v_ok := public.set_playback(v_room_id, 'stop');
    insert into playback_smoke values
      ('13 host para', jsonb_build_object(
        'ok', v_ok,
        'playback', (select playback_status from public.rooms where id = v_room_id),
        'current_item_id', (
          select case when current_item_id is null then 'null' else 'pointer' end
          from public.rooms where id = v_room_id
        )
      ));
  exception when others then
    insert into playback_smoke values
      ('13 host para', jsonb_build_object('ok', false, 'erro', sqlerrm));
  end;

  -- 14. depois do stop, play entra na próxima aprovada (o stop não esvazia a
  -- fila, só desliga a sala)
  begin
    v_ok := public.set_playback(v_room_id, 'play');
    insert into playback_smoke values
      ('14 play reentra na fila', jsonb_build_object(
        'ok', v_ok,
        'playback', (select playback_status from public.rooms where id = v_room_id),
        'tocando', (
          select count(*) from public.queue_items
          where room_id = v_room_id and status = 'playing'
        )
      ));
  exception when others then
    insert into playback_smoke values
      ('14 play reentra na fila', jsonb_build_object('ok', false, 'erro', sqlerrm));
  end;

  -- 15. rotacionar o token mata o link antigo
  v_novo := public.rotate_player_token(v_room_id);
  v_antigo_morreu := public.get_player_state(v_code, v_token) ->> 'ok' = 'false';
  v_novo_funca := public.get_player_state(v_code, v_novo) ->> 'ok' = 'true';
  insert into playback_smoke values
    ('15 token rotacionado', jsonb_build_object(
      'ok', v_novo is not null and v_antigo_morreu and v_novo_funca,
      'token_novo', v_novo is not null,
      'token_antigo_morreu', v_antigo_morreu,
      'token_novo_funca', v_novo_funca
    ));
  update public.rooms set player_token = v_token where id = v_room_id;

  -- 16. participante não rotaciona
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  v_novo := public.rotate_player_token(v_room_id);
  insert into playback_smoke values
    ('16 participante nao rotaciona', jsonb_build_object(
      'ok', v_novo is null,
      'resultado', v_novo
    ));

  -- 17. o item que está tocando sair da fila deixa a sala ociosa
  -- (é o caminho real do app: remover da fila é DELETE, e o
  -- on delete set null da FK passa pelo trigger de rooms)
  perform set_config('request.jwt.claim.sub', v_host::text, true);
  v_b := (select current_item_id from public.rooms where id = v_room_id);
  delete from public.queue_items where id = v_b;
  insert into playback_smoke values
    ('17 item saiu da fila', jsonb_build_object(
      'ok', (select current_item_id is null from public.rooms where id = v_room_id)
       and (select playback_status from public.rooms where id = v_room_id) = 'idle'
       and (select current_item_started_at is null from public.rooms where id = v_room_id),
      'sala_aponta_para_algo', (
        select current_item_id is not null from public.rooms where id = v_room_id
      ),
      'playback', (select playback_status from public.rooms where id = v_room_id),
      'ancora_zerada', (
        select current_item_started_at is null from public.rooms where id = v_room_id
      )
    ));

  -- 18. fila sem nada aprovado => play recusa
  update public.queue_items
  set status = 'skipped'
  where room_id = v_room_id and status in ('approved', 'pending');
  begin
    v_ok := public.set_playback(v_room_id, 'play');
    insert into playback_smoke values
      ('18 tocar sem fila', jsonb_build_object('ok', false, 'resultado', v_ok, 'obs', 'deveria ter levantado erro'));
  exception when others then
    insert into playback_smoke values
      ('18 tocar sem fila', jsonb_build_object(
        'ok', coalesce(sqlerrm, '') = 'nada para tocar',
        'erro', sqlerrm
      ));
  end;

  -- 19. sala encerrada não deixa o player avançar
  update public.rooms set status = 'closed' where id = v_room_id;
  v_out := public.claim_next_song(v_code, v_token, null);
  insert into playback_smoke values ('19 sala encerrada', jsonb_build_object(
    'ok', coalesce(v_out ->> 'error', '') = 'sala encerrada',
    'resposta', v_out
  ));
  update public.rooms set status = 'active' where id = v_room_id;
end;
$$;

select jsonb_object_agg(passo, detalhe order by passo) as relatorio
from playback_smoke;

-- O relatório vem ANTES do rollback de propósito: a Management API devolve o
-- resultado do último SELECT, e um `rollback;` no fim devolve o banco como
-- estava (ver a nota do `begin;` no topo).
rollback;
