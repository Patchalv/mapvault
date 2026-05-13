-- Enables pg_cron and creates the mutex table + RPCs used by the
-- rc-entitlement-drift-check Edge Function to skip overlapping runs.
--
-- pg_net is already installed on this project; pg_cron is enabled here for
-- the first time so the next migration can schedule the drift check.

create extension if not exists pg_cron;

create table if not exists public.drift_check_runs (
  job_name text primary key,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- RLS with no policies = default-deny. anon/authenticated cannot read or
-- write the lock row via PostgREST. The SECURITY DEFINER RPCs below run as
-- the table owner and bypass RLS, so the cron path still works.
alter table public.drift_check_runs enable row level security;

-- Try to claim the lock for `p_job_name`. Returns true if the caller now owns
-- the run slot. Replaces stale rows (started > p_stale_after ago and never
-- finished) so a crashed run cannot block all future runs forever.
-- p_stale_after is the safety net for runs that died before calling release.
-- 10 minutes leaves headroom over the worst-case paginated run (RC fetch
-- pages * 15s timeout each + Supabase reads + Sentry capture) while still
-- self-healing well before the next 6-hour cron fire.
create or replace function public.try_acquire_drift_check_lock(
  p_job_name text,
  p_stale_after interval default interval '10 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows_affected int;
begin
  insert into public.drift_check_runs (job_name, started_at, finished_at)
  values (p_job_name, now(), null)
  on conflict (job_name) do update
    set started_at = now(), finished_at = null
    where drift_check_runs.finished_at is not null
       or drift_check_runs.started_at < now() - p_stale_after;

  get diagnostics v_rows_affected = row_count;
  return v_rows_affected > 0;
end;
$$;

create or replace function public.release_drift_check_lock(p_job_name text)
returns void
language sql
security definer
set search_path = public
as $$
  update public.drift_check_runs
    set finished_at = now()
    where job_name = p_job_name;
$$;

revoke all on function public.try_acquire_drift_check_lock(text, interval) from public, anon, authenticated;
revoke all on function public.release_drift_check_lock(text) from public, anon, authenticated;
