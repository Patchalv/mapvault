# Deployment Runbook

Step-by-step procedures for deploying MapVault changes.

## Supabase: Migrations

When you've added or modified files in `supabase/migrations/`:

```bash
# Link to project (one-time, or after switching machines)
supabase link --project-ref <your-project-ref>

# Push all pending migrations
supabase db push
```

**Verify:** Check the Supabase Dashboard → Database → Migrations tab to confirm the latest migration applied.

**Rollback:** Supabase doesn't support automatic rollback. If a migration breaks something, write a new migration to reverse the changes and push again.

## Supabase: Edge Functions

Deploy individual functions after changes:

```bash
supabase functions deploy <function-name> --no-verify-jwt
```

Deploy all 7 at once:

```bash
for fn in create-map add-place accept-invite create-invite revenuecat-webhook rc-entitlement-drift-check delete-account; do
  supabase functions deploy "$fn" --no-verify-jwt
done
```

The `--no-verify-jwt` flag is required — the relay's JWT verification rejects ES256 tokens. Functions validate auth internally via `auth.getUser()`.

### Managing Secrets

```bash
# Set a secret
supabase secrets set KEY=value

# List current secrets
supabase secrets list
```

Server-side secrets (not in `.env`):

| Secret | Purpose |
|--------|---------|
| `REVENUECAT_WEBHOOK_SECRET` | Authenticates RevenueCat webhook requests |
| `REVENUECAT_SECRET_API_KEY` | Admin API key (used by `delete-account` and `rc-entitlement-drift-check`) |
| `REVENUECAT_PROJECT_ID` | RC project id (used by `rc-entitlement-drift-check`) |
| `RC_DRIFT_CHECK_INVOKE_SECRET` | Bearer for pg_cron → `rc-entitlement-drift-check`; must mirror `vault.secrets.rc_drift_check_invoke_secret`. See `docs/payments.md` → "Drift Health Check" for the first-time setup and rotation runbook. |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected — no manual setup needed.

### Verify a Deployment

Quick health check after deploying an Edge Function:

```bash
# Should return 401 (auth required) — confirms the function is live
curl -s -o /dev/null -w "%{http_code}" \
  https://<ref>.supabase.co/functions/v1/<function-name>
```

## App: Development Builds

Rebuild the dev client when native dependencies change (new SDK version, new native module, Expo upgrade). JS-only changes don't need a rebuild — just restart the dev server.

```bash
# Simulator
eas build --profile development:simulator --platform ios

# Physical device
eas build --profile development:device --platform ios

# Payment testing (uses production bundle ID)
eas build --profile development:payments --platform ios
```

Start the dev server:

```bash
# Standard development
npm run start:dev

# Payment testing (no variant = production bundle ID)
npx expo start --dev-client
```

See `docs/builds.md` for full profile details.

## App: Preview Builds

Internal distribution for testing before a production release.

```bash
eas build --profile preview --platform ios
```

Distribute the build link to testers. Preview builds use the `.preview` bundle ID and can coexist with dev and production builds on the same device.

## App: Production Release

### 1. Pre-flight checks

```bash
npx expo lint
npm run typecheck
```

Confirm all Supabase changes are deployed (migrations pushed, Edge Functions deployed).

### 2. Build

```bash
eas build --profile production --platform ios
```

Version auto-increments on each production build (configured in `eas.json` via `autoIncrement`).

### 3. Submit to App Store Connect

```bash
eas submit --profile production --platform ios
```

This uses the ASC API key at `./keys/AuthKey_6CYNGT76TF.p8` (configured in `eas.json`). The key file is gitignored.

### 4. App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com/)
2. Select MapVault → the new build should appear under TestFlight (processing takes a few minutes)
3. For TestFlight: add the build to a test group
4. For App Store release: go to App Store tab → select the build → fill in "What's New" → Submit for Review

## OTA Updates (EAS Update)

Push JS-only changes without a full rebuild. OTA updates work when you haven't changed native code, Expo SDK version, or native config in `app.config.ts`.

```bash
# Preview channel
eas update --branch preview --environment preview --message "Description of changes"

# Production channel
eas update --branch production --environment production --message "Description of changes"
```

> **`--environment` is required.** Without it, `eas update` does not load EAS-stored env vars and `EXPO_PUBLIC_*` values resolve to empty strings in the OTA bundle — silently disabling Sentry, PostHog, and RevenueCat. This caused the post-launch paywall outage and the ~5-week Sentry blackout. For native builds (`eas build`), `requireKey()` in `app.config.ts` throws fast if SDK keys are missing. For OTA updates there is no code-level catch — `--environment [env]` is the only safeguard, so always pass it explicitly.

**When OTA works:** JS/TS code changes, style changes, asset changes (images, fonts).

**When you need a new build:** New native module, Expo SDK upgrade, changes to `app.config.ts` native fields (permissions, entitlements, plugins), React Native version bump.

## Pre-Deploy Checklist

### Before any deploy

- [ ] `npx expo lint` passes
- [ ] `npm run typecheck` passes
- [ ] App runs correctly on simulator/device

### Before Supabase migration push

- [ ] Tested the SQL locally or reviewed carefully
- [ ] RLS policies included for any new tables
- [ ] No destructive changes to existing columns without a migration plan

### Before production release

- [ ] All Supabase migrations pushed
- [ ] All Edge Functions deployed
- [ ] Tested on preview build or dev device
- [ ] "What's New" text prepared (use `/changelog` skill)
- [ ] Screenshots updated if UI changed
