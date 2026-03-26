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
    const body = await req.json();
    const { name } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return new Response(
        JSON.stringify({ error: "Map name is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Freemium limit check — count maps where user is owner
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

    if (profile.entitlement === "free") {
      const { count, error: countError } = await supabase
        .from("map_members")
        .select("*", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("role", "owner");

      if (countError) {
        return new Response(
          JSON.stringify({ error: "Failed to check map count" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      if ((count ?? 0) >= 1) {
        return new Response(
          JSON.stringify({
            error: "Free accounts are limited to 1 map. Upgrade to premium for unlimited maps.",
            code: "FREEMIUM_LIMIT_EXCEEDED",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // 4. Create the map
    const { data: newMap, error: mapError } = await supabase
      .from("maps")
      .insert({ name: name.trim(), created_by: user.id })
      .select("id, name")
      .single();

    if (mapError) {
      return new Response(
        JSON.stringify({ error: "Failed to create map" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 5. Add user as owner
    const { error: memberError } = await supabase
      .from("map_members")
      .insert({ map_id: newMap.id, user_id: user.id, role: "owner" });

    if (memberError) {
      return new Response(
        JSON.stringify({ error: "Failed to add map membership" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 6. Create default tags with semantic keys for i18n
    const { error: tagsError } = await supabase.from("tags").insert([
      { map_id: newMap.id, name: "Restaurant", emoji: "\u{1F37D}\u{FE0F}", color: "#EF4444", position: 0, default_key: "restaurant" },
      { map_id: newMap.id, name: "Bar", emoji: "\u{1F378}", color: "#8B5CF6", position: 1, default_key: "bar" },
      { map_id: newMap.id, name: "Cafe", emoji: "\u{2615}", color: "#F59E0B", position: 2, default_key: "cafe" },
      { map_id: newMap.id, name: "Friend", emoji: "\u{1F465}", color: "#3B82F6", position: 3, default_key: "friend" },
    ]);

    if (tagsError) {
      return new Response(
        JSON.stringify({ error: "Failed to create default tags" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 7. Set as active map
    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({ active_map_id: newMap.id })
      .eq("id", user.id);

    if (profileUpdateError) {
      return new Response(
        JSON.stringify({ error: "Failed to set active map" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ mapId: newMap.id, mapName: newMap.name }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
