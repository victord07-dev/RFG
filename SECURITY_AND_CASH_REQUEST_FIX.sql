-- RFG production hardening and cash-request repair
-- Run once in the Supabase SQL Editor as the project owner.

begin;

-- Critical payment tables are read-only to browser roles. All mutations must
-- pass through the protected RPCs below.
revoke insert, update, delete on table public.emi_schedule from anon, authenticated;
revoke insert, update, delete on table public.cash_payment_requests from anon, authenticated;
revoke insert, update, delete on table public.payments from anon, authenticated;

alter table public.emi_schedule enable row level security;
alter table public.cash_payment_requests enable row level security;
alter table public.payments enable row level security;

-- Sales can read only schedules belonging to applications they created.
drop policy if exists "staff_read_emi_schedule" on public.emi_schedule;
create policy "staff_read_emi_schedule"
on public.emi_schedule
for select
to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.loan_applications as application
    where application.id = emi_schedule.application_id
      and application.created_by = (select auth.uid())
      and (select public.current_role()) = 'sales'
  )
);

-- Sales can read only requests they submitted. Admin can read all requests.
drop policy if exists "staff_read_cash_requests" on public.cash_payment_requests;
create policy "staff_read_cash_requests"
on public.cash_payment_requests
for select
to authenticated
using (
  (select public.is_admin())
  or (
    (select public.current_role()) = 'sales'
    and created_by = (select auth.uid())
  )
);

-- Sales can read payment records only for their own applications.
drop policy if exists "staff_read_payments" on public.payments;
create policy "staff_read_payments"
on public.payments
for select
to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1
    from public.loan_applications as application
    where application.id = payments.application_id
      and application.created_by = (select auth.uid())
      and (select public.current_role()) = 'sales'
  )
);

-- Remove obsolete direct-write policies. Privilege revocation above is the
-- primary barrier; removing policies provides defense in depth.
drop policy if exists "admin_write_emi_schedule" on public.emi_schedule;
drop policy if exists "sales_submit_own_emi_for_verification" on public.emi_schedule;
drop policy if exists "sales_create_cash_requests" on public.cash_payment_requests;
drop policy if exists "admin_update_cash_requests" on public.cash_payment_requests;
drop policy if exists "admin_write_payments" on public.payments;

-- Repair legacy active loans that were activated before schedule generation
-- was made atomic. This runs only as an owner migration, never from a browser.
do $$
declare
  application_row public.loan_applications%rowtype;
  disbursement_date date;
  month_date date;
  due_date_value date;
  month_last_day integer;
  due_day_value integer;
  month_index integer;
begin
  for application_row in
    select application.*
    from public.loan_applications as application
    where application.status = 'active'
      and application.disbursed_at is not null
      and application.tenure > 0
      and application.emi_amount > 0
      and not exists (
        select 1
        from public.emi_schedule as schedule
        where schedule.application_id = application.id
      )
    for update
  loop
    disbursement_date := (application_row.disbursed_at at time zone 'Asia/Kolkata')::date;
    due_day_value := extract(day from disbursement_date)::integer;

    for month_index in 1..application_row.tenure loop
      month_date := (
        date_trunc('month', disbursement_date)
        + make_interval(months => month_index)
      )::date;
      month_last_day := extract(
        day from ((month_date + interval '1 month') - interval '1 day')
      )::integer;
      due_date_value := make_date(
        extract(year from month_date)::integer,
        extract(month from month_date)::integer,
        least(due_day_value, month_last_day)
      );

      insert into public.emi_schedule (
        application_id,
        emi_month,
        due_date,
        amount,
        carry_forward_amount,
        paid_amount,
        status
      ) values (
        application_row.id,
        to_char(due_date_value, 'Mon YYYY'),
        due_date_value,
        application_row.emi_amount,
        0,
        0,
        'pending'
      );
    end loop;
  end loop;
end;
$$;

-- Only this exact, authenticated RPC may create a staff cash request.
drop function if exists public.submit_cash_payment_request(uuid, uuid, text, text);
drop function if exists public.submit_cash_payment_request(uuid, uuid, text, text, numeric);

create function public.submit_cash_payment_request(
  p_application_id uuid,
  p_emi_schedule_id uuid,
  p_remarks text default '',
  p_mode text default 'cash',
  p_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_role public.user_role;
  actor_name text;
  application_row public.loan_applications%rowtype;
  emi_row public.emi_schedule%rowtype;
  new_request_id text;
  new_request_uuid uuid;
  payable_amount numeric(12,2);
  requested_amount numeric(12,2);
  short_amount numeric(12,2);
  carry_amount numeric(12,2);
  applied_penalty numeric(12,2);
  metadata_line text;
  metadata_json jsonb;
  payment_reference text;
begin
  actor_role := public.require_active_staff();
  perform public.refresh_overdue_emis();

  if p_mode not in ('cash', 'manual_bank_qr') then
    raise exception 'Unsupported payment method.';
  end if;

  if p_mode = 'manual_bank_qr' then
    begin
      metadata_line := split_part(coalesce(p_remarks, ''), E'\n', 1);
      if metadata_line not like '[[RFG_PAYMENT_REQUEST_META]]%' then
        raise exception 'Payment reference metadata is missing.';
      end if;
      metadata_json := substring(
        metadata_line from length('[[RFG_PAYMENT_REQUEST_META]]') + 1
      )::jsonb;
      payment_reference := nullif(btrim(metadata_json ->> 'reference'), '');
    exception
      when others then
        raise exception 'Enter a valid UTR or transaction ID for Bank Transfer / QR.';
    end;

    if payment_reference is null then
      raise exception 'Enter the UTR or transaction ID for Bank Transfer / QR.';
    end if;
  end if;

  select application.*
  into application_row
  from public.loan_applications as application
  where application.id = p_application_id
  for update;

  if application_row.id is null then
    raise exception 'Loan application not found.';
  end if;

  if application_row.status <> 'active' then
    raise exception 'Cash requests are available only after disbursement and loan activation.';
  end if;

  if actor_role = 'sales' and application_row.created_by <> (select auth.uid()) then
    raise exception 'You cannot submit a payment request for another sales member''s application.';
  end if;

  select schedule.*
  into emi_row
  from public.emi_schedule as schedule
  where schedule.id = p_emi_schedule_id
    and schedule.application_id = application_row.id
  for update;

  if emi_row.id is null then
    raise exception 'The selected EMI does not belong to this loan.';
  end if;

  if emi_row.status not in ('pending', 'overdue') then
    raise exception 'This EMI is not available for a new payment request.';
  end if;

  if exists (
    select 1
    from public.cash_payment_requests as request
    where request.emi_schedule_id = emi_row.id
      and request.status = 'verification_pending'
  ) then
    raise exception 'This EMI already has a request waiting for admin verification.';
  end if;

  carry_amount := coalesce(emi_row.carry_forward_amount, 0);
  payable_amount := public.emi_payable_amount(
    emi_row.amount + carry_amount,
    emi_row.due_date,
    emi_row.status,
    emi_row.grace_days,
    emi_row.penalty_amount
  );
  requested_amount := round(coalesce(p_amount, payable_amount), 2);
  short_amount := round(payable_amount - requested_amount, 2);
  applied_penalty := greatest(payable_amount - emi_row.amount - carry_amount, 0);

  if requested_amount <= 0 then
    raise exception 'Collected amount must be greater than zero.';
  end if;

  if requested_amount > payable_amount then
    raise exception 'Collected amount cannot exceed the server-calculated EMI due amount.';
  end if;

  if short_amount > 0 and not exists (
    select 1
    from public.emi_schedule as next_emi
    where next_emi.application_id = application_row.id
      and next_emi.due_date > emi_row.due_date
      and next_emi.status in ('pending', 'overdue')
  ) then
    raise exception 'The final EMI must be collected in full.';
  end if;

  select profile.full_name
  into actor_name
  from public.profiles as profile
  where profile.id = (select auth.uid());

  new_request_id := public.next_rfg_cash_request_id();

  insert into public.cash_payment_requests (
    request_id,
    application_id,
    emi_schedule_id,
    emi_month,
    amount,
    emi_due_amount,
    short_amount,
    carry_forward_amount,
    collected_by,
    collected_at,
    remarks,
    request_mode,
    status,
    created_by
  ) values (
    new_request_id,
    application_row.id,
    emi_row.id,
    emi_row.emi_month,
    requested_amount,
    payable_amount,
    short_amount,
    carry_amount,
    coalesce(nullif(actor_name, ''), 'Sales User'),
    to_char(now(), 'DD Mon YYYY, HH12:MI AM'),
    left(trim(coalesce(p_remarks, '')), 1000),
    p_mode,
    'verification_pending',
    (select auth.uid())
  )
  returning id into new_request_uuid;

  update public.emi_schedule
  set status = 'verification_pending'
  where id = emi_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    (select auth.uid()),
    case
      when p_mode = 'cash' then 'Cash request submitted'
      else 'Bank Transfer / QR submitted'
    end,
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'request_id', new_request_id,
      'emi_schedule_id', emi_row.id,
      'emi_month', emi_row.emi_month,
      'base_emi_amount', emi_row.amount,
      'carry_forward_amount', carry_amount,
      'penalty_amount', applied_penalty,
      'emi_due_amount', payable_amount,
      'amount', requested_amount,
      'short_amount', short_amount,
      'mode', p_mode,
      'payment_reference', payment_reference
    )
  );

  return jsonb_build_object(
    'id', new_request_uuid,
    'request_id', new_request_id,
    'emi_schedule_id', emi_row.id,
    'amount', requested_amount,
    'emi_due_amount', payable_amount,
    'short_amount', short_amount,
    'status', 'verification_pending'
  );
end;
$$;

revoke all on function public.submit_cash_payment_request(uuid, uuid, text, text, numeric)
from public, anon, authenticated;
grant execute on function public.submit_cash_payment_request(uuid, uuid, text, text, numeric)
to authenticated;

commit;

-- Verification output: each value should be true/zero as labelled.
select
  (select relrowsecurity from pg_class where oid = 'public.emi_schedule'::regclass) as emi_rls_enabled,
  (select relrowsecurity from pg_class where oid = 'public.cash_payment_requests'::regclass) as requests_rls_enabled,
  not has_table_privilege('authenticated', 'public.emi_schedule', 'INSERT,UPDATE,DELETE') as emi_direct_writes_blocked,
  not has_table_privilege('authenticated', 'public.cash_payment_requests', 'INSERT,UPDATE,DELETE') as request_direct_writes_blocked,
  not has_table_privilege('authenticated', 'public.payments', 'INSERT,UPDATE,DELETE') as payment_direct_writes_blocked,
  (
    select count(*) = 0
    from public.loan_applications as application
    where application.status = 'active'
      and application.disbursed_at is not null
      and not exists (
        select 1 from public.emi_schedule as schedule
        where schedule.application_id = application.id
      )
  ) as all_active_loans_have_schedules;
