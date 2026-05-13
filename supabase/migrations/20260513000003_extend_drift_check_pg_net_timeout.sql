-- Updates the rc-entitlement-drift-check cron command to pass an explicit
-- 60-second pg_net timeout. The function takes ~30s with the current
-- profile count because per-customer RC fetches are sequential, which
-- exceeds pg_net's default 5-second timeout. The cron job itself was
-- functioning correctly (function ran to completion, Sentry events fired,
-- heartbeat logged), but `net._http_response.status_code` was recorded
-- as NULL on every fire, harming observability of cron-triggered runs.
--
-- This migration uses `cron.alter_job` so the schedule and jobid stay
-- unchanged — only the command text is replaced.
--
-- Function URL is environment-specific; if the project ref ever changes,
-- both this migration and 20260513000002 must be re-applied.

select cron.alter_job(
  (select jobid from cron.job where jobname = 'rc-entitlement-drift-check'),
  command := $$
  select net.http_post(
    url := 'https://doycewmbehxdqfumdgke.supabase.co/functions/v1/rc-entitlement-drift-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret
        from vault.decrypted_secrets
        where name = 'rc_drift_check_invoke_secret'
      )
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
