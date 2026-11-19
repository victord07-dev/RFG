-- RFG Admin new-device email OTP and trusted-browser gate.
-- Run AFTER FINAL_RELEASE_HARDENING.sql and deploy the two matching Edge Functions.

begin;

create table if not exists public.admin_trusted_devices (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null,
  device_label text not null default 'Admin browser',
  user_agent text,
  first_verified_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  unique (admin_id, token_hash)
);

create table if not exists public.admin_device_challenges (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  session_id text not null,
  otp_hash text not null,
  attempts integer not null default 0 check (attempts between 0 and 5),
  expires_at timestamptz not null,
  resend_available_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.admin_verified_sessions (
  session_id text primary key,
  admin_id uuid not null references public.profiles(id) on delete cascade,
  trusted_device_id uuid references public.admin_trusted_devices(id) on delete set null,
  verified_at timestamptz not null default now(),
  expires_at timestamptz not null
);

create table if not exists public.admin_security_events (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid references public.profiles(id) on delete set null,
  session_id text,
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_challenges_lookup_idx
  on public.admin_device_challenges (admin_id, session_id, created_at desc);
create index if not exists admin_security_events_created_idx
  on public.admin_security_events (created_at desc);

alter table public.admin_trusted_devices enable row level security;
alter table public.admin_device_challenges enable row level security;
alter table public.admin_verified_sessions enable row level security;
alter table public.admin_security_events enable row level security;

revoke all on public.admin_trusted_devices from public, anon, authenticated;
revoke all on public.admin_device_challenges from public, anon, authenticated;
revoke all on public.admin_verified_sessions from public, anon, authenticated;
revoke all on public.admin_security_events from public, anon, authenticated;

create or replace function public.is_current_admin_session_verified()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.admin_verified_sessions verified
    where verified.session_id = coalesce(auth.jwt() ->> 'session_id', '')
      and verified.admin_id = auth.uid()
      and verified.expires_at > now()
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role() = 'admin'
    and public.is_current_admin_session_verified();
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.current_role() = 'sales'
    or (public.current_role() = 'admin' and public.is_current_admin_session_verified());
$$;

create or replace function public.require_active_staff()
returns public.user_role
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  actor_role public.user_role;
begin
  select role into actor_role
  from public.profiles
  where id = auth.uid() and active = true;

  if actor_role is null then
    raise exception 'Your staff account is not active.';
  end if;
  if actor_role = 'admin' and not public.is_current_admin_session_verified() then
    raise exception 'Admin device verification is required.';
  end if;
  return actor_role;
end;
$$;

create or replace function public.require_admin()
returns void
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if public.require_active_staff() <> 'admin' then
    raise exception 'Admin access is required.';
  end if;
end;
$$;

drop policy if exists "verified_admin_read_security_events" on public.admin_security_events;
create policy "verified_admin_read_security_events"
on public.admin_security_events for select to authenticated
using (public.is_admin());
grant select on public.admin_security_events to authenticated;

-- Service-only helper used by admin-device-start.
create or replace function public.service_trust_admin_session(
  p_admin_id uuid,
  p_session_id text,
  p_token_hash text,
  p_user_agent text default null
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  device_row public.admin_trusted_devices%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;

  select * into device_row
  from public.admin_trusted_devices
  where admin_id = p_admin_id
    and token_hash = p_token_hash
    and revoked_at is null
    and expires_at > now()
  for update;

  if device_row.id is null then return false; end if;

  update public.admin_trusted_devices
  set last_used_at = now(), user_agent = coalesce(nullif(p_user_agent, ''), user_agent)
  where id = device_row.id;

  insert into public.admin_verified_sessions (
    session_id, admin_id, trusted_device_id, verified_at, expires_at
  ) values (
    p_session_id, p_admin_id, device_row.id, now(), now() + interval '12 hours'
  ) on conflict (session_id) do update set
    admin_id = excluded.admin_id,
    trusted_device_id = excluded.trusted_device_id,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;

  insert into public.admin_security_events (admin_id, session_id, event_type, details)
  values (p_admin_id, p_session_id, 'trusted_device_login',
    jsonb_build_object('device_id', device_row.id));
  return true;
end;
$$;

-- Atomic challenge completion used by admin-device-verify.
create or replace function public.service_complete_admin_device_challenge(
  p_challenge_id uuid,
  p_admin_id uuid,
  p_session_id text,
  p_candidate_hash text,
  p_device_token_hash text,
  p_device_label text,
  p_user_agent text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  challenge_row public.admin_device_challenges%rowtype;
  device_id uuid;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;

  select * into challenge_row
  from public.admin_device_challenges
  where id = p_challenge_id
    and admin_id = p_admin_id
    and session_id = p_session_id
  for update;

  if challenge_row.id is null or challenge_row.consumed_at is not null then
    return jsonb_build_object('status', 'invalid');
  end if;
  if challenge_row.expires_at <= now() then
    return jsonb_build_object('status', 'expired');
  end if;
  if challenge_row.attempts >= 5 then
    return jsonb_build_object('status', 'locked');
  end if;

  if challenge_row.otp_hash <> p_candidate_hash then
    update public.admin_device_challenges
    set attempts = least(attempts + 1, 5)
    where id = challenge_row.id;
    insert into public.admin_security_events (admin_id, session_id, event_type, details)
    values (p_admin_id, p_session_id, 'admin_otp_failed',
      jsonb_build_object('challenge_id', challenge_row.id,
        'attempt', challenge_row.attempts + 1));
    return jsonb_build_object(
      'status', case when challenge_row.attempts + 1 >= 5 then 'locked' else 'invalid' end,
      'attempts_remaining', greatest(5 - (challenge_row.attempts + 1), 0)
    );
  end if;

  update public.admin_device_challenges set consumed_at = now()
  where id = challenge_row.id;

  insert into public.admin_trusted_devices (
    admin_id, token_hash, device_label, user_agent, expires_at
  ) values (
    p_admin_id, p_device_token_hash,
    left(coalesce(nullif(trim(p_device_label), ''), 'Admin browser'), 120),
    nullif(left(coalesce(p_user_agent, ''), 500), ''),
    now() + interval '90 days'
  ) on conflict (admin_id, token_hash) do update set
    device_label = excluded.device_label,
    user_agent = excluded.user_agent,
    last_used_at = now(),
    expires_at = excluded.expires_at,
    revoked_at = null
  returning id into device_id;

  insert into public.admin_verified_sessions (
    session_id, admin_id, trusted_device_id, verified_at, expires_at
  ) values (
    p_session_id, p_admin_id, device_id, now(), now() + interval '12 hours'
  ) on conflict (session_id) do update set
    admin_id = excluded.admin_id,
    trusted_device_id = excluded.trusted_device_id,
    verified_at = excluded.verified_at,
    expires_at = excluded.expires_at;

  insert into public.admin_security_events (admin_id, session_id, event_type, details)
  values (p_admin_id, p_session_id, 'admin_device_verified',
    jsonb_build_object('challenge_id', challenge_row.id, 'device_id', device_id));

  return jsonb_build_object('status', 'verified', 'device_id', device_id);
end;
$$;

revoke all on function public.is_current_admin_session_verified() from public, anon, authenticated;
grant execute on function public.is_current_admin_session_verified() to authenticated;
revoke all on function public.service_trust_admin_session(uuid, text, text, text)
  from public, anon, authenticated;
grant execute on function public.service_trust_admin_session(uuid, text, text, text)
  to service_role;
revoke all on function public.service_complete_admin_device_challenge(uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.service_complete_admin_device_challenge(uuid, uuid, text, text, text, text, text)
  to service_role;

-- Remove stale security records without touching active trusted devices.
delete from public.admin_device_challenges where created_at < now() - interval '7 days';
delete from public.admin_verified_sessions where expires_at <= now();

commit;

select 'RFG Admin new-device OTP gate installed' as result;
