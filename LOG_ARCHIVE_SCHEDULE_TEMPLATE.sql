-- Replace the three placeholders before running.
-- Runs at 02:15 UTC on the first day of every month.

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault;

select vault.create_secret(
  'https://YOUR_PROJECT_REF.supabase.co',
  'rfg_project_url',
  'RFG Supabase project URL for the monthly log archive'
);

select vault.create_secret(
  'YOUR_ARCHIVE_CRON_SECRET',
  'rfg_archive_cron_secret',
  'Shared secret checked by the archive-logs Edge Function'
);

select cron.unschedule(jobid)
from cron.job
where jobname = 'rfg-monthly-log-archive';

select cron.schedule(
  'rfg-monthly-log-archive',
  '15 2 1 * *',
  $$
  select net.http_post(
    url := (
      select decrypted_secret
      from vault.decrypted_secrets
      where name = 'rfg_project_url'
    ) || '/functions/v1/archive-logs',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-archive-secret', (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'rfg_archive_cron_secret'
      )
    ),
    body := jsonb_build_object('scheduled_at', now())
  );
  $$
);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'rfg-monthly-log-archive';
