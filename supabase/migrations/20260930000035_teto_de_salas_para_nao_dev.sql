-- Fase 8b·quater (b) — fecha o teto de salas para quem NÃO é dev.
--
-- POR QUE OUTRA MIGRATION: `20260930000034` criou `create_room` liberada para
-- qualquer host. Isso era mais do que o dono do projeto pediu — o pedido era
-- "eu, dev, quero criar quantas salas quiser", ou seja, PRIVILÉGIO DO DEV, não
-- multi-sala liberada para todo mundo. Aplicar isso aqui (e não editando a 000034,
-- que já está no Cloud) mantém o histórico das migrations honesto.
--
-- A REGRA: 1 bar = 1 karaokê (MANIFEST §5 — "o dono é a casa"). Continua
-- valendo para todo mundo; só o dev (migration 00034) é isento, igual à
-- exceção de bars. Sem isto, a UI com "Adicionar sala" viraria um recurso novo
-- para qualquer host, decidido por efeito colateral.

drop function if exists public.create_room(uuid, text);

create or replace function public.create_room(
  p_bar_id uuid,
  p_codigo text default null
)
returns table (room_id uuid, room_code text)
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_room_id uuid := gen_random_uuid();
  v_room_code text;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para abrir uma sala';
  end if;
  -- Autorização ANTES de qualquer escrita: quem não é dono do bar é recusado
  -- aqui, sem criar nada.
  if not exists (
    select 1 from public.bars b
     where b.id = p_bar_id and b.host_id = auth.uid()
  ) then
    raise exception 'bar não encontrado';
  end if;
  -- Teto de 1 karaokê por dono, exceto dev (mesma exceção de `create_bar`).
  if not public.is_dev() and exists (
    select 1 from public.rooms r where r.host_id = auth.uid()
  ) then
    raise exception 'você já tem uma sala — cada dono tem um karaokê';
  end if;

  v_room_code := public.unique_room_code(
    coalesce(nullif(btrim(p_codigo), ''), 'KARAOKE')
  );

  insert into public.rooms (id, bar_id, code, host_id)
  values (v_room_id, p_bar_id, v_room_code, auth.uid());

  room_id := v_room_id;
  room_code := v_room_code;
  return next;
end;
$$;

grant execute on function public.create_room(uuid, text) to authenticated;
