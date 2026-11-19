-- RFG final release hardening.
-- Run this LAST, after every earlier schema/workflow SQL file.
-- This file is intentionally idempotent and is the canonical final security override.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- Processing fee is business data, not free-text metadata. Keep the legacy remarks
-- payload readable, but persist the value in a typed column for calculations/audits.
alter table public.loan_applications
  add column if not exists processing_fee numeric(12,2) not null default 0
  check (processing_fee >= 0);

alter table public.loan_terms
  add column if not exists processing_fee numeric(12,2) not null default 0
  check (processing_fee >= 0);

create or replace function public.sync_processing_fee_from_legacy_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  metadata_text text;
begin
  if new.processing_fee <> 0 or new.remarks is null
    or new.remarks not like '[[RFG_APPLICATION_META]]%' then
    return new;
  end if;

  metadata_text := split_part(
    split_part(new.remarks, E'\n', 1),
    '[[RFG_APPLICATION_META]]',
    2
  );

  begin
    new.processing_fee := greatest(
      coalesce((metadata_text::jsonb ->> 'processingFee')::numeric, 0),
      0
    );
  exception when others then
    new.processing_fee := 0;
  end;
  return new;
end;
$$;

drop trigger if exists loan_applications_sync_processing_fee on public.loan_applications;
create trigger loan_applications_sync_processing_fee
before insert or update of remarks, processing_fee on public.loan_applications
for each row execute function public.sync_processing_fee_from_legacy_metadata();

-- Backfill existing applications through the same guarded parser.
update public.loan_applications
set remarks = remarks
where processing_fee = 0
  and remarks like '[[RFG_APPLICATION_META]]%';

create or replace function public.sync_loan_term_processing_fee()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if new.processing_fee = 0 then
    select processing_fee into new.processing_fee
    from public.loan_applications
    where id = new.application_id;
  end if;
  return new;
end;
$$;

drop trigger if exists loan_terms_sync_processing_fee on public.loan_terms;
create trigger loan_terms_sync_processing_fee
before insert on public.loan_terms
for each row execute function public.sync_loan_term_processing_fee();

update public.loan_terms term
set processing_fee = application.processing_fee
from public.loan_applications application
where term.application_id = application.id
  and term.processing_fee = 0;

-- Customer login throttling. The digest avoids storing another clear-text mobile copy.
create table if not exists public.customer_login_throttle (
  mobile_digest bytea primary key,
  failed_attempts integer not null default 0 check (failed_attempts >= 0),
  window_started_at timestamptz not null default now(),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.customer_login_throttle enable row level security;
revoke all on public.customer_login_throttle from public, anon, authenticated;

create or replace function public.customer_app_login(
  p_mobile text,
  p_plain_mpin text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  normalized_mobile text := regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g');
  mobile_key bytea;
  throttle_row public.customer_login_throttle%rowtype;
  application_row public.loan_applications%rowtype;
  checklist_row public.document_checklists%rowtype;
  settings_row public.payment_settings%rowtype;
begin
  if normalized_mobile !~ '^[0-9]{10}$' or coalesce(p_plain_mpin, '') !~ '^[0-9]{4,6}$' then
    return jsonb_build_object('ok', false, 'error_code', 'invalid_login');
  end if;

  mobile_key := extensions.digest(normalized_mobile, 'sha256');
  insert into public.customer_login_throttle (mobile_digest)
  values (mobile_key)
  on conflict (mobile_digest) do nothing;

  select * into throttle_row
  from public.customer_login_throttle
  where mobile_digest = mobile_key
  for update;

  if throttle_row.blocked_until is not null and throttle_row.blocked_until > now() then
    return jsonb_build_object('ok', false, 'error_code', 'temporarily_locked');
  end if;

  perform public.refresh_overdue_emis();

  select * into application_row
  from public.loan_applications
  where regexp_replace(mobile, '\D', '', 'g') = normalized_mobile
    and status = 'active'
    and customer_mpin_hash is not null
    and customer_mpin_hash <> ''
    and customer_mpin_hash = extensions.crypt(p_plain_mpin, customer_mpin_hash)
  order by coalesce(disbursed_at, approved_at, created_at) desc
  limit 1;

  if application_row.id is null then
    update public.customer_login_throttle
    set failed_attempts = case
          when window_started_at < now() - interval '15 minutes' then 1
          else failed_attempts + 1
        end,
        window_started_at = case
          when window_started_at < now() - interval '15 minutes' then now()
          else window_started_at
        end,
        blocked_until = case
          when (case when window_started_at < now() - interval '15 minutes' then 1 else failed_attempts + 1 end) >= 5
            then now() + interval '15 minutes'
          else null
        end,
        updated_at = now()
    where mobile_digest = mobile_key;
    return jsonb_build_object('ok', false, 'error_code', 'invalid_login');
  end if;

  delete from public.customer_login_throttle where mobile_digest = mobile_key;

  select * into checklist_row
  from public.document_checklists
  where application_id = application_row.id;

  select * into settings_row from public.payment_settings where id = true;

  return jsonb_build_object(
    'ok', true,
    'application',
      (to_jsonb(application_row) - 'customer_mpin' - 'customer_mpin_hash')
      || jsonb_build_object('document_checklists', to_jsonb(checklist_row)),
    'emi_schedule', coalesce((
      select jsonb_agg(to_jsonb(e) order by e.due_date nulls last, e.created_at)
      from public.emi_schedule e where e.application_id = application_row.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(
        to_jsonb(p) - 'created_by' - 'verified_by'
        order by p.created_at desc
      )
      from public.payments p where p.application_id = application_row.id
    ), '[]'::jsonb),
    'payment_settings', jsonb_build_object(
      'razorpay_enabled', coalesce(settings_row.razorpay_enabled, false)
    )
  );
end;
$$;

-- MPIN reset is an administrator action even if an older migration allowed Sales.
create or replace function public.reset_customer_mpin(
  p_loan_id text,
  p_plain_mpin text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  application_row public.loan_applications%rowtype;
begin
  perform public.require_admin();

  if p_plain_mpin !~ '^[0-9]{4,6}$' then
    raise exception 'Customer MPIN must contain 4 to 6 digits.';
  end if;

  select * into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then raise exception 'Application not found.'; end if;

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

-- Browser grants: login remains callable, but the removed customer manual-bank flow does not.
revoke all on function public.customer_app_login(text, text) from public, anon, authenticated;
grant execute on function public.customer_app_login(text, text) to anon, authenticated;

revoke all on function public.customer_submit_manual_bank_payment(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;

revoke all on function public.reset_customer_mpin(text, text) from public, anon, authenticated;
grant execute on function public.reset_customer_mpin(text, text) to authenticated;

-- Keep every editable finance component in the audited terms transaction.
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
  processing_fee_value numeric(12,2);
  tenure_value integer;
  emi_amount_value numeric(12,2);
begin
  perform public.require_admin();
  if length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'Enter a clear reason of at least 5 characters.';
  end if;

  select * into application_row from public.loan_applications
  where loan_id = p_loan_id for update;
  if application_row.id is null then raise exception 'Application not found.'; end if;
  if application_row.status <> 'approved' then
    raise exception 'Loan terms can be changed only before disbursement.';
  end if;

  begin
    product_price_value := (p_terms ->> 'product_price')::numeric;
    down_payment_value := (p_terms ->> 'down_payment')::numeric;
    loan_amount_value := (p_terms ->> 'loan_amount')::numeric;
    charge_amount_value := (p_terms ->> 'charge_amount')::numeric;
    processing_fee_value := coalesce((p_terms ->> 'processing_fee')::numeric, 0);
    tenure_value := (p_terms ->> 'tenure')::integer;
  exception when others then
    raise exception 'Loan values contain invalid data.';
  end;

  if product_price_value <= 0 or down_payment_value < 0 or loan_amount_value <= 0
    or charge_amount_value < 0 or processing_fee_value < 0
    or tenure_value not between 1 and 120 then
    raise exception 'Loan values or tenure are outside the allowed range.';
  end if;

  emi_amount_value := round(
    (loan_amount_value + charge_amount_value + processing_fee_value) / tenure_value,
    2
  );

  old_terms := jsonb_build_object(
    'product_price', application_row.product_price,
    'down_payment', application_row.down_payment,
    'loan_amount', application_row.loan_amount,
    'charge_amount', application_row.charge_amount,
    'processing_fee', application_row.processing_fee,
    'tenure', application_row.tenure,
    'emi_amount', application_row.emi_amount
  );
  new_terms := jsonb_build_object(
    'product_price', product_price_value,
    'down_payment', down_payment_value,
    'loan_amount', loan_amount_value,
    'charge_amount', charge_amount_value,
    'processing_fee', processing_fee_value,
    'tenure', tenure_value,
    'emi_amount', emi_amount_value
  );

  update public.loan_applications set
    product_price = product_price_value,
    down_payment = down_payment_value,
    loan_amount = loan_amount_value,
    charge_amount = charge_amount_value,
    processing_fee = processing_fee_value,
    tenure = tenure_value,
    emi_amount = emi_amount_value,
    updated_at = now()
  where id = application_row.id;

  insert into public.loan_terms (
    application_id, product_price, down_payment, loan_amount, charge_amount,
    processing_fee, tenure, emi_amount, due_day, reason, changed_by
  ) values (
    application_row.id, product_price_value, down_payment_value, loan_amount_value,
    charge_amount_value, processing_fee_value, tenure_value, emi_amount_value,
    application_row.due_day, trim(p_reason), auth.uid()
  );

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id, auth.uid(), 'Admin updated loan terms before disbursement',
    jsonb_build_object('loan_id', application_row.loan_id, 'reason', trim(p_reason),
      'old', old_terms, 'new', new_terms)
  );
  return jsonb_build_object('loan_id', application_row.loan_id, 'terms', new_terms);
end;
$$;

revoke all on function public.admin_update_loan_terms(text, jsonb, text)
  from public, anon, authenticated;
grant execute on function public.admin_update_loan_terms(text, jsonb, text) to authenticated;

grant select (processing_fee) on public.loan_applications to authenticated;
grant select (processing_fee) on public.loan_terms to authenticated;

commit;

select 'RFG final release hardening installed' as result;
