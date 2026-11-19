# Optional RFG Log Archive Using Cloudflare R2

This is an optional fallback route. The primary free setup is documented in
`GOOGLE_DRIVE_LOG_ARCHIVE_SETUP.md`.

The R2 implementation keeps the current month and previous month in Supabase.
Older calendar months are compressed, uploaded to a private Cloudflare R2
bucket, verified, recorded in `log_archives`, and then deleted from the live
log tables.

## 1. Create The Private R2 Bucket

In Cloudflare Dashboard:

1. Open **R2 Object Storage**.
2. Create a bucket named `rfg-log-archives`.
3. Keep public access disabled.

## 2. Create Restricted R2 Credentials

In R2, open **Manage R2 API Tokens** and create credentials with:

- Object Read & Write
- Restricted to the `rfg-log-archives` bucket

Save these values securely:

- Account ID
- Access Key ID
- Secret Access Key

The Secret Access Key is shown only once.

## 3. Install The Archive Database

Run the complete contents of:

`BACKEND_LOG_ARCHIVE.sql`

Expected result:

`RFG log archive database installed`

## 4. Deploy The Edge Function

From the project folder with Supabase CLI:

```powershell
supabase login
supabase link --project-ref kizjrvzctilzugbjlfwl
supabase functions deploy archive-logs --no-verify-jwt
```

Generate a long random archive secret, then configure function secrets:

```powershell
supabase secrets set R2_ACCOUNT_ID="YOUR_ACCOUNT_ID"
supabase secrets set R2_ACCESS_KEY_ID="YOUR_ACCESS_KEY_ID"
supabase secrets set R2_SECRET_ACCESS_KEY="YOUR_SECRET_ACCESS_KEY"
supabase secrets set R2_BUCKET="rfg-log-archives"
supabase secrets set ARCHIVE_CRON_SECRET="YOUR_LONG_RANDOM_SECRET"
```

Do not place these values in `.env.local` or frontend code.

## 5. Test The Function

The real archive will report that no records are eligible until logs are older than
the retention window. Invoke it with:

```powershell
$headers = @{
  "Content-Type" = "application/json"
  "x-archive-secret" = "YOUR_LONG_RANDOM_SECRET"
}
Invoke-RestMethod `
  -Method Post `
  -Uri "https://kizjrvzctilzugbjlfwl.supabase.co/functions/v1/archive-logs" `
  -Headers $headers `
  -Body "{}"
```

Expected response:

```json
{
  "ok": true,
  "message": "No logs are old enough to archive."
}
```

## 6. Schedule The Monthly Job

Open `LOG_ARCHIVE_SCHEDULE_TEMPLATE.sql` and replace:

- `YOUR_PROJECT_REF`
- `YOUR_ARCHIVE_CRON_SECRET`

Run the edited SQL in Supabase SQL Editor. It schedules the job for the first day
of each month at 02:15 UTC.

## 7. Verify

Check the schedule:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'rfg-monthly-log-archive';
```

Check completed archive manifests:

```sql
select archive_month, activity_count, login_count, size_bytes, archived_at
from public.log_archives
order by archive_month desc, archived_at desc;
```
