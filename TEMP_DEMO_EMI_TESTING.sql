-- Temporary demo/testing helper.
-- Purpose: allow admin to move pending EMI due dates into the past to test grace and penalty behavior.
-- Remove this RPC and the Settings UI before final production handover if the client does not need it.

create or replace function public.admin_shift_emi_due_dates_for_testing(
  p_application_id uuid,
  p_days_back integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  application_row public.loan_applications%rowtype;
  changed_count integer := 0;
  first_pending_due_date date;
  target_first_due_date date;
  shift_interval integer;
begin
  perform public.require_admin();

  if p_days_back is null or p_days_back < 1 or p_days_back > 120 then
    raise exception 'Choose a test range between 1 and 120 days.';
  end if;

  select *
  into application_row
  from public.loan_applications
  where id = p_application_id;

  if not found then
    raise exception 'Application not found.';
  end if;

  if application_row.status <> 'active' then
    raise exception 'Only active loans can be aged for EMI testing.';
  end if;

  select min(due_date)
  into first_pending_due_date
  from public.emi_schedule
  where application_id = p_application_id
    and status in ('pending', 'overdue');

  if first_pending_due_date is null then
    raise exception 'This loan has no pending EMI available for testing.';
  end if;

  target_first_due_date := current_date - p_days_back;
  shift_interval := target_first_due_date - first_pending_due_date;

  update public.emi_schedule
  set
    due_date = due_date + shift_interval,
    status = 'pending',
    updated_at = now()
  where application_id = p_application_id
    and status in ('pending', 'overdue');

  get diagnostics changed_count = row_count;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Temporary EMI test dates applied',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'days_back', p_days_back,
      'first_due_date', target_first_due_date,
      'changed_emi_count', changed_count
    )
  );

  return jsonb_build_object(
    'ok', true,
    'loan_id', application_row.loan_id,
    'days_back', p_days_back,
    'first_due_date', target_first_due_date,
    'changed_emi_count', changed_count
  );
end;
$$;

revoke all on function public.admin_shift_emi_due_dates_for_testing(uuid, integer) from public, anon;
grant execute on function public.admin_shift_emi_due_dates_for_testing(uuid, integer) to authenticated;

select 'Temporary EMI testing helper installed' as result;
