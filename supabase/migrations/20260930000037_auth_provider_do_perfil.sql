-- 20260930000037_auth_provider_do_perfil.sql
--
-- `profiles.auth_provider` gravava 'email' para TODO mundo, inclusive para a
-- conta do dono do projeto, que só tem identidade GitHub.
--
-- Causa: `handle_new_user()` lia o provedor de
-- `new.raw_user_meta_data ->> 'provider'`, mas o GoTrue NÃO coloca `provider`
-- ali no OAuth — o payload do GitHub/Google tem `iss`, `sub`, `name`,
-- `user_name`, `avatar_url`, `provider_id`… e o `provider` fica em
-- `raw_app_meta_data`. Ou seja, o `coalesce` caía sempre no default 'email'.
--
-- O campo é metadata de exibição (não é usado em decisão de auth nem de RLS),
-- mas estava errado e feeding a UI errada. Corrige a função e faz backfill.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  insert into public.profiles (id, name, email, avatar_url, auth_provider)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(coalesce(new.email, 'usuário'), '@', 1)
    ),
    new.email,
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture'),
    -- `raw_app_meta_data` é onde o GoTrue realmente marca o provedor
    -- (github/google/email/anonymous). O `raw_user_meta_data` fica como
    -- fallback para installs antigos, e 'email' como último recurso.
    coalesce(
      new.raw_app_meta_data ->> 'provider',
      new.raw_user_meta_data ->> 'provider',
      'email'
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Backfill das linhas já existentes (o trigger só roda em INSERT de auth.users).
update public.profiles p
   set auth_provider = coalesce(
         (select u.raw_app_meta_data ->> 'provider' from auth.users u where u.id = p.id),
         p.auth_provider
       )
 where p.auth_provider is distinct from coalesce(
         (select u.raw_app_meta_data ->> 'provider' from auth.users u where u.id = p.id),
         p.auth_provider
       );
