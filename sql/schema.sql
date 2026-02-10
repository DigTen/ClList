-- Enable extension for gen_random_uuid()
create extension if not exists pgcrypto;

create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  phone text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  unique (user_id, full_name),
  unique (id, user_id)
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
  constraint payments_client_owner_fkey
    foreign key (client_id, user_id)
    references public.clients(id, user_id)
    on delete cascade,
  unique (user_id, client_id, month_start),
  constraint payments_lessons_non_negative check (lessons is null or lessons >= 0),
  constraint payments_price_non_negative check (price is null or price >= 0),
  constraint payments_month_start_is_first_day check (
    month_start = date_trunc('month', month_start)::date
  )
);

create table if not exists public.attendance (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  session_date date not null,
  time_start time not null,
  duration_minutes integer,
  bed_type text not null default 'reformer',
  status text not null default 'attended',
  notes text,
  created_at timestamptz not null default now(),
  constraint attendance_client_owner_fkey
    foreign key (client_id, user_id)
    references public.clients(id, user_id)
    on delete cascade,
  constraint attendance_bed_type_valid check (bed_type in ('reformer', 'cadillac')),
  constraint attendance_status_valid check (status in ('attended', 'canceled', 'no_show')),
  constraint attendance_time_required check (time_start is not null),
  constraint attendance_duration_non_negative check (duration_minutes is null or duration_minutes >= 0),
  unique (user_id, client_id, session_date, time_start)
);

create index if not exists idx_clients_user_active on public.clients (user_id, is_active, full_name);
create index if not exists idx_payments_user_month on public.payments (user_id, month_start);
create index if not exists idx_payments_client on public.payments (client_id);
create index if not exists idx_attendance_user_date on public.attendance (user_id, session_date);
create index if not exists idx_attendance_client on public.attendance (client_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_id_user_id_key'
  ) then
    alter table public.clients
      add constraint clients_id_user_id_key unique (id, user_id);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payments_client_owner_fkey'
  ) then
    alter table public.payments
      add constraint payments_client_owner_fkey
      foreign key (client_id, user_id)
      references public.clients(id, user_id)
      on delete cascade
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attendance_client_owner_fkey'
  ) then
    alter table public.attendance
      add constraint attendance_client_owner_fkey
      foreign key (client_id, user_id)
      references public.clients(id, user_id)
      on delete cascade
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'attendance'
      and column_name = 'bed_type'
  ) then
    alter table public.attendance
      add column bed_type text not null default 'reformer';
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attendance_bed_type_valid'
  ) then
    alter table public.attendance
      add constraint attendance_bed_type_valid
      check (bed_type in ('reformer', 'cadillac'))
      not valid;
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'attendance_time_required'
  ) then
    alter table public.attendance
      add constraint attendance_time_required
      check (time_start is not null)
      not valid;
  end if;
end
$$;

alter table public.clients enable row level security;
alter table public.payments enable row level security;
alter table public.attendance enable row level security;

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

drop policy if exists attendance_select_own on public.attendance;
create policy attendance_select_own
  on public.attendance
  for select
  using (auth.uid() = user_id);

drop policy if exists attendance_insert_own on public.attendance;
create policy attendance_insert_own
  on public.attendance
  for insert
  with check (auth.uid() = user_id);

drop policy if exists attendance_update_own on public.attendance;
create policy attendance_update_own
  on public.attendance
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists attendance_delete_own on public.attendance;
create policy attendance_delete_own
  on public.attendance
  for delete
  using (auth.uid() = user_id);

create table if not exists public.login_security (
  email text primary key,
  fail_count integer not null default 0,
  lock_until timestamptz,
  last_fail_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint login_security_fail_count_non_negative check (fail_count >= 0)
);

create index if not exists idx_login_security_lock_until on public.login_security (lock_until);

revoke all on table public.login_security from anon;
revoke all on table public.login_security from authenticated;

create or replace function public.check_login_lock(email_input text)
returns table (
  is_locked boolean,
  lock_until timestamptz,
  fail_count integer,
  remaining_seconds integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(coalesce(email_input, '')));
  current_row public.login_security%rowtype;
  now_ts timestamptz := now();
begin
  if normalized_email = '' then
    return query select false, null::timestamptz, 0, 0;
    return;
  end if;

  select *
  into current_row
  from public.login_security
  where email = normalized_email;

  if not found then
    return query select false, null::timestamptz, 0, 0;
    return;
  end if;

  if current_row.lock_until is not null and current_row.lock_until > now_ts then
    return query
    select
      true,
      current_row.lock_until,
      current_row.fail_count,
      greatest(0, floor(extract(epoch from (current_row.lock_until - now_ts)))::integer);
    return;
  end if;

  return query select false, current_row.lock_until, current_row.fail_count, 0;
end;
$$;

create or replace function public.record_login_attempt(email_input text, was_success boolean)
returns table (
  is_locked boolean,
  lock_until timestamptz,
  fail_count integer,
  lock_minutes integer
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_email text := lower(trim(coalesce(email_input, '')));
  current_row public.login_security%rowtype;
  next_fail_count integer;
  penalty_step integer;
  next_lock_minutes integer;
  next_lock_until timestamptz;
begin
  if normalized_email = '' then
    return query select false, null::timestamptz, 0, 0;
    return;
  end if;

  insert into public.login_security (email)
  values (normalized_email)
  on conflict (email) do nothing;

  select *
  into current_row
  from public.login_security
  where email = normalized_email
  for update;

  if was_success then
    update public.login_security
    set fail_count = 0,
        lock_until = null,
        last_fail_at = null,
        updated_at = now()
    where email = normalized_email;

    return query select false, null::timestamptz, 0, 0;
    return;
  end if;

  next_fail_count := coalesce(current_row.fail_count, 0) + 1;

  if next_fail_count < 3 then
    next_lock_minutes := 0;
    next_lock_until := null;
  else
    penalty_step := next_fail_count - 3;
    next_lock_minutes := least(1440, (30 * (2 ^ penalty_step))::integer);
    next_lock_until := now() + make_interval(mins => next_lock_minutes);
  end if;

  update public.login_security
  set fail_count = next_fail_count,
      lock_until = next_lock_until,
      last_fail_at = now(),
      updated_at = now()
  where email = normalized_email;

  return query
  select
    (next_lock_until is not null and next_lock_until > now()),
    next_lock_until,
    next_fail_count,
    next_lock_minutes;
end;
$$;

revoke all on function public.check_login_lock(text) from public;
revoke all on function public.record_login_attempt(text, boolean) from public;
grant execute on function public.check_login_lock(text) to anon;
grant execute on function public.check_login_lock(text) to authenticated;
grant execute on function public.record_login_attempt(text, boolean) to anon;
grant execute on function public.record_login_attempt(text, boolean) to authenticated;

create table if not exists public.follow_up_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  rule_key text not null,
  title text not null,
  details text,
  priority text not null default 'medium',
  status text not null default 'open',
  due_date date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint follow_up_tasks_priority_valid check (priority in ('high', 'medium', 'low')),
  constraint follow_up_tasks_status_valid check (status in ('open', 'in_progress', 'done', 'dismissed')),
  constraint follow_up_tasks_owner_fkey
    foreign key (client_id, user_id)
    references public.clients(id, user_id)
    on delete cascade,
  unique (user_id, client_id, rule_key, due_date)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid references public.clients(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  created_for_date date not null default current_date,
  is_read boolean not null default false,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_owner_fkey
    foreign key (client_id, user_id)
    references public.clients(id, user_id)
    on delete cascade,
  unique (user_id, client_id, type, created_for_date)
);

create table if not exists public.automation_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  no_show_risk_enabled boolean not null default true,
  attendance_drop_enabled boolean not null default true,
  pending_unpaid_risk_enabled boolean not null default true,
  no_show_threshold integer not null default 2,
  pending_lessons_threshold integer not null default 4,
  attendance_drop_ratio numeric(5, 2) not null default 0.50,
  last_refreshed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint automation_settings_no_show_threshold_valid check (no_show_threshold >= 1),
  constraint automation_settings_pending_threshold_valid check (pending_lessons_threshold >= 1),
  constraint automation_settings_ratio_valid check (attendance_drop_ratio > 0 and attendance_drop_ratio <= 1)
);

create table if not exists public.client_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  note text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint client_notes_owner_fkey
    foreign key (client_id, user_id)
    references public.clients(id, user_id)
    on delete cascade
);

create index if not exists idx_follow_up_tasks_user_due on public.follow_up_tasks (user_id, due_date, status);
create index if not exists idx_follow_up_tasks_user_priority on public.follow_up_tasks (user_id, priority, status);
create index if not exists idx_notifications_user_read on public.notifications (user_id, is_read, created_at desc);
create index if not exists idx_notifications_user_client on public.notifications (user_id, client_id);
create index if not exists idx_client_notes_user_client on public.client_notes (user_id, client_id, created_at desc);

alter table public.follow_up_tasks enable row level security;
alter table public.notifications enable row level security;
alter table public.automation_settings enable row level security;
alter table public.client_notes enable row level security;

drop policy if exists follow_up_tasks_select_own on public.follow_up_tasks;
create policy follow_up_tasks_select_own
  on public.follow_up_tasks
  for select
  using (auth.uid() = user_id);

drop policy if exists follow_up_tasks_insert_own on public.follow_up_tasks;
create policy follow_up_tasks_insert_own
  on public.follow_up_tasks
  for insert
  with check (auth.uid() = user_id);

drop policy if exists follow_up_tasks_update_own on public.follow_up_tasks;
create policy follow_up_tasks_update_own
  on public.follow_up_tasks
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists follow_up_tasks_delete_own on public.follow_up_tasks;
create policy follow_up_tasks_delete_own
  on public.follow_up_tasks
  for delete
  using (auth.uid() = user_id);

drop policy if exists notifications_select_own on public.notifications;
create policy notifications_select_own
  on public.notifications
  for select
  using (auth.uid() = user_id);

drop policy if exists notifications_insert_own on public.notifications;
create policy notifications_insert_own
  on public.notifications
  for insert
  with check (auth.uid() = user_id);

drop policy if exists notifications_update_own on public.notifications;
create policy notifications_update_own
  on public.notifications
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists notifications_delete_own on public.notifications;
create policy notifications_delete_own
  on public.notifications
  for delete
  using (auth.uid() = user_id);

drop policy if exists automation_settings_select_own on public.automation_settings;
create policy automation_settings_select_own
  on public.automation_settings
  for select
  using (auth.uid() = user_id);

drop policy if exists automation_settings_insert_own on public.automation_settings;
create policy automation_settings_insert_own
  on public.automation_settings
  for insert
  with check (auth.uid() = user_id);

drop policy if exists automation_settings_update_own on public.automation_settings;
create policy automation_settings_update_own
  on public.automation_settings
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists automation_settings_delete_own on public.automation_settings;
create policy automation_settings_delete_own
  on public.automation_settings
  for delete
  using (auth.uid() = user_id);

drop policy if exists client_notes_select_own on public.client_notes;
create policy client_notes_select_own
  on public.client_notes
  for select
  using (auth.uid() = user_id);

drop policy if exists client_notes_insert_own on public.client_notes;
create policy client_notes_insert_own
  on public.client_notes
  for insert
  with check (auth.uid() = user_id);

drop policy if exists client_notes_update_own on public.client_notes;
create policy client_notes_update_own
  on public.client_notes
  for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists client_notes_delete_own on public.client_notes;
create policy client_notes_delete_own
  on public.client_notes
  for delete
  using (auth.uid() = user_id);

create or replace function public.refresh_management_signals()
returns table (
  generated_tasks integer,
  generated_notifications integer,
  refreshed_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  settings_row public.automation_settings%rowtype;
  today_date date := current_date;
  month_start date := date_trunc('month', now())::date;
  next_month_start date := (date_trunc('month', now()) + interval '1 month')::date;
  task_count integer := 0;
  notification_count integer := 0;
  affected_rows integer := 0;
  rec record;
begin
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  insert into public.automation_settings (user_id)
  values (current_user_id)
  on conflict (user_id) do nothing;

  select *
  into settings_row
  from public.automation_settings
  where user_id = current_user_id
  for update;

  if settings_row.last_refreshed_at is not null and settings_row.last_refreshed_at::date = today_date then
    return query select 0, 0, settings_row.last_refreshed_at;
    return;
  end if;

  if settings_row.no_show_risk_enabled then
    for rec in
      select
        a.client_id,
        c.full_name,
        count(*)::integer as no_show_count
      from public.attendance a
      join public.clients c
        on c.id = a.client_id
       and c.user_id = a.user_id
      where a.user_id = current_user_id
        and a.status = 'no_show'
        and a.session_date >= (today_date - interval '28 days')::date
        and a.session_date <= today_date
      group by a.client_id, c.full_name
      having count(*) >= settings_row.no_show_threshold
    loop
      insert into public.follow_up_tasks (
        user_id, client_id, rule_key, title, details, priority, status, due_date, updated_at
      ) values (
        current_user_id,
        rec.client_id,
        'no_show_risk',
        'Κίνδυνος από no-show',
        format('Ο πελάτης %s έχει %s no-show τις τελευταίες 28 ημέρες.', rec.full_name, rec.no_show_count),
        'high',
        'open',
        today_date,
        now()
      )
      on conflict (user_id, client_id, rule_key, due_date)
      do update
      set title = excluded.title,
          details = excluded.details,
          priority = excluded.priority,
          updated_at = now();

      get diagnostics affected_rows = row_count;
      task_count := task_count + affected_rows;

      insert into public.notifications (
        user_id, client_id, type, title, body, created_for_date, is_read, created_at
      ) values (
        current_user_id,
        rec.client_id,
        'no_show_risk',
        'Πελάτης υψηλού ρίσκου',
        format('%s: %s no-show τις τελευταίες 28 ημέρες.', rec.full_name, rec.no_show_count),
        today_date,
        false,
        now()
      )
      on conflict (user_id, client_id, type, created_for_date)
      do update
      set title = excluded.title,
          body = excluded.body,
          is_read = false;

      get diagnostics affected_rows = row_count;
      notification_count := notification_count + affected_rows;
    end loop;
  end if;

  if settings_row.attendance_drop_enabled then
    for rec in
      with attended_recent as (
        select
          a.client_id,
          count(*)::integer as attended_count
        from public.attendance a
        where a.user_id = current_user_id
          and a.status = 'attended'
          and a.session_date >= (today_date - interval '28 days')::date
          and a.session_date <= today_date
        group by a.client_id
      ),
      attended_previous as (
        select
          a.client_id,
          count(*)::integer as attended_count
        from public.attendance a
        where a.user_id = current_user_id
          and a.status = 'attended'
          and a.session_date >= (today_date - interval '56 days')::date
          and a.session_date < (today_date - interval '28 days')::date
        group by a.client_id
      )
      select
        c.id as client_id,
        c.full_name,
        coalesce(ar.attended_count, 0) as recent_attended,
        coalesce(ap.attended_count, 0) as previous_attended
      from public.clients c
      left join attended_recent ar
        on ar.client_id = c.id
      left join attended_previous ap
        on ap.client_id = c.id
      where c.user_id = current_user_id
        and c.is_active = true
        and coalesce(ap.attended_count, 0) > 0
        and coalesce(ar.attended_count, 0) <= floor(coalesce(ap.attended_count, 0) * settings_row.attendance_drop_ratio)
    loop
      insert into public.follow_up_tasks (
        user_id, client_id, rule_key, title, details, priority, status, due_date, updated_at
      ) values (
        current_user_id,
        rec.client_id,
        'attendance_drop',
        'Πτώση παρακολούθησης',
        format('Ο πελάτης %s έχει %s παρακολουθήσεις (προηγούμενο 28ήμερο: %s).', rec.full_name, rec.recent_attended, rec.previous_attended),
        'medium',
        'open',
        today_date,
        now()
      )
      on conflict (user_id, client_id, rule_key, due_date)
      do update
      set title = excluded.title,
          details = excluded.details,
          priority = excluded.priority,
          updated_at = now();

      get diagnostics affected_rows = row_count;
      task_count := task_count + affected_rows;

      insert into public.notifications (
        user_id, client_id, type, title, body, created_for_date, is_read, created_at
      ) values (
        current_user_id,
        rec.client_id,
        'attendance_drop',
        'Πτώση προσέλευσης',
        format('%s: %s τώρα έναντι %s στο προηγούμενο 28ήμερο.', rec.full_name, rec.recent_attended, rec.previous_attended),
        today_date,
        false,
        now()
      )
      on conflict (user_id, client_id, type, created_for_date)
      do update
      set title = excluded.title,
          body = excluded.body,
          is_read = false;

      get diagnostics affected_rows = row_count;
      notification_count := notification_count + affected_rows;
    end loop;
  end if;

  if settings_row.pending_unpaid_risk_enabled then
    for rec in
      with attended_current_month as (
        select
          a.client_id,
          count(*)::integer as attended_count
        from public.attendance a
        where a.user_id = current_user_id
          and a.status = 'attended'
          and a.session_date >= month_start
          and a.session_date < next_month_start
        group by a.client_id
      )
      select
        p.client_id,
        c.full_name,
        greatest(0, coalesce(p.lessons, 0) - coalesce(acm.attended_count, 0))::integer as pending_lessons
      from public.payments p
      join public.clients c
        on c.id = p.client_id
       and c.user_id = p.user_id
      left join attended_current_month acm
        on acm.client_id = p.client_id
      where p.user_id = current_user_id
        and p.month_start = month_start
        and p.paid = false
        and greatest(0, coalesce(p.lessons, 0) - coalesce(acm.attended_count, 0)) >= settings_row.pending_lessons_threshold
    loop
      insert into public.follow_up_tasks (
        user_id, client_id, rule_key, title, details, priority, status, due_date, updated_at
      ) values (
        current_user_id,
        rec.client_id,
        'pending_unpaid_risk',
        'Απλήρωτα με υψηλή εκκρεμότητα',
        format('Ο πελάτης %s έχει %s εκκρεμή μαθήματα και είναι απλήρωτος.', rec.full_name, rec.pending_lessons),
        'medium',
        'open',
        today_date,
        now()
      )
      on conflict (user_id, client_id, rule_key, due_date)
      do update
      set title = excluded.title,
          details = excluded.details,
          priority = excluded.priority,
          updated_at = now();

      get diagnostics affected_rows = row_count;
      task_count := task_count + affected_rows;

      insert into public.notifications (
        user_id, client_id, type, title, body, created_for_date, is_read, created_at
      ) values (
        current_user_id,
        rec.client_id,
        'pending_unpaid_risk',
        'Follow-up πληρωμής',
        format('%s: %s εκκρεμή μαθήματα χωρίς εξόφληση.', rec.full_name, rec.pending_lessons),
        today_date,
        false,
        now()
      )
      on conflict (user_id, client_id, type, created_for_date)
      do update
      set title = excluded.title,
          body = excluded.body,
          is_read = false;

      get diagnostics affected_rows = row_count;
      notification_count := notification_count + affected_rows;
    end loop;
  end if;

  update public.automation_settings
  set last_refreshed_at = now(),
      updated_at = now()
  where user_id = current_user_id;

  return query select task_count, notification_count, now();
end;
$$;

revoke all on function public.refresh_management_signals() from public;
grant execute on function public.refresh_management_signals() to authenticated;

