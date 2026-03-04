# Payments & Freemium System

## Architecture Overview

MapVault uses a freemium model with an annual subscription at €9.99/year via RevenueCat (iOS In-App Purchases + Google Play Billing).

### Entitlement Flow

```
iOS:     User taps Subscribe → RevenueCat SDK → Apple StoreKit → Receipt validated
Android: User taps Subscribe → RevenueCat SDK → Google Play Billing → Purchase validated
    → RevenueCat fires webhook → Edge Function updates profiles.entitlement
    → Client reads updated entitlement on next query/refresh
```

### Free Tier Limits

Defined in `lib/constants.ts`:
- **1 map** (owned maps only — contributor/member access to shared maps doesn't count)
- **20 places** (total across all maps, counted by `added_by`)
- **Cannot create invites** (sharing is premium-only)
- **Cannot manage roles** (changing contributor ↔ member is premium-only)

### Key Files

| File | Role |
|---|---|
| `lib/revenuecat.ts` | SDK wrapper: configure (platform-aware API key), identify, purchase, restore, getOfferings |
| `hooks/use-revenuecat.ts` | React hook: offerings query, purchase/restore mutations, real-time listener |
| `hooks/use-freemium-gate.ts` | Catches `FREEMIUM_LIMIT_EXCEEDED` errors from Edge Functions, shows upgrade alert |
| `app/(tabs)/profile/paywall.tsx` | Paywall screen: feature comparison, annual pricing, subscribe/restore buttons |
| `app/(tabs)/profile/index.tsx` | Profile screen: entitlement badge, map creation gating |
| `supabase/functions/revenuecat-webhook/index.ts` | Webhook: receives RevenueCat events (both platforms), updates `profiles.entitlement` |
| `supabase/functions/create-map/index.ts` | Edge Function: enforces 1-map limit for free users |
| `supabase/functions/add-place/index.ts` | Edge Function: enforces 20-place limit for free users |
| `supabase/functions/create-invite/index.ts` | Edge Function: enforces premium-only invite creation |
| `hooks/use-create-invite.ts` | Mutation hook for creating invite links via Edge Function |
| `hooks/use-update-member-role.ts` | Mutation hook for changing contributor ↔ member roles |
| `hooks/use-map-role.ts` | Query hook returning current user's role on a map |
| `lib/constants.ts` | Free tier limits, entitlement values, role constants, error codes |

### How Entitlements Work

1. **Database source of truth:** `profiles.entitlement` column (`'free'` or `'premium'`)
2. **Server-side enforcement:** Edge Functions (`create-map`, `add-place`, `create-invite`) check entitlement before mutations. Free users exceeding limits get a `403` with code `FREEMIUM_LIMIT_EXCEEDED`.
3. **Client-side display:** The profile hook reads entitlement to show badge and gate UI. The `useFreemiumGate` hook catches limit errors from mutations and shows an upgrade alert.
4. **Webhook updates:** RevenueCat sends events (from both Apple and Google) to the webhook Edge Function, which updates `profiles.entitlement` directly using the Supabase service role key.
5. **Client-side sync fallback:** `use-revenuecat.ts` listens for `CustomerInfoUpdate` events and syncs entitlement to the profile cache, so the UI updates even before the webhook roundtrip completes.

### Platform-Aware API Key Selection

`lib/revenuecat.ts` selects the correct RevenueCat API key based on `Platform.OS`:
- **iOS:** Uses `revenueCatAppleApiKey` from `app.config.ts` extra
- **Android:** Uses `revenueCatGoogleApiKey` from `app.config.ts` extra

Both keys are empty in development builds (`APP_VARIANT=development`), disabling RevenueCat on both platforms during normal dev work.

### Webhook Event Handling

| Event Type | Action |
|---|---|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE` | Set `entitlement = 'premium'` |
| `EXPIRATION`, `REFUND` | Set `entitlement = 'free'` |
| `CANCELLATION`, `BILLING_ISSUE`, etc. | No action (subscription still active until period ends) |
| Anonymous user (`$RCAnonymousID:*`) | Skipped — no DB update |

The webhook is platform-agnostic — RevenueCat normalizes events from both Apple and Google into the same format.

### Paywall

- **Annual-only** subscription at €9.99/year
- Price loaded dynamically from RevenueCat offerings (`offerings.current.annual`)
- Falls back to hardcoded `€9.99/year` if offerings fail to load
- Shows "You're Premium!" screen if user already has premium entitlement
- Restore Purchases button for users who reinstall or switch devices

---

## External Service Configuration

### RevenueCat Dashboard

- **Project:** MapVault
- **Apps:**
  - **iOS:** Production (`com.patrickalvarez.mapvault`) — connected to App Store Connect
  - **Android:** Google Play (`com.patrickalvarez.mapvault`) — connected to Google Play Console
- **Product:** `com.patrickalvarez.mapvault.premium.annual` (annual subscription, same ID on both platforms)
- **Entitlement:** `premium` — both iOS and Android products attached
- **Offering:** `default` with package `$rc_annual` pointing to both platform products
- **Webhook:** Configured to POST to `https://<ref>.supabase.co/functions/v1/revenuecat-webhook` with Bearer token auth (handles events from both platforms)

### App Store Connect (iOS)

- **Subscription group:** "MapVault Premium"
- **Product ID:** `com.patrickalvarez.mapvault.premium.annual`
- **Sandbox testers:** Create at Users and Access > Sandbox > Test Accounts

### Google Play Console (Android)

- **App:** MapVault (`com.patrickalvarez.mapvault`)
- **Subscription product ID:** `com.patrickalvarez.mapvault.premium.annual` (matches iOS)
- **Price:** €9.99/year
- **License testers:** Add test Gmail accounts at Setup > License testing
- **Service account:** JSON key at `./keys/google-play-service-account.json` — used by both EAS Submit and RevenueCat for server-to-server communication

### Supabase

- **Edge Function secrets** (set via dashboard or CLI):
  - `REVENUECAT_WEBHOOK_SECRET` — must match the Bearer token configured in RevenueCat webhook settings
  - `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` — auto-injected, no manual setup needed
- **Deploy edge functions:**
  ```bash
  supabase functions deploy revenuecat-webhook
  supabase functions deploy create-map
  supabase functions deploy add-place
  supabase functions deploy create-invite
  ```

### Environment Variables

| Variable | Where | Purpose |
|---|---|---|
| `EXPO_PUBLIC_REVENUECAT_API_KEY` | `.env` + EAS secrets | RevenueCat Apple API key, read at build time |
| `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` | `.env` + EAS secrets | RevenueCat Google API key, read at build time |
| `REVENUECAT_WEBHOOK_SECRET` | Supabase Edge Function secrets | Webhook auth, server-side only |

---

## Testing Guide

### Development Build Behavior

RevenueCat is **completely disabled** in development builds (`.dev` bundle ID) on both iOS and Android. The SDK is never initialized because the API keys are bound to the production bundle ID. This means:
- No RevenueCat errors or logs in the console
- Paywall shows the fallback price (€9.99) with the subscribe button disabled (no package)
- Entitlement badge still works (reads from database)
- Freemium gates still work (enforced server-side via Edge Functions)

This is by design. **Use the `development:payments` build profile** on a physical device for all purchase testing (see `docs/builds.md`).

### Webhook Testing (No Device Needed)

After deploying edge functions and setting the webhook secret, test with curl:

**Auth check (wrong secret):**
```bash
curl -s -X POST https://<ref>.supabase.co/functions/v1/revenuecat-webhook \
  -H "Authorization: Bearer wrong-secret" \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"INITIAL_PURCHASE","app_user_id":"test"}}'
# Expected: 401 {"error":"Unauthorized"}
```

**Grant event (INITIAL_PURCHASE):**
```bash
curl -s -X POST https://<ref>.supabase.co/functions/v1/revenuecat-webhook \
  -H "Authorization: Bearer <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"INITIAL_PURCHASE","app_user_id":"<user-uuid>"}}'
# Expected: 200 — profiles.entitlement = 'premium'
```

**Revoke event (EXPIRATION):**
```bash
curl -s -X POST https://<ref>.supabase.co/functions/v1/revenuecat-webhook \
  -H "Authorization: Bearer <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"EXPIRATION","app_user_id":"<user-uuid>"}}'
# Expected: 200 — profiles.entitlement = 'free'
```

**Anonymous user skip:**
```bash
curl -s -X POST https://<ref>.supabase.co/functions/v1/revenuecat-webhook \
  -H "Authorization: Bearer <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"INITIAL_PURCHASE","app_user_id":"$RCAnonymousID:abc123"}}'
# Expected: 200 {"message":"Skipped anonymous user"}
```

**No-action event (CANCELLATION):**
```bash
curl -s -X POST https://<ref>.supabase.co/functions/v1/revenuecat-webhook \
  -H "Authorization: Bearer <your-secret>" \
  -H "Content-Type: application/json" \
  -d '{"event":{"type":"CANCELLATION","app_user_id":"<user-uuid>"}}'
# Expected: 200 {"message":"No action for event type: CANCELLATION"}
```

### On-Device Testing — iOS

**Prerequisites:**
1. Build with `eas build --profile development:payments --platform ios` and install on physical device
2. Start dev server with `npx expo start --dev-client` (NOT `npm run start:dev` — that sets the dev variant)
3. Create a sandbox tester in App Store Connect (Users and Access > Sandbox > Test Accounts)
4. Sign into the sandbox account on device: Settings > App Store > Sandbox Account (iOS 16+)
5. Ensure `profiles.entitlement = 'free'` for your test user in Supabase

**Flow A — Free Tier Baseline:**
1. Sign in as test user (entitlement = free)
2. Profile tab shows "Free" badge (tappable)
3. Tap badge → navigates to paywall
4. Try creating a second map → "Map Limit Reached" alert
5. Try adding 21st place → freemium gate alert

**Flow B — Paywall & Offerings:**
1. Navigate to paywall (Profile > tap "Free" badge)
2. Should see loading spinner, then real App Store price (not fallback €9.99)
3. Subscribe button should be enabled
4. If price shows €9.99 with no spinner, offerings failed — check Metro logs

**Flow C — Sandbox Purchase:**
1. Tap Subscribe on paywall
2. iOS shows StoreKit purchase sheet (sandbox = instant, no real charge)
3. Confirm purchase
4. Verify: "Welcome to Premium!" alert, profile badge changes to "Premium"
5. Check Supabase: `profiles.entitlement = 'premium'`
6. Check RevenueCat dashboard: user shows `INITIAL_PURCHASE` event

**Flow D — Limits Lifted:**
1. With premium entitlement: create additional maps → no limit alert
2. Add places beyond 20 → no freemium gate

**Flow E — Restore Purchases:**
1. Sign out, sign back in → badge should show "Premium" (RevenueCat `logIn()` syncs)
2. Manually set `entitlement = 'free'` in Supabase
3. Go to paywall, tap "Restore Purchases"
4. Verify: "Restored!" alert, profile updates to premium

**Flow F — Sandbox Renewal & Expiration (iOS only):**

Sandbox subscription timing is accelerated:

| Real Duration | Sandbox Duration |
|---|---|
| 1 year | ~1 hour |
| Renewal | ~5 minutes |

1. After purchase, observe RevenueCat dashboard for RENEWAL events
2. Each renewal triggers webhook — entitlement stays 'premium'
3. After ~6 renewals, sandbox stops renewing → EXPIRATION event fires
4. Verify entitlement reverts to 'free'

**Flow G — Invite Creation Gating:**
1. As free owner: tap "Invite" on a map → "Sharing is a Premium feature" alert with upgrade option
2. Subscribe to premium
3. Tap "Invite" again → invite creation bottom sheet appears
4. Select role (contributor/member), create invite → link generated
5. Verify in Supabase: `map_invites` row created with correct role

**Flow H — Role Management:**
1. As premium owner with at least one shared map member
2. Tap on a member → role change option appears
3. Change contributor → member → verify member can no longer add places
4. Change member → contributor → verify member can now add places
5. As free owner: role change UI should be hidden or gated

### On-Device Testing — Android

**Prerequisites:**
1. Build with `eas build --profile development:payments --platform android` and install APK on physical device
2. Start dev server with `npx expo start --dev-client` (NOT `npm run start:dev` — that sets the dev variant)
3. Add your Gmail account as a license tester in Google Play Console (Setup > License testing)
4. Ensure `profiles.entitlement = 'free'` for your test user in Supabase
5. The app must be published to at least the internal test track in Google Play Console

**Flow A — Free Tier Baseline:**
Same as iOS — freemium gates are platform-agnostic.

**Flow B — Paywall & Offerings:**
1. Navigate to paywall (Profile > tap "Free" badge)
2. Should see loading spinner, then real Google Play price
3. Subscribe button should be enabled
4. If offerings fail — check that the Google Play app is configured in RevenueCat and the product is published

**Flow C — License Tester Purchase:**
1. Tap Subscribe on paywall
2. Google Play shows purchase sheet (license tester = no real charge)
3. Confirm purchase
4. Verify: "Welcome to Premium!" alert, profile badge changes to "Premium"
5. Check Supabase: `profiles.entitlement = 'premium'`
6. Check RevenueCat dashboard: user shows `INITIAL_PURCHASE` event

**Flow D–H:** Same as iOS flows — the entitlement system is identical on both platforms.

**Google Play test subscription timing:**

| Real Duration | Test Duration |
|---|---|
| 1 year | 30 minutes |
| Renewal | ~5 minutes |

Test subscriptions renew up to 6 times, then cancel automatically.
