-- Um participante (inclusive visitante anônimo) tem no máximo UMA música ativa
-- por sala. Pedir outra substitui a mais antiga; pedir enquanto a sua toca é
-- recusado. O host não tem limite, e só na sala dele.
--
-- POR QUE NO BANCO, E NÃO SÓ NA TELA
-- O pedido de música é um INSERT direto em `queue_items` com a sessão de quem
-- pede (`src/lib/rooms/queue-actions.ts`), governado só pela policy
-- `queue_items_insert_member_or_host`. Uma regra que morasse no botão seria
-- furada por qualquer chamada autenticada — o mesmo defeito que a migration
-- `20261003000041` registrou: esconder botão não é regra.
--
-- O QUE É "ATIVA" — e não é um estado novo
-- `pending` (aguardando aprovação) + `approved` (na fila) + `playing` (tocando
-- agora) = exatamente `QUEUE_VISIBLE_STATUSES` em `src/lib/rooms/queue.ts`, isto
-- é, o que a fila mostra hoje. `played`/`rejected`/`skipped`/`cancelled` são
-- terminais e não ocupam vaga.
--
-- POR QUE A MÚSICA QUE TOCA NÃO É SUBSTITUÍVEL
-- Trocar a `playing` cortaria o áudio na TV — a música que todo mundo está
-- ouvindo morrindo porque o dono da música mudou de ideia. Por isso ela não é
-- removível: o pedido é recusado, e a música segue até virar `played`, que é o
-- momento em que libera o próximo pedido. É a mesma razão pela qual a policy
-- `queue_items_delete_own` (migration `20260927000031`) também exclui `playing`:
-- música tocando se resolve com "Pular", do host.
--
-- A RLS já dá o poder necessário: `queue_items_delete_own` autoriza o AUTOR a
-- apagar o PRÓPRIO item enquanto `pending`/`approved`. A trigger roda como
-- invólucro, então o DELETE passa por essa policy — e é por isso que ela **não**
-- é `security definer` aqui (ao contrário das triggers de posse de bar/sala da
-- `20260930000036`, que precisam furar a RLS para INSERT de outra pessoa). Se o
-- DELETE for barrado, a trigger levanta exceção em vez de fingir que substituiu.
--
-- O HOST É ISENTO NA SUA PRÓPRIA SALA, não em todas: `is_host(room_id, …)`
-- responde por sala, então quem é dono de uma sala e participante de outra
-- recebe a regra como participante.
--
-- `auth.uid()` nulo = seed, Management API, migration. Sem sessão não há
-- "participante" a quem a regra se aplique, e o seed precisa poder reescrever o
-- domínio inteiro — então a trigger sai fora, igual à docs de `20260930000036`.

create or replace function public.queue_items_one_active_per_participant()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_tocando uuid;
  v_restantes integer;
begin
  -- Sem sessão não há participante: seed/Management API passam direto.
  if auth.uid() is null then
    return new;
  end if;

  -- Dono da SALA: quantas quiser, sem troca.
  if public.is_host(new.room_id, auth.uid()) then
    return new;
  end if;

  -- Tocando agora: recusar. Cortar o áudio da TV não é aceitável.
  select q.id into v_tocando
  from public.queue_items q
  where q.room_id = new.room_id
    and q.added_by_user_id = auth.uid()
    and q.status = 'playing'::public.queue_item_status
  limit 1;

  if v_tocando is not null then
    raise exception using
      errcode = 'KF001',
      message = 'Você já tem uma música tocando nesta sala. Dá para pedir outra quando ela terminar.';
  end if;

  -- Substitui: apaga as ativas que ainda não tocam (a mais antiga entre elas
  -- sai primeiro; se houver legado com várias, todas saem — o pedido novo é a
  -- única ativa que resta).
  delete from public.queue_items q
  where q.room_id = new.room_id
    and q.added_by_user_id = auth.uid()
    and q.status in ('pending'::public.queue_item_status, 'approved'::public.queue_item_status);

  -- O DELETE acima é do próprio autor em pending/approved, que a policy
  -- `queue_items_delete_own` autoriza. Se sobrou alguma ativa, foi a RLS
  -- barrando o delete: melhor falhar do que adicionar e deixar duas ativas.
  select count(*) into v_restantes
  from public.queue_items q
  where q.room_id = new.room_id
    and q.added_by_user_id = auth.uid()
    and q.status in ('pending'::public.queue_item_status,
                      'approved'::public.queue_item_status,
                      'playing'::public.queue_item_status);

  if v_restantes > 0 then
    raise exception using
      errcode = 'KF001',
      message = 'Não foi possível substituir sua música anterior na fila.';
  end if;

  return new;
end;
$$;

comment on function public.queue_items_one_active_per_participant() is
  'Uma música ativa (pending/approved/playing) por participante não-host, por sala. Tocando -> recusa (KF001); senão substitui as ativas que não tocam. Espelho em src/lib/rooms/queue.ts:resolveOwnActiveSong.';

drop trigger if exists queue_items_one_active_per_participant on public.queue_items;
create trigger queue_items_one_active_per_participant
  before insert on public.queue_items
  for each row execute function public.queue_items_one_active_per_participant();

-- Sem `security definer`: a trigger roda como invólucro de propósito, para que o
-- DELETE do próprio autor passe pela policy `queue_items_delete_own` (RLS real em
-- vez de privilégio novo).
revoke execute on function public.queue_items_one_active_per_participant() from public;

-- ── Visibilidade do que já existe, sem apagar nada ──────────────────────────
-- Se alguém já entrou com duas ativas (antes desta regra), o próximo pedido
-- as antigas — mas o host precisa saber agora, e um relatório silencioso numa
-- migration é pior que nenhum. `notice`, não `delete`: quem apagaria dado de
-- fila é o host, na tela.
do $$
declare
  v_linhas integer;
begin
  select count(*) into v_linhas
  from (
    select 1 from public.queue_items
    where status in ('pending'::public.queue_item_status,
                     'approved'::public.queue_item_status,
                     'playing'::public.queue_item_status)
    group by room_id, added_by_user_id
    having count(*) > 1
  ) violacoes;
  if v_linhas > 0 then
    raise notice
      'queue_items_one_active_per_participant: % participante(s) com mais de uma música ativa. O próximo pedido de cada um apaga as antigas automaticamente.', v_linhas;
  end if;
end;
$$;