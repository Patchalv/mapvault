import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/node";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
  tracesSampleRate: 0,
});

const RC_API_BASE = "https://api.revenuecat.com/v2";
const JOB_NAME = "rc-entitlement-drift-check";
const MAX_EXTRA_IDS = 50;

interface RcEntitlement {
  id: string;
  lookup_key: string;
}

interface RcCustomerActiveEntitlement {
  entitlement_id: string;
  // expires_at is intentionally not checked client-side — we trust RC's
  // server-side active filter, which keeps in-grace-period entitlements active.
  expires_at: number | null;
}

interface RcCustomer {
  id: string;
  active_entitlements?: {
    items?: RcCustomerActiveEntitlement[];
  };
}

interface RcListResponse<T> {
  items: T[];
  next_page: string | null;
}

serve(async (req) => {
  const runAt = new Date().toISOString();

  try {
    // 1. Bearer auth
    const authHeader = req.headers.get("Authorization");
    const invokeSecret = Deno.env.get("RC_DRIFT_CHECK_INVOKE_SECRET");

    if (!invokeSecret || authHeader !== `Bearer ${invokeSecret}`) {
      const reason = !invokeSecret ? "missing_secret" : "mismatch";
      Sentry.captureMessage("rc_drift_check_auth_fail", {
        level: "error",
        tags: { function: JOB_NAME, reason },
      });
      // Deno Edge isolates terminate when Response is returned; Sentry's
      // async transport may drop queued events without an explicit flush.
      await Sentry.flush(2000);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 2. Mutex: skip if another run is already in flight (per-run table row,
    // stale entries auto-replaced after 10 minutes by the RPC).
    const { data: lockAcquired, error: lockError } = await supabase.rpc(
      "try_acquire_drift_check_lock",
      { p_job_name: JOB_NAME },
    );
    if (lockError) {
      throw new Error(`lock_acquire_failed: ${lockError.message}`);
    }
    if (!lockAcquired) {
      console.log(JSON.stringify({
        event: "concurrent_skip",
        job: JOB_NAME,
        run_at: runAt,
      }));
      return new Response(
        JSON.stringify({ message: "Concurrent run skipped" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    try {
      const projectId = Deno.env.get("REVENUECAT_PROJECT_ID");
      // RC v2 endpoints (get-customer, list-entitlements) require a
      // v2-scoped secret key. delete-account uses the v1 key on /v1/subscribers;
      // they're separate env vars so neither can break the other.
      const rcKey = Deno.env.get("REVENUECAT_SECRET_API_KEY_V2");
      if (!projectId || !rcKey) {
        throw new Error("missing_revenuecat_env");
      }

      // 3. Resolve "premium" entitlement to its RC-internal id. The active
      // entitlement objects on customers only carry the internal id, so we
      // need this mapping to compare against MapVault's "premium" string.
      const premiumEntitlementId = await resolvePremiumEntitlementId(
        projectId,
        rcKey,
      );
      if (!premiumEntitlementId) {
        throw new Error("premium_entitlement_not_found");
      }

      // 4. Iterate over Supabase profiles, fetching each user's RC state
      // individually. We tried the bulk GET /v2/projects/{id}/customers list
      // endpoint first but observed it does NOT inline active_entitlements in
      // production (despite the API reference suggesting otherwise), which
      // caused every profile to be flagged as stale. The per-customer
      // GET /v2/projects/{id}/customers/{customer_id} endpoint DOES inline
      // active_entitlements correctly. Scales linearly with profile count;
      // at ~50 profiles this is ~10s sequential. Add limited concurrency
      // (e.g. batches of 10 via Promise.all) when profile count exceeds ~300.
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, entitlement");
      if (profilesError) {
        throw new Error(`supabase_profiles_${profilesError.message}`);
      }
      if (!profiles) {
        throw new Error("supabase_profiles_empty");
      }

      // 5. Classify drift. We only detect the two operationally critical
      // categories now: missing (the 2026-05-12 outage class, RC paid /
      // Supabase free) and stale (Supabase premium / RC not active). The
      // orphan category (RC customer with no Supabase profile) is dropped
      // because detecting it would require listing every RC customer with
      // their active entitlements — exactly the list endpoint that proved
      // unreliable. The webhook's `revenuecat_webhook_user_not_found`
      // captures one half of that gap (RC event for an unknown profile) and
      // orphans from already-deleted accounts are not operationally urgent.
      const driftPremiumMissing: string[] = [];
      const driftPremiumStale: string[] = [];

      for (const profile of profiles) {
        const rcActivePremium = await isCustomerActivePremium(
          profile.id,
          projectId,
          rcKey,
          premiumEntitlementId,
        );

        if (profile.entitlement === "premium" && !rcActivePremium) {
          driftPremiumStale.push(profile.id);
        } else if (profile.entitlement === "free" && rcActivePremium) {
          driftPremiumMissing.push(profile.id);
        }
      }

      const countMissing = driftPremiumMissing.length;
      const countStale = driftPremiumStale.length;
      const driftCount = countMissing + countStale;

      // 6. Single Sentry event when drift > 0; stable fingerprint collapses
      // consecutive runs into one issue. No event on the healthy path —
      // the heartbeat below is the only "still running" signal.
      if (driftCount > 0) {
        Sentry.captureMessage("rc_entitlement_drift", {
          level: countMissing > 0 ? "error" : "warning",
          fingerprint: ["rc-entitlement-drift"],
          tags: {
            function: JOB_NAME,
            context: "rc_entitlement_drift",
            count_missing: String(countMissing),
            count_stale: String(countStale),
          },
          extra: {
            drift_premium_missing: driftPremiumMissing.slice(0, MAX_EXTRA_IDS),
            drift_premium_stale: driftPremiumStale.slice(0, MAX_EXTRA_IDS),
            supabase_profile_count: profiles.length,
            run_at: runAt,
          },
        });
        // Flush before the function returns so the Deno isolate doesn't
        // tear down the Sentry transport mid-send.
        await Sentry.flush(2000);
      }

      console.log(JSON.stringify({
        event: "drift_check_complete",
        job: JOB_NAME,
        run_at: runAt,
        drift_count: driftCount,
        count_missing: countMissing,
        count_stale: countStale,
        supabase_profile_count: profiles.length,
      }));

      return new Response(
        JSON.stringify({ drift_count: driftCount }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    } finally {
      // Always release the lock so the next scheduled run isn't blocked,
      // even if the work above threw. The stale-after fallback in the RPC
      // is the safety net for genuinely crashed runs.
      const { error: releaseError } = await supabase.rpc(
        "release_drift_check_lock",
        { p_job_name: JOB_NAME },
      );
      if (releaseError) {
        console.error("release_drift_check_lock failed:", releaseError.message);
      }
    }
  } catch (err) {
    console.error(`${JOB_NAME} error:`, err);
    Sentry.captureException(err, { tags: { function: JOB_NAME } });
    // Flush before the 500 return so the exception event reaches Sentry
    // before the Deno isolate tears down.
    await Sentry.flush(2000);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});

async function resolvePremiumEntitlementId(
  projectId: string,
  rcKey: string,
): Promise<string | null> {
  // MapVault has one entitlement today (lookup_key="premium"). If the project
  // ever has more than 100 entitlements, this needs pagination via
  // starting_after — but well before that point, the data model has changed
  // enough that the drift check itself should be re-evaluated.
  const res = await fetch(
    `${RC_API_BASE}/projects/${projectId}/entitlements?limit=100`,
    {
      headers: { Authorization: `Bearer ${rcKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  if (!res.ok) {
    throw new Error(`rc_list_entitlements_${res.status}`);
  }
  const data = (await res.json()) as RcListResponse<RcEntitlement>;
  return data.items.find((e) => e.lookup_key === "premium")?.id ?? null;
}

async function isCustomerActivePremium(
  customerId: string,
  projectId: string,
  rcKey: string,
  premiumEntitlementId: string,
): Promise<boolean> {
  const res = await fetch(
    `${RC_API_BASE}/projects/${projectId}/customers/${customerId}`,
    {
      headers: { Authorization: `Bearer ${rcKey}` },
      signal: AbortSignal.timeout(10_000),
    },
  );
  // 404 = customer has no RC record at all. That's not "drift" by itself;
  // a free-tier Supabase user who never went near payments will look like
  // this, which is the healthy state. Treat as "not active premium".
  if (res.status === 404) {
    return false;
  }
  if (!res.ok) {
    throw new Error(`rc_get_customer_${res.status}`);
  }
  const customer = (await res.json()) as RcCustomer;
  const items = customer.active_entitlements?.items ?? [];
  return items.some((e) => e.entitlement_id === premiumEntitlementId);
}
