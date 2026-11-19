-- Run after ADMIN_DEVICE_OTP.sql.
begin;

create table if not exists public.admin_attention_state (
  admin_id uuid primary key references public.profiles(id) on delete cascade,
  last_opened_at timestamptz,
  last_heartbeat_at timestamptz,
  last_reminder_at timestamptz,
  last_reminder_reason text,
  last_reminder_count integer not null default 0,
  updated_at timestamptz not null default now()
);

alter table public.admin_attention_state enable row level security;
revoke all on public.admin_attention_state from public, anon, authenticated;

create or replace function public.record_admin_presence()
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  actor_id uuid := auth.uid();
begin
  perform public.require_admin();

  insert into public.admin_attention_state (
    admin_id,
    last_opened_at,
    last_heartbeat_at,
    updated_at
  ) values (
    actor_id,
    now(),
    now(),
    now()
  )
  on conflict (admin_id) do update
  set last_opened_at = excluded.last_opened_at,
      last_heartbeat_at = excluded.last_heartbeat_at,
      updated_at = excluded.updated_at;

  return true;
end;
$$;

revoke all on function public.record_admin_presence() from public, anon, authenticated;
grant execute on function public.record_admin_presence() to authenticated;

commit;

select 'RFG Admin attention reminder state installed' as result;
