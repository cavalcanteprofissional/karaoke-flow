-- Fase 8c·C — fecha F1..F6 da auditoria de RLS (`scripts/smoke-rls-audit.sql`).
--
-- O QUE ESTE ARQUIVO FECHA
-- A auditoria rodou 45 casos pela Data API com o papel `authenticated`/`anon` de
-- verdade (o `postgres` da Management API tem BYPASSRLS e passaria verde de
-- mentira). O resultado: 13/13 casos legítimos verdes, 8 vermelhos que eram os
-- defeitos. Este arquivo fecha os 6 defeitos; o alvo é o smoke 45/45.
--
--   F1 (alta) `rooms.youtube_api_key` sem ACL de coluna: a policy liberava a
--            LINHA inteira, então qualquer participante aprovado extraía a chave
--            de API do dono da sala. 0 salas com chave hoje — bomba armada.
--   F2 (méd) `rooms.player_token` idem: é a credencial do link da TV, e o
--            próprio repositório trata esse link como segredo (`scan:secrets`).
--   F3 (alta) `bars_select_authenticated` era `using (auth.uid() is not null)`:
--            qualquer logado lia nome, endereço e a COORDENADA de todos os bars.
--   F4 (méd) `mesas` com a mesma policy aberta (18 linhas de todos os bares) e
--            NENHUM consumidor no app: exposição pura.
--   F5 (méd) 60 `GRANT` de TRUNCATE/TRIGGER/REFERENCES a anon/authenticated em
--            tabelas públicas (10 tabelas × 2 papéis × 3 privilégios). TRUNCATE
--            não passa por RLS.
--   F6 (méd) `room_members_update_host` sem `with check`: o host reescreve o
--            `user_id` de um membro e transplanta a participação para outra
--            conta real. `with check is_host(...)` sozinho NÃO resolve — ele
--            acompanha a LINHA, não as COLUNAS.
--
-- A DECISÃO DE DESENHO QUE IMPORTA
-- RLS é por LINHA, então nenhuma policy consegue esconder uma coluna de um
-- participante e mostrá-la ao host: os dois são `authenticated`. A única forma
-- de "só o host" em nível de coluna é ACL de coluna + RPC `security definer`
-- que checa o vínculo dentro do banco. Daí a trio de funciones abaixo e a view
-- `rooms_public`, que substitui os `select *` do app (que quebrariam: `*`
-- expande para a coluna revogada e o banco responde `permission denied`).
--
-- O que NÃO muda: participação aprovada ainda lê a própria sala, o host ainda lê
-- o próprio bar, o participante ainda lê o bar DA SUA sala, e a fila anda como
-- antes. Os 13 casos legítimos do smoke existem exatamente para provar isso.
--
-- NOME DAS FUNÇÕES: prefixo `admin_`, para o PostgREST não expor (uma RPC de
-- nome adivinhável vira endpoint público). A política de EXECUÇÃO continua a
-- de antes — `authenticated` pode chamar; o que barra é o `raise` de quem não
-- é o host. `SECURITY DEFINER` sem `search_path` fixo seria herança de objeto
-- pública; todas usam `set search_path = public, pg_temp`.

-- ─────────────────────────────────────────────────────────────────────────────
-- F3 — `bars` só do próprio bar: o do bar que eu hospeda, ou o bar de uma sala
--       onde sou membro aprovado. Nome, endereço e coordenada de um bar em que a
--       pessoa nunca entrou saem de leitura.
-- ─────────────────────────────────────────────────────────────────────────────
-- Por que a policy anterior existia: a página da sala e a de busca leem
-- `.eq("id", room.bar_id)` para o raio/presença, e sem policy nenhuma a
-- navegação quebrava. O que faltava era o `where` do vínculo.
drop policy if exists "bars_select_authenticated" on public.bars;

create policy "bars_select_own_or_room_bar"
  on public.bars
  for select
  to authenticated
  using (
    host_id = auth.uid()
    or exists (
      select 1
        from public.rooms r
       where r.bar_id = bars.id
         and public.is_approved_member(r.id, auth.uid())
    )
  );

-- `anon` não tem policy de SELECT em `bars` desde o início (o smoke B1 já era
-- verde) e continua sem nenhuma: quem não tem sessão não recebe coordenada de
-- lugar nenhum.

-- ─────────────────────────────────────────────────────────────────────────────
-- F4 — `mesas`: o dono do bar. O app não lê `mesas` em lugar nenhum
--       (`grep from("mesas")` vazio), então o corte é por vínculo, não por
--       remoção — se um dia a casa gerenciar as mesas, a policy já está no
--       lugar e o grant continua.
-- ─────────────────────────────────────────────────────────────────────────────
drop policy if exists "mesas_select_authenticated" on public.mesas;

create policy "mesas_select_bar_host"
  on public.mesas
  for select
  to authenticated
  using (public.is_bar_host(bar_id, auth.uid()));

-- ─────────────────────────────────────────────────────────────────────────────
-- F1/F2 — as duas colunas sensíveis saem do alcance do cliente.
-- ─────────────────────────────────────────────────────────────────────────────
-- A policy de SELECT de `rooms` continua igual (host ou membro aprovado da
-- própria sala): quem era visível continua visível, nas 14 colunas inócuas. A
-- diferença é que estas duas deixam de existir para o papel `authenticated`.
--
-- A RECEITA, e por que ela é esta: `revoke select (coluna)` NÃO cancela um
-- `grant` de nível tabela. Medido neste projeto — a primeira versão deste
-- arquivo fazia só o revoke de coluna e o participante continuava lendo a
-- coluna sem erro nenhum (o smoke R4 ficaria verde só porque a coluna está
-- vazia no banco, que é exatamente o tipo de verde de mentira que a auditoria
-- existe para caçar). O caminho que funciona é o inverso: revoga o privilégio
-- de TABELA e concede de volta, COLUNA A COLUNA, só o que o cliente pode ler.
revoke select on public.rooms from anon, authenticated;
grant select (
  id,
  code,
  qr_code_url,
  host_id,
  entry_mode,
  queue_approval_mode,
  require_song_confirmation,
  status,
  created_at,
  bar_id,
  playback_status,
  current_item_id,
  current_item_started_at,
  pre_approval_24h
) on public.rooms to anon, authenticated;

-- UPDATE: as mesmas cinco colunas de configuração que o app já alterava
-- (`updateRoomSettingsAction` e a troca de código da sala). `youtube_api_key`
-- fica SEM UPDATE — passa a ser escrita só pela RPC host-only
-- `admin_set_room_youtube_api_key` (abaixo) — e `player_token` fica sem UPDATE
-- também, o que torna a `rotate_player_token` a ÚNICA pessoa que rotaciona o
-- link da TV. `bar_id` continua sem UPDATE direto: o vínculo sala↔bar é feito
-- pela RPC `create_room`, e o trigger `trg_rooms_guard_update` continua guarding.
revoke update on public.rooms from anon, authenticated;
grant update (
  code,
  entry_mode,
  queue_approval_mode,
  require_song_confirmation,
  pre_approval_24h
) on public.rooms to authenticated;

-- INSERT: nada no app insere em `rooms` — a sala nasce pela RPC
-- `create_room(p_bar_id, p_codigo)`, que é `security definer`. Sai inteiro.
revoke insert on public.rooms from anon, authenticated;

-- O EFEITO COLATERAL QUE ESTA RECEITA TEM, E COMO ELE É ABSORVIDO: com o
-- privilégio em nível de coluna, um `select *` em `rooms` passa a responder
-- `permission denied for table rooms` — o `*` expande para as colunas não
-- concedidas. O app lia `rooms` com `select *` em quatro lugares (dashboard ×2,
-- página da sala, página de busca), então a view abaixo entra no lugar deles.

-- A view que o app passa a ler no lugar de `rooms`. `security_invoker` (o mesmo
-- caminho de `profiles_public`, migration `00033`) deixa a RLS da tabela base
-- valendo para quem chama — a view não é atalho de privilégio. O ganho é
-- estrutural: um `select *` daqui não tem como alcançar o segredo, e coluna
-- nova em `rooms` não quebra nenhuma tela.
create or replace view public.rooms_public
with (security_invoker = true)
as
select
  id,
  code,
  qr_code_url,
  host_id,
  entry_mode,
  queue_approval_mode,
  require_song_confirmation,
  status,
  created_at,
  bar_id,
  playback_status,
  current_item_id,
  current_item_started_at,
  pre_approval_24h
from public.rooms;

grant select on public.rooms_public to anon, authenticated;

-- As duas getters host-only. Assinatura por `p_room_id` (e não por código)
-- porque é o que o app já tem em mãos na página da sala, e o que
-- `rotate_player_token` já usa.
create or replace function public.admin_get_room_player_token(p_room_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_token text;
begin
  if not public.is_host(p_room_id, auth.uid()) then
    raise exception 'você não é o dono desta sala'
      using errcode = '42501';
  end if;
  select player_token into v_token from public.rooms where id = p_room_id;
  return v_token;
end;
$$;

create or replace function public.admin_get_room_youtube_api_key(p_room_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  v_key text;
begin
  if not public.is_host(p_room_id, auth.uid()) then
    raise exception 'você não é o dono desta sala'
      using errcode = '42501';
  end if;
  select youtube_api_key into v_key from public.rooms where id = p_room_id;
  return v_key;
end;
$$;

-- O setter host-only. `updateYoutubeKeyAction` usava `update rooms set
-- youtube_api_key` com o client do usuário, que a revogação de coluna acima
-- quebraria. A escrita também valida o formato do mesmo jeito que a action
-- validava (1–200 caracteres), para o erro chegar em português do mesmo lugar.
create or replace function public.admin_set_room_youtube_api_key(
  p_room_id uuid,
  p_api_key text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = public, pg_temp
as $$
declare
  v_trimmed text := nullif(btrim(coalesce(p_api_key, '')), '');
begin
  if not public.is_host(p_room_id, auth.uid()) then
    raise exception 'você não é o dono desta sala'
      using errcode = '42501';
  end if;
  if v_trimmed is not null and (char_length(v_trimmed) > 200 or v_trimmed !~ '^[A-Za-z0-9_\-]+$') then
    raise exception 'chave do YouTube inválida'
      using errcode = '22023';
  end if;
  update public.rooms
     set youtube_api_key = v_trimmed
   where id = p_room_id;
  return true;
end;
$$;

grant execute on function public.admin_get_room_player_token(uuid) to authenticated;
grant execute on function public.admin_get_room_youtube_api_key(uuid) to authenticated;
grant execute on function public.admin_set_room_youtube_api_key(uuid, text) to authenticated;
revoke execute on function public.admin_get_room_player_token(uuid) from anon;
revoke execute on function public.admin_get_room_youtube_api_key(uuid) from anon;
revoke execute on function public.admin_set_room_youtube_api_key(uuid, text) from anon;

-- ─────────────────────────────────────────────────────────────────────────────
-- F6 — `room_members`: o host muda o `status`, e nada mais.
-- ─────────────────────────────────────────────────────────────────────────────
-- A trigger `room_members_sync_approved_at` é de LINHA (`new.approved_at := …`),
-- então continua rodando: ela não emite UPDATE e não depende de privilégio de
-- coluna. Nenhuma trigger precisa de trigger.
-- `mesa_numero` fica de fora de propósito: hoje só a action de entrada escreve
-- nela, e se um dia ela mudar, o banco avisa com `permission denied` em vez de
-- deixar passar em silêncio.
revoke update on public.room_members from anon, authenticated;
grant update (status) on public.room_members to authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- F5 — higiene de privilégio: TRUNCATE/TRIGGER/REFERENCES saem do schema
--       público para os dois papéis da Data API. 10 tabelas × 2 papéis = 60
--       concessões, e nenhuma delas é usada pelo app (é web, não psql).
-- ─────────────────────────────────────────────────────────────────────────────
revoke truncate, trigger, references on all tables in schema public from anon, authenticated;

-- E o mesmo para o que vier depois, senão a próxima tabela nasce com os 6
-- privilégios de novo (é assim que as 60 foram se acumulando).
alter default privileges in schema public
  revoke truncate, trigger, references on tables from anon, authenticated;
