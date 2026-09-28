-- Smoke do fix `20260928000033_profiles_public_invoker` (Advisor lint 0010).
--
-- Prova que a view `profiles_public` deixou de ser `security definer` e que o
-- e-mail continua intocável pelas roles da API, sem depender de `set role`
-- (não disponível no contexto da Management API). Checagens de catálogo, todas
-- determinísticas:
--   1. a view está `security_invoker = true`;
--   2. `anon` NÃO tem SELECT na coluna `profiles.email`;
--   3. `authenticated` NÃO tem SELECT em `profiles.email`;
--   4. `anon`/`authenticated` têm SELECT em `profiles.id/name/avatar_url`;
--   5. a policy `profiles_select_public` existe (SELECT para todas as linhas)
--      e a antiga "só o próprio" foi removida;
--   6. dono (postgres) continua lendo a tabela inteira (as RPCs definer só
--      funcionam assim).
--
-- Rodar: `node scripts/apply-sql.mjs scripts/smoke-profiles-public.sql`
-- (o relatório sai em `relatorio`).
create temporary table smoke_profiles (
  passo text primary key,
  ok boolean not null,
  obs text
) on commit drop;

insert into smoke_profiles (passo, ok, obs)
select '01 view invoker',
       coalesce(array_to_string(reloptions, ','), '') ilike '%security_invoker=true%',
       coalesce(array_to_string(reloptions, ','), '(none)')
from pg_class
where relname = 'profiles_public' and relkind = 'v';

insert into smoke_profiles (passo, ok, obs)
select '02 anon sem email',
       not has_column_privilege('anon', 'public.profiles', 'email', 'select'),
       has_column_privilege('anon', 'public.profiles', 'email', 'select')::text
where exists (select 1 from pg_class where relname = 'profiles_public');

insert into smoke_profiles (passo, ok, obs)
select '03 authenticated sem email',
       not has_column_privilege('authenticated', 'public.profiles', 'email', 'select'),
       has_column_privilege('authenticated', 'public.profiles', 'email', 'select')::text
where exists (select 1 from pg_class where relname = 'profiles_public');

insert into smoke_profiles (passo, ok, obs)
select '04 anon le nome/avatar',
       has_column_privilege('anon', 'public.profiles', 'name', 'select')
       and has_column_privilege('anon', 'public.profiles', 'avatar_url', 'select')
       and has_column_privilege('anon', 'public.profiles', 'id', 'select'),
       'name/avatar_url/id'
where exists (select 1 from pg_class where relname = 'profiles_public');

insert into smoke_profiles (passo, ok, obs)
select '05 authenticated le nome/avatar',
       has_column_privilege('authenticated', 'public.profiles', 'name', 'select')
       and has_column_privilege('authenticated', 'public.profiles', 'avatar_url', 'select')
       and has_column_privilege('authenticated', 'public.profiles', 'id', 'select'),
       'name/avatar_url/id'
where exists (select 1 from pg_class where relname = 'profiles_public');

insert into smoke_profiles (passo, ok, obs)
select '06 policy select_public presente',
       exists (select 1 from pg_policies
               where tablename = 'profiles' and policyname = 'profiles_select_public'),
       coalesce((select policyname || ' using=' || coalesce(qual, '(todas as linhas)')
                 from pg_policies where tablename = 'profiles' and policyname = 'profiles_select_public'
                 and cmd = 'SELECT'), '(ausente)');

insert into smoke_profiles (passo, ok, obs)
select '06b select_own removida',
       not exists (select 1 from pg_policies
                   where tablename = 'profiles' and policyname = 'profiles_select_own'),
       coalesce((select string_agg(distinct policyname, ', ') from pg_policies
                 where tablename = 'profiles' and cmd = 'SELECT'), '(lista vazia)');

insert into smoke_profiles (passo, ok, obs)
select '07 dono (postgres) le a tabela inteira',
       (select count(*) > 0 from public.profiles),
       (select 'linhas= ' || count(*)::text from public.profiles);

insert into smoke_profiles (passo, ok, obs)
select '08 view continua retornando nome',
       (select count(*) > 0 from public.profiles_public),
       (select 'linhas_public= ' || count(*)::text from public.profiles_public);

select jsonb_object_agg(passo, jsonb_build_object('ok', ok, 'obs', obs) order by passo)
  as relatorio
from smoke_profiles;