# PRD: Settings Page

**Date:** 2026-03-25
**Status:** Ready for implementation

---

## Context

The current "Profile" tab is overloaded — it mixes user identity, map management, upgrade prompts, and utility links into a single scrollable screen. As the app grows (Manage Maps, Membership tiers, etc.), this needs a clear hierarchy. The Settings page becomes the new root of this tab, providing a clean entry point that organizes all user-facing controls into logical groups. The current profile screen is preserved intact and becomes a sub-page.

---

## Goals

- Give users a clear, organized hub for app-wide settings and account management
- Surface the Premium upgrade CTA prominently but non-intrusively for free users
- Enable quick active-map switching without navigating deep into the app
- Establish placeholder routes for Manage Maps and Membership (to be built in future milestones)
- Rename the "Profile" tab to "Settings" to better reflect its expanded purpose

---

## Out of Scope (Future Milestones)

- **Manage Maps page** — the row exists as a placeholder only
- **Membership page** — the row exists as a placeholder only
- Any changes to the existing profile screen content

---

## Screen Design

### Settings Screen (`app/(tabs)/settings/index.tsx`)

Scrollable screen with grouped list sections. Uses the existing NativeWind styling conventions.

#### Header
- Title: "Settings"
- No back button (root tab screen)

#### Section 0: Premium Upgrade CTA
- **Visibility:** Only shown when `profile.entitlement === 'free'`
- **Loading state:** Hidden while profile data is loading (default to hidden)
- **Design:** Solid colored card — use `bg-indigo-600` (NativeWind class)
- **Copy:** "Premium Membership" / "Upgrade for more features"
- **Tap action:** `router.push('/(tabs)/settings/paywall?trigger=settings_upgrade_cta')`
- **Hidden for:** Premium users and while profile is loading (no empty space — section is not rendered)

#### Section 1: Maps
Label: "Maps"

| Row | Icon | Title | Right value | Chevron | Tap Action |
|-----|------|-------|-------------|---------|------------|
| Manage Maps | `layers-outline` | "Manage Maps (Coming Soon)" | — | Yes | No-op |
| My Map | `location-outline` | "My Map" | Active map name (muted) | Yes | Open `MapSwitcherSheet` bottom sheet |

**My Map row layout:**
```
┌─────────────────────────────────────────────┐
│  My Map                    City Guide  ›     │
│  Controls which map is                       │
│  shown on Explore.                           │
└─────────────────────────────────────────────┘
```
- Primary label: "My Map" (normal weight)
- Description: *"Controls which map is shown on Explore."* in smaller muted text below the label
- Right value: active map name in muted text, pulled from `activeMapName` via `useActiveMap()`
- If `isAllMaps === true`, right value shows "All Maps"
- Chevron on the far right

#### Section 2: Account
Label: "Account"

| Row | Icon | Title | Badge | Right | Tap Action |
|-----|------|-------|-------|-------|------------|
| Profile | `person-outline` | "Profile" | — | Chevron | `router.push('/(tabs)/settings/profile')` |
| Membership | `diamond-outline` | "Membership (Coming Soon)" | "PREMIUM" (if premium) | Chevron | No-op |

**Membership row details:**
- Show a small "PREMIUM" pill badge (amber/gold) if `entitlement === 'premium'`
- No badge if `entitlement === 'free'`

#### Section 3: More
Label: "More"

| Row | Icon | Tap Action |
|-----|------|-----------|
| Rate & Review | `star-outline` | Open App Store (iOS) or Play Store (Android) — see details below |
| Privacy Policy | `shield-checkmark-outline` | `Linking.openURL('https://www.mapvault.app/privacy')` |
| Terms of Service | `document-text-outline` | `Linking.openURL('https://www.mapvault.app/terms')` |
| Help | `help-circle-outline` | `Linking.openURL('https://www.mapvault.app/contact')` |

**Rate & Review link logic:**
```
if (Platform.OS === 'ios') {
  Linking.openURL('https://apps.apple.com/app/id6759535400?action=write-review')
} else {
  Linking.openURL('https://play.google.com/store/apps/details?id=com.patrickalvarez.mapvault&showAllReviews=true')
}
```

#### Footer: Sign Out
- Subtle text button at the bottom of the scroll view
- Copy: "Log out" (match existing profile page string key)
- No confirmation dialog — tapping signs out immediately
- Logic:
  1. `await logOutUser()` (from `lib/revenuecat.ts`)
  2. `await supabase.auth.signOut()`
  3. On error: show alert

---

## New Component: MapSwitcherSheet

**File:** `components/map-switcher-sheet/map-switcher-sheet.tsx`

A `@gorhom/bottom-sheet` that allows the user to select their active map.

**Props:**
```typescript
interface MapSwitcherSheetProps {
  ref: React.RefObject<BottomSheetModal>
}
```
The Settings screen holds a `bottomSheetRef` and calls `bottomSheetRef.current?.present()` when the My Map row is tapped, and `bottomSheetRef.current?.dismiss()` after a selection is made.

**Data:**
- Uses `useActiveMap()` hook: `{ maps, activeMapId, setActiveMap, isAllMaps, isSettingMap }`

**List items:**
- "All Maps" option at the top (maps to `ALL_MAPS_ID` sentinel from `lib/constants.ts`)
- One row per map in `maps` array, showing map name
- Active item shows a checkmark or green indicator

**Tap action:**
- Close the sheet immediately (optimistic — do not wait for mutation to resolve)
- Call `setActiveMap(mapId, { source: 'settings' })` after closing
- If the mutation fails, TanStack Query will revert the cache and the "My Map" subtitle will self-correct on the next render; show no explicit error (silent failure is acceptable here)

**`setActiveMap` signature update required:**
The existing `hooks/use-active-map.ts` hardcodes `source: 'dropdown'` in its `map_switched` analytics call. Update the hook to accept an optional `source` parameter (default: `'dropdown'`) — this is backwards-compatible, no existing call sites need to change. The `MapSwitcherSheet` passes `'settings'` for correct attribution.

**Follow existing bottom sheet patterns** in the codebase (e.g., `@gorhom/bottom-sheet` usage in filter/place sheets).

---

## Route & Navigation Changes

### Directory Rename
`app/(tabs)/profile/` → `app/(tabs)/settings/`

### File Changes

| Before | After | Notes |
|--------|-------|-------|
| `app/(tabs)/profile/index.tsx` | `app/(tabs)/settings/index.tsx` | **New Settings screen** (rewrite) |
| `app/(tabs)/profile/_layout.tsx` | `app/(tabs)/settings/_layout.tsx` | Update header title to "Settings" |
| — | `app/(tabs)/settings/profile.tsx` | **Current `profile/index.tsx` content moved here** — no changes to file content |
| `app/(tabs)/profile/paywall.tsx` | `app/(tabs)/settings/paywall.tsx` | File moved, no content changes |
| `app/(tabs)/profile/delete-account.tsx` | `app/(tabs)/settings/delete-account.tsx` | File moved, no content changes |
| `app/(tabs)/profile/map/[id]/index.tsx` | `app/(tabs)/settings/map/[id]/index.tsx` | File moved, no content changes |
| `app/(tabs)/profile/map/[id]/invites.tsx` | `app/(tabs)/settings/map/[id]/invites.tsx` | File moved, no content changes |
| `app/(tabs)/profile/map/[id]/members.tsx` | `app/(tabs)/settings/map/[id]/members.tsx` | File moved, no content changes |

### Tab Config Update (`app/(tabs)/_layout.tsx`)
- Change `name="profile"` → `name="settings"`
- Change `title: t('tabs.profile')` → `title: t('tabs.settings')`
- Change tab icon to `settings-outline` from Ionicons (`@expo/vector-icons`)

### Stack Screen Options (`app/(tabs)/settings/_layout.tsx`)
Add a `<Stack.Screen>` entry for the `profile` sub-screen with `title: 'Profile'` and `headerShown: true`. This is where back navigation and the header title are configured — not in the screen file itself.

### Router References to Update
Search codebase for any `router.push` / `router.replace` / `<Link href=` pointing to `/(tabs)/profile/...` and update to `/(tabs)/settings/...`. Key locations:
- `hooks/use-freemium-gate.ts` — redirects to paywall on freemium error
- Any component using `router.push('/(tabs)/profile/paywall')`
- Any component using `router.push('/(tabs)/profile/map/...')`

---

## i18n Keys to Add

Add to both `locales/en.json` and `locales/es.json`:

- Add `tabs.settings`
- Remove `tabs.profile` — now unused (tab renamed to "settings"; profile sub-screen title is set via `_layout.tsx`, not the tabs i18n key)

```json
{
  "tabs": {
    "settings": "Settings"
  },
  "settings": {
    "title": "Settings",
    "premiumCta": {
      "title": "Premium Membership",
      "subtitle": "Upgrade for more features"
    },
    "sections": {
      "maps": "Maps",
      "account": "Account",
      "more": "More"
    },
    "rows": {
      "manageMaps": "Manage Maps (Coming Soon)",
      "myMap": "My Map",
      "myMapDescription": "Controls which map is shown on Explore.",
      "profile": "Profile",
      "membership": "Membership (Coming Soon)",
      "rateReview": "Rate & Review",
      "privacyPolicy": "Privacy Policy",
      "termsOfService": "Terms of Service",
      "help": "Help",
      "signOut": "Log out",
      "allMaps": "All Maps"
    }
  }
}
```

---

## Existing Code to Reuse

| Utility | File | Usage |
|---------|------|-------|
| `useActiveMap()` | `hooks/use-active-map.ts` | My Map subtitle + MapSwitcherSheet data/mutations |
| `useProfile()` | `hooks/use-profile.ts` | `entitlement` check for Premium CTA visibility |
| `logOutUser()` | `lib/revenuecat.ts` | Sign out action |
| `supabase.auth.signOut()` | `lib/supabase.ts` | Sign out action |
| `ALL_MAPS_ID` | `lib/constants.ts` | Map switcher sentinel value |
| `@gorhom/bottom-sheet` | (installed) | MapSwitcherSheet component |
| `expo-store-review` | (installed — **do not uninstall**) | Still used by existing profile page rate prompt |
| `Linking` | `react-native` | External URL opens (Rate & Review, Privacy, ToS, Help) |
| `Platform` | `react-native` | Detect iOS vs Android for Rate & Review URL |
| Paywall trigger pattern | `app/(tabs)/settings/paywall.tsx` | `router.push('...paywall?trigger=settings_upgrade_cta')` |

---

## Analytics Events to Add

| Event | When | Properties |
|-------|------|-----------|
| `settings_viewed` | Settings screen mounted | — |
| `settings_upgrade_cta_tapped` | Premium CTA tapped | `{ entitlement: 'free' }` |
| `settings_map_switcher_opened` | My Map row tapped | — |
| `settings_rate_review_tapped` | Rate & Review tapped | — |
| `settings_external_link_tapped` | Any More section link tapped | `{ link: 'privacy' \| 'terms' \| 'help' }` |

---

## Verification

1. **Run dev server:** `npm run start:dev`
2. **Tab label:** Bottom tab now shows "Settings" with `settings-outline` icon
3. **Premium CTA:** Sign in as free user → see CTA card; tap → paywall opens; sign in as premium → CTA absent; while loading → CTA hidden
4. **My Map row:** Right-aligned value shows correct active map name; description text visible below label; tap → bottom sheet opens; select map → right-aligned value updates; select "All Maps" → value shows "All Maps"
5. **Manage Maps row:** Displays "(Coming Soon)" in title; tap → no action, no crash
6. **Profile row:** Tap → current profile screen (unchanged content)
7. **Membership row:** Displays "(Coming Soon)" in title; tap → no action, no crash; premium badge visible for premium users
8. **Rate & Review:** Tap on iOS → App Store review page opens; tap on Android → Play Store page opens
9. **More links:** Tap Privacy/ToS/Help → browser opens correct URLs
10. **Sign Out:** Tap → user is signed out and redirected to auth screen
11. **Type check:** `npx tsc --noEmit` passes with no errors
12. **i18n check:** `npm run check:i18n` passes
