-- Leitura das contas de Auth para o diagnóstico de `scripts/inspect-users.mjs`.
--
-- POR QUE ESTA CONSULTA EXISTE: `auth.admin.listUsers` devolve `identidades: []`
-- nesta versão do GoTrue (Supabase 2.116 / GoTrue atual), mesmo para usuários que
-- acabaram de entrar. Confiar nesse campo fez o primeiro diagnóstico mentir —
-- acusou "o dono não tem identidade email" numa conta que tem. A única fonte de
-- verdade é a tabela `auth.identities`, e ela não é exposta pela Data API, então
-- o script a lê por aqui (Management API, roda como postgres).
--
-- READ-ONLY. Devolve uma linha por usuário, com as identidades agregadas.

select
  u.id::text                                        as user_id,
  left(u.id::text, 8)                               as id_curto,
  coalesce(u.email, null)                           as email,
  u.email_confirmed_at                              as confirmado_em,
  u.created_at                                      as criado_em,
  u.last_sign_in_at                                 as ultimo_login_em,
  coalesce(u.is_anonymous, (u.raw_app_meta_data ->> 'is_anonymous')::boolean, false)
                                                     as anonimo,
  coalesce(
    (
      select json_agg(
               json_build_object(
                 'provider', i.provider,
                 'provider_id', i.provider_id::text
               )
               order by i.provider
             )
        from auth.identities i
       where i.user_id = u.id
    ),
    '[]'::json
  )                                                 as identidades
from auth.users u
order by u.created_at;