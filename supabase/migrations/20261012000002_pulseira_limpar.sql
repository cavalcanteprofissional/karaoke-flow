-- Item 5 da validação no aparelho — desligar a pulseira apaga os códigos e os
-- acessos gerados.
--
-- Antes, o interruptor mestre (`bars.pulseiras_ativadas`) só setava o flag: os
-- códigos gerados (`pulseiras_codigos`) e os acessos ativos
-- (`pulseiras_acessos`) ficavam no banco. Ao religar a pulseira, códigos velhos
-- baseados em preços antigos voltariam a valer — o host não tinha como "começar
-- do zero" pelo switch.
--
-- A RLS de `pulseiras_codigos`/`pulseiras_acessos` só tem SELECT para o dono,
-- então a limpeza precisa de uma RPC `security definer` host-only: o toggle e a
-- limpeza viram UMA transação (nunca desliga sem limpar, nem limpa sem desligar).
-- As faixas de valor (`pulseiras_precos`) ficam — são configuração, não registro.

drop function if exists public.set_pulseiras_ativadas(uuid, boolean);
create or replace function public.set_pulseiras_ativadas(
  p_bar_id uuid,
  p_ativadas boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = public, pg_catalog
as $$
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if not public.is_bar_host(p_bar_id, auth.uid()) then
    raise exception 'bar não encontrado';
  end if;

  update public.bars
     set pulseiras_ativadas = coalesce(p_ativadas, false)
   where id = p_bar_id;

  -- Item 5: desligar limpa os códigos gerados e os acessos ativos.
  if not coalesce(p_ativadas, false) then
    delete from public.pulseiras_acessos where bar_id = p_bar_id;
    delete from public.pulseiras_codigos where bar_id = p_bar_id;
  end if;
end;
$$;

revoke all on function public.set_pulseiras_ativadas(uuid, boolean) from public;
grant execute on function public.set_pulseiras_ativadas(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';
