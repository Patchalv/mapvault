/**
 * One-time backfill script: syncs existing Supabase users to MailerLite.
 *
 * Usage:
 *   deno run --allow-net --allow-env scripts/backfill-mailerlite.ts
 *
 * Required env vars:
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *   MAILERLITE_API_KEY
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MAILERLITE_API_KEY = Deno.env.get("MAILERLITE_API_KEY")!;

for (const [name, val] of Object.entries({
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  MAILERLITE_API_KEY,
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
async function bulkImport(
  subscribers: Array<{ email: string; fields: Record<string, string> }>,
): Promise<void> {
  const res = await fetch("https://connect.mailerlite.com/api/subscribers/import", {
    method: "POST",
    headers: ML_HEADERS,
    body: JSON.stringify({ subscribers }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bulk import failed: ${res.status} ${text}`);
  }
  await res.text(); // consume body
}

// Single upsert — simple POST /api/subscribers with entitlement field.
async function upsertOne(
  email: string,
  entitlement: string,
): Promise<void> {
  const res = await fetch("https://connect.mailerlite.com/api/subscribers", {
    method: "POST",
    headers: ML_HEADERS,
    body: JSON.stringify({
      email,
      fields: { source: "app", entitlement },
    }),
    signal: AbortSignal.timeout(10_000),
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

type AuthUser = { id: string; email?: string };

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
    const eligible = (users as AuthUser[]).filter(
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

      // Log users with no profile row — every auth user should have one via the
      // handle_new_user trigger; missing entries indicate a data integrity issue.
      for (const u of eligible) {
        if (!entitlementMap.has(u.id)) {
          console.warn(`  No profile found for user ${u.id} (${u.email}) — syncing as "free"`);
        }
      }

      const subscribers = eligible.map((u) => ({
        email: u.email!,
        fields: { source: "app", entitlement: entitlementMap.get(u.id) ?? "free" },
      }));

      // Attempt bulk import; fall back to single upserts if bulk fails
      if (subscribers.length > 10) {
        try {
          await bulkImport(subscribers);
          totalProcessed += subscribers.length;
          console.log(
            `  Page ${page}: bulk-imported ${subscribers.length} subscribers`,
          );
        } catch (bulkErr) {
          console.warn(
            `  Bulk import failed, falling back to single upserts:`,
            bulkErr,
          );
          for (const sub of subscribers) {
            try {
              await upsertOne(sub.email, sub.fields.entitlement);
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
        for (const sub of subscribers) {
          try {
            await upsertOne(sub.email, sub.fields.entitlement);
            totalProcessed++;
          } catch (singleErr) {
            console.error(`  Error upserting ${sub.email}:`, singleErr);
            totalErrors++;
          }
          await sleep(500);
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
