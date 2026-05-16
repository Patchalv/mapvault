---
name: tanstack-query-hook
description: Create a TanStack Query hook for data fetching from Supabase. Use when building hooks in the hooks/ directory.
---

# TanStack Query Hook Pattern

Follow these patterns when creating data fetching hooks for MapVault.

## Query Key Convention

| Resource     | Key                     | Notes                        |
| ------------ | ----------------------- | ---------------------------- |
| User profile | `['profile']`           | Single user, no params       |
| All maps     | `['maps']`              | Maps the user is a member of |
| Map places   | `['map-places', mapId]` | Places for a specific map    |
| All places   | `['map-places', 'all']` | Places across all maps       |
| Tags         | `['tags', mapId]`       | Tags for a specific map      |

## Standard Query Hook Template

```typescript
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useMapPlaces(mapId: string) {
  return useQuery({
    queryKey: ["map-places", mapId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("map_places")
        .select(
          `
          id, note, created_at, added_by,
          places(id, google_place_id, name, address, latitude, longitude, google_category),
          map_place_tags(tag_id, tags(id, name, color, emoji)),
          place_visits(visited)
        `,
        )
        .eq("map_id", mapId);
      if (error) throw error;
      return data;
    },
    enabled: !!mapId,
  });
}
```

## Rules

1. **Always destructure `{ data, error }`** from Supabase and `throw error` in queryFn.
2. **Use `enabled`** for dependent queries (e.g., `enabled: !!mapId`).
3. **File naming:** `hooks/use-<resource>.ts` (kebab-case).
4. **Imports:** Use `@/` path alias. Import `supabase` from `@/lib/supabase`.
5. **No inline queries** in components — always wrap in a hook.

## Mutation Template

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";

export function useAddPlace() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: { mapId: string; placeData: PlaceInsert }) => {
      const { data, error } = await supabase
        .from("map_places")
        .insert(params.placeData)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["map-places"] });
    },
  });
}
```

## Optimistic Update Template (for toggles)

Use for `place_visits.visited` toggle:

```typescript
export function useToggleVisited(activeMapId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      mapPlaceId,
      visited,
    }: {
      mapPlaceId: string;
      visited: boolean;
    }) => {
      const { error } = await supabase
        .from("place_visits")
        .upsert({ user_id: userId, map_place_id: mapPlaceId, visited });
      if (error) throw error;
    },
    onMutate: async ({ mapPlaceId, visited }) => {
      await queryClient.cancelQueries({
        queryKey: ["map-places", activeMapId],
      });
      const previousData = queryClient.getQueryData([
        "map-places",
        activeMapId,
      ]);
      queryClient.setQueryData(["map-places", activeMapId], (old: MapPlace[]) =>
        old.map((p) =>
          p.id === mapPlaceId ? { ...p, place_visits: [{ visited }] } : p,
        ),
      );
      return { previousData };
    },
    onError: (_err, _vars, context) => {
      queryClient.setQueryData(
        ["map-places", activeMapId],
        context?.previousData,
      );
    },
  });
}
```

## Edge Function Invocation

For mutations with business rules (freemium limits, invites):

```typescript
const { data, error } = await supabase.functions.invoke("create-map", {
  body: { name: mapName },
});
if (error) throw error;
```

## Supabase Nested Select Syntax

Use PostgREST nested selects for joins:

```
.select('id, name, map_place_tags(tag_id, tags(id, name, color, emoji))')
```

The nesting follows foreign key relationships defined in the schema.
