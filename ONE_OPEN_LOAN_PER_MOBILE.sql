-- Allow a customer mobile number to have only one open loan at a time.
-- Closed and rejected applications remain as history and do not block a new application.

begin;

create or replace function public.enforce_one_open_loan_per_mobile()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_mobile text := regexp_replace(coalesce(new.mobile, ''), '\D', '', 'g');
  conflicting_loan_id text;
begin
  if normalized_mobile = '' or new.status not in ('under_processing', 'approved', 'active') then
    return new;
  end if;

  -- Serialize attempts for the same number so concurrent submissions cannot bypass the check.
  perform pg_advisory_xact_lock(hashtextextended(normalized_mobile, 724391));

  select application.loan_id
    into conflicting_loan_id
  from public.loan_applications application
  where application.id is distinct from new.id
    and regexp_replace(coalesce(application.mobile, ''), '\D', '', 'g') = normalized_mobile
    and application.status in ('under_processing', 'approved', 'active')
  order by application.created_at desc
  limit 1;

  if conflicting_loan_id is not null then
    raise exception using
      errcode = 'P0001',
      message = format(
        'This mobile number already has an open loan (%s). A new application can be created after that loan is closed.',
        conflicting_loan_id
      );
  end if;

  new.mobile := normalized_mobile;
  return new;
end;
$$;

drop trigger if exists loan_applications_one_open_mobile on public.loan_applications;
create trigger loan_applications_one_open_mobile
before insert or update of mobile, status
on public.loan_applications
for each row
execute function public.enforce_one_open_loan_per_mobile();

revoke all on function public.enforce_one_open_loan_per_mobile() from public, anon, authenticated;

-- Abort installation if existing production data already violates the intended rule.
do $$
declare
  duplicate_mobile text;
begin
  select regexp_replace(coalesce(mobile, ''), '\D', '', 'g')
    into duplicate_mobile
  from public.loan_applications
  where status in ('under_processing', 'approved', 'active')
  group by regexp_replace(coalesce(mobile, ''), '\D', '', 'g')
  having count(*) > 1
  limit 1;

  if duplicate_mobile is not null then
    raise exception 'Existing open loans already share mobile %. Resolve them before installing this rule.', duplicate_mobile;
  end if;
end;
$$;

create unique index if not exists loan_applications_one_open_mobile_uidx
on public.loan_applications ((regexp_replace(coalesce(mobile, ''), '\D', '', 'g')))
where status in ('under_processing', 'approved', 'active');

commit;

select 'One open loan per customer mobile rule installed' as result;
