-- Temporary customer login diagnostic patch.
-- Use only while testing. It makes customer_app_login report which condition failed.

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
  mobile_count integer := 0;
  active_count integer := 0;
  hash_count integer := 0;
  matching_count integer := 0;
  application_row public.loan_applications%rowtype;
  checklist_row public.document_checklists%rowtype;
  settings_row public.payment_settings%rowtype;
begin
  if trim(coalesce(p_mobile, '')) = '' or trim(coalesce(p_plain_mpin, '')) = '' then
    raise exception 'Enter mobile number and MPIN.';
  end if;

  perform public.refresh_overdue_emis();

  select count(*)
  into mobile_count
  from public.loan_applications
  where regexp_replace(mobile, '\D', '', 'g') = normalized_mobile;

  if mobile_count = 0 then
    raise exception 'No customer loan found for mobile %.', normalized_mobile;
  end if;

  select count(*)
  into active_count
  from public.loan_applications
  where regexp_replace(mobile, '\D', '', 'g') = normalized_mobile
    and status = 'active';

  if active_count = 0 then
    raise exception 'Customer loan exists, but it is not active yet.';
  end if;

  select count(*)
  into hash_count
  from public.loan_applications
  where regexp_replace(mobile, '\D', '', 'g') = normalized_mobile
    and status = 'active'
    and customer_mpin_hash is not null
    and customer_mpin_hash <> '';

  if hash_count = 0 then
    raise exception 'Customer loan is active, but MPIN hash is missing.';
  end if;

  select count(*)
  into matching_count
  from public.loan_applications
  where regexp_replace(mobile, '\D', '', 'g') = normalized_mobile
    and status = 'active'
    and customer_mpin_hash is not null
    and customer_mpin_hash <> ''
    and customer_mpin_hash = extensions.crypt(p_plain_mpin, customer_mpin_hash);

  if matching_count = 0 then
    raise exception 'Mobile and active loan found, but MPIN does not match.';
  end if;

  select *
  into application_row
  from public.loan_applications
  where regexp_replace(mobile, '\D', '', 'g') = normalized_mobile
    and status = 'active'
    and customer_mpin_hash is not null
    and customer_mpin_hash <> ''
    and customer_mpin_hash = extensions.crypt(p_plain_mpin, customer_mpin_hash)
  order by coalesce(disbursed_at, approved_at, created_at) desc
  limit 1;

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

grant execute on function public.customer_app_login(text, text) to anon, authenticated;

select 'Customer login diagnostic patch installed' as result;
