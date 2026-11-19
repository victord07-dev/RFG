# Optional RFG Log Archive Using Hostinger

This is an optional fallback route. The primary free setup is documented in
`GOOGLE_DRIVE_LOG_ARCHIVE_SETUP.md`.

This option uses the existing Hostinger Cloud plan. No Cloudflare R2 account or
payment method is required.

The monthly worker:

1. Reads log rows older than the two-month calendar retention window.
2. Creates one compressed `.json.gz` file per month.
3. Stores it in a private directory outside `public_html`.
4. Verifies file size and SHA-256 checksum.
5. Calls Supabase's protected finalization transaction.
6. Deletes the exported rows only after finalization succeeds.

## 1. Install The Supabase Database Part

Run the complete contents of `BACKEND_LOG_ARCHIVE.sql` in Supabase SQL Editor.

Expected result:

`RFG log archive database installed`

## 2. Find The Private Hostinger Path

Use Hostinger File Manager or SSH to identify the account home path. Create:

`private/rfg-log-archives`

It must be outside `public_html`.

Example only:

`/home/u123456789/private/rfg-log-archives`

## 3. Upload The Worker

Upload these files into a private script directory outside `public_html`:

- `hostinger-log-archive/archive-logs.php`
- a renamed copy of `hostinger-log-archive/config.example.php` called `config.php`

Suggested location:

`/home/YOUR_USER/private/rfg-log-worker/`

## 4. Configure The Private File

Edit `config.php` on Hostinger:

- Add the Supabase service role key.
- Replace the Hostinger username/path placeholders.
- Confirm `archive_dir` and `lock_file` are outside `public_html`.

The Supabase service role key is available under:

**Supabase → Project Settings → API Keys**

Never place this key in frontend files or inside `public_html`.

## 5. Test It Manually

Using SSH or Hostinger's command runner:

```bash
php /home/YOUR_USER/private/rfg-log-worker/archive-logs.php \
  /home/YOUR_USER/private/rfg-log-worker/config.php
```

Because the project is new, the expected result is:

`No logs are old enough to archive.`

## 6. Create The Monthly Cron Job

In hPanel, open **Cron Jobs** and add a custom monthly command:

```bash
/usr/bin/php /home/YOUR_USER/private/rfg-log-worker/archive-logs.php \
  /home/YOUR_USER/private/rfg-log-worker/config.php \
  >> /home/YOUR_USER/private/rfg-log-archive-cron.log 2>&1
```

Schedule it for the first day of every month, such as `02:15`.

The exact PHP executable path may be shown by Hostinger's Cron Jobs page. Use
that displayed PHP path if it differs from `/usr/bin/php`.

## 7. Verify Later

Archive manifests:

```sql
select archive_month, activity_count, login_count, size_bytes, archived_at
from public.log_archives
order by archive_month desc, archived_at desc;
```

The same monthly rows appear in Admin → Activity Logs → Archive History.
