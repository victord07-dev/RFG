-- RFG partial EMI carry-forward support.
-- Purpose:
-- - Allow staff to submit a cash collection lower than the EMI due amount.
-- - Admin approval marks that EMI as part paid.
-- - The unpaid balance is added to the next unpaid EMI as carry-forward.

do $$
begin
  if not exists (
    select 1
    from pg_enum enum_value
    join pg_type enum_type on enum_type.oid = enum_value.enumtypid
    join pg_namespace enum_schema on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'payment_status'
      and enum_value.enumlabel = 'part_paid'
  ) then
    alter type public.payment_status add value 'part_paid';
  end if;
end $$;

-- A newly added PostgreSQL enum label cannot be referenced until the
-- transaction that adds it has committed.
commit;
begin;

alter table public.emi_schedule
  add column if not exists carry_forward_amount numeric(12,2) not null default 0,
  add column if not exists paid_amount numeric(12,2) not null default 0;

alter table public.cash_payment_requests
  add column if not exists emi_due_amount numeric(12,2),
  add column if not exists short_amount numeric(12,2) not null default 0,
  add column if not exists carry_forward_amount numeric(12,2) not null default 0;

drop function if exists public.submit_cash_payment_request(uuid, uuid, text, text);

create or replace function public.submit_cash_payment_request(
  p_application_id uuid,
  p_emi_schedule_id uuid,
  p_remarks text default '',
  p_mode text default 'cash',
  p_amount numeric default null
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
  payable_amount numeric(12,2);
  requested_amount numeric(12,2);
  short_amount numeric(12,2);
  carry_amount numeric(12,2);
  applied_penalty numeric(12,2);
begin
  actor_role := public.require_active_staff();
  perform public.refresh_overdue_emis();

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

  carry_amount := coalesce(emi_row.carry_forward_amount, 0);
  payable_amount := public.emi_payable_amount(
    emi_row.amount + carry_amount,
    emi_row.due_date,
    emi_row.status,
    emi_row.grace_days,
    emi_row.penalty_amount
  );
  requested_amount := round(coalesce(p_amount, payable_amount), 2);
  applied_penalty := greatest(payable_amount - emi_row.amount - carry_amount, 0);

  if requested_amount <= 0 then
    raise exception 'Collected amount must be greater than zero.';
  end if;

  if requested_amount > payable_amount then
    raise exception 'Collected amount cannot be greater than the EMI due amount.';
  end if;

  short_amount := round(payable_amount - requested_amount, 2);

  if short_amount > 0 and not exists (
    select 1
    from public.emi_schedule next_emi
    where next_emi.application_id = application_row.id
      and next_emi.due_date > emi_row.due_date
      and next_emi.status in ('pending', 'overdue')
  ) then
    raise exception 'Partial payment cannot be accepted for the final EMI. Collect the full amount or close/settle offline.';
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
    emi_due_amount,
    short_amount,
    carry_forward_amount,
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
    requested_amount,
    payable_amount,
    short_amount,
    carry_amount,
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
      'base_emi_amount', emi_row.amount,
      'carry_forward_amount', carry_amount,
      'penalty_amount', applied_penalty,
      'emi_due_amount', payable_amount,
      'amount', requested_amount,
      'short_amount', short_amount,
      'mode', p_mode
    )
  );

  return jsonb_build_object(
    'id', new_request_uuid,
    'request_id', new_request_id,
    'base_emi_amount', emi_row.amount,
    'carry_forward_amount', carry_amount,
    'penalty_amount', applied_penalty,
    'emi_due_amount', payable_amount,
    'amount', requested_amount,
    'short_amount', short_amount,
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
  emi_row public.emi_schedule%rowtype;
  next_emi_id uuid;
  payment_uuid uuid;
  new_payment_id text;
  payment_mode_value text;
  payment_status_value public.payment_status;
  restored_status public.payment_status;
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

  select *
  into emi_row
  from public.emi_schedule
  where id = request_row.emi_schedule_id
  for update;

  if emi_row.id is null then
    raise exception 'Matching EMI schedule row was not found.';
  end if;

  if p_decision = 'approved' then
    if exists (
      select 1
      from public.payments
      where emi_schedule_id = request_row.emi_schedule_id
        and status in ('paid', 'part_paid')
    ) then
      raise exception 'This EMI already has a confirmed payment.';
    end if;

    if coalesce(request_row.short_amount, 0) > 0 then
      select id
      into next_emi_id
      from public.emi_schedule
      where application_id = request_row.application_id
        and due_date > emi_row.due_date
        and status in ('pending', 'overdue')
      order by due_date asc
      limit 1
      for update;

      if next_emi_id is null then
        raise exception 'Partial payment cannot be approved because no next EMI is available for carry forward.';
      end if;
    end if;

    new_payment_id := public.next_rfg_payment_id();
    payment_mode_value := case
      when request_row.request_mode = 'manual_bank_qr' then 'manual_bank_qr'
      else 'cash'
    end;
    payment_status_value := case
      when coalesce(request_row.short_amount, 0) > 0 then 'part_paid'::public.payment_status
      else 'paid'::public.payment_status
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
      payment_status_value,
      request_row.request_id,
      request_row.remarks,
      request_row.created_by,
      auth.uid(),
      now()
    )
    returning id into payment_uuid;

    update public.emi_schedule
    set status = payment_status_value,
        paid_amount = coalesce(paid_amount, 0) + request_row.amount
    where id = request_row.emi_schedule_id;

    if coalesce(request_row.short_amount, 0) > 0 then
      update public.emi_schedule
      set carry_forward_amount = coalesce(carry_forward_amount, 0) + request_row.short_amount
      where id = next_emi_id;
    end if;
  else
    select case
      when public.emi_is_past_grace(due_date, grace_days) then 'overdue'::public.payment_status
      else 'pending'::public.payment_status
    end
    into restored_status
    from public.emi_schedule
    where id = request_row.emi_schedule_id;

    update public.emi_schedule
    set status = restored_status
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
      'emi_due_amount', request_row.emi_due_amount,
      'amount', request_row.amount,
      'short_amount', request_row.short_amount,
      'decision', p_decision
    )
  );

  return jsonb_build_object(
    'request_id', request_row.request_id,
    'decision', p_decision,
    'payment_id', new_payment_id,
    'short_amount', request_row.short_amount
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
  carry_amount numeric(12,2);
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

  carry_amount := coalesce(emi_row.carry_forward_amount, 0);
  payable_amount := public.emi_payable_amount(
    emi_row.amount + carry_amount,
    emi_row.due_date,
    emi_row.status,
    emi_row.grace_days,
    emi_row.penalty_amount
  );
  applied_penalty := greatest(payable_amount - emi_row.amount - carry_amount, 0);
  new_request_id := 'CR-' || nextval('public.rfg_cash_request_seq');

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
    status,
    request_mode
  )
  values (
    new_request_id,
    application_row.id,
    emi_row.id,
    emi_row.emi_month,
    payable_amount,
    payable_amount,
    0,
    carry_amount,
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
      'carry_forward_amount', carry_amount,
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
    'base_emi_amount', emi_row.amount,
    'carry_forward_amount', carry_amount,
    'penalty_amount', applied_penalty,
    'amount', payable_amount,
    'status', 'verification_pending'
  );
end;
$$;

revoke all on function public.submit_cash_payment_request(uuid, uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.submit_cash_payment_request(uuid, uuid, text, text, numeric) to authenticated;

revoke all on function public.review_payment_request(text, text) from public, anon, authenticated;
grant execute on function public.review_payment_request(text, text) to authenticated;

revoke all on function public.customer_submit_manual_bank_payment(uuid, uuid, text, text, text, text) from public, anon, authenticated;
grant execute on function public.customer_submit_manual_bank_payment(uuid, uuid, text, text, text, text) to anon, authenticated;

commit;

select 'RFG partial EMI carry-forward installed' as result;
