-- Run once after ADMIN_ATTENTION_REMINDERS.sql.
-- Replace __PASTE_CRON_SECRET__ with the value generated for ADMIN_ATTENTION_CRON_SECRET.

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
create extension if not exists supabase_vault with schema vault;

select vault.create_secret(
  'nbPBLerw8C_lOBQCtdvcAe2LuFhBlG8nYg2yV1jzJ8uVCeupvqQoQfWTT_F4aa0f',
  'rfg_admin_attention_cron_secret',
  'Authorizes only the RFG Admin attention reminder scheduler'
);

do $$
declare
  existing_job record;
begin
  for existing_job in
    select jobid from cron.job where jobname = 'rfg-admin-attention-reminder'
  loop
    perform cron.unschedule(existing_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'rfg-admin-attention-reminder',
  '*/15 * * * *',
  $job$
    select net.http_post(
      url := 'https://kizjrvzctilzugbjlfwl.supabase.co/functions/v1/admin-attention-reminder',
      headers := jsonb_build_object(
        'content-type', 'application/json',
        'x-cron-secret', (
          select decrypted_secret
          from vault.decrypted_secrets
          where name = 'rfg_admin_attention_cron_secret'
          limit 1
        )
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  $job$
);

select jobid, jobname, schedule, active
from cron.job
where jobname = 'rfg-admin-attention-reminder';
