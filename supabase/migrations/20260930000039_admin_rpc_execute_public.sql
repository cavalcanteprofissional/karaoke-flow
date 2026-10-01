-- Fase 8c·C — follow-up da 00038: EXECUTE das RPCs host-only.
--
-- O QUE ESTE ARQUIVO FECHA
-- A 00038 revogou `EXECUTE` de `anon` nas três RPCs `admin_*`. Medindo depois
-- de aplicada, o `anon` continuava com `EXECUTE` = true. O motivo é o default do
-- PostgreSQL: `CREATE FUNCTION` dá `EXECUTE` para `PUBLIC`, e `PUBLIC` vale
-- para TODO papel — inclusive `anon`. `REVOKE ... FROM anon` tira o privilégio
-- nominal de `anon`, não o efetivo, porque o caminho que sobra é o `PUBLIC`.
--
--   select papel, has_function_privilege(papel, 'public.admin_set_room_youtube_api_key(uuid,text)', 'execute')
--     from (values ('anon'), ('authenticated'), ('service_role')) v(papel);
--   -- anon          | true   <-- o que a 00038 achou que tinha revogado
--   -- authenticated | true
--   -- service_role  | true
--
-- Por que isso importa mesmo com nada vazando hoje: as três funções se
-- defendem por CÓDIGO (`is_host(p_room_id, auth.uid())`, e `auth.uid()` é
-- NULO para anon, o que barra). Ou seja, a proteção real é o `if`, não a ACL —
-- exatamente a forma de "segurança que parece existir mas é code check" que esta
-- auditoria existe para caçar. Se amanhã alguém adicionar uma `admin_*` nova e
-- esquecer o `if`, o `anon` já está com o caminho aberto. Defence in depth que
-- não está no lugar não é defence in depth.
--
-- ESCOPO DELES, E O QUE FICOU DE FORA
-- As três `admin_*` são as que carregam segredo (`player_token` do link da TV e
-- `youtube_api_key` do dono da sala), e são o alvo desta auditoria (F1/F2). O
-- app chama as três com o client do USUÁRIO (`authenticated`), então nada de
-- produto muda. `service_role` recebe o `EXECUTE` explícito para o backoffice/
-- ferramenta de operação continuar alcança-las depois que o `PUBLIC` sai.
--
-- A MEDIÇÃO COMPLETA (2026-10-02) é: as 40 funções do schema `public` deste
-- projeto herdam `EXECUTE` de `PUBLIC`, porque nenhuma migration anterior mexeu
-- no default de ACL de função. Fechar as 37 restantes exige inventário de quais
-- papéis chamam quais funções no app — revogar às cegas quebra produto de um
-- jeito que o smoke não pega. Isso fica como item medido no relatório
-- `docs/engenharia/auditoria-rls.md`, não como guess neste arquivo.
--
-- O smoke ganhou o caso H4 (`has_function_privilege('anon', ...) = false`) para
-- a propriedade não depender de alguém lembrar.

-- A 00038 já criou as funções; aqui só o privilégio de execução.
revoke execute on function public.admin_get_room_player_token(uuid) from public;
revoke execute on function public.admin_get_room_youtube_api_key(uuid) from public;
revoke execute on function public.admin_set_room_youtube_api_key(uuid, text) from public;

grant execute on function public.admin_get_room_player_token(uuid) to authenticated;
grant execute on function public.admin_get_room_youtube_api_key(uuid) to authenticated;
grant execute on function public.admin_set_room_youtube_api_key(uuid, text) to authenticated;
grant execute on function public.admin_get_room_player_token(uuid) to service_role;
grant execute on function public.admin_get_room_youtube_api_key(uuid) to service_role;
grant execute on function public.admin_set_room_youtube_api_key(uuid, text) to service_role;

comment on function public.admin_get_room_player_token(uuid) is
  'Host-only: devolve o player_token (credencial do link da TV). '
  'EXECUTE só para authenticated/service_role; o `if` interno valida o vínculo.';
comment on function public.admin_get_room_youtube_api_key(uuid) is
  'Host-only: devolve a youtube_api_key da sala. Nunca passa pelo browser. '
  'EXECUTE só para authenticated/service_role; o `if` interno valida o vínculo.';
comment on function public.admin_set_room_youtube_api_key(uuid, text) is
  'Host-only: grava a youtube_api_key da sala. '
  'EXECUTE só para authenticated/service_role; o `if` interno valida o vínculo.';
