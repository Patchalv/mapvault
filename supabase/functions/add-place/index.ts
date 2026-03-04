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
    const {
      googlePlaceId,
      name,
      address,
      latitude,
      longitude,
      googleCategory,
      mapId,
      note,
      tagIds,
      visited,
    } = body;

    if (!googlePlaceId || !name || latitude == null || longitude == null || !mapId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: googlePlaceId, name, latitude, longitude, mapId" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }

    // 3. Verify user is a member with write access (owner or contributor)
    const { data: membership, error: memberError } = await supabase
      .from("map_members")
      .select("id, role")
      .eq("map_id", mapId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberError) {
      return new Response(
        JSON.stringify({ error: "Failed to verify map membership" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    if (!membership) {
      return new Response(
        JSON.stringify({ error: "You are not a member of this map" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    if (membership.role !== "owner" && membership.role !== "contributor") {
      return new Response(
        JSON.stringify({ error: "You don't have permission to add places to this map" }),
        { status: 403, headers: { "Content-Type": "application/json" } },
      );
    }

    // 4. Freemium limit check
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
        .from("map_places")
        .select("*", { count: "exact", head: true })
        .eq("added_by", user.id);

      if (countError) {
        return new Response(
          JSON.stringify({ error: "Failed to check place count" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }

      if ((count ?? 0) >= 20) {
        return new Response(
          JSON.stringify({
            error: "Free accounts are limited to 20 places. Upgrade to premium for unlimited places.",
            code: "FREEMIUM_LIMIT_EXCEEDED",
          }),
          { status: 403, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // 5. Upsert place (Google reference data, dedup on google_place_id)
    let placeId: string;
    const { data: inserted, error: insertError } = await supabase
      .from("places")
      .insert({
        google_place_id: googlePlaceId,
        name,
        address: address ?? null,
        latitude,
        longitude,
        google_category: googleCategory ?? null,
      })
      .select("id")
      .single();

    if (insertError && insertError.code === "23505") {
      // Unique constraint violation — place already exists, fetch it
      const { data: existing, error: fetchError } = await supabase
        .from("places")
        .select("id")
        .eq("google_place_id", googlePlaceId)
        .single();

      if (fetchError) {
        return new Response(
          JSON.stringify({ error: "Failed to fetch existing place" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
      placeId = existing.id;
    } else if (insertError) {
      return new Response(
        JSON.stringify({ error: "Failed to save place data" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    } else {
      placeId = inserted.id;
    }

    // 6. Insert map_place
    const { data: mapPlace, error: mapPlaceError } = await supabase
      .from("map_places")
      .insert({
        map_id: mapId,
        place_id: placeId,
        note: note || null,
        added_by: user.id,
      })
      .select("id")
      .single();

    if (mapPlaceError) {
      if (mapPlaceError.code === "23505") {
        return new Response(
          JSON.stringify({ error: "This place is already saved to this map" }),
          { status: 409, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Failed to save place to map" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    // 7. Insert tags (if any)
    if (tagIds && tagIds.length > 0) {
      const tagRows = tagIds.map((tagId: string) => ({
        map_place_id: mapPlace.id,
        tag_id: tagId,
      }));

      const { error: tagsError } = await supabase
        .from("map_place_tags")
        .insert(tagRows);

      if (tagsError) {
        return new Response(
          JSON.stringify({ error: "Failed to save tags" }),
          { status: 500, headers: { "Content-Type": "application/json" } },
        );
      }
    }

    // 8. Insert visit status
    const { error: visitError } = await supabase
      .from("place_visits")
      .insert({
        user_id: user.id,
        map_place_id: mapPlace.id,
        visited: visited ?? false,
      });

    if (visitError) {
      return new Response(
        JSON.stringify({ error: "Failed to save visit status" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ mapPlaceId: mapPlace.id }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }
});
