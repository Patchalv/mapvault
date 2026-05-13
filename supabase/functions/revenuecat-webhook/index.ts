import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/node";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
  tracesSampleRate: 0,
});

const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "PRODUCT_CHANGE",
]);

const REVOKE_EVENTS = new Set(["EXPIRATION", "REFUND"]);

serve(async (req) => {
  try {
    // 1. Verify webhook secret
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("REVENUECAT_WEBHOOK_SECRET");

    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      const reason = !webhookSecret ? "missing_secret" : "mismatch";
      // Strip "Bearer " then take 8 chars of the token. Enough to
      // distinguish "wrong secret" from "drifted secret" for drift detection
      // while limiting brute-force material if Sentry access is ever compromised.
      const tokenPrefix =
        authHeader?.replace(/^Bearer /, "").slice(0, 8) ?? null;
      console.error("revenuecat-webhook auth fail", {
        reason,
        hasHeader: !!authHeader,
        tokenPrefix,
      });
      Sentry.captureMessage("revenuecat_webhook_auth_fail", {
        level: "error",
        tags: { function: "revenuecat-webhook", reason },
        extra: { tokenPrefix, hasHeader: !!authHeader },
      });
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 2. Parse event
    const body = await req.json();
    const event = body.event;

    if (!event?.type || !event?.app_user_id) {
      return new Response(
        JSON.stringify({ error: "Invalid event payload" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const { type, app_user_id } = event;

    // 3. Skip anonymous RevenueCat users
    if (app_user_id.startsWith("$RCAnonymousID:")) {
      return new Response(
        JSON.stringify({ message: "Skipped anonymous user" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 4. Determine action
    let entitlement: string | null = null;

    if (GRANT_EVENTS.has(type)) {
      entitlement = "premium";
    } else if (REVOKE_EVENTS.has(type)) {
      entitlement = "free";
    } else {
      // CANCELLATION, BILLING_ISSUE, etc. — no action needed
      return new Response(
        JSON.stringify({ message: `No action for event type: ${type}` }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 5. Update profile entitlement
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: updatedRows, error: updateError } = await supabase
      .from("profiles")
      .update({ entitlement })
      .eq("id", app_user_id)
      .select("id");

    if (updateError) {
      console.error("revenuecat-webhook profile update failed", {
        app_user_id,
        event_type: type,
        error: updateError.message,
      });
      Sentry.captureException(updateError, {
        tags: { function: "revenuecat-webhook", event_type: type },
        extra: { app_user_id },
      });
      return new Response(
        JSON.stringify({ error: "Failed to update profile entitlement" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    if (!updatedRows || updatedRows.length === 0) {
      // Return 200 (not 404) to acknowledge the event and stop RC's
      // retry loop. The 0-rows case is almost always permanent:
      //   - Deleted account (profile gone, RC still has the customer)
      //   - app_user_id ↔ profiles.id mismatch (a bug, retries won't fix)
      // The Sentry warning is the actionable signal; RC retrying for 5 days
      // would just create event-count noise without resolving the underlying issue.
      console.error("revenuecat-webhook user not found", {
        app_user_id,
        event_type: type,
      });
      Sentry.captureMessage("revenuecat_webhook_user_not_found", {
        level: "warning",
        tags: { function: "revenuecat-webhook", event_type: type },
        extra: { app_user_id, entitlement },
      });
      return new Response(
        JSON.stringify({ message: "No profile matched — logged to Sentry" }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 6. Sync MailerLite entitlement field (best-effort — never block 200)
    try {
      const mlApiKey = Deno.env.get("MAILERLITE_API_KEY");

      if (mlApiKey) {
        const { data: authData, error: mlUserError } =
          await supabase.auth.admin.getUserById(app_user_id);

        if (mlUserError || !authData?.user) {
          console.error(
            `MailerLite: could not fetch user ${app_user_id} — skipping sync`,
          );
        } else {
          const email = authData.user.email ?? "";

          if (email && !email.endsWith("@privaterelay.appleid.com")) {
            const mlHeaders = {
              "Content-Type": "application/json",
              Authorization: `Bearer ${mlApiKey}`,
            };

            const groupId = Deno.env.get("MAILERLITE_GROUP_ID");

            const upsertRes = await fetch(
              "https://connect.mailerlite.com/api/subscribers",
              {
                method: "POST",
                headers: mlHeaders,
                body: JSON.stringify({
                  email,
                  fields: { source: "app", entitlement },
                  ...(groupId ? { groups: [groupId] } : {}),
                }),
                signal: AbortSignal.timeout(10_000),
              },
            );
            if (!upsertRes.ok) {
              console.error(
                `MailerLite: upsert failed for ${email}: ${upsertRes.status} ${await upsertRes.text()}`,
              );
            } else {
              await upsertRes.text(); // consume body
            }
          }
        }
      }
    } catch (mlErr) {
      console.error("MailerLite sync error (non-fatal):", mlErr);
    }

    return new Response(
      JSON.stringify({
        message: `Updated user ${app_user_id} to ${entitlement}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("revenuecat-webhook error:", err);
    Sentry.captureException(err, {
      tags: { function: "revenuecat-webhook" },
    });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
