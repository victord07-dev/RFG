# RFG Supabase Setup

## 1. Run The Schema

Open Supabase Dashboard -> SQL Editor -> New query.

Paste and run the full contents of:

`supabase-schema.sql`

This creates and upgrades:

- staff profiles and roles
- customers, sellers, showrooms
- loan applications, terms, checklist, EMI schedule
- payments and cash payment requests
- payment settings
- activity logs and login logs
- row level security policies

Then open a second new query, paste and run:

`BACKEND_HARDENING.sql`

This installs the protected backend workflows used by the current frontend:

- atomic application creation
- server-generated loan, request and payment IDs
- secure hashed customer MPINs
- controlled loan status changes and EMI generation
- atomic payment request approval or rejection
- staff record isolation and tighter write permissions

The frontend will show RPC errors until this hardening migration has been run.

## 2. Create The First Admin

Open Supabase Dashboard -> Authentication -> Users -> Add user.

Create the first admin with the official email, for example:

`info@rfg-financialgroup.com`

After the user exists, run this in SQL Editor:

```sql
update public.profiles
set role = 'admin',
    active = true,
    full_name = 'RFG Admin',
    email = lower('info@rfg-financialgroup.com')
where email = lower('info@rfg-financialgroup.com');
```

Important: new Google/email users are inactive by default. Admin must activate staff before they can enter the app.

Account limits are enforced by the database:

- only 1 active admin account
- only 2 active sales member accounts

If you try to activate more than this, Supabase will reject the update.

## 3. Create Sales Users

Create the user in Authentication -> Users, then activate them:

```sql
update public.profiles
set role = 'sales',
    active = true,
    full_name = 'Sales User Name'
where email = lower('sales@example.com');
```

## 4. Auth Redirect URLs

For local testing, add these in Supabase -> Authentication -> URL Configuration:

Site URL:

`http://127.0.0.1:5209`

Redirect URLs:

`http://127.0.0.1:5209`

When deployed to Hostinger, add the production domain too.

## 5. Google Login Later

Google login will work only after:

- Google provider is enabled in Supabase Auth
- redirect URL is configured
- the Google email exists in `profiles`
- that profile is `active = true`

## 6. Logs

Recent log rows stay in Supabase. The automatic archive worker can move older
calendar months to the client's private Google Drive while keeping archive
history visible to the admin.

## 7. Verify The Hardened Backend

Run this read-only check after `BACKEND_HARDENING.sql`:

```sql
select
  to_regprocedure('public.create_loan_application(jsonb,jsonb,text)') is not null as application_rpc,
  to_regprocedure('public.set_loan_status(text,text)') is not null as loan_status_rpc,
  to_regprocedure('public.submit_cash_payment_request(uuid,uuid,text,text)') is not null as cash_request_rpc,
  to_regprocedure('public.review_payment_request(text,text)') is not null as payment_review_rpc,
  to_regprocedure('public.reset_customer_mpin(text,text)') is not null as mpin_reset_rpc;
```

Every result should be `true`.

## 8. Install Admin Backend Features

After the hardened workflow has been tested, run:

`BACKEND_ADMIN_FEATURES.sql`

This enables:

- admin loan-term edits with a mandatory reason
- old and new values in activity logs
- safe EMI schedule regeneration before payment activity begins
- protected payment receiver settings
- database enforcement when cash or manual bank QR is disabled

## 9. Configure Automatic Log Archiving

Follow `GOOGLE_DRIVE_LOG_ARCHIVE_SETUP.md` using the client-owned Google Account.

Optional fallback routes remain available:

- `HOSTINGER_LOG_ARCHIVE_SETUP.md`
- `LOG_ARCHIVE_SETUP.md` for Cloudflare R2
