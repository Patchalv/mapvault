# PRD: Discover Feature

**Status:** Ready for implementation
**Date:** 2026-05-16
**Author:** Design session with Patrick Alvarez
**Revision:** v2 — post-review decisions baked in

---

## Context

MapVault currently lets users save and browse their own recommended places. The main product PRD has historically positioned the app as "NOT a discovery engine" — every place was deliberately saved by you or someone you shared a map with.

**Discover is a deliberate pivot from that line.** It introduces exploratory, natural-language place search powered by the Google Places Text Search API, and it ships as a **premium-tier feature**. Free users get a 5-search lifetime trial as an upgrade hook; premium users get unlimited (subject to a daily cap to bound API cost). This expands MapVault's value prop and gives premium a second hook beyond the existing 20-place save cap.

**Action items outside this PRD:**
- Update `docs/prd.md` to reframe "not a discovery engine" → "discovery is premium; the free tier is curation-only."
- Marketing copy and website to follow.

---

## Goals

- Surface a city in natural language ("best cocktail bars in Malasaña", "coffee near Reina Sofía") and show ranked results on a map.
- Make Discover the **primary upgrade hook** for non-paying users: 5 lifetime free searches, then paywall.
- Bound API spend so the feature is economically defensible at $9.99/year pricing.
- One-tap save to the active map; no tags/notes required (we surface untagged saves via a new filter on the Places tab).

## Out of Scope (v1)

- "Search this area" re-query when the user pans the map
- Filter chips (Open Now, Top Rated, price, category) on the result set
- Photo carousel full-screen / pinch zoom
- Saving with tags, notes, or visited status from Discover (added later from Places tab)
- Card tray / scrollable result list
- Community data (places from other MapVault users)
- Grayscale map effect behind the search overlay
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

### Premium tier
- **Unlimited searches**, soft-capped at **50/day** with a friendly "you're searching a lot — come back tomorrow" screen.
- "Per day" semantics depend on the storage approach picked below — see open question.

### Free-tier trial counter schema
Add to `profiles`:
```sql
alter table profiles
  add column discover_searches_used     integer not null default 0,
  add column discover_searches_granted  integer not null default 5;
```
- Decremented server-side only (Edge Function below); never trusted from the client.
- Admin tooling raises `discover_searches_granted`. `discover_searches_used` is monotonic and only reset manually if ever.
- RLS: read-only to the user; write only via `security definer` Edge Function path.

### Daily cap storage — open question for tech lead

The 50/day premium cap needs durable per-user usage tracking. Two reasonable shapes; the tech lead decides at implementation time based on what fits the broader Postgres conventions in the project.

**Option A — Two columns on `profiles`:**
```sql
alter table profiles
  add column discover_searches_today      integer not null default 0,
  add column discover_searches_today_date date    not null default current_date;
```
- **Pros:** No new table. Constant-time read on every Discover call. Single-row update per search. Simplest mental model.
- **Cons:**
  - "Today" is timezone-dependent. UTC means a US user searching at 7pm and 9pm Tuesday counts as Tuesday for 7pm but Wednesday for 9pm. Either pick a timezone artifact or fix.
  - Read-modify-write atomicity: must use single-statement `UPDATE ... SET used = CASE WHEN today_date = current_date THEN used + 1 ELSE 1 END, today_date = current_date` or a transaction. Two concurrent searches can race otherwise.
  - No historical data inside Postgres. Can't answer "how many searches this month" without PostHog.

**Option B — New `discover_search_events` table:**
```sql
create table discover_search_events (
  id          bigserial primary key,
  user_id     uuid not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  source      text not null check (source in ('free','premium'))
);
create index discover_search_events_user_recent_idx
  on discover_search_events (user_id, created_at desc);
```
- Daily cap check: `SELECT count(*) FROM discover_search_events WHERE user_id = $1 AND created_at > now() - interval '24 hours'`.
- **Pros:** Rolling 24h cap is native and timezone-free. Concurrency is trivial (just INSERT). Full history available for attribution when GCP spend spikes.
- **Cons:** Grows unbounded — needs a `pg_cron` prune (e.g., delete rows > 90 days). One new table, RLS policy, optional prune cron.

Both options are workable. Decision should be made with the rest of the schema in mind (does `pg_cron` already run other prune jobs? Are there other rolling-window features planned?).

### Photo cap
- Carousel shows **max 3 photos per place** regardless of how many Google returns.

### Cost alerting
- **Google Cloud daily $-budget alert** (single GCP alert). No app-side spend duplication for v1.

### Pricing note
At $9.99/year, the API margin is thin. If Discover usage exceeds ~20 searches/user/month, revisit pricing or introduce a "Discover Pro" tier.

---

## Edge Function backend

### `discover-search`
**Path:** `supabase/functions/discover-search/index.ts`

**Purpose:** the only path through which Google Places Text Search is called. Hosts the trial counter, daily cap, and feature flag check. Keeps the Google API key out of the binary.

**Request body:**
```json
{
  "query": "<user query, truncated to 200 chars>",
  "locationBias": { "latitude": 40.4168, "longitude": -3.7038 },  // optional; omitted if user denied location
  "languageCode": "en" | "es"
}
```
`locationBias` is optional — when the user has denied location permission, omit it and let Google rank without geographic bias.

**Flow:**
1. Validate auth (`auth.getUser()`).
2. Check user entitlement. If free:
   - Reject with `402 DISCOVER_TRIAL_EXHAUSTED` if `discover_searches_used >= discover_searches_granted`.
   - Otherwise increment `discover_searches_used` atomically.
3. If premium:
   - Reject with `429 DISCOVER_DAILY_CAP` if usage in the last day ≥ 50. The "last day" computation depends on the storage shape chosen in the open question above (rolling-24h vs calendar-day-in-some-timezone).
4. Call `POST https://places.googleapis.com/v1/places:searchText` with the field mask below.
5. Map response to `DiscoverPlace[]`, return.

**Field mask (X-Goog-FieldMask):**
```
places.id,places.displayName,places.formattedAddress,places.location,
places.rating,places.userRatingCount,places.priceLevel,places.primaryType,
places.types,places.currentOpeningHours,places.utcOffsetMinutes,
places.photos
```
`places.photos` returns the full Photo object including `authorAttributions` — no need to enumerate subfields.

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
**New file:** `supabase/migrations/<timestamp>_add_discover_search_counter.sql`
- Adds the two columns above.
- RLS: user can `select` own row including the new columns; only the Edge Function (service role) can `update` them.

---

## Screen: Discover (`app/(tabs)/discover/index.tsx`)

Three visual states.

### State 1 — Empty (default)

- Full-screen Mapbox map centered on user's current location (reuse `useLocation()`).
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
- Map zooms/pans to fit all result markers (`Camera` with `bounds` prop).
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
| **Daily cap (premium)** | Edge Function returns `429` | Same dismiss sequence as above, then show `t('discover.dailyCap')` as an inline banner on the map (not a separate modal). |

---

## Markers

**New component:** `components/discover-markers/discover-markers.tsx`. Do not reuse `MapMarkers`.

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

Built on `Mapbox.MarkerView` for parity with the existing Places tab. Manual perf spot-check during impl: 20 markers on a low-end Android. If FPS drops below ~50, refactor to `ShapeSource` + `SymbolLayer`.

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
   - **Save to map** — see Save Behavior below.
6. **Photo carousel** — horizontal `FlatList`, `pagingEnabled`, ~200px height, no pagination dots in v1.
   - Max **3 photos** per place even if Google returns more.
   - Each photo has a **bottom-left attribution overlay**: small white text on translucent dark gradient showing `authorAttributions[].displayName`. Tap → `Linking.openURL(authorAttributions[0].uri)`.
   - If `authorAttributions.length === 0`, hide the overlay entirely on that photo (no "© Google" fallback — Google's ToS doesn't require generic attribution).
   - Photo URLs fetched via `discover-photo-urls` Edge Function on sheet open (not pre-fetched in search response).
   - Hidden if no photos.

### Save behavior

- Calls the existing `add-place` Edge Function with the active map ID, no tags, no note, `visited: false`.
- Freemium 20-place limit is enforced server-side automatically.
- **Button states** (computed from `useMapPlaces` data for the active map):
  - `activeMapId == null` → **disabled** (defensive; shouldn't occur in normal flow).
  - `useMapPlaces.isLoading` → **disabled** with loading style.
  - `useMapPlaces.isError` → **enabled** (fall back; Edge Function is conflict authority).
  - Place already in active map → **"Already saved"** state, no Edge Function call.
  - Otherwise → **"Save to map"** active.
- On success: `react-native-toast-message` shows `t('discover.savedSuccess')`. Button transitions to "Already saved". **Invalidate `['map-places', activeMapId]`** so reopening the sheet (or returning to the Places tab) reflects the freshly saved state instead of stale `useMapPlaces` data.
- On `FREEMIUM_LIMIT_EXCEEDED` (403): inline error + `t('discover.errorLimit')` linking to paywall.
- On other error: inline error + `t('discover.errorSave')`.

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

---

## Hook: `useDiscoverSearch`

**Path:** `hooks/use-discover-search.ts`

```typescript
function useDiscoverSearch() {
  const [currentQuery, setCurrentQuery] = useState<string | null>(null);
  const { location } = useLocation();

  // Round to 0.01° (~1km grid) for cache-friendliness
  const lat = location ? Math.round(location.latitude * 100) / 100 : null;
  const lng = location ? Math.round(location.longitude * 100) / 100 : null;

  const query = useQuery({
    queryKey: ['discover', currentQuery, lat, lng],
    queryFn: () => searchPlacesText(currentQuery!, location ?? undefined),
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

Discover saves create places with no tags. Without a way to find them, users who tag-filter heavily will "lose" their Discover saves.

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
  "saveToMap": "Save to map",
  "alreadySaved": "Already saved",
  "directions": "Directions",
  "open": "Open",
  "closed": "Closed",
  "closes": "Closes {{time}}",
  "opens": "Opens {{time}}",
  "reviews": "{{count}} reviews",
  "savedSuccess": "Place saved to map",
  "noResults": "No results for \"{{query}}\". Try a different search.",
  "errorSearch": "Search failed. Please try again.",
  "errorSave": "Could not save place. Please try again.",
  "errorLimit": "You've reached the free plan limit. Upgrade to save more places.",
  "dailyCap": "You're searching a lot today. Come back tomorrow.",
  "unavailable": "Discover is temporarily unavailable. Please try again later."
}
```

And add `filters.untagged: "Untagged"` to the existing `filters` namespace.

---

## Analytics

New events via `track()` from `lib/analytics.ts`. Search instrumentation is **split into two events** because TanStack Query's cache-hit path short-circuits `queryFn` — there's no single moment that captures both "user intended a search" and "we got a result." Splitting also lets us measure incomplete searches (intent without completion) as a failure signal.

| Event | Properties | Fires when |
|-------|-----------|------------|
| `discover_search_submitted` | `query: string` (raw, truncated to 200) | Inside the hook's `search(q)` setter. Always fires — captures intent regardless of cache. |
| `discover_search_completed` | `query: string`, `result_count: number`, `from_cache: boolean`, `latency_ms: number` | In a `useEffect` watching `query.dataUpdatedAt`. `from_cache` is `true` if `dataUpdatedAt` matches a ref-tracked baseline (i.e., the data wasn't refreshed by this submission). `latency_ms` is 0 on cache hits. |
| `discover_result_tapped` | `place_name: string`, `rating: number \| null`, `place_id: string` | Marker tap. |
| `discover_place_saved` | `place_name: string`, `map_id: string`, `place_id: string` | Save success from the sheet. |
| `discover_directions_tapped` | `place_name: string`, `place_id: string` | Directions button tap. |
| `discover_cleared` | — | User taps ✕ on the pill. |
| `discover_trial_exhausted` | — | Edge Function returns 402 for a free user. |
| `discover_paywall_shown` | `trigger: 'trial_exhausted' \| 'save_limit'` | Paywall mounts via Discover trigger. |
| `discover_daily_cap_hit` | — | Edge Function returns 429 for a premium user. |

### PII / compliance
The raw query is shipped to PostHog for product insight. Before ship:
- Update privacy policy to disclose query collection.
- Update iOS App Store privacy nutrition labels (Search History / User Content → linked to identity).
- Confirm PostHog deletion is wired into the account-deletion flow.

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
- Premium daily-cap complaints exceed a manual support threshold.

---

## File structure

```
app/(tabs)/
  _layout.tsx                          ← MODIFY: reorder tabs, set initialRouteName="places"
  explore/  → places/                  ← RENAME directory; update references
  places/index.tsx                     ← MODIFY: support "Untagged" filter
  discover/
    _layout.tsx                        ← NEW: minimal stack layout
    index.tsx                          ← NEW: Discover screen (state machine)

assets/svg/
  mapvault-logo.svg                    ← NEW (user provides)

components/
  discover-markers/
    discover-markers.tsx               ← NEW: 3-bucket Mapbox markers
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

supabase/
  migrations/
    <ts>_add_discover_search_counter.sql   ← NEW
  functions/
    discover-search/index.ts           ← NEW: Text Search proxy + trial counter
    discover-photo-urls/index.ts       ← NEW: photo URL resolver

types/
  index.ts                             ← MODIFY: DiscoverPlace, DiscoverPhoto

metro.config.js                        ← MODIFY (if SVG transformer chosen)
package.json                           ← MODIFY: react-native-svg-transformer, react-native-toast-message
locales/en.json                        ← MODIFY: discover + filters.untagged
locales/es.json                        ← MODIFY: mirror
docs/prd.md                            ← MODIFY: reframe "not a discovery engine"
```

---

## Known debt

Explicitly accepted gaps. Track for follow-up.

1. **Accessibility.** No accessibility labels/roles, no reduce-motion handling, no VoiceOver focus management, marker hit targets <44pt. Revisit before scaling user base or hitting App Store accessibility review.
2. **`lib/directions.ts`** uses `http://maps.apple.com/...` — should be `https://`. Non-blocking; fix on next pass through that file.
3. **"Untagged" filter** is technically scope creep (touches Places tab) but is required to keep Discover-saved places discoverable.
4. **No retry-with-backoff** on Edge Function calls — users retry manually by tapping send again.
5. **`regionCode` not passed** to Google Text Search. Acceptable for v1; revisit if international result ranking is poor.
6. **Madrid hardcoded fallback** when location permission is denied (inherited from existing `useLocation()` / Explore behavior). Discover is the most location-sensitive surface, so this is now a more visible bug for any non-Spanish-market user. Track for a separate fix — either device-locale-aware fallback or a "Set your default city" preference.

---

## Verification

### Static checks
- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run check:i18n` — clean

### Manual test flow (premium internal account)
- [ ] Open app → lands on Places tab (not Discover).
- [ ] Discover tab visible as leftmost tab → tap it.
- [ ] Empty state: map centered on location, pill at top with MapVault logo + "I'm looking for...", no arrow.
- [ ] Tap pill → overlay animates input to center, keyboard opens, send arrow fades in, hint visible.
- [ ] Type "best coffee shop in Lavapiés" → tap send → spinner → overlay dismisses → 20 markers fit on map → pill shows query + ✕.
- [ ] Tap a marker → marker enlarges → detail sheet opens with name, stars+rating+count, "Cafe · $$", "Open · Closes 22:00", Directions, Save to map, 3-photo carousel with attribution overlays.
- [ ] Tap photo attribution → opens browser to author URI.
- [ ] Tap Directions → iOS picker if multiple nav apps, else opens Apple Maps directly.
- [ ] Tap Save to map → toast "Place saved to map" → button updates to "Already saved".
- [ ] Tap Save again → no Edge Function call (button is in already-saved state).
- [ ] Open Places tab → place appears.
- [ ] Tap "Untagged" filter chip → newly saved place is in the result.
- [ ] Return to Discover → tap ✕ on pill → returns to empty state, markers removed.

### Edge cases
- [ ] Location permission denied → map shows Madrid default; search still works without location bias.
- [ ] Google returns 0 results → overlay dismisses, banner shows "No results for '...'", pill keeps query.
- [ ] Network error during search → overlay stays, inline error, send arrow restored, retry works.
- [ ] Place has no photos → carousel hidden.
- [ ] Place has no rating → rating row hidden, marker shows "—".
- [ ] Place has no hours data → status row hidden.
- [ ] activeMapId == null → Save button disabled.
- [ ] useMapPlaces still loading on sheet open → Save button disabled with loading style.

### Freemium / cost / rollout
- [ ] **Trial counter:** new free account → 5 searches → 6th attempt → paywall trigger fires; `profiles.discover_searches_used = 5`.
- [ ] **Premium daily cap:** set `discover_searches_used` near 50 (or fake daily counter) → confirm soft-cap message renders.
- [ ] **Admin grant:** raise `discover_searches_granted` to 10 manually → confirm trial counter respects the new ceiling.
- [ ] **Kill switch:** toggle PostHog `discover_enabled` off → confirm Discover tab disappears + deep-link shows fallback.
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
- [ ] iOS App Store privacy nutrition labels updated on next submission (Search History / User Content → linked to identity).
- [ ] Account deletion → confirm PostHog data for that distinct_id is purged.
- [ ] Photo attribution `displayName` visible on every photo; tap opens author URI.
