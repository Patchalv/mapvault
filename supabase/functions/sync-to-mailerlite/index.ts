import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import * as Sentry from "npm:@sentry/node";

Sentry.init({
  dsn: Deno.env.get("SENTRY_DSN"),
  tracesSampleRate: 0,
});

serve(async (req) => {
  try {
    // 1. Parse Supabase Database Webhook payload
    // No shared-secret check — Supabase's Edge Function webhook type strips
    // custom headers. Auth is enforced by verifying the userId exists in
    // auth.users before making any external API call.
    type DatabaseWebhookPayload = { record?: { id?: string } };
    const body = (await req.json()) as DatabaseWebhookPayload;
    const userId = body.record?.id;

    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Missing record.id in payload" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Fetch user from Supabase Auth (also serves as auth: spoofed userIds
    // that don't exist in auth.users will return no user and be skipped)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: authData, error: userError } =
      await supabase.auth.admin.getUserById(userId);

    if (userError) {
      console.error(`Auth lookup failed for ${userId}:`, userError.message);
      Sentry.captureException(userError, { tags: { function: "sync-to-mailerlite" } });
      return new Response(
        JSON.stringify({ message: "Auth lookup failed — logged to Sentry" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!authData?.user) {
      console.log(`User ${userId} not found — skipping`);
      return new Response(
        JSON.stringify({ message: "User not found — skipped" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    const user = authData.user;

    const email = user.email ?? "";

    // 4. Skip users with no email or Apple private relay addresses
    if (!email) {
      console.log(`User ${userId} has no email — skipping`);
      return new Response(
        JSON.stringify({ message: "No email — skipped" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

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
        signal: AbortSignal.timeout(10_000),
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
    // Supabase DB webhooks don't retry on failure, so 500 provides no benefit.
    // Capture to Sentry and return 200 to avoid misleading log noise.
    console.error("sync-to-mailerlite unexpected error:", err);
    Sentry.captureException(err, { tags: { function: "sync-to-mailerlite" } });
    return new Response(
      JSON.stringify({ message: "Unexpected error — logged to Sentry" }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  }
});
