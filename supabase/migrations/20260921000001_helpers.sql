-- Funções auxiliares de RLS (multi-tenancy).
-- Todas são security definer para serem imunes a RLS do próprio schema e
-- executarem com o search_path fixo (anti função-hijacking).

create or replace function public.is_host(p_room_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  return exists (
    select 1
    from public.rooms
    where id = p_room_id
      and host_id = p_user_id
  );
end;
$$;

create or replace function public.is_approved_member(p_room_id uuid, p_user_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public, pg_catalog
as $$
begin
  return exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and user_id = p_user_id
      and status = 'approved'
  );
end;
$$;

-- Código de sala: 6 caracteres alfanuméricos, não sequenciais (spec seção 13).
create or replace function public.generate_room_code()
returns text
language plpgsql
volatile
set search_path = public, pg_catalog
as $$
declare
  v_code text;
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- sem I/O/1/0 para evitar ambiguidade
begin
  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars))::int + 1, 1);
    end loop;
    exit when not exists (select 1 from public.rooms where code = v_code);
  end loop;
  return v_code;
end;
$$;