-- Criação atômica do bar (Fase 3.5): perfil do host (1:1) + mesas 1..N +
-- a sala/karaokê única (multi-sala desabilitado). Tudo em uma transação:
-- ou cria completo, ou não cria nada.
-- Exige sessão NÃO-anônima (host = login real).
create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[] default null
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
  v_n int;
begin
  if auth.uid() is null then
    raise exception 'não autenticado';
  end if;
  if coalesce(auth.jwt() ->> 'is_anonymous', 'false') = 'true' then
    raise exception 'crie uma conta para criar o seu bar';
  end if;
  if coalesce(btrim(p_nome), '') = '' then
    raise exception 'informe o nome do bar';
  end if;
  if p_quantidade_mesas < 1 or p_quantidade_mesas > 999 then
    raise exception 'quantidade de mesas inválida (1–999)';
  end if;

  v_bar_code := public.generate_bar_code();
  v_room_code := public.generate_room_code();

  insert into public.bars (
    id, host_id, code, nome, cidade, endereco, quantidade_mesas
  )
  values (
    v_bar_id,
    auth.uid(),
    v_bar_code,
    btrim(p_nome),
    nullif(btrim(coalesce(p_cidade, '')), ''),
    nullif(btrim(coalesce(p_endereco, '')), ''),
    p_quantidade_mesas
  );

  -- Mesas 1..N; p_rotulos[i] é o rótulo da mesa i+1 (opcional).
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

  -- Sala/karaokê única do bar (default 1).
  insert into public.rooms (id, bar_id, code, host_id)
  values (v_room_id, v_bar_id, v_room_code, auth.uid());

  bar_id := v_bar_id;
  bar_code := v_bar_code;
  room_id := v_room_id;
  room_code := v_room_code;
  return next;
end;
$$;