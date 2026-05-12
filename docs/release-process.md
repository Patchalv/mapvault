# Release Process

How to ship a new version of MapVault, from code complete to App Store.

## Release Types

| Type | What Changes | How to Ship |
|------|-------------|-------------|
| **JS-only update** | UI, styles, logic, assets | OTA via `eas update` |
| **Native update** | New native module, SDK upgrade, config changes | Full build via `eas build` + `eas submit` |

If unsure which type you need, see the OTA section in `docs/deployment.md`.

## Pre-Release Checklist

### Code

- [ ] `npx expo lint` passes
- [ ] `npm run typecheck` passes
- [ ] Tested on simulator or device
- [ ] No console errors or warnings (beyond expected ones like RevenueCat in dev)

### Supabase

- [ ] All migrations pushed: `supabase db push`
- [ ] All Edge Functions deployed (see `docs/deployment.md`)
- [ ] Server-side secrets up to date: `supabase secrets list`

### External Services

- [ ] RevenueCat webhook pointing to correct Edge Function URL
- [ ] Google Places API key restrictions match production bundle ID
- [ ] PostHog receiving events (check dashboard)

## OTA Release (JS-Only)

For changes that don't touch native code:

```bash
# Preview channel (for testing)
eas update --branch preview --environment preview --message "Brief description of changes"

# Production channel (live users)
eas update --branch production --environment production --message "Brief description of changes"
```

> **`--environment` is mandatory.** Without it, `eas update` does not load EAS-stored env vars and the OTA bundle ships with empty strings for every `EXPO_PUBLIC_*` value — silently breaking Sentry, PostHog, and RevenueCat. `app.config.ts` now uses `requireKey()` to fail loudly when this happens, but the rule still applies. Same for `--branch preview` / `--environment preview`.

Updates are downloaded on next app launch. No App Store review required.

## Full Release (App Store)

### 1. Build

```bash
eas build --profile production --platform ios
```

Version auto-increments. Build takes ~15 minutes on EAS.

### 2. Submit

```bash
eas submit --profile production --platform ios
```

Uses the ASC API key configured in `eas.json`. The build is uploaded to App Store Connect automatically.

### 3. TestFlight (Optional)

1. Open [App Store Connect](https://appstoreconnect.apple.com/) → MapVault → TestFlight
2. Wait for build processing (~5-10 minutes)
3. Add the build to your test group
4. Test on device before submitting for review

### 4. App Store Submission

1. In App Store Connect → App Store tab
2. Create a new version (or select the draft)
3. Select the build
4. Fill in "What's New" — use `/changelog` to generate this from recent commits
5. Update screenshots if the UI changed
6. Submit for Review

### 5. Post-Release

- Monitor Sentry for new crash reports
- Check PostHog for event volume (confirm users are updating)
- Watch RevenueCat dashboard for any payment issues

## Generating "What's New" Text

Use the `/changelog` skill to generate release notes from recent commits:

```
/changelog
```

This reads git history and drafts user-facing "What's New" text suitable for App Store Connect.

## Rollback

### OTA Update

Push a new update that reverts the change:

```bash
eas update --branch production --environment production --message "Revert: description"
```

Or republish a previous update (check `eas update:list` for update IDs).

### App Store Build

App Store builds can't be rolled back once released. Options:

1. Submit a new build with the fix (expedited review available for critical issues)
2. If the issue is JS-only, push an OTA update to override the broken build

## Version Numbers

- **Version** (`version` in app.config.ts): Semantic version shown to users (e.g., `1.0.0`). Update manually for major releases.
- **Build number**: Auto-incremented by EAS on each production build. Don't set manually.
- **Runtime version**: Tied to SDK version (`sdkVersion` policy). OTA updates only apply to builds with the same runtime version.
