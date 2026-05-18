# PRD: Discover Feature

**Status:** ✅ Ready for tech-lead review — Maps SDK billing spike passed 2026-05-18
**Date:** 2026-05-16
**Author:** Design session with Patrick Alvarez
**Revision:** v3 — post-PM-review decisions baked in

---

## Pre-conditions for tech-lead review

The PRD is held in **Pending Maps SDK billing spike** status until the spike below passes. This spike must complete *before* tech-lead review begins, because its outcome can invalidate the cost model in §Cost model and the two-map-providers architecture in §Map implementation.

### Maps SDK billing spike

**Goal:** validate that the chosen React Native Google Maps integration bills under the free Maps SDK SKUs, not under any paid map-rendering SKU.

**Procedure:**
1. Create a throwaway GCP project; enable Maps SDK for iOS and Maps SDK for Android; create a restricted API key (per-platform bundle ID).
2. Add `react-native-maps` (default candidate) to a fresh Expo dev client with `provider={PROVIDER_GOOGLE}`. Drop in the test key. Render a map.
3. Build to a physical iOS device and Android device. Open the map 20 times across a 24-hour window. Add 20 markers. Pan / zoom / tap.
4. Check the GCP billing report for the test project under "Maps Platform" → request log.

**Pass criteria:**
- Map renders attributed to **Maps SDK for iOS** and **Maps SDK for Android** SKUs only.
- **Zero** requests attributed to: Maps JavaScript API, Dynamic Maps, Map Tiles API, Street View Static, Cloud-based Maps Styling, Static Maps API, or any other paid map-rendering SKU.
- Marker rendering and camera moves do not trigger any paid side-channel SKU.

**Failure response:**

If the spike fails, Discover is held until one of:
- (a) The integration is reconfigured to use Maps SDK only (e.g., swap library, drop unsupported features).
- (b) The cost model is updated with the actual SKU pricing, and §Pricing review triggers are re-baselined.
- (c) The feature is reframed as Mapbox-on-Discover, and Google Places attribution risk is independently legal-reviewed.

Tech lead may also evaluate `expo-maps` as an alternative library if `react-native-maps` does not pass.

### Spike result — 2026-05-18 ✅ PASSED

**Library tested:** `react-native-maps` v1.20.1 with `provider={PROVIDER_GOOGLE}`, `mapType="standard"`
**Expo SDK:** 54 (Expo Router, local `npx expo run:ios` / `run:android`)
**Test:** Physical iOS device + physical Android device. Map opened repeatedly, 20 markers rendered, camera panned/zoomed.

**GCP traffic (`mapvault-test` project, 2026-05-18):**

| Service | Observed |
|---|---|
| `maps-ios-backend.googleapis.com` | ✅ Yes (Maps SDK for iOS — free tier) |
| `maps-android-backend.googleapis.com` | ✅ Yes (Maps SDK for Android — free tier) |
| Maps JavaScript API | ❌ None |
| Dynamic Maps | ❌ None |
| Map Tiles API | ❌ None |
| Street View Static API | ❌ None |
| Cloud-based Maps Styling | ❌ None |
| Any other paid rendering SKU | ❌ None |

**Conclusion:** All map traffic billed to free-tier Maps SDK for iOS and Maps SDK for Android SKUs. Zero paid rendering charges. `react-native-maps` with `PROVIDER_GOOGLE` is confirmed as the correct library choice for Discover. PRD is unblocked for tech-lead review.

---

## Context

MapVault currently lets users save and browse their own recommended places. The main product PRD has historically positioned the app as "NOT a discovery engine" — every place was deliberately saved by you or someone you shared a map with.

**Discover is a curation-funnel tool: a premium-tier surface for finding places worth saving into curated maps. It is not a discovery destination; it exists to feed the core curation product.** It introduces exploratory, natural-language place search powered by the Google Places Text Search API, displayed on a Google Map in the Discover tab. It ships as a **premium-tier feature**. Free users get a 5-search lifetime trial as an upgrade hook; premium users get up to 100 searches per calendar month. Discover does not replace curation; it gives premium users a faster path *into* their curated maps.

**Map provider decision:** Discover uses Google Maps, not Mapbox, because Google Places API results displayed on a map must be shown on a Google Map with proper attribution. The existing Places tab can continue using Mapbox for saved MapVault places. This means MapVault will have two map surfaces:
- **Discover:** Google Map + Google Places results.
- **Places:** existing Mapbox map + saved MapVault places.

**Evidence basis (v1):** This PRD is a founder-instinct bet, not a research-validated plan. At PRD time (2 premium users, ~1 week post-launch), there is no statistically meaningful demand signal for or against Discover. Specific numbers (5 lifetime trial, 100/month cap, $9.99 price) are first-principles estimates. The first 90 days post-launch are a learning period — the success metrics in §Analytics define what would invalidate the bet.

**Action items outside this PRD:**
- Update `docs/prd.md` to clarify: Discover is a premium-only tool that exists to find places to save into curated maps. The core product remains curation, not discovery.
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
**After:** `Places | Discover | Add | Settings` (4 tabs, in that order)

- **Rename `Explore` → `Places`** (route `app/(tabs)/explore/` → `app/(tabs)/places/`). Behavior unchanged.
- **New `Discover` tab** as the second tab (right of Places). Icon: `Ionicons "compass"`.
- **Default launch tab is Places** — set `initialRouteName="places"` in `app/(tabs)/_layout.tsx`. The current layout does not specify an initial route — Expo Router's default-pick happens to land on Explore today. Explicitly setting Places as the initial route makes the home-tab decision deliberate and prevents accidental tab reorder from changing launch behavior.
- Coherent with the curation-funnel framing in §Context: Places (curation) is home; Discover (funnel) is a tool reached intentionally, not the entry point.
- If the Discover kill-switch flag is off, the Discover tab is hidden entirely (see Kill Switch).

**File to modify:** `app/(tabs)/_layout.tsx`

**Rename ripple — audit before merging:**
Renaming `app/(tabs)/explore/` → `app/(tabs)/places/` has fallout across the codebase. Before merging, grep for and update:
- String literals `'/explore'`, `'(tabs)/explore'`, `'/(tabs)/explore'` (used in `router.push` / `router.replace`).
- Focus parameter conventions (`focusLat`, `focusLng`) currently routed via the Explore screen — confirm they still resolve.
- Analytics event values referring to "explore" (e.g., screen names) — keep these stable if they're already in PostHog dashboards, or migrate intentionally.
- Universal-link / deep-link handlers and any tests that hardcode the path.

**AASA / Universal Links migration order (cross-project — `mapvault-website`):**
The AASA file (`/.well-known/apple-app-site-association`) and Android `assetlinks.json` are served from the `mapvault-website` project, not the app, and cache at Apple's CDN for up to 24 hours. Sequence is critical:

1. Audit `mapvault-website/src/app/.well-known/apple-app-site-association/route.ts` and `assetlinks.json/route.ts` for any `/explore` paths.
2. Update those routes to point to `/places` instead, **and keep `/explore` as a redirected alias for ≥30 days** to handle in-flight links.
3. Deploy `mapvault-website` first; wait 24h for Apple CDN propagation.
4. Submit the app with the renamed routes only after step 3 is verified.

If `/explore` is not currently in the AASA file, only steps 3 and 4 apply. See `docs/universal-links-website.md` for the full universal-link spec.

---

## Freemium gating & cost model

### Free tier
- **5 lifetime Discover searches.** Counter never auto-resets. Admin can grant more manually for support cases.
- **Visible counter (App Store transparency):** the Discover empty state shows "5 free Discover searches to try the feature. Upgrade for 100/month." For free users only, the search pill displays a remaining-count indicator on the right (e.g., "4/5"); the search overlay displays a contextual upgrade line ("You have N remaining searches on the free plan. Upgrade for 100/month."). This reduces Apple review risk and is product-honest.
- 6th attempt → existing paywall (`router.push('/(tabs)/settings/paywall?trigger=discover_limit')`).
- Paywall copy must make the entitlement explicit: free users get 5 total Discover searches to try the feature; premium users get 100 Discover searches per calendar month.
- Per-user rate limits apply (see Premium tier) — at 5 lifetime searches the daily cap is moot, but the per-minute cap closes the script-attack vector.

### Premium tier
- **100 Discover searches per UTC calendar month** with a friendly "you're searching a lot — come back next month" screen once the cap is reached.
- The cap counts rows in `discover_search_events` where `month_utc = to_char(now() at time zone 'utc', 'YYYY-MM')`. UI copy says "100 searches per month, resets on the 1st" — UTC anchoring is an implementation detail not surfaced unless asked. Product copy must not describe Discover as "unlimited."
- **Per-user rate limits (cost / abuse protection):**
  - 10 successful searches per rolling 60-second window.
  - 30 successful searches per rolling 24-hour window.
  - Rejections return `429 DISCOVER_RATE_LIMITED` with a `Retry-After` header pointing at the next minute/day boundary.
  - These are abuse guards, not user-facing entitlements — copy describes them only when triggered.

### Anti-abuse position

The trial counter and monthly cap have known bypass vectors. Stated decisions:

| Vector | Decision | Rationale |
|--------|----------|-----------|
| Uninstall + reinstall with new email | **Accept as known limitation** | Cost bounded by 5-search trial; mitigation would require device fingerprinting or phone-number verification with poor privacy/UX trade-offs. |
| Gmail `+aliases` (`me+1@gmail.com`, etc.) | **Fix at signup** (separate ticket) | Canonicalize email at signup: strip `+...` segment for Gmail domains, lowercase, treat as unique. Closes the easiest scaled-abuse vector. Tracked separately so Discover ships unblocked. |
| iOS Family Sharing | **Accept as deliberate household perk** | Premium entitlement (including Discover) is honored for all members of an iOS Family Sharing group with the purchasing user's subscription. Sales-positive framing. |
| Timezone manipulation to reset monthly cap | **Closed by design** | All cap math uses UTC server-side; the client's device timezone is never sent or trusted (see §Premium tier). |
| Authenticated burst (script + valid JWT) | **Closed by rate limits** | 10/min + 30/day per user (see §Premium tier). |

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
  date_utc    date not null,            -- to_char(now() at time zone 'utc', 'YYYY-MM-DD')::date
  month_utc   text not null,            -- to_char(now() at time zone 'utc', 'YYYY-MM')
  source      text not null check (source in ('free','premium')),
  app_version text                      -- from X-App-Version request header; nullable for older clients
);
create index discover_search_events_user_month_idx
  on discover_search_events (user_id, month_utc, created_at desc);
create index discover_search_events_month_idx
  on discover_search_events (month_utc, created_at desc);
create index discover_search_events_source_month_idx
  on discover_search_events (source, month_utc, user_id);
```

- **UTC anchoring:** `date_utc` and `month_utc` are both computed server-side from `now() at time zone 'utc'`. The client does not send a timezone; cap math is never affected by device timezone (see §Anti-abuse position).
- **`app_version` attribution:** populated from the `X-App-Version` request header (Expo apps send `Constants.expoConfig?.version`). Lets you attribute spend spikes to a specific app release if a regression ships. Nullable to tolerate older clients.
- **Third index** `(source, month_utc, user_id)` covers the reporting query "P95 successful premium searches per user per UTC month." Validate via `EXPLAIN ANALYZE` during implementation; adjust if the planner picks the wrong index.
- Monthly cap check counts successful premium rows for `(user_id, month_utc)`.
- Insert a row only after Google returns a successful Text Search response. Rejected searches, validation failures, auth failures, and client-side cache hits do not consume the MapVault allowance.
- Track free-trial successful searches in this table too (`source = 'free'`) even though `profiles.discover_searches_used` remains the enforcement counter. This keeps launch-month economics visible across free and premium cohorts.
- **Retention:** retain at least 13 months for monthly-cohort reporting. **Pruning trigger:** when `discover_search_events` exceeds 5,000,000 rows OR oldest row is older than 18 months, add a monthly `pg_cron` job to delete rows older than 13 months. Until then, table is unbounded.
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
  add column discover_searches_this_month_key   text    not null default '<YYYY-MM>';
```
- **Pros:** No new table. Constant-time read on every Discover call. Single-row update per search. Simplest mental model.
- **Cons:**
  - Read-modify-write atomicity: must use a single-statement update or a transaction. Two concurrent searches can race otherwise.
  - No historical data inside Postgres. Can't answer "how many searches per user this month" without PostHog.
  - No `app_version` attribution. Same regression-attribution problem the ledger solves.

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
- Loading the Google Map in the Discover tab should not create marginal map-load cost if the chosen React Native integration uses the native Maps SDK SKU. **This is validated via the Maps SDK billing spike** (see §Pre-conditions for tech-lead review). If the spike fails, this entire cost table is invalidated and the failure response there applies.
- A failed Google call (before the reserve-and-refund refund step lands) is refunded against the user counter, but may still create Google API cost depending on where the failure occurs. The per-user rate limit caps this exposure (see §Premium tier).

Illustrative monthly cost per active Discover user:

| Usage pattern | Search cost | Photo cost assumption | Total monthly API cost |
|---------------|-------------|-----------------------|------------------------|
| Light: 5 searches/month, 2 photo sheet opens | $0.18 | $0.04 | $0.22 |
| Expected: 20 searches/month, 5 photo sheet opens | $0.70 | $0.11 | $0.81 |
| Cap max: 100 searches/month, 25 photo sheet opens | $3.50 | $0.53 | $4.03 |
| Cap max with every search opening 3 photos | $3.50 | $2.10 | $5.60 |

Launch-stage free-cap implication: with 2 premium users capped at 100 searches/month and 30 free users each using all 5 lifetime trial searches in the same month, total search volume is only 350 Text Search requests. That stays fully inside Google's 1,000/month free Text Search Enterprise cap. Even if all 350 searches opened 3 photo URLs, that would be 1,050 photo requests, creating only 50 paid photo requests = $0.35.

Business implication: at $9.99/year, Discover is economically viable only if typical premium usage stays low or total usage remains covered by the pooled Google free caps. A premium user who actually uses all 100 searches/month costs $3.50/month in search requests alone after the pooled free cap is exhausted, while $9.99/year produces roughly $0.83/month gross before app store fees. **The 100/month cap is a safety ceiling against abuse, not a margin-safe everyday entitlement — see §Pricing bet for the explicit framing of this trade-off.** Pricing review triggers below define when the bet is wrong.

Pricing review triggers (scale-aware for indie stage):
- Any single premium user exceeds 30 successful searches in any UTC calendar month.
- Average successful searches per active-premium-user per month exceeds 15 for any single month.
- Total monthly Google API spend (search + photos) exceeds 30% of monthly Discover-driver subscription revenue.
- Median premium session has more than 3 successful searches.
- Photo media requests exceed 750/month or photo costs begin to exceed search costs.

At PRD time these tripwires are calibrated to the current scale (2 premium users). They are designed to fire fast — single-month signals, per-user not aggregate, margin-relative not absolute. Re-baseline triggers once premium MAU exceeds ~100.

Cost controls required for v1:
- Set a GCP budget alert before rollout.
- Set per-method Google Places quota limits for Text Search and Place Photos, not just a budget alert.
- Per-user rate limits (10/min, 30/day) — see §Premium tier.
- Maps SDK billing spike passes — see §Pre-conditions for tech-lead review.
- Track successful searches and photo URL requests server-side via the `discover_search_events` ledger, attributed by `user_id`, `month_utc`, `source`, and `app_version` (see §Monthly cap storage).
- Revisit the field mask before build: removing `currentOpeningHours`, `priceLevel`, `rating`, and/or `userRatingCount` materially changes SKU economics, but also weakens the user experience.

### Pricing bet (v1)

We expect Discover usage to be bursty — one or two intensive sessions per premium user per month, rather than sustained daily use. At that distribution, average premium API cost stays well under the $0.58/mo net revenue per user (assuming Apple Y1 30% cut). The 100/mo cap is a **safety ceiling against abuse, not the expected workload.**

This is an explicit bet, not a margin-safe everyday entitlement. If the bursty-usage hypothesis is wrong — see §Cost model > Pricing review triggers above — we will revisit pricing, reduce the monthly cap, reduce expensive fields, or introduce a "Discover Pro" tier.

The bursty hypothesis is **measurable**: §Success metrics includes a bursty-validation metric tracking the distribution of distinct days per UTC month each premium user runs a Discover search. Bursty is confirmed if median distinct-days ≤ 4 per month; falsified if ≥ 10.

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
  "languageCode": "en" | "es"
}
```
**Request headers:** `Authorization: Bearer <jwt>` (required), `X-App-Version: <semver>` (optional but expected; from `Constants.expoConfig?.version`).

`locationBias` is optional — when the user has denied location permission, omit it and let Google return results without geographic bias.

Implementation note: distinguish real user location from map-display fallback. `useLocation()` returns `null` when location permission is denied — there is **no** Madrid fallback inside the hook itself. The Discover screen uses a static default center (Madrid) **for map display only**, computed at the screen level; this default must NOT be passed as `locationBias`. Only send `locationBias` when `useLocation()` returns a non-null real GPS-backed coordinate.

No timezone field. All cap math is anchored to UTC server-side (see §Premium tier and §Monthly cap storage). The client's device timezone is never sent.

`languageCode` mirrors the app's i18n active locale. Only `'en'` and `'es'` are supported in v1; all other locales fall back to `'en'` at the client before invoking the Edge Function (see §i18n).

Google Maps SDK configuration lives in the native app, not in this request body. Keep Maps SDK keys restricted by platform bundle ID/package name (see §Native/config dependencies > Key restriction matrix).

**Flow (reserve-and-refund pattern):**

1. Validate auth (`auth.getUser()`). Reject `401` if no valid JWT.
2. Check server-side kill switch (see §Rollout > Kill switch). If disabled, return `503 DISCOVER_DISABLED` before any further work.
3. Read `X-App-Version` header (nullable); will be passed to the RPC for ledger attribution.
4. Call `select reserve_discover_search(user_id, app_version)` (see §Migration for full SQL). The RPC, in a single transaction with a row lock on `profiles`, performs:
   - **Velocity check:** if user has ≥ 10 events in the last 60 seconds → raise `RATE_LIMITED_MINUTE`.
   - **Daily check:** if user has ≥ 30 events in the last 24 hours → raise `RATE_LIMITED_DAY`.
   - **Entitlement check:**
     - Free: atomic `update profiles set discover_searches_used = discover_searches_used + 1 where id=? and discover_searches_used < discover_searches_granted`. If no row updated → raise `TRIAL_EXHAUSTED`.
     - Premium: count successful premium rows for `(user_id, month_utc)`. If ≥ 100 → raise `MONTHLY_CAP`.
   - **Reserve:** insert into `discover_search_events` with server-computed `date_utc`/`month_utc`/`source`/`app_version`. Return inserted row's `id`.
5. **Map raised errors to HTTP responses:**
   - `RATE_LIMITED_MINUTE` / `RATE_LIMITED_DAY` → `429 DISCOVER_RATE_LIMITED` with `Retry-After` header set to next minute/day boundary.
   - `TRIAL_EXHAUSTED` → `402 DISCOVER_TRIAL_EXHAUSTED`.
   - `MONTHLY_CAP` → `429 DISCOVER_MONTHLY_CAP`.
6. Call `POST https://places.googleapis.com/v1/places:searchText` with the field mask below and `maxResultCount: 20`. Timeout: 10 seconds.
7. **If Google succeeds:** map response to `DiscoverPlace[]`, return. The reservation stands.
8. **If Google fails** (5xx, network error, timeout, or any non-2xx): call `select refund_discover_search(reservation_id)` to delete the reservation row and (for free users) decrement `discover_searches_used`. Return `502 DISCOVER_UPSTREAM_ERROR` for 5xx, `504 DISCOVER_UPSTREAM_TIMEOUT` for timeout, generic `500 DISCOVER_ERROR` for everything else.

**Concurrency guarantee:** the `for update` row lock on `profiles` inside `reserve_discover_search` serializes concurrent invocations per-user. Two parallel requests for the same user at the cap boundary cannot both succeed — exactly one will see the cap as not-yet-reached.

**Crash window:** if the Edge Function crashes between step 6 and step 8, the reservation row is orphaned (slot consumed without confirmed Google success). Acceptable risk for v1 — bounded by the per-minute rate limit. A future cleanup job could detect orphans by cross-referencing Google billing records, but is not in scope.

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

### `discover-user-purge`
**Path:** `supabase/functions/discover-user-purge/index.ts`

**Purpose:** GDPR right-to-erasure for Discover data. Called from the existing account-deletion flow after the `auth.users` row is deleted (or scheduled for deletion).

**Trigger:** invoked from the account-deletion path in the app's Settings/Account screen. Idempotent; safe to retry.

**Flow:**
1. Validate the caller is either an authenticated user deleting their own account, or the service role.
2. Call `select purge_discover_user_data($1)` (see §Migration for RPC). This deletes `discover_search_events` rows for the user and resets `profiles.discover_searches_used` to 0. The `on delete cascade` FK from `discover_search_events.user_id` to `profiles(id)` also handles this if the profile is being deleted; the explicit call covers the case where account deletion is logical rather than a hard `profiles` delete.
3. Best-effort: call Supabase Management API to scrub matching `user_id` from Edge Function logs within the retention window (Supabase log retention is set to 30 days for this project; see §Compliance). If the Management API call fails, log the failure but return success — the user's auth identity is already gone.
4. Return `204 No Content` on success, or `500` with detail on the part that failed.

**Out of scope for v1:**
- Google Cloud Logging entries for `discover-search` invocations (cannot be selectively purged per-user). Mitigated by setting GCP log retention to ≤30 days for Discover-related logs (see §Compliance).
- Anonymous query analytics (intentionally not user-linked; covered by privacy policy disclosure).

### Secrets handling

Both `discover-search` and `discover-photo-urls` need a Google Maps Platform API key with Places API (New) enabled. The key:

- Lives in **`supabase_vault`** (consistent with the cron→Edge Function bearer pattern in `docs/payments.md` → Drift Health Check). **Never** as a function env var.
- Is read at function init via `vault.decrypted_secrets`.
- Has GCP-side restrictions: enabled only for Places API (New) — Text Search and Place Photos. Maps SDK keys are separate (see §Native/config dependencies > Key restriction matrix).
- Rotates **annually** or on suspected leak. Rotation procedure: generate new key in GCP → update vault secret → next function invocation picks it up. No code deploy required.

The Discover Edge Functions use a **separate key** from the existing Add-flow client-side Google Places key (`EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_*`). This is a known short-term inconsistency; consolidation tracked in a follow-up issue (see §Known debt).

### Migration
**New file:** `supabase/migrations/<timestamp>_add_discover_usage_tracking.sql`

Contains:
- Two free-tier counter columns on `profiles` (see §Free-tier trial counter schema).
- `discover_search_events` table + three indexes (see §Monthly cap storage).
- Three `SECURITY DEFINER` RPCs for race-free cap enforcement and GDPR purge (below).
- RLS:
  - User can `select` own `profiles` row including the new free-tier columns.
  - `discover_search_events`: reads restricted to the `service_role` and admin tooling; user cannot read own usage rows in v1.
  - Writes to `discover_search_events` and updates to `profiles.discover_searches_used` happen only via the RPCs running under `SECURITY DEFINER`. Direct DML is denied to `authenticated`.

#### RPC: `reserve_discover_search`

Atomic reservation. Performs rate-limit checks, entitlement check, and inserts the reservation row in a single transaction with a row lock on the user's profile. Returns the reservation's `id` (used for the refund path), or raises a typed exception the Edge Function maps to HTTP status codes.

```sql
create or replace function public.reserve_discover_search(
  p_user_id     uuid,
  p_app_version text
) returns bigint
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_entitlement    text;
  v_used           integer;
  v_granted        integer;
  v_minute_ct      integer;
  v_day_ct         integer;
  v_month_ct       integer;
  v_now            timestamptz := now();
  v_month_utc      text  := to_char(v_now at time zone 'utc', 'YYYY-MM');
  v_date_utc       date  := (v_now at time zone 'utc')::date;
  v_source         text;
  v_reservation_id bigint;
begin
  -- Row lock on the user's profile serializes concurrent requests for this user.
  select entitlement, discover_searches_used, discover_searches_granted
    into v_entitlement, v_used, v_granted
    from profiles where id = p_user_id for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- Velocity check (10 / 60s)
  select count(*) into v_minute_ct
    from discover_search_events
    where user_id = p_user_id and created_at > v_now - interval '1 minute';
  if v_minute_ct >= 10 then
    raise exception 'RATE_LIMITED_MINUTE' using errcode = 'P0001';
  end if;

  -- Daily check (30 / 24h)
  select count(*) into v_day_ct
    from discover_search_events
    where user_id = p_user_id and created_at > v_now - interval '24 hours';
  if v_day_ct >= 30 then
    raise exception 'RATE_LIMITED_DAY' using errcode = 'P0001';
  end if;

  -- Entitlement check
  if v_entitlement = 'free' then
    update profiles
      set discover_searches_used = discover_searches_used + 1
      where id = p_user_id and discover_searches_used < discover_searches_granted;
    if not found then
      raise exception 'TRIAL_EXHAUSTED' using errcode = 'P0001';
    end if;
    v_source := 'free';
  else
    select count(*) into v_month_ct
      from discover_search_events
      where user_id  = p_user_id
        and month_utc = v_month_utc
        and source    = 'premium';
    if v_month_ct >= 100 then
      raise exception 'MONTHLY_CAP' using errcode = 'P0001';
    end if;
    v_source := 'premium';
  end if;

  -- Reserve
  insert into discover_search_events (user_id, date_utc, month_utc, source, app_version)
    values (p_user_id, v_date_utc, v_month_utc, v_source, p_app_version)
    returning id into v_reservation_id;

  return v_reservation_id;
end;
$$;

revoke all on function public.reserve_discover_search(uuid, text) from public, anon, authenticated;
grant execute on function public.reserve_discover_search(uuid, text) to service_role;
```

#### RPC: `refund_discover_search`

Reverses a reservation if Google fails. Idempotent on missing reservations (no-op).

```sql
create or replace function public.refund_discover_search(
  p_reservation_id bigint
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
declare
  v_user_id uuid;
  v_source  text;
begin
  delete from discover_search_events
    where id = p_reservation_id
    returning user_id, source into v_user_id, v_source;
  if not found then
    return; -- already refunded or never existed
  end if;
  if v_source = 'free' then
    update profiles
      set discover_searches_used = greatest(discover_searches_used - 1, 0)
      where id = v_user_id;
  end if;
end;
$$;

revoke all on function public.refund_discover_search(bigint) from public, anon, authenticated;
grant execute on function public.refund_discover_search(bigint) to service_role;
```

#### RPC: `purge_discover_user_data`

Used by `discover-user-purge` Edge Function. Deletes all Discover data for a single user.

```sql
create or replace function public.purge_discover_user_data(
  p_user_id uuid
) returns void
  language plpgsql
  security definer
  set search_path = public
as $$
begin
  delete from discover_search_events where user_id = p_user_id;
  update profiles
    set discover_searches_used = 0
    where id = p_user_id;
end;
$$;

revoke all on function public.purge_discover_user_data(uuid) from public, anon, authenticated;
grant execute on function public.purge_discover_user_data(uuid) to service_role;
```

**Concurrency invariants** the RPCs guarantee:
- A free user cannot exceed `discover_searches_granted` even under N concurrent invocations.
- A premium user cannot exceed 100 successful events per UTC month even under N concurrent invocations.
- A rate-limited user is rejected before any Google API call is made.

---

## Screen: Discover (`app/(tabs)/discover/index.tsx`)

Three visual states.

### Map implementation

- Discover uses a Google Map, not `@rnmapbox/maps`.
- Existing Places tab remains on Mapbox; do not refactor the saved-places map as part of this feature.
- Tech lead should choose the React Native Google Maps integration. Default candidate: `react-native-maps` with `provider={PROVIDER_GOOGLE}` and an Expo/EAS-compatible config plugin. **Library choice is gated by the Maps SDK billing spike** (see §Pre-conditions for tech-lead review).
- **Map style:** use `mapType="standard"`, **no** Google Cloud Map ID, **no** cloud-based styling. This is the closest match to Mapbox's default light theme MapVault uses today AND sidesteps the Map ID / cloud-styling paid-SKU question entirely. Visual parity with Mapbox is explicitly not pursued.
- Google Maps attribution/logo and any provider attribution must remain visible and unobscured by the search pill, overlays, bottom sheet, safe areas, or tab bar.
- Do not place Google Places content on the existing Mapbox map. Discover results live only on the Google Map surface.

### State 1 — Empty (default)

- Full-screen Google Map centered on user's current location when `useLocation()` returns a non-null coordinate. When `useLocation()` returns `null` (permission denied), the screen falls back to a static default center (Madrid) for **display purposes only** — this fallback is NOT sent to the Edge Function as `locationBias` (see §Edge Function backend > Request body).
- **Free-user intro line (first visit per session, free entitlement only):** small dismissable text below the search pill: `t('discover.freeIntro')` → "5 free Discover searches to try the feature. Upgrade for 100/month."
- Floating **pill search bar** pinned near the top:
  - **Left:** MapVault logo SVG at 20-24px (see Brand Asset).
  - **Center:** `t('discover.searchPlaceholder')` → "I'm looking for…"
  - **Right (free users only):** small remaining-count indicator showing `{granted - used}/{granted}`, e.g. "4/5". Premium users show no counter. When the trial is exhausted (`used >= granted`), tapping the pill routes directly to the paywall instead of opening the overlay.
  - **Right (premium users):** no counter shown in default state.

### State 2 — Search Overlay

Triggered on pill tap (unless trial exhausted — see State 1):
- Full-screen white overlay at ~85% opacity. Map shows muted behind (no grayscale; revisit in v2 if needed).
- The pill animates from its top position to vertical center via Reanimated (`useSharedValue` + `withSpring`).
- A **blue send arrow** fades in on the right at 150ms (`withTiming`).
- Keyboard opens automatically (`autoFocus`).
- Hint text below the input: `t('discover.searchHint')` → "e.g. best coffee shop near me".
- **Free users only — below the hint:** `t('discover.trialOverlayMsg', { remaining })` → "You have {{remaining}} remaining searches on the free plan. Upgrade for 100/month." Hidden for premium users.
- **No debouncing** — API call only fires on send-arrow tap.
- **Send button is disabled while `query.isFetching === true`.** On submit, the send arrow becomes a spinner; submit cannot fire again until response or cancellation. This closes the duplicate-invocation server cost from accidental double-taps.
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
| **Loading** | User taps send arrow | Stay on overlay, replace send arrow with spinner. Send button disabled. On response → next state. |
| **Error** | Search call fails (502/504/500) | Overlay stays, inline message below input (`t('discover.errorSearch')`), input preserved, send arrow restored for retry. |
| **No results** | Google returns `[]` | Overlay dismisses, map banner: `t('discover.noResults', { query })`. Pill keeps the query + ✕. |
| **Re-tap on pill** | Results showing → tap pill | Overlay re-opens with `currentQuery` pre-filled. Edit + send → results replace. Tap outside → revert to results. |
| **Tab switch** | User leaves Discover with overlay open | Overlay + keyboard dismiss silently. Returning shows last persisted state (empty or results). |
| **Clear (✕)** | Tap ✕ on pill or call `clear()` | Single shared code path. Resets `currentQuery`, results, markers; returns to State 1. |
| **Trial exhausted** | Edge Function returns `402 DISCOVER_TRIAL_EXHAUSTED` | Spinner stops → overlay dismisses with reverse spring → `router.push('/(tabs)/settings/paywall?trigger=discover_limit')`. Don't route while the overlay is mounted — sequence matters to avoid layering glitches. |
| **Monthly cap (premium)** | Edge Function returns `429 DISCOVER_MONTHLY_CAP` | Same dismiss sequence as Trial exhausted, then show `t('discover.monthlyCap')` as an inline banner on the map (not a separate modal). |
| **Rate-limited** | Edge Function returns `429 DISCOVER_RATE_LIMITED` | Overlay dismisses with reverse spring → inline banner on the map: `t('discover.rateLimitMinute')` if `Retry-After` < 5min, else `t('discover.rateLimitDay')`. Send arrow restored. Counter unchanged. |
| **Offline** | `NetInfo` reports offline OR Google Map fails to load on mount | Show empty state with `t('discover.offline')` banner; search pill is disabled while offline. When connectivity returns, banner clears and the pill re-enables automatically. Uses `@react-native-community/netinfo` (already a transitive Expo dep). |
| **Discover disabled** | Edge Function returns `503 DISCOVER_DISABLED` (server kill switch) | Overlay dismisses → `t('discover.unavailable')` banner. Tab should already be hidden via the client flag, but the 503 covers the brief race window where a client has a stale flag value. |

---

## Markers

**New component:** `components/discover-markers/discover-markers.tsx`. Do not reuse `MapMarkers`; the existing component is Mapbox-specific.

- **Shape:** 32px solid colored circle, centered rating number in white (e.g. "4.9"). No category icon.
- **Selected:** enlarges to ~40px with drop shadow.
- **No rating:** show "—".
- **Saved-in-active-map indicator:** when a result's `googlePlaceId` matches a row in `useMapPlaces(activeMapId)`, render a **2px white outer ring** around the marker. Selected + saved state composes (enlarged shape with the ring still visible). This gives the user an at-a-glance signal that they've already curated the place into the current map.
- **Marker clustering:** **enabled from v1.** Clusters render as a single circle with a count when multiple markers overlap below a zoom threshold. Tap to expand or zoom in. Required for legibility in dense city blocks (e.g., 20 results within a few hundred meters of Madrid centro).
- **Subscribes to `useMapPlaces(activeMapId)`** to compute saved-vs-unsaved state. After a successful save, TanStack Query invalidation re-renders the markers automatically (the just-saved place gains its ring within ~500ms — verify in §Verification).
- **Color buckets by `primaryType`:**

| Bucket | Color | primaryTypes |
|--------|-------|--------------|
| Warm | orange | `restaurant`, `cafe`, `bar`, `bakery`, `food`, `meal_takeaway`, `meal_delivery`, `night_club` |
| Cool | teal | `museum`, `art_gallery`, `park`, `beach`, `tourist_attraction`, `hotel`, `lodging`, `library`, `theater`, `movie_theater`, `zoo` |
| Gray | medium gray | everything else, including `null` |

Pick hex values from the existing palette; verify WCAG contrast for white-on-color (AA at minimum) and that the white ring remains visible against marker color in bright daylight (sanity check on device).

Built on the chosen Google Maps marker API. Manual perf spot-check during impl: 20 custom markers + clustering on a low-end Android. If FPS drops below ~50, simplify marker rendering before launch.

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
   - **When `authorAttributions.length === 0`:** the overlay displays "Powered by Google" instead (same translucent gradient, white text, no tap action). Hiding the overlay entirely is **not** safe under Google's Places photo display requirements — when no author exists, generic Google attribution is required as a fallback. **Tech lead to re-verify this against the current Google Places ToS during implementation** since policy text can change.
   - Photo URLs fetched via `discover-photo-urls` Edge Function on sheet open (not pre-fetched in search response).
   - Hidden if no photos.

### Save behavior

- Discover does **not** call the `add-place` Edge Function directly in v1.
- Tapping **Save** opens the existing Add place save screen with the discovered place prefilled, e.g. `router.push({ pathname: '/(tabs)/add/save', params: { placeId, name, address, latitude, longitude, googleCategory, source: 'discover' } })`.
- The Add flow remains the only place where the user confirms the target map, tags, note, and visited status. This keeps Discover as the finding surface and Add as the curation surface.
- Add must skip its usual place-search/details lookup step for Discover-originated saves. Discover already has the required place ID, name, address, latitude, longitude, and category/type data, so the Add save screen should render directly with those values.
- **`source` param is typed:** in `app/(tabs)/add/save.tsx`, declare `type SaveSource = 'manual' | 'discover'` and parse incoming params against this union. Unknown values silently default to `'manual'` to keep analytics events well-defined. (Existing param parsing in that file is stringly-typed — tighten during this work.)
- If required save data is missing from the Discover handoff, show an inline error and offer to return to Discover; do not perform a second Google lookup as a hidden fallback in v1.
- Freemium 20-place limit remains enforced server-side by the existing `add-place` Edge Function when the Add flow submits. **If the Add flow rejects a Discover-originated save with `FREEMIUM_LIMIT_EXCEEDED`, Add shows its existing upgrade prompt.** If the user dismisses without upgrading, they remain in the Add screen (not auto-returned to Discover) — the existing Add flow handles the unsaved state. No Discover-specific fallback path is needed.
- **Cross-map "saved" hint:** when the place exists in a *non-active* map the user owns, the sheet displays a soft hint below the place name: `t('discover.savedInOtherMap', { mapName })` → "Also saved in: {{mapName}}". This does not block the Save action — users can intentionally save the same place to multiple maps. Requires a cross-map query (either extend `useMapPlaces` to expose a cross-map index, or add a lightweight `usePlaceMembershipAcrossMaps(googlePlaceId)` hook).
- **Button states** (computed from `useMapPlaces` for the active map):
  - `activeMapId == null` → **disabled** (defensive; shouldn't occur in normal flow).
  - `useMapPlaces.isLoading` → **disabled** with loading style.
  - `useMapPlaces.isError` → **enabled** (fall back; Edge Function is conflict authority).
  - Place already in active map → **"Already saved"** state; tapping can optionally deep-link to the existing saved place in Places.
  - Otherwise → **"Save"** active.
- On successful handoff to Add, dismiss the Discover sheet and navigate to Add. Save success, freemium limit errors, tag validation, and note/visited handling stay owned by the existing Add flow.
- Add flow accepts `source: 'discover'` so analytics can distinguish Discover-originated saves from normal Add searches (see §Analytics).

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

  // Round to 0.01° (~1km grid) for cache-friendliness
  const lat = location ? Math.round(location.latitude * 100) / 100 : null;
  const lng = location ? Math.round(location.longitude * 100) / 100 : null;

  const query = useQuery({
    queryKey: ['discover', currentQuery, lat, lng],
    queryFn: () => searchPlacesText(currentQuery!, {
      location: location ?? undefined,
    }),
    enabled: !!currentQuery,
    // 5-min staleTime inherits from the global default; same query+rounded-location
    // within 5 min is a cache hit and does NOT invoke discover-search.
    // Cache-hit vs. fresh-fetch is measured server-side via Supabase Edge Function logs
    // (see §Analytics). No client-side `from_cache` flag is tracked.
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
- **No `timeZone` param.** All cap math uses UTC server-side (§Premium tier).
- **No client retry config.** Transient failures surface to the user immediately; manual retry. Tripwire to revisit in §Known debt.
- TanStack Query handles in-flight cancellation when the queryKey changes.

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
  "freeIntro": "5 free Discover searches to try the feature. Upgrade for 100/month.",
  "trialRemaining": "{{remaining}}/{{total}}",
  "trialOverlayMsg": "You have {{remaining}} remaining searches on the free plan. Upgrade for 100/month.",
  "save": "Save",
  "alreadySaved": "Already saved",
  "savedInOtherMap": "Also saved in: {{mapName}}",
  "directions": "Directions",
  "open": "Open",
  "closed": "Closed",
  "closes": "Closes {{time}}",
  "opens": "Opens {{time}}",
  "reviews": "{{count}} reviews",
  "poweredByGoogle": "Powered by Google",
  "noResults": "No results for \"{{query}}\". Try a different search, or include a city name (e.g. \"tapas Madrid\").",
  "errorSearch": "Search failed. Please try again.",
  "errorSave": "Could not save place. Please try again.",
  "errorLimit": "You've reached the free plan limit. Upgrade to save more places.",
  "monthlyCap": "You've used your Discover searches for this month. Come back next month.",
  "rateLimitMinute": "Slow down — please wait a moment before searching again.",
  "rateLimitDay": "Take a break! Come back tomorrow to keep discovering.",
  "offline": "Discover needs an internet connection. Reconnect and try again.",
  "languageFallback": "Discover results are in English.",
  "unavailable": "Discover is temporarily unavailable. Please try again later."
}
```

The `languageFallback` line appears as small text in the search overlay when the device locale is not `en` or `es` (Discover defaults to `'en'` for unsupported locales — see §Edge Function backend > Request body).

---

## Analytics

New identified events via a new `trackSafe()` helper in `lib/analytics.ts` — a PII-stripping wrapper around `track()`. See §Analytics privacy below.

Search instrumentation is **split into two events** because TanStack Query's cache-hit path short-circuits `queryFn` — there's no single moment that captures both "user intended a search" and "we got a result." Splitting also lets us measure incomplete searches (intent without completion) as a failure signal.

Do **not** attach raw search query text to identified client analytics events. Query text may reveal sensitive intent. The `trackSafe()` helper enforces this.

| Event | Properties | Fires when |
|-------|-----------|------------|
| `discover_search_submitted` | `query_length: number`, `has_location_bias: boolean`, `language_code: 'en' \| 'es'` | Inside the hook's `search(q)` setter. Always fires — captures intent regardless of cache. |
| `discover_search_completed` | `result_count: number`, `latency_ms: number`, `has_location_bias: boolean`, `language_code: 'en' \| 'es'` | In a `useEffect` watching `query.dataUpdatedAt`. Cache-hit vs. fresh-fetch distinction is measured server-side via Supabase Edge Function logs — the prior `from_cache` client flag was dropped because `dataUpdatedAt` is fragile under background refetches. |
| `discover_result_tapped` | `rating: number \| null`, `has_photos: boolean`, `primary_type: string \| null` | Marker tap. |
| `discover_save_started` | `rating: number \| null`, `has_photos: boolean`, `primary_type: string \| null` | User taps Save in the Discover sheet and is routed into Add. |
| `discover_save_abandoned` | `rating: number \| null`, `primary_type: string \| null` | User leaves the Add screen after a Discover-originated handoff *without* saving (back gesture, tab switch, cancel — anything except the save-success path). Critical funnel signal; without it the `save_started / place_saved` ratio is meaningless. |
| `discover_place_saved` | `map_id: string`, `source: 'discover'`, `rating: number \| null`, `primary_type: string \| null` | Save success from the Add flow with `source: 'discover'`. |
| `discover_directions_tapped` | `rating: number \| null`, `primary_type: string \| null` | Directions button tap. |
| `discover_cleared` | — | User taps ✕ on the pill. |
| `discover_trial_exhausted` | — | Edge Function returns `402 DISCOVER_TRIAL_EXHAUSTED` for a free user. |
| `discover_paywall_shown` | `trigger: 'trial_exhausted' \| 'save_limit'` | Paywall mounts via Discover trigger. |
| `discover_monthly_cap_hit` | — | Edge Function returns `429 DISCOVER_MONTHLY_CAP` for a premium user. |
| `discover_rate_limited` | `limit_type: 'minute' \| 'day'` | Edge Function returns `429 DISCOVER_RATE_LIMITED`. Operational signal — real-time abuse / runaway-client trip-wire. |

**For all events:** do NOT include `place_name`, `place_id`, address, coordinates, or raw query text. `trackSafe` filters these defensively.

### Analytics privacy (trackSafe helper)

The "don't attach query text to identified events" guidance is a new pattern — `lib/analytics.ts` does no PII stripping today. Codify it:

```typescript
// In lib/analytics.ts
const BLOCKED_PROPS = new Set([
  'query', 'query_text', 'searchText', 'place_name', 'place_id',
  'address', 'formatted_address', 'latitude', 'longitude'
]);

export function trackSafe(event: string, props: Record<string, unknown> = {}) {
  const cleaned = Object.fromEntries(
    Object.entries(props).filter(([k]) => !BLOCKED_PROPS.has(k))
  );
  track(event, cleaned);
}
```

All Discover analytics events MUST use `trackSafe` instead of `track`. Future event types should adopt the same pattern. The blocked-property list lives in `lib/analytics.ts` and is shared across event types.

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
3. **Save rate per Discover session** — `discover_place_saved` / `discover_search_submitted` per session. Use `discover_save_abandoned` to distinguish "saw a place, decided not to save" from "didn't find anything to save."
4. **Bursty-usage validation (the pricing bet — see §Pricing bet):** for each premium user per UTC month, compute the number of distinct days on which they ran a Discover search. Track median and distribution. **Bursty hypothesis confirmed if median ≤ 4 days/month; falsified if median ≥ 10 days/month.** Falsification triggers a pricing review.

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
- **Existing premium users (n=2 at PRD time)** are notified directly by the founder when Discover launches; no formal in-app announcement infrastructure is built for v1.

### Kill criteria
- Daily API spend exceeds the GCP budget alert threshold without explanation.
- Discover-related crash rate via Sentry > **0.5%** of sessions (industry healthy crash rate is 0.01–0.1%; the original 1% threshold would only catch catastrophic regressions after most users had already been affected).
- Premium monthly-cap complaints exceed a manual support threshold.

---

## File structure

```
app/(tabs)/
  _layout.tsx                          ← MODIFY: reorder tabs (Places leftmost), set initialRouteName="places"
  explore/  → places/                  ← RENAME directory; update references
  add/save.tsx                         ← MODIFY: type SaveSource union, accept source='discover', emit Discover-origin save analytics
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
  icons/
    mapvault-logo.tsx                  ← NEW (alternative to SVG transformer)

hooks/
  use-discover-search.ts               ← NEW

lib/
  google-places.ts                     ← MODIFY: searchPlacesText now invokes Edge Function (drop client-side Places call)
  directions.ts                        ← (follow-up: http:// → https:// fix)
  analytics.ts                         ← MODIFY: add trackSafe helper + Discover event types
  feature-flags.ts                     ← MODIFY: discover_enabled wrapper (client + server flag)

app.config.ts                          ← MODIFY: add Google Maps SDK keys/config plugin for chosen RN Google Maps library
supabase/
  migrations/
    <ts>_add_discover_usage_tracking.sql   ← NEW (profiles columns, discover_search_events table + 3 indexes, 3 RPCs, RLS)
  functions/
    discover-search/index.ts           ← NEW: Text Search proxy + reserve/refund RPC + rate limits
    discover-photo-urls/index.ts       ← NEW: photo URL resolver
    discover-user-purge/index.ts       ← NEW: GDPR right-to-erasure for Discover data

types/
  index.ts                             ← MODIFY: DiscoverPlace, DiscoverPhoto

metro.config.js                        ← MODIFY (if SVG transformer chosen)
package.json                           ← MODIFY: add React Native Google Maps library; add react-native-svg-transformer if SVG transformer chosen
locales/en.json                        ← MODIFY: add discover namespace
locales/es.json                        ← MODIFY: mirror
docs/prd.md                            ← MODIFY: clarify Discover is a premium-only curation funnel; curation remains the core product
```

### Native/config dependencies

- Add a Google Maps React Native integration compatible with Expo SDK 54 and EAS dev clients. Candidate: `react-native-maps`, pending the Maps SDK billing spike (see §Pre-conditions for tech-lead review).
- Add Maps SDK API keys to EAS environment variables and read them statically in `app.config.ts`.
- The **Discover Edge Function** Google Places key (Text Search + Place Photos) lives in `supabase_vault` — server-side, never in the client bundle (see §Secrets handling).
- **Mixed-key strategy (known short-term inconsistency):** the existing Add flow continues to use client-side keys (`EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_*`) for autocomplete and place-details calls. Consolidating these to server-side Edge Functions is **out of scope for this PRD** and tracked as a follow-up issue (see §Follow-up issues). Both keys must have GCP-side SKU restrictions applied.

#### Key restriction matrix

Maintain in `docs/setup.md` (extend the existing key/secrets documentation):

| Bundle ID / context | Platform | API Key | Allowed SKUs |
|---------------------|----------|---------|--------------|
| `com.patrickalvarez.mapvault.dev` | iOS | Maps SDK (dev) | Maps SDK for iOS |
| `com.patrickalvarez.mapvault.dev` | Android | Maps SDK (dev) | Maps SDK for Android |
| `com.patrickalvarez.mapvault.preview` | iOS | Maps SDK (preview) | Maps SDK for iOS |
| `com.patrickalvarez.mapvault.preview` | Android | Maps SDK (preview) | Maps SDK for Android |
| `com.patrickalvarez.mapvault` | iOS | Maps SDK (prod) | Maps SDK for iOS |
| `com.patrickalvarez.mapvault` | Android | Maps SDK (prod) | Maps SDK for Android |
| server (Edge Function) | n/a | Places API (Discover) | Text Search (New), Place Photos |
| client (Add flow — existing) | n/a | Places API (Add — existing) | Place Autocomplete, Place Details |

Before tightening restrictions on a production key, validate via a preview build first. **Rollback:** GCP API key restrictions can be loosened in <5 minutes; if maps fail post-deploy, immediately remove the restriction (temporarily expose the key) to restore service, then diagnose.

---

## Known debt

Explicitly accepted gaps with tripwires for when to revisit.

1. **Accessibility.** No accessibility labels/roles, no reduce-motion handling, no VoiceOver focus management, marker hit targets <44pt. Revisit before scaling user base or hitting App Store accessibility review.
2. **`lib/directions.ts`** uses `http://maps.apple.com/...` — should be `https://`. Non-blocking; fix on next pass through that file.
3. **No retry-with-backoff** on Edge Function calls. Users retry manually. **Tripwire:** revisit if Sentry shows > 2% transient search-failure rate.
4. **No real-time spend signal.** GCP daily budget alert is the only spend tripwire — 24h blind spot. **Tripwire:** revisit if any single day's spend exceeds 50% of monthly subscription revenue.
5. **No A/B test plan in v1.** At launch user count (n=2 premium), statistical testing is infeasible. **Tripwire:** revisit once premium MAU exceeds ~200 (test trial size, paywall placement, etc.).
6. **Cache trade-off.** Cache hits within the 5-min staleTime + ~1km rounded-location grid do not count against the free trial counter. Intentional UX (re-tap the same search without burning a slot) but theoretically allows a single trial user to view the same results an unlimited number of times. Acceptable risk at v1 scale.
7. **Trial-counter bypass via uninstall + reinstall** is not mitigated in v1; risk is bounded by 5-search trial size. Email-alias canonicalization (Gmail `+aliases`) is addressed in a separate ticket (see §Follow-up issues).
8. **`regionCode` not passed** to Google Text Search. Acceptable for v1; revisit if international result quality is poor.
9. **Location denied / default city behavior.** Do not block search when location is denied. Allow the user to search with explicit geography in the query ("coffee in Paris") and show a non-blocking prompt to enable location for better nearby results. The Madrid display fallback must never be sent as `locationBias` unless the user is actually there.
10. **Two map providers.** Discover introduces Google Maps while Places stays on Mapbox. This avoids the Google-Places-on-Mapbox compliance problem but adds native setup, API-key, visual consistency, and QA complexity.
11. **Google attribution / compliance details.** The core map-provider decision is resolved by using Google Maps for Discover, but implementation must preserve Google Maps attribution/logo visibility, photo attribution (including the "Powered by Google" fallback for missing author attributions), and any applicable European search-result disclosure requirements.
12. **Pre-existing `places` table compliance gap.** The `places` table stores Google-sourced data (formatted address, primary type, etc.) indefinitely, predating this PRD. Google Places API caching policy permits indefinite storage of `place_id` only; other fields should be refreshed at most every 30 days. **This is a pre-existing gap, not a Discover regression.** Tracked in a separate GitHub issue (see §Follow-up issues); does not block Discover.
13. **Google Cloud Edge Function logs** for `discover-search` contain query text + user_id, and cannot be selectively purged per-user. Mitigated by setting GCP log retention to ≤30 days. **Tripwire:** revisit on first paid EU subscriber to confirm GDPR right-to-erasure posture.

## Follow-up issues

Tracked separately on GitHub so they don't bloat Discover scope:

1. **`places` table caching ToS** — refresh Google-sourced fields on 30-day cadence per Google Places API policy. Pre-existing gap; not a Discover regression. (See §Known debt #12.)
2. **Email canonicalization at signup** — strip Gmail `+aliases`, lowercase, treat canonical form as unique. Closes the easiest trial-abuse vector. (See §Anti-abuse position.)
3. **Consolidate Google Places API keys to server-side** — migrate the existing Add-flow autocomplete + place-details calls to Edge Functions matching the Discover pattern. (See §Native/config dependencies > mixed-key strategy.)
4. **"Untagged" filter on Places tab** — was scoped here in PRD v2 but cut for v1 to tighten scope. Revisit only if users actually report difficulty finding untagged saves post-launch.

---

## Verification

### Static checks
- `npm run typecheck` — clean
- `npm run lint` — clean
- `npm run check:i18n` — clean
- EAS/dev-client build succeeds on iOS and Android after adding the Google Maps native dependency/config.

### Manual test flow (premium internal account)
- [ ] Open app → lands on Places tab (not Discover) — `initialRouteName="places"` honored.
- [ ] Discover tab visible as the **second** tab (right of Places) → tap it.
- [ ] Empty state: Google Map centered on location, pill at top with MapVault logo + "I'm looking for...", no arrow. **No `4/5` counter** for premium users.
- [ ] Google Maps logo/attribution is visible and not covered by the search pill, tab bar, overlays, or safe area.
- [ ] Tap pill → overlay animates input to center, keyboard opens, send arrow fades in, hint visible.
- [ ] Type "best coffee shop in Lavapiés" → tap send → spinner → overlay dismisses → 20 markers fit on map → pill shows query + ✕.
- [ ] Double-tap send rapidly while the previous search is in-flight → second tap is ignored (send button disabled while `isFetching`).
- [ ] In dense city block, multiple overlapping markers cluster into a single circle with a count; tap cluster → zooms in or expands.
- [ ] Tap a marker → marker enlarges → detail sheet opens with name, stars+rating+count, "Cafe · $$", "Open · Closes 22:00", Directions, Save, 3-photo carousel with attribution overlays.
- [ ] Find a place whose photo has no `authorAttributions` → photo overlay shows "Powered by Google" fallback (not hidden, not "© Google").
- [ ] Tap photo attribution → opens browser to author URI.
- [ ] Tap Directions → iOS picker if multiple nav apps, else opens Apple Maps directly.
- [ ] Tap Save → Discover sheet dismisses → Add save screen opens with place prefilled (no Google Places re-lookup in Supabase logs).
- [ ] Complete Add flow with tags/note/visited as desired → place saves successfully.
- [ ] Return to Discover → saved place's marker has a **2px white ring** (within ~500ms of save completion).
- [ ] Tap the saved-place marker → sheet shows **"Already saved"** state for the active map.
- [ ] Switch active map (in Settings or via map switcher) to a different map → re-open Discover and search the same query → the previously-saved place now shows **"Also saved in: <prior map name>"** soft hint and a regular "Save" button.
- [ ] Open Places tab → place appears.
- [ ] Return to Discover → tap ✕ on pill → returns to empty state, markers removed.

### Edge cases
- [ ] Location permission denied → `useLocation()` returns `null`, screen shows Madrid display fallback; search runs without sending `locationBias`; UI shows a non-blocking prompt to enable location.
- [ ] Device offline (airplane mode) when entering Discover → empty state with `discover.offline` banner; search pill disabled. Re-enabling network clears banner; pill re-enables.
- [ ] Google Map fails to load or Maps SDK key is invalid → Discover shows a clear unavailable/error state and does not attempt to render Places markers on the Mapbox Places map.
- [ ] Google returns 0 results → overlay dismisses, banner shows "No results for '...'. Try a different search, or include a city name (e.g. 'tapas Madrid')." Pill keeps query.
- [ ] Network error during search → overlay stays, inline error, send arrow restored, retry works.
- [ ] Place has no photos → carousel hidden.
- [ ] Place has no rating → rating row hidden, marker shows "—".
- [ ] Place has no hours data → status row hidden.
- [ ] activeMapId == null → Save button disabled.
- [ ] useMapPlaces still loading on sheet open → Save button disabled with loading style.
- [ ] Add screen abandoned after Discover handoff (back gesture, tab switch, etc.) → `discover_save_abandoned` analytics event fires; `discover_place_saved` does NOT fire.
- [ ] Free user with 20-place save limit hits Save in Discover → Add flow shows existing `FREEMIUM_LIMIT_EXCEEDED` upgrade prompt; user remains on Add screen if they dismiss. No Discover-specific fallback path.
- [ ] iOS Family Sharing: family member who is NOT the purchaser opens the app while sharing the purchaser's premium subscription → Discover tab visible and functional; their entitlement is treated as premium.
- [ ] Device locale set to French / German / Japanese → Discover overlay shows the `languageFallback` small text ("Discover results are in English."); Edge Function receives `languageCode: 'en'`.

### Freemium / cost / rollout
- [ ] **Trial counter:** new free account → 5 searches → 6th attempt → paywall trigger fires; `profiles.discover_searches_used = 5`.
- [ ] **Visible trial counter:** free user sees "5/5" in the search pill on first open; counter decrements to "4/5", "3/5", ... after each successful search. Premium users see no counter.
- [ ] **Trial overlay copy:** free user opens the search overlay → "You have N remaining searches on the free plan. Upgrade for 100/month." renders below the hint. Premium users see no such line.
- [ ] **Premium monthly cap (UTC):** insert 100 successful premium `discover_search_events` rows for the current UTC month → confirm soft-cap message renders on the next search; confirm rows are scoped via `month_utc = to_char(now() at time zone 'utc', 'YYYY-MM')`.
- [ ] **Concurrent cap respect:** simulate 10 parallel `discover-search` Edge Function invocations for the same free user at `discover_searches_used = 4`. Expect exactly **1** success and **9** receive `402 DISCOVER_TRIAL_EXHAUSTED`. Repeat at the premium cap boundary (count = 99): expect 1 success and 9 receive `429 DISCOVER_MONTHLY_CAP`.
- [ ] **Rate limit (minute):** fire 11 successful searches within 60 seconds for the same user → 11th returns `429 DISCOVER_RATE_LIMITED` with `Retry-After` < 60s; `discover_rate_limited` analytics event fires with `limit_type: 'minute'`.
- [ ] **Rate limit (day):** with 30 successful searches in the last 24 hours → 31st returns `429 DISCOVER_RATE_LIMITED` with `Retry-After` ≤ 24h; analytics event fires with `limit_type: 'day'`.
- [ ] **Reserve-and-refund:** force the Google Text Search call to fail (e.g., invalid API key in test env). Expect:
  - reservation row inserted into `discover_search_events`,
  - then refunded (row deleted),
  - free counter restored to its prior value,
  - HTTP `502 DISCOVER_UPSTREAM_ERROR` returned to client.
- [ ] **Timezone manipulation:** change device timezone to UTC+14 ("Pacific/Kiritimati") and attempt to bypass the cap → fails; cap math anchored server-side to UTC.
- [ ] **`app_version` attribution:** every `discover_search_events` row created via the Edge Function has `app_version` populated from the `X-App-Version` request header.
- [ ] **Admin grant:** raise `discover_searches_granted` to 10 manually → confirm trial counter respects the new ceiling.
- [ ] **Kill switch (client):** toggle PostHog `discover_enabled` off → confirm Discover tab disappears + deep-link shows fallback.
- [ ] **Kill switch (server):** disable the server-side Discover flag → direct calls to `discover-search` and `discover-photo-urls` return `503 DISCOVER_DISABLED` before any Google API request.
- [ ] **Internal-only:** non-internal test account during week 1 should NOT see the Discover tab.
- [ ] **Cache:** repeat same search within 5 min → confirm no `discover-search` Edge Function invocation in Supabase logs, counter unchanged.
- [ ] **GCP budget alert:** simulate elevated daily spend → confirm GCP alert email arrives at configured threshold.

### Locale
- [ ] Switch device to Spanish → Google results come back in Spanish (verify `languageCode: 'es'` in Edge Function logs).
- [ ] Switch device to a locale outside `en`/`es` (e.g., `fr-FR`) → Edge Function receives `languageCode: 'en'`; overlay shows `languageFallback` text.
- [ ] Spanish strings render correctly for all new i18n keys (including `rateLimitMinute`, `rateLimitDay`, `offline`, `freeIntro`, `trialOverlayMsg`, `savedInOtherMap`).
- [ ] Time always renders as 24h regardless of locale (e.g. "Closes 22:00", never "10:00 PM").
- [ ] Price always renders as `$` symbols regardless of locale.

### Compliance
- [ ] Privacy policy updated with query-collection disclosure before release.
- [ ] iOS App Store privacy nutrition labels updated on next submission based on final analytics design. If raw query text is only collected anonymously, confirm whether it is disclosed as not linked to identity.
- [ ] **Account deletion (GDPR right-to-erasure):**
  - Confirm PostHog data for that `distinct_id` is purged.
  - Confirm `discover-user-purge` Edge Function runs and `discover_search_events` rows for the user are deleted (verify with a direct DB query as `service_role`).
  - Confirm `profiles.discover_searches_used` is reset to 0 for the deleted user.
  - Confirm Supabase log retention is set to ≤30 days (project-level setting).
  - Document that GCP Edge Function logs may retain query text for the GCP retention period (out of scope for v1).
- [ ] **App version attribution:** sample `discover_search_events` rows from production after a release → confirm `app_version` populated with the current Expo `Constants.expoConfig.version`.
- [ ] **`trackSafe` PII filtering:** unit test confirms that calling `trackSafe('test_event', { query: 'foo', rating: 4.5 })` results in PostHog receiving only `{ rating: 4.5 }` — `query` is stripped.
- [ ] Google Maps logo/attribution visible on Discover map in empty, overlay, results, and detail-sheet states.
- [ ] Confirm no Google Places results are shown on the Mapbox Places map.
- [ ] Confirm any applicable Google/EEA search-result disclosure requirements for Places Text Search are satisfied.
- [ ] Photo attribution `displayName` visible on every photo with a non-empty `authorAttributions`; tap opens author URI.
- [ ] Photo with empty `authorAttributions` shows "Powered by Google" overlay fallback (not hidden).
