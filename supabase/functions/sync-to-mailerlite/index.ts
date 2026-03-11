import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/node";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
  tracesSampleRate: 0,
});

serve(async (req) => {
  try {
    // 1. Verify webhook secret
    const authHeader = req.headers.get("Authorization");
    const webhookSecret = Deno.env.get("SYNC_WEBHOOK_SECRET");

    if (!webhookSecret || authHeader !== `Bearer ${webhookSecret}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Parse Supabase Database Webhook v2 payload
    const body = await req.json();
    const userId = body.record?.id;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing record.id in payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Fetch user from Supabase Auth
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: { user }, error: userError } =
      await supabase.auth.admin.getUserById(userId);

    if (userError || !user) {
      console.log(`User ${userId} not found — skipping`);
      return new Response(
        JSON.stringify({ message: "User not found — skipped" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const email = user.email ?? "";

    // 4. Skip Apple private relay addresses
    if (email.endsWith("@privaterelay.appleid.com")) {
      return new Response(
        JSON.stringify({ message: "Private relay email — skipped" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. Upsert subscriber in MailerLite
    const apiKey = Deno.env.get("MAILERLITE_API_KEY")!;
    const freeGroupId = Deno.env.get("MAILERLITE_FREE_GROUP_ID")!;

    const mlResponse = await fetch(
      "https://connect.mailerlite.com/api/subscribers",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          email,
          fields: { source: "app", entitlement: "free" },
          groups: [freeGroupId],
        }),
      },
    );

    if (!mlResponse.ok) {
      const text = await mlResponse.text();
      const err = new Error(
        `MailerLite upsert failed: ${mlResponse.status} ${text}`,
      );
      console.error(err.message);
      Sentry.captureException(err, { tags: { function: "sync-to-mailerlite" } });
      // Return 200 so DB webhook doesn't retry — error is captured in Sentry
      return new Response(
        JSON.stringify({ message: "MailerLite error — logged to Sentry" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ message: `Synced ${email} to MailerLite` }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("sync-to-mailerlite unexpected error:", err);
    Sentry.captureException(err, { tags: { function: "sync-to-mailerlite" } });
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
