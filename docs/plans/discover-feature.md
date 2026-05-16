# PRD: Discover Feature

**Status:** Ready for tech-lead review — Google Maps implementation path
**Date:** 2026-05-16
**Author:** Design session with Patrick Alvarez
**Revision:** v2 — post-review decisions baked in

---

## Context

MapVault currently lets users save and browse their own recommended places. The main product PRD has historically positioned the app as "NOT a discovery engine" — every place was deliberately saved by you or someone you shared a map with.

**Discover is a deliberate expansion of that line, not a replacement for the core curation product.** It introduces exploratory, natural-language place search powered by the Google Places Text Search API, displayed on a Google Map in the Discover tab. It ships as a **premium-tier feature**. Free users get a 5-search lifetime trial as an upgrade hook; premium users get up to 100 searches per calendar month. This expands MapVault's value prop and gives premium a second hook beyond the existing 20-place save cap while keeping saved, shared, curated maps as the main product experience.

**Map provider decision:** Discover uses Google Maps, not Mapbox, because Google Places API results displayed on a map must be shown on a Google Map with proper attribution. The existing Places tab can continue using Mapbox for saved MapVault places. This means MapVault will have two map surfaces:
- **Discover:** Google Map + Google Places results.
- **Places:** existing Mapbox map + saved MapVault places.

**Action items outside this PRD:**
- Update `docs/prd.md` to reframe "not a discovery engine" → "discovery is premium; the free tier is curation-only."
- Marketing copy and website to follow.

---

## Goals

- Surface a city in natural language ("best cocktail bars in Malasaña", "coffee near Reina Sofía") and show Google Places results on a Google Map with their Google ratings.
- Make Discover a **major upgrade hook** for non-paying users: 5 lifetime free searches, then paywall.
- Bound API spend so the feature is economically defensible at $9.99/year pricing.
- One-tap handoff from Discover into the existing Add place flow so users can save with normal MapVault context (map, tags, note, visited status) instead of creating a parallel untagged-save path.

## Out of Scope (v1)

- "Search this area" re-query when the user pans the map
- Filter chips (Open Now, Top Rated, price, category) on the result set
- Photo carousel full-screen / pinch zoom
- A bespoke Discover-only save flow. Discover hands off to the existing Add tab instead.
- Card tray / scrollable result list. Intentionally excluded from v1 to get the feature live quickly; revisit after observing marker tap, search refinement, and save behavior.
- Community data (places from other MapVault users)
- Custom Google Map styling that attempts to visually match Mapbox exactly
- Full accessibility pass (see Known Debt)

---

## Navigation

**Before:** `Explore | Add | Settings` (3 tabs)
**After:** `Discover | Places | Add | Settings` (4 tabs, in that order)

- **Rename `Explore` → `Places`** (route `app/(tabs)/explore/` → `app/(tabs)/places/`). Behavior unchanged.
- **New `Discover` tab** as the leftmost tab. Icon: `Ionicons "compass"`.
- **Default launch tab remains Places** — set `initialRouteName="places"` in `app/(tabs)/_layout.tsx`. Discover is leftmost visually but is not the launch tab (existing users keep their muscle memory).
- If the Discover kill-switch flag is off, the Discover tab is hidden entirely (see Kill Switch).

**File to modify:** `app/(tabs)/_layout.tsx`

**Rename ripple — audit before merging:**
Renaming `app/(tabs)/explore/` → `app/(tabs)/places/` has fallout across the codebase. Before merging, grep for and update:
- String literals `'/explore'`, `'(tabs)/explore'`, `'/(tabs)/explore'` (used in `router.push` / `router.replace`).
- Focus parameter conventions (`focusLat`, `focusLng`) currently routed via the Explore screen — confirm they still resolve.
- Analytics event values referring to "explore" (e.g., screen names) — keep these stable if they're already in PostHog dashboards, or migrate intentionally.
- Universal-link / deep-link handlers and any tests that hardcode the path.

---

## Freemium gating & cost model

### Free tier
- **5 lifetime Discover searches.** Counter never auto-resets. Admin can grant more manually for support cases.
- 6th attempt → existing paywall (`router.push('/(tabs)/settings/paywall?trigger=discover_limit')`).
- Paywall copy must make the entitlement explicit: free users get 5 total Discover searches to try the feature; premium users get 100 Discover searches per calendar month.

### Premium tier
- **100 Discover searches per calendar month** with a friendly "you're searching a lot — come back next month" screen once the cap is reached.
- "Per month" means calendar month from the user's perspective. Use the user's device timezone, sent with each Discover search request, to derive the local month. If the client does not provide a timezone, fallback to UTC. Product copy must not describe Discover as "unlimited."

### Free-tier trial counter schema
Add to `profiles`:
```sql
alter table profiles
  add column discover_searches_used     integer not null default 0,
  add column discover_searches_granted  integer not null default 5;
```
- Incremented server-side only (Edge Function below); never trusted from the client.
- Admin tooling raises `discover_searches_granted`. `discover_searches_used` is monotonic and only reset manually if ever.
- RLS: read-only to the user; write only via `security definer` Edge Function path.

### Monthly cap storage and usage measurement

The 100/month premium cap needs durable per-user usage tracking. This is also required for pricing review: MapVault must be able to answer "how many successful Discover searches did each user run this month?" without relying only on PostHog or Google Cloud billing aggregates.

**Decision: use a `discover_search_events` ledger table in v1.** A two-column counter on `profiles` is simpler, but it cannot support per-user monthly economics, support audits, or spend attribution when Google Cloud costs spike.

```sql
create table discover_search_events (
  id          bigserial primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  local_date  date not null,
  local_month text not null, -- YYYY-MM in the request timezone
  time_zone   text not null,
  source      text not null check (source in ('free','premium'))
);
create index discover_search_events_user_month_idx
  on discover_search_events (user_id, local_month, created_at desc);
create index discover_search_events_month_idx
  on discover_search_events (local_month, created_at desc);
```

- Monthly cap check counts successful premium rows for `(user_id, local_month)`, where `local_month` is computed from the client-provided timezone for the request, not a rolling 30-day window.
- Insert a row only after Google returns a successful Text Search response. Rejected searches, validation failures, auth failures, and client-side cache hits do not consume the MapVault allowance.
- Track free-trial successful searches in this table too (`source = 'free'`) even though `profiles.discover_searches_used` remains the enforcement counter. This keeps launch-month economics visible across free and premium cohorts.
- Retain at least 13 months of rows so pricing decisions can use monthly cohorts and seasonality. If table growth becomes material, add a `pg_cron` prune after the retention window.
- Create an internal SQL/reporting query for:
  - total Discover searches/month;
  - average and p95 searches per premium user/month;
  - premium users at 80+ and 100 searches/month;
  - free trial searches/month;
  - estimated Google search cost after the pooled monthly free cap.

**Rejected alternative — Two columns on `profiles`:**
```sql
alter table profiles
  add column discover_searches_this_month       integer not null default 0,
  add column discover_searches_this_month_key   text    not null default '<YYYY-MM in user timezone>';
```
- **Pros:** No new table. Constant-time read on every Discover call. Single-row update per search. Simplest mental model.
- **Cons:**
  - Must compute the user's local calendar month from the client-provided timezone inside the Edge Function; database `current_date` is not sufficient because it uses the database/session timezone.
  - Read-modify-write atomicity: must use a single-statement update or a transaction. Two concurrent searches can race otherwise.
  - No historical data inside Postgres. Can't answer "how many searches per user this month" without PostHog.

### Photo cap
- Carousel shows **max 3 photos per place** regardless of how many Google returns.

### Cost alerting
- **Google Cloud daily $-budget alert** (single GCP alert). No app-side spend duplication for v1.

### Cost model

Current pricing assumption: Google Maps Platform global pricing checked on 2026-05-16 against:
- Google Maps Platform pricing overview: https://developers.google.com/maps/billing-and-pricing/overview
- Google Maps Platform global price list: https://developers.google.com/maps/billing-and-pricing/pricing
- Places API usage and billing: https://developers.google.com/maps/documentation/places/web-service/usage-and-billing
- Text Search (New) field mask docs: https://developers.google.com/maps/documentation/places/web-service/text-search

Re-check before implementation because Places API SKU pricing can change. Google's pricing docs were last updated 2026-05-12 UTC at the time of this review.

Google Maps Platform now uses per-SKU monthly free usage caps. The old blanket $200/month Google Maps Platform credit was replaced on 2025-03-01. Free usage resets on the first day of each month at midnight Pacific time and is pooled at the billing-account/SKU level, not per app user.

The planned field mask includes `places.rating`, `places.userRatingCount`, `places.priceLevel`, and `places.currentOpeningHours`. Per Google's Places data field pricing, these fields place the Text Search call in **Text Search Enterprise**, not Text Search Pro. Current global pricing:

| SKU | Free monthly usage cap | Paid tier used for v1 modeling |
|-----|------------------------|--------------------------------|
| Places API Text Search Enterprise | 1,000 requests/month | $35 per 1,000 requests up to 100,000/month |
| Places API Place Details Photos | 1,000 requests/month | $7 per 1,000 requests up to 100,000/month |
| Maps SDK for iOS / Android | Unlimited | Current global price list shows no paid tier for native Maps SDK map loads |

Unit-cost assumptions after the free usage cap:
- One successful Discover search = one Text Search Enterprise request = **$0.035/search**.
- Opening a result sheet with photos requests up to 3 photo URLs. Google bills photo calls per photo request, so worst-case photo URL cost = **3 × $0.007 = $0.021/sheet open**.
- Loading the Google Map in the Discover tab should not create marginal map-load cost if the chosen React Native integration uses the native Maps SDK SKU. Tech lead must validate that the implementation does not accidentally use Maps JavaScript API, Dynamic Maps, Map Tiles API, Street View, cloud styling/features, or other paid SKUs.
- A search that fails before Google returns successfully should not increment the user's trial/monthly counter, but it may still create Google API cost depending on where the failure occurs.

Illustrative monthly cost per active Discover user:

| Usage pattern | Search cost | Photo cost assumption | Total monthly API cost |
|---------------|-------------|-----------------------|------------------------|
| Light: 5 searches/month, 2 photo sheet opens | $0.18 | $0.04 | $0.22 |
| Expected: 20 searches/month, 5 photo sheet opens | $0.70 | $0.11 | $0.81 |
| Cap max: 100 searches/month, 25 photo sheet opens | $3.50 | $0.53 | $4.03 |
| Cap max with every search opening 3 photos | $3.50 | $2.10 | $5.60 |

Launch-stage free-cap implication: with 2 premium users capped at 100 searches/month and 30 free users each using all 5 lifetime trial searches in the same month, total search volume is only 350 Text Search requests. That stays fully inside Google's 1,000/month free Text Search Enterprise cap. Even if all 350 searches opened 3 photo URLs, that would be 1,050 photo requests, creating only 50 paid photo requests = $0.35.

Business implication: at $9.99/year, Discover is economically viable only if typical premium usage stays low or total usage remains covered by the pooled Google free caps. A premium user who actually uses all 100 searches/month costs $3.50/month in search requests alone after the pooled free cap is exhausted, while $9.99/year produces roughly $0.83/month gross before app store fees. The 100/month cap is a hard abuse ceiling, not a margin-safe everyday entitlement. If average premium usage approaches 20+ searches/month, or photo opens are high, revisit pricing, lower the monthly cap, reduce the field mask, or introduce a higher-priced Discover tier.

Pricing review triggers:
- Total Discover searches exceed 750/month, because the app is approaching the pooled 1,000/month free Text Search Enterprise cap.
- Average premium Discover usage exceeds 20 searches/user/month for two consecutive months.
- More than 10% of premium users reach 80+ searches/month.
- Photo media requests exceed 750/month or photo costs begin to exceed search costs.
- Discover-related Google API cost exceeds 20% of monthly premium subscription revenue.

Cost controls required for v1:
- Set a GCP budget alert before rollout.
- Set per-method Google Places quota limits for Text Search and Place Photos, not just a budget alert.
- Validate that the Google Maps integration uses the native Maps SDK SKU and does not trigger paid map-rendering SKUs.
- Track successful searches and photo URL requests server-side by user, local month, and entitlement so spend spikes can be attributed without relying only on PostHog.
- Revisit the field mask before build: removing `currentOpeningHours`, `priceLevel`, `rating`, and/or `userRatingCount` materially changes SKU economics, but also weakens the user experience.

### Pricing note
At $9.99/year, the API margin is thin once the pooled Google free caps are exceeded. If Discover usage exceeds ~20 searches/premium user/month, revisit pricing, reduce the monthly cap, reduce expensive fields, or introduce a "Discover Pro" tier.

---

## Edge Function backend

### `discover-search`
**Path:** `supabase/functions/discover-search/index.ts`

**Purpose:** the only path through which Google Places Text Search is called. Hosts the trial counter, monthly cap, usage ledger, and feature flag check. Keeps the Google API key out of the binary.

**Request body:**
```json
{
  "query": "<user query, truncated to 200 chars>",
  "locationBias": { "latitude": 40.4168, "longitude": -3.7038 },  // optional; omitted if user denied location
  "languageCode": "en" | "es",
  "timeZone": "Europe/Madrid"
}
```
`locationBias` is optional — when the user has denied location permission, omit it and let Google return results without geographic bias.

Implementation note: distinguish real user location from map-display fallback. If `useLocation()` falls back to Madrid for map centering, that fallback must not be sent as `locationBias`. Only send `locationBias` when the app has a real permission-backed device location.

`timeZone` is required for authenticated clients and should be the device timezone from `Intl.DateTimeFormat().resolvedOptions().timeZone` or the closest Expo-compatible equivalent. It is used only for calendar-month cap enforcement. If omitted by an older client, the Edge Function falls back to UTC.

Google Maps SDK configuration lives in the native app, not in this request body. Keep Maps SDK keys restricted by platform bundle ID/package name.

**Flow:**
1. Validate auth (`auth.getUser()`).
2. Check user entitlement. If free:
   - Reject with `402 DISCOVER_TRIAL_EXHAUSTED` if `discover_searches_used >= discover_searches_granted`.
   - Otherwise allow the request to proceed. Increment `discover_searches_used` atomically only after Google returns a successful response.
3. If premium:
   - Reject with `429 DISCOVER_MONTHLY_CAP` if successful premium searches for the relevant local calendar month are ≥ 100.
4. Call `POST https://places.googleapis.com/v1/places:searchText` with the field mask below and `maxResultCount: 20`.
5. If Google returns successfully, record the successful search against the user's free trial or premium monthly cap by inserting a `discover_search_events` row.
6. Map response to `DiscoverPlace[]`, return.

**Field mask (X-Goog-FieldMask):**
```
places.id,places.displayName,places.formattedAddress,places.location,
places.rating,places.userRatingCount,places.priceLevel,places.primaryType,
places.types,places.currentOpeningHours,places.utcOffsetMinutes,
places.photos
```
`places.photos` returns the full Photo object including `authorAttributions` — no need to enumerate subfields.

**Result count:** v1 requests at most **20 places** from Google. This keeps map density, marker rendering cost, and user scanning effort bounded.

### `discover-photo-urls`
**Path:** `supabase/functions/discover-photo-urls/index.ts`

**Purpose:** resolve Google photo resource names to public CDN URLs. Called lazily by the detail sheet on open.

**Auth note:** the function requires auth, but understand the threat model — Google's returned CDN URLs are publicly accessible (anyone with the URL can fetch the image). The auth gate protects *the Edge Function from being abused to burn the Google photo SKU*, not the image data itself. Once a client has a URL, it can be shared freely.

**Request body:**
```json
{
  "photoNames": ["places/ChI.../photos/...", "..."],
  "maxWidthPx": 600
}
```
`maxWidthPx` of 600 covers a ~200px-tall carousel at 2x retina (~400px) with headroom; don't request 800+ — wastes bandwidth.

**Flow:**
1. Validate auth.
2. For each photoName (in parallel via `Promise.all`), `GET https://places.googleapis.com/v1/{photoName}/media?maxWidthPx=600&skipHttpRedirect=true` → parse `photoUri` from the JSON response.
3. Return `{ urls: string[] }` in the same order.

Client renders via plain `<Image source={{ uri }}>`. No Google API key client-side.

### Migration
**New file:** `supabase/migrations/<timestamp>_add_discover_usage_tracking.sql`
- Adds the two free-tier counter columns to `profiles`.
- Creates `discover_search_events` and indexes from the monthly usage ledger section.
- RLS: user can `select` own profile row including the new free-tier columns. Usage-event reads should be restricted to the service role/admin tooling unless a user-facing usage screen is added later.
- Writes happen only from the Edge Function/service-role path after a successful Google Text Search response.

---

## Screen: Discover (`app/(tabs)/discover/index.tsx`)

Three visual states.

### Map implementation

- Discover uses a Google Map, not `@rnmapbox/maps`.
- Existing Places tab remains on Mapbox; do not refactor the saved-places map as part of this feature.
- Tech lead should choose the React Native Google Maps integration. Default candidate: `react-native-maps` with `provider={PROVIDER_GOOGLE}` and an Expo/EAS-compatible config plugin.
- Google Maps attribution/logo and any provider attribution must remain visible and unobscured by the search pill, overlays, bottom sheet, safe areas, or tab bar.
- Avoid Google Map IDs/custom cloud styling in v1 unless the tech lead confirms billing and setup implications. Use the default Google map style, with only normal camera/marker controls.
- Do not place Google Places content on the existing Mapbox map. Discover results live only on the Google Map surface.

### State 1 — Empty (default)

- Full-screen Google Map centered on user's current location (reuse `useLocation()`).
- Floating **pill search bar** pinned near the top:
  - **Left:** MapVault logo SVG at 20-24px (see Brand Asset).
  - **Center:** `t('discover.searchPlaceholder')` → "I'm looking for…"
  - **Right:** no arrow in empty state.

### State 2 — Search Overlay

Triggered on pill tap:
- Full-screen white overlay at ~85% opacity. Map shows muted behind (no grayscale; revisit in v2 if needed).
- The pill animates from its top position to vertical center via Reanimated (`useSharedValue` + `withSpring`).
- A **blue send arrow** fades in on the right at 150ms (`withTiming`).
- Keyboard opens automatically (`autoFocus`).
- Hint text below the input: `t('discover.searchHint')` → "e.g. best coffee shop near me".
- **No debouncing** — API call only fires on send-arrow tap.
- Tapping outside or back gesture dismisses the overlay, restoring the prior state (empty or results).

### State 3 — Results

After a successful search:
- Overlay dismisses with reverse spring.
- Google Map zooms/pans to fit all result markers using the chosen map component's camera/bounds API.
- **Search pill** at the top shows the current query with `✕` on the right to clear back to empty.
- Result markers rendered (see Markers).
- Tapping a marker opens the Place Detail Sheet.

### State machine — all transitions

| State | Trigger | Outcome |
|-------|---------|---------|
| **Loading** | User taps send arrow | Stay on overlay, replace send arrow with spinner. On response → next state. |
| **Error** | Search call fails | Overlay stays, inline message below input (`t('discover.errorSearch')`), input preserved, send arrow restored for retry. |
| **No results** | Google returns `[]` | Overlay dismisses, map banner: `t('discover.noResults', { query })`. Pill keeps the query + ✕. |
| **Re-tap on pill** | Results showing → tap pill | Overlay re-opens with `currentQuery` pre-filled. Edit + send → results replace. Tap outside → revert to results. |
| **Tab switch** | User leaves Discover with overlay open | Overlay + keyboard dismiss silently. Returning shows last persisted state (empty or results). |
| **Clear (✕)** | Tap ✕ on pill or call `clear()` | Single shared code path. Resets `currentQuery`, results, markers; returns to State 1. |
| **Trial exhausted** | Edge Function returns `402` | Spinner stops → overlay dismisses with reverse spring → `router.push('/(tabs)/settings/paywall?trigger=discover_limit')`. Don't route while the overlay is mounted — sequence matters to avoid layering glitches. |
| **Monthly cap (premium)** | Edge Function returns `429` | Same dismiss sequence as above, then show `t('discover.monthlyCap')` as an inline banner on the map (not a separate modal). |

---

## Markers

**New component:** `components/discover-markers/discover-markers.tsx`. Do not reuse `MapMarkers`; the existing component is Mapbox-specific.

- **Shape:** 32px solid colored circle, centered rating number in white (e.g. "4.9"). No category icon.
- **Selected:** enlarges to ~40px with drop shadow.
- **No rating:** show "—".
- **Color buckets by `primaryType`:**

| Bucket | Color | primaryTypes |
|--------|-------|--------------|
| Warm | orange | `restaurant`, `cafe`, `bar`, `bakery`, `food`, `meal_takeaway`, `meal_delivery`, `night_club` |
| Cool | teal | `museum`, `art_gallery`, `park`, `beach`, `tourist_attraction`, `hotel`, `lodging`, `library`, `theater`, `movie_theater`, `zoo` |
| Gray | medium gray | everything else, including `null` |

Pick hex values from the existing palette; verify WCAG contrast for white-on-color (AA at minimum).

Built on the chosen Google Maps marker API. Manual perf spot-check during impl: 20 custom markers on a low-end Android. If FPS drops below ~50, simplify marker rendering before launch.

---

## Place Detail Sheet

**New component:** `components/discover-place-sheet/discover-place-sheet.tsx`. Uses `@gorhom/bottom-sheet`. Snap points: `['50%', '90%']`.

### Content (top to bottom)

1. **Place name** — large, bold.
2. **Rating row** — stars + numeric rating + review count, e.g. `★★★★★  4.9 · 118 reviews`. Hidden if `rating == null`.
3. **Meta row** — Category · Price level, e.g. `Bar · $$`.
   - Price map: `PRICE_LEVEL_INEXPENSIVE` → `$`, `PRICE_LEVEL_MODERATE` → `$$`, `PRICE_LEVEL_EXPENSIVE` → `$$$`, `PRICE_LEVEL_VERY_EXPENSIVE` → `$$$$`, `PRICE_LEVEL_FREE` → `Free`. Universal across locales.
4. **Status row** — Open/Closed badge + next transition time (24h, place-local).
   - Source: `currentOpeningHours.openNow` and `currentOpeningHours.periods`; format times using `utcOffsetMinutes`.
   - Hidden if no hours data.
5. **Action row:**
   - **Directions** → `openDirections(latitude, longitude, name)` from `lib/directions.ts`. Reuses existing iOS app picker + Android `geo:` URL + Google Maps web fallback.
   - **Save** — see Save Behavior below.
6. **Photo carousel** — horizontal `FlatList`, `pagingEnabled`, ~200px height, no pagination dots in v1.
   - Max **3 photos** per place even if Google returns more.
   - Each photo has a **bottom-left attribution overlay**: small white text on translucent dark gradient showing `authorAttributions[].displayName`. Tap → `Linking.openURL(authorAttributions[0].uri)`.
   - If `authorAttributions.length === 0`, hide the overlay entirely on that photo (no "© Google" fallback — Google's ToS doesn't require generic attribution).
   - Photo URLs fetched via `discover-photo-urls` Edge Function on sheet open (not pre-fetched in search response).
   - Hidden if no photos.

### Save behavior

- Discover does **not** call the `add-place` Edge Function directly in v1.
- Tapping **Save** opens the existing Add place save screen with the discovered place prefilled, e.g. `router.push({ pathname: '/(tabs)/add/save', params: { placeId, name, address, latitude, longitude, googleCategory, source: 'discover' } })`.
- The Add flow remains the only place where the user confirms the target map, tags, note, and visited status. This keeps Discover as the finding surface and Add as the curation surface.
- Add must skip its usual place-search/details lookup step for Discover-originated saves. Discover already has the required place ID, name, address, latitude, longitude, and category/type data, so the Add save screen should render directly with those values.
- If required save data is missing from the Discover handoff, show an inline error and offer to return to Discover; do not perform a second Google lookup as a hidden fallback in v1.
- Freemium 20-place limit remains enforced server-side by the existing `add-place` Edge Function when the Add flow submits.
- **Button states** (computed from `useMapPlaces` data for the active map):
  - `activeMapId == null` → **disabled** (defensive; shouldn't occur in normal flow).
  - `useMapPlaces.isLoading` → **disabled** with loading style.
  - `useMapPlaces.isError` → **enabled** (fall back; Edge Function is conflict authority).
  - Place already in active map → **"Already saved"** state; tapping can optionally deep-link to the existing saved place in Places.
  - Otherwise → **"Save"** active.
- On successful handoff to Add, dismiss the Discover sheet and navigate to Add. Save success, freemium limit errors, tag validation, and note/visited handling stay owned by the existing Add flow.
- Add flow should accept `source: 'discover'` so analytics can distinguish Discover-originated saves from normal Add searches.

### Place dedup scope
"Already saved" is **scoped to the active map only**. The same Google place can be saved to multiple maps the user owns.

---

## TypeScript types

**Add to `types/index.ts`:**

```typescript
export interface DiscoverPhoto {
  name: string;                       // Google photo resource name
  authorAttributions: Array<{
    displayName: string;
    uri: string | null;
    photoUri: string | null;
  }>;
}

export interface DiscoverPlace {
  id: string;                          // Google place ID
  name: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
  rating: number | null;
  userRatingCount: number | null;
  priceLevel: string | null;           // PRICE_LEVEL_*
  primaryType: string | null;
  isOpen: boolean | null;              // from currentOpeningHours.openNow
  nextTransition: {                    // computed from periods
    type: 'opens' | 'closes';
    time: string;                      // "HH:mm" in place-local time
  } | null;
  photos: DiscoverPhoto[];             // names + attributions; URLs fetched lazily
}
```

Discover-to-Add handoff passes the existing fields needed by `add-place`: `id` as `googlePlaceId`, `name`, `formattedAddress`, `latitude`, `longitude`, and `primaryType`/first `types` value as `googleCategory`.

---

## Hook: `useDiscoverSearch`

**Path:** `hooks/use-discover-search.ts`

```typescript
function useDiscoverSearch() {
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const { location } = useLocation();
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  // Round to 0.01° (~1km grid) for cache-friendliness
  const lat = location ? Math.round(location.latitude * 100) / 100 : null;
  const lng = location ? Math.round(location.longitude * 100) / 100 : null;

  const query = useQuery({
    queryKey: ['discover', currentQuery, lat, lng, timeZone],
    queryFn: () => searchPlacesText(currentQuery!, {
      location: location ?? undefined,
      timeZone,
    }),
    enabled: !!currentQuery,
    // 5-min staleTime inherits from the global default; same query+rounded-location
    // within 5 min is a cache hit and does NOT decrement the trial counter
  });

  return {
    results: query.data ?? [],
    isLoading: query.isFetching,
    error: query.error as Error | null,
    search: setCurrentQuery,
    clear: () => setCurrentQuery(null),
    currentQuery,
  };
}
```

- `searchPlacesText` lives in `lib/google-places.ts` but is now a thin wrapper around `supabase.functions.invoke('discover-search', ...)` — no direct Google call from the client.
- TanStack Query handles in-flight cancellation when the queryKey changes.

---

## "Untagged" filter (Places tab scope creep)

Discover-originated saves pass through the existing Add flow, where users can add tags before saving. Users can still intentionally save without tags, so the untagged filter remains useful as a cleanup and retrieval tool.

**Change:**
- Add an **"Untagged"** chip to `components/filter-sheet/...` for the Places tab.
- Modify `hooks/use-map-places.ts` to support an `untagged: true` filter — returns `map_places` rows with no associated `map_place_tags` rows (left-join on `map_place_tags` filtered to `null`).
- i18n: add `filters.untagged` to both locales.

---

## Brand asset

- **File:** `assets/svg/mapvault-logo.svg` (user provides).
- Optimized for 20-28px display; no hairline strokes that vanish at small sizes.
- Setup option A (preferred): add `react-native-svg-transformer` to `metro.config.js`; import as a component (`import Logo from '@/assets/svg/mapvault-logo.svg'`).
- Setup option B (no new dep): paste the SVG path into a hand-written component at `components/icons/mapvault-logo.tsx`.

---

## i18n

**New `discover` namespace** — add to both `locales/en.json` and `locales/es.json`:

```json
"discover": {
  "searchPlaceholder": "I'm looking for...",
  "searchHint": "e.g. best coffee shop near me",
  "save": "Save",
  "alreadySaved": "Already saved",
  "directions": "Directions",
  "open": "Open",
  "closed": "Closed",
  "closes": "Closes {{time}}",
  "opens": "Opens {{time}}",
  "reviews": "{{count}} reviews",
  "noResults": "No results for \"{{query}}\". Try a different search.",
  "errorSearch": "Search failed. Please try again.",
  "errorSave": "Could not save place. Please try again.",
  "errorLimit": "You've reached the free plan limit. Upgrade to save more places.",
  "monthlyCap": "You've used your Discover searches for this month. Come back next month.",
  "unavailable": "Discover is temporarily unavailable. Please try again later."
}
```

And add `filters.untagged: "Untagged"` to the existing `filters` namespace.

---

## Analytics

New identified events via `track()` from `lib/analytics.ts`. Search instrumentation is **split into two events** because TanStack Query's cache-hit path short-circuits `queryFn` — there's no single moment that captures both "user intended a search" and "we got a result." Splitting also lets us measure incomplete searches (intent without completion) as a failure signal.

Do **not** attach raw search query text to identified client analytics events. Query text may reveal sensitive intent, so user-linked events should measure behavior without storing the actual query.

| Event | Properties | Fires when |
|-------|-----------|------------|
| `discover_search_submitted` | `query_length: number`, `has_location_bias: boolean`, `language_code: 'en' \| 'es'` | Inside the hook's `search(q)` setter. Always fires — captures intent regardless of cache. |
| `discover_search_completed` | `result_count: number`, `from_cache: boolean`, `latency_ms: number`, `has_location_bias: boolean`, `language_code: 'en' \| 'es'` | In a `useEffect` watching `query.dataUpdatedAt`. `from_cache` is `true` if `dataUpdatedAt` matches a ref-tracked baseline (i.e., the data wasn't refreshed by this submission). `latency_ms` is 0 on cache hits. |
| `discover_result_tapped` | `rating: number \| null`, `has_photos: boolean`, `primary_type: string \| null` | Marker tap. Do not include `place_name`, `place_id`, address, or coordinates in identified analytics. |
| `discover_save_started` | `rating: number \| null`, `has_photos: boolean`, `primary_type: string \| null` | User taps Save in the Discover sheet and is routed into Add. Do not include `place_name`, `place_id`, address, or coordinates in identified analytics. |
| `discover_place_saved` | `map_id: string`, `source: 'discover'`, `rating: number \| null`, `primary_type: string \| null` | Save success from the Add flow with `source: 'discover'`. Do not include `place_name`, `place_id`, address, or coordinates in identified analytics. |
| `discover_directions_tapped` | `rating: number \| null`, `primary_type: string \| null` | Directions button tap. Do not include `place_name`, `place_id`, address, or coordinates in identified analytics. |
| `discover_cleared` | — | User taps ✕ on the pill. |
| `discover_trial_exhausted` | — | Edge Function returns 402 for a free user. |
| `discover_paywall_shown` | `trigger: 'trial_exhausted' \| 'save_limit'` | Paywall mounts via Discover trigger. |
| `discover_monthly_cap_hit` | — | Edge Function returns 429 for a premium user. |

### Anonymous query analytics
Raw query text may be useful for product insight, but it must not be tied to a MapVault user identity in v1.

If raw query analytics are shipped:
- Emit them server-side from `discover-search`, not from the client.
- Do not include `user_id`, `map_id`, `profile_id`, PostHog identified `distinct_id`, device ID, email, or precise lat/lng.
- Use an anonymous per-event `distinct_id` such as `crypto.randomUUID()` or a short-lived batch ID that cannot be joined back to a user.
- Include only `query`, `query_length`, `language_code`, `has_location_bias`, coarse region if needed, `result_count`, `success`, and latency bucket.
- Set a short retention expectation for raw query text and document it in the privacy policy before ship.
- Do not use this anonymous query stream for user-level funnels. User-level funnels should rely on the identified events above, which omit raw query text.

Before ship:
- Update privacy policy to disclose Discover query processing and any anonymous query analytics.
- Update iOS App Store privacy nutrition labels if raw query text is collected, even anonymously.
- Confirm account deletion handles identified Discover analytics. Anonymous aggregate query events are not user-deletable because they are intentionally not linked to the user.

### Success metrics (day-1 tracking)
1. **Daily Google Places API spend ($)** — via GCP billing console + daily budget alert.
2. **Free → paid conversion attributed to Discover paywall** — funnel: `discover_paywall_shown` (trigger=`trial_exhausted`) → paid subscription within 30 days.
3. **Save rate per Discover session** — `discover_place_saved` / `discover_search_submitted` per session.

---

## Rollout & kill switch

### Kill switch
- **PostHog feature flag:** `discover_enabled` (boolean).
- Client checks on Discover tab render: if `false`, tab is hidden from `(tabs)/_layout.tsx`.
- Deep-link into Discover when flag is off: redirect to a `t('discover.unavailable')` screen.
- `lib/feature-flags.ts` gets a thin PostHog-flag wrapper (read-only on client).
- Server-side enforcement is also required. `discover-search` and `discover-photo-urls` must check a server-controlled kill switch before making any Google API calls. If disabled, return `503 DISCOVER_DISABLED`.
- Client flags are for UX. Server flags are for cost and abuse protection, because an authenticated user can still call an Edge Function directly with a valid JWT even if the tab is hidden.

#### Flag loading behavior

PostHog caches feature flag values to AsyncStorage automatically. The wrapper exposes three states for the tab layout to render against:

```ts
function useDiscoverEnabled(): { state: 'loading' | 'resolved'; enabled: boolean } {
  // 'resolved' means the flag is known (either from local cache or fresh server fetch).
  // 'loading' fires only on first install before flags have ever been fetched.
}
```

Two cases:

- **Returning user (>99% of launches).** PostHog's local cache is read synchronously during render. `state = 'resolved'` immediately. Tab shows/hides with no flicker. If the server-side flag value has since changed, it updates within ~500ms on next refresh — rare enough not to matter.
- **First install (once per device).** No cached flags exist. `state = 'loading'` until PostHog completes its first fetch (typically <1s, gated behind the existing auth/identify flow). `(tabs)/_layout.tsx` renders a splash/skeleton in the tab strip area during this window — does NOT render the tab list with Discover missing-then-appearing.

Detect first-install state via an AsyncStorage sentinel set on first successful flag resolution (e.g., `posthog_flags_resolved_once: true`). On subsequent launches that sentinel exists, so the cached flag is trusted synchronously.

If PostHog flag fetch fails entirely on first install (network down), treat as `enabled: false` after a 3s timeout. Fail-closed for safety.

### Rollout
- **Week 1: internal-only.** PostHog flag targets specific `distinct_id`s (Patrick + invited testers). General premium users do NOT see the tab.
- **Week 2+: enable for all premium users** by changing the PostHog flag's targeting rule.
- Free users (with the 5-search trial) are enabled at the same time as premium broad rollout — they share the same flag.

### Kill criteria
- Daily API spend exceeds the GCP budget alert threshold without explanation.
- Discover-related crash rate via Sentry > 1% of sessions.
- Premium monthly-cap complaints exceed a manual support threshold.

---

## File structure

```
app/(tabs)/
  _layout.tsx                          ← MODIFY: reorder tabs, set initialRouteName="places"
  explore/  → places/                  ← RENAME directory; update references
  places/index.tsx                     ← MODIFY: support "Untagged" filter
  add/save.tsx                         ← MODIFY: accept `source=discover` and emit Discover-origin save analytics
  discover/
    _layout.tsx                        ← NEW: minimal stack layout
    index.tsx                          ← NEW: Discover screen (state machine)

assets/svg/
  mapvault-logo.svg                    ← NEW (user provides)

components/
  discover-markers/
    discover-markers.tsx               ← NEW: 3-bucket Google Maps markers
  discover-place-sheet/
    discover-place-sheet.tsx           ← NEW: detail sheet
  filter-sheet/
    ...                                ← MODIFY: add "Untagged" chip
  icons/
    mapvault-logo.tsx                  ← NEW (alternative to SVG transformer)

hooks/
  use-discover-search.ts               ← NEW
  use-map-places.ts                    ← MODIFY: support `untagged` filter

lib/
  google-places.ts                     ← MODIFY: searchPlacesText now invokes Edge Function
  directions.ts                        ← (follow-up: http:// → https:// fix)
  analytics.ts                         ← MODIFY: new event types
  feature-flags.ts                     ← MODIFY: discover_enabled wrapper

app.config.ts                          ← MODIFY: add Google Maps SDK keys/config plugin for chosen RN Google Maps library
supabase/
  migrations/
    <ts>_add_discover_usage_tracking.sql   ← NEW
  functions/
    discover-search/index.ts           ← NEW: Text Search proxy + trial counter + monthly usage ledger
    discover-photo-urls/index.ts       ← NEW: photo URL resolver

types/
  index.ts                             ← MODIFY: DiscoverPlace, DiscoverPhoto

metro.config.js                        ← MODIFY (if SVG transformer chosen)
package.json                           ← MODIFY: add React Native Google Maps library; add react-native-svg-transformer if SVG transformer chosen
locales/en.json                        ← MODIFY: discover + filters.untagged
locales/es.json                        ← MODIFY: mirror
docs/prd.md                            ← MODIFY: reframe "not a discovery engine"
```

### Native/config dependencies

- Add a Google Maps React Native integration compatible with Expo SDK 54 and EAS dev clients. Candidate: `react-native-maps`, pending tech-lead validation.
- Add required Google Maps SDK API keys to EAS environment variables and read them statically in `app.config.ts`.
- Restrict Maps SDK keys by iOS bundle identifier and Android package name for all variants (`development`, `preview`, `production`).
- Keep the existing Google Places API key server-side for `discover-search` and `discover-photo-urls`; do not expose unrestricted Places keys in the client bundle.
- Confirm whether the current Google Places autocomplete/details keys used by the Add flow can remain as-is or should be separated from the new Maps SDK keys.

---

## Known debt

Explicitly accepted gaps. Track for follow-up.

1. **Accessibility.** No accessibility labels/roles, no reduce-motion handling, no VoiceOver focus management, marker hit targets <44pt. Revisit before scaling user base or hitting App Store accessibility review.
2. **`lib/directions.ts`** uses `http://maps.apple.com/...` — should be `https://`. Non-blocking; fix on next pass through that file.
3. **"Untagged" filter** is technically scope creep (touches Places tab) but is useful for Discover-originated saves when users intentionally skip tags in the Add flow.
4. **No retry-with-backoff** on Edge Function calls — users retry manually by tapping send again.
5. **`regionCode` not passed** to Google Text Search. Acceptable for v1; revisit if international result quality is poor.
6. **Location denied/default city behavior.** Do not block search when location is denied. Instead, allow the user to search with explicit geography in the query ("coffee in Paris") and show a non-blocking prompt to enable location for better nearby results. If the map uses Madrid as a display fallback, do not send Madrid as `locationBias` unless the user is actually there.
7. **Two map providers.** Discover now introduces Google Maps while Places stays on Mapbox. This avoids the Google Places-on-Mapbox compliance problem but adds native setup, API-key, visual consistency, and QA complexity.
8. **Google attribution/compliance details.** The core map-provider decision is resolved by using Google Maps for Discover, but implementation still needs to preserve Google Maps attribution/logo visibility, photo attribution, and any applicable European search-result disclosure requirements.

---

## Verification

### Static checks
- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run check:i18n` — clean
- EAS/dev-client build succeeds on iOS and Android after adding the Google Maps native dependency/config.

### Manual test flow (premium internal account)
- [ ] Open app → lands on Places tab (not Discover).
- [ ] Discover tab visible as leftmost tab → tap it.
- [ ] Empty state: Google Map centered on location, pill at top with MapVault logo + "I'm looking for...", no arrow.
- [ ] Google Maps logo/attribution is visible and not covered by the search pill, tab bar, overlays, or safe area.
- [ ] Tap pill → overlay animates input to center, keyboard opens, send arrow fades in, hint visible.
- [ ] Type "best coffee shop in Lavapiés" → tap send → spinner → overlay dismisses → 20 markers fit on map → pill shows query + ✕.
- [ ] Tap a marker → marker enlarges → detail sheet opens with name, stars+rating+count, "Cafe · $$", "Open · Closes 22:00", Directions, Save, 3-photo carousel with attribution overlays.
- [ ] Tap photo attribution → opens browser to author URI.
- [ ] Tap Directions → iOS picker if multiple nav apps, else opens Apple Maps directly.
- [ ] Tap Save → Discover sheet dismisses → Add save screen opens with place prefilled.
- [ ] Complete Add flow with tags/note/visited as desired → place saves successfully.
- [ ] Return to Discover → saved place shows "Already saved" for the active map.
- [ ] Open Places tab → place appears.
- [ ] Tap "Untagged" filter chip → newly saved place is in the result.
- [ ] Return to Discover → tap ✕ on pill → returns to empty state, markers removed.

### Edge cases
- [ ] Location permission denied → map may show a fallback center, search still works without sending fallback coordinates as `locationBias`, and the UI shows a non-blocking prompt to enable location for better nearby results.
- [ ] Google Map fails to load or Maps SDK key is invalid → Discover shows a clear unavailable/error state and does not attempt to render Places markers on the Mapbox Places map.
- [ ] Google returns 0 results → overlay dismisses, banner shows "No results for '...'", pill keeps query.
- [ ] Network error during search → overlay stays, inline error, send arrow restored, retry works.
- [ ] Place has no photos → carousel hidden.
- [ ] Place has no rating → rating row hidden, marker shows "—".
- [ ] Place has no hours data → status row hidden.
- [ ] activeMapId == null → Save button disabled.
- [ ] useMapPlaces still loading on sheet open → Save button disabled with loading style.

### Freemium / cost / rollout
- [ ] **Trial counter:** new free account → 5 searches → 6th attempt → paywall trigger fires; `profiles.discover_searches_used = 5`.
- [ ] **Premium monthly cap:** insert 100 successful premium `discover_search_events` rows for the current local month → confirm soft-cap message renders on the next search.
- [ ] **Admin grant:** raise `discover_searches_granted` to 10 manually → confirm trial counter respects the new ceiling.
- [ ] **Kill switch:** toggle PostHog `discover_enabled` off → confirm Discover tab disappears + deep-link shows fallback.
- [ ] **Server kill switch:** disable the server-side Discover flag → direct calls to `discover-search` and `discover-photo-urls` return `503 DISCOVER_DISABLED` before any Google API request.
- [ ] **Internal-only:** non-internal test account during week 1 should NOT see the Discover tab.
- [ ] **Cache:** repeat same search within 5 min → confirm no `discover-search` Edge Function invocation in Supabase logs, counter unchanged.
- [ ] **GCP budget alert:** simulate elevated daily spend → confirm GCP alert email arrives at configured threshold.

### Locale
- [ ] Switch device to Spanish → Google results come back in Spanish (verify `languageCode: 'es'` in Edge Function logs).
- [ ] Spanish strings render correctly for all new i18n keys.
- [ ] Time always renders as 24h regardless of locale (e.g. "Closes 22:00", never "10:00 PM").
- [ ] Price always renders as `$` symbols regardless of locale.

### Compliance
- [ ] Privacy policy updated with query-collection disclosure before release.
- [ ] iOS App Store privacy nutrition labels updated on next submission based on final analytics design. If raw query text is only collected anonymously, confirm whether it is disclosed as not linked to identity.
- [ ] Account deletion → confirm PostHog data for that distinct_id is purged.
- [ ] Google Maps logo/attribution visible on Discover map in empty, overlay, results, and detail-sheet states.
- [ ] Confirm no Google Places results are shown on the Mapbox Places map.
- [ ] Confirm any applicable Google/EEA search-result disclosure requirements for Places Text Search are satisfied.
- [ ] Photo attribution `displayName` visible on every photo; tap opens author URI.
