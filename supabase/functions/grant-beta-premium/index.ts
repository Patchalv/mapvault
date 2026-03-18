import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/node";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
  tracesSampleRate: 0,
});

// Grant a RevenueCat promotional premium entitlement to new beta sign-ups.
// Fires from a Supabase Database Webhook on profiles INSERT.
// Best-effort: always returns 200 — DB is the source of truth, RC sync is
// supplementary. Errors are logged to Sentry.
//
// Auth: no shared secret (Supabase Edge Function webhook type strips custom
// headers). Instead we verify the user genuinely has premium in the DB before
// making any RC call, so spoofed payloads cannot grant entitlements.

serve(async (req) => {
  try {
    // 1. Parse Supabase Database Webhook payload
    type DatabaseWebhookPayload = {
      record?: { id?: string; entitlement?: string };
    };
    const body = (await req.json()) as DatabaseWebhookPayload;
    const userId = body.record?.id;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing record.id in payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Verify the user actually has premium in the DB.
    // This replaces a shared secret: spoofed payloads cannot grant RC premium
    // unless the user genuinely has it in profiles.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("entitlement")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      console.error(`Profile lookup failed for ${userId}:`, profileError?.message);
      return new Response(
        JSON.stringify({ message: "Profile not found — skipped" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Only grant RC entitlement for premium users
    if (profile.entitlement !== "premium") {
      return new Response(
        JSON.stringify({ message: `Skipped — entitlement is '${profile.entitlement}'` }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Grant RevenueCat promotional entitlement (best-effort)
    const rcApiKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
    if (!rcApiKey) {
      console.error("REVENUECAT_SECRET_API_KEY is not set — skipping RC grant");
      Sentry.captureMessage("grant-beta-premium: REVENUECAT_SECRET_API_KEY missing", "error");
      return new Response(
        JSON.stringify({ message: "RC secret not configured — logged to Sentry" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const rcHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${rcApiKey}`,
    };

    // Step 4a: GET subscriber to create the RC record for this user.
    // A fresh sign-up has no RC record yet — skipping this step causes a 404
    // on the POST below because RC requires the subscriber to exist first.
    const getRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
      {
        method: "GET",
        headers: rcHeaders,
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!getRes.ok) {
      const text = await getRes.text();
      const err = new Error(
        `RC GET subscriber failed for ${userId}: ${getRes.status} ${text}`,
      );
      console.error(err.message);
      Sentry.captureException(err, { tags: { function: "grant-beta-premium" } });
      return new Response(
        JSON.stringify({ message: "RC GET failed — logged to Sentry" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    await getRes.text(); // consume body

    // Step 4b: POST promotional entitlement.
    // end_time_ms: 1 year from now. RC will fire an EXPIRATION webhook when
    // this lapses, which the revenuecat-webhook function uses to set the DB
    // back to 'free' — closing the loop without a manual end-of-beta migration.
    const endTimeMs = Date.now() + 365 * 24 * 60 * 60 * 1000;

    const postRes = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}/entitlements/premium/promotional`,
      {
        method: "POST",
        headers: rcHeaders,
        body: JSON.stringify({ end_time_ms: endTimeMs }),
        signal: AbortSignal.timeout(10_000),
      },
    );

    if (!postRes.ok) {
      const text = await postRes.text();
      const err = new Error(
        `RC POST promotional entitlement failed for ${userId}: ${postRes.status} ${text}`,
      );
      console.error(err.message);
      Sentry.captureException(err, { tags: { function: "grant-beta-premium" } });
      return new Response(
        JSON.stringify({ message: "RC POST failed — logged to Sentry" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }
    await postRes.text(); // consume body

    console.log(`Granted RC beta premium to ${userId} until ${new Date(endTimeMs).toISOString()}`);

    return new Response(
      JSON.stringify({ message: `RC beta premium granted for ${userId}` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    // DB webhooks don't retry on failure — capture and return 200 to avoid noise.
    console.error("grant-beta-premium unexpected error:", err);
    Sentry.captureException(err, { tags: { function: "grant-beta-premium" } });
    return new Response(
      JSON.stringify({ message: "Unexpected error — logged to Sentry" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
