-- rooms passa a ser a "sala/karaokê" vinculada a um bar.
-- room_members ganha mesa_numero (etiqueta de onde o participante se senta).
alter table public.rooms
  add column if not exists bar_id uuid references public.bars (id) on delete set null;

create index if not exists rooms_bar_id_idx on public.rooms (bar_id);

alter table public.room_members
  add column if not exists mesa_numero int;

-- Migração de dados: rooms existentes (hosts sem bar) ganham 1 bar auto-criado
-- por host distinto (nome a partir do profile, quantidade_mesas default 1,
-- mesa 1 criada) e apontam bar_id para ele.
do $$
declare
  r record;
  v_bar_id uuid;
  v_host_name text;
  v_code text;
begin
  for r in
    select distinct host_id
    from public.rooms
    where bar_id is null
  loop
    select name into v_host_name from public.profiles where id = r.host_id;

    v_bar_id := gen_random_uuid();
    loop
      v_code := '';
      for i in 1..6 loop
        v_code := v_code || substr(
          'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
          floor(random() * 32)::int + 1,
          1
        );
      end loop;
      exit when not exists (select 1 from public.bars where code = v_code);
    end loop;

    insert into public.bars (id, host_id, code, nome, cidade, endereco, quantidade_mesas)
    values (v_bar_id, r.host_id, v_code, coalesce(v_host_name, 'Bar') || ' — bar', null, null, 1);

    insert into public.mesas (bar_id, numero, rotulo)
    values (v_bar_id, 1, 'Mesa 1');

    update public.rooms
    set bar_id = v_bar_id
    where host_id = r.host_id
      and bar_id is null;
  end loop;
end;
$$;