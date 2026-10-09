-- Fase 18 — pulseira: ingresso de uso único por bar, com hora de validade e
-- faixa de valor opcional.
--
-- O QUE É UMA PULSEIRA
-- O host liga o recurso numa tela própria (`/salas/[codigo]/pulseiras`), gera
-- um lote de códigos de 6 caracteres (1–100) e imprime um QR para cada código.
-- Quem quer cantar ativa a pulseira (RPC `resgatar_pulseira`) escaneando o QR
-- ou digitando o código. A partir daí o pedido de música é liberado por 24h.
--
-- AS REGRAS (decisões da Fase 18, registradas no TODO):
--  1. Uso único e vencível. `usado_em` deixa o código morto para sempre — não há
--     caminho de reset (tampouco de edição): quem ativou, ativou. `expira_em`
--     nasce `now() + 24h` junto com o código, então geração e validade nascem
--     juntas e nada as descola.
--  2. O ACESSO (a pulseira no pulso), não o código, dura 24h: `acesso_ate` é
--     gravado no resgate, fixo dali em diante. O resgate congela o preço vigente
--     da hora (`preco_centavos` na linha de acesso) — quem resgatou "na cara"
--     paga aquele valor, mesmo que o cartaz mude no meio da noite.
--  3. Um usuário = uma pulseira por bar: `unique (bar_id, user_id)`. Reintentar
--     com acesso vigente volta "você já tem acesso a este bar". Acesso expirado
--     (as 24h passaram) pode ser renovado com um código novo.
--  4. Host isento: quem é dono da SALA (não de todas) não precisa de pulseira
--     para pedir música. A RLS continua intacta — quem não é dono é barrado
--     antes da trigger pensar em existir.
--  5. Anônimo não resgata: o resgate precisa de conta real. Relembramos que o
--     `signInAnonymously` tem `/entrar` liberado (PROTECTED_PREFIXES tem a rota,
--     mas o login anônimo passa), então a checagem de `is_anonymous` precisa ser
--     EXPLÍCITA aqui — não existe "sessão" em que vazar.
--  6. Valores são um CARTÁVEL: quando `pulseiras_precos` está vazio o resgate
--     funciona sem cobrança (`preco_centavos` nulo no acesso). Não existe
--     cobrança real nesta fase — o preço é referência para o cartaz e para o
--     host enxergar "o que vendeu".
--  7. O gate de cantar mora NO BANCO: trigger `BEFORE INSERT` em `queue_items`.
--     Esconder botão não é regra (mesma decisão das migrations 20261003000041 e
--     20261004000042) — qualquer insert autenticado direto passa pela trigger.
--
-- GEOGRAFIA DO HORÁRIO
-- As faixas de preço dizem "segunda, 18:00–20:00, R$ 10". O servidor Supabase
-- roda em UTC, mas o bar é do dono — interpretar o horário no fuso do servidor
-- mudava a faixa conforme o deploy. As funções desta fase calculam o horário em
-- `America/Sao_Paulo` (o karaokê é do Brasil), com `extract(dow ...)` = domingo
-- 0 … sábado 6, casando com `dia_semana` da tabela.
--
-- O QUE NÃO MUDA: RLS em endo e as phases anteriores seguem — `pulseiras_precos`
-- é público para autenticados (o cartaz se lê na rua), mas nada disso é escrito
-- por policy; escrever é só via RPC `security definer`, dono do bar.

-- ---------------------------------------------------------------------------
-- 0) `btree_gist` para a constraint de faixas que não se sobrepõem
-- ---------------------------------------------------------------------------
create extension if not exists btree_gist;

-- ---------------------------------------------------------------------------
-- 1) O interruptor do bar: `bars.pulseiras_ativadas`
-- ---------------------------------------------------------------------------
alter table public.bars add column if not exists pulseiras_ativadas boolean not null default false;

comment on column public.bars.pulseiras_ativadas is
  'Interruptor mestre da pulseira no bar. ON desbloqueia a tela do host e o cartaz público, e torna a trigger de que pede música a parede de verdade.';

-- ---------------------------------------------------------------------------
-- 2) Tabelas
-- ---------------------------------------------------------------------------

-- Os códigos impressos no balcão. O código É o ingresso: não há PK pública e a
-- coluna só sai do banco pela folha do host ou pelo QR.
create table if not exists public.pulseiras_codigos (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id) on delete cascade,
  codigo text not null,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_por uuid references auth.users (id) on delete set null,
  usado_em timestamptz,
  constraint pulseiras_codigos_por_bar unique (bar_id, codigo),
  constraint pulseiras_codigos_janela check (expira_em > criado_em)
);

comment on table public.pulseiras_codigos is
  'Os ingressos impressos do bar. Usado_em desarma o código para sempre (decisão 1): não há hoje rota de reuso.';

create table if not exists public.pulseiras_acessos (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  resgatado_em timestamptz not null default now(),
  acesso_ate timestamptz not null,
  preco_centavos int check (preco_centavos is null or preco_centavos >= 0),
  constraint pulseiras_acessos_um_por_pessoa unique (bar_id, user_id),
  constraint pulseiras_acessos_janela check (acesso_ate > resgatado_em)
);

comment on table public.pulseiras_acessos is
  'A pulseira no pulso: quem resgatou, quando, até quando e quanto o cartaz cobrava na hora (congelado).';

create table if not exists public.pulseiras_precos (
  id uuid primary key default gen_random_uuid(),
  bar_id uuid not null references public.bars (id) on delete cascade,
  dia_semana int not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  preco_centavos int not null check (preco_centavos >= 0),
  constraint pulseiras_precos_faixas_validas check (hora_inicio < hora_fim)
);

comment on table public.pulseiras_precos is
  'Faixas de valor por dia da semana (0=domingo … 6=sábado). Vazio = sem cartaz = resgate sem cobrança.';

-- Faixas da mesma casa/dia não podem se sobrepor (exclusão gist, intervalos
-- semiabertos [início, fim)). `btree_gist` habilita o `=` de uuid/int; o `&&`
-- de range é gist do core. Não existe `timerange` no PostgreSQL: as horas são
-- ancoradas num dia fixo e comparadas como `tsrange` (o `+` de date+time dá
-- timestamp; `24:00` vira o "amanhã 00:00" do mesmo intervalo, excluído).
alter table public.pulseiras_precos
  drop constraint if exists pulseiras_precos_sem_sobreposicao;
alter table public.pulseiras_precos
  add constraint pulseiras_precos_sem_sobreposicao
  exclude using gist (
    bar_id with =,
    dia_semana with =,
    tsrange(date '1970-01-01' + hora_inicio, date '1970-01-01' + hora_fim) with &&
  );

-- ---------------------------------------------------------------------------
-- 3) RLS
-- ---------------------------------------------------------------------------
alter table public.pulseiras_codigos enable row level security;
alter table public.pulseiras_acessos enable row level security;
alter table public.pulseiras_precos enable row level security;

-- Código é segredo: só o dono do bar lê a própria coleção.
drop policy if exists "pulseiras_codigos_select_host" on public.pulseiras_codigos;
create policy "pulseiras_codigos_select_host" on public.pulseiras_codigos
  for select to authenticated
  using (public.is_bar_host(bar_id, auth.uid()));

-- Acesso: o próprio e o do bar (o host vê a ocupação, se quiser).
drop policy if exists "pulseiras_acessos_select_own" on public.pulseiras_acessos;
create policy "pulseiras_acessos_select_own" on public.pulseiras_acessos
  for select to authenticated
  using (user_id = auth.uid());

drop policy if exists "pulseiras_acessos_select_host" on public.pulseiras_acessos;
create policy "pulseiras_acessos_select_host" on public.pulseiras_acessos
  for select to authenticated
  using (public.is_bar_host(bar_id, auth.uid()));

-- Cartaz público: qualquer autenticado lê os valores. Escrita só por RPC.
drop policy if exists "pulseiras_precos_select_authenticated" on public.pulseiras_precos;
create policy "pulseiras_precos_select_authenticated" on public.pulseiras_precos
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 4) Geração de código de 6 chars do alfabeto do bar (sem I/O/1/0)
-- ---------------------------------------------------------------------------
create or replace function public.generate_pulseira_code(p_bar_id uuid)
returns text
language plpgsql
volatile
set search_path = public, pg_catalog
as $$
declare
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    end loop;
    exit when not exists (
      select 1 from public.pulseiras_codigos
      where bar_id = p_bar_id and codigo = v_code
    );
  end loop;
  return v_code;
end;
$$;

-- Uso interno das RPCs security definer; ninguém chama direto (gerar fora de um
-- lote não imprime nada nem liga nada — e a folha de QR é de responsabilidade da
-- tela do host).
revoke all on function public.generate_pulseira_code(uuid) from public;

-- ---------------------------------------------------------------------------
-- 5) RPCs do host (security definer, sempre `is_bar_host` antes de escrever)
-- ---------------------------------------------------------------------------

-- Lote de códigos: 1–100, cada um com 24h de validade a partir de agora.
create or replace function public.gerar_pulseiras(p_bar_id uuid, p_qtd int default 10)
returns int
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_n int;
  v_criadas int := 0;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if not public.is_bar_host(p_bar_id, auth.uid()) then
    raise exception 'bar não encontrado';
  end if;
  if p_qtd is null or p_qtd < 1 or p_qtd > 100 then
    raise exception 'quantidade de pulseiras inválida (1–100)';
  end if;
  for v_n in 1..p_qtd loop
    insert into public.pulseiras_codigos (bar_id, codigo, expira_em)
    values (p_bar_id, public.generate_pulseira_code(p_bar_id), now() + interval '24 hours');
    v_criadas := v_criadas + 1;
  end loop;
  return v_criadas;
end;
$$;

comment on function public.gerar_pulseiras(uuid, int) is
  'Gera um lote de códigos de pulseira (1–100). Só o dono do bar; cada código vale 24h a partir de agora.';

revoke all on function public.gerar_pulseiras(uuid, int) from public;
grant execute on function public.gerar_pulseiras(uuid, int) to authenticated;

-- Cria ou atualiza uma faixa de valor. `p_inicio`/`p_fim` vêm como text (HH:MM)
-- para o PostgREST não brigar com o tipo `time`.
create or replace function public.upsert_preco_pulseira(
  p_bar_id uuid,
  p_dia_semana int,
  p_inicio text,
  p_fim text,
  p_preco_centavos int
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_inicio time;
  v_fim time;
  v_existente uuid;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if not public.is_bar_host(p_bar_id, auth.uid()) then
    raise exception 'bar não encontrado';
  end if;
  if p_dia_semana is null or p_dia_semana < 0 or p_dia_semana > 6 then
    raise exception 'dia da semana inválido (0=domingo … 6=sábado)';
  end if;
  if p_preco_centavos is null or p_preco_centavos < 0 then
    raise exception 'preço inválido';
  end if;
  begin
    v_inicio := p_inicio::time;
    v_fim := p_fim::time;
  exception when others then
    raise exception 'horário inválido (use HH:MM)';
  end;
  if v_inicio >= v_fim then
    raise exception 'o fim da faixa precisa ser depois do início';
  end if;

  select id into v_existente
  from public.pulseiras_precos
  where bar_id = p_bar_id and dia_semana = p_dia_semana and hora_inicio = v_inicio;

  begin
    if v_existente is null then
      insert into public.pulseiras_precos (bar_id, dia_semana, hora_inicio, hora_fim, preco_centavos)
      values (p_bar_id, p_dia_semana, v_inicio, v_fim, p_preco_centavos);
    else
      update public.pulseiras_precos
      set hora_fim = v_fim, preco_centavos = p_preco_centavos
      where id = v_existente;
    end if;
  exception when exclusion_violation then
    raise exception 'já existe uma faixa de valor sobreposta neste dia';
  end;
end;
$$;

revoke all on function public.upsert_preco_pulseira(uuid, int, text, text, int) from public;
grant execute on function public.upsert_preco_pulseira(uuid, int, text, text, int) to authenticated;

create or replace function public.remover_preco_pulseira(
  p_bar_id uuid,
  p_dia_semana int,
  p_inicio text
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_inicio time;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if not public.is_bar_host(p_bar_id, auth.uid()) then
    raise exception 'bar não encontrado';
  end if;
  begin
    v_inicio := p_inicio::time;
  exception when others then
    raise exception 'horário inválido (use HH:MM)';
  end;
  delete from public.pulseiras_precos
  where bar_id = p_bar_id and dia_semana = p_dia_semana and hora_inicio = v_inicio;
end;
$$;

revoke all on function public.remover_preco_pulseira(uuid, int, text) from public;
grant execute on function public.remover_preco_pulseira(uuid, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6) O valor do MOMENTO: faixa que cobre agora, no fuso do bar (São Paulo)
-- ---------------------------------------------------------------------------
create or replace function public.preco_vigente(p_bar_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_local timestamp;
  v_dia int;
  v_hora time;
  v_preco int;
begin
  -- Uma única leitura de relógio: `dia` e `hora` vêm do mesmo instante, então a
  -- meia-noite não divide a resposta entre dois dias.
  v_local := now() at time zone 'America/Sao_Paulo';
  v_dia := extract(dow from v_local)::int;
  v_hora := v_local::time;

  select p.preco_centavos into v_preco
  from public.pulseiras_precos p
  where p.bar_id = p_bar_id
    and p.dia_semana = v_dia
    and p.hora_inicio <= v_hora
    and p.hora_fim > v_hora
  order by p.hora_inicio desc
  limit 1;
  return v_preco;
end;
$$;

revoke all on function public.preco_vigente(uuid) from public;
grant execute on function public.preco_vigente(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 7) resgatar_pulseira: a pulseira vai pro pulso (uso único, 24h, preço véu)
-- ---------------------------------------------------------------------------
create or replace function public.resgatar_pulseira(p_bar_id uuid, p_codigo text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_anon boolean := coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true';
  v_bar public.bars%rowtype;
  v_code public.pulseiras_codigos%rowtype;
  v_existente public.pulseiras_acessos%rowtype;
  v_preco int;
  v_ate timestamptz;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'code', 'UNAUTHENTICATED',
      'message', 'faça login para usar a pulseira');
  end if;
  -- Conta real, não anônima (decisão 5): checagem explícita, porque o JWT
  -- anônimo chega até aqui.
  if v_anon then
    return jsonb_build_object('ok', false, 'code', 'ANONYMOUS',
      'message', 'crie uma conta para usar a pulseira');
  end if;

  select * into v_bar from public.bars where id = p_bar_id;
  if not found then
    return jsonb_build_object('ok', false, 'code', 'BAR_NOT_FOUND',
      'message', 'bar não encontrado');
  end if;
  if not v_bar.pulseiras_ativadas then
    return jsonb_build_object('ok', false, 'code', 'PULSEIRA_INATIVA',
      'message', 'este bar não está usando pulseiras agora');
  end if;

  select * into v_existente from public.pulseiras_acessos
  where bar_id = p_bar_id and user_id = v_uid;
  if found and v_existente.acesso_ate > now() then
    return jsonb_build_object('ok', false, 'code', 'JA_TEM_ACESSO',
      'message', 'você já tem acesso a este bar',
      'acesso_ate', v_existente.acesso_ate);
  end if;

  if coalesce(btrim(p_codigo), '') = '' then
    return jsonb_build_object('ok', false, 'code', 'CODIGO_INVALIDO',
      'message', 'digite o código da pulseira');
  end if;

  -- A linha do código serve de mutex: `for update` serializa dois resgates do
  -- mesmo código e o segundo volta "já usado".
  select * into v_code from public.pulseiras_codigos
  where bar_id = p_bar_id and codigo = upper(btrim(p_codigo))
  for update;

  if not found then
    return jsonb_build_object('ok', false, 'code', 'CODIGO_INVALIDO',
      'message', 'código de pulseira inválido');
  end if;
  if v_code.usado_em is not null then
    return jsonb_build_object('ok', false, 'code', 'CODIGO_USADO',
      'message', 'código de pulseira já usado');
  end if;
  if v_code.expira_em < now() then
    return jsonb_build_object('ok', false, 'code', 'CODIGO_EXPIRADO',
      'message', 'código de pulseira expirado — peça outro no balcão');
  end if;

  v_preco := public.preco_vigente(p_bar_id);
  v_ate := now() + interval '24 hours';

  update public.pulseiras_codigos
  set usado_por = v_uid, usado_em = now()
  where id = v_code.id;

  insert into public.pulseiras_acessos (bar_id, user_id, resgatado_em, acesso_ate, preco_centavos)
  values (p_bar_id, v_uid, now(), v_ate, v_preco)
  on conflict (bar_id, user_id) do update
    set resgatado_em = excluded.resgatado_em,
        acesso_ate = excluded.acesso_ate,
        preco_centavos = excluded.preco_centavos
    where public.pulseiras_acessos.acesso_ate <= now();

  return jsonb_build_object(
    'ok', true,
    'bar_id', p_bar_id,
    'nome', v_bar.nome,
    'preco_centavos', v_preco,
    'preco_pago', v_preco is not null and v_preco > 0,
    'acesso_ate', v_ate,
    'message', 'Pulseira ativa por 24 horas. Bom cantar!'
  );
end;
$$;

comment on function public.resgatar_pulseira(uuid, text) is
  'Ativa o código da pulseira para o usuário da sessão. Código de uso único; acesso de 24h com o preço vigente congelado; usuário anônimo recusado na porta.';

revoke all on function public.resgatar_pulseira(uuid, text) from public;
grant execute on function public.resgatar_pulseira(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 8) O status EFETIVO ganha a pulseira: member_entry_state
-- ---------------------------------------------------------------------------
-- Copia do corpo atual (migration 20261003000040) sem tocar em regra nenhuma —
-- só o `jsonb_build_object` ganha `pulseira_exigida`/`tem_pulseira`, lidos do
-- bar da sala e do acesso vigente. É a mesma função que a sala e a busca leem,
-- então a pulseira decide a mesma coisa em toda a UI.
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
  v_pulseira_exigida boolean := false;
  v_tem_pulseira boolean := false;
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

  if v_room.bar_id is not null then
    select b.pulseiras_ativadas into v_pulseira_exigida
    from public.bars b where b.id = v_room.bar_id;
    if v_pulseira_exigida then
      v_tem_pulseira := exists (
        select 1 from public.pulseiras_acessos pa
        where pa.bar_id = v_room.bar_id and pa.user_id = v_uid
          and pa.acesso_ate > now()
      );
    end if;
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
    'distancia_m', v_member.distancia_m,
    -- Fase 18: a casa usa pulseira e a pessoa está com a dela ativa agora.
    'pulseira_exigida', v_pulseira_exigida,
    'tem_pulseira', v_tem_pulseira
  );
end;
$$;

revoke all on function public.member_entry_state(uuid, uuid) from public;
grant execute on function public.member_entry_state(uuid, uuid) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8b) A preview de entrada também sabe se a casa usa pulseira
-- ---------------------------------------------------------------------------
-- Cópia do corpo atual (migration 20260924000021) com uma coluna a mais:
-- `pulseiras_ativadas`. A tela `/entrar` mostra o cartaz e o bloco de resgate a
-- partir DELE, sem outra query — a policy de `bars` só libera SELECT para o
-- dono/membro aprovado, e a pessoa ainda é visitante nesse momento.
drop function if exists public.get_entry_preview(text, int);
create or replace function public.get_entry_preview(p_code text, p_mesa int default null)
returns table (
  bar_id uuid,
  bar_code text,
  bar_nome text,
  bar_cidade text,
  quantidade_mesas int,
  bar_latitude numeric,
  bar_longitude numeric,
  bar_raio_permitido_metros int,
  pulseiras_ativadas boolean,
  room_id uuid,
  room_code text,
  host_id uuid,
  host_name text,
  entry_mode public.room_entry_mode,
  status public.room_status,
  mesa_numero int,
  mesa_rotulo text
)
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
declare
  v_bar public.bars%rowtype;
  v_room public.rooms%rowtype;
  v_host_name text;
  v_code text;
  v_rotulo text;
begin
  v_code := upper(btrim(p_code));
  if v_code = '' then
    raise exception 'código vazio';
  end if;

  -- 1) código de bar? senão 2) código de room (QR legado) → bar da room.
  select * into v_bar from public.bars where code = v_code;
  if not found then
    select * into v_room from public.rooms where code = v_code;
    if found then
      select * into v_bar from public.bars where id = v_room.bar_id;
    end if;
    if not found then
      raise exception 'bar não encontrado';
    end if;
  end if;

  -- Sala ativa do bar (multi-sala desabilitado: pré-seleciona a única ativa).
  select * into v_room
  from public.rooms
  where public.rooms.bar_id = v_bar.id
    and public.rooms.status = 'active'
  order by created_at
  limit 1;
  if not found then
    raise exception 'bar sem sala ativa';
  end if;

  select p.name into v_host_name from public.profiles p where p.id = v_room.host_id;

  bar_id := v_bar.id;
  bar_code := v_bar.code;
  bar_nome := v_bar.nome;
  bar_cidade := v_bar.cidade;
  quantidade_mesas := v_bar.quantidade_mesas;
  bar_latitude := v_bar.latitude;
  bar_longitude := v_bar.longitude;
  bar_raio_permitido_metros := v_bar.raio_permitido_metros;
  pulseiras_ativadas := v_bar.pulseiras_ativadas;
  room_id := v_room.id;
  room_code := v_room.code;
  host_id := v_room.host_id;
  host_name := coalesce(v_host_name, 'dono do bar');
  entry_mode := v_room.entry_mode;
  status := v_room.status;

  if p_mesa is not null then
    if p_mesa < 1 or p_mesa > v_bar.quantidade_mesas then
      raise exception 'mesa inválida';
    end if;
    select rotulo into v_rotulo
    from public.mesas
    where public.mesas.bar_id = v_bar.id
      and numero = p_mesa;
    if not found then
      raise exception 'mesa não existe';
    end if;
    mesa_numero := p_mesa;
    mesa_rotulo := v_rotulo;
  end if;

  return next;
end;
$$;

revoke all on function public.get_entry_preview(text, int) from public;
grant execute on function public.get_entry_preview(text, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 9) O gate de verdade: pedido de música exige pulseira
-- ---------------------------------------------------------------------------
-- A mesma ideia da `20261004000042`: a trigger roda como invólucro (sem
-- security definer), para o INSERT direto passar pela RLS normal. `KF002` é o
-- código novo desta fase — o app traduz para a mensagem certa.
create or replace function public.queue_items_exige_pulseira()
returns trigger
language plpgsql
set search_path = public, pg_catalog
as $$
declare
  v_bar_id uuid;
  v_ativadas boolean;
begin
  -- Sem sessão não há participante: seed/Management API passam direto.
  if auth.uid() is null then
    return new;
  end if;
  -- Dono da SALA: pulseira é para o público, host canta de graça.
  if public.is_host(new.room_id, auth.uid()) then
    return new;
  end if;

  select r.bar_id into v_bar_id from public.rooms r where r.id = new.room_id;
  if v_bar_id is null then
    return new;
  end if;

  select b.pulseiras_ativadas into v_ativadas
  from public.bars b where b.id = v_bar_id;
  if not coalesce(v_ativadas, false) then
    return new;
  end if;

  if not exists (
    select 1 from public.pulseiras_acessos pa
    where pa.bar_id = v_bar_id and pa.user_id = auth.uid()
      and pa.acesso_ate > now()
  ) then
    raise exception using
      errcode = 'KF002',
      message = 'Este bar exige pulseira para pedir música. Peça a sua no balcão e ative pelo QR ou pelo código.';
  end if;

  return new;
end;
$$;

comment on function public.queue_items_exige_pulseira() is
  'Barra INSERT em queue_items de quem não tem pulseira ativa com a casa em modo pulseira. Host isento na própria sala. Espelho em src/lib/rooms/spectator.ts:canRequestSongs.';

drop trigger if exists queue_items_exige_pulseira on public.queue_items;
create trigger queue_items_exige_pulseira
  before insert on public.queue_items
  for each row execute function public.queue_items_exige_pulseira();

revoke execute on function public.queue_items_exige_pulseira() from public;

-- ---------------------------------------------------------------------------
-- 10) create_bar com o interruptor de pulseira (obrigatório)
-- ---------------------------------------------------------------------------
-- Fase 17 colocou `create_bar` só com 9 argumentos; o interruptor passou a
-- fazer parte do contrato da criação — quem cria a casa decide, e a tela CAI
-- um campo obrigatório. Não há default: criar bar sem dizer o que quer da
-- pulseira é esquecer a decisão no ar, e o contrato (10 args) passa a exigir
-- deliberadamente. (O PostgreSQL não permite parâmetro sem default depois de
-- um com default — todos os 10 ficam obrigatórios, e o app sempre os passa
-- por nome.)
drop function if exists public.create_bar(
  text, text, text, int, text[], numeric, numeric, int, text
);

create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[],
  p_latitude numeric,
  p_longitude numeric,
  p_raio_permitido_metros int,
  p_codigo text,
  p_pulseiras_ativadas boolean
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
  -- Regra do produto (MANIFEST §5): o dono "é a casa". Quem não é dev fica com
  -- UM bar; o dev (a conta do dono do projeto) não tem esse teto.
  if not public.is_dev() and exists (
    select 1 from public.bars b where b.host_id = auth.uid()
  ) then
    raise exception 'você já tem um bar — cada dono tem uma casa';
  end if;
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'informe o nome do bar';
  end if;
  if p_quantidade_mesas < 1 or p_quantidade_mesas > 999 then
    raise exception 'quantidade de mesas inválida (1–999)';
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
    latitude, longitude, raio_permitido_metros, pulseiras_ativadas
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
    v_raio,
    coalesce(p_pulseiras_ativadas, false)
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
  text, text, text, int, text[], numeric, numeric, int, text, boolean
) to authenticated;

-- ---------------------------------------------------------------------------
-- Fim: recarrega o schema no PostgREST
-- ---------------------------------------------------------------------------
notify pgrst, 'reload schema';