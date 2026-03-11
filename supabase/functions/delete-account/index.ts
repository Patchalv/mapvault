import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 1. Authenticate user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    // 2. Delete from RevenueCat (best-effort)
    const rcSecretKey = Deno.env.get("REVENUECAT_SECRET_API_KEY");
    if (rcSecretKey) {
      try {
        const rcResponse = await fetch(
          `https://api.revenuecat.com/v1/subscribers/${user.id}`,
          {
            method: "DELETE",
            headers: {
              Authorization: `Bearer ${rcSecretKey}`,
              "Content-Type": "application/json",
            },
          },
        );
        if (!rcResponse.ok) {
          console.error(
            `RevenueCat deletion failed for ${user.id}: ${rcResponse.status} ${await rcResponse.text()}`,
          );
        }
      } catch (rcErr) {
        console.error(
          `RevenueCat deletion error for ${user.id}:`,
          rcErr,
        );
      }
    }

    // 3. Delete from MailerLite (best-effort)
    const mlApiKey = Deno.env.get("MAILERLITE_API_KEY");
    if (mlApiKey && user.email && !user.email.endsWith("@privaterelay.appleid.com")) {
      try {
        const mlHeaders = {
          "Content-Type": "application/json",
          Authorization: `Bearer ${mlApiKey}`,
        };
        const lookupRes = await fetch(
          `https://connect.mailerlite.com/api/subscribers/${encodeURIComponent(user.email)}`,
          { headers: mlHeaders },
        );
        if (lookupRes.ok) {
          const subscriberId = (await lookupRes.json()).data?.id;
          if (subscriberId) {
            await fetch(
              `https://connect.mailerlite.com/api/subscribers/${subscriberId}`,
              { method: "DELETE", headers: mlHeaders },
            );
          }
        }
      } catch (mlErr) {
        console.error(`MailerLite deletion error for ${user.id}:`, mlErr);
      }
    }

    // 4. Delete user from Supabase Auth
    //    This fires the BEFORE DELETE trigger (handle_user_deleted)
    //    which cleans up all related data in public schema.
    const { error: deleteError } =
      await supabase.auth.admin.deleteUser(user.id);

    if (deleteError) {
      console.error(
        `auth.admin.deleteUser failed for ${user.id}:`,
        deleteError,
      );
      return new Response(
        JSON.stringify({
          error: "Failed to delete account. Please try again.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({ message: "Account deleted successfully" }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    console.error("delete-account error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});
