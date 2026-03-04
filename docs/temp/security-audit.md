# MapVault Security Audit

**Date:** 2026-02-28
**Overall Rating:** Good foundation with actionable gaps

---

## Session 1: Immediate — Credential Rotation & Git Cleanup

### 1.1 Rotate all exposed API keys

The `.env` file was committed to git history. Even though it's now in `.gitignore`, all keys are extractable from past commits.

- [ ] Rotate Mapbox token in the Mapbox dashboard
- [ ] Rotate Google Places API key in Google Cloud Console
- [ ] Rotate PostHog API key in PostHog dashboard
- [ ] Rotate Sentry auth token in Sentry settings
- [ ] Rotate RevenueCat public API key in RevenueCat dashboard
- [ ] Rotate RevenueCat secret API key (exposed in `.env` comment)
- [ ] Update `.env` with new keys locally
- [ ] Update EAS Secrets with new keys for CI builds
- [ ] Verify app still works with new keys

### 1.2 Purge `.env` from git history — DONE (2026-02-28)

- [x] Used `git-filter-repo --invert-paths --path .env` to rewrite history
- [x] Force pushed cleaned history to origin
- [x] Verified `.env` is gone from all commits: `git log --all --full-history -- .env` returns nothing
- [x] Confirmed `.env` still exists locally and is in `.gitignore`

### 1.3 Add `.env.example` with placeholder values

- [x] Ensure `.env.example` exists with dummy values (no real keys)
- [x] Verify `.env` is in `.gitignore` (already is, but double-check)

---

## Session 2: High Priority — Google Places API Key Restrictions — DONE (2026-02-28)

**Decision:** Deferred the server-side proxy approach. The added latency (extra network hop + Edge Function cold starts) would noticeably impact autocomplete responsiveness. Instead, restricted the API keys at the Google Cloud Console level, which mitigates the financial abuse risk without the performance tradeoff. The proxy can be revisited if the app scales significantly.

### 2.1 Restrict API keys in Google Cloud Console

- [x] Created separate API keys for iOS and Android in Google Cloud Console
- [x] iOS key: restricted by bundle ID (`com.patrickalvarez.MapVault`)
- [x] Android key: restricted by package name + SHA-1 fingerprint
- [x] Both keys restricted to "Places API (New)" only
- [x] Set billing budget with alerts at 50%, 80%, 100%

### 2.2 Use platform-specific keys in client

- [x] Updated `lib/google-places.ts` to select key based on `Platform.OS` (`EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_IOS` / `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY_ANDROID`)
- [x] Removed old `EXPO_PUBLIC_GOOGLE_PLACES_API_KEY` from `.env.example`
- [x] Updated `docs/setup.md` and `docs/troubleshooting.md` to reference new key names

---

## Session 3: High Priority — Edge Function Hardening

### 3.1 Remove CORS headers — DONE (2026-02-28)

**Decision:** Removed CORS headers entirely rather than restricting the origin to `mapvault.app`. MapVault is a mobile-only app — React Native HTTP clients don't send `Origin` headers, so CORS is irrelevant. Removing `Access-Control-Allow-Origin: *` means browsers will now block any cross-origin requests to these endpoints, which is a security improvement (prevents browser-based abuse) with zero impact on the mobile app. A shared CORS utility was unnecessary since no CORS handling is needed at all.

- [x] Removed `corsHeaders` constant from all 5 Edge Functions
- [x] Removed OPTIONS preflight handler from all 5 Edge Functions
- [x] Removed `...corsHeaders` spread from all response headers (kept `Content-Type: application/json`)
- [x] Verified no remaining `corsHeaders` references
- [x] TypeScript check passes

### 3.2 Fix Bearer token parsing

Currently uses `authHeader.replace("Bearer ", "")` which is fragile.

- [ ] Create a shared auth utility (e.g., `supabase/functions/_shared/auth.ts`)
- [ ] Implement proper validation:
  ```ts
  export function extractBearerToken(req: Request): string | null {
    const header = req.headers.get("Authorization");
    if (!header?.startsWith("Bearer ")) return null;
    const token = header.slice(7);
    return token || null;
  }
  ```
- [ ] Update all 5 Edge Functions to use the shared utility
- [ ] Deploy all updated functions

### 3.3 Add input length validation

- [ ] In `add-place/index.ts`: validate `note` max 1000 chars, `google_place_id` max 200 chars
- [ ] In `create-map/index.ts`: validate `name` max 200 chars
- [ ] In `accept-invite/index.ts`: validate `token` is valid UUID format
- [ ] Return 400 Bad Request for invalid inputs
- [ ] Deploy all updated functions

### 3.4 Add rate limiting

- [ ] Choose approach: Upstash Redis (recommended) or in-memory counter
- [ ] Create shared rate limit utility (`supabase/functions/_shared/rate-limit.ts`)
- [ ] Apply to `accept-invite`: 10 requests/minute per user (prevents token brute-force)
- [ ] Apply to `add-place`: 30 requests/minute per user
- [ ] Apply to `create-map`: 10 requests/minute per user
- [ ] Apply to `delete-account`: 3 requests/minute per user
- [ ] Apply to `revenuecat-webhook`: 30 requests/minute per IP
- [ ] Deploy all updated functions

---

## Session 4: Medium Priority — RLS & Database Fixes — DONE (2026-02-28)

### 4.1 Tighten `places` table INSERT policy — DONE

Dropped the permissive INSERT policy. The `add-place` Edge Function uses the service role key (bypasses RLS) so it's unaffected. Direct client inserts are now blocked.

- [x] Created migration `20260228000001_drop_places_insert_policy.sql` to drop the policy
- [x] Edge Function still works (uses service role, bypasses RLS)
- [x] Direct client inserts are properly blocked (RLS denies)

### 4.2 Review `places` SELECT policy — DONE (intentionally open)

**Decision:** Keep open. The `places` table is shared Google reference data (name, address, coordinates). Sensitive relationships (which user saved which place to which map) live in `map_places`, which is already scoped to map members via RLS. No privacy or security risk in any authenticated user reading shared place reference data.

- [x] Reviewed and documented as intentional — no migration needed

### 4.3 Make invite acceptance atomic — DONE

Created a `SECURITY DEFINER` Postgres function `accept_invite()` that uses `SELECT ... FOR UPDATE` to lock the invite row, validates all conditions, inserts the membership, and increments `use_count` atomically. The Edge Function now calls this via a single `supabase.rpc()` call.

- [x] Created migration `20260228000002_create_accept_invite_function.sql`
- [x] Updated `accept-invite` Edge Function to use `supabase.rpc("accept_invite", ...)`
- [x] Postgres exceptions mapped to same HTTP status codes the client expects

---

## Session 5: Medium Priority — Webhook Security

### 5.1 Add RevenueCat webhook signature verification

**File:** `supabase/functions/revenuecat-webhook/index.ts`

Currently only checks a Bearer token. Should also verify the webhook body signature.

- [ ] Check RevenueCat docs for their webhook signing method
- [ ] Add webhook body signature verification (HMAC-SHA256)
- [ ] Add timestamp validation (reject webhooks older than 5 minutes)
- [ ] Add idempotency handling (track processed webhook IDs to prevent replays)
- [ ] Store webhook secret in Supabase Edge Function secrets
- [ ] Deploy updated function
- [ ] Test with RevenueCat webhook tester

---

## Session 6: Low Priority — Client Hardening

### 6.1 Migrate auth tokens to secure storage

**File:** `lib/supabase.ts`

Currently uses `AsyncStorage` (unencrypted on iOS). Low risk since tokens are short-lived.

- [ ] Install `expo-secure-store`
- [ ] Create a Supabase storage adapter that wraps `SecureStore`
- [ ] Update `lib/supabase.ts` to use the secure adapter
- [ ] Test login/logout/session persistence on iOS and Android
- [ ] Verify token refresh still works

### 6.2 Guard production console logs

- [ ] Wrap `console.warn` in `lib/revenuecat.ts:24` with `if (__DEV__)`
- [ ] Wrap `console.warn` in `app/(tabs)/explore/index.tsx` (recenter error) with `if (__DEV__)`
- [ ] Search for any other unguarded `console.*` calls in production code
- [ ] Consider adding an ESLint rule: `no-console` with `allow: []` (or a custom logger)

### 6.3 Review Sentry session replay privacy

**File:** `app/_layout.tsx`

`replaysOnErrorSampleRate: 1` captures full session replay on every error.

- [ ] Review what data appears in Sentry session replays (location, places, user input)
- [ ] Configure Sentry data scrubbing rules to mask sensitive fields
- [ ] Consider reducing `replaysOnErrorSampleRate` to `0.2`
- [ ] Or add a `beforeSendReplay` hook to strip sensitive data

### 6.4 Consider certificate pinning (optional)

- [ ] Evaluate if certificate pinning is worth the maintenance cost
- [ ] If yes: implement for Supabase and RevenueCat endpoints
- [ ] Note: cert pinning requires updating the app on every cert rotation

---

## What's Already Secure (No Action Needed)

These areas were reviewed and found to be properly implemented:

- **RLS on all 10 tables** — policies correctly scope data to map members, enforce owner/editor roles
- **Freemium limits** — enforced server-side in Edge Functions, not bypassable from client
- **OAuth & Apple Sign-In** — standard Supabase flows, proper token handling
- **Invite tokens** — UUID v4 (128-bit entropy), expiration, max-use, duplicate checks
- **Account deletion** — comprehensive cascade cleanup, ownership transfer, GDPR-compliant
- **Client query scoping** — all hooks filter by user ID with `enabled` guards
- **No dynamic code execution** — no WebViews, no dangerous eval patterns
- **HTTPS everywhere** — all API endpoints, no HTTP fallbacks
- **TypeScript strict mode** — type safety throughout
- **Payment validation** — RevenueCat webhook authenticates, Edge Functions re-verify entitlement
- **Location privacy** — user GPS position is never stored in the database
- **Visit privacy** — place visit status is scoped per-user via RLS
