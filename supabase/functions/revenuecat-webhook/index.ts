import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

    const { error: updateError } = await supabase
      .from("profiles")
      .update({ entitlement })
      .eq("id", app_user_id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to update profile entitlement" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 6. Sync MailerLite group membership (best-effort — never block 200)
    try {
      const mlApiKey = Deno.env.get("MAILERLITE_API_KEY");
      const freeGroupId = Deno.env.get("MAILERLITE_FREE_GROUP_ID");
      const premiumGroupId = Deno.env.get("MAILERLITE_PREMIUM_GROUP_ID");

      if (mlApiKey && freeGroupId && premiumGroupId) {
        const { data: { user: mlUser } } =
          await supabase.auth.admin.getUserById(app_user_id);

        const email = mlUser?.email ?? "";

        if (email && !email.endsWith("@privaterelay.appleid.com")) {
          const mlHeaders = {
            "Content-Type": "application/json",
            Authorization: `Bearer ${mlApiKey}`,
          };

          // Look up subscriber ID by email
          const lookupRes = await fetch(
            `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(email)}`,
            { headers: mlHeaders },
          );
          const subscriberId: string | null = lookupRes.ok
            ? (await lookupRes.json()).data?.id ?? null
            : null;

          if (entitlement === "premium") {
            // Remove from free group, add to premium group
            if (subscriberId) {
              await fetch(
                `https://connect.mailerlite.com/api/subscribers/${subscriberId}/groups/${freeGroupId}`,
                { method: "DELETE", headers: mlHeaders },
              );
            }
            await fetch("https://connect.mailerlite.com/api/subscribers", {
              method: "POST",
              headers: mlHeaders,
              body: JSON.stringify({
                email,
                fields: { entitlement: "premium" },
                groups: [premiumGroupId],
              }),
            });
          } else {
            // Remove from premium group, add to free group
            if (subscriberId) {
              await fetch(
                `https://connect.mailerlite.com/api/subscribers/${subscriberId}/groups/${premiumGroupId}`,
                { method: "DELETE", headers: mlHeaders },
              );
            }
            await fetch("https://connect.mailerlite.com/api/subscribers", {
              method: "POST",
              headers: mlHeaders,
              body: JSON.stringify({
                email,
                fields: { entitlement: "free" },
                groups: [freeGroupId],
              }),
            });
          }
        }
      }
    } catch (mlErr) {
      console.error("MailerLite group sync error (non-fatal):", mlErr);
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
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
