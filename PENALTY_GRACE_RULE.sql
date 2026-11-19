-- Fixed EMI grace-period and penalty rule.
-- Rule: every EMI gets 7 grace days. After grace, that EMI carries a fixed Rs 496 penalty.
-- If multiple EMIs cross grace, penalties accumulate EMI by EMI.

alter table public.emi_schedule
  add column if not exists grace_days integer not null default 7,
  add column if not exists penalty_amount numeric(12,2) not null default 496;

update public.emi_schedule
set grace_days = 7
where grace_days is null or grace_days <> 7;

update public.emi_schedule
set penalty_amount = 496
where penalty_amount is null or penalty_amount <> 496;

create or replace function public.emi_grace_end_date(p_due_date date, p_grace_days integer default 7)
returns date
language sql
stable
as $$
  select p_due_date + greatest(coalesce(p_grace_days, 7), 0);
$$;

create or replace function public.emi_is_past_grace(
  p_due_date date,
  p_grace_days integer default 7,
  p_check_date date default current_date
)
returns boolean
language sql
stable
as $$
  select p_due_date is not null
     and p_check_date > public.emi_grace_end_date(p_due_date, p_grace_days);
$$;

create or replace function public.emi_payable_amount(
  p_base_amount numeric,
  p_due_date date,
  p_status public.payment_status,
  p_grace_days integer default 7,
  p_penalty_amount numeric default 496
)
returns numeric
language sql
stable
as $$
  select round(
    coalesce(p_base_amount, 0)
    + case
        when p_status in ('pending', 'overdue')
         and public.emi_is_past_grace(p_due_date, p_grace_days)
        then coalesce(p_penalty_amount, 496)
        else 0
      end,
    2
  );
$$;

create or replace function public.refresh_overdue_emis()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  changed_count integer := 0;
begin
  update public.emi_schedule
  set status = 'overdue'
  where status = 'pending'
    and public.emi_is_past_grace(due_date, grace_days);

  get diagnostics changed_count = row_count;
  return changed_count;
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
  payable_amount numeric(12,2);
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

  payable_amount := public.emi_payable_amount(
    emi_row.amount,
    emi_row.due_date,
    emi_row.status,
    emi_row.grace_days,
    emi_row.penalty_amount
  );
  applied_penalty := greatest(payable_amount - emi_row.amount, 0);

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
    payable_amount,
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
      'penalty_amount', applied_penalty,
      'amount', payable_amount,
      'grace_days', emi_row.grace_days,
      'mode', p_mode
    )
  );

  return jsonb_build_object(
    'id', new_request_uuid,
    'request_id', new_request_id,
    'base_emi_amount', emi_row.amount,
    'penalty_amount', applied_penalty,
    'amount', payable_amount,
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
      'amount', request_row.amount,
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

select 'RFG penalty and grace rule installed' as result;
