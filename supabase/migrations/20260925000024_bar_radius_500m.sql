-- Fase 5/6 do produto: raio de presença do bar passa de 150 m para 500 m.
--
-- Contexto (2026-09-25): o gate de presença física barra o participante que
-- estiver fora do raio em **qualquer** modo de entrada — inclusive com
-- `entry_mode = open` (entrada livre). A tela de configurações da sala passa a
-- avisar isso e a mostrar o raio no mapa; a personalização pelo host fica
-- bloqueada nesta entrega, com o valor padrão (500 m) visível e desabilitado.
--
-- O `check` 50..1000 continua valendo (migration 20260923000015): 500 m está
-- dentro da faixa. Bars existentes também vão para 500 m, então o raio efetivo
-- do gate muda junto e a tela continua dizendo a mesma coisa que o banco.

alter table public.bars
  alter column raio_permitido_metros set default 500;

update public.bars
set raio_permitido_metros = 500
where raio_permitido_metros <> 500;

-- `drop function` + `create or replace` não aceita mudar defaults, então a RPC
-- `create_bar` é recriada. Assinatura e corpo idênticos à versão de
-- 20260924000022_room_custom_code.sql (9 parâmetros, com p_codigo) — só o
-- default do raio muda; o corpo é copiado na íntegra para não perder as
-- validações (nome, 1–999 mesas, lat/lng, raio 50–1000) nem o
-- `unique_room_code`. As chamadas de `src/lib/bars/actions.ts` seguem válidas.
drop function if exists public.create_bar(
  text, text, text, int, text[], numeric, numeric, int, text
);

create or replace function public.create_bar(
  p_nome text,
  p_cidade text,
  p_endereco text,
  p_quantidade_mesas int,
  p_rotulos text[] default null,
  p_latitude numeric default null,
  p_longitude numeric default null,
  p_raio_permitido_metros int default 500,
  p_codigo text default null
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
    latitude, longitude, raio_permitido_metros
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
    v_raio
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
  text, text, text, int, text[], numeric, numeric, int, text
) to authenticated;
