-- Fase 16 — mesas: 1 por padrão, até 10, e sem perguntar mesa quando há só uma.
--
-- PEDIDO DO PO (2026-10-05): (a) o bar nasce com 1 mesa e aceita no máximo 10;
-- (b) quem entra num bar de mesa única NÃO passa pela tela de seleção — vai
-- direto para a única mesa = tela de pedir música; (c) o host muda a quantidade
-- depois, pela UI. O plano está no TODO.md ("Fase 16").
--
-- POR QUE IR PARA O BANCO: o limite de 999 vivia só na UI (`MESA_MAX` e o
-- `max=` do input). Limite que só existe na tela não é limite — e a auto-mesa-1
-- é uma regra de entrada, não um `if` de React (ADR-003: a RLS/regra do banco é
-- a parede, a UI só sugere).
--
-- O QUE ESTA MIGRATION FAZ:
--   1) corta dados antes de apertar os checks (ZEHBAR 12 → 10, mesas 11/12
--      vazias em 2026-10-05; quem estiver sentado em mesa removida vai p/ a 1);
--   2) `bars.quantidade_mesas` e `mesas.numero` passam a ter check 1–10;
--   3) `create_bar` recusa > 10 (hoje 1–999, migration 00034);
--   4) nova RPC `update_bar_mesas` (security definer, host-only) — o host muda
--      a quantidade e as linhas de `mesas` sincronizam na mesma transação;
--   5) `join_room` devolve `mesa_numero = 1` quando o bar tem uma mesa só e a
--      pessoa não é espectador — a auto-mesa-1 que a 00022 (2026-09-24) tirou.
--      Espectador (`fora_do_raio`) continua sem mesa: quem está de fora não
--      senta, e sentá-lo mentiria para o card de ocupação do host.
--
-- A auto-mesa-1 é o coração do item (b): sem ela, quem entra por código num bar
-- de 1 mesa cairia com `mesa_numero null`, `needsMesa` ficaria true e o
-- `MesaPicker` apareceria — a tela que o dono mandou pular.

-- ---------------------------------------------------------------------------
-- 1) Dados primeiro: os checks novos validariam as 12 mesas do ZEHBAR
-- ---------------------------------------------------------------------------
-- Quem estiver em mesa que vai sumir (não acontece no ZEHBAR — 11 e 12 vazias —
-- mas a migration pode rodar depois de um uso real) vai para a mesa 1, que
-- sempre existe (mínimo do produto é 1).
update public.room_members rm
   set mesa_numero = 1
  from public.rooms r
 where rm.room_id = r.id
   and r.bar_id is not null
   and rm.mesa_numero > 10;

delete from public.mesas where numero > 10;

update public.bars set quantidade_mesas = 10 where quantidade_mesas > 10;

-- Backfill da regra nova: quem já entrou numa sala de mesa única antes desta
-- migration ficou com `mesa_numero null` (a auto-mesa-1 só existia na 00013 e
-- saiu na 00022). Sem este passo, o card de ocupação mostraria "sem_mesa" gente
-- que a tela agora nem pergunta. Espectador (`fora_do_raio`) fica como está:
-- quem está de fora não senta.
update public.room_members rm
   set mesa_numero = 1
  from public.rooms r
   join public.bars b on b.id = r.bar_id
 where rm.room_id = r.id
   and b.quantidade_mesas = 1
   and rm.mesa_numero is null
   and not rm.fora_do_raio;

-- ---------------------------------------------------------------------------
-- 2) Checks: o limite mora no banco
-- ---------------------------------------------------------------------------
alter table public.bars drop constraint if exists bars_quantidade_mesas_check;
alter table public.bars
  add constraint bars_quantidade_mesas_check
  check (quantidade_mesas >= 1 and quantidade_mesas <= 10);

alter table public.mesas drop constraint if exists mesas_numero_check;
alter table public.mesas
  add constraint mesas_numero_check
  check (numero >= 1 and numero <= 10);

-- ---------------------------------------------------------------------------
-- 3) create_bar: recusa > 10 (mesma assinatura da 00034, guarda nova)
-- ---------------------------------------------------------------------------
drop function if exists public.create_bar(
  text, text, text, int, text[], numeric, numeric, int, text
);

create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[] default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_raio_permitido_metros int default 500,
  p_codigo text default null
)
returns table (bar_id uuid, bar_code text, room_id uuid, room_code text)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_bar_id uuid := gen_random_uuid();
  v_room_id uuid := gen_random_uuid();
  v_bar_code text;
  v_room_code text;
  v_raio int;
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para criar o seu bar';
  end if;
  if not public.is_dev() and exists (
    select 1 from public.bars b where b.host_id = auth.uid()
  ) then
    raise exception 'você já tem um bar — cada dono tem uma casa';
  end if;
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'informe o nome do bar';
  end if;
  -- Fase 16: 1 por padrão, até 10. Era 1–999 (00034).
  if p_quantidade_mesas < 1 or p_quantidade_mesas > 10 then
    raise exception 'quantidade de mesas inválida (1–10)';
  end if;
  if (p_latitude is null) <> (p_longitude is null) then
    raise exception 'localização incompleta';
  end if;
  if p_latitude is not null and (p_latitude < -90 or p_latitude > 90) then
    raise exception 'latitude inválida';
  end if;
  if p_longitude is not null and (p_longitude < -180 or p_longitude > 180) then
    raise exception 'longitude inválido';
  end if;
  v_raio := p_raio_permitido_metros;
  if v_raio is null or v_raio < 50 or v_raio > 1000 then
    raise exception 'raio de presença inválido (50–1000 m)';
  end if;

  v_bar_code := public.generate_bar_code();
  v_room_code := public.unique_room_code(coalesce(nullif(btrim(p_codigo), ''), 'KARAOKE'));

  insert into public.bars (
    id, host_id, code, nome, cidade, endereco, quantidade_mesas,
    latitude, longitude, raio_permitido_metros
  )
  values (
    v_bar_id,
    auth.uid(),
    v_bar_code,
    btrim(p_nome),
    nullif(btrim(coalesce(p_cidade, '')), ''),
    nullif(btrim(coalesce(p_endereco, '')), ''),
    p_quantidade_mesas,
    p_latitude,
    p_longitude,
    v_raio
  );

  for v_n in 1..p_quantidade_mesas loop
    insert into public.mesas (bar_id, numero, rotulo)
    values (
      v_bar_id,
      v_n,
      case
        when p_rotulos is not null and v_n <= array_length(p_rotulos, 1)
          then nullif(btrim(coalesce(p_rotulos[v_n], '')), '')
        else null
      end
    );
  end loop;

  insert into public.rooms (id, bar_id, code, host_id)
  values (v_room_id, v_bar_id, v_room_code, auth.uid());

  bar_id := v_bar_id;
  bar_code := v_bar_code;
  room_id := v_room_id;
  room_code := v_room_code;
  return next;
end;
$$;

grant execute on function public.create_bar(
  text, text, text, int, text[], numeric, numeric, int, text
) to authenticated;

-- ---------------------------------------------------------------------------
-- 4) update_bar_mesas: o host muda a quantidade e as linhas sincronizam
-- ---------------------------------------------------------------------------
-- Por que RPC e não update direto em `bars` + `mesas`: são TRÊS escritas
-- (realocar quem sentou na mesa removida, apagar/inserir linhas de `mesas`,
-- atualizar `quantidade_mesas`) e elas valem juntas ou nada vale. Uma transação
-- só, com a autorização DENTRO dela (ADR-003).
--
-- Realocação: quem está em `mesa_numero > p_nova_qtd` vai para a mesa 1 — ela
-- sempre existe (mínimo 1). No ZEHBAR as mesas 11/12 estavam vazias (conferido
-- em 2026-10-05), então o corte 12 → 10 não move ninguém.
create or replace function public.update_bar_mesas(
  p_bar_id uuid,
  p_nova_qtd int
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_qtd int := p_nova_qtd;
  v_reallocados int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if v_qtd is null or v_qtd < 1 or v_qtd > 10 then
    raise exception 'quantidade de mesas inválida (1–10)';
  end if;
  -- Autorização ANTES de qualquer escrita: só o dono do bar.
  if not exists (
    select 1 from public.bars b
     where b.id = p_bar_id and b.host_id = auth.uid()
  ) then
    raise exception 'bar não encontrado';
  end if;

  -- Quem sentou em mesa que vai sumir recai na mesa 1.
  update public.room_members rm
     set mesa_numero = 1
    from public.rooms r
   where rm.room_id = r.id
     and r.bar_id = p_bar_id
     and rm.mesa_numero > v_qtd;
  get diagnostics v_reallocados = row_count;

  delete from public.mesas
   where bar_id = p_bar_id and numero > v_qtd;

  insert into public.mesas (bar_id, numero)
  select p_bar_id, n
    from generate_series(1, v_qtd) as n
   where not exists (
     select 1 from public.mesas m where m.bar_id = p_bar_id and m.numero = n
   );

  update public.bars set quantidade_mesas = v_qtd where id = p_bar_id;

  return jsonb_build_object(
    'quantidade_mesas', v_qtd,
    'reallocados', v_reallocados
  );
end;
$$;

-- ACL (padrão da 00040): `alter default privileges` do projeto dá EXECUTE a
-- `anon` em toda função nova, então são os DOIS revokes.
revoke execute on function public.update_bar_mesas(uuid, int) from public;
revoke execute on function public.update_bar_mesas(uuid, int) from anon;
grant execute on function public.update_bar_mesas(uuid, int) to authenticated;

-- ---------------------------------------------------------------------------
-- 5) join_room: bar de mesa única não pergunta — senta na mesa 1
-- ---------------------------------------------------------------------------
-- Mesma assinatura da 00040 (4 args), então `create or replace` basta: não
-- cria overload e não muda o contrato do cliente. O que muda é só o ramo
-- `p_mesa is null` — que hoje devolve `null` e é exatamente o que faz o
-- `MesaPicker` aparecer num bar de uma mesa só.
--
-- Exceção do espectador (`fora_do_raio`): quem entrou de fora do raio não senta
-- (`canPickMesa` no front e o corte do `kf-geo` no pedido de música), então
-- `mesa_numero` continua `null` — é o que o card de ocupação do host mostra
-- como "sem_mesa" e o que a regra do espectador espera.
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
    if found then
      if p_mesa is not null then
        if p_mesa < 1 or p_mesa > v_bar.quantidade_mesas then
          raise exception 'mesa inválida';
        end if;
        if not exists (select 1 from public.mesas where bar_id = v_bar.id and numero = p_mesa) then
          raise exception 'mesa não existe';
        end if;
        v_mesa := p_mesa;
      elsif v_bar.quantidade_mesas = 1 and not coalesce(p_fora_do_raio, false) then
        -- Fase 16: bar de uma mesa só. Não pergunta — a única mesa é a resposta,
        -- e a tela de seleção é a que o dono mandou pular. Espectador continua
        -- sem mesa (quem está de fora não senta).
        v_mesa := 1;
      end if;
    end if;
  end if;

  v_effective := public.member_entry_state(v_room.id);
  v_status := case
    when v_effective is null then
      case when v_room.entry_mode = 'open' then 'approved'::public.member_status
           else 'pending'::public.member_status end
    else (v_effective ->> 'status')::public.member_status
  end;

  v_distancia := case when p_distancia_m is null then null else greatest(0, p_distancia_m) end;

  insert into public.room_members (
    room_id, user_id, status, mesa_numero, fora_do_raio, distancia_m
  )
  values (v_room.id, auth.uid(), v_status, v_mesa, coalesce(p_fora_do_raio, false), v_distancia)
  on conflict (room_id, user_id)
    do update set
      status = excluded.status,
      mesa_numero = coalesce(excluded.mesa_numero, public.room_members.mesa_numero),
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

-- ACL idêntica à da 00040 (mesma assinatura): sem o revoke de `anon`, a
-- redefinição manteria a porta aberta que a 00040 fechou.
revoke execute on function public.join_room(text, int, boolean, int) from public;
revoke execute on function public.join_room(text, int, boolean, int) from anon;
grant execute on function public.join_room(text, int, boolean, int) to authenticated;

-- `update_bar_mesas` é RPC nova: o PostgREST precisa recarregar o schema.
notify pgrst, 'reload schema';
