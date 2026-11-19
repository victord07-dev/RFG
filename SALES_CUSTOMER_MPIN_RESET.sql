begin;

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
  actor_role public.user_role;
  application_row public.loan_applications%rowtype;
begin
  actor_role := public.require_active_staff();

  if p_plain_mpin !~ '^[0-9]{4,6}$' then
    raise exception 'Customer MPIN must contain 4 to 6 digits.';
  end if;

  select * into application_row
  from public.loan_applications
  where loan_id = p_loan_id
  for update;

  if application_row.id is null then
    raise exception 'Application not found.';
  end if;

  if application_row.status <> 'active' then
    raise exception 'MPIN can be reset only for an active loan.';
  end if;

  if actor_role = 'sales' and application_row.created_by is distinct from auth.uid() then
    raise exception 'You can reset MPIN only for your own customer.';
  end if;

  if exists (
    select 1
    from public.activity_logs log
    where log.application_id = application_row.id
      and log.actor_id = auth.uid()
      and log.action = 'Customer MPIN reset'
      and log.created_at > now() - interval '60 seconds'
  ) then
    raise exception 'Please wait before resetting this MPIN again.';
  end if;

  update public.loan_applications
  set customer_mpin = '',
      customer_mpin_hash = extensions.crypt(p_plain_mpin, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = application_row.id;

  insert into public.activity_logs (application_id, actor_id, action, details)
  values (
    application_row.id,
    auth.uid(),
    'Customer MPIN reset',
    jsonb_build_object(
      'loan_id', application_row.loan_id,
      'actor_role', actor_role,
      'credential_exposed', false
    )
  );

  return true;
end;
$$;

revoke all on function public.reset_customer_mpin(text, text) from public, anon, authenticated;
grant execute on function public.reset_customer_mpin(text, text) to authenticated;

commit;

select 'Sales customer MPIN reset installed' as result;
