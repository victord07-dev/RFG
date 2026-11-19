-- RFG Financial automatic two-month log archive
-- Run after BACKEND_HARDENING.sql.

begin;

create table if not exists public.log_archives (
  id uuid primary key default gen_random_uuid(),
  archive_month date not null,
  object_key text not null unique,
  bucket_name text not null,
  storage_provider text not null default 'other',
  activity_count integer not null default 0 check (activity_count >= 0),
  login_count integer not null default 0 check (login_count >= 0),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  checksum_sha256 text not null,
  archived_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  check (archive_month = date_trunc('month', archive_month)::date)
);

alter table public.log_archives
add column if not exists storage_provider text;

update public.log_archives
set storage_provider = case
  when lower(trim(bucket_name)) = 'google-drive' then 'google-drive'
  when lower(bucket_name) like '%hostinger%' then 'hostinger'
  when lower(bucket_name) like '%r2%' or lower(trim(bucket_name)) = 'rfg-log-archives' then 'cloudflare-r2'
  else 'other'
end
where storage_provider is null or trim(storage_provider) = '';

alter table public.log_archives
alter column storage_provider set default 'other';

alter table public.log_archives
alter column storage_provider set not null;

create index if not exists idx_log_archives_month
on public.log_archives (archive_month desc, archived_at desc);

alter table public.log_archives enable row level security;

drop policy if exists "admin_read_log_archives" on public.log_archives;
create policy "admin_read_log_archives"
on public.log_archives for select
to authenticated
using (public.is_admin());

grant select on public.log_archives to authenticated;
revoke insert, update, delete on public.log_archives from authenticated;

-- Archive workers use a private service-role key. Explicit grants are needed
-- for REST reads even though service_role bypasses row-level security.
grant usage on schema public to service_role;
grant select on public.log_archives to service_role;
grant select on public.activity_logs to service_role;
grant select on public.login_logs to service_role;

create or replace function public.finalize_log_archive(
  p_archive_month date,
  p_object_key text,
  p_bucket_name text,
  p_checksum_sha256 text,
  p_size_bytes bigint,
  p_activity_ids uuid[],
  p_login_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  month_start date := date_trunc('month', p_archive_month)::date;
  month_end date := (date_trunc('month', p_archive_month) + interval '1 month')::date;
  retention_cutoff date := (date_trunc('month', now()) - interval '1 month')::date;
  activity_expected integer := coalesce(array_length(p_activity_ids, 1), 0);
  login_expected integer := coalesce(array_length(p_login_ids, 1), 0);
  activity_deleted integer;
  login_deleted integer;
  archive_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role access is required.';
  end if;

  if p_archive_month <> month_start then
    raise exception 'Archive month must be the first day of a month.';
  end if;

  if month_start >= retention_cutoff then
    raise exception 'This month is still inside the two-month Supabase retention window.';
  end if;

  if nullif(trim(p_object_key), '') is null
    or nullif(trim(p_bucket_name), '') is null
    or p_checksum_sha256 !~ '^[a-f0-9]{64}$'
    or p_size_bytes <= 0 then
    raise exception 'Archive metadata is incomplete.';
  end if;

  lock table public.activity_logs in share row exclusive mode;
  lock table public.login_logs in share row exclusive mode;

  if exists (
    select 1
    from public.activity_logs
    where id = any(coalesce(p_activity_ids, array[]::uuid[]))
      and (created_at < month_start or created_at >= month_end or created_at >= retention_cutoff)
  ) then
    raise exception 'Activity archive contains rows outside the requested month.';
  end if;

  if exists (
    select 1
    from public.login_logs
    where id = any(coalesce(p_login_ids, array[]::uuid[]))
      and (created_at < month_start or created_at >= month_end or created_at >= retention_cutoff)
  ) then
    raise exception 'Login archive contains rows outside the requested month.';
  end if;

  if exists (
    select 1
    from public.activity_logs
    where created_at >= month_start
      and created_at < month_end
      and not (id = any(coalesce(p_activity_ids, array[]::uuid[])))
  ) then
    raise exception 'Activity archive does not contain every row in the requested month.';
  end if;

  if exists (
    select 1
    from public.login_logs
    where created_at >= month_start
      and created_at < month_end
      and not (id = any(coalesce(p_login_ids, array[]::uuid[])))
  ) then
    raise exception 'Login archive does not contain every row in the requested month.';
  end if;

  insert into public.log_archives (
    archive_month,
    object_key,
    bucket_name,
    storage_provider,
    activity_count,
    login_count,
    size_bytes,
    checksum_sha256
  )
  values (
    month_start,
    trim(p_object_key),
    trim(p_bucket_name),
    case
      when lower(trim(p_bucket_name)) = 'google-drive' then 'google-drive'
      when lower(p_bucket_name) like '%hostinger%' then 'hostinger'
      when lower(p_bucket_name) like '%r2%' or lower(trim(p_bucket_name)) = 'rfg-log-archives' then 'cloudflare-r2'
      else 'other'
    end,
    activity_expected,
    login_expected,
    p_size_bytes,
    p_checksum_sha256
  )
  returning id into archive_id;

  delete from public.activity_logs
  where id = any(coalesce(p_activity_ids, array[]::uuid[]));
  get diagnostics activity_deleted = row_count;

  delete from public.login_logs
  where id = any(coalesce(p_login_ids, array[]::uuid[]));
  get diagnostics login_deleted = row_count;

  if activity_deleted <> activity_expected or login_deleted <> login_expected then
    raise exception 'Archive row counts changed before finalization. No rows were deleted.';
  end if;

  return jsonb_build_object(
    'archive_id', archive_id,
    'archive_month', month_start,
    'activity_count', activity_deleted,
    'login_count', login_deleted,
    'object_key', trim(p_object_key)
  );
end;
$$;

revoke all on function public.finalize_log_archive(date, text, text, text, bigint, uuid[], uuid[])
from public, anon, authenticated;
grant execute on function public.finalize_log_archive(date, text, text, text, bigint, uuid[], uuid[])
to service_role;

-- Retire the older mark-only helper. Every supported archive worker uploads,
-- verifies and atomically finalizes each archive batch.
revoke all on function public.mark_old_logs_archived(text)
from public, anon, authenticated;

commit;

select 'RFG log archive database installed' as result;
