# PRD: Discover Feature

**Status:** Ready for implementation  
**Date:** 2026-05-15  
**Author:** Design session with Patrick Alvarez

---

## Overview

MapVault currently lets users save and browse their own recommended places. The **Discover** feature adds exploratory, natural-language place search powered by the Google Places Text Search API — letting users find places with queries like "best cocktail bars in Malasaña" or "coffee near the Reina Sofía" and see ranked results on a map.

---

## Goals

- Let users explore a city using natural language queries, not just browse their own saved places
- Surface results on a map with one-tap access to place details (photos, rating, hours)
- Allow users to save discovered places to their active map with a single tap
- Keep v1 simple: Google Places data only (no community/user data), no filtering, no card tray

---

## Navigation Changes

**Before:** `Explore | Add | Settings` (3 tabs)  
**After:** `Places | Add | Discover | Settings` (4 tabs)

- **Rename "Explore" → "Places":** The existing Explore tab is renamed to "Places" — no behavior changes at all, rename only. This better reflects what it does (browse your saved places).
- **New "Discover" tab:** Added between Add and Settings.
- **Icon:** `Ionicons "compass"` (or `FontAwesome5 "compass"`).

**File to modify:** `app/(tabs)/_layout.tsx`

---

## Screen: Discover (`app/(tabs)/discover/index.tsx`)

The screen has three visual states:

### State 1 — Empty (default)

- Full-screen Mapbox map centered on user's current location, using the same `useLocation()` hook as the Places tab
- Floating **pill-shaped search bar** pinned near the top of the screen with shadow elevation (Google Maps style):
  - **Left:** MapVault pin/heart icon (brand asset)
  - **Center:** Placeholder text: `"I'm looking for..."`
  - **Right:** No arrow in empty state — the arrow only appears once the user taps and can actually submit
- No markers, no card tray, no bottom sheet

### State 2 — Search Overlay

Triggered when the user taps the pill search bar:

- **Full-screen white overlay** at ~85% opacity — the map is faintly visible behind it
  - **Grayscale note:** Mapbox on React Native doesn't support a simple grayscale CSS filter. For v1, use a plain white semi-transparent overlay (no grayscale). The map will show as slightly muted. Revisit in v2 if the visual is important (option: switch to a Mapbox monochrome style URL while overlay is open, revert on dismiss).
- The **search input animates** from its top position to vertical center of the screen using Reanimated (`useSharedValue` + `withSpring`)
- Input now shows a **blue send arrow** button on the right
- Keyboard opens automatically (`autoFocus`)
- **Hint text** displayed below the input: `"e.g. best coffee shop near me"`
- **No debouncing** — the API is called only when the user taps the send arrow (avoids unnecessary Google API costs)
- Tapping outside the overlay or using the back gesture dismisses it and returns to the previous state (empty or results)

### State 3 — Results

After the API call returns:

- Overlay dismisses with a reverse spring animation
- Map zooms and pans to fit all result markers using Mapbox's `fitBounds` / `Camera` with `bounds` prop
- **Search pill** at the top shows the current query text with an `✕` button on the right to clear back to empty state
- **Result markers** rendered on the map (see Markers section)
- Tapping a marker opens the Place Detail Sheet (see below)

---

## Markers

Discover results use a **different marker style** from the Places tab markers (which use emoji + tag colors). Do not reuse the existing `MapMarkers` component — create a new `DiscoverMarkers` component.

**Marker design:**
- Circular badge showing a **category icon** (based on `primaryType`) + **rating** (e.g., cocktail glass icon + "4.9")
- Color-coded by primary Google place type: bar = red, restaurant = orange, cafe = brown, museum = purple, etc. (define a mapping in the component)
- **Selected state:** marker enlarges and elevates when tapped (before the sheet opens)
- **Deselected state:** returns to normal size when sheet is dismissed

**New component:** `components/discover-markers/discover-markers.tsx`

---

## Place Detail Bottom Sheet

Uses `@gorhom/bottom-sheet` following the same patterns as the existing `PlaceDetailSheet` in `components/place-detail-sheet/place-detail-sheet.tsx`.

**Snap points:** `['50%', '90%']`

**Content (top to bottom):**

1. **Place name** — large, bold
2. **Rating row** — star display (filled/half/empty stars) + numeric rating + review count  
   e.g., `★★★★★  4.9 · 118 reviews`
3. **Meta row** — Category · Price level  
   e.g., `Bar · €€`  
   Price level mapping: `PRICE_LEVEL_FREE` → free, `PRICE_LEVEL_INEXPENSIVE` → €, `PRICE_LEVEL_MODERATE` → €€, `PRICE_LEVEL_EXPENSIVE` → €€€, `PRICE_LEVEL_VERY_EXPENSIVE` → €€€€
4. **Status row** — Open/Closed in green/red + closing time  
   e.g., `Open · Closes 02:30` or `Closed · Opens 09:00`
5. **Action row:**
   - **Directions** button → opens Apple Maps on iOS using `Linking.openURL('maps://...')` with place coordinates; fallback to Google Maps URL
   - **Save to map** button → calls existing `add-place` Edge Function with the active map ID (no tags, no note, no visited status — user can add those later from the Places tab)
6. **Photo carousel** — horizontally scrollable `FlatList` of photos fetched on-demand from Google Places Photos API (see API section)

**Save behavior details:**
- Calls the existing `add-place` Edge Function — no new backend needed
- Freemium gate (20-place limit for free users) is enforced by the Edge Function automatically
- On success: show a brief toast/snackbar: `"Place saved to map"`
- On error: show inline error message (freemium limit, network error, etc.)
- If place is already saved to the active map: show `"Already saved"` state on the button (check against `useMapPlaces` data client-side before calling the Edge Function)

**New component:** `components/discover-place-sheet/discover-place-sheet.tsx`

---

## Google Places API

### Existing setup (reuse)

- API keys: `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS` and `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID` — already set up in `.env`
- Client: `lib/google-places.ts` — add the new function here

### New function: `searchPlacesText`

```typescript
// Add to lib/google-places.ts
export async function searchPlacesText(
  query: string,
  locationBias?: { latitude: number; longitude: number }
): Promise<DiscoverPlace[]>
```

**Endpoint:** `POST https://places.googleapis.com/v1/places:searchText`

**Request body:**
```json
{
  "textQuery": "<user query>",
  "locationBias": {
    "circle": {
      "center": { "latitude": ..., "longitude": ... },
      "radius": 50000
    }
  }
}
```

**Field mask (X-Goog-FieldMask header)** — single request covers both markers and detail sheet:
```
places.id,places.displayName,places.formattedAddress,places.location,
places.rating,places.userRatingCount,places.priceLevel,places.primaryType,
places.types,places.regularOpeningHours,places.photos
```

**Response:** Returns up to 20 results (Google's default max for Text Search). Map to `DiscoverPlace[]`.

**Auth headers:** Same as existing `searchPlaces()` — `X-Goog-Api-Key` + platform-specific restriction header.

### Photos

Photos are fetched **on-demand** as the user scrolls the carousel — not upfront.

```
GET https://places.googleapis.com/v1/{photoName}/media?maxWidthPx=800&key=...
```

`photoNames` (array of Google photo resource names like `places/ChI.../photos/...`) are stored in `DiscoverPlace` and passed to the carousel. Each carousel item fetches its own image URL using this pattern.

---

## New TypeScript Type

**Add to `types/index.ts`:**

```typescript
export interface DiscoverPlace {
  id: string;                      // Google place ID
  name: string;                    // Display name
  formattedAddress: string;
  latitude: number;
  longitude: number;
  rating: number | null;           // 1.0–5.0
  userRatingCount: number | null;
  priceLevel: string | null;       // e.g. "PRICE_LEVEL_MODERATE"
  primaryType: string | null;      // e.g. "bar", "restaurant", "cafe"
  isOpen: boolean | null;          // null if no hours data
  closingTime: string | null;      // e.g. "02:30" (next closing time)
  photoNames: string[];            // Google photo resource names for carousel
}
```

---

## New Hook

**`hooks/use-discover-search.ts`** — TanStack Query hook wrapping the Text Search call.

```typescript
// Returns:
{
  results: DiscoverPlace[];
  isLoading: boolean;
  error: string | null;
  search: (query: string) => void;  // manually triggers API call
  clear: () => void;                // resets to empty state
  currentQuery: string | null;      // shown in pill after search
}
```

- Use `enabled: false` on mount — query is manually triggered via `search()`
- On `clear()`: reset results to `[]`, reset `currentQuery` to `null`
- No debouncing — the hook fires only when `search()` is called explicitly (from the send button)

---

## File Structure

```
app/(tabs)/
  _layout.tsx                          ← MODIFY: add Discover tab, rename Explore → Places
  discover/
    _layout.tsx                        ← NEW: minimal stack layout
    index.tsx                          ← NEW: main Discover screen (3 states)

components/
  discover-markers/
    discover-markers.tsx               ← NEW: Mapbox markers for Discover results
  discover-place-sheet/
    discover-place-sheet.tsx           ← NEW: bottom sheet for place detail + save

hooks/
  use-discover-search.ts               ← NEW: TanStack Query hook for Text Search

lib/
  google-places.ts                     ← MODIFY: add searchPlacesText()

types/
  index.ts                             ← MODIFY: add DiscoverPlace interface
```

---

## i18n

**New `discover` namespace** — add to both `locales/en.json` and `locales/es.json` simultaneously:

```json
"discover": {
  "searchPlaceholder": "I'm looking for...",
  "searchHint": "e.g. best coffee shop near me",
  "saveToMap": "Save to map",
  "alreadySaved": "Already saved",
  "directions": "Directions",
  "open": "Open",
  "closed": "Closed",
  "closes": "Closes {{time}}",
  "opens": "Opens {{time}}",
  "reviews": "{{count}} reviews",
  "savedSuccess": "Place saved to map",
  "errorSearch": "Search failed. Please try again.",
  "errorSave": "Could not save place. Please try again.",
  "errorLimit": "You've reached the free plan limit. Upgrade to save more places."
}
```

---

## Analytics

New events via `track()` from `lib/analytics.ts`:

| Event | Properties |
|-------|-----------|
| `discover_search_submitted` | `query: string` |
| `discover_result_tapped` | `place_name: string`, `rating: number \| null`, `place_id: string` |
| `discover_place_saved` | `place_name: string`, `map_id: string`, `place_id: string` |
| `discover_directions_tapped` | `place_name: string`, `place_id: string` |
| `discover_cleared` | — |

---

## Out of Scope (v1)

The following are explicitly excluded from v1:

- "Search this area" re-query when the user pans the map
- Filtering by Open Now / Top Rated / price level / category
- Photo carousel expanding to full-screen
- Saving with tags, notes, or visited status from Discover (add from Places tab later)
- Card tray / horizontal scrollable result list
- Community data (places from other MapVault users' maps)
- Grayscale map effect behind the search overlay

---

## Verification Checklist

After implementation, verify:

1. `npm run typecheck` — no errors
2. `npm run lint` — no lint errors
3. `npm run check:i18n` — `en.json` and `es.json` are in sync

**Manual test flow:**
- [ ] Open Discover tab → empty map + pill search bar visible (no arrow on right)
- [ ] Tap search bar → overlay animates input to center, keyboard opens, send arrow appears, hint text visible
- [ ] Type a query and tap send → overlay dismisses, markers appear on map, pill shows query with ✕
- [ ] Tap a marker → detail sheet opens with name, rating, category, open status, photo carousel
- [ ] Tap Directions → Apple Maps opens with correct place coordinates
- [ ] Tap Save to map → brief success toast, place appears in Places tab
- [ ] Tap Save again on same place → button shows "Already saved", no duplicate Edge Function call
- [ ] Tap ✕ on search pill → returns to empty state, markers removed
- [ ] Test with free user at 20-place limit → save from Discover shows freemium error

**Edge cases:**
- [ ] Location permission denied → map shows default city, search still works without location bias
- [ ] No results returned by Google → show empty state message on map
- [ ] Network error during search → show error state, allow retry
- [ ] Place has no photos → carousel section hidden
- [ ] Place has no rating → rating row hidden (not shown as 0)
- [ ] Place has no hours data → open/closed row hidden
