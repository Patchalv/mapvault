# Android Launch — Google Play Store Publication

Complete guide for publishing MapVault on Google Play. The codebase is already cross-platform — this covers external service setup, Play Store compliance, and the submission workflow.

**Timeline:** ~17-23 days total. The 14-day closed testing gate (Phase 7.3) is the critical path — start it as early as possible.

---

## Phase 1: Google Play Console Setup

You need a Google Play Developer account ($25 one-time fee). **Personal accounts require 14 days of closed testing with 12+ testers before production access is granted.**

### 1.1 Create the App

1. Go to https://play.google.com/console
2. Create app:
   - App name: `MapVault`
   - Default language: English (US)
   - Free app (premium is IAP, not paid app)
3. Package name `com.patrickalvarez.mapvault` locks on first AAB upload

### 1.2 Google Play App Signing

1. Go to Release > Setup > App signing
2. Choose **"Use Google-generated key"** (recommended for EAS — EAS uploads with an upload key, Google re-signs with their key)

---

## Phase 2: Service Account (for automated uploads)

### 2.1 Create Service Account

1. Go to **Google Cloud Console** > IAM & Admin > Service Accounts > Create Service Account
2. Name: `mapvault-play-upload`
3. **Do NOT assign IAM roles here** — permissions come from Play Console
4. Go to Keys tab > Add Key > Create new key > JSON
5. Save the downloaded JSON file as `.keys/google-play-service-account.json` in the project root

### 2.2 Link to Play Console

1. Play Console > Setup > API access > Link Cloud project
2. Find the service account > click "Manage Play Console permissions"
3. Grant these permissions (scoped to the MapVault app):
   - Release to production, exclude devices, and use Play App Signing
   - Release apps to testing tracks
   - Manage testing tracks and edit tester lists
   - Manage orders and subscriptions (needed by RevenueCat)
4. **Wait up to 24h** for permissions to propagate

---

## Phase 3: First Build + Upload

### 3.1 First Production Build

```bash
eas build --platform android --profile production
```

EAS prompts for Android Keystore setup on the first run, then produces an AAB.

### 3.2 Manual First Upload

The first AAB must be uploaded manually (bootstraps the app for `eas submit`):

1. Download AAB from the EAS dashboard
2. Play Console > Testing > Internal testing > Create new release
3. Upload AAB, add release notes, start rollout

### 3.3 Verify `eas submit`

After manual upload, test automated submission:

```bash
eas submit --platform android --profile production
```

The current `eas.json` targets the `internal` track. Change `submit.production.android.track` to `"production"` when ready to ship.

---

## Phase 4: RevenueCat + In-App Purchases

### 4.1 Create Subscription in Play Console

1. Monetize > Products > Subscriptions > Create subscription
2. Product ID: `com.patrickalvarez.mapvault.premium.annual` (must match iOS)
3. Base plan: 1 year, EUR 9.99
4. Activate the subscription

### 4.2 Add Google Play App in RevenueCat

1. RevenueCat > Project > Apps > + New > Google Play Store
2. Package name: `com.patrickalvarez.mapvault`
3. Upload `.keys/google-play-service-account.json` for server-to-server validation

### 4.3 Map Product to Entitlements

1. Products > + New > Import from Google Play
2. Entitlements > `premium` > Attach Google product
3. Offerings > `default` > `$rc_annual` > Add Google product

### 4.4 Set API Key

1. Copy the Google API key from RevenueCat dashboard (starts with `goog_`)
2. Update `.env`:
   ```
   EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=goog_xxxxx
   ```
3. Set EAS secret:
   ```bash
   eas secret:create --name EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY --value goog_xxxxx --scope project
   ```

### 4.5 Add License Testers

1. Play Console > Setup > License testing
2. Add test Gmail accounts (can make purchases without being charged)

---

## Phase 5: Play Store Listing + Compliance

### 5.1 Main Store Listing

| Field | Value |
|-------|-------|
| App name (30 chars max) | `MapVault` |
| Short description (80 chars max) | `Save and rediscover place recommendations from friends in your city.` |
| Full description | Adapt from `store.config.json` iOS description |
| Screenshots | Min 2 phone screenshots (16:9 or 9:16, 320-3840px — reuse iOS if size-compatible) |
| Feature graphic (required) | 1024x500 PNG — **must create**, no iOS equivalent |
| App icon | 512x512 PNG |

### 5.2 Store Settings

- Category: **Maps & Navigation** (primary)
- Contact email (required)
- Privacy policy: `https://mapvault.app/privacy`
- Website: `https://mapvault.app`

### 5.3 Content Rating (IARC Questionnaire)

- No violence, sexual content, or controlled substances
- Yes: user interaction (shared maps), location used, digital purchases
- Expected rating: **PEGI 3 / Everyone**

### 5.4 Target Audience

- **18+** (safer given restaurant/bar content — avoids COPPA)

### 5.5 Data Safety Form

| Data Type | Collected | Shared | Purpose |
|-----------|-----------|--------|---------|
| Email | Yes | No | Account (OAuth) |
| Name | Yes | No | Display name |
| Profile photo | Yes | No | Avatar from OAuth |
| Precise location | Yes | No | Map display |
| App interactions | Yes | No | Analytics (PostHog) |
| Crash logs | Yes | No | Diagnostics (Sentry) |
| Purchase history | Yes | No | Subscription (RevenueCat) |

Additional disclosures:
- Data encrypted in transit: **Yes**
- Users can request deletion: **Yes** (delete-account Edge Function exists)
- Not shared with third parties for ads

### 5.6 Other Declarations

- Ads: No
- App access: Restricted (provide "Sign in with Google" instructions for reviewer)
- Government app: No

---

## Phase 6: Deep Links (assetlinks.json)

### 6.1 Get SHA256 Fingerprint

Play Console > Setup > App signing > "App signing key certificate" > copy SHA256

Use **Google's signing key** (not the EAS upload key) — Google re-signs the AAB after upload.

### 6.2 Update assetlinks.json

In the mapvault-website repo, replace the fingerprint with the one from Play Console. Deploy to both `mapvault.app` and `www.mapvault.app`.

### 6.3 Verify

```
https://digitalassetlinks.googleapis.com/v1/statements:list?source.web.site=https://mapvault.app&relation=delegate_permission/common.handle_all_urls
```

Or use Google's validator: https://developers.google.com/digital-asset-links/tools/generator

Enter: `https://mapvault.app`, package `com.patrickalvarez.mapvault`, and the SHA256 fingerprint.

### 6.4 Update Invite Fallback Page

Add a Google Play Store link alongside the existing App Store link on the mapvault.app invite fallback page once published.

---

## Phase 7: Testing

### 7.1 Internal Testing (immediate, no review delay)

Build a dev client:

```bash
eas build --platform android --profile development
```

Start the server and connect:

```bash
npm run start:dev
# Press 'a' to connect to Android device
```

Core flows to verify:

- [ ] Google Sign-In works (Apple button correctly hidden on Android)
- [ ] Mapbox map loads and renders
- [ ] Place search returns results (Android API key + `X-Android-Package` header)
- [ ] Create map, add place, filter by tag
- [ ] Get directions (opens external maps app)
- [ ] Deep link: `adb shell am start -a android.intent.action.VIEW -d "https://mapvault.app/invite/test-token"`
- [ ] Edge-to-edge display correct
- [ ] PostHog events fire, Sentry captures errors

### 7.2 Payment Testing

```bash
eas build --platform android --profile development:payments
```

Install APK on device, then:

```bash
npx expo start --dev-client
```

- [ ] RevenueCat initializes (check Metro logs for "RevenueCat" debug output)
- [ ] Paywall shows real Google Play price (not fallback EUR 9.99)
- [ ] Test purchase completes (use a license tester Gmail account)
- [ ] Webhook fires — check `profiles.entitlement = 'premium'` in Supabase
- [ ] Restore Purchases works

### 7.3 Closed Testing (14-day gate for personal accounts)

**This is the critical path. Start ASAP.**

1. Play Console > Testing > Closed testing > Create track
2. Add **12+ testers** by email (they must accept the invite and opt in)
3. Upload AAB, add release notes, start rollout
4. Wait **14 continuous days**
5. After 14 days, production access unlocks

---

## Phase 8: Production Release

### 8.1 Update eas.json Submit Track

Change `submit.production.android.track` from `"internal"` to `"production"` in `eas.json`.

### 8.2 Submit

Either promote from the closed testing track in Play Console, or:

```bash
eas build --platform android --profile production
eas submit --platform android --profile production
```

### 8.3 Google Review

- First submission: expect **1-7 days**
- Common rejection reasons: missing privacy policy, data safety mismatch, description doesn't match functionality

---

## Quick Reference

| Item | Location |
|------|----------|
| Service account JSON | `.keys/google-play-service-account.json` (local, gitignored) |
| Google API key (local) | `.env` > `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` |
| Google API key (CI/CD) | EAS secrets > `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY` |
| SHA256 fingerprint | mapvault-website `assetlinks.json` route handler |
| License testers | Play Console > Setup > License testing |
| Service account permissions | Play Console > Setup > API access |
| Submit track config | `eas.json` > `submit.production.android.track` |

## Verification Checklist

After all phases complete:

1. App appears in Google Play Store search
2. Install from Play Store on a fresh device
3. Full flow: sign in > create map > add place > paywall > purchase > shared map invite
4. Deep link from browser opens app directly
5. `eas submit` successfully uploads new builds
