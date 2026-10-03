-- Fase 9 (parte 2) — quem entra de fora do raio só assiste, no banco.
--
-- CONTEXTO (2026-10-03): a 00040 gravou a decisão de presença (`fora_do_raio`)
-- e a UI passou a esconder o pedido de música para o espectador. A UI é a parte
-- honesta da regra, não a regra: estas duas RPCs ainda aceitavam o espectador,
-- e sem elas a regra era só "botão some".
--
--   1) `claim_next_song` aceitando a PORTA 2 (sessão de membro aprovado) que a
--      00029 criou. Com o `/player/<código>` aberto no celular de todo mundo,
--      qualquer convidado podia puxar a próxima faixa — e a fila passava a ter
--      dois claimeadores (TV e celular) disputando o mesmo item sob advisory
--      lock, cada um terminalizando o item que o outro acabara de pegar.
--   2) `pick_mesa` sem olhar `fora_do_raio`: um espectador aprovado que
--      chamasse a RPC direto (curl/DevTools) escolhia mesa, e `needsMesa` na
--      página parava de oferecer o `MesaPicker` só porque a mesa já estava
--      escolhida.
--
-- DECISÃO (PO, 03/10): "quem entra fora do raio entra e só assiste" — vê a
-- fila, pode abrir `/player/<código>` em modo somente leitura, e não pede
-- música, não escolhe mesa e não manda na fila. Ver também `src/lib/rooms/
-- spectator.ts` (mesma regra, lado app) e a checagem de servidor em
-- `addSongToQueueAction` (que usa `member_entry_state`).
--
-- NOTA DE NATUREZA (herdada da 00040): `fora_do_raio` chega como parâmetro do
-- cliente no `join_room`, então alguém pode se declarar "dentro" chamando a RPC
-- direto. Aqui isso **ganha** um direito (escolher mesa), o que é diferente do
-- contador — por isso a checagem é `fora_do_raio = true` NÃO RECUSA e o
-- gravado continua mandando: quem entrou de fora continua de fora mesmo que o
-- GPS depois aponte para dentro. Fechar o bypass de verdade (prova de
-- localização assinada pelo servidor) é a fase de geolocalização confiável.

-- 1) `claim_next_song`: só a TV avança a fila
--
-- `player_room_id` continua com as DUAS portas, porque `get_player_state` usa
-- ele para o visualizador ler o que está tocando. O que muda aqui é a
-- resolução: o claim resolve o token da sala e nada mais. Sem token, o
-- resultado é um erro explícito ("só a TV avança a fila") em vez do genérico
-- "player inválido" — a TV sempre tem token, então essa mensagem nunca aparece
-- para ela, e o texto certo ajuda a separar "link da TV morreu" de "alguém
-- tentou mandar na fila pelo celular".
create or replace function public.claim_next_song(
  p_room_code text,
  p_token uuid default null,
  p_finished_item_id uuid default null
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_code text;
  v_room public.rooms%rowtype;
  v_room_id uuid;
  v_item public.queue_items%rowtype;
  v_claimed_id uuid;
begin
  v_code := upper(btrim(coalesce(p_room_code, '')));
  if v_code = '' then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  if p_token is null then
    return jsonb_build_object(
      'ok', false,
      'error', 'só a TV avança a fila: o celular acompanha, não manda'
    );
  end if;

  select r.id into v_room_id
  from public.rooms r
  where r.code = v_code and r.player_token = p_token;
  if v_room_id is null then
    return jsonb_build_object('ok', false, 'error', 'player inválido');
  end if;

  select * into v_room from public.rooms where id = v_room_id;

  if v_room.status <> 'active' then
    return jsonb_build_object('ok', false, 'error', 'sala encerrada');
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('karaoke_queue:' || v_room_id::text, 0)
  );

  -- Retomada da sala (o que está tocando agora, se houver).
  if v_room.current_item_id is not null then
    select * into v_item from public.queue_items where id = v_room.current_item_id;
  end if;

  -- Pausado: devolve o estado como está, sem pular nada.
  if v_room.playback_status = 'paused' then
    return jsonb_build_object(
      'ok', true,
      'playback_status', v_room.playback_status,
      'item', public.player_item_payload(v_item)
    );
  end if;

  if p_finished_item_id is null then
    -- Sem item finished: só pega a fila quando a sala está ociosa. Com música
    -- no ar, o player não manda claim — e se mandar, aqui é no-op.
    if v_room.current_item_id is not null then
      return jsonb_build_object(
        'ok', true,
        'playback_status', v_room.playback_status,
        'item', public.player_item_payload(v_item)
      );
    end if;
  elsif v_room.current_item_id is distinct from p_finished_item_id then
    -- Outra claim já aconteceu (outra aba, ou o poll chegou antes): no-op.
    return jsonb_build_object(
      'ok', true,
      'playback_status', v_room.playback_status,
      'item', public.player_item_payload(v_item),
      'already_advanced', true
    );
  else
    -- A música terminou: terminaliza. `played` (não `skipped`) porque quem
    -- terminou a faixa foi o player, não o host.
    update public.queue_items
    set status = 'played'
    where id = p_finished_item_id and status = 'playing';
  end if;

  v_claimed_id := public.claim_next_queue_item(v_room_id);
  if v_claimed_id is not null then
    select * into v_item from public.queue_items where id = v_claimed_id;
  else
    v_item.id := null;
  end if;

  select * into v_room from public.rooms where id = v_room_id;

  return jsonb_build_object(
    'ok', true,
    'playback_status', v_room.playback_status,
    'item', case when v_item.id is null then null
      else public.player_item_payload(v_item)
    end
  );
end;
$$;

-- 2) `pick_mesa`: o espectador não senta
--
-- A checagem entra DEPOIS do `approved` e ANTES da validação da mesa: quem não
-- é membro e quem está pendente continuam recebendo o erro que já conheciam, e
-- o espectador recebe o motivo certo (é a diferença entre "não pode" e "não
-- pode, e olha por quê" na tela).
--
-- `v_member.fora_do_raio` é a coluna gravada no join, lida em `security
-- definer` — o RLS de `room_members` é por linha e devolveria a linha do
-- próprio espectador sem problema, mas ler direto é o que o resto da função já
-- faz e evita depender da policy.
create or replace function public.pick_mesa(p_room_id uuid, p_mesa int)
returns public.room_members
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_bar public.bars%rowtype;
  v_member public.room_members%rowtype;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if p_mesa is null or p_mesa < 1 then
    raise exception 'mesa inválida';
  end if;

  select * into v_room from public.rooms where id = p_room_id and status = 'active';
  if not found then
    raise exception 'sala não encontrada ou inativa';
  end if;

  select * into v_member
  from public.room_members
  where room_id = p_room_id
    and user_id = auth.uid();
  if not found then
    raise exception 'você não é membro desta sala';
  end if;
  if v_member.status <> 'approved' then
    raise exception 'aguarde a aprovação para escolher a mesa';
  end if;
  if v_member.fora_do_raio then
    raise exception 'quem entra de fora do raio acompanha a fila, mas não escolhe mesa';
  end if;

  if v_room.bar_id is null then
    raise exception 'sala sem bar vinculado';
  end if;
  select * into v_bar from public.bars where id = v_room.bar_id;
  if not found then
    raise exception 'sala sem bar vinculado';
  end if;
  if p_mesa > v_bar.quantidade_mesas then
    raise exception 'mesa inválida';
  end if;
  if not exists (select 1 from public.mesas where bar_id = v_bar.id and numero = p_mesa) then
    raise exception 'mesa não existe';
  end if;

  update public.room_members
  set mesa_numero = p_mesa
  where room_id = p_room_id
    and user_id = auth.uid();

  return (
    select rm
    from public.room_members rm
    where room_id = p_room_id
      and user_id = auth.uid()
  );
end;
$$;

-- 3) Cache de schema
--
-- Nenhuma assinatura mudou (`create or replace`, não `drop` + `create`), então
-- o ACL das duas RPCs é o mesmo de antes — nenhum revoke/grant é preciso aqui.
-- O aviso é pelo motivo do PGRST201 (pos-mortem 27/09): corpo de função entra
-- no cache do PostgREST, e sem o reload a próxima chamada pode ir para a versão
-- antiga.
notify pgrst, 'reload schema';