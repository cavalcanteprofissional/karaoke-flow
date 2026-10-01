-- 20260930000036_tetos_e_propriedade_no_banco.sql
--
-- FECHA UM BYPASS REAL: os tetos das migrations 34/35 viviam SÓ dentro de
-- `create_bar` / `create_room`, mas o app fala com o PostgREST e o RLS libera
-- `INSERT` direto em `bars`/`rooms` para `host_id = auth.uid()`. Um cliente
-- autenticado (curl, app, DevTools) contornava as regras de negócio sem passar
-- pela RPC. Provado antes desta migration, com a Betânia (não-dev):
--
--   1. INSERT direto em `bars`           -> 2o bar entrou, teto era 1
--   2. INSERT direto em `rooms`          -> 2a/3a sala entraram, teto era 1
--   3. INSERT em `rooms` com bar_id alheio-> sala dentro do bar do dev
--   4. UPDATE rooms SET bar_id           -> re-apontou a sala dela pro bar do dev
--
-- O RLS continua correto no que ele cobre (UPDATE/DELETE de bar ou sala ALHEIA
-- são barrados: 0 linhas). O que faltava era a REGRA DE NEGÓCIO, que RLS não
-- expressa. Aqui ela vira trigger BEFORE INSERT/UPDATE — cobre RPC, Data API
-- direto e qualquer caminho futuro, mantendo as mesmas mensagens das functions.
--
-- `auth.uid() is null` = service_role / seed / migration / Management API: não
-- enforce. O teto é uma cota por usuário, sem sentido fora de uma sessão de
-- usuário final, e o seed precisa reescrever o domínio inteiro.

-- ---------------------------------------------------------------------------
-- 1. bars: cota de 1 por não-dev, em qualquer caminho de escrita
-- ---------------------------------------------------------------------------
create or replace function public.trg_bars_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.host_id is distinct from auth.uid() then
    raise exception 'você não pode criar um bar para outra pessoa';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para criar o seu bar';
  end if;
  -- Mesma regra de `create_bar` (MANIFEST §5): o dono "é a casa". Dev não tem teto.
  if not public.is_dev() and exists (
    select 1 from public.bars b where b.host_id = auth.uid()
  ) then
    raise exception 'você já tem um bar — cada dono tem uma casa';
  end if;
  return new;
end;
$$;

drop trigger if exists bars_guard_insert on public.bars;
create trigger bars_guard_insert
  before insert on public.bars
  for each row execute function public.trg_bars_guard_insert();

-- ---------------------------------------------------------------------------
-- 2. rooms: cota de 1 por não-dev + a sala precisa ser de um bar DO DONO
-- ---------------------------------------------------------------------------
-- O 3º bypass (sala em bar alheio) é o mais grave: `rooms_insert_host` só checa
-- `host_id = auth.uid()`, sem olhar o `bar_id`. Uma não-dev conseguia abrir um
-- karaokê dentro do bar de outra pessoa.
create or replace function public.trg_rooms_guard_insert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.host_id is distinct from auth.uid() then
    raise exception 'você não pode criar uma sala para outra pessoa';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para abrir a sala';
  end if;
  -- `bar_id` nulo é aceito (fluxos de teste/migração criam sala solta; o
  -- domínio real sempre passa p_bar_id). Quando informado, tem que ser do dono.
  if new.bar_id is not null and not exists (
    select 1 from public.bars b
     where b.id = new.bar_id and b.host_id = auth.uid()
  ) then
    raise exception 'bar não encontrado';
  end if;
  if not public.is_dev() and exists (
    select 1 from public.rooms r where r.host_id = auth.uid()
  ) then
    raise exception 'você já tem uma sala — cada dono tem um karaokê';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_guard_insert on public.rooms;
create trigger rooms_guard_insert
  before insert on public.rooms
  for each row execute function public.trg_rooms_guard_insert();

-- ---------------------------------------------------------------------------
-- 3. rooms: UPDATE não pode re-apontar a sala para um bar alheio
-- ---------------------------------------------------------------------------
-- 4º bypass: `rooms_update_host` exige `host_id = auth.uid()` nas duas pontas,
-- mas `bar_id` é livre. Bastava a dona da sala rodar
-- `update rooms set bar_id = <bar do dev>` para a sala aparecer no bar alheio.
create or replace function public.trg_rooms_guard_update()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    return new;
  end if;
  if new.host_id is distinct from old.host_id then
    raise exception 'você não pode transferir a posse da sala';
  end if;
  if new.bar_id is distinct from old.bar_id and new.bar_id is not null
     and not exists (
       select 1 from public.bars b
        where b.id = new.bar_id and b.host_id = auth.uid()
     ) then
    raise exception 'bar não encontrado';
  end if;
  return new;
end;
$$;

drop trigger if exists rooms_guard_update on public.rooms;
create trigger rooms_guard_update
  before update of bar_id, host_id on public.rooms
  for each row execute function public.trg_rooms_guard_update();
