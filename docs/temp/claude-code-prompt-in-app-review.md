# Task: Implement In-App Review Prompts (with feature flag)

## Context

We want to add native in-app review prompts using `expo-store-review`. The feature should be fully wired up but **disabled behind a feature flag** since we're still in pilot phase and don't want early reviews from buggy builds.

## Step 1: Install dependency

```bash
npx expo install expo-store-review
```

## Step 2: Create `src/hooks/useAppReview.ts`

Create a hook with the following behavior:

- Export a `REVIEW_PROMPTS_ENABLED` constant, defaulting to `false`. Add a comment: `// Set to true when pilot is complete and app is stable for public ratings`
- If `REVIEW_PROMPTS_ENABLED` is `false`, `maybeRequestReview` should return immediately (no-op).
- Check `StoreReview.isAvailableAsync()` — return early if unavailable.
- Enforce a **90-day cooldown** between requests using AsyncStorage (key: `mapvault_last_review_request`). Read the stored timestamp, calculate days elapsed, return early if under 90 days.
- Call `StoreReview.requestReview()`.
- Write `Date.now().toString()` to AsyncStorage after requesting.
- Log the trigger: `[AppReview] Requested review after trigger: ${trigger}`
- Wrap everything in try/catch — never let review logic crash the app. On error, `console.warn` and return.

Define a type for triggers:
```typescript
type ReviewTrigger = 'place_visited' | 'places_saved_milestone' | 'directions_after_filter';
```

Export:
```typescript
export function useAppReview(): {
  maybeRequestReview: (trigger: ReviewTrigger) => Promise<void>;
};
```

## Step 3: Wire up trigger — place marked as visited

Find where the user toggles a place's visited status to `true`. After the state is persisted and UI updated, add a `setTimeout` of 1500ms that calls `maybeRequestReview('place_visited')`.

## Step 4: Wire up trigger — 10th place saved

Find the save-place flow. After a place is successfully saved, query the user's total saved places count. If it equals exactly 10, add a `setTimeout` of 1500ms that calls `maybeRequestReview('places_saved_milestone')`.

## Step 5: Wire up trigger — directions after filtering (optional)

If the place detail screen already knows whether the user navigated from a filtered view (e.g. via a route param or context), then in the "open directions" handler, check that flag. If true, add a `setTimeout` of 2000ms that calls `maybeRequestReview('directions_after_filter')`.

If there's no easy way to determine whether the user came from a filtered view, **skip this trigger entirely** — don't over-engineer it. The first two triggers are sufficient.

## Step 6: Add "Rate MapVault" button in Settings

In the Settings screen, add a row/button labeled "Rate MapVault":

- Call `StoreReview.hasAction()` — only render the button if it returns `true`.
- On press, open the store page via `Linking.openURL(StoreReview.storeUrl()!)`.
- This button should be visible **regardless of the feature flag** — it's a manual action the user chooses, not an automated prompt.

## Important rules

- **No custom modal before the native dialog.** Do not show "Are you enjoying MapVault?" or any gating UI — Apple rejects this.
- **No review requests on app launch or on a timer.**
- **No tracking of whether the user actually reviewed.** The APIs don't expose this.
- **All review logic must be wrapped in try/catch.** A failure here must never affect app functionality.
