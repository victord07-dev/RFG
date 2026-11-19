-- RFG Financial loan MVP schema
-- Run this in Supabase SQL Editor after creating the project.
-- Frontend uses the publishable key only. Never put the service role key in Vite/client code.

create extension if not exists pgcrypto;

do $$ begin
  create type public.user_role as enum ('admin', 'sales');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.loan_status as enum ('under_processing', 'approved', 'rejected', 'active', 'closed');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.payment_status as enum ('pending', 'verification_pending', 'paid', 'rejected', 'failed', 'overdue');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_category as enum ('two_wheeler', 'electronics', 'others');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.cash_request_status as enum ('verification_pending', 'approved', 'rejected');
exception when duplicate_object then null;
end $$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text unique,
  role public.user_role not null default 'sales',
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.customers (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  mobile text not null,
  alternate_mobile text not null default '',
  address text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (mobile)
);

create table if not exists public.sellers (
  id uuid primary key default gen_random_uuid(),
  seller_name text not null,
  seller_mobile text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (seller_mobile)
);

create table if not exists public.showrooms (
  id uuid primary key default gen_random_uuid(),
  showroom_name text not null,
  showroom_mobile text not null,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (showroom_mobile)
);

create table if not exists public.loan_applications (
  id uuid primary key default gen_random_uuid(),
  loan_id text not null unique,
  customer_id uuid references public.customers(id),
  seller_id uuid references public.sellers(id),
  showroom_id uuid references public.showrooms(id),
  customer_name text not null,
  mobile text not null,
  alternate_mobile text not null,
  address text not null,
  category public.product_category not null,
  product_name text not null,
  asset_id text not null,
  seller_name text not null,
  seller_mobile text not null,
  showroom_name text not null,
  showroom_mobile text not null,
  product_price numeric(12,2) not null default 0,
  down_payment numeric(12,2) not null default 0,
  loan_amount numeric(12,2) not null default 0,
  charge_amount numeric(12,2) not null default 0,
  tenure integer not null default 0,
  emi_amount numeric(12,2) not null default 0,
  due_day integer not null default 5 check (due_day between 1 and 31),
  status public.loan_status not null default 'under_processing',
  sales_person text not null default 'Sales User',
  login_id text not null,
  customer_mpin text not null,
  remarks text not null default '',
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  closed_by uuid references auth.users(id),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.loan_terms (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  product_price numeric(12,2) not null default 0,
  down_payment numeric(12,2) not null default 0,
  loan_amount numeric(12,2) not null default 0,
  charge_amount numeric(12,2) not null default 0,
  tenure integer not null default 0,
  emi_amount numeric(12,2) not null default 0,
  due_day integer not null default 5 check (due_day between 1 and 31),
  reason text not null default 'Initial terms',
  changed_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create table if not exists public.document_checklists (
  application_id uuid primary key references public.loan_applications(id) on delete cascade,
  aadhaar boolean not null default false,
  pan boolean not null default false,
  address boolean not null default false,
  photo boolean not null default false,
  signature boolean not null default false,
  seller_confirmed boolean not null default false,
  seller_otp boolean not null default false,
  rc boolean not null default false,
  insurance boolean not null default false,
  serial_checked boolean not null default false,
  updated_at timestamptz not null default now()
);

create table if not exists public.emi_schedule (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  emi_month text not null,
  due_date date,
  amount numeric(12,2) not null default 0,
  status public.payment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, emi_month)
);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  payment_id text not null unique,
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  emi_schedule_id uuid references public.emi_schedule(id) on delete set null,
  amount numeric(12,2) not null default 0,
  mode text not null check (mode in ('cash', 'manual_bank_qr', 'razorpay')),
  status public.payment_status not null default 'pending',
  reference text,
  notes text not null default '',
  created_by uuid references auth.users(id),
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cash_payment_requests (
  id uuid primary key default gen_random_uuid(),
  request_id text not null unique,
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  emi_month text not null,
  amount numeric(12,2) not null default 0,
  collected_by text not null default 'Sales User',
  collected_at text not null default 'Today',
  remarks text not null default '',
  status public.cash_request_status not null default 'verification_pending',
  payment_id uuid references public.payments(id) on delete set null,
  created_by uuid references auth.users(id),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payment_settings (
  id boolean primary key default true check (id = true),
  manual_bank_qr_enabled boolean not null default true,
  cash_request_enabled boolean not null default true,
  razorpay_enabled boolean not null default false,
  bank_account_name text not null default '',
  bank_name text not null default '',
  bank_notes text not null default 'Admin must verify bank account before marking paid.',
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);

insert into public.payment_settings (id)
values (true)
on conflict (id) do nothing;

create table if not exists public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  application_id uuid references public.loan_applications(id) on delete cascade,
  actor_id uuid references auth.users(id),
  action text not null,
  details jsonb not null default '{}'::jsonb,
  archived_to text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.login_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  email text,
  role public.user_role,
  success boolean not null default true,
  ip_address text,
  user_agent text,
  archived_to text,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

-- Compatibility upgrades if an older draft schema was already run.
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists updated_at timestamptz not null default now();
alter table public.profiles alter column active set default false;

alter table public.loan_applications add column if not exists customer_id uuid references public.customers(id);
alter table public.loan_applications add column if not exists seller_id uuid references public.sellers(id);
alter table public.loan_applications add column if not exists showroom_id uuid references public.showrooms(id);
alter table public.loan_applications add column if not exists approved_by uuid references auth.users(id);
alter table public.loan_applications add column if not exists approved_at timestamptz;
alter table public.loan_applications add column if not exists closed_by uuid references auth.users(id);
alter table public.loan_applications add column if not exists closed_at timestamptz;

alter table public.cash_payment_requests add column if not exists payment_id uuid references public.payments(id) on delete set null;
alter table public.cash_payment_requests add column if not exists reviewed_by uuid references auth.users(id);
alter table public.cash_payment_requests add column if not exists reviewed_at timestamptz;
alter table public.cash_payment_requests add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_loan_applications_status on public.loan_applications(status);
create index if not exists idx_loan_applications_created_by on public.loan_applications(created_by);
create index if not exists idx_cash_requests_status on public.cash_payment_requests(status);
create index if not exists idx_activity_logs_created_at on public.activity_logs(created_at);
create index if not exists idx_login_logs_created_at on public.login_logs(created_at);
create unique index if not exists profiles_email_unique on public.profiles(lower(email)) where email is not null;
create unique index if not exists profiles_only_one_active_admin
on public.profiles ((role))
where role = 'admin' and active = true;

create or replace function public.enforce_staff_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_admin_count integer;
  active_sales_count integer;
begin
  if tg_op = 'UPDATE'
    and old.id = auth.uid()
    and old.role = 'admin'
    and old.active = true
    and (new.role <> 'admin' or new.active = false) then
    raise exception 'The current admin cannot demote or deactivate their own account.';
  end if;

  if new.active = true and new.role = 'admin' then
    select count(*)
    into active_admin_count
    from public.profiles
    where role = 'admin'
      and active = true
      and id <> new.id;

    if active_admin_count >= 1 then
      raise exception 'Only one active admin account is allowed.';
    end if;
  end if;

  if new.active = true and new.role = 'sales' then
    select count(*)
    into active_sales_count
    from public.profiles
    where role = 'sales'
      and active = true
      and id <> new.id;

    if active_sales_count >= 2 then
      raise exception 'Only two active sales member accounts are allowed.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_staff_limits on public.profiles;
create trigger profiles_staff_limits
  before insert or update of role, active on public.profiles
  for each row execute function public.enforce_staff_limits();

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at before update on public.profiles for each row execute function public.set_updated_at();

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at before update on public.customers for each row execute function public.set_updated_at();

drop trigger if exists sellers_set_updated_at on public.sellers;
create trigger sellers_set_updated_at before update on public.sellers for each row execute function public.set_updated_at();

drop trigger if exists showrooms_set_updated_at on public.showrooms;
create trigger showrooms_set_updated_at before update on public.showrooms for each row execute function public.set_updated_at();

drop trigger if exists loan_applications_set_updated_at on public.loan_applications;
create trigger loan_applications_set_updated_at before update on public.loan_applications for each row execute function public.set_updated_at();

drop trigger if exists document_checklists_set_updated_at on public.document_checklists;
create trigger document_checklists_set_updated_at before update on public.document_checklists for each row execute function public.set_updated_at();

drop trigger if exists emi_schedule_set_updated_at on public.emi_schedule;
create trigger emi_schedule_set_updated_at before update on public.emi_schedule for each row execute function public.set_updated_at();

drop trigger if exists payments_set_updated_at on public.payments;
create trigger payments_set_updated_at before update on public.payments for each row execute function public.set_updated_at();

drop trigger if exists cash_requests_set_updated_at on public.cash_payment_requests;
create trigger cash_requests_set_updated_at before update on public.cash_payment_requests for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, role, active)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)),
    lower(new.email),
    coalesce((new.raw_user_meta_data ->> 'role')::public.user_role, 'sales'),
    false
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = coalesce(public.profiles.full_name, excluded.full_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.current_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid() and active = true;
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() = 'admin';
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_role() in ('admin', 'sales');
$$;

create or replace function public.can_touch_application(application_creator uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_admin() or (public.current_role() = 'sales' and application_creator = auth.uid());
$$;

alter table public.profiles enable row level security;
alter table public.customers enable row level security;
alter table public.sellers enable row level security;
alter table public.showrooms enable row level security;
alter table public.loan_applications enable row level security;
alter table public.loan_terms enable row level security;
alter table public.document_checklists enable row level security;
alter table public.emi_schedule enable row level security;
alter table public.payments enable row level security;
alter table public.cash_payment_requests enable row level security;
alter table public.payment_settings enable row level security;
alter table public.activity_logs enable row level security;
alter table public.login_logs enable row level security;

grant usage on schema public to authenticated;

grant select on public.profiles to authenticated;
grant update on public.profiles to authenticated;

grant select, insert, update on public.customers to authenticated;
grant select, insert, update on public.sellers to authenticated;
grant select, insert, update on public.showrooms to authenticated;
grant select, insert, update on public.loan_applications to authenticated;
grant select, insert on public.loan_terms to authenticated;
grant select, insert, update on public.document_checklists to authenticated;
grant select, insert, update on public.emi_schedule to authenticated;
grant select, insert, update on public.payments to authenticated;
grant select, insert, update on public.cash_payment_requests to authenticated;
grant select, update on public.payment_settings to authenticated;
grant select, insert, update on public.activity_logs to authenticated;
grant select, insert, update on public.login_logs to authenticated;

grant execute on function public.current_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.is_staff() to authenticated;
grant execute on function public.can_touch_application(uuid) to authenticated;
grant execute on function public.mark_old_logs_archived(text) to authenticated;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = auth.uid() or public.is_admin());

-- Remove older permissive draft policies if they exist.
drop policy if exists "sales_read_applications" on public.loan_applications;
drop policy if exists "sales_update_application_limited" on public.loan_applications;
drop policy if exists "sales_read_checklists" on public.document_checklists;
drop policy if exists "sales_write_checklists" on public.document_checklists;
drop policy if exists "sales_read_cash_requests" on public.cash_payment_requests;
drop policy if exists "sales_read_logs" on public.activity_logs;
drop policy if exists "sales_create_logs" on public.activity_logs;

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update"
on public.profiles for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff_read_customers" on public.customers;
create policy "staff_read_customers" on public.customers for select to authenticated using (public.is_staff());
drop policy if exists "staff_create_customers" on public.customers;
create policy "staff_create_customers" on public.customers for insert to authenticated with check (public.is_staff());
drop policy if exists "admin_update_customers" on public.customers;
create policy "admin_update_customers" on public.customers for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_read_sellers" on public.sellers;
create policy "staff_read_sellers" on public.sellers for select to authenticated using (public.is_staff());
drop policy if exists "staff_create_sellers" on public.sellers;
create policy "staff_create_sellers" on public.sellers for insert to authenticated with check (public.is_staff());
drop policy if exists "admin_update_sellers" on public.sellers;
create policy "admin_update_sellers" on public.sellers for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_read_showrooms" on public.showrooms;
create policy "staff_read_showrooms" on public.showrooms for select to authenticated using (public.is_staff());
drop policy if exists "staff_create_showrooms" on public.showrooms;
create policy "staff_create_showrooms" on public.showrooms for insert to authenticated with check (public.is_staff());
drop policy if exists "admin_update_showrooms" on public.showrooms;
create policy "admin_update_showrooms" on public.showrooms for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_read_applications" on public.loan_applications;
create policy "staff_read_applications"
on public.loan_applications for select
to authenticated
using (public.is_staff());

drop policy if exists "sales_create_applications" on public.loan_applications;
create policy "sales_create_applications"
on public.loan_applications for insert
to authenticated
with check (public.is_staff() and created_by = auth.uid());

drop policy if exists "sales_update_own_processing_applications" on public.loan_applications;
create policy "sales_update_own_processing_applications"
on public.loan_applications for update
to authenticated
using (public.current_role() = 'sales' and created_by = auth.uid() and status = 'under_processing')
with check (public.current_role() = 'sales' and created_by = auth.uid() and status = 'under_processing');

drop policy if exists "admin_update_applications" on public.loan_applications;
create policy "admin_update_applications"
on public.loan_applications for update
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "staff_read_loan_terms" on public.loan_terms;
create policy "staff_read_loan_terms" on public.loan_terms for select to authenticated using (public.is_staff());
drop policy if exists "admin_write_loan_terms" on public.loan_terms;
create policy "admin_write_loan_terms" on public.loan_terms for insert to authenticated with check (public.is_admin());

drop policy if exists "staff_read_checklists" on public.document_checklists;
create policy "staff_read_checklists" on public.document_checklists for select to authenticated using (public.is_staff());
drop policy if exists "staff_create_checklists" on public.document_checklists;
create policy "staff_create_checklists" on public.document_checklists for insert to authenticated with check (public.is_staff());
drop policy if exists "sales_update_checklists_for_own_processing" on public.document_checklists;
create policy "sales_update_checklists_for_own_processing"
on public.document_checklists for update
to authenticated
using (
  exists (
    select 1 from public.loan_applications la
    where la.id = application_id
      and la.created_by = auth.uid()
      and la.status = 'under_processing'
      and public.current_role() = 'sales'
  )
)
with check (
  exists (
    select 1 from public.loan_applications la
    where la.id = application_id
      and la.created_by = auth.uid()
      and la.status = 'under_processing'
      and public.current_role() = 'sales'
  )
);
drop policy if exists "admin_update_checklists" on public.document_checklists;
create policy "admin_update_checklists" on public.document_checklists for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_read_emi_schedule" on public.emi_schedule;
create policy "staff_read_emi_schedule" on public.emi_schedule for select to authenticated using (public.is_staff());
drop policy if exists "admin_write_emi_schedule" on public.emi_schedule;
create policy "admin_write_emi_schedule" on public.emi_schedule for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "sales_submit_own_emi_for_verification" on public.emi_schedule;
create policy "sales_submit_own_emi_for_verification"
on public.emi_schedule for update
to authenticated
using (
  public.current_role() = 'sales'
  and status in ('pending', 'overdue')
  and exists (
    select 1
    from public.loan_applications la
    where la.id = application_id
      and la.created_by = auth.uid()
      and la.status = 'active'
  )
)
with check (
  public.current_role() = 'sales'
  and status = 'verification_pending'
  and exists (
    select 1
    from public.loan_applications la
    where la.id = application_id
      and la.created_by = auth.uid()
      and la.status = 'active'
  )
);

drop policy if exists "staff_read_payments" on public.payments;
create policy "staff_read_payments" on public.payments for select to authenticated using (public.is_staff());
drop policy if exists "admin_write_payments" on public.payments;
create policy "admin_write_payments" on public.payments for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_read_cash_requests" on public.cash_payment_requests;
create policy "staff_read_cash_requests" on public.cash_payment_requests for select to authenticated using (public.is_staff());
drop policy if exists "sales_create_cash_requests" on public.cash_payment_requests;
create policy "sales_create_cash_requests"
on public.cash_payment_requests for insert
to authenticated
with check (public.current_role() = 'sales' and created_by = auth.uid());
drop policy if exists "admin_update_cash_requests" on public.cash_payment_requests;
create policy "admin_update_cash_requests" on public.cash_payment_requests for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_read_payment_settings" on public.payment_settings;
create policy "staff_read_payment_settings" on public.payment_settings for select to authenticated using (public.is_staff());
drop policy if exists "admin_update_payment_settings" on public.payment_settings;
create policy "admin_update_payment_settings" on public.payment_settings for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "staff_read_activity_logs" on public.activity_logs;
create policy "staff_read_activity_logs" on public.activity_logs for select to authenticated using (public.is_staff());
drop policy if exists "staff_create_activity_logs" on public.activity_logs;
create policy "staff_create_activity_logs" on public.activity_logs for insert to authenticated with check (public.is_staff());
drop policy if exists "admin_update_activity_logs" on public.activity_logs;
create policy "admin_update_activity_logs" on public.activity_logs for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admin_read_login_logs" on public.login_logs;
create policy "admin_read_login_logs" on public.login_logs for select to authenticated using (public.is_admin());
drop policy if exists "staff_create_login_logs" on public.login_logs;
create policy "staff_create_login_logs" on public.login_logs for insert to authenticated with check (public.is_staff());
drop policy if exists "admin_update_login_logs" on public.login_logs;
create policy "admin_update_login_logs" on public.login_logs for update to authenticated using (public.is_admin()) with check (public.is_admin());

-- Helper for monthly log archive automation.
-- The app will keep only 2 months visible in Supabase. A scheduled worker can export
-- older rows to protected archive storage, then call this function with the export path.
create or replace function public.mark_old_logs_archived(export_path text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  affected integer;
  login_affected integer;
begin
  if not public.is_admin() then
    raise exception 'Only admin can mark logs archived.';
  end if;

  update public.activity_logs
  set archived_to = export_path,
      archived_at = now()
  where created_at < now() - interval '2 months'
    and archived_at is null;

  get diagnostics affected = row_count;

  update public.login_logs
  set archived_to = export_path,
      archived_at = now()
  where created_at < now() - interval '2 months'
    and archived_at is null;

  get diagnostics login_affected = row_count;
  return affected + login_affected;
end;
$$;
