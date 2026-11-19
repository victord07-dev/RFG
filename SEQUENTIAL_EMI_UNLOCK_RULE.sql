-- Enforces the same sequential EMI availability rule for Sales and Admin.
-- An EMI is open when its calendar month has arrived, or when it is the first
-- unsettled EMI. A prior verification-pending EMI blocks later payments until
-- Admin completes that review so carry-forward remains correct.

begin;

create or replace function public.enforce_open_emi_payment_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_emi public.emi_schedule%rowtype;
  india_month_start date;
  selected_month_start date;
begin
  select schedule.*
  into selected_emi
  from public.emi_schedule as schedule
  where schedule.id = new.emi_schedule_id
    and schedule.application_id = new.application_id;

  if selected_emi.id is null then
    raise exception 'The selected EMI does not belong to this loan.';
  end if;

  if selected_emi.status::text not in ('pending', 'overdue') then
    raise exception 'This EMI is not available for payment.';
  end if;

  if exists (
    select 1
    from public.emi_schedule as earlier
    where earlier.application_id = selected_emi.application_id
      and earlier.due_date < selected_emi.due_date
      and earlier.status::text = 'verification_pending'
  ) then
    raise exception 'An earlier EMI is awaiting Admin verification.';
  end if;

  india_month_start := date_trunc('month', timezone('Asia/Kolkata', now()))::date;
  selected_month_start := date_trunc('month', selected_emi.due_date)::date;

  if selected_month_start > india_month_start and exists (
    select 1
    from public.emi_schedule as earlier
    where earlier.application_id = selected_emi.application_id
      and earlier.due_date < selected_emi.due_date
      and earlier.status::text not in ('paid', 'part_paid')
  ) then
    raise exception 'This future EMI is locked until the earlier installment is settled.';
  end if;

  return new;
end;
$$;

drop trigger if exists enforce_open_emi_payment_request
on public.cash_payment_requests;

create trigger enforce_open_emi_payment_request
before insert on public.cash_payment_requests
for each row execute function public.enforce_open_emi_payment_request();

revoke all on function public.enforce_open_emi_payment_request()
from public, anon, authenticated;

commit;

select
  exists (
    select 1
    from pg_trigger
    where tgname = 'enforce_open_emi_payment_request'
      and tgrelid = 'public.cash_payment_requests'::regclass
      and not tgisinternal
  ) as sequential_emi_guard_enabled;
