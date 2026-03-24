# PostHog Analytics

## Overview

MapVault uses [PostHog](https://posthog.com) for product analytics. The instance is hosted in the **EU** (Frankfurt) for GDPR compliance. We use the `posthog-react-native` SDK.

Analytics tracks how users interact with core features (search, save, explore, share, purchase) to inform product decisions. **No PII is ever tracked** — no names, email addresses, note content, or search text.

## Architecture

```
PostHogProvider (app/_layout.tsx, outermost provider)
  └─ PostHogConnector (bridges React context → singleton)
       └─ lib/analytics.ts (centralized module, type-safe API)
```

### Key Files

| File | Role |
|---|---|
| `app/_layout.tsx` | `PostHogProvider` wraps the entire app; `PostHogConnector` bridges the SDK instance to the singleton |
| `lib/analytics.ts` | Centralized analytics module: `track()`, `identifyUser()`, `resetUser()`, `updateUserProperties()` |
| `hooks/use-auth.ts` | Calls `identifyUser()` / `resetUser()` on auth state changes |
| `hooks/use-revenuecat.ts` | Calls `updateUserProperties()` to sync entitlement to PostHog person properties |

### How It Works

1. **PostHogProvider** initializes the SDK with API key and EU host. Configured with lifecycle events and screen capture ON, touches and session replay OFF.
2. **PostHogConnector** reads the SDK instance from React context via `usePostHog()` and passes it to the `setPostHogInstance()` singleton in `lib/analytics.ts`.
3. **All tracking** goes through the `track()` function from `lib/analytics.ts`, which is type-safe against the `AnalyticsEvents` type.
4. **User identity** is set via `identifyUser(userId)` in `use-auth.ts` whenever auth state changes. On sign-out, `resetUser()` creates a new anonymous ID.
5. **Person properties** (e.g., `entitlement: 'premium'`) are synced via `updateUserProperties()` in `use-revenuecat.ts`.

### Autocapture Config

| Feature | Enabled |
|---|---|
| App lifecycle events | Yes |
| Screen views | Yes |
| Touches | No |
| Session replay | No |

## Environment

| Variable | Purpose |
|---|---|
| `EXPO_PUBLIC_POSTHOG_API_KEY` | PostHog project API key (read at build time) |
| `EXPO_PUBLIC_POSTHOG_HOST` | PostHog host URL (EU instance) |

Both are set in `.env` and EAS secrets. They are `EXPO_PUBLIC_` prefixed so they're embedded at build time.

## User Identification

Identity is managed in `hooks/use-auth.ts` via the `onAuthStateChange` listener:

- **Sign in:** `identifyUser(session.user.id)` — links the anonymous PostHog ID to the Supabase user ID
- **Sign out:** `resetUser()` — creates a new anonymous ID

Entitlement is synced as a person property (`entitlement: 'free' | 'premium'`) in `hooks/use-revenuecat.ts`, both on initial load and on real-time `CustomerInfoUpdate` events.

## Event Catalog

### Authentication (1 event)

| Event | When | Properties | File |
|---|---|---|---|
| `signup_completed` | After successful sign-in, if `created_at` is < 30s ago | `method`: `'apple' \| 'google'` | `app/(auth)/sign-in.tsx` |

### Search & Save (5 events)

| Event | When | Properties | File |
|---|---|---|---|
| `place_search_started` | User opens the Add tab | _(none)_ | `app/(tabs)/add/index.tsx` |
| `place_search_query` | Debounced search query fires | `query_length` | `hooks/use-place-search.ts` |
| `place_search_result_selected` | User taps a search result | `google_category` | `app/(tabs)/add/index.tsx` |
| `place_saved` | Place successfully saved (onSuccess) | `map_id`, `tag_count`, `tags`, `has_note`, `visited`, `google_category` | `app/(tabs)/add/save.tsx` |
| `place_save_abandoned` | User leaves save screen without saving | _(none)_ | `app/(tabs)/add/save.tsx` |

### Explore & Filters (6 events)

| Event | When | Properties | File |
|---|---|---|---|
| `explore_viewed` | Explore tab focused (30s cooldown) | `view_mode`, `active_map` | `app/(tabs)/explore/index.tsx` |
| `filter_applied` | Any filter changes (tag/visited/search) | `filter_type`, `active_tags`, `visited_filter`, `has_search_query`, `results_count` | `app/(tabs)/explore/index.tsx` |
| `filter_cleared` | All filters reset | _(none)_ | `app/(tabs)/explore/index.tsx` |
| `place_detail_viewed` | Place detail bottom sheet opens | `map_place_id`, `has_note`, `is_visited` | `app/(tabs)/explore/index.tsx` |
| `view_mode_switched` | Toggle between map and list | `new_mode` | `app/(tabs)/explore/index.tsx` |
| `directions_opened` | User taps directions button | `map_place_id` | `components/place-detail-sheet/place-detail-sheet.tsx` |

### Place Actions (1 event)

| Event | When | Properties | File |
|---|---|---|---|
| `visited_toggled` | Visited status toggled (onSuccess) | `map_place_id`, `new_status` | `hooks/use-toggle-visited.ts` |

### Maps (3 events)

| Event | When | Properties | File |
|---|---|---|---|
| `map_created` | Map created (onSuccess) | `map_id` | `hooks/use-create-map.ts` |
| `map_switched` | User switches active map | `map_id` (or `'all'`), `source` | `hooks/use-active-map.ts` |
| `map_deleted` | Map deleted (onSuccess) | `map_id` | `hooks/use-delete-map.ts` |

### Tags (1 event)

| Event | When | Properties | File |
|---|---|---|---|
| `tag_created` | Tag created (onSuccess) | `map_id`, `tag_name` | `hooks/use-manage-tags.ts` |

### Sharing & Roles (8 events)

| Event | When | Properties | File |
|---|---|---|---|
| `invites_screen_viewed` | Invites sub-page focused | `map_id` | `app/(tabs)/profile/map/[id]/invites.tsx` |
| `members_page_viewed` | Members sub-page focused | `map_id` | `app/(tabs)/profile/map/[id]/members.tsx` |
| `invite_link_created` | Invite created (onSuccess) | `map_id` | `hooks/use-create-invite.ts` |
| `invite_link_shared` | Share sheet completed successfully | `map_id` | `components/invite-section/invite-section.tsx` |
| `invite_accepted` | Invite accepted (onSuccess) | `map_id` | `app/invite/[token].tsx` |
| `invite_revoked` | Invite revoked (onSuccess) | `map_id`, `invite_id` | `app/(tabs)/profile/map/[id]/invites.tsx` |
| `member_role_changed` | Member role updated (onSuccess) | `map_id`, `new_role` | `hooks/use-update-member-role.ts` |
| `member_removed` | Member removed from map (onSuccess) | `map_id`, `role` | `hooks/use-remove-member.ts` |

### App Reviews (1 event)

| Event | When | Properties | File |
|---|---|---|---|
| `review_prompted` | In-app review dialog triggered | `trigger`: `'place_visited' \| 'places_saved_milestone' \| 'directions_after_filter'` | `hooks/use-app-review.ts` |

### Payments (4 events)

| Event | When | Properties | File |
|---|---|---|---|
| `paywall_viewed` | Paywall screen mounts | `trigger`: `'map_limit' \| 'place_limit' \| 'invite_limit' \| 'profile_tap' \| 'profile_cta'` | `app/(tabs)/profile/paywall.tsx` |
| `purchase_started` | User taps Subscribe | _(none)_ | `app/(tabs)/profile/paywall.tsx` |
| `purchase_completed` | Purchase succeeds | _(none)_ | `app/(tabs)/profile/paywall.tsx` |
| `purchase_failed` | Purchase fails or is cancelled | `reason`: `'cancelled' \| 'error'` | `app/(tabs)/profile/paywall.tsx` |

**Total: 30 events**

## Rules for Adding New Events

When building features that need tracking, follow these rules:

### 1. Define the event type first

Add the event to the `AnalyticsEvents` type in `lib/analytics.ts`. This ensures type safety — the `track()` call won't compile without it.

```typescript
// In lib/analytics.ts, add to AnalyticsEvents type:
my_new_event: { some_prop: string; count: number };

// For events with no properties:
my_simple_event: Record<string, never>;
```

### 2. Always import `track` from the centralized module

```typescript
import { track } from '@/lib/analytics';
```

Never use `usePostHog()` directly for event capture. The singleton pattern via `lib/analytics.ts` is the only sanctioned approach.

### 3. Fire on success, not intent

Track events in `onSuccess` callbacks, not when the user taps a button. This ensures we only count actions that actually completed.

```typescript
// Good — fires after mutation succeeds
mutation.mutate(data, {
  onSuccess: () => {
    track('thing_created', { id: data.id });
  },
});

// Bad — fires on tap, even if the mutation fails
const handleTap = () => {
  track('thing_created', { id: data.id }); // Don't do this
  mutation.mutate(data);
};
```

**Exception:** `purchase_started` fires on tap because we want to measure drop-off between intent and completion.

### 4. Never track PII

- No names, email addresses, or addresses
- No note content or search text
- Track counts and booleans instead: `query_length`, `has_note`, `tag_count`

### 5. For new screens: consider a `viewed` event

Use the cooldown pattern from `explore_viewed` (30s ref-based debounce) to avoid over-counting tab switches:

```typescript
const lastViewedRef = useRef(0);
useFocusEffect(
  useCallback(() => {
    const now = Date.now();
    if (now - lastViewedRef.current > 30_000) {
      lastViewedRef.current = now;
      track('my_screen_viewed', { ... });
    }
  }, [deps])
);
```

### 6. For new mutations: track in onSuccess

Add `track()` in the `onSuccess` callback of the TanStack Query mutation, either in the hook itself or at the call site.

### 7. For new paywall triggers: use the query param pattern

Navigate to the paywall with a `trigger` query param so `paywall_viewed` knows why it was shown:

```typescript
router.push('/(tabs)/profile/paywall?trigger=my_reason');
```

Then add the new trigger value to the `paywall_viewed` type and the `validTriggers` array in `paywall.tsx`.

### 8. Track counts and categories, not content

- `tag_count: 3` not `tags_text: "Italian, Pizza, ..."`
- `google_category: "restaurant"` (from Google, not user input)
- `has_note: true` not `note: "Great pasta here"`
- `query_length: 12` not `query: "best pizza in"`

## Testing

1. Make a change that fires an event
2. Open the PostHog dashboard → **Live Events**
3. Filter by your user or the event name
4. Verify the event appears with correct properties

In development builds, if PostHog is not initialized (missing env vars), events are silently dropped with a console warning.

## Key Decisions

| Decision | Rationale |
|---|---|
| **30s cooldown on `explore_viewed`** | Tab switches happen frequently; without a cooldown, the event count would be meaninglessly inflated |
| **Signup detection heuristic** (`created_at` < 30s) | Supabase auth doesn't distinguish sign-up from sign-in. Checking if the user was created in the last 30 seconds is a reliable proxy |
| **`invite_link_shared` fires after share sheet** | We check `Share.sharedAction` to only count completed shares, not dismissed share sheets |
| **Singleton pattern over hook** | `track()` can be called from hooks, components, and callbacks without needing React context. The `PostHogConnector` bridges the gap once at app startup |
| **`purchase_started` fires on intent** | Exception to the "fire on success" rule — we need it to measure the purchase funnel drop-off |
| **No touch autocapture** | Touch heatmaps add noise in a map-heavy app; manual events give cleaner signal |
| **No session replay** | Not needed at current scale; reduces SDK overhead and data volume |
| **`Record<string, never>` for empty props** | TypeScript pattern that enforces passing `{}` at the call site, making it explicit that the event has no properties |
