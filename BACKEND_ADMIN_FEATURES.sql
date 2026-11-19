-- RFG Financial admin backend features
-- Run once after BACKEND_HARDENING.sql.

begin;

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
  due_day_value integer;
  schedule_changed boolean;
  has_payment_activity boolean;
  month_date date;
  due_date_value date;
  month_last_day integer;
  month_index integer;
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

  if application_row.status not in ('approved', 'active') then
    raise exception 'Terms can be changed only for approved or active loans.';
  end if;

  begin
    product_price_value := (p_terms ->> 'product_price')::numeric;
    down_payment_value := (p_terms ->> 'down_payment')::numeric;
    loan_amount_value := (p_terms ->> 'loan_amount')::numeric;
    charge_amount_value := (p_terms ->> 'charge_amount')::numeric;
    tenure_value := (p_terms ->> 'tenure')::integer;
    emi_amount_value := (p_terms ->> 'emi_amount')::numeric;
    due_day_value := (p_terms ->> 'due_day')::integer;
  exception when others then
    raise exception 'Loan values contain invalid data.';
  end;

  if product_price_value <= 0
    or down_payment_value < 0
    or loan_amount_value <= 0
    or charge_amount_value < 0
    or tenure_value not between 1 and 120
    or emi_amount_value <= 0
    or due_day_value not between 1 and 31 then
    raise exception 'Loan values, tenure or due day are outside the allowed range.';
  end if;

  schedule_changed :=
    tenure_value <> application_row.tenure
    or emi_amount_value <> application_row.emi_amount
    or due_day_value <> application_row.due_day;

  select exists (
    select 1
    from public.payments
    where application_id = application_row.id
  ) or exists (
    select 1
    from public.cash_payment_requests
    where application_id = application_row.id
  )
  into has_payment_activity;

  if application_row.status = 'active' and schedule_changed and has_payment_activity then
    raise exception 'EMI amount, tenure or due day cannot change after payment activity has started.';
  end if;

  old_terms := jsonb_build_object(
    'product_price', application_row.product_price,
    'down_payment', application_row.down_payment,
    'loan_amount', application_row.loan_amount,
    'charge_amount', application_row.charge_amount,
    'tenure', application_row.tenure,
    'emi_amount', application_row.emi_amount,
    'due_day', application_row.due_day
  );

  new_terms := jsonb_build_object(
    'product_price', product_price_value,
    'down_payment', down_payment_value,
    'loan_amount', loan_amount_value,
    'charge_amount', charge_amount_value,
    'tenure', tenure_value,
    'emi_amount', emi_amount_value,
    'due_day', due_day_value
  );

  update public.loan_applications
  set product_price = product_price_value,
      down_payment = down_payment_value,
      loan_amount = loan_amount_value,
      charge_amount = charge_amount_value,
      tenure = tenure_value,
      emi_amount = emi_amount_value,
      due_day = due_day_value
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
    due_day_value,
    trim(p_reason),
    auth.uid()
  );

  if application_row.status = 'active' and schedule_changed then
    delete from public.emi_schedule
    where application_id = application_row.id;

    for month_index in 1..tenure_value loop
      month_date := (date_trunc('month', current_date) + make_interval(months => month_index))::date;
      month_last_day := extract(day from ((month_date + interval '1 month') - interval '1 day'))::integer;
      due_date_value := make_date(
        extract(year from month_date)::integer,
        extract(month from month_date)::integer,
        least(due_day_value, month_last_day)
      );

      insert into public.emi_schedule (
        application_id, emi_month, due_date, amount, status
      )
      values (
        application_row.id,
        to_char(due_date_value, 'Mon YYYY'),
        due_date_value,
        emi_amount_value,
        'pending'
      );
    end loop;
  end if;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Admin updated loan terms',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'reason', trim(p_reason),
      'old', old_terms,
      'new', new_terms,
      'schedule_regenerated', application_row.status = 'active' and schedule_changed
    )
  );

  return jsonb_build_object(
    'loan_id', application_row.loan_id,
    'old', old_terms,
    'new', new_terms,
    'schedule_regenerated', application_row.status = 'active' and schedule_changed
  );
end;
$$;

create or replace function public.admin_update_payment_settings(
  p_manual_bank_qr_enabled boolean,
  p_cash_request_enabled boolean,
  p_razorpay_enabled boolean,
  p_bank_account_name text,
  p_bank_name text,
  p_bank_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  old_settings jsonb;
  new_settings jsonb;
begin
  perform public.require_admin();

  if p_manual_bank_qr_enabled
    and (
      nullif(trim(coalesce(p_bank_account_name, '')), '') is null
      or nullif(trim(coalesce(p_bank_name, '')), '') is null
    ) then
    raise exception 'Bank name and account holder name are required when manual bank QR is enabled.';
  end if;

  select to_jsonb(settings)
  into old_settings
  from public.payment_settings settings
  where id = true
  for update;

  insert into public.payment_settings (
    id,
    manual_bank_qr_enabled,
    cash_request_enabled,
    razorpay_enabled,
    bank_account_name,
    bank_name,
    bank_notes,
    updated_by,
    updated_at
  )
  values (
    true,
    p_manual_bank_qr_enabled,
    p_cash_request_enabled,
    p_razorpay_enabled,
    trim(coalesce(p_bank_account_name, '')),
    trim(coalesce(p_bank_name, '')),
    trim(coalesce(p_bank_notes, '')),
    auth.uid(),
    now()
  )
  on conflict (id) do update
  set manual_bank_qr_enabled = excluded.manual_bank_qr_enabled,
      cash_request_enabled = excluded.cash_request_enabled,
      razorpay_enabled = excluded.razorpay_enabled,
      bank_account_name = excluded.bank_account_name,
      bank_name = excluded.bank_name,
      bank_notes = excluded.bank_notes,
      updated_by = excluded.updated_by,
      updated_at = excluded.updated_at;

  select to_jsonb(settings)
  into new_settings
  from public.payment_settings settings
  where id = true;

  insert into public.activity_logs (actor_id, action, details)
  values (
    auth.uid(),
    'Admin updated payment settings',
    jsonb_build_object('old', old_settings, 'new', new_settings)
  );

  return new_settings;
end;
$$;

create or replace function public.enforce_enabled_payment_request_mode()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  settings_row public.payment_settings%rowtype;
begin
  select *
  into settings_row
  from public.payment_settings
  where id = true;

  if new.request_mode = 'cash' and not coalesce(settings_row.cash_request_enabled, false) then
    raise exception 'Cash payment requests are currently disabled.';
  end if;

  if new.request_mode = 'manual_bank_qr' and not coalesce(settings_row.manual_bank_qr_enabled, false) then
    raise exception 'Manual bank QR requests are currently disabled.';
  end if;

  return new;
end;
$$;

drop trigger if exists cash_requests_enforce_enabled_mode on public.cash_payment_requests;
create trigger cash_requests_enforce_enabled_mode
  before insert or update of request_mode on public.cash_payment_requests
  for each row execute function public.enforce_enabled_payment_request_mode();

revoke update on public.payment_settings from authenticated;

revoke all on function public.admin_update_loan_terms(text, jsonb, text) from public, anon, authenticated;
revoke all on function public.admin_update_payment_settings(boolean, boolean, boolean, text, text, text) from public, anon, authenticated;
revoke all on function public.enforce_enabled_payment_request_mode() from public, anon, authenticated;

grant execute on function public.admin_update_loan_terms(text, jsonb, text) to authenticated;
grant execute on function public.admin_update_payment_settings(boolean, boolean, boolean, text, text, text) to authenticated;

commit;

select 'RFG admin backend features installed' as result;
