-- Schedules the rc-entitlement-drift-check Edge Function to run every 6h.
--
-- PREREQUISITE (run once, out-of-band, before this migration):
--
--   select vault.create_secret(
--     '<generated-bearer>',
--     'rc_drift_check_invoke_secret',
--     'Bearer for the rc-entitlement-drift-check Edge Function'
--   );
--
-- The same bearer must also be set as the function env var
-- RC_DRIFT_CHECK_INVOKE_SECRET. See docs/payments.md "Drift Health Check"
-- for the deploy + rotation runbook.
--
-- The function URL hardcodes the project ref. If the Supabase project is
-- ever migrated to a new ref, this migration must be re-applied.

select cron.schedule(
  'rc-entitlement-drift-check',
  '17 */6 * * *',  -- UTC; offset from :00 to avoid bunching with other cron jobs
  $$
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
    body := '{}'::jsonb
  );
  $$
);
