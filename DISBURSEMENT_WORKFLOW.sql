-- RFG Financial disbursement-based EMI workflow
-- Run once in Supabase SQL Editor after BACKEND_HARDENING.sql and BACKEND_ADMIN_FEATURES.sql.

begin;

alter table public.loan_applications
  add column if not exists disbursed_by uuid references auth.users(id),
  add column if not exists disbursed_at timestamptz,
  add column if not exists disbursement_reference text,
  add column if not exists disbursement_notes text;

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

  if next_status = 'active' then
    raise exception 'Confirm the actual disbursement before activating this loan.';
  end if;

  if not (
    (application_row.status = 'under_processing' and next_status in ('approved', 'rejected'))
    or (application_row.status = 'active' and next_status = 'closed')
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

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Admin changed loan status',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'from', application_row.status,
      'to', next_status
    )
  );

  return jsonb_build_object(
    'loan_id', application_row.loan_id,
    'status', next_status
  );
end;
$$;

create or replace function public.activate_loan_after_disbursement(
  p_loan_id text,
  p_disbursed_at timestamptz,
  p_reference text,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  application_row public.loan_applications%rowtype;
  disbursement_date date;
  due_day_value integer;
  month_date date;
  due_date_value date;
  month_last_day integer;
  month_index integer;
  schedule_created integer := 0;
begin
  perform public.require_admin();

  if p_disbursed_at is null then
    raise exception 'Enter the actual disbursement date and time.';
  end if;

  if p_disbursed_at > now() + interval '5 minutes' then
    raise exception 'Disbursement time cannot be in the future.';
  end if;

  if nullif(trim(coalesce(p_reference, '')), '') is null then
    raise exception 'Enter the transfer reference, transaction ID or cash voucher number.';
  end if;

  select *
  into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if application_row.status <> 'approved' then
    raise exception 'Only an approved loan can be disbursed and activated.';
  end if;

  if exists (
    select 1
    from public.emi_schedule
    where application_id = application_row.id
  ) then
    raise exception 'An EMI schedule already exists for this loan.';
  end if;

  disbursement_date := (p_disbursed_at at time zone 'Asia/Kolkata')::date;
  due_day_value := extract(day from disbursement_date)::integer;

  update public.loan_applications
  set status = 'active',
      due_day = due_day_value,
      disbursed_by = auth.uid(),
      disbursed_at = p_disbursed_at,
      disbursement_reference = trim(p_reference),
      disbursement_notes = nullif(trim(coalesce(p_notes, '')), ''),
      updated_at = now()
  where id = application_row.id;

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
      status
    )
    values (
      application_row.id,
      to_char(due_date_value, 'Mon YYYY'),
      due_date_value,
      application_row.emi_amount,
      'pending'
    );

    schedule_created := schedule_created + 1;
  end loop;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Admin confirmed disbursement and activated loan',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'disbursed_at', p_disbursed_at,
      'reference', trim(p_reference),
      'notes', nullif(trim(coalesce(p_notes, '')), ''),
      'first_emi_due', (
        select min(due_date)
        from public.emi_schedule
        where application_id = application_row.id
      ),
      'schedule_created', schedule_created
    )
  );

  return jsonb_build_object(
    'loan_id', application_row.loan_id,
    'status', 'active',
    'disbursed_at', p_disbursed_at,
    'schedule_created', schedule_created
  );
end;
$$;

create or replace function public.admin_update_loan_terms(
  p_loan_id text,
  p_terms jsonb,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  application_row public.loan_applications%rowtype;
  old_terms jsonb;
  new_terms jsonb;
  product_price_value numeric(12,2);
  down_payment_value numeric(12,2);
  loan_amount_value numeric(12,2);
  charge_amount_value numeric(12,2);
  tenure_value integer;
  emi_amount_value numeric(12,2);
begin
  perform public.require_admin();

  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Enter a clear reason of at least 5 characters.';
  end if;

  select *
  into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if application_row.status <> 'approved' then
    raise exception 'Loan terms can be changed only before disbursement.';
  end if;

  begin
    product_price_value := (p_terms ->> 'product_price')::numeric;
    down_payment_value := (p_terms ->> 'down_payment')::numeric;
    loan_amount_value := (p_terms ->> 'loan_amount')::numeric;
    charge_amount_value := (p_terms ->> 'charge_amount')::numeric;
    tenure_value := (p_terms ->> 'tenure')::integer;
    emi_amount_value := (p_terms ->> 'emi_amount')::numeric;
  exception when others then
    raise exception 'Loan values contain invalid data.';
  end;

  if product_price_value <= 0
    or down_payment_value < 0
    or loan_amount_value <= 0
    or charge_amount_value < 0
    or tenure_value not between 1 and 120
    or emi_amount_value <= 0 then
    raise exception 'Loan values or tenure are outside the allowed range.';
  end if;

  old_terms := jsonb_build_object(
    'product_price', application_row.product_price,
    'down_payment', application_row.down_payment,
    'loan_amount', application_row.loan_amount,
    'charge_amount', application_row.charge_amount,
    'tenure', application_row.tenure,
    'emi_amount', application_row.emi_amount
  );

  new_terms := jsonb_build_object(
    'product_price', product_price_value,
    'down_payment', down_payment_value,
    'loan_amount', loan_amount_value,
    'charge_amount', charge_amount_value,
    'tenure', tenure_value,
    'emi_amount', emi_amount_value
  );

  update public.loan_applications
  set product_price = product_price_value,
      down_payment = down_payment_value,
      loan_amount = loan_amount_value,
      charge_amount = charge_amount_value,
      tenure = tenure_value,
      emi_amount = emi_amount_value,
      updated_at = now()
  where id = application_row.id;

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
    application_row.id,
    product_price_value,
    down_payment_value,
    loan_amount_value,
    charge_amount_value,
    tenure_value,
    emi_amount_value,
    application_row.due_day,
    trim(p_reason),
    auth.uid()
  );

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Admin updated loan terms before disbursement',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'reason', trim(p_reason),
      'old', old_terms,
      'new', new_terms
    )
  );

  return jsonb_build_object(
    'loan_id', application_row.loan_id,
    'terms', new_terms
  );
end;
$$;

grant select (
  disbursed_by,
  disbursed_at,
  disbursement_reference,
  disbursement_notes
) on public.loan_applications to authenticated;

revoke all on function public.activate_loan_after_disbursement(text, timestamptz, text, text)
from public, anon, authenticated;

grant execute on function public.activate_loan_after_disbursement(text, timestamptz, text, text)
to authenticated;

commit;
