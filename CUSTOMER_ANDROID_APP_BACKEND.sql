-- Customer Android app backend RPCs.
-- Run this after the main schema, BACKEND_HARDENING.sql, and PENALTY_GRACE_RULE.sql.
-- Customers do not use Supabase Auth accounts. They access only their own active loan
-- through mobile number + MPIN, and all returned data is limited to that verified loan.

begin;

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

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
  application_row public.loan_applications%rowtype;
  checklist_row public.document_checklists%rowtype;
  settings_row public.payment_settings%rowtype;
begin
  if trim(coalesce(p_mobile, '')) = '' or trim(coalesce(p_plain_mpin, '')) = '' then
    raise exception 'Invalid customer login.';
  end if;

  perform public.refresh_overdue_emis();

  select *
  into application_row
  from public.loan_applications
  where regexp_replace(mobile, '\D', '', 'g') = regexp_replace(p_mobile, '\D', '', 'g')
    and status = 'active'
    and customer_mpin_hash is not null
    and customer_mpin_hash <> ''
    and customer_mpin_hash = extensions.crypt(p_plain_mpin, customer_mpin_hash)
  order by coalesce(disbursed_at, approved_at, created_at) desc
  limit 1;

  if application_row.id is null then
    raise exception 'Invalid customer login.';
  end if;

  select *
  into checklist_row
  from public.document_checklists
  where application_id = application_row.id;

  select *
  into settings_row
  from public.payment_settings
  where id = true;

  return jsonb_build_object(
    'application',
      (to_jsonb(application_row) - 'customer_mpin' - 'customer_mpin_hash')
      || jsonb_build_object('document_checklists', to_jsonb(checklist_row)),
    'emi_schedule',
      coalesce((
        select jsonb_agg(to_jsonb(e) order by e.due_date nulls last, e.created_at)
        from public.emi_schedule e
        where e.application_id = application_row.id
      ), '[]'::jsonb),
    'payments',
      coalesce((
        select jsonb_agg(to_jsonb(p) order by p.created_at desc)
        from public.payments p
        where p.application_id = application_row.id
      ), '[]'::jsonb),
    'payment_settings',
      to_jsonb(settings_row)
  );
end;
$$;

create or replace function public.customer_submit_manual_bank_payment(
  p_application_id uuid,
  p_emi_schedule_id uuid,
  p_mobile text,
  p_plain_mpin text,
  p_reference text,
  p_remarks text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions, pg_temp
as $$
declare
  application_row public.loan_applications%rowtype;
  emi_row public.emi_schedule%rowtype;
  settings_row public.payment_settings%rowtype;
  new_request_id text;
  new_request_uuid uuid;
  payable_amount numeric(12,2);
  applied_penalty numeric(12,2);
begin
  if trim(coalesce(p_reference, '')) = '' then
    raise exception 'Payment reference is required.';
  end if;

  perform public.refresh_overdue_emis();

  select *
  into settings_row
  from public.payment_settings
  where id = true;

  if not coalesce(settings_row.manual_bank_qr_enabled, false) then
    raise exception 'Manual bank QR requests are currently disabled.';
  end if;

  select *
  into application_row
  from public.loan_applications
  where id = p_application_id
    and regexp_replace(mobile, '\D', '', 'g') = regexp_replace(p_mobile, '\D', '', 'g')
    and status = 'active'
    and customer_mpin_hash is not null
    and customer_mpin_hash <> ''
    and customer_mpin_hash = extensions.crypt(p_plain_mpin, customer_mpin_hash)
  for update;

  if application_row.id is null then
    raise exception 'Invalid customer login.';
  end if;

  select *
  into emi_row
  from public.emi_schedule
  where id = p_emi_schedule_id
    and application_id = application_row.id
  for update;

  if emi_row.id is null then
    raise exception 'Matching EMI was not found.';
  end if;

  if emi_row.status not in ('pending', 'overdue') then
    raise exception 'This EMI is not available for payment request.';
  end if;

  if exists (
    select 1
    from public.cash_payment_requests
    where emi_schedule_id = emi_row.id
      and status = 'verification_pending'
  ) then
    raise exception 'This EMI already has a request waiting for admin.';
  end if;

  payable_amount := public.emi_payable_amount(
    emi_row.amount,
    emi_row.due_date,
    emi_row.status,
    emi_row.grace_days,
    emi_row.penalty_amount
  );
  applied_penalty := greatest(payable_amount - emi_row.amount, 0);
  new_request_id := 'CR-' || nextval('public.rfg_cash_request_seq');

  insert into public.cash_payment_requests (
    request_id,
    application_id,
    emi_schedule_id,
    emi_month,
    amount,
    collected_by,
    collected_at,
    remarks,
    status,
    request_mode
  )
  values (
    new_request_id,
    application_row.id,
    emi_row.id,
    emi_row.emi_month,
    payable_amount,
    'Customer App',
    to_char(now(), 'DD Mon YYYY, HH12:MI AM'),
    trim(concat('Reference: ', p_reference, case when trim(coalesce(p_remarks, '')) <> '' then ' | Note: ' || trim(p_remarks) else '' end)),
    'verification_pending',
    'manual_bank_qr'
  )
  returning id into new_request_uuid;

  update public.emi_schedule
  set status = 'verification_pending'
  where id = emi_row.id;

  insert into public.activity_logs (application_id, action, details)
  values (
    application_row.id,
    'Customer submitted manual bank payment',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'request_id', new_request_id,
      'emi_month', emi_row.emi_month,
      'base_emi_amount', emi_row.amount,
      'penalty_amount', applied_penalty,
      'amount', payable_amount,
      'mode', 'manual_bank_qr',
      'source', 'customer_app'
    )
  );

  return jsonb_build_object(
    'ok', true,
    'request_id', new_request_id,
    'request_uuid', new_request_uuid,
    'amount', payable_amount,
    'status', 'verification_pending'
  );
end;
$$;

revoke all on function public.customer_app_login(text, text) from public, anon, authenticated;
revoke all on function public.customer_submit_manual_bank_payment(uuid, uuid, text, text, text, text) from public, anon, authenticated;

grant execute on function public.customer_app_login(text, text) to anon, authenticated;
grant execute on function public.customer_submit_manual_bank_payment(uuid, uuid, text, text, text, text) to anon, authenticated;

commit;

select 'RFG customer Android app backend RPCs installed' as result;
