-- Fase 8a (2/2) — pré-aprovação de 24h, só para quem tem login.
--
-- Requisito do PO (27/09): "um usuário aprovado pelo host continua pré aprovado
-- quando ele entra novamente na sala" era o comportamento herdado do
-- `on conflict` do `join_room` (o status antigo sobrevivia a qualquer
-- reentrada, para sempre). Agora a pré-aprovação vale 24h e NUNCA vale para
-- usuário sem login (anônimo), que sempre passa pela regra da sala.
--
--   toggle ON  (padrão): usuário AUTENTICADO, aprovado há menos de 24h,
--                       reentra aprovado. Anônimo: nunca pré-aprovado.
--   toggle OFF           : ninguém é pré-aprovado — a reentrada segue a regra
--                       da sala (com "entrada livre" OFF, volta a pendente).
--
-- Quem SAI da sala continua precisando de aprovação nova com "entrada livre"
-- OFF: `leave_room` apaga a linha de `room_members`, e sem linha não há
-- pré-aprovação possível. Esta migration trata de RECONECTAR sem sair.
--
-- Uma regra só, em um lugar: `member_entry_state` é quem decide o status
-- efetivo (o `join_room` grava o que ela devolve, e o app lê ela para a tela
-- de entrada). Duplicar a regra em SQL e no client era o caminho para a
-- pré-approvação "voltar sozinha" na próxima mudança.

-- 1) Toggle da sala. Default ON = o requisito é o padrão do produto.
alter table public.rooms
  add column if not exists pre_approval_24h boolean not null default true;

comment on column public.rooms.pre_approval_24h is
  'Pré-aprovação de 24h ao reentrar (só usuários autenticados). Default ON.';

-- 2) Instante da aprovação — de onde sai a janela de 24h.
alter table public.room_members
  add column if not exists approved_at timestamptz;

comment on column public.room_members.approved_at is
  'Quando o status virou approved. Base da janela de 24h da pré-aprovação.';

-- `approved_at` é derivado do status, nunca escrito à mão: um trigger para
-- INSERT e para UPDATE of status cobre approve/rejeitar/expulsar/join/open.
create or replace function public.room_members_sync_approved_at()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
begin
  if new.status = 'approved' then
    -- A janela só nasce quando o status MUDA para aprovado: reaprovar quem já
    -- está aprovado não renova a pré-aprovação (senão o host mantendo o botão
    -- clicado seguraria a aprovação para sempre).
    if tg_op = 'INSERT' or old.status is distinct from 'approved' then
      new.approved_at := now();
    end if;
  else
    new.approved_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists room_members_sync_approved_at_trg on public.room_members;
create trigger room_members_sync_approved_at_trg
  before insert or update of status on public.room_members
  for each row execute function public.room_members_sync_approved_at();

-- Backfill: a aprovação que já existe é datada pela entrada na sala (a única
-- marca que temos). Nunca "renova" ninguém — só pode fazer expirar.
update public.room_members
set approved_at = joined_at
where status = 'approved' and approved_at is null;

-- 3) Usuário anônimo (Supabase anonymous sign-ins). Nunca pré-aprovado.
create or replace function public.current_user_is_anonymous()
returns boolean
language sql
stable
set search_path = public, pg_catalog
as $$
  select coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true';
$$;

grant execute on function public.current_user_is_anonymous() to anon, authenticated;

-- 4) Status EFETIVO do membro para efeitos de entrada.
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
    'approved_at', v_member.approved_at
  );
end;
$$;

revoke all on function public.member_entry_state(uuid, uuid) from public;
grant execute on function public.member_entry_state(uuid, uuid) to anon, authenticated;

-- 5) join_room passa a gravar o status efetivo (a regra mora em
-- member_entry_state; aqui não há cópia da regra).
drop function if exists public.join_room(text, int);

create or replace function public.join_room(p_code text, p_mesa int default null)
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

  insert into public.room_members (room_id, user_id, status, mesa_numero)
  values (v_room.id, auth.uid(), v_status, v_mesa)
  on conflict (room_id, user_id)
    do update set
      status = excluded.status,
      mesa_numero = coalesce(excluded.mesa_numero, public.room_members.mesa_numero);

  return (
    select rm
    from public.room_members rm
    where rm.room_id = v_room.id
      and rm.user_id = auth.uid()
  );
end;
$$;

grant execute on function public.join_room(text, int) to authenticated;

notify pgrst, 'reload schema';
