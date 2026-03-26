# Manage Maps UI Improvements

**Date:** 2026-03-26
**Status:** Approved

## Context

The Manage Maps screen currently uses a green dot before the map name to indicate the active map. Users associate green dots with "online" status (like in messaging apps), making this indicator confusing. Additionally, each map row shows no metadata — users can't see how many members or places a map has at a glance. Finally, users with few maps see a large empty space below the list with no guidance on how to use the maps feature.

## Changes

### 1. Section subtitle

Add a one-liner subtitle below the "Maps" section header to explain what the active map controls.

**Copy (EN):** `"Tap a map to manage it. The active one shows on Explore."`
**Copy (ES):** `"Toca un mapa para gestionarlo. El activo se muestra en Explorar."`
**i18n key:** `manageMaps.subtitle`
**Style:** `text-xs text-gray-500`, rendered directly below the "Maps" heading, above the map rows.

### 2. Replace active indicator: dot → "Active" tag

**Remove:** The `h-2.5 w-2.5 rounded-full` dot before the map name (currently `bg-green-500` when active, `bg-transparent` otherwise).

**Add:** A green pill badge reading "Active" rendered inline with the map name — same line, immediately after the name text.

- Badge styles: `bg-green-100 text-green-700`, `text-xs font-semibold`, `px-2 py-0.5 rounded-full`
- Only rendered when `isActive === true`
- The map name + badge sit in a `flex-row items-center gap-2` wrapper

### 3. Map metadata row (members + places)

Each map row gets a secondary line below the map name showing:

- **Member count:** `Ionicons name="people-outline"` (size 12, color `#9CA3AF`) + count number
- **Place count:** `Ionicons name="location-outline"` (size 12, color `#9CA3AF`) + count number
- Layout: `flex-row items-center gap-3`, `text-xs text-gray-500`

**Data source:** The `useMaps` hook query will be expanded to fetch nested records:

```
maps(id, name, created_by, map_members(*), map_places(*))
```

Counts are derived client-side: `map.map_members?.length ?? 0` and `map.map_places?.length ?? 0`. This approach works without any Supabase configuration changes and is fully type-safe with auto-inferred types.

> **Note on the `(count)` aggregate syntax:** PostgREST supports `map_members(count)` but it requires `pgrst.db_aggregates_enabled = 'true'` to be set on the Supabase project (off by default), and has a known TypeScript inference bug (#20562) that requires explicit type casting. The `(*)` + `.length` approach is preferred for reliability.

**Performance:** Acceptable for this use case. Free users are capped at 20 places per map; premium maps with larger counts are still well within range for a settings list screen that is not a hot path.

**Note:** `useMaps` is shared across `use-active-map.ts`, `use-map-role.ts`, and `map/[id]/index.tsx`. The additional fields returned are ignored by those consumers — no changes needed there.

### 4. Empty-state tip

When `maps.length <= 3`, render a subtle tip box below the map list (inside the `ScrollView`, after the map rows).

**Copy (EN):** `"Create maps to organise places by themes or groups of people — Rome trip, Brunch buddies, or Best cocktails in London."`
**Copy (ES):** `"Crea mapas para organizar lugares por temas o grupos de personas — viaje a Roma, amigos de brunch, o los mejores cócteles de Londres."`

**Style:** Dashed border (`border border-dashed border-gray-200`), rounded-xl, `bg-gray-50`, `p-4`. An emoji 💡 (`text-lg`) sits left of the text in a `flex-row items-start gap-2` layout. Text is `text-xs text-gray-500`.

**i18n key:** `manageMaps.tip`

> **Note:** `maps.length` counts all maps the user is a member of, including ones they were invited to — not just maps they created. This is intentional; the threshold of 3 is generous enough to cover shared-map users.

### Translation keys summary

| Key | EN | ES |
|-----|----|----|
| `manageMaps.subtitle` | `Tap a map to manage it. The active one shows on Explore.` | `Toca un mapa para gestionarlo. El activo se muestra en Explorar.` |
| `manageMaps.activeBadge` | `Active` | `Activo` |
| `manageMaps.tip` | *(copy above)* | *(copy above)* |

## Files to Change

| File | Change |
|------|--------|
| `hooks/use-maps.ts` | Expand select to include `map_members(*), map_places(*)` |
| `app/(tabs)/settings/maps.tsx` | Remove dot, add "Active" tag, add metadata row, add conditional tip |
| `locales/en.json` | Add `manageMaps.subtitle`, `manageMaps.activeBadge`, `manageMaps.tip` |
| `locales/es.json` | Add `manageMaps.subtitle`, `manageMaps.activeBadge`, `manageMaps.tip` |

## Verification

1. Run `npm run start:dev` and open the Manage Maps screen
2. Confirm subtitle appears below the "Maps" heading
3. Confirm the active map shows a green "Active" pill — no dot
4. Confirm member and place counts appear under each map name
5. With ≤ 3 maps: confirm the tip appears below the list
6. With > 3 maps: confirm the tip is hidden
7. Run `npm run check:i18n` — all keys match
8. Run `npx tsc --noEmit` — no type errors
