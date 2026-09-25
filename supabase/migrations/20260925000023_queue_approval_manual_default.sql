-- Nova casa passa a exigir aprovação do host por padrão.
-- `create_bar`/`create_room` não setam o campo e passam a herdar `manual`.
alter table public.rooms alter column queue_approval_mode set default 'manual';