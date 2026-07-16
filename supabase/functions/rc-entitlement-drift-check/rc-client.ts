// RevenueCat v2 API client for the drift-check job, kept dependency-free
// (no Sentry/Supabase imports) so index.test.ts can exercise the retry and
// fault-isolation logic without pulling in the full edge function runtime.

const RC_API_BASE = "https://api.revenuecat.com/v2";
const RC_CUSTOMER_CHECK_MAX_ATTEMPTS = 2;
const RC_CUSTOMER_CHECK_RETRY_DELAY_MS = 300;

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

export async function resolvePremiumEntitlementId(
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

// Thrown only for 5xx responses so the retry wrapper below can tell a
// transient RC-side failure apart from a permanent one (4xx) without
// retrying errors that will never succeed.
class RcTransientHttpError extends Error {
  constructor(status: number) {
    super(`rc_get_customer_${status}`);
    this.name = "RcTransientHttpError";
  }
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
    if (res.status >= 500) {
      throw new RcTransientHttpError(res.status);
    }
    throw new Error(`rc_get_customer_${res.status}`);
  }
  const customer = (await res.json()) as RcCustomer;
  const items = customer.active_entitlements?.items ?? [];
  return items.some((e) => e.entitlement_id === premiumEntitlementId);
}

// Network failures and timeouts are just as transient as a 5xx — retry both,
// but not a 4xx (auth/bad-request are permanent; retrying wastes the run's
// time budget on something that will never succeed).
function isTransientRcError(err: unknown): boolean {
  if (err instanceof RcTransientHttpError) return true;
  if (err instanceof TypeError) return true; // fetch network failure
  if (err instanceof DOMException) {
    return err.name === "TimeoutError" || err.name === "AbortError";
  }
  return false;
}

export type CustomerCheckResult =
  | { ok: true; active: boolean }
  | { ok: false; error: string };

// One retry (two attempts total) for transient RC failures on a single
// customer, so one flaky lookup can't take down drift detection for every
// other profile in the run — the caller isolates a `{ ok: false }` result
// per-profile instead of letting it throw. See MAPVAULT-J.
export async function checkCustomerActivePremiumWithRetry(
  customerId: string,
  projectId: string,
  rcKey: string,
  premiumEntitlementId: string,
): Promise<CustomerCheckResult> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= RC_CUSTOMER_CHECK_MAX_ATTEMPTS; attempt++) {
    try {
      const active = await isCustomerActivePremium(
        customerId,
        projectId,
        rcKey,
        premiumEntitlementId,
      );
      return { ok: true, active };
    } catch (err) {
      lastError = err;
      if (
        !isTransientRcError(err) ||
        attempt === RC_CUSTOMER_CHECK_MAX_ATTEMPTS
      ) {
        break;
      }
      const jitter = Math.random() * 150;
      await new Promise((resolve) =>
        setTimeout(resolve, RC_CUSTOMER_CHECK_RETRY_DELAY_MS + jitter)
      );
    }
  }

  const message = lastError instanceof Error
    ? lastError.message
    : String(lastError);
  return { ok: false, error: message };
}

export interface ProfileEntitlement {
  id: string;
  entitlement: string;
}

export interface DriftClassification {
  driftPremiumMissing: string[];
  driftPremiumStale: string[];
  driftCheckFailed: string[];
}

// Walks every profile, checking RC state one at a time (see index.ts for why
// this is sequential rather than batched) and classifying drift. A profile
// whose RC check fails even after retry is isolated into `driftCheckFailed`
// rather than aborting the rest of the run — the fix for MAPVAULT-J. Kept
// here (rather than inline in index.ts) so it can be exercised directly by
// tests with a stubbed `fetch`, without needing to stub Supabase/Sentry too.
export async function classifyProfilesDrift(
  profiles: ProfileEntitlement[],
  projectId: string,
  rcKey: string,
  premiumEntitlementId: string,
  onCheckFailed?: (profileId: string, error: string) => void,
): Promise<DriftClassification> {
  const driftPremiumMissing: string[] = [];
  const driftPremiumStale: string[] = [];
  const driftCheckFailed: string[] = [];

  for (const profile of profiles) {
    const result = await checkCustomerActivePremiumWithRetry(
      profile.id,
      projectId,
      rcKey,
      premiumEntitlementId,
    );

    if (!result.ok) {
      onCheckFailed?.(profile.id, result.error);
      driftCheckFailed.push(profile.id);
      continue;
    }

    if (profile.entitlement === "premium" && !result.active) {
      driftPremiumStale.push(profile.id);
    } else if (profile.entitlement === "free" && result.active) {
      driftPremiumMissing.push(profile.id);
    }
  }

  return { driftPremiumMissing, driftPremiumStale, driftCheckFailed };
}
