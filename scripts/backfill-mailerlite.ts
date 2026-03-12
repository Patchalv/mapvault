/**
 * One-time backfill script: syncs existing Supabase users to MailerLite.
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/backfill-mailerlite.ts
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   MAILERLITE_API_KEY, MAILERLITE_FREE_GROUP_ID, MAILERLITE_PREMIUM_GROUP_ID
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAILERLITE_API_KEY = Deno.env.get("MAILERLITE_API_KEY")!;
const FREE_GROUP_ID = Deno.env.get("MAILERLITE_FREE_GROUP_ID")!;
const PREMIUM_GROUP_ID = Deno.env.get("MAILERLITE_PREMIUM_GROUP_ID")!;

for (const [name, val] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  MAILERLITE_API_KEY,
  FREE_GROUP_ID,
  PREMIUM_GROUP_ID,
})) {
  if (!val) {
    console.error(`Missing required env var: ${name}`);
    Deno.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const ML_HEADERS = {
  "Content-Type": "application/json",
  Authorization: `Bearer ${MAILERLITE_API_KEY}`,
};

// Fetch entitlement for a batch of user IDs
async function getEntitlements(
  userIds: string[],
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, entitlement")
    .in("id", userIds);

  if (error) {
    throw new Error(`Failed to fetch profiles: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((p: { id: string; entitlement: string }) => [
      p.id,
      p.entitlement ?? "free",
    ]),
  );
}

// Bulk import up to 1,000 subscribers per call.
// IMPORTANT: Verify before running in production that MailerLite's
// POST /api/subscribers/import endpoint honours per-subscriber `groups`.
// If it doesn't, imported subscribers will have no group membership.
// Test with 1-2 entries first and confirm group assignment in the dashboard.
// If groups are ignored, remove the bulkImport path and use single upserts only.
async function bulkImport(
  subscribers: Array<{
    email: string;
    fields: Record<string, string>;
    groups: string[];
  }>,
): Promise<void> {
  const res = await fetch("https://connect.mailerlite.com/api/subscribers/import", {
    method: "POST",
    headers: ML_HEADERS,
    body: JSON.stringify({ subscribers }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bulk import failed: ${res.status} ${text}`);
  }
}

// Single upsert with explicit group reconciliation.
// MailerLite POST /api/subscribers only ADDS groups (never removes unlisted ones),
// so we must explicitly remove the opposite group to keep groups mutually exclusive.
async function upsertOne(
  email: string,
  entitlement: string,
): Promise<void> {
  const groupId = entitlement === "premium" ? PREMIUM_GROUP_ID : FREE_GROUP_ID;
  const oppositeGroupId =
    entitlement === "premium" ? FREE_GROUP_ID : PREMIUM_GROUP_ID;

  // Look up existing subscriber to get their ID for group removal
  const lookupRes = await fetch(
    `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(email)}`,
    { headers: ML_HEADERS },
  );
  if (lookupRes.ok) {
    const subscriberId = (await lookupRes.json()).data?.id;
    if (subscriberId) {
      // Remove from opposite group (idempotent — 404 = not in group = fine)
      await fetch(
        `https://connect.mailerlite.com/api/subscribers/${subscriberId}/groups/${oppositeGroupId}`,
        { method: "DELETE", headers: ML_HEADERS },
      );
    }
  } else if (lookupRes.status !== 404) {
    const body = await lookupRes.text();
    throw new Error(
      `Subscriber lookup failed for ${email}: ${lookupRes.status} ${body}`,
    );
  }

  const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: ML_HEADERS,
    body: JSON.stringify({
      email,
      fields: { source: "app", entitlement },
      groups: [groupId],
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upsert failed for ${email}: ${res.status} ${text}`);
  }
  await res.text(); // consume body
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("Starting MailerLite backfill...\n");

  let page = 1;
  const perPage = 50;
  let totalProcessed = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error(`Failed to list users (page ${page}):`, error.message);
      break;
    }

    const { users } = data;
    if (users.length === 0) break;

    // Filter out private relay addresses
    const eligible = users.filter(
      (u) => u.email && !u.email.endsWith("@privaterelay.appleid.com"),
    );
    totalSkipped += users.length - eligible.length;

    if (eligible.length > 0) {
      let entitlementMap: Map<string, string>;
      try {
        entitlementMap = await getEntitlements(eligible.map((u) => u.id));
      } catch (err) {
        console.error(`Page ${page}: skipping — ${err}`);
        totalErrors += eligible.length;
        page++;
        continue;
      }

      // Build subscriber objects for bulk import
      const freeSubscribers = eligible
        .filter((u) => (entitlementMap.get(u.id) ?? "free") === "free")
        .map((u) => ({
          email: u.email!,
          fields: { source: "app", entitlement: "free" },
          groups: [FREE_GROUP_ID],
        }));

      const premiumSubscribers = eligible
        .filter((u) => entitlementMap.get(u.id) === "premium")
        .map((u) => ({
          email: u.email!,
          fields: { source: "app", entitlement: "premium" },
          groups: [PREMIUM_GROUP_ID],
        }));

      // Attempt bulk import; fall back to single upserts if bulk fails
      for (const [label, batch] of [
        ["free", freeSubscribers],
        ["premium", premiumSubscribers],
      ] as [string, typeof freeSubscribers][]) {
        if (batch.length === 0) continue;

        if (batch.length > 10) {
          try {
            await bulkImport(batch);
            totalProcessed += batch.length;
            console.log(
              `  Page ${page}: bulk-imported ${batch.length} ${label} subscribers`,
            );
          } catch (bulkErr) {
            console.warn(
              `  Bulk import failed for ${label} batch, falling back to single upserts:`,
              bulkErr,
            );
            for (const sub of batch) {
              try {
                await upsertOne(sub.email, label);
                totalProcessed++;
              } catch (singleErr) {
                console.error(`  Error upserting ${sub.email}:`, singleErr);
                totalErrors++;
              }
              await sleep(500);
            }
          }
        } else {
          // Small batches: single upserts
          for (const sub of batch) {
            try {
              await upsertOne(sub.email, label);
              totalProcessed++;
            } catch (singleErr) {
              console.error(`  Error upserting ${sub.email}:`, singleErr);
              totalErrors++;
            }
            await sleep(500);
          }
        }
      }
    }

    console.log(
      `Page ${page}: processed ${eligible.length} users (${users.length - eligible.length} skipped)`,
    );

    if (users.length < perPage) break;
    page++;
  }

  console.log("\n--- Backfill complete ---");
  console.log(`Total processed : ${totalProcessed}`);
  console.log(`Total skipped   : ${totalSkipped} (private relay)`);
  console.log(`Total errors    : ${totalErrors}`);
}

await main();
