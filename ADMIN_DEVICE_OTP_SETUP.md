# Admin New-Device Email Verification

This feature applies only to the active Admin account. Sales login remains unchanged.

## Security behavior

- A correct Admin email and password creates a Supabase Auth session.
- The database blocks that Admin session from Admin tables and RPC actions until device verification succeeds.
- A six-digit code is emailed to the Admin and expires after 10 minutes.
- Codes are single-use, limited to five attempts, and cannot be resent for 60 seconds.
- A verified browser receives a random device token. Only its SHA-256 hash is stored in PostgreSQL.
- Trusted devices expire after 90 days. Verified sessions expire after 12 hours.
- Verification attempts and trusted-device use are written to `admin_security_events`.

## 1. Install database objects

Run the complete `ADMIN_DEVICE_OTP.sql` file in the live Supabase SQL Editor after `FINAL_RELEASE_HARDENING.sql`.

Do not continue if SQL reports an error.

## 2. Configure the client-owned email sender

Use a client-owned Resend account and verify the RFG sending domain. Create an API key that is used only by this Supabase project.

Recommended sender:

`RFG Security <security@rfg-financialgroup.com>`

The exact sender must be allowed by the verified Resend domain.

## 3. Set Supabase Edge Function secrets

Set these in Supabase Dashboard -> Edge Functions -> Secrets:

- `RESEND_API_KEY`: Resend server API key
- `ADMIN_OTP_FROM_EMAIL`: verified sender shown above
- `ADMIN_OTP_RECIPIENT_EMAIL`: `reliantfuturegroup@gmail.com`
- `ADMIN_OTP_PEPPER`: a cryptographically random value of at least 32 characters
- `APP_ORIGINS`: comma-separated allowed frontend origins

Example `APP_ORIGINS`:

`https://your-production-domain.example,http://127.0.0.1:5173,http://localhost:5173`

Use exact origins only: scheme, hostname, and port where applicable. Do not add paths or a trailing slash.

The Admin login identity remains unchanged. New-device codes are delivered to the private security inbox configured by `ADMIN_OTP_RECIPIENT_EMAIL`.

Never create `VITE_` variables for these values. Never paste the recipient, service-role key, Resend key, or pepper into frontend code.

## 4. Deploy the Edge Functions

From the project folder after installing and signing into the Supabase CLI:

```powershell
supabase link --project-ref kizjrvzctilzugbjlfwl
supabase functions deploy admin-device-start
supabase functions deploy admin-device-verify
```

The functions use Supabase's server-side project credentials. Do not pass a service-role key to the browser.

## 5. Test before deployment

1. Open a private/incognito browser window.
2. Sign in with the active Admin email and password.
3. Confirm the Admin dashboard does not load before the email code is verified.
4. Enter a wrong code and confirm the remaining-attempt message appears.
5. Enter the correct code and confirm the Admin dashboard loads.
6. Sign out and sign in again from the same browser; it should recognize the trusted device.
7. Sign in from another browser/device; it must request a new code.
8. Confirm a Sales account signs in normally without an email-code screen.
9. Review `admin_security_events`, `admin_trusted_devices`, and `admin_verified_sessions` in Supabase.

## 6. Production origin update

When the final Hostinger domain is known, add its exact HTTPS origin to `APP_ORIGINS`, then redeploy both Edge Functions. A frontend rebuild is not required just to change this server-side secret.
