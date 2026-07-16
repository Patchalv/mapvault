// deno-lint-ignore-file no-explicit-any
import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import {
  checkCustomerActivePremiumWithRetry,
  classifyProfilesDrift,
  type ProfileEntitlement,
} from "./rc-client.ts";

const PROJECT_ID = "proj_test";
const RC_KEY = "rc_key_test";
const PREMIUM_ENTITLEMENT_ID = "ent_premium";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function customerBody(active: boolean) {
  return {
    id: "cust_1",
    active_entitlements: {
      items: active ? [{ entitlement_id: PREMIUM_ENTITLEMENT_ID, expires_at: null }] : [],
    },
  };
}

function withStubbedFetch(responses: Array<() => Response>, run: () => Promise<void>) {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = ((..._args: unknown[]) => {
    const factory = responses[call] ?? responses[responses.length - 1];
    call += 1;
    return Promise.resolve(factory());
  }) as typeof fetch;

  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

Deno.test("retries once on 503 and succeeds", async () => {
  await withStubbedFetch(
    [
      () => jsonResponse(503, {}),
      () => jsonResponse(200, customerBody(true)),
    ],
    async () => {
      const result = await checkCustomerActivePremiumWithRetry(
        "cust_1",
        PROJECT_ID,
        RC_KEY,
        PREMIUM_ENTITLEMENT_ID,
      );
      assertEquals(result, { ok: true, active: true });
    },
  );
});

Deno.test("exhausts retries on repeated 503 and returns ok:false without throwing", async () => {
  await withStubbedFetch(
    [
      () => jsonResponse(503, {}),
      () => jsonResponse(503, {}),
    ],
    async () => {
      const result = await checkCustomerActivePremiumWithRetry(
        "cust_1",
        PROJECT_ID,
        RC_KEY,
        PREMIUM_ENTITLEMENT_ID,
      );
      assertEquals(result.ok, false);
    },
  );
});

Deno.test("404 short-circuits to not-active with no retry", async () => {
  let calls = 0;
  await withStubbedFetch(
    [
      () => {
        calls += 1;
        return jsonResponse(404, {});
      },
    ],
    async () => {
      const result = await checkCustomerActivePremiumWithRetry(
        "cust_1",
        PROJECT_ID,
        RC_KEY,
        PREMIUM_ENTITLEMENT_ID,
      );
      assertEquals(result, { ok: true, active: false });
      assertEquals(calls, 1);
    },
  );
});

Deno.test("4xx fails fast without retry", async () => {
  let calls = 0;
  await withStubbedFetch(
    [
      () => {
        calls += 1;
        return jsonResponse(401, {});
      },
    ],
    async () => {
      const result = await checkCustomerActivePremiumWithRetry(
        "cust_1",
        PROJECT_ID,
        RC_KEY,
        PREMIUM_ENTITLEMENT_ID,
      );
      assertEquals(result.ok, false);
      assertEquals(calls, 1);
    },
  );
});

function withStubbedFetchByCustomer(
  responsesByCustomer: Record<string, Array<() => Response>>,
  run: () => Promise<void>,
) {
  const originalFetch = globalThis.fetch;
  const callCounts: Record<string, number> = {};
  globalThis.fetch = ((url: string | URL) => {
    const customerId = url.toString().split("/").pop()!;
    const responses = responsesByCustomer[customerId] ?? [];
    const call = callCounts[customerId] ?? 0;
    callCounts[customerId] = call + 1;
    const factory = responses[call] ?? responses[responses.length - 1];
    return Promise.resolve(factory());
  }) as typeof fetch;

  return run().finally(() => {
    globalThis.fetch = originalFetch;
  });
}

// Drives the actual production code path (`classifyProfilesDrift`, called
// directly by index.ts's handler) rather than re-implementing the loop here,
// so a regression in the real isolation logic (e.g. someone reintroducing a
// throw instead of a `continue`) would be caught by this test.
Deno.test("classifyProfilesDrift isolates a failing customer instead of aborting the batch", async () => {
  const profiles: ProfileEntitlement[] = [
    { id: "cust_a", entitlement: "free" },
    { id: "cust_b", entitlement: "free" },
    { id: "cust_c", entitlement: "premium" },
  ];
  const failed: Array<{ id: string; error: string }> = [];

  await withStubbedFetchByCustomer(
    {
      cust_a: [() => jsonResponse(503, {}), () => jsonResponse(200, customerBody(true))],
      cust_b: [() => jsonResponse(503, {}), () => jsonResponse(503, {})],
      cust_c: [() => jsonResponse(404, {})],
    },
    async () => {
      const classification = await classifyProfilesDrift(
        profiles,
        PROJECT_ID,
        RC_KEY,
        PREMIUM_ENTITLEMENT_ID,
        (id, error) => failed.push({ id, error }),
      );

      // cust_a: free + active after retry -> missing. cust_b: retries
      // exhausted -> isolated, not classified as drift either way. cust_c:
      // premium + 404 (not active) -> stale.
      assertEquals(classification.driftPremiumMissing, ["cust_a"]);
      assertEquals(classification.driftPremiumStale, ["cust_c"]);
      assertEquals(classification.driftCheckFailed, ["cust_b"]);
    },
  );

  assertEquals(failed.map((f) => f.id), ["cust_b"]);
});
