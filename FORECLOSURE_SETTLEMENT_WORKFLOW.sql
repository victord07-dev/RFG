-- RFG Financial foreclosure settlement workflow
-- Run after BACKEND_HARDENING.sql and BACKEND_ADMIN_FEATURES.sql.

begin;

create table if not exists public.loan_foreclosure_settlements (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references public.loan_applications(id) on delete restrict,
  original_loan_amount numeric(12,2) not null check (original_loan_amount >= 0),
  original_charge_amount numeric(12,2) not null check (original_charge_amount >= 0),
  paid_before_foreclosure numeric(12,2) not null check (paid_before_foreclosure >= 0),
  agreed_settlement_amount numeric(12,2) not null check (agreed_settlement_amount >= 0),
  product_returned boolean not null default false,
  product_return_value numeric(12,2) not null default 0 check (product_return_value >= 0),
  settlement_notes text not null check (length(trim(settlement_notes)) >= 10),
  settled_by uuid not null references auth.users(id),
  settled_at timestamptz not null default now()
);

create index if not exists idx_foreclosure_settlements_settled_at
  on public.loan_foreclosure_settlements (settled_at desc);

alter table public.loan_foreclosure_settlements enable row level security;

drop policy if exists "admin_read_foreclosure_settlements" on public.loan_foreclosure_settlements;
create policy "admin_read_foreclosure_settlements"
on public.loan_foreclosure_settlements for select
to authenticated
using (public.is_admin());

revoke all on public.loan_foreclosure_settlements from public, anon, authenticated;
grant select on public.loan_foreclosure_settlements to authenticated;

create or replace function public.admin_foreclose_loan(
  p_loan_id text,
  p_agreed_settlement_amount numeric,
  p_product_returned boolean,
  p_product_return_value numeric,
  p_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  application_row public.loan_applications%rowtype;
  paid_total numeric(12,2) := 0;
  return_value numeric(12,2) := 0;
  settlement_row public.loan_foreclosure_settlements%rowtype;
begin
  perform public.require_admin();

  if p_agreed_settlement_amount is null or p_agreed_settlement_amount < 0 then
    raise exception 'Agreed settlement amount cannot be negative.';
  end if;

  if length(trim(coalesce(p_notes, ''))) < 10 then
    raise exception 'Enter clear settlement terms of at least 10 characters.';
  end if;

  return_value := case when coalesce(p_product_returned, false)
    then coalesce(p_product_return_value, 0)
    else 0
  end;

  if return_value < 0 then
    raise exception 'Product return value cannot be negative.';
  end if;

  select * into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if application_row.status <> 'active' then
    raise exception 'Only an active loan can be foreclosed.';
  end if;

  if exists (
    select 1 from public.cash_payment_requests
    where application_id = application_row.id
      and status = 'verification_pending'
  ) then
    raise exception 'Review pending payment requests before foreclosing this loan.';
  end if;

  select coalesce(sum(amount), 0)::numeric(12,2)
  into paid_total
  from public.payments
  where application_id = application_row.id
    and status = 'paid';

  insert into public.loan_foreclosure_settlements (
    application_id,
    original_loan_amount,
    original_charge_amount,
    paid_before_foreclosure,
    agreed_settlement_amount,
    product_returned,
    product_return_value,
    settlement_notes,
    settled_by
  ) values (
    application_row.id,
    application_row.loan_amount,
    application_row.charge_amount,
    paid_total,
    round(p_agreed_settlement_amount, 2),
    coalesce(p_product_returned, false),
    round(return_value, 2),
    trim(p_notes),
    auth.uid()
  )
  returning * into settlement_row;

  update public.loan_applications
  set status = 'closed',
      closed_by = auth.uid(),
      closed_at = now()
  where id = application_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Admin foreclosed loan under agreed settlement',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'settlement_id', settlement_row.id,
      'paid_before_foreclosure', paid_total,
      'agreed_settlement_amount', settlement_row.agreed_settlement_amount,
      'product_returned', settlement_row.product_returned,
      'product_return_value', settlement_row.product_return_value,
      'settlement_notes', settlement_row.settlement_notes
    )
  );

  return jsonb_build_object(
    'loan_id', application_row.loan_id,
    'status', 'closed',
    'settlement_id', settlement_row.id,
    'agreed_settlement_amount', settlement_row.agreed_settlement_amount,
    'closed_at', settlement_row.settled_at
  );
end;
$$;

revoke all on function public.admin_foreclose_loan(text, numeric, boolean, numeric, text)
  from public, anon, authenticated;
grant execute on function public.admin_foreclose_loan(text, numeric, boolean, numeric, text)
  to authenticated;

commit;
