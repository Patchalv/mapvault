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
const RC_PAGE_LIMIT = 100;

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
      const rcKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
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

      // 4. Walk every RC customer, collect those whose active entitlements
      // include premium. Pagination via starting_after cursor.
      const rcPremiumIds = new Set<string>();
      let rcCustomerCount = 0;
      let cursor: string | null = null;
      do {
        const url = new URL(`${RC_API_BASE}/projects/${projectId}/customers`);
        url.searchParams.set("limit", String(RC_PAGE_LIMIT));
        if (cursor) url.searchParams.set("starting_after", cursor);

        const res = await fetch(url.toString(), {
          headers: { Authorization: `Bearer ${rcKey}` },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) {
          throw new Error(`rc_list_customers_${res.status}`);
        }
        const page = (await res.json()) as RcListResponse<RcCustomer>;
        rcCustomerCount += page.items.length;
        for (const customer of page.items) {
          const items = customer.active_entitlements?.items ?? [];
          if (items.some((e) => e.entitlement_id === premiumEntitlementId)) {
            rcPremiumIds.add(customer.id);
          }
        }
        if (page.next_page) {
          const next = new URL(page.next_page, "https://api.revenuecat.com")
            .searchParams.get("starting_after");
          if (!next) {
            // RC said "more results exist" but didn't give us a cursor we
            // understand. Refuse to silently undercount — that would give
            // a false clean drift report.
            throw new Error("rc_next_page_parse_failed");
          }
          cursor = next;
        } else {
          cursor = null;
        }
      } while (cursor);

      // 5. Read Supabase entitlement state.
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("id, entitlement");
      if (profilesError) {
        throw new Error(`supabase_profiles_${profilesError.message}`);
      }
      const supabasePremiumIds = new Set<string>(
        (profiles ?? [])
          .filter((p) => p.entitlement === "premium")
          .map((p) => p.id),
      );
      const supabaseAllIds = new Set<string>(
        (profiles ?? []).map((p) => p.id),
      );

      // 6. Classify drift. See docs/payments.md "Drift Health Check" for the
      // category definitions and what each one means operationally.
      const driftPremiumMissing: string[] = []; // RC premium, Supabase free
      const driftPremiumStale: string[] = []; // Supabase premium, RC not premium
      const driftOrphan: string[] = []; // RC premium with no Supabase profile

      for (const rcId of rcPremiumIds) {
        if (!supabaseAllIds.has(rcId)) {
          driftOrphan.push(rcId);
        } else if (!supabasePremiumIds.has(rcId)) {
          driftPremiumMissing.push(rcId);
        }
      }
      for (const sbId of supabasePremiumIds) {
        if (!rcPremiumIds.has(sbId)) {
          driftPremiumStale.push(sbId);
        }
      }

      const countMissing = driftPremiumMissing.length;
      const countStale = driftPremiumStale.length;
      const countOrphan = driftOrphan.length;
      const driftCount = countMissing + countStale + countOrphan;

      // 7. Single Sentry event when drift > 0; stable fingerprint collapses
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
            count_orphan: String(countOrphan),
          },
          extra: {
            drift_premium_missing: driftPremiumMissing.slice(0, MAX_EXTRA_IDS),
            drift_premium_stale: driftPremiumStale.slice(0, MAX_EXTRA_IDS),
            drift_orphan: driftOrphan.slice(0, MAX_EXTRA_IDS),
            rc_customer_count: rcCustomerCount,
            supabase_profile_count: supabaseAllIds.size,
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
        count_orphan: countOrphan,
        rc_customer_count: rcCustomerCount,
        supabase_profile_count: supabaseAllIds.size,
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
