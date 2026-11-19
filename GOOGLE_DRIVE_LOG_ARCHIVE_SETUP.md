# RFG Log Archive Using Google Drive

This is the primary archive route. It uses the client-owned Google Account
`info@rfg-financialgroup.com`, Google Apps Script, and a private Drive folder.
No Cloudflare or Hostinger payment method is required.

The worker keeps the current calendar month and previous calendar month in
Supabase. Older months are compressed, verified in Drive, recorded in
`log_archives`, and only then deleted from the live log tables.

## 1. Upgrade The Archive Database

Run the complete updated `BACKEND_LOG_ARCHIVE.sql` in Supabase SQL Editor.
It is safe to run again if an earlier version was already installed.

Expected result:

`RFG log archive database installed`

Verify the provider column and protected function:

```sql
select
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'log_archives'
      and column_name = 'storage_provider'
  ) as provider_column,
  to_regprocedure(
    'public.finalize_log_archive(date,text,text,text,bigint,uuid[],uuid[])'
  ) is not null as finalize_function;
```

Both values must be `true`.

The updated migration also grants the private `service_role` read access to
`log_archives`, `activity_logs`, and `login_logs`. This is required for the
Apps Script REST requests even though that role bypasses row-level security.

## 2. Create The Apps Script Project

1. Sign in to Google as `info@rfg-financialgroup.com`.
2. Open [script.google.com](https://script.google.com).
3. Create a new project named `RFG Log Archive`.
4. Replace the default editor contents with
   `google-apps-script/Code.gs`.
5. In **Project Settings**, set the time zone to
   **(GMT+05:30) India Standard Time - Kolkata**.

The included `appsscript.json` records the intended manifest settings. It is
not necessary to expose the manifest file if the project time zone is set in
Project Settings.

## 3. Add Private Script Properties

In Apps Script, open:

**Project Settings -> Script Properties -> Add script property**

Add:

| Property | Value |
| --- | --- |
| `SUPABASE_URL` | `https://kizjrvzctilzugbjlfwl.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | The Legacy API Keys `service_role` JWT |
| `MAX_MONTHS_PER_RUN` | `3` |

Find this key under:

**Supabase -> Project Settings -> API Keys -> Legacy API Keys -> service_role**

Click **Reveal**, then copy the long JWT value. It normally begins with
`eyJ...` and contains two dots. Google Apps Script cannot use an
`sb_secret_...` key because Supabase rejects secret keys when the request has a
browser-like User-Agent.

Do not add the service-role JWT to `Code.gs`, the frontend, Git, Drive files,
or screenshots. Never use the publishable or `anon` key.

The folder ID is created and saved automatically during setup.

## 4. Create The Folder And Trigger

1. Select `setupGoogleDriveArchive` in the function menu.
2. Click **Run**.
3. Approve the requested Drive, external request, and trigger permissions.
4. If Google shows an unverified-app warning, choose the advanced option and
   continue to this private script project.

The setup function:

- creates `RFG Log Archives` in My Drive;
- keeps the folder restricted;
- stores its ID as `DRIVE_FOLDER_ID`;
- installs one monthly trigger for day 2 around 02:15 India time;
- confirms that Supabase and `log_archives` are reachable.

Open **Executions** and confirm the run completed successfully.

## 5. Test The Worker

Select `archiveOldLogs` and click **Run**.

For a new project, the expected execution result is:

`No logs are old enough to archive.`

That is a successful test. It confirms authentication, table access, Drive
access, and the retention calculation without deleting current logs.

## 6. Confirm Privacy And Schedule

In Google Drive:

1. Open `RFG Log Archives`.
2. Open **Manage access**.
3. Confirm **General access: Restricted**.
4. Confirm only the client-owned account has access.

In Apps Script, open **Triggers** and confirm:

- function: `archiveOldLogs`
- event source: time-driven
- schedule: month timer, day 2
- time: around 02:00 to 03:00 India time

Apps Script time triggers run within the selected time window, not necessarily
at the exact minute.

## 7. Verify A Completed Archive

Drive structure:

```text
RFG Log Archives/
  YYYY/
    MM/
      logs-YYYY-MM.json.gz
```

Supabase manifest:

```sql
select
  archive_month,
  storage_provider,
  object_key,
  activity_count,
  login_count,
  size_bytes,
  archived_at
from public.log_archives
order by archive_month desc;
```

`storage_provider` must show `google-drive`. The same month, record count,
size, and archive date appear in **Admin -> Activity Logs -> Archive history**.
The admin panel intentionally has no Drive download link.

## Failure Safety

- A script lock prevents overlapping archive runs.
- Monthly filenames are deterministic.
- A verified unfinished Drive file is reused on retry.
- A mismatched or unreadable duplicate is moved to Drive trash.
- Supabase rows are deleted only by `finalize_log_archive` after the Drive file
  has been decompressed, size-checked, and SHA-256 hashed.
- Failed files remain in Drive for investigation.
- Execution errors appear in Apps Script **Executions** and Google Cloud logs.

## Storage

Archives are retained indefinitely. The account has 15 GB shared across Drive,
Gmail, and Google Photos. Because these archives are compressed text, normal
RFG usage should remain small; review account storage periodically.
