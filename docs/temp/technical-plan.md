# MapVault — Technical Plan

## 1. Technical Requirements Summary

Key PRD requirements that drive technical decisions, with complexity notes.

| PRD Requirement                          | Technical Impact                                                                                                 | Complexity                                                    |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Google Maps place search (add flow)      | Google Places API integration, autocomplete, place data extraction                                               | Medium — API setup, billing, rate limits                      |
| Interactive map with custom pins         | Mapbox SDK, custom markers with emoji/color per tag                                                              | Medium — Mapbox setup, marker rendering performance           |
| Filter/search saved places on map        | Client-side filtering on cached data, real-time UI updates                                                       | Low — TanStack Query + local filter state                     |
| Shared maps with per-user visited status | Data model must separate shared data (tags, notes) from personal data (visited). RLS policies for access control | High — most complex part of the schema and RLS                |
| Freemium gating (1 map / 50 places free) | Server-side enforcement via Edge Functions. Cannot trust client                                                  | Medium — Edge Functions + RevenueCat webhook                  |
| Map sharing via invite links             | Deep linking (Expo), invite token generation, Edge Function to validate and add member                           | Medium — deep link handling on iOS can be tricky              |
| Map/List view toggle                     | Two views of the same data, shared filter state                                                                  | Low — same data source, different render                      |
| Offline browsing (v1.1)                  | Data layer must support caching. Not built now but architecture shouldn't prevent it                             | Low for now — TanStack Query's cache is a good starting point |

---

## 2. Tech Stack

| Layer                 | Choice                                                | Why (tied to PRD)                                                                                                                                                                     |
| --------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Framework             | **Expo (React Native)** with Expo Router              | Cross-platform from day one (PRD: iOS priority, web v1.1). Expo Router provides file-based routing for tabs, stacks, and deep links (needed for invite flow)                          |
| Map Display           | **Mapbox** (`@rnmapbox/maps`)                         | PRD requires visually distinguishable pins by tag (emoji + color). Mapbox supports fully custom React Native markers. 25,000 free map loads/month. Cheaper than Google Maps SDK       |
| Place Search          | **Google Places API** (New)                           | PRD requires searching places by name with accurate results for restaurants/bars/cafes in major cities. Google has the best venue database. $200/month free credit (~11,000 searches) |
| Backend / API         | **Supabase** (PostgreSQL + Edge Functions + Auth)     | Auto-generated REST API, Row Level Security for shared maps access control, Edge Functions for freemium enforcement. No separate backend needed                                       |
| Auth                  | **Supabase Auth** with Apple Sign-In + Google Sign-In | Low-friction social auth. Apple Sign-In required by App Store if any social login is offered. No email/password flows to build                                                        |
| Payments              | **RevenueCat** (wraps Apple IAP)                      | Handles receipt validation, subscription/purchase management, webhook to Supabase. Free up to $2,500/month revenue. Supports one-time purchase model                                  |
| Data Fetching / State | **TanStack Query (React Query)**                      | Caching per map, pull-to-refresh, optimistic updates for visited toggle, cache invalidation after mutations. No real-time subscriptions needed                                        |
| Styling               | **NativeWind** (Tailwind CSS for React Native)        | Developer has Tailwind experience. Fast development, consistent styling                                                                                                               |
| Deployment            | **EAS** (Expo Application Services)                   | Standard Expo build pipeline. Handles iOS code signing, builds, OTA updates                                                                                                           |

---

## 3. Data Model

### Tables

#### `profiles`

Extends Supabase `auth.users` with app-specific fields.

| Column        | Type               | Nullable | Default | Notes                                          |
| ------------- | ------------------ | -------- | ------- | ---------------------------------------------- |
| id            | uuid, PK           | no       | —       | References `auth.users.id`                     |
| display_name  | text               | yes      | null    | From social auth provider                      |
| avatar_url    | text               | yes      | null    | From social auth provider                      |
| entitlement   | text               | no       | 'free'  | 'free' or 'premium'. Set by RevenueCat webhook |
| active_map_id | uuid, FK → maps.id | yes      | null    | Currently selected map for explore view        |
| created_at    | timestamptz        | no       | now()   |                                                |

**Indexes:** Primary key on `id`.
**RLS:** Users can read/update only their own profile.

```sql
-- RLS policies for profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);
```

#### `maps`

| Column     | Type                   | Nullable | Default           | Notes                         |
| ---------- | ---------------------- | -------- | ----------------- | ----------------------------- |
| id         | uuid, PK               | no       | gen_random_uuid() |                               |
| name       | text                   | no       | —                 | e.g., "My Map", "Madrid Trip" |
| created_by | uuid, FK → profiles.id | no       | —                 | Original creator              |
| created_at | timestamptz            | no       | now()             |                               |

**Indexes:** Primary key on `id`. Index on `created_by`.
**RLS:** Users can only see maps they are a member of (via `map_members`).

```sql
ALTER TABLE maps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view their maps"
  ON maps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = maps.id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Authenticated users can create maps"
  ON maps FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Owners can update maps"
  ON maps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = maps.id
      AND map_members.user_id = auth.uid()
      AND map_members.role = 'owner'
    )
  );

CREATE POLICY "Owners can delete maps"
  ON maps FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = maps.id
      AND map_members.user_id = auth.uid()
      AND map_members.role = 'owner'
    )
  );
```

#### `map_members`

Junction table controlling who has access to which map.

| Column    | Type                                 | Nullable | Default           | Notes                                                |
| --------- | ------------------------------------ | -------- | ----------------- | ---------------------------------------------------- |
| id        | uuid, PK                             | no       | gen_random_uuid() |                                                      |
| map_id    | uuid, FK → maps.id ON DELETE CASCADE | no       | —                 |                                                      |
| user_id   | uuid, FK → profiles.id               | no       | —                 |                                                      |
| role      | text                                 | no       | 'editor'          | 'owner' or 'editor'. Future: 'viewer', 'contributor' |
| joined_at | timestamptz                          | no       | now()             |                                                      |

**Constraints:** UNIQUE on (map_id, user_id).
**Indexes:** Index on `user_id` (frequent lookups: "which maps am I in?"). Index on `map_id`.
**RLS:** Members can see other members of their maps.

```sql
ALTER TABLE map_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view map membership"
  ON map_members FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members AS mm
      WHERE mm.map_id = map_members.map_id
      AND mm.user_id = auth.uid()
    )
  );

CREATE POLICY "System inserts members (via Edge Functions)"
  ON map_members FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owners can remove members"
  ON map_members FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members AS mm
      WHERE mm.map_id = map_members.map_id
      AND mm.user_id = auth.uid()
      AND mm.role = 'owner'
    )
  );
```

#### `tags`

Per-map tag definitions with visual properties for pin rendering.

| Column     | Type                                 | Nullable | Default           | Notes                              |
| ---------- | ------------------------------------ | -------- | ----------------- | ---------------------------------- |
| id         | uuid, PK                             | no       | gen_random_uuid() |                                    |
| map_id     | uuid, FK → maps.id ON DELETE CASCADE | no       | —                 | Tags belong to a map               |
| name       | text                                 | no       | —                 | e.g., "Restaurant", "Bar"          |
| color      | text                                 | yes      | null              | Hex color for pin rendering        |
| emoji      | text                                 | yes      | null              | Emoji for pin rendering            |
| position   | integer                              | no       | 0                 | Ordering within the map's tag list |
| created_at | timestamptz                          | no       | now()             |                                    |

**Constraints:** UNIQUE on (map_id, name).
**Indexes:** Index on `map_id`.
**RLS:** Same membership check as maps — if you're a member of the map, you can read/write its tags.

```sql
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view tags"
  ON tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create tags"
  ON tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update tags"
  ON tags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete tags"
  ON tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
    )
  );
```

#### `places`

Deduplicated Google reference data. Shared across all maps.

| Column          | Type        | Nullable | Default           | Notes                    |
| --------------- | ----------- | -------- | ----------------- | ------------------------ |
| id              | uuid, PK    | no       | gen_random_uuid() |                          |
| google_place_id | text        | no       | —                 | Deduplication key        |
| name            | text        | no       | —                 | From Google              |
| address         | text        | yes      | null              | From Google              |
| latitude        | float8      | no       | —                 |                          |
| longitude       | float8      | no       | —                 |                          |
| google_category | text        | yes      | null              | Primary type from Google |
| created_at      | timestamptz | no       | now()             |                          |

**Constraints:** UNIQUE on `google_place_id`.
**Indexes:** Primary key on `id`. Unique index on `google_place_id`.
**RLS:** Readable by any authenticated user (reference data). Insert only by authenticated users.

```sql
ALTER TABLE places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view places"
  ON places FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert places"
  ON places FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

#### `map_places`

A saved place on a specific map. The core entity of the app.

| Column     | Type                                 | Nullable | Default           | Notes                                  |
| ---------- | ------------------------------------ | -------- | ----------------- | -------------------------------------- |
| id         | uuid, PK                             | no       | gen_random_uuid() |                                        |
| map_id     | uuid, FK → maps.id ON DELETE CASCADE | no       | —                 |                                        |
| place_id   | uuid, FK → places.id                 | no       | —                 |                                        |
| note       | text                                 | yes      | null              | Shared note visible to all map members |
| added_by   | uuid, FK → profiles.id               | no       | —                 | Who saved it                           |
| created_at | timestamptz                          | no       | now()             |                                        |

**Constraints:** UNIQUE on (map_id, place_id).
**Indexes:** Index on `map_id` (primary query pattern). Index on `place_id`.
**RLS:** Membership check — same pattern as tags.

```sql
ALTER TABLE map_places ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view map places"
  ON map_places FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can add places"
  ON map_places FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can update places"
  ON map_places FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can delete places"
  ON map_places FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
    )
  );
```

#### `map_place_tags`

Junction table: which tags are applied to which saved place.

| Column       | Type                                       | Nullable | Default | Notes |
| ------------ | ------------------------------------------ | -------- | ------- | ----- |
| map_place_id | uuid, FK → map_places.id ON DELETE CASCADE | no       | —       |       |
| tag_id       | uuid, FK → tags.id ON DELETE CASCADE       | no       | —       |       |

**Constraints:** Composite PK on (map_place_id, tag_id).
**RLS:** Inherited from map membership (if you can see the map_place, you can see its tags).

```sql
ALTER TABLE map_place_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view place tags"
  ON map_place_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can manage place tags"
  ON map_place_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can remove place tags"
  ON map_place_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = auth.uid()
    )
  );
```

#### `place_visits`

Personal visited status per user per saved place.

| Column       | Type                                       | Nullable | Default | Notes |
| ------------ | ------------------------------------------ | -------- | ------- | ----- |
| user_id      | uuid, FK → profiles.id                     | no       | —       |       |
| map_place_id | uuid, FK → map_places.id ON DELETE CASCADE | no       | —       |       |
| visited      | boolean                                    | no       | false   |       |

**Constraints:** Composite PK on (user_id, map_place_id).
**RLS:** Users can only read/write their own visited status.

```sql
ALTER TABLE place_visits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own visit status"
  ON place_visits FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can set own visit status"
  ON place_visits FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own visit status"
  ON place_visits FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own visit status"
  ON place_visits FOR DELETE
  USING (auth.uid() = user_id);
```

#### `map_invites`

Invite links for shared maps.

| Column     | Type                                 | Nullable | Default           | Notes                                                        |
| ---------- | ------------------------------------ | -------- | ----------------- | ------------------------------------------------------------ |
| id         | uuid, PK                             | no       | gen_random_uuid() |                                                              |
| map_id     | uuid, FK → maps.id ON DELETE CASCADE | no       | —                 |                                                              |
| token      | text                                 | no       | —                 | Short random string for the URL                              |
| created_by | uuid, FK → profiles.id               | no       | —                 |                                                              |
| role       | text                                 | no       | 'editor'          | Role assigned on acceptance. Future: 'viewer', 'contributor' |
| expires_at | timestamptz                          | yes      | null              | Optional expiry                                              |
| max_uses   | integer                              | yes      | null              | null = unlimited                                             |
| use_count  | integer                              | no       | 0                 | Tracks how many times used                                   |
| created_at | timestamptz                          | no       | now()             |                                                              |

**Constraints:** UNIQUE on `token`.
**Indexes:** Unique index on `token` (lookup on deep link open).
**RLS:** Only map owners/editors can create invites. Token lookup happens via Edge Function (service role).

```sql
ALTER TABLE map_invites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view invites for their maps"
  ON map_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_invites.map_id
      AND map_members.user_id = auth.uid()
    )
  );

CREATE POLICY "Members can create invites"
  ON map_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_invites.map_id
      AND map_members.user_id = auth.uid()
    )
  );
```

### Entity Relationship Summary

```
profiles
  ├── 1:N → maps (created_by)
  ├── 1:N → map_members (user_id)
  ├── 1:N → map_places (added_by)
  ├── 1:N → place_visits (user_id)
  └── 1:1 → maps (active_map_id)

maps
  ├── 1:N → map_members
  ├── 1:N → tags
  ├── 1:N → map_places
  └── 1:N → map_invites

map_members
  └── Links profiles ↔ maps (with role)

tags
  └── N:M → map_places (via map_place_tags)

places (reference data)
  └── 1:N → map_places

map_places
  ├── N:M → tags (via map_place_tags)
  └── 1:N → place_visits

map_invites
  └── Belongs to maps
```

---

## 4. API & Data Flow

### Client-Side Queries

All data fetching uses the `supabase-js` SDK, managed by TanStack Query for caching and refetching.

#### On App Open

```typescript
// 1. Fetch user profile
const { data: profile } = useQuery({
  queryKey: ["profile"],
  queryFn: () =>
    supabase.from("profiles").select("*").eq("id", user.id).single(),
});

// 2. Fetch all maps user is a member of
const { data: maps } = useQuery({
  queryKey: ["maps"],
  queryFn: () =>
    supabase
      .from("map_members")
      .select("map_id, role, maps(id, name, created_by)")
      .eq("user_id", user.id),
});

// 3. Fetch all places for active map (with tags and visited status)
const { data: places } = useQuery({
  queryKey: ["map-places", activeMapId],
  queryFn: () =>
    supabase
      .from("map_places")
      .select(
        `
      id, note, created_at, added_by,
      places(id, google_place_id, name, address, latitude, longitude, google_category),
      map_place_tags(tag_id, tags(id, name, color, emoji)),
      place_visits!inner(visited)
    `,
      )
      .eq("map_id", activeMapId)
      .eq("place_visits.user_id", user.id),
});

// 4. Fetch tags for active map (for filter UI)
const { data: tags } = useQuery({
  queryKey: ["tags", activeMapId],
  queryFn: () =>
    supabase
      .from("tags")
      .select("*")
      .eq("map_id", activeMapId)
      .order("position"),
});
```

#### "All Maps" View

```typescript
// Fetch places across all maps user is a member of
const { data: allPlaces } = useQuery({
  queryKey: ["map-places", "all"],
  queryFn: async () => {
    const { data: memberMaps } = await supabase
      .from("map_members")
      .select("map_id")
      .eq("user_id", user.id);

    const mapIds = memberMaps.map((m) => m.map_id);

    return supabase
      .from("map_places")
      .select(
        `
        id, note, map_id, created_at, added_by,
        places(id, google_place_id, name, address, latitude, longitude, google_category),
        map_place_tags(tag_id, tags(id, name, color, emoji)),
        place_visits(visited)
      `,
      )
      .in("map_id", mapIds)
      .eq("place_visits.user_id", user.id);
  },
});
```

#### Google Places Autocomplete (Add Flow)

```typescript
// Called directly from the client — no Supabase involved
const searchPlaces = async (query: string) => {
  const response = await fetch(
    "https://places.googleapis.com/v1/places:autocomplete",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
      },
      body: JSON.stringify({
        input: query,
        locationBias: {
          circle: {
            center: { latitude: userLat, longitude: userLng },
            radius: 10000, // 10km bias toward user's location
          },
        },
      }),
    },
  );
  return response.json();
};
```

#### Filtering (Client-Side)

Filtering happens entirely in memory on the cached data. No additional API calls.

```typescript
const filteredPlaces = useMemo(() => {
  if (!places) return [];
  return places.filter((place) => {
    // Tag filter
    if (selectedTags.length > 0) {
      const placeTags = place.map_place_tags.map((t) => t.tag_id);
      if (!selectedTags.some((t) => placeTags.includes(t))) return false;
    }
    // Visited filter
    if (visitedFilter === "visited" && !place.place_visits[0]?.visited)
      return false;
    if (visitedFilter === "not_visited" && place.place_visits[0]?.visited)
      return false;
    // Name search
    if (
      searchQuery &&
      !place.places.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });
}, [places, selectedTags, visitedFilter, searchQuery]);
```

#### Mutations

```typescript
// Add a place
const addPlace = useMutation({
  mutationFn: async ({ googlePlaceData, mapId, tagIds, note, visited }) => {
    // 1. Upsert the Google place reference
    const { data: place } = await supabase
      .from("places")
      .upsert(
        {
          google_place_id: googlePlaceData.placeId,
          name: googlePlaceData.name,
          address: googlePlaceData.address,
          latitude: googlePlaceData.lat,
          longitude: googlePlaceData.lng,
          google_category: googlePlaceData.category,
        },
        { onConflict: "google_place_id" },
      )
      .select()
      .single();

    // 2. Insert map_place
    const { data: mapPlace } = await supabase
      .from("map_places")
      .insert({
        map_id: mapId,
        place_id: place.id,
        note,
        added_by: user.id,
      })
      .select()
      .single();

    // 3. Insert tags
    if (tagIds.length > 0) {
      await supabase.from("map_place_tags").insert(
        tagIds.map((tagId) => ({
          map_place_id: mapPlace.id,
          tag_id: tagId,
        })),
      );
    }

    // 4. Insert visited status
    await supabase.from("place_visits").insert({
      user_id: user.id,
      map_place_id: mapPlace.id,
      visited,
    });

    return mapPlace;
  },
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ["map-places"] });
  },
});

// Toggle visited
const toggleVisited = useMutation({
  mutationFn: async ({ mapPlaceId, visited }) => {
    return supabase.from("place_visits").upsert({
      user_id: user.id,
      map_place_id: mapPlaceId,
      visited,
    });
  },
  // Optimistic update for instant UI feedback
  onMutate: async ({ mapPlaceId, visited }) => {
    await queryClient.cancelQueries({ queryKey: ["map-places"] });
    const previousData = queryClient.getQueryData(["map-places", activeMapId]);
    queryClient.setQueryData(["map-places", activeMapId], (old) =>
      old.map((p) =>
        p.id === mapPlaceId ? { ...p, place_visits: [{ visited }] } : p,
      ),
    );
    return { previousData };
  },
  onError: (err, variables, context) => {
    queryClient.setQueryData(["map-places", activeMapId], context.previousData);
  },
});
```

### Server-Side / Edge Functions

Edge Functions are used for logic that **must not** be trusted to the client.

#### 1. `create-map`

Enforces freemium limit: free users can only have 1 map.

```typescript
// supabase/functions/create-map/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authHeader = req.headers.get("Authorization")!;
  const {
    data: { user },
  } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));

  // Check entitlement
  const { data: profile } = await supabase
    .from("profiles")
    .select("entitlement")
    .eq("id", user.id)
    .single();

  if (profile.entitlement === "free") {
    const { count } = await supabase
      .from("map_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("role", "owner");

    if (count >= 1) {
      return new Response(
        JSON.stringify({
          error: "Free tier limited to 1 map. Upgrade to premium.",
        }),
        { status: 403 },
      );
    }
  }

  const { name } = await req.json();

  // Create map
  const { data: map } = await supabase
    .from("maps")
    .insert({ name, created_by: user.id })
    .select()
    .single();

  // Add creator as owner
  await supabase
    .from("map_members")
    .insert({ map_id: map.id, user_id: user.id, role: "owner" });

  // Create default tags
  const defaultTags = [
    {
      name: "Restaurant",
      emoji: "🍽️",
      color: "#EF4444",
      map_id: map.id,
      position: 0,
    },
    { name: "Bar", emoji: "🍸", color: "#8B5CF6", map_id: map.id, position: 1 },
    {
      name: "Cafe",
      emoji: "☕",
      color: "#F59E0B",
      map_id: map.id,
      position: 2,
    },
    {
      name: "Friend",
      emoji: "👥",
      color: "#3B82F6",
      map_id: map.id,
      position: 3,
    },
  ];
  await supabase.from("tags").insert(defaultTags);

  return new Response(JSON.stringify({ map }), { status: 201 });
});
```

#### 2. `add-place` (validation layer)

Enforces freemium limit: free users limited to 50 places total.

```typescript
// Checks total place count across all maps user owns
// Returns 403 if free tier limit exceeded
// On success, performs the insert (place + map_place + tags + visit status)
```

#### 3. `accept-invite`

Validates invite token and adds user to map.

```typescript
// supabase/functions/accept-invite/index.ts
// 1. Look up invite by token
// 2. Check not expired, not exceeded max_uses
// 3. Check user not already a member
// 4. Insert into map_members with invite's role
// 5. Increment use_count
// 6. Return map details
```

#### 4. `revenucat-webhook`

Receives purchase events from RevenueCat, updates `profiles.entitlement`.

```typescript
// supabase/functions/revenuecat-webhook/index.ts
// 1. Verify webhook signature
// 2. Extract user_id from RevenueCat event (mapped via Supabase user ID)
// 3. Update profiles.entitlement = 'premium' (or 'free' on refund/expiry)
```

### Real-Time Subscriptions

**None required for v1.** All data is fetched on app open and refetched on:

- Pull-to-refresh
- After any mutation (TanStack Query invalidation)
- When app returns from background (TanStack Query `refetchOnWindowFocus`)

---

## 5. Screen Map

| Screen         | Route                                      | Data Needed                                           | Key Components                                                                                                    |
| -------------- | ------------------------------------------ | ----------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Sign In        | `(auth)/sign-in`                           | None                                                  | Apple Sign-In button, Google Sign-In button                                                                       |
| Explore (Map)  | `(tabs)/explore/index`                     | Profile, active map places + tags + visits            | Mapbox MapView, custom markers, filter bar, map switcher dropdown, map/list toggle, FAB for current location      |
| Explore (List) | `(tabs)/explore/index` (toggled state)     | Same as map view                                      | FlatList of place cards, filter bar, map switcher, map/list toggle                                                |
| Filter Sheet   | `(tabs)/explore/index` (bottom sheet)      | Tags for active map                                   | Tag multi-select chips, visited/not-visited toggle, name search input                                             |
| Place Detail   | `(tabs)/explore/place/[id]` (bottom sheet) | Single map_place with place data, tags, note, visited | Place name, address, tag chips, note, visited toggle, directions button, edit button                              |
| Search Place   | `(tabs)/add/index`                         | None (Google API)                                     | Search input, autocomplete results list                                                                           |
| Save Place     | `(tabs)/add/save`                          | Tags for active map                                   | Place info preview, tag picker, note input, visited toggle, save button, "Saving to [map name]" label             |
| Profile        | `(tabs)/profile/index`                     | Profile, all maps + member counts                     | Avatar, name, list of maps with active indicator, premium badge/upgrade button                                    |
| Map Settings   | `(tabs)/profile/map/[id]`                  | Map details, tags, members                            | Map name (editable), tag list (add/edit/delete with emoji+color picker), member list, invite button, leave/delete |
| Invite         | `(tabs)/profile/map/[id]/invite`           | Map invites                                           | Generate link button, share sheet, existing invite links                                                          |
| Paywall        | `(tabs)/profile/paywall`                   | Profile entitlement                                   | Feature comparison, purchase button (RevenueCat)                                                                  |
| Invite Handler | `invite/[token]` (deep link)               | None (Edge Function)                                  | Loading state → redirect to explore with new map active                                                           |
| Onboarding     | Overlay on Explore (data-driven)           | Active map places                                     | Empty state card (map/list variants), filter spotlight tooltip overlay                                            |

### Navigation Structure

```
Root (Expo Router Layout)
│
├── (auth)/                          ← Unauthenticated layout
│   └── sign-in.tsx
│
├── (tabs)/                          ← Authenticated tab layout
│   ├── _layout.tsx                  ← Bottom tab bar: Explore, Add, Profile
│   │
│   ├── explore/
│   │   ├── _layout.tsx              ← Stack navigator
│   │   └── index.tsx                ← Map/List view + filter sheet + place detail (bottom sheets)
│   │
│   ├── add/
│   │   ├── _layout.tsx              ← Stack navigator
│   │   ├── index.tsx                ← Google Places search
│   │   └── save.tsx                 ← Confirm + add tags/notes
│   │
│   └── profile/
│       ├── _layout.tsx              ← Stack navigator
│       ├── index.tsx                ← Profile + map list
│       ├── map/[id].tsx             ← Map settings
│       └── paywall.tsx              ← Premium purchase
│
└── invite/[token].tsx               ← Deep link handler (no tabs)
```

**Bottom sheet library:** `@gorhom/bottom-sheet` — standard for React Native, works well with Expo. Used for filter sheet and place detail.

---

## 6. Implementation Milestones

### Milestone 1: Project Foundation ✅

Get the project scaffolded, auth working, and the database set up.

- [x] **Task 1.1** — Initialize Expo project with Expo Router, NativeWind, and TypeScript config
- [x] **Task 1.2** — Set up Supabase project: create database, enable auth providers (Apple, Google)
- [x] **Task 1.3** — Write SQL migration: create all tables, constraints, indexes
- [x] **Task 1.4** — Write SQL migration: create all RLS policies
- [x] **Task 1.5** — Create database trigger: on `auth.users` insert → create `profiles` row + default "My Map" + default tags + `map_members` owner entry
- [x] **Task 1.6** — Set up Supabase client in Expo (`supabase-js` + auth session management)
- [x] **Task 1.7** — Build sign-in screen with Apple and Google Sign-In
- [x] **Task 1.8** — Set up auth-gated routing: unauthenticated → sign-in, authenticated → tabs
- [x] **Task 1.9** — Set up TanStack Query provider and Supabase query helpers

**Additional work completed:**

- [x] Fixed RLS recursion on `map_members` with SECURITY DEFINER helper (`20260222000001`)
- [x] Added policy for members to leave maps (`20260222000002`)
- [x] Added user cleanup trigger on account deletion (`20260222000003`)

### Milestone 2: Core Map Experience ✅

The "retrieval" flow — seeing and filtering saved places on a map.

- [x] **Task 2.1** — Integrate Mapbox SDK (`@rnmapbox/maps`) with Expo, display basic map with user location
- [x] **Task 2.2** — Build Explore screen layout: map switcher dropdown at top, map/list toggle, map view as default
- [x] **Task 2.3** — Fetch active map's places + tags + visited status via TanStack Query
- [x] **Task 2.4** — Render saved places as custom Mapbox markers (emoji/color from tags)
- [x] **Task 2.5** — Build place detail bottom sheet: name, address, tags, note, visited toggle, directions button
- [x] **Task 2.6** — Implement "Directions" button: open in default maps app via `Linking`
- [x] **Task 2.7** — Build filter bottom sheet: tag multi-select, visited/not-visited toggle, name search
- [x] **Task 2.8** — Implement client-side filtering logic, update map pins in real time
- [x] **Task 2.9** — Build list view: FlatList of place cards, same filter state as map
- [x] **Task 2.10** — Implement map/list toggle, maintaining shared filter state
- [x] **Task 2.11** — Implement pull-to-refresh on both map and list views

**Additional work completed:**

- [x] Delete place functionality (`use-delete-place.ts`, button in place detail sheet)
- [x] Edit tags on existing places (`use-update-place-tags.ts`, inline editing in place detail sheet)

### Milestone 3: Add Place Flow ✅

The "input" flow — saving a new recommendation.

- [x] **Task 3.1** — Set up Google Places API: get API key, configure billing, restrict key
- [x] **Task 3.2** — Build Add screen: search input with Google Places Autocomplete
- [x] **Task 3.3** — Build Save screen: place preview, tag picker (chips), note input, visited toggle, "Saving to [map]" label
- [x] **Task 3.4** — Implement save mutation: upsert place → insert map_place → insert tags → insert visited status
- [x] **Task 3.5** — Write `add-place` Edge Function: validate map membership, enforce 50-place free tier limit
- [x] **Task 3.6** — Cache invalidation: after save, refetch active map places so new pin appears on Explore

### Milestone 4: Map Management ✅

Multiple maps, map switching, map settings.

- [x] **Task 4.1** — Build map switcher dropdown on Explore: list user's maps + "All Maps" option, set active map
- [x] **Task 4.2** — Implement "All Maps" query: fetch places across all user's maps
- [x] **Task 4.3** — Write `create-map` Edge Function: enforce 1-map free tier limit, create map + owner + default tags
- [x] **Task 4.4** — Build Profile screen: user info, list of maps with active indicator, create map button
- [x] **Task 4.5** — Build Map Settings screen: rename map, manage members, leave/delete map
- [x] **Task 4.6** — Build tag management UI on Map Settings: add/edit/delete tags with name, emoji, and color picker

**Additional work completed:**

- [x] Leave map functionality (`use-leave-map.ts`)

### Milestone 5: Sharing & Invites ✅

Invite links, deep linking, shared map access.

- [x] **Task 5.1** — Write `accept-invite` Edge Function: validate token, add user to map_members
- [x] **Task 5.2** — Build Invite screen: generate link button, copy/share via system share sheet
- [x] **Task 5.3** — Set up Expo deep linking for `mapvault://invite/[token]` URLs (custom scheme, not Universal Links yet)
- [x] **Task 5.4** — Build invite handler screen: validate token → add to map → redirect to Explore with new map active
- [x] **Task 5.5** — Handle edge cases: expired invite, already a member, invalid token

### Milestone 6: Payments & Freemium ✅

RevenueCat integration and premium gating.

- [x] **Task 6.1** — Set up RevenueCat: create project, configure Apple IAP product, link to Supabase user IDs
- [x] **Task 6.2** — Write `revenuecat-webhook` Edge Function: receive events, update profiles.entitlement
- [x] **Task 6.3** — Build Paywall screen: feature comparison, purchase button using RevenueCat SDK
- [x] **Task 6.4** — Add premium gates in UI: intercept create-map and add-place when limits reached, redirect to paywall
- [x] **Task 6.5** — Test purchase flow end-to-end in sandbox

**Additional work completed:**

- [x] Variant-aware RevenueCat (disabled in `.dev` builds, only active with production bundle ID)
- [x] Client-side entitlement sync fallback via `CustomerInfoUpdate` listener
- [x] Comprehensive payment testing documentation (`docs/payments.md`)

### Milestone 7: Polish & Launch

Onboarding, edge cases, App Store submission.

- [x] **Task 7.1** — Build onboarding tooltip tour (2 steps: empty state prompt + filter spotlight) shown on first launch (depends on: Milestone 2, 3)
- [x] **Task 7.2** — Implement visited toggle optimistic update (instant UI response)
- [x] **Task 7.3** — Add loading states and error handling across all screens (depends on: all milestones)
- [x] **Task 7.4** — Handle "Saving to [map name]" confirmation on Add flow when in "All Maps" view (depends on: 4.2, 3.3)
- [x] **Task 7.5** — Test on physical iOS device, fix any Mapbox or auth issues
- [x] **Task 7.6** — App icon, splash screen, App Store metadata (depends on: nothing)
- [x] **Task 7.7** — Set up Universal Links: buy `mapvault.app` domain, host Apple App Site Association file, add `associatedDomains` to `app.config.ts`, update invite link format to `https://mapvault.app/invite/[token]` with fallback to App Store for users without the app (depends on: Milestone 5)
- [ ] **Task 7.8** — EAS build for App Store submission (depends on: all milestones)
- [ ] **Task 7.9** — TestFlight beta testing (depends on: 7.8)
- [ ] **Task 7.10** — App Store submission (depends on: 7.9)

### Milestone 8: App Store Compliance (NEW)

Items required for App Store approval that were not in the original plan.

- [x] **Task 8.1** — Account deletion UI: add "Delete Account" option in Profile screen. Apple requires apps with account creation to offer account deletion. The DB cleanup trigger already exists (`20260222000003`), but there is no user-facing flow to initiate deletion. (depends on: Milestone 1)
- [x] **Task 8.2** — Privacy policy & Terms of Service: write and host at a public URL. Required by App Store Connect before submission. (depends on: nothing)
- [ ] **Task 8.3** — App privacy nutrition labels: declare data collection practices in App Store Connect (location, identifiers, usage data). (depends on: 8.2)
- [x] **Task 8.4** — App Store screenshots: generate screenshots for required device sizes (6.7", 6.5", 5.5" at minimum). (depends on: 7.6)
- [x] **Task 8.5** — Export compliance declaration. Handled via `ITSAppUsesNonExemptEncryption: false` in `app.config.ts` Info.plist, which satisfies the App Store Connect requirement automatically.

### Milestone 9: Missing Features & UX Gaps (NEW)

Features referenced in the PRD or discovered as gaps during development.

- [x] **Task 9.1** — Edit place note: the place detail sheet shows notes read-only. Users can add a note when saving but cannot edit it afterward. Add an edit note UI to the place detail sheet. (depends on: Milestone 2)
- [x] **Task 9.2** — Empty state for Explore: "Save your first place" card on empty map/list with CTA to Add tab. Combined with Task 7.1 onboarding flow. (depends on: Milestone 2)
- [ ] **Task 9.3** — Tag reordering: tags have a `position` column in the database but there is no UI to reorder them (e.g., drag-and-drop on Map Settings). (depends on: 4.6)
- [x] **Task 9.4** — Crash reporting: integrate Sentry (or similar) for production error monitoring. No crash reporting exists currently. (depends on: nothing)
- [x] **Task 9.5** — Analytics instrumentation: the PRD defines save frequency and retrieval frequency as core success metrics (PRD Section 6), but no analytics are tracked. (depends on: nothing)

---

## 7. Technical Risks & Open Questions

| Risk                                                                                                                                     | Impact | Mitigation                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Mapbox custom markers performance** — Rendering 50-200+ custom React Native views as map markers could cause jank on lower-end devices | Medium | Use Mapbox `ShapeSource` + `SymbolLayer` with pre-rendered images instead of React views for large datasets. Test early with 200+ pins                       |
| **Google Places API cost** — If the autocomplete is called on every keystroke, costs accumulate fast                                     | Medium | Debounce search input (300ms). Use session tokens to group autocomplete + place detail into a single billing session. Monitor usage via Google Cloud console |
| **Deep linking on iOS** — Universal Links require Apple App Site Association file hosting and can be flaky                               | Medium | Use Expo's built-in deep linking support. Test early in development, not at the end. Have a fallback URL that redirects to the App Store                     |
| **Apple Sign-In on Expo** — Requires specific native module setup and App Store provisioning                                             | Low    | Expo has first-class support via `expo-apple-authentication`. Follow Supabase's Expo auth guide                                                              |
| **RLS policy performance** — Nested EXISTS queries on every database read could slow down with many users                                | Low    | The `map_members` table is small per user. Add proper indexes (already specified). Monitor query plans if performance degrades                               |
| **RevenueCat webhook reliability** — If the webhook fails, user pays but doesn't get premium                                             | Medium | RevenueCat retries failed webhooks. Additionally, the app can check RevenueCat SDK on launch and sync entitlement locally as a fallback                      |
| **Freemium enforcement race conditions** — Two simultaneous add-place requests could bypass the 50-place limit                           | Low    | Edge Function checks count before insert. For true atomicity, use a Postgres function with row locking. Acceptable risk for v1                               |

### Open Questions (Technical)

1. ~~**Google Places API version** — The New (v2) API has different pricing and features than the legacy API. Need to verify autocomplete + place details pricing with session tokens.~~ **RESOLVED:** Using Google Places API (New) with debounced autocomplete (300ms). Implemented in `lib/google-places.ts`.
2. **Mapbox access token security** — The token is embedded in the app. Mapbox allows URL/bundle restrictions, but need to configure this properly. **STILL OPEN.**
3. ~~**Deep link domain** — Need to register `mapvault.app` (or similar) and set up Apple App Site Association for Universal Links.~~ **RESOLVED:** Domain `mapvault.app` registered. iOS `associatedDomains` and Android `intentFilters` configured in `app.config.ts`. Invite links now use `https://mapvault.app/invite/[token]`. AASA and `assetlinks.json` specs in `docs/universal-links-website.md`. Custom scheme `mapvault://` kept as fallback.
4. ~~**Default tag set** — PRD lists "Restaurant", "Bar", "Friend". Technical plan adds "Cafe". Final list TBD.~~ **RESOLVED:** Restaurant, Bar, Cafe, Friend — set in signup trigger and `create-map` Edge Function.
