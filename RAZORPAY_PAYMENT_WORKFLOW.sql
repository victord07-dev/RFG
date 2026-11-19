-- Secure Razorpay order ledger and short-lived customer payment sessions.
-- Run once in Supabase SQL Editor before deploying the Razorpay Edge Functions.

begin;

create table if not exists public.customer_payment_sessions (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  token_hash bytea not null unique,
  expires_at timestamptz not null,
  last_used_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.razorpay_orders (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.loan_applications(id) on delete cascade,
  emi_schedule_id uuid not null references public.emi_schedule(id) on delete restrict,
  razorpay_order_id text unique,
  razorpay_payment_id text unique,
  receipt text not null unique,
  base_amount numeric(12,2) not null check (base_amount > 0),
  gross_amount numeric(12,2) not null check (gross_amount >= base_amount),
  amount_subunits bigint not null check (amount_subunits > 0),
  estimated_fee numeric(12,2) not null default 0,
  estimated_fee_gst numeric(12,2) not null default 0,
  status text not null default 'creating' check (status in ('creating','created','authorized','captured','failed','refunded','expired')),
  failure_code text,
  captured_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists razorpay_one_open_order_per_emi
  on public.razorpay_orders(emi_schedule_id)
  where status in ('creating','created','authorized');

create table if not exists public.razorpay_webhook_events (
  event_id text primary key,
  event_type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.payments
  add column if not exists gateway_order_id text,
  add column if not exists gateway_payment_id text,
  add column if not exists gross_amount numeric(12,2),
  add column if not exists gateway_fee numeric(12,2),
  add column if not exists gateway_fee_gst numeric(12,2),
  add column if not exists net_settlement numeric(12,2);

create unique index if not exists payments_gateway_order_unique
  on public.payments(gateway_order_id) where gateway_order_id is not null;
create unique index if not exists payments_gateway_payment_unique
  on public.payments(gateway_payment_id) where gateway_payment_id is not null;

alter table public.customer_payment_sessions enable row level security;
alter table public.razorpay_orders enable row level security;
alter table public.razorpay_webhook_events enable row level security;

revoke all on public.customer_payment_sessions from public, anon, authenticated;
revoke all on public.razorpay_orders from public, anon, authenticated;
revoke all on public.razorpay_webhook_events from public, anon, authenticated;

create or replace function public.customer_open_payment_session(
  p_mobile text,
  p_plain_mpin text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  login_payload jsonb;
  application_uuid uuid;
  raw_token text;
begin
  -- Reuse the hardened login function so its rate limiting and MPIN checks remain authoritative.
  login_payload := public.customer_app_login(p_mobile, p_plain_mpin);
  if coalesce((login_payload ->> 'ok')::boolean, true) = false then
    return login_payload;
  end if;

  application_uuid := nullif(login_payload #>> '{application,id}', '')::uuid;
  if application_uuid is null then
    raise exception 'Customer payment session could not be created.';
  end if;

  raw_token := encode(extensions.gen_random_bytes(32), 'hex');
  update public.customer_payment_sessions
  set revoked_at = now()
  where application_id = application_uuid and revoked_at is null;

  insert into public.customer_payment_sessions(application_id, token_hash, expires_at)
  values (application_uuid, extensions.digest(raw_token, 'sha256'), now() + interval '12 hours');

  return login_payload || jsonb_build_object('customer_session_token', raw_token);
end;
$$;

create or replace function public.service_resolve_customer_payment_session(p_token text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  application_uuid uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'Service role required.';
  end if;
  if p_token !~ '^[0-9a-f]{64}$' then return null; end if;

  select session.application_id into application_uuid
  from public.customer_payment_sessions session
  join public.loan_applications application on application.id = session.application_id
  where session.token_hash = extensions.digest(p_token, 'sha256')
    and session.revoked_at is null
    and session.expires_at > now()
    and application.status = 'active'
  limit 1;

  if application_uuid is not null then
    update public.customer_payment_sessions
    set last_used_at = now()
    where token_hash = extensions.digest(p_token, 'sha256');
  end if;
  return application_uuid;
end;
$$;

create or replace function public.service_finalize_razorpay_payment(
  p_razorpay_order_id text,
  p_razorpay_payment_id text,
  p_amount_subunits bigint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_row public.razorpay_orders%rowtype;
  emi_row public.emi_schedule%rowtype;
  payment_uuid uuid;
  new_payment_id text;
begin
  if auth.role() <> 'service_role' then raise exception 'Service role required.'; end if;

  select * into order_row from public.razorpay_orders
  where razorpay_order_id = p_razorpay_order_id for update;
  if order_row.id is null then raise exception 'Unknown Razorpay order.'; end if;
  if order_row.amount_subunits <> p_amount_subunits then raise exception 'Razorpay amount mismatch.'; end if;

  if order_row.status = 'captured' then
    return jsonb_build_object('ok', true, 'duplicate', true, 'payment_id', order_row.razorpay_payment_id);
  end if;
  if order_row.razorpay_payment_id is not null and order_row.razorpay_payment_id <> p_razorpay_payment_id then
    raise exception 'Razorpay payment mismatch.';
  end if;

  select * into emi_row from public.emi_schedule
  where id = order_row.emi_schedule_id and application_id = order_row.application_id for update;
  if emi_row.id is null or emi_row.status not in ('pending','overdue') then
    raise exception 'EMI is no longer payable.';
  end if;

  new_payment_id := public.next_rfg_payment_id();
  insert into public.payments(
    payment_id, application_id, emi_schedule_id, amount, mode, status, reference, notes,
    verified_at, gateway_order_id, gateway_payment_id, gross_amount, gateway_fee,
    gateway_fee_gst, net_settlement
  ) values (
    new_payment_id, order_row.application_id, order_row.emi_schedule_id, order_row.base_amount,
    'razorpay', 'paid', p_razorpay_payment_id, 'Captured and verified through Razorpay', now(),
    p_razorpay_order_id, p_razorpay_payment_id, order_row.gross_amount,
    order_row.estimated_fee, order_row.estimated_fee_gst, order_row.base_amount
  ) returning id into payment_uuid;

  update public.emi_schedule
  set status = 'paid', paid_amount = round(coalesce(paid_amount, 0) + order_row.base_amount, 2), updated_at = now()
  where id = order_row.emi_schedule_id;

  update public.razorpay_orders
  set status = 'captured', razorpay_payment_id = p_razorpay_payment_id,
      captured_at = now(), updated_at = now()
  where id = order_row.id;

  insert into public.activity_logs(application_id, action, details)
  values (order_row.application_id, 'Razorpay payment captured', jsonb_build_object(
    'payment_id', new_payment_id, 'razorpay_order_id', p_razorpay_order_id,
    'razorpay_payment_id', p_razorpay_payment_id, 'emi_schedule_id', order_row.emi_schedule_id,
    'base_amount', order_row.base_amount, 'gross_amount', order_row.gross_amount
  ));

  return jsonb_build_object('ok', true, 'duplicate', false, 'payment_id', new_payment_id);
end;
$$;

revoke all on function public.customer_open_payment_session(text,text) from public, anon, authenticated;
grant execute on function public.customer_open_payment_session(text,text) to anon, authenticated;
revoke all on function public.service_resolve_customer_payment_session(text) from public, anon, authenticated;
revoke all on function public.service_finalize_razorpay_payment(text,text,bigint) from public, anon, authenticated;
grant execute on function public.service_resolve_customer_payment_session(text) to service_role;
grant execute on function public.service_finalize_razorpay_payment(text,text,bigint) to service_role;
grant select, insert, update, delete on public.customer_payment_sessions to service_role;
grant select, insert, update on public.razorpay_orders to service_role;
grant select, insert, update on public.razorpay_webhook_events to service_role;

delete from public.customer_payment_sessions where expires_at <= now() or revoked_at is not null;

commit;

select 'RFG Razorpay payment workflow installed' as result;
