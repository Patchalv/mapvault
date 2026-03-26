# Membership Page PRD

## Overview

The Membership screen gives users a clear, in-app view of their current plan and its benefits. It replaces the disabled "Membership (Coming Soon)" placeholder in Settings with a fully navigable sub-page. Free users see their usage progress and a path to upgrade; premium users see what they've unlocked and how to manage their subscription.

**Route:** `app/(tabs)/settings/membership.tsx`
**Entry point:** Settings → Membership row
- Row label: "Membership", no secondary value
- Keep the existing PREMIUM badge (visible for premium users)
- Remove `opacity: 0.4` and make the row tappable (navigates to this screen)

---

## User States

The screen renders one of two layouts depending on `profile.entitlement`.

---

## Free User View

### 1. Header Card
- Label: "Current plan"
- Value: "Free" (large, prominent)
- Progress row: "Places used" label + progress bar + "X / 20" count
  - X = count of `map_places` rows where `added_by = current user id` (across all maps)
  - Bar fills proportionally; turn bar red when usage is ≥ 15/20 (75% threshold), neutral color below
  - If the count query fails or is loading, display "— / 20" and an empty bar

### 2. Upgrade CTA Button
- Label: "Upgrade to Premium"
- Subtitle: dynamic price string from RevenueCat annual package (`offerings?.current?.annual?.product?.priceString`) — already localized by RevenueCat for the user's region (e.g. "$9.99/year")
  - Omit the subtitle line entirely if `priceString` is not yet loaded
- Taps → navigate to existing Paywall screen (`/(tabs)/settings/paywall`)
- Full-width, high-prominence, red background (matches existing paywall CTA style)

### 3. Compare Plans Table
Section header: "Compare plans"

| Feature | Free | Premium |
|---|---|---|
| Places | 20 | Unlimited |
| Share maps | ✗ | ✓ |
| Multiple maps | ✗ | ✓ |
| Tags & filters | ✓ | ✓ |

Display notes:
- Free column: numeric value for Places; ✗/✓ icons for the rest
- Premium column label styled in brand red/accent color
- "Tags & filters" deliberately shows ✓ in both columns — it is included as reassurance for free users that this feature is not gated, not as a differentiator

### 4. Restore Purchases
- Low-prominence text link: "Restore purchases"
- Positioned at the bottom of the scroll view, centered
- Calls `restore.mutate()` from `useRevenueCat()` hook (do NOT call `restorePurchases()` from `lib/revenuecat.ts` directly — the hook handles cache invalidation and entitlement sync)
- Show a loading indicator while in flight (`isRestoring` from `useRevenueCat()`)
- On success: `useRevenueCat` automatically syncs the restored entitlement to `profile.entitlement`; if the user was premium, the screen re-renders to the Premium User View without any manual navigation
- On error: show an alert with a generic error message

---

## Premium User View

### 1. Header Card
- MapVault pin/location icon (centered)
- Title: "You're on Premium" (large)
- No renewal subtitle (deferred to a future iteration)
- Dark background card to visually distinguish from free tier

### 2. What's Included
Section header: "What's included"

List of 4 features, each with:
- Red checkmark icon
- Feature name (bold)
- Short subtitle describing the benefit

| Feature | Subtitle |
|---|---|
| Unlimited places | Save as many as you want |
| Share maps | Send curated maps to anyone |
| Multiple maps | Build and share collections |
| Tags & filters | Organize and find places fast |

Note: "Tags & filters" is listed here to show the full plan value, not as a premium-exclusive feature — it is available to all users.

### 3. Subscription Section
Section header: "Subscription"

Single row:
- Label: "Manage subscription"
- Chevron icon (→)
- Hint text below row: "Opens App Store or Google Play"
- Tap behavior:
  - iOS: call `Purchases.showManageSubscriptions()` from RevenueCat SDK
  - Android: open Google Play subscriptions URL via `Linking.openURL`

---

## Related Change: Update Paywall Comparison Table

The existing feature comparison table in `app/(tabs)/settings/paywall.tsx` must be updated to match the simplified set above. Retire the current rows (Maps, Places per map, Invite links, Manage roles) and replace with the four rows defined in this PRD (Places, Share maps, Multiple maps, Tags & filters).

The corresponding old i18n keys (`paywall.mapsFeature`, `paywall.placesFeature`, `paywall.inviteLinksFeature`, `paywall.manageRolesFeature`) must be removed from both `locales/en.json` and `locales/es.json` — not just unused but deleted to keep locale files clean.

---

## Analytics

Track the following PostHog events (see `docs/analytics.md` for conventions):

| Event | Trigger |
|---|---|
| `membership_screen_viewed` | Screen mounts |
| `membership_upgrade_tapped` | User taps "Upgrade to Premium" CTA |
| `membership_restore_tapped` | User taps "Restore purchases" |
| `membership_manage_subscription_tapped` | User taps "Manage subscription" |

Include a `plan` property (`'free'` or `'premium'`) on all events so funnels can be segmented by tier.

---

## i18n Requirements

All user-visible strings must have keys in both `locales/en.json` and `locales/es.json`.

New keys needed (namespace `membership`):
- `membership.title` — "Membership"
- `membership.currentPlan` — "Current plan"
- `membership.free` — "Free"
- `membership.placesUsed` — "Places used"
- `membership.upgradeButton` — "Upgrade to Premium"
- `membership.comparePlans` — "Compare plans"
- `membership.restorePurchases` — "Restore purchases"
- `membership.youArePremium` — "You're on Premium"
- `membership.whatsIncluded` — "What's included"
- `membership.manageSubscription` — "Manage subscription"
- `membership.manageSubscriptionHint` — "Opens App Store or Google Play"

Shared feature label keys (reused on both Membership and Paywall, namespace `features`):
- `features.places` — "Places"
- `features.shareMaps` — "Share maps"
- `features.shareMapsSubtitle` — "Send curated maps to anyone"
- `features.multipleMaps` — "Multiple maps"
- `features.multipleMapsSubtitle` — "Build and share collections"
- `features.tagsAndFilters` — "Tags & filters"
- `features.tagsAndFiltersSubtitle` — "Organize and find places fast"
- `features.unlimitedPlaces` — "Unlimited places"
- `features.unlimitedPlacesSubtitle` — "Save as many as you want"

Remove from both locale files: `paywall.mapsFeature`, `paywall.placesFeature`, `paywall.inviteLinksFeature`, `paywall.manageRolesFeature`.

---

## Data Requirements

| Data | Source | Notes |
|---|---|---|
| `profile.entitlement` | `useProfile()` hook | Determines which view to show |
| Place usage count (X) | New count query on `map_places` | `count` where `added_by = userId` (global across all maps); wrap in `hooks/use-place-count.ts`, cache key `['place-count', userId]`, `enabled: !!userId` |
| Annual price string | `useRevenueCat()` → `offerings.current.annual.product.priceString` | Omit CTA subtitle if null |
| Restore purchases | `restore.mutate()` from `useRevenueCat()` | Use the hook, not the raw lib function; hook handles cache invalidation |
| Manage subscription (iOS) | `Purchases.showManageSubscriptions()` | RevenueCat SDK method |
| Manage subscription (Android) | `Linking.openURL` to Play Store subscriptions | Standard deep link |

---

## Out of Scope (Deferred)

- Renewal date / next billing date on premium header
- Trial or promotional grant state
- Downgrade flow
- Family sharing / gifted subscriptions

---

## Files to Create / Modify

| File | Change |
|---|---|
| `app/(tabs)/settings/membership.tsx` | New screen |
| `app/(tabs)/settings/_layout.tsx` | Add `<Stack.Screen name="membership" />` — required for navigation |
| `app/(tabs)/settings/index.tsx` | Enable Membership row, add navigation |
| `app/(tabs)/settings/paywall.tsx` | Update comparison table; import `FeatureRow` from shared location |
| `components/feature-row/feature-row.tsx` | Extract `FeatureRow` from `paywall.tsx` into shared component |
| `hooks/use-place-count.ts` | New hook: count user's saved places |
| `locales/en.json` | Add `membership.*` and `features.*` keys; update `settings.rows.membership` to `"Membership"`; remove retired `paywall.*` feature keys |
| `locales/es.json` | Mirror all changes |

---

## Implementation Notes

- Follow existing settings sub-page patterns (see `settings/profile.tsx`, `settings/maps.tsx`)
- `FeatureRow` must be extracted from `paywall.tsx` (currently file-scoped) into `components/feature-row/feature-row.tsx` before building the Membership screen, so both screens can import it without duplication
- Update `settings.rows.membership` i18n value from `"Membership (Coming Soon)"` to `"Membership"` in both locale files
- Use `useProfile()` for entitlement check; no new auth logic needed
- Progress bar warning threshold is exactly ≥ 15 (75% of `FREE_TIER.maxPlaces` = 20)
- Paywall table update is a pure UI change — no logic or data changes required
- Run `npm run check:i18n` after locale changes to verify en/es parity
