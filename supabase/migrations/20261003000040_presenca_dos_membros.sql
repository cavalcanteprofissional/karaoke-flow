-- Fase 9 (parcial) — o host passa a enxergar quem está na sala.
--
-- CONTEXTO (2026-10-03): em 2026-10-02 o produto mudou para "quem está fora do
-- raio de presença ENTRA e só assiste" (`src/lib/bars/geo.ts` passou a separar
-- `outside` de `geo-unavailable`). A decisão era tomada no request e morria
-- ali: nada era gravado, então o host não tinha como saber que aquela pessoa
-- entrou de fora — a contagem por raio de presença era impossível de fazer no
-- servidor, e o `MesaPicker` aparecia para um espectador aprovado que digitasse
-- `/salas/<código>` na mão (`needsMesa` só olhava `mesa_numero is null`).
--
-- O que esta migration faz:
--   1) guarda a decisão em `room_members` (`fora_do_raio`, `distancia_m`);
--   2) devolve o agregado por mesa e por raio numa RPC só o host;
--   3) faz o `DELETE` de `room_members` chegar no Realtime (o contador é ao
--      vivo, e sem `replica identity full` o evento de DELETE não tem a PK).
--
-- NATUREZA DA COLUNA (leia antes de confiar): `fora_do_raio` chega como
-- **parâmetro do cliente** na chamada `join_room`, então alguém com uma sessão
-- válida pode se declarar "dentro" chamando a RPC direto (curl/DevTools/app
-- modificado) — o mesmo desenho de bypass que a Fase 8c fechou para os tetos de
-- bar/sala (`20260930000036`) e que aqui é aceito **de propósito**: o único
-- consumidor é o contador do host, e o corte que protege o produto continua
-- sendo o `kf-geo` lido no servidor por `buildQueueSongItem` ao pedir música.
-- Mentir no contador não dá direito nenhum. Se um dia essa coluna passar a
-- VALER algo (toggle do dono, por exemplo), o caminho certo é prova assinada
-- pelo servidor, não parâmetro do cliente.

-- 1) Colunas da decisão de presença
alter table public.room_members
  add column if not exists fora_do_raio boolean not null default false,
  add column if not exists distancia_m integer;

-- A distância é um inteiro de metros, arredondado: é exibição ("a 1,2 km"),
-- não cálculo. O teto evita um número absurdo vindo de cookie adulterado.
alter table public.room_members
  drop constraint if exists room_members_distancia_m_range;
alter table public.room_members
  add constraint room_members_distancia_m_range
  check (distancia_m is null or distancia_m >= 0);

-- `replica identity full`: o card do host é ao vivo, e o evento de DELETE de
-- `room_members` (quem sai da sala) só chega com a PK no payload.
alter table public.room_members replica identity full;

-- 2) join_room grava a decisão
--
-- `drop` antes do `create or replace`: a assinatura muda (2 params → 4), e
-- `create or replace` com assinatura diferente cria uma **OVERLOAD** — duas
-- funções chamadas `join_room`, e o PostgREST passa a errar por ambiguidade
-- quando o cliente manda só os params antigos. Mesmo cuidado da 00022.
drop function if exists public.join_room(text, int);

create or replace function public.join_room(
  p_code text,
  p_mesa int default null,
  p_fora_do_raio boolean default false,
  p_distancia_m int default null
)
returns public.room_members
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room public.rooms%rowtype;
  v_bar public.bars%rowtype;
  v_status public.member_status;
  v_effective jsonb;
  v_mesa int;
  v_distancia int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;

  select * into v_room
  from public.rooms
  where code = upper(btrim(p_code))
    and status = 'active';

  if not found then
    raise exception 'sala não encontrada ou inativa';
  end if;

  if v_room.host_id = auth.uid() then
    raise exception 'você já é o dono desta sala';
  end if;

  v_mesa := null;
  if v_room.bar_id is not null then
    select * into v_bar from public.bars where id = v_room.bar_id;
    if found and p_mesa is not null then
      if p_mesa < 1 or p_mesa > v_bar.quantidade_mesas then
        raise exception 'mesa inválida';
      end if;
      if not exists (select 1 from public.mesas where bar_id = v_bar.id and numero = p_mesa) then
        raise exception 'mesa não existe';
      end if;
      v_mesa := p_mesa;
    end if;
  end if;

  -- Reentrada de quem já é membro: a pré-aprovação de 24h (ou a regra da sala,
  -- se ela não valer) decide. Primeira vez: a regra da sala decide.
  v_effective := public.member_entry_state(v_room.id);
  v_status := case
    when v_effective is null then
      case when v_room.entry_mode = 'open' then 'approved'::public.member_status
           else 'pending'::public.member_status end
    else (v_effective ->> 'status')::public.member_status
  end;

  -- Distância só faz sentido com coordenada dos dois lados; `geo-unavailable`
  -- não tem o que medir e chega sem número.
  v_distancia := case when p_distancia_m is null then null else greatest(0, p_distancia_m) end;

  insert into public.room_members (
    room_id, user_id, status, mesa_numero, fora_do_raio, distancia_m
  )
  values (v_room.id, auth.uid(), v_status, v_mesa, coalesce(p_fora_do_raio, false), v_distancia)
  on conflict (room_id, user_id)
    do update set
      status = excluded.status,
      mesa_numero = coalesce(excluded.mesa_numero, public.room_members.mesa_numero),
      -- Reentrada **atualiza** a presença: quem entrou de fora ontem e veio
      -- hoje está dentro de novo, e o contador tem que refletir agora.
      fora_do_raio = excluded.fora_do_raio,
      distancia_m = excluded.distancia_m;

  return (
    select rm
    from public.room_members rm
    where rm.room_id = v_room.id
      and rm.user_id = auth.uid()
  );
end;
$$;

-- ACL. Dois revokes, e os dois são necessários — a 00039 mediu isso: só
-- `FROM public` não tira o `anon`, porque o projeto tem
-- `alter default privileges` do role `postgres` dando `EXECUTE` a `anon` e
-- `authenticated` em **toda** função nova. Verificado no Cloud depois de
-- aplicar: `proacl` do `join_room` saiu
-- `{postgres,anon,authenticated,service_role}` com só o revoke de `public`.
--
--   select has_function_privilege('anon', p.oid, 'execute'), p.proacl::text
--     from pg_proc p where p.proname = 'join_room';
--   -- antes: t | {postgres=X,anon=X,authenticated=X,service_role=X}
--
-- O `join_room` antigo era `authenticated` only (00030), então sem o
-- `revoke ... from anon` esta assinatura nova ficaria **mais aberta** que a
-- que substitui — regressão silenciosa.
revoke execute on function public.join_room(text, int, boolean, int) from public;
revoke execute on function public.join_room(text, int, boolean, int) from anon;
grant execute on function public.join_room(text, int, boolean, int) to authenticated;

-- 3) O status efetivo passa a carregar a presença
--
-- `member_entry_state` é a função que a UI lê para saber o que a pessoa é agora
-- (e é a mesma que o `join_room` usa para gravar — uma regra só). Ela devolvia
-- `status`/`mesa_numero` e nada mais, então a página da sala não tinha como
-- saber que um membro aprovado entrou **de fora**: `needsMesa` só olhava
-- `mesa_numero is null` e oferecia o `MesaPicker` para um espectador. Corpo
-- abaixo é o da 00030 sem alteração de regra — só o `jsonb_build_object`
-- ganhou dois campos.
create or replace function public.member_entry_state(
  p_room_id uuid,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_role text := coalesce(current_setting('request.jwt.claim.role', true), '');
  v_room public.rooms%rowtype;
  v_member public.room_members%rowtype;
  v_pre_approved boolean;
  v_status public.member_status;
begin
  if v_uid is null then
    return null;
  end if;

  -- Só o próprio usuário. O service role (smoke SQL) pode perguntar por
  -- qualquer um, com o JWT do usuário impersonado.
  if v_uid is distinct from auth.uid() and v_role <> 'service_role' then
    return null;
  end if;

  select * into v_room from public.rooms where id = p_room_id;
  if not found then
    return null;
  end if;

  select * into v_member
  from public.room_members
  where room_id = p_room_id and user_id = v_uid;

  -- Nunca entrou: quem decide é o join, pela regra da sala.
  if not found then
    return null;
  end if;

  v_pre_approved := v_room.pre_approval_24h
    and not public.current_user_is_anonymous()
    and v_member.approved_at is not null
    and v_member.approved_at > now() - interval '24 hours';

  if v_member.status = 'approved' and v_pre_approved then
    v_status := 'approved';
  elsif v_member.status = 'approved' then
    -- Pré-aprovação vencida (ou anônimo): a linha volta a valer o que a sala
    -- permite agora. Com "entrada livre" OFF, o membro precisa de aprovação
    -- nova — que é o requisito do PO.
    v_status := case
      when v_room.entry_mode = 'open' then 'approved'::public.member_status
      else 'pending'::public.member_status
    end;
  else
    v_status := v_member.status;
  end if;

  return jsonb_build_object(
    'status', v_status,
    'mesa_numero', v_member.mesa_numero,
    'pre_approval', v_pre_approved,
    'approved_at', v_member.approved_at,
    -- Decisão gravada no join. `fora_do_raio` não depende de nada agora: é o
    -- que a pessoa ERA quando entrou. É o que a página usa para não oferecer
    -- mesa a um espectador, e o que o host vê no contador.
    'fora_do_raio', v_member.fora_do_raio,
    'distancia_m', v_member.distancia_m
  );
end;
$$;

revoke all on function public.member_entry_state(uuid, uuid) from public;
grant execute on function public.member_entry_state(uuid, uuid) to anon, authenticated;

-- 4) Agregado do host: por raio de presença e por mesa
--
-- Por que RPC e não `select` direto: a RLS de `room_members` é **por linha** e
-- só devolve a própria linha, então nem o host consegue somar os outros. E RLS
-- não tem como mostrar coluna por papel. O padrão é o mesmo das `admin_*` da
-- auditoria (00038): `security definer` + verificação de vínculo DENTRO do banco.
--
-- Quem conta: só `approved` (a linha guarda o status efetivo do join, então quem
-- tem pré-aprovação de 24h já entra como aprovado). `pendentes` sai separado,
-- porque quem está esperando aprovação não está na sala ainda. O host não tem
-- linha em `room_members` (`join_room` recusa o dono), então a TV e o próprio
-- host não entram na contagem.
create or replace function public.admin_room_occupancy(p_room_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null or not public.is_host(p_room_id, auth.uid()) then
    raise exception 'sem permissão';
  end if;

  select jsonb_build_object(
    'total', count(*) filter (where rm.status = 'approved'),
    'dentro', count(*) filter (where rm.status = 'approved' and not rm.fora_do_raio),
    'fora', count(*) filter (where rm.status = 'approved' and rm.fora_do_raio),
    'sem_mesa', count(*) filter (where rm.status = 'approved' and rm.mesa_numero is null),
    'pendentes', count(*) filter (where rm.status = 'pending'),
    'por_mesa', coalesce(
      (
        select jsonb_object_agg(t.mesa_numero::text, t.total)
        from (
          select mesa_numero, count(*) as total
          from public.room_members
          where room_id = p_room_id
            and status = 'approved'
            and mesa_numero is not null
          group by mesa_numero
        ) t
      ),
      '{}'::jsonb
    )
  )
  into v_result
  from public.room_members rm
  where rm.room_id = p_room_id;

  return v_result;
end;
$$;

-- Mesma armadilha da `join_room` acima: `FROM public` sozinho não tira o
-- `anon` (default privileges do projeto). Sem o segundo revoke, um visitante
-- sem login chamaria a função — cairia no `if not is_host(...)` e receberia
-- erro, mas a porta da ACL ficaria aberta para a próxima `admin_*`.
revoke execute on function public.admin_room_occupancy(uuid) from public;
revoke execute on function public.admin_room_occupancy(uuid) from anon;
grant execute on function public.admin_room_occupancy(uuid) to authenticated;

-- 5) O card do host é ao vivo, e ele depende do Realtime de `room_members`.
-- `insert`/`update`/`delete` já estão na publicação desde a Fase 4 (00008);
-- o `DELETE` só chega com a PK no payload por causa do `replica identity full`
-- acima.
notify pgrst, 'reload schema';
