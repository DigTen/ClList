-- Enable extension for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unique (user_id, full_name)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  month_start date not null,
  lessons integer,
  price numeric(10, 2),
  paid boolean not null default false,
  notes text,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, client_id, month_start),
  constraint payments_lessons_non_negative check (lessons is null or lessons >= 0),
  constraint payments_price_non_negative check (price is null or price >= 0),
  constraint payments_month_start_is_first_day check (
    month_start = date_trunc('month', month_start)::date
  )
);

create index if not exists idx_clients_user_active on public.clients (user_id, is_active, full_name);
create index if not exists idx_payments_user_month on public.payments (user_id, month_start);
create index if not exists idx_payments_client on public.payments (client_id);

alter table public.clients enable row level security;
alter table public.payments enable row level security;

drop policy if exists clients_select_own on public.clients;
create policy clients_select_own
  on public.clients
  for select
  using (auth.uid() = user_id);

drop policy if exists clients_insert_own on public.clients;
create policy clients_insert_own
  on public.clients
  for insert
  with check (auth.uid() = user_id);

drop policy if exists clients_update_own on public.clients;
create policy clients_update_own
  on public.clients
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists clients_delete_own on public.clients;
create policy clients_delete_own
  on public.clients
  for delete
  using (auth.uid() = user_id);

drop policy if exists payments_select_own on public.payments;
create policy payments_select_own
  on public.payments
  for select
  using (auth.uid() = user_id);

drop policy if exists payments_insert_own on public.payments;
create policy payments_insert_own
  on public.payments
  for insert
  with check (auth.uid() = user_id);

drop policy if exists payments_update_own on public.payments;
create policy payments_update_own
  on public.payments
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists payments_delete_own on public.payments;
create policy payments_delete_own
  on public.payments
  for delete
  using (auth.uid() = user_id);

