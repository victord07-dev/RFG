-- RFG Financial backend hardening migration
-- Run once in Supabase SQL Editor after supabase-schema.sql.
-- Critical workflows become atomic RPC calls. The browser never receives a service-role key.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.loan_applications
  add column if not exists customer_mpin_hash text;

alter table public.cash_payment_requests
  add column if not exists emi_schedule_id uuid references public.emi_schedule(id) on delete restrict;

alter table public.cash_payment_requests
  add column if not exists request_mode text not null default 'cash';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'cash_payment_requests_mode_check'
  ) then
    alter table public.cash_payment_requests
      add constraint cash_payment_requests_mode_check
      check (request_mode in ('cash', 'manual_bank_qr'));
  end if;
end;
$$;

-- Migrate legacy plain-text MPINs to bcrypt hashes, then remove the readable value.
update public.loan_applications
set customer_mpin_hash = extensions.crypt(customer_mpin, extensions.gen_salt('bf', 10))
where customer_mpin_hash is null
  and customer_mpin ~ '^[0-9]{4,6}$';

update public.loan_applications
set customer_mpin = ''
where customer_mpin <> '';

alter table public.loan_applications
  alter column customer_mpin set default '';

create sequence if not exists public.rfg_loan_id_seq start with 1000;
create sequence if not exists public.rfg_cash_request_seq start with 1000;
create sequence if not exists public.rfg_payment_id_seq start with 1000;

create or replace function public.next_rfg_loan_id()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  loop
    candidate := 'RFG-' || to_char(current_date, 'YYMM') || '-' || lpad(nextval('public.rfg_loan_id_seq')::text, 4, '0');
    exit when not exists (select 1 from public.loan_applications where loan_id = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.next_rfg_cash_request_id()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  loop
    candidate := 'CR-' || lpad(nextval('public.rfg_cash_request_seq')::text, 6, '0');
    exit when not exists (select 1 from public.cash_payment_requests where request_id = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.next_rfg_payment_id()
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  candidate text;
begin
  loop
    candidate := 'PAY-' || to_char(clock_timestamp(), 'YYMMDD') || '-' || lpad(nextval('public.rfg_payment_id_seq')::text, 6, '0');
    exit when not exists (select 1 from public.payments where payment_id = candidate);
  end loop;
  return candidate;
end;
$$;

create or replace function public.require_active_staff()
returns public.user_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.user_role;
begin
  select role
  into actor_role
  from public.profiles
  where id = auth.uid()
    and active = true;

  if actor_role is null then
    raise exception 'Your staff account is not active.';
  end if;

  return actor_role;
end;
$$;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.require_active_staff() <> 'admin' then
    raise exception 'Admin access is required.';
  end if;
end;
$$;

create or replace function public.create_loan_application(
  p_application jsonb,
  p_checklist jsonb,
  p_plain_mpin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.user_role;
  actor_name text;
  new_loan_id text;
  new_application_id uuid;
  customer_row_id uuid;
  seller_row_id uuid;
  showroom_row_id uuid;
  category_value public.product_category;
  customer_mobile text := regexp_replace(coalesce(p_application ->> 'mobile', ''), '\D', '', 'g');
  alternate_mobile text := regexp_replace(coalesce(p_application ->> 'alternate_mobile', ''), '\D', '', 'g');
  seller_mobile_value text := regexp_replace(coalesce(p_application ->> 'seller_mobile', ''), '\D', '', 'g');
  showroom_mobile_value text := regexp_replace(coalesce(p_application ->> 'showroom_mobile', ''), '\D', '', 'g');
  product_price_value numeric(12,2);
  down_payment_value numeric(12,2);
  loan_amount_value numeric(12,2);
  charge_amount_value numeric(12,2);
  emi_amount_value numeric(12,2);
  tenure_value integer;
  due_day_value integer;
begin
  actor_role := public.require_active_staff();

  select full_name into actor_name
  from public.profiles
  where id = auth.uid();

  if nullif(trim(p_application ->> 'customer_name'), '') is null
    or nullif(trim(p_application ->> 'address'), '') is null
    or nullif(trim(p_application ->> 'product_name'), '') is null
    or nullif(trim(p_application ->> 'asset_id'), '') is null
    or nullif(trim(p_application ->> 'seller_name'), '') is null
    or nullif(trim(p_application ->> 'showroom_name'), '') is null
    or nullif(trim(p_application ->> 'remarks'), '') is null then
    raise exception 'Complete all mandatory application fields.';
  end if;

  if customer_mobile !~ '^[0-9]{10}$'
    or alternate_mobile !~ '^[0-9]{10}$'
    or seller_mobile_value !~ '^[0-9]{10}$'
    or showroom_mobile_value !~ '^[0-9]{10}$' then
    raise exception 'All mobile numbers must contain exactly 10 digits.';
  end if;

  if p_plain_mpin !~ '^[0-9]{4,6}$' then
    raise exception 'Customer MPIN must contain 4 to 6 digits.';
  end if;

  begin
    category_value := (p_application ->> 'category')::public.product_category;
    product_price_value := (p_application ->> 'product_price')::numeric;
    down_payment_value := (p_application ->> 'down_payment')::numeric;
    loan_amount_value := (p_application ->> 'loan_amount')::numeric;
    charge_amount_value := (p_application ->> 'charge_amount')::numeric;
    emi_amount_value := (p_application ->> 'emi_amount')::numeric;
    tenure_value := (p_application ->> 'tenure')::integer;
    due_day_value := (p_application ->> 'due_day')::integer;
  exception when others then
    raise exception 'Loan values contain invalid data.';
  end;

  if product_price_value <= 0
    or down_payment_value < 0
    or loan_amount_value <= 0
    or charge_amount_value < 0
    or emi_amount_value <= 0
    or tenure_value not between 1 and 120
    or due_day_value not between 1 and 31 then
    raise exception 'Loan amounts, tenure or due day are outside the allowed range.';
  end if;

  if not coalesce((p_checklist ->> 'aadhaar')::boolean, false)
    or not coalesce((p_checklist ->> 'pan')::boolean, false)
    or not coalesce((p_checklist ->> 'address')::boolean, false)
    or not coalesce((p_checklist ->> 'photo')::boolean, false)
    or not coalesce((p_checklist ->> 'signature')::boolean, false) then
    raise exception 'Complete all mandatory physical document checks.';
  end if;

  if category_value = 'two_wheeler'
    and (
      not coalesce((p_checklist ->> 'rc')::boolean, false)
      or not coalesce((p_checklist ->> 'insurance')::boolean, false)
    ) then
    raise exception 'RC and insurance checks are mandatory for two-wheelers.';
  end if;

  if category_value = 'electronics'
    and not coalesce((p_checklist ->> 'serial_checked')::boolean, false) then
    raise exception 'IMEI or serial verification is mandatory for electronics.';
  end if;

  insert into public.customers (
    customer_name, mobile, alternate_mobile, address, created_by
  )
  values (
    trim(p_application ->> 'customer_name'),
    customer_mobile,
    alternate_mobile,
    trim(p_application ->> 'address'),
    auth.uid()
  )
  on conflict (mobile) do update
  set customer_name = excluded.customer_name,
      alternate_mobile = excluded.alternate_mobile,
      address = excluded.address,
      updated_at = now()
  returning id into customer_row_id;

  insert into public.sellers (seller_name, seller_mobile, created_by)
  values (trim(p_application ->> 'seller_name'), seller_mobile_value, auth.uid())
  on conflict (seller_mobile) do update
  set seller_name = excluded.seller_name,
      updated_at = now()
  returning id into seller_row_id;

  insert into public.showrooms (showroom_name, showroom_mobile, created_by)
  values (trim(p_application ->> 'showroom_name'), showroom_mobile_value, auth.uid())
  on conflict (showroom_mobile) do update
  set showroom_name = excluded.showroom_name,
      updated_at = now()
  returning id into showroom_row_id;

  new_loan_id := public.next_rfg_loan_id();

  insert into public.loan_applications (
    loan_id,
    customer_id,
    seller_id,
    showroom_id,
    customer_name,
    mobile,
    alternate_mobile,
    address,
    category,
    product_name,
    asset_id,
    seller_name,
    seller_mobile,
    showroom_name,
    showroom_mobile,
    product_price,
    down_payment,
    loan_amount,
    charge_amount,
    tenure,
    emi_amount,
    due_day,
    status,
    sales_person,
    login_id,
    customer_mpin,
    customer_mpin_hash,
    remarks,
    created_by
  )
  values (
    new_loan_id,
    customer_row_id,
    seller_row_id,
    showroom_row_id,
    trim(p_application ->> 'customer_name'),
    customer_mobile,
    alternate_mobile,
    trim(p_application ->> 'address'),
    category_value,
    trim(p_application ->> 'product_name'),
    upper(trim(p_application ->> 'asset_id')),
    trim(p_application ->> 'seller_name'),
    seller_mobile_value,
    trim(p_application ->> 'showroom_name'),
    showroom_mobile_value,
    product_price_value,
    down_payment_value,
    loan_amount_value,
    charge_amount_value,
    tenure_value,
    emi_amount_value,
    due_day_value,
    'under_processing',
    coalesce(nullif(actor_name, ''), 'Sales User'),
    new_loan_id,
    '',
    extensions.crypt(p_plain_mpin, extensions.gen_salt('bf', 10)),
    trim(p_application ->> 'remarks'),
    auth.uid()
  )
  returning id into new_application_id;

  insert into public.loan_terms (
    application_id,
    product_price,
    down_payment,
    loan_amount,
    charge_amount,
    tenure,
    emi_amount,
    due_day,
    reason,
    changed_by
  )
  values (
    new_application_id,
    product_price_value,
    down_payment_value,
    loan_amount_value,
    charge_amount_value,
    tenure_value,
    emi_amount_value,
    due_day_value,
    'Initial terms',
    auth.uid()
  );

  insert into public.document_checklists (
    application_id,
    aadhaar,
    pan,
    address,
    photo,
    signature,
    seller_confirmed,
    seller_otp,
    rc,
    insurance,
    serial_checked
  )
  values (
    new_application_id,
    coalesce((p_checklist ->> 'aadhaar')::boolean, false),
    coalesce((p_checklist ->> 'pan')::boolean, false),
    coalesce((p_checklist ->> 'address')::boolean, false),
    coalesce((p_checklist ->> 'photo')::boolean, false),
    coalesce((p_checklist ->> 'signature')::boolean, false),
    coalesce((p_checklist ->> 'seller_confirmed')::boolean, false),
    coalesce((p_checklist ->> 'seller_otp')::boolean, false),
    coalesce((p_checklist ->> 'rc')::boolean, false),
    coalesce((p_checklist ->> 'insurance')::boolean, false),
    coalesce((p_checklist ->> 'serial_checked')::boolean, false)
  );

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    new_application_id,
    auth.uid(),
    'Application created',
    jsonb_build_object('loan_id', new_loan_id, 'role', actor_role)
  );

  return jsonb_build_object(
    'application_id', new_application_id,
    'loan_id', new_loan_id,
    'login_id', new_loan_id
  );
end;
$$;

create or replace function public.set_loan_status(
  p_loan_id text,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  application_row public.loan_applications%rowtype;
  next_status public.loan_status;
  schedule_created integer := 0;
  month_date date;
  due_date_value date;
  month_last_day integer;
  month_index integer;
begin
  perform public.require_admin();

  begin
    next_status := p_status::public.loan_status;
  exception when others then
    raise exception 'Unknown loan status.';
  end;

  select *
  into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if not (
    (application_row.status = 'under_processing' and next_status in ('approved', 'rejected'))
    or (application_row.status = 'approved' and next_status = 'active')
    or (application_row.status = 'active' and next_status in ('active', 'closed'))
  ) then
    raise exception 'Invalid loan status change from % to %.', application_row.status, next_status;
  end if;

  update public.loan_applications
  set status = next_status,
      approved_by = case when next_status = 'approved' then auth.uid() else approved_by end,
      approved_at = case when next_status = 'approved' then now() else approved_at end,
      closed_by = case when next_status = 'closed' then auth.uid() else closed_by end,
      closed_at = case when next_status = 'closed' then now() else closed_at end
  where id = application_row.id;

  if next_status = 'active' then
    for month_index in 1..application_row.tenure loop
      month_date := (date_trunc('month', current_date) + make_interval(months => month_index))::date;
      month_last_day := extract(day from ((month_date + interval '1 month') - interval '1 day'))::integer;
      due_date_value := make_date(
        extract(year from month_date)::integer,
        extract(month from month_date)::integer,
        least(application_row.due_day, month_last_day)
      );

      insert into public.emi_schedule (
        application_id, emi_month, due_date, amount, status
      )
      values (
        application_row.id,
        to_char(due_date_value, 'Mon YYYY'),
        due_date_value,
        application_row.emi_amount,
        'pending'
      )
      on conflict (application_id, emi_month) do nothing;

      if found then
        schedule_created := schedule_created + 1;
      end if;
    end loop;
  end if;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    case
      when next_status = 'active' then 'Admin activated loan and generated EMI schedule'
      else 'Admin changed loan status'
    end,
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'from', application_row.status,
      'to', next_status,
      'schedule_created', schedule_created
    )
  );

  return jsonb_build_object(
    'loan_id', application_row.loan_id,
    'status', next_status,
    'schedule_created', schedule_created
  );
end;
$$;

create or replace function public.submit_cash_payment_request(
  p_application_id uuid,
  p_emi_schedule_id uuid,
  p_remarks text default '',
  p_mode text default 'cash'
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.user_role;
  actor_name text;
  application_row public.loan_applications%rowtype;
  emi_row public.emi_schedule%rowtype;
  new_request_id text;
  new_request_uuid uuid;
begin
  actor_role := public.require_active_staff();

  if p_mode not in ('cash', 'manual_bank_qr') then
    raise exception 'Unsupported payment request mode.';
  end if;

  select *
  into application_row
  from public.loan_applications
  where id = p_application_id
  for update;

  if application_row.id is null or application_row.status <> 'active' then
    raise exception 'Only active loans can receive EMI payment requests.';
  end if;

  if actor_role = 'sales' and application_row.created_by <> auth.uid() then
    raise exception 'You can submit payment requests only for your own applications.';
  end if;

  select *
  into emi_row
  from public.emi_schedule
  where id = p_emi_schedule_id
    and application_id = application_row.id
  for update;

  if emi_row.id is null then
    raise exception 'EMI schedule row not found.';
  end if;

  if emi_row.status not in ('pending', 'overdue') then
    raise exception 'This EMI is not available for a new payment request.';
  end if;

  if exists (
    select 1
    from public.cash_payment_requests
    where emi_schedule_id = emi_row.id
      and status = 'verification_pending'
  ) then
    raise exception 'This EMI already has a request waiting for admin.';
  end if;

  select full_name into actor_name
  from public.profiles
  where id = auth.uid();

  new_request_id := public.next_rfg_cash_request_id();

  insert into public.cash_payment_requests (
    request_id,
    application_id,
    emi_schedule_id,
    emi_month,
    amount,
    collected_by,
    collected_at,
    remarks,
    request_mode,
    status,
    created_by
  )
  values (
    new_request_id,
    application_row.id,
    emi_row.id,
    emi_row.emi_month,
    emi_row.amount,
    coalesce(nullif(actor_name, ''), 'Sales User'),
    to_char(now(), 'DD Mon YYYY, HH12:MI AM'),
    trim(coalesce(p_remarks, '')),
    p_mode,
    'verification_pending',
    auth.uid()
  )
  returning id into new_request_uuid;

  update public.emi_schedule
  set status = 'verification_pending'
  where id = emi_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    case when p_mode = 'cash' then 'Cash request submitted' else 'Manual bank QR submitted' end,
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'request_id', new_request_id,
      'emi_month', emi_row.emi_month,
      'amount', emi_row.amount,
      'mode', p_mode
    )
  );

  return jsonb_build_object(
    'id', new_request_uuid,
    'request_id', new_request_id,
    'amount', emi_row.amount,
    'status', 'verification_pending'
  );
end;
$$;

create or replace function public.review_payment_request(
  p_request_id text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  request_row public.cash_payment_requests%rowtype;
  payment_uuid uuid;
  new_payment_id text;
  payment_mode_value text;
begin
  perform public.require_admin();

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select *
  into request_row
  from public.cash_payment_requests
  where request_id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Payment request not found.';
  end if;

  if request_row.status <> 'verification_pending' then
    raise exception 'This payment request was already reviewed.';
  end if;

  perform 1
  from public.emi_schedule
  where id = request_row.emi_schedule_id
  for update;

  if not found then
    raise exception 'Matching EMI schedule row was not found.';
  end if;

  if p_decision = 'approved' then
    if exists (
      select 1
      from public.payments
      where emi_schedule_id = request_row.emi_schedule_id
        and status = 'paid'
    ) then
      raise exception 'This EMI already has a confirmed payment.';
    end if;

    new_payment_id := public.next_rfg_payment_id();
    payment_mode_value := case
      when request_row.request_mode = 'manual_bank_qr' then 'manual_bank_qr'
      else 'cash'
    end;

    insert into public.payments (
      payment_id,
      application_id,
      emi_schedule_id,
      amount,
      mode,
      status,
      reference,
      notes,
      created_by,
      verified_by,
      verified_at
    )
    values (
      new_payment_id,
      request_row.application_id,
      request_row.emi_schedule_id,
      request_row.amount,
      payment_mode_value,
      'paid',
      request_row.request_id,
      request_row.remarks,
      request_row.created_by,
      auth.uid(),
      now()
    )
    returning id into payment_uuid;

    update public.emi_schedule
    set status = 'paid'
    where id = request_row.emi_schedule_id;
  else
    update public.emi_schedule
    set status = 'pending'
    where id = request_row.emi_schedule_id;
  end if;

  update public.cash_payment_requests
  set status = p_decision::public.cash_request_status,
      payment_id = payment_uuid,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = request_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    request_row.application_id,
    auth.uid(),
    case when p_decision = 'approved' then 'Admin confirmed payment' else 'Admin rejected payment' end,
    jsonb_build_object(
      'request_id', request_row.request_id,
      'payment_id', new_payment_id,
      'decision', p_decision
    )
  );

  return jsonb_build_object(
    'request_id', request_row.request_id,
    'decision', p_decision,
    'payment_id', new_payment_id
  );
end;
$$;

create or replace function public.reset_customer_mpin(
  p_loan_id text,
  p_plain_mpin text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.user_role;
  application_row public.loan_applications%rowtype;
begin
  actor_role := public.require_active_staff();

  if p_plain_mpin !~ '^[0-9]{4,6}$' then
    raise exception 'Customer MPIN must contain 4 to 6 digits.';
  end if;

  select *
  into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if actor_role = 'sales' and application_row.created_by <> auth.uid() then
    raise exception 'You can reset MPIN only for your own applications.';
  end if;

  update public.loan_applications
  set customer_mpin = '',
      customer_mpin_hash = extensions.crypt(p_plain_mpin, extensions.gen_salt('bf', 10))
  where id = application_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Customer MPIN reset',
    jsonb_build_object('loan_id', application_row.loan_id)
  );

  return true;
end;
$$;

-- Intended for a trusted Edge Function/server when the Android customer login is built.
create or replace function public.verify_customer_mpin(
  p_login_id text,
  p_plain_mpin text
)
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select id
  from public.loan_applications
  where login_id = p_login_id
    and status in ('approved', 'active', 'closed')
    and customer_mpin_hash is not null
    and customer_mpin_hash = extensions.crypt(p_plain_mpin, customer_mpin_hash)
  limit 1;
$$;

create or replace function public.confirm_seller_for_application(p_loan_id text)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.user_role;
  application_row public.loan_applications%rowtype;
begin
  actor_role := public.require_active_staff();

  select *
  into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if actor_role = 'sales'
    and (application_row.created_by <> auth.uid() or application_row.status <> 'under_processing') then
    raise exception 'You cannot update this application.';
  end if;

  update public.document_checklists
  set seller_confirmed = true
  where application_id = application_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Seller/Lender confirmed',
    jsonb_build_object('loan_id', application_row.loan_id)
  );

  return true;
end;
$$;

create or replace function public.admin_set_staff_access(
  p_profile_id uuid,
  p_active boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform public.require_admin();

  if p_profile_id = auth.uid() then
    raise exception 'The current admin cannot deactivate their own account.';
  end if;

  update public.profiles
  set active = p_active
  where id = p_profile_id;

  if not found then
    raise exception 'Staff profile not found.';
  end if;

  insert into public.activity_logs (actor_id, action, details)
  values (
    auth.uid(),
    'Admin updated staff access',
    jsonb_build_object('profile_id', p_profile_id, 'active', p_active)
  );

  return true;
end;
$$;

drop function if exists public.record_login_event();

create or replace function public.record_login_event(p_user_agent text default null)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  profile_row public.profiles%rowtype;
begin
  select *
  into profile_row
  from public.profiles
  where id = auth.uid()
    and active = true;

  if profile_row.id is null then
    return false;
  end if;

  insert into public.login_logs (user_id, email, role, success, user_agent)
  values (auth.uid(), profile_row.email, profile_row.role, true, nullif(trim(p_user_agent), ''));

  return true;
end;
$$;

-- Populate EMI links for existing requests where they can be identified safely.
update public.cash_payment_requests request
set emi_schedule_id = emi.id
from public.emi_schedule emi
where request.emi_schedule_id is null
  and emi.application_id = request.application_id
  and emi.emi_month = request.emi_month;

do $$
begin
  if exists (
    select 1
    from public.cash_payment_requests
    where status = 'verification_pending'
      and emi_schedule_id is not null
    group by emi_schedule_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate verification-pending requests exist for the same EMI. Resolve them before running this migration.';
  end if;

  if exists (
    select 1
    from public.payments
    where status = 'paid'
      and emi_schedule_id is not null
    group by emi_schedule_id
    having count(*) > 1
  ) then
    raise exception 'Duplicate paid records exist for the same EMI. Resolve them before running this migration.';
  end if;
end;
$$;

create unique index if not exists cash_requests_one_pending_per_emi
on public.cash_payment_requests (emi_schedule_id)
where status = 'verification_pending' and emi_schedule_id is not null;

create unique index if not exists payments_one_paid_per_emi
on public.payments (emi_schedule_id)
where status = 'paid' and emi_schedule_id is not null;

-- Staff only see their own operational records; admin sees everything.
drop policy if exists "staff_read_applications" on public.loan_applications;
create policy "staff_read_applications"
on public.loan_applications for select
to authenticated
using (
  public.is_admin()
  or (public.current_role() = 'sales' and created_by = auth.uid())
);

drop policy if exists "staff_read_customers" on public.customers;
create policy "staff_read_customers"
on public.customers for select
to authenticated
using (
  public.is_admin()
  or (public.current_role() = 'sales' and created_by = auth.uid())
);

drop policy if exists "staff_read_sellers" on public.sellers;
create policy "staff_read_sellers"
on public.sellers for select
to authenticated
using (
  public.is_admin()
  or (public.current_role() = 'sales' and created_by = auth.uid())
);

drop policy if exists "staff_read_showrooms" on public.showrooms;
create policy "staff_read_showrooms"
on public.showrooms for select
to authenticated
using (
  public.is_admin()
  or (public.current_role() = 'sales' and created_by = auth.uid())
);

drop policy if exists "staff_read_checklists" on public.document_checklists;
create policy "staff_read_checklists"
on public.document_checklists for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.loan_applications application
    where application.id = application_id
      and application.created_by = auth.uid()
      and public.current_role() = 'sales'
  )
);

drop policy if exists "staff_read_loan_terms" on public.loan_terms;
create policy "staff_read_loan_terms"
on public.loan_terms for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.loan_applications application
    where application.id = application_id
      and application.created_by = auth.uid()
      and public.current_role() = 'sales'
  )
);

drop policy if exists "staff_read_emi_schedule" on public.emi_schedule;
create policy "staff_read_emi_schedule"
on public.emi_schedule for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.loan_applications application
    where application.id = application_id
      and application.created_by = auth.uid()
      and public.current_role() = 'sales'
  )
);

drop policy if exists "staff_read_payments" on public.payments;
create policy "staff_read_payments"
on public.payments for select
to authenticated
using (
  public.is_admin()
  or exists (
    select 1
    from public.loan_applications application
    where application.id = application_id
      and application.created_by = auth.uid()
      and public.current_role() = 'sales'
  )
);

drop policy if exists "staff_read_cash_requests" on public.cash_payment_requests;
create policy "staff_read_cash_requests"
on public.cash_payment_requests for select
to authenticated
using (
  public.is_admin()
  or (public.current_role() = 'sales' and created_by = auth.uid())
);

drop policy if exists "staff_read_activity_logs" on public.activity_logs;
create policy "staff_read_activity_logs"
on public.activity_logs for select
to authenticated
using (
  public.is_admin()
  or (
    public.current_role() = 'sales'
    and (
      actor_id = auth.uid()
      or exists (
        select 1
        from public.loan_applications application
        where application.id = application_id
          and application.created_by = auth.uid()
      )
    )
  )
);

-- Remove direct mutation paths. Critical writes must use the RPC functions above.
revoke insert, update on public.customers from authenticated;
revoke insert, update on public.sellers from authenticated;
revoke insert, update on public.showrooms from authenticated;
revoke insert, update on public.loan_applications from authenticated;
revoke select on public.loan_applications from authenticated;
revoke insert on public.loan_terms from authenticated;
revoke insert, update on public.document_checklists from authenticated;
revoke insert, update on public.emi_schedule from authenticated;
revoke insert, update on public.payments from authenticated;
revoke insert, update on public.cash_payment_requests from authenticated;
revoke update on public.profiles from authenticated;
revoke insert, update on public.activity_logs from authenticated;
revoke insert, update on public.login_logs from authenticated;

-- MPIN hashes and legacy MPIN storage are never readable from browser clients.
grant select (
  id,
  loan_id,
  customer_id,
  seller_id,
  showroom_id,
  customer_name,
  mobile,
  alternate_mobile,
  address,
  category,
  product_name,
  asset_id,
  seller_name,
  seller_mobile,
  showroom_name,
  showroom_mobile,
  product_price,
  down_payment,
  loan_amount,
  charge_amount,
  tenure,
  emi_amount,
  due_day,
  status,
  sales_person,
  login_id,
  remarks,
  created_by,
  approved_by,
  approved_at,
  closed_by,
  closed_at,
  created_at,
  updated_at
) on public.loan_applications to authenticated;

revoke all on function public.next_rfg_loan_id() from public, anon, authenticated;
revoke all on function public.next_rfg_cash_request_id() from public, anon, authenticated;
revoke all on function public.next_rfg_payment_id() from public, anon, authenticated;
revoke all on function public.require_active_staff() from public, anon, authenticated;
revoke all on function public.require_admin() from public, anon, authenticated;
revoke all on function public.verify_customer_mpin(text, text) from public, anon, authenticated;
revoke all on function public.create_loan_application(jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.set_loan_status(text, text) from public, anon, authenticated;
revoke all on function public.submit_cash_payment_request(uuid, uuid, text, text) from public, anon, authenticated;
revoke all on function public.review_payment_request(text, text) from public, anon, authenticated;
revoke all on function public.reset_customer_mpin(text, text) from public, anon, authenticated;
revoke all on function public.confirm_seller_for_application(text) from public, anon, authenticated;
revoke all on function public.admin_set_staff_access(uuid, boolean) from public, anon, authenticated;
revoke all on function public.record_login_event(text) from public, anon, authenticated;

grant execute on function public.create_loan_application(jsonb, jsonb, text) to authenticated;
grant execute on function public.set_loan_status(text, text) to authenticated;
grant execute on function public.submit_cash_payment_request(uuid, uuid, text, text) to authenticated;
grant execute on function public.review_payment_request(text, text) to authenticated;
grant execute on function public.reset_customer_mpin(text, text) to authenticated;
grant execute on function public.confirm_seller_for_application(text) to authenticated;
grant execute on function public.admin_set_staff_access(uuid, boolean) to authenticated;
grant execute on function public.record_login_event(text) to authenticated;

-- Only a trusted server/Edge Function may verify customer MPINs.
grant execute on function public.verify_customer_mpin(text, text) to service_role;

commit;

select 'RFG backend hardening installed' as result;
