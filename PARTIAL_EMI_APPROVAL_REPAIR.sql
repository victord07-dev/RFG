-- Repair partial-payment approval accounting and reconcile existing records.
-- Safe to run more than once in the Supabase SQL Editor.

-- PostgreSQL requires a new enum value to be committed before it is used.
do $$
begin
  if not exists (
    select 1
    from pg_enum as enum_value
    join pg_type as enum_type on enum_type.oid = enum_value.enumtypid
    join pg_namespace as enum_schema on enum_schema.oid = enum_type.typnamespace
    where enum_schema.nspname = 'public'
      and enum_type.typname = 'payment_status'
      and enum_value.enumlabel = 'part_paid'
  ) then
    alter type public.payment_status add value 'part_paid';
  end if;
end;
$$;

commit;

begin;

alter table public.emi_schedule
  add column if not exists carry_forward_amount numeric(12,2) not null default 0,
  add column if not exists paid_amount numeric(12,2) not null default 0;

alter table public.cash_payment_requests
  add column if not exists emi_due_amount numeric(12,2),
  add column if not exists short_amount numeric(12,2) not null default 0,
  add column if not exists carry_forward_amount numeric(12,2) not null default 0;

create or replace function public.review_payment_request(
  p_request_id text,
  p_decision text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  confirmed_short_amount numeric(12,2);
begin
  perform public.require_admin();

  if p_decision not in ('approved', 'rejected') then
    raise exception 'Decision must be approved or rejected.';
  end if;

  select request.*
  into request_row
  from public.cash_payment_requests as request
  where request.request_id = p_request_id
  for update;

  if request_row.id is null then
    raise exception 'Payment request not found.';
  end if;

  if request_row.status <> 'verification_pending' then
    raise exception 'This payment request was already reviewed.';
  end if;

  select schedule.*
  into emi_row
  from public.emi_schedule as schedule
  where schedule.id = request_row.emi_schedule_id
    and schedule.application_id = request_row.application_id
  for update;

  if emi_row.id is null then
    raise exception 'The request is not linked to a valid EMI for this loan.';
  end if;

  if p_decision = 'approved' then
    if exists (
      select 1
      from public.payments as payment
      where payment.emi_schedule_id = emi_row.id
        and payment.status in ('paid', 'part_paid')
    ) then
      raise exception 'This EMI already has a confirmed payment.';
    end if;

    confirmed_short_amount := greatest(
      coalesce(
        request_row.short_amount,
        request_row.emi_due_amount - request_row.amount,
        0
      ),
      0
    );

    if confirmed_short_amount > 0 then
      select schedule.id
      into next_emi_id
      from public.emi_schedule as schedule
      where schedule.application_id = request_row.application_id
        and schedule.due_date > emi_row.due_date
        and schedule.status in ('pending', 'overdue')
      order by schedule.due_date asc
      limit 1
      for update;

      if next_emi_id is null then
        raise exception 'Partial payment cannot be approved because no next EMI is available.';
      end if;
    end if;

    new_payment_id := public.next_rfg_payment_id();
    payment_mode_value := case
      when request_row.request_mode = 'manual_bank_qr' then 'manual_bank_qr'
      else 'cash'
    end;
    payment_status_value := case
      when confirmed_short_amount > 0 then 'part_paid'::public.payment_status
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
    ) values (
      new_payment_id,
      request_row.application_id,
      emi_row.id,
      request_row.amount,
      payment_mode_value,
      payment_status_value,
      request_row.request_id,
      request_row.remarks,
      request_row.created_by,
      (select auth.uid()),
      now()
    )
    returning id into payment_uuid;

    update public.emi_schedule
    set status = payment_status_value,
        paid_amount = round(coalesce(paid_amount, 0) + request_row.amount, 2)
    where id = emi_row.id;

    if confirmed_short_amount > 0 then
      update public.emi_schedule
      set carry_forward_amount = round(
        coalesce(carry_forward_amount, 0) + confirmed_short_amount,
        2
      )
      where id = next_emi_id;
    end if;
  else
    restored_status := case
      when public.emi_is_past_grace(emi_row.due_date, emi_row.grace_days)
        then 'overdue'::public.payment_status
      else 'pending'::public.payment_status
    end;

    update public.emi_schedule
    set status = restored_status
    where id = emi_row.id;
  end if;

  update public.cash_payment_requests
  set status = p_decision::public.cash_request_status,
      payment_id = payment_uuid,
      short_amount = case
        when p_decision = 'approved' then coalesce(confirmed_short_amount, 0)
        else short_amount
      end,
      reviewed_by = (select auth.uid()),
      reviewed_at = now()
  where id = request_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    request_row.application_id,
    (select auth.uid()),
    case
      when p_decision = 'approved' then 'Admin confirmed payment'
      else 'Admin rejected payment'
    end,
    jsonb_build_object(
      'request_id', request_row.request_id,
      'payment_id', new_payment_id,
      'emi_schedule_id', emi_row.id,
      'next_emi_schedule_id', next_emi_id,
      'emi_due_amount', request_row.emi_due_amount,
      'amount', request_row.amount,
      'short_amount', coalesce(confirmed_short_amount, request_row.short_amount, 0),
      'decision', p_decision
    )
  );

  return jsonb_build_object(
    'request_id', request_row.request_id,
    'payment_id', new_payment_id,
    'emi_schedule_id', emi_row.id,
    'next_emi_schedule_id', next_emi_id,
    'amount', request_row.amount,
    'short_amount', coalesce(confirmed_short_amount, 0),
    'decision', p_decision
  );
end;
$$;

revoke all on function public.review_payment_request(text, text)
from public, anon, authenticated;
grant execute on function public.review_payment_request(text, text)
to authenticated;

-- Reconcile confirmed payments into their source EMI rows. This repairs rows
-- created by an older approval function while remaining idempotent.
with confirmed_payment as (
  select
    payment.emi_schedule_id,
    round(sum(payment.amount), 2) as paid_amount,
    case
      when bool_or(payment.status = 'paid') then 'paid'::public.payment_status
      else 'part_paid'::public.payment_status
    end as reconciled_status
  from public.payments as payment
  where payment.emi_schedule_id is not null
    and payment.status in ('paid', 'part_paid')
  group by payment.emi_schedule_id
)
update public.emi_schedule as schedule
set paid_amount = confirmed_payment.paid_amount,
    status = confirmed_payment.reconciled_status
from confirmed_payment
where schedule.id = confirmed_payment.emi_schedule_id
  and (
    schedule.paid_amount is distinct from confirmed_payment.paid_amount
    or schedule.status is distinct from confirmed_payment.reconciled_status
  );

-- Derive every next-EMI carry amount from approved partial requests. Setting
-- the expected total instead of incrementing makes retries safe.
with partial_source as (
  select
    request.id as request_uuid,
    request.application_id,
    greatest(
      coalesce(
        request.short_amount,
        request.emi_due_amount - request.amount,
        0
      ),
      0
    ) as short_amount,
    source_emi.due_date as source_due_date
  from public.cash_payment_requests as request
  join public.emi_schedule as source_emi
    on source_emi.id = request.emi_schedule_id
   and source_emi.application_id = request.application_id
  where request.status = 'approved'
    and request.payment_id is not null
    and greatest(
      coalesce(
        request.short_amount,
        request.emi_due_amount - request.amount,
        0
      ),
      0
    ) > 0
), carry_target as (
  select
    partial_source.request_uuid,
    partial_source.short_amount,
    next_schedule.id as next_emi_id
  from partial_source
  cross join lateral (
    select schedule.id
    from public.emi_schedule as schedule
    where schedule.application_id = partial_source.application_id
      and schedule.due_date > partial_source.source_due_date
    order by schedule.due_date asc
    limit 1
  ) as next_schedule
), expected_carry as (
  select
    carry_target.next_emi_id,
    round(sum(carry_target.short_amount), 2) as carry_forward_amount
  from carry_target
  group by carry_target.next_emi_id
)
update public.emi_schedule as schedule
set carry_forward_amount = expected_carry.carry_forward_amount
from expected_carry
where schedule.id = expected_carry.next_emi_id
  and schedule.carry_forward_amount is distinct from expected_carry.carry_forward_amount;

commit;

-- Verification output for every confirmed partial payment.
select
  request.request_id,
  request.amount as collected_amount,
  request.short_amount,
  source_emi.emi_month as source_emi,
  source_emi.status as source_status,
  source_emi.paid_amount,
  next_emi.emi_month as next_emi,
  next_emi.carry_forward_amount,
  next_emi.amount + next_emi.carry_forward_amount as next_emi_due
from public.cash_payment_requests as request
join public.emi_schedule as source_emi
  on source_emi.id = request.emi_schedule_id
left join lateral (
  select schedule.*
  from public.emi_schedule as schedule
  where schedule.application_id = request.application_id
    and schedule.due_date > source_emi.due_date
  order by schedule.due_date asc
  limit 1
) as next_emi on true
where request.status = 'approved'
  and request.short_amount > 0
order by request.reviewed_at desc;
