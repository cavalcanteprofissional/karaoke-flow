-- Fix do aviso do Supabase Advisor (lint `0010 security definer view`):
-- `profiles_public` foi criada com `security_invoker = false` (definer), mas é
-- alcançável pela Data API (auto-grant de `anon`/`authenticated`), então as
-- consultas rodavam como o DONO (postgres) e IGNORAVAM a RLS de `profiles`.
-- Isso não vazava e-mail (a view só seleciona id/name/avatar_url), porém o padrão
-- é frágil: qualquer coluna sensível futura na tabela vazaria junto sem aviso.
--
-- Fix (Opção 1): a view passa a `security_invoker = true`; a exposição fica
-- explícita e limitada às colunas id/nome/avatar_url (nunca e-mail). As roles da
-- API perdem o SELECT genérico na tabela — `select email ...` como anon/
-- authenticated passa a falhar com permission denied — e a policy vira
-- `using(true)` para manter o comportamento externo idêntico ao de antes
-- (nome/avatar de qualquer usuário, como a UI de "quem pediu" precisa).
--
-- Requer PostgreSQL 15+ (ok). As RPCs `security definer` que leem a view
-- (ex.: `get_player_state`) rodam como postgres e continuam funcionando.

alter view public.profiles_public set (security_invoker = true);

-- Roles da API: remove o SELECT genérico (que daria acesso a `email`)…
revoke select on public.profiles from anon, authenticated;
-- …e concede somente o que a UI realmente exibe.
grant select (id, name, avatar_url) on public.profiles to anon, authenticated;

-- Em vez de "só o próprio" (que faria a view devolver vazio para a API), o
-- SELECT expõe todas as linhas — mas só nas 3 colunas concedidas acima.
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles
  for select
  using (true);

-- insert/update/delete continuam restritos ao próprio usuário (políticas
-- "profiles_insert_own" / "profiles_update_own" / "profiles_delete_own").