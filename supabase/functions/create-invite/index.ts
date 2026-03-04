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
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { "Content-Type": "application/json" } },
      );
    }

    // 2. Parse and validate input
    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid or missing JSON in request body" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const { mapId, expiresInDays, maxUses } = body;
    const role = (body.role as string) ?? "contributor";

    if (
      typeof mapId !== "string" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        mapId,
      )
    ) {
      return new Response(
        JSON.stringify({ error: "mapId must be a valid UUID" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (role !== "contributor" && role !== "member") {
      return new Response(
        JSON.stringify({ error: "Role must be 'contributor' or 'member'" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (
      expiresInDays != null &&
      (!Number.isInteger(expiresInDays) || expiresInDays <= 0)
    ) {
      return new Response(
        JSON.stringify({ error: "expiresInDays must be a positive integer" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    if (maxUses != null && (!Number.isInteger(maxUses) || maxUses <= 0)) {
      return new Response(
        JSON.stringify({ error: "maxUses must be a positive integer" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Verify user is the owner of the target map
    const { data: membership, error: memberError } = await supabase
      .from("map_members")
      .select("role")
      .eq("map_id", mapId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify map membership" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!membership || membership.role !== "owner") {
      return new Response(
        JSON.stringify({ error: "Only map owners can create invites" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Verify user has premium entitlement
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("entitlement")
      .eq("id", user.id)
      .single();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch user profile" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (profile.entitlement !== "premium") {
      return new Response(
        JSON.stringify({
          error:
            "Invite links are a Premium feature. Upgrade to share your maps.",
          code: "FREEMIUM_LIMIT_EXCEEDED",
        }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. Generate invite token and compute expiry
    const token = crypto.randomUUID();
    const expiresAt =
      expiresInDays != null
        ? new Date(Date.now() + expiresInDays * 86_400_000).toISOString()
        : null;

    // 6. Insert invite (using service role client)
    const { data: invite, error: insertError } = await supabase
      .from("map_invites")
      .insert({
        map_id: mapId,
        token,
        created_by: user.id,
        role,
        expires_at: expiresAt,
        max_uses: maxUses ?? null,
      })
      .select()
      .single();

    if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to create invite" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 7. Return invite and link
    const appDomain =
      Deno.env.get("APP_DOMAIN") ?? "https://mapvault.app";
    return new Response(
      JSON.stringify({
        invite,
        link: `${appDomain}/invite/${token}`,
      }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
