# In-App Reviews

## Overview

MapVault uses [`expo-store-review`](https://docs.expo.dev/versions/latest/sdk/storereview/) to prompt users with the native App Store / Play Store review dialog. The system is **feature-flagged** (currently off) and enforces a **90-day cooldown** between prompts. A manual "Rate MapVault" button on the profile screen is always available regardless of the flag.

## Key Files

| File | Role |
|---|---|
| `lib/feature-flags.ts` | `FEATURE_FLAGS.reviewPromptsEnabled` — master on/off switch |
| `lib/constants.ts` | `APP_REVIEW` block — cooldown duration (90 days) and AsyncStorage key |
| `hooks/use-app-review.ts` | `useAppReview` hook — all gating logic and native dialog call |
| `app/(tabs)/explore/index.tsx` | Trigger: place marked as visited |
| `app/(tabs)/add/save.tsx` | Trigger: 10th place saved milestone |
| `app/(tabs)/profile/index.tsx` | Manual "Rate MapVault" button |

## How It Works

The `useAppReview` hook exposes a single function, `maybeRequestReview(trigger)`, which runs this flow:

1. **Feature flag check** — bail if `FEATURE_FLAGS.reviewPromptsEnabled` is `false`
2. **Platform availability** — `StoreReview.isAvailableAsync()` checks OS support
3. **Cooldown check** — reads last prompt timestamp from AsyncStorage; bail if < 90 days
4. **Request review** — `StoreReview.requestReview()` shows the native dialog
5. **Persist timestamp** — saves `Date.now()` to AsyncStorage for cooldown tracking
6. **Track event** — `track('review_prompted', { trigger })`

The entire flow is wrapped in try/catch — failures are logged but never crash the app.

## Triggers

| Trigger | Screen | Action | Delay | Status |
|---|---|---|---|---|
| `place_visited` | Explore | User marks a place as visited | 1.5s | Active |
| `places_saved_milestone` | Save Place | User saves their 10th place total | 1.5s | Active |
| `directions_after_filter` | — | — | — | Planned, not implemented |

Both active triggers use a 1.5-second `setTimeout` delay so the review dialog doesn't interrupt the primary action's feedback.

## Analytics

| Event | Properties | When |
|---|---|---|
| `review_prompted` | `trigger`: `'place_visited' \| 'places_saved_milestone'` | After native dialog is shown |

## Apple & Google Rules

The native review APIs impose strict constraints:

- **No custom pre-prompt modal** — the OS dialog must be the first thing the user sees
- **No review on app launch or timer** — must be triggered by a meaningful user action
- **Can't detect actual submission** — the API doesn't tell you if the user left a review
- **Rate-limited by the OS** — Apple/Google may silently suppress the dialog even if our code requests it

Our implementation complies with all of these by only triggering after genuine user actions and wrapping everything in try/catch.

## Enabling

Flip the feature flag in `lib/feature-flags.ts`:

```typescript
export const FEATURE_FLAGS = {
  reviewPromptsEnabled: true, // ← change from false to true
} as const;
```

This can be shipped via EAS Update (OTA) — the flag is a regular JS constant bundled into the JS bundle, not a native config value.
