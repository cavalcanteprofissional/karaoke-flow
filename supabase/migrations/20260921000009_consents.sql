-- Consentimento LGPD/GDPR (spec §2.5 e §13). Registrado a partir do primeiro
-- aceite na Tela 1 (onboarding). Nada é coletado do dispositivo antes do
-- aceite; após o aceite, registramos preferências de cookies, o status da
-- coleta de geolocalização (concedida|negada|indisponível) e coords
-- aproximadas, além do idioma e do último perfil escolhido.
create table if not exists public.consents (
  user_id uuid primary key references auth.users (id) on delete cascade,
  terms_version text not null,
  cookies_preferences jsonb not null default '{}'::jsonb,
  geolocation jsonb not null default '{}'::jsonb,
  accepted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists consents_accepted_at_idx
  on public.consents (accepted_at desc);

alter table public.consents enable row level security;

-- RLS: cada usuário lê/insere/atualiza apenas o próprio consentimento.
-- (INSERT/UPDATE também pode vir da service role no server quando necessário.)
create policy "consents_select_own" on public.consents
  for select
  using (auth.uid() = user_id);

create policy "consents_insert_own" on public.consents
  for insert
  with check (auth.uid() = user_id);

create policy "consents_update_own" on public.consents
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- updated_at (trigger idempotente; touch_updated_at criado na migration 0005)
drop trigger if exists consents_touch_updated_at on public.consents;
create trigger consents_touch_updated_at
  before update on public.consents
  for each row execute function public.touch_updated_at();