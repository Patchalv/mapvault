# MailerLite Integration — Product Requirements Document

**Status:** Draft
**Date:** 2026-03-11
**Author:** Generated via codebase investigation

---

## 1. Overview

### Goal
Sync every MapVault user to MailerLite as a subscriber at sign-up time, and keep their MailerLite group membership in sync with their subscription tier (Free vs Premium). This enables future email sequences: onboarding, upsell, re-engagement, and release announcements.

### Scope
| In scope | Out of scope |
|---|---|
| New user → MailerLite subscriber sync (via Database Webhook + Edge Function) | Transactional email (Resend handles this) |
| Entitlement change → MailerLite group sync (via revenuecat-webhook update) | Unsubscribe/suppression flow |
| Backfill script for existing users | Email preference centre in-app |
| Apple private relay email filtering | Specific email sequence content |
| MailerLite group structure | |
| Account deletion → MailerLite unsubscribe (delete-account function) | |

### Stack
- **MailerLite** — marketing email platform (free tier: 1,000 subscribers / 12,000 emails/month)
- **Supabase Database Webhook** — triggers on INSERT to `public.profiles`
- **New Edge Function** `sync-to-mailerlite` — receives webhook, calls MailerLite API
- **Existing Edge Function** `revenuecat-webhook` — extended to call MailerLite on entitlement changes
- **Existing Edge Function** `delete-account` — extended to unsubscribe from MailerLite on deletion
- **Resend** — unchanged, continues handling transactional email

### Priority
High — enables marketing automation that is currently impossible without subscriber data.

---

## 2. Background & Motivation

MapVault users sign up via Supabase Auth. There is currently no mechanism to contact users after sign-up: no onboarding email sequence, no upsell campaigns for free users, and no re-engagement for inactive users. MailerLite will fill this gap.

MailerLite's free tier (1,000 subscribers / 12,000 emails/month) is sufficient for the current scale. The integration must be lightweight, fault-tolerant, and must not affect the primary sign-up or payment flows even if MailerLite is unreachable.

---

## 3. Findings

### 3.1 Email column location
`public.profiles` does **not** have an `email` column. The schema (defined in `supabase/migrations/20260221000001_create_tables.sql`) contains: `id`, `display_name`, `avatar_url`, `entitlement`, `active_map_id`, `created_at`. Email is stored only in `auth.users.email`. The `sync-to-mailerlite` function must therefore query `auth.users` using the service role client to retrieve the email.

### 3.2 revenuecat-webhook behaviour
File: `supabase/functions/revenuecat-webhook/index.ts`

The function currently handles the following event types:

**Upgrade events** (set `profiles.entitlement = 'premium'`):
- `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE`

**Downgrade events** (set `profiles.entitlement = 'free'`):
- `EXPIRATION`, `REFUND`

**Not handled** (correctly absent): `CANCELLATION` — cancelled users retain access until billing period ends.

The Supabase user is identified via `event.app_user_id` in the webhook payload. Anonymous users (`$RCAnonymousID:` prefix) are skipped. The function authenticates callers via a `REVENUECAT_WEBHOOK_SECRET` Bearer token.

**Confirmed:** `event.app_user_id` equals the Supabase `auth.users.id` UUID. The app calls `Purchases.logIn(user.id)` in `hooks/use-revenuecat.ts` using the Supabase user ID, so the mapping is guaranteed and allows a direct `auth.users` lookup by UUID.

### 3.3 delete-account function
File: `supabase/functions/delete-account/index.ts`

Deletes the RevenueCat subscriber (best-effort) and then the Supabase Auth user (which cascades DB cleanup via trigger). This function will be extended to unsubscribe the user from MailerLite before the Auth deletion, using the same best-effort pattern as the RevenueCat call — a MailerLite failure must not block account deletion.

### 3.4 Existing Database Webhooks
None configured. No `pg_net`, `supabase_functions.http_request`, or webhook SQL exists in any migration. The `revenuecat-webhook` is an inbound Edge Function endpoint, not a Supabase Database Webhook. This integration will introduce the **first** Supabase Database Webhook in the project.

### 3.5 Existing environment variables
All Edge Functions currently use:
- `SUPABASE_URL` — used by all six functions
- `SUPABASE_SERVICE_ROLE_KEY` — used by all six functions
- `APP_DOMAIN` — used by `create-invite`
- `REVENUECAT_SECRET_API_KEY` — used by `delete-account`
- `REVENUECAT_WEBHOOK_SECRET` — used by `revenuecat-webhook`

**New secrets required** (defined in Section 5.2):
- `MAILERLITE_API_KEY`
- `SYNC_WEBHOOK_SECRET`
- `MAILERLITE_FREE_GROUP_ID`
- `MAILERLITE_PREMIUM_GROUP_ID`

### 3.6 Sign in with Apple
The app has full Sign in with Apple support (`expo-apple-authentication`, `lib/auth.ts`, `app/(auth)/sign-in.tsx`). Apple's private relay service issues addresses in the form `<random>@privaterelay.appleid.com`. These addresses cannot receive email from third-party services. The `sync-to-mailerlite` and `revenuecat-webhook` functions must detect and skip such addresses.

---

## 4. Architecture

### 4.1 Sign-up sync flow

```
User signs up (email or Apple)
        │
        ▼
Supabase Auth creates auth.users row
        │
        ▼
handle_new_user trigger inserts into public.profiles
        │
        ▼
Supabase Database Webhook fires on INSERT to public.profiles
        │
        ▼
POST to sync-to-mailerlite Edge Function
  (Authorization: Bearer SYNC_WEBHOOK_SECRET)
  body: { record: { id: uuid, entitlement: "free", ... } }
        │
        ▼
Function queries auth.users for email
        │
        ├─ email ends with @privaterelay.appleid.com → skip, return 200
        │
        ▼
POST /api/subscribers to MailerLite
  (upsert subscriber with email, fields: source="app", entitlement="free")
        │
        ▼
Add subscriber to "Free Users" MailerLite group
        │
        ▼
Return 200 OK
```

### 4.2 Plan change sync flow

```
User upgrades or subscription expires
        │
        ▼
RevenueCat fires webhook to revenuecat-webhook Edge Function
        │
        ▼
Function updates profiles.entitlement (existing behaviour)
        │
        ▼
Function calls MailerLite API (new behaviour):
  - Remove subscriber from current group
  - Add subscriber to new group
        │
        ├─ INITIAL_PURCHASE / RENEWAL / UNCANCELLATION /
        │  NON_RENEWING_PURCHASE / PRODUCT_CHANGE
        │  → remove from "Free Users", add to "Premium Users"
        │
        └─ EXPIRATION / REFUND
           → remove from "Premium Users", add to "Free Users"
```

### 4.3 Account deletion flow

```
User deletes account
        │
        ▼
delete-account Edge Function called
        │
        ▼
Delete RevenueCat subscriber (best-effort, existing behaviour)
        │
        ▼
Fetch email from auth.users (new behaviour)
        │
        ├─ private relay or not found → skip MailerLite call
        │
        ▼
DELETE /api/subscribers/{subscriber_id} from MailerLite (best-effort)
        │
        ▼
supabase.auth.admin.deleteUser() (existing behaviour, cascades DB cleanup)
```

### 4.4 MailerLite group membership rules

| Subscriber state | Group membership |
|---|---|
| Newly signed up | Free Users |
| Upgrades to premium | Remove from Free Users, add to Premium Users |
| Subscription expires (EXPIRATION) | Remove from Premium Users, add to Free Users |
| Subscription refunded (REFUND) | Remove from Premium Users, add to Free Users |
| Subscription cancelled (CANCELLATION) | No change — retains current group until EXPIRATION |
| Apple private relay email | Not synced at all |
| Account deleted | Removed from MailerLite entirely |

> **Note on group removal 404s:** If `DELETE /api/subscribers/{id}/groups/{groupId}` returns 404, treat it as success — the subscriber was simply not in that group.

### 4.5 Backfill flow
A one-off script queries `auth.users` joined with `public.profiles`, skips private relay emails, and upserts each user to MailerLite in the correct group based on current `entitlement`.

---

## 5. Prerequisites

### 5.1 MailerLite account setup
1. Create a MailerLite account at mailerlite.com (free tier supports up to 1,000 subscribers).
2. **Disable double opt-in:** Account → Settings → Double opt-in → off. Users signing up to MapVault already verified their identity via Supabase Auth; a second confirmation email is inappropriate for API-synced subscribers.
3. Create two subscriber groups:
   - **Free Users** — all users on the free tier
   - **Premium Users** — all users with active premium entitlement
4. Record the numeric group IDs for both groups (visible in the MailerLite Groups URL).
5. Create two custom subscriber fields (Subscribers → Fields → Add field, type: **Text**):
   - `source` — where the subscriber came from (value will be `"app"`)
   - `entitlement` — their current tier (values: `"free"` or `"premium"`)
6. Generate an API key: Account → Integrations → API → Create new token. Scope: full access.
7. Note the API key for the Supabase secret below.

### 5.2 New Supabase secrets
Set the following secrets via the Supabase dashboard (Project → Edge Functions → Secrets) or via `supabase secrets set`:

| Secret name | Value | Purpose |
|---|---|---|
| `MAILERLITE_API_KEY` | MailerLite API token from step 5.1 | Authenticates calls to MailerLite API v2 |
| `SYNC_WEBHOOK_SECRET` | Random 32-byte hex string (generate with `openssl rand -hex 32`) | Authenticates Database Webhook → sync-to-mailerlite calls |
| `MAILERLITE_FREE_GROUP_ID` | Numeric group ID from step 5.1 | MailerLite "Free Users" group |
| `MAILERLITE_PREMIUM_GROUP_ID` | Numeric group ID from step 5.1 | MailerLite "Premium Users" group |
| `SENTRY_DSN` | Sentry DSN from Project Settings → Client Keys | Enables error capture in `sync-to-mailerlite` when MailerLite sync fails |

> **Group ID type note:** `MAILERLITE_FREE_GROUP_ID` and `MAILERLITE_PREMIUM_GROUP_ID` are read as strings via `Deno.env.get()`. The MailerLite API accepts string values in JSON — do not call `parseInt()` on them.

---

## 6. Step 1: sync-to-mailerlite Edge Function

### Purpose
Receives a Supabase Database Webhook POST when a new row is inserted into `public.profiles`. Looks up the user's email from `auth.users`, filters Apple private relay addresses, and upserts the subscriber to MailerLite in the "Free Users" group.

### File location
`supabase/functions/sync-to-mailerlite/index.ts`

### Inputs
The Supabase Database Webhook sends a POST request with:
- **Header:** `Authorization: Bearer <SYNC_WEBHOOK_SECRET>`
- **Body (JSON):** Supabase Database Webhook v2 payload shape: `{ type: 'INSERT', table: 'profiles', schema: 'public', record: {...}, old_record: null }`. The `record` field will be the new `public.profiles` row with at minimum `id` (uuid) and `entitlement` (text). Read `body.record.id` for the user UUID.

### Logic requirements
1. **Authenticate the request.** Verify the `Authorization` header matches `SYNC_WEBHOOK_SECRET`. Return 401 if missing or incorrect.
2. **Extract user_id.** Read `record.id` from the webhook payload body. Return 400 if absent.
3. **Fetch email from auth.users.** Use the Supabase service role client — call `supabase.auth.admin.getUserById(userId)` — do NOT use `supabase.from('users').select(...)`, consistent with Section 8. If the user is not found, return 200 (no-op — may have been deleted before webhook fired).
4. **Filter Apple private relay emails.** If the email ends with `@privaterelay.appleid.com`, log a message and return 200 without calling MailerLite.
5. **Upsert subscriber to MailerLite.** Call `POST https://connect.mailerlite.com/api/subscribers` with:
   - `email` — the user's email
   - `fields.source` — `"app"`
   - `fields.entitlement` — `"free"` (all new sign-ups start free)
   - `groups` — array containing `MAILERLITE_FREE_GROUP_ID`
   If the subscriber already exists, MailerLite will update them (upsert behaviour). If MailerLite returns 409 when adding a subscriber to a group, treat it as success — the subscriber is already a member.
6. **Return 200** on all handled outcomes, including MailerLite API errors. Log the error to console and return 200 rather than 500 — Supabase Database Webhooks do not retry on failure, so returning 500 provides no benefit and creates misleading log noise. Recovery is via the backfill script.
7. **Capture Sentry exception on MailerLite 5xx or unexpected exceptions.** Capture a Sentry exception whenever MailerLite returns 5xx or an unexpected exception occurs, even though the function still returns 200. Call `Sentry.captureException()` with the error and tag `{ function: 'sync-to-mailerlite' }` before returning 200. This serves as the alerting mechanism for missed sign-up syncs that require a backfill re-run.

### Error handling requirements
- Wrap the entire function body in try/catch. Return 500 with an error message only on unexpected exceptions (i.e. unhandled code paths), not on MailerLite API errors.
- Log all errors to console for Supabase Edge Function logs.
- A MailerLite 4xx or 5xx response should both return 200 — webhooks do not retry, so a 500 buys nothing and creates misleading log noise. Log the status code and response body.
- Supabase Database Webhooks do not retry on failure. The backfill script (`scripts/backfill-mailerlite.ts`) is the recovery mechanism — re-run it to catch any missed users.

### Environment variables used
- `SYNC_WEBHOOK_SECRET`
- `MAILERLITE_API_KEY`
- `MAILERLITE_FREE_GROUP_ID`
- `SENTRY_DSN` (new)

> **Sentry in Deno:** Use `import * as Sentry from "npm:@sentry/node"` and call `Sentry.init({ dsn: Deno.env.get("SENTRY_DSN") })` at module level. Sentry should only be initialized once.

### CORS
`sync-to-mailerlite` is webhook-only (not called from the app). Do not add CORS headers. Return only `Content-Type: application/json`, matching the existing function pattern.

### Authentication pattern
Follow the existing pattern from `revenuecat-webhook/index.ts`: extract `Authorization` header, split on space, compare the second token to the env secret using direct string equality, consistent with the existing `revenuecat-webhook` pattern (Deno has no built-in constant-time string comparison).

### Deploy command
```
supabase functions deploy sync-to-mailerlite --no-verify-jwt
```
`--no-verify-jwt` is required for all MapVault Edge Functions that receive external webhook calls, because the Supabase relay's JWT verification rejects ES256 tokens.

---

## 7. Step 2: Supabase Database Webhook

### Purpose
Automatically trigger `sync-to-mailerlite` whenever a new profile row is created — i.e., whenever a user signs up.

### Configuration (Supabase Dashboard)
Navigate to: **Project → Database → Webhooks → Create a new hook**

| Field | Value |
|---|---|
| Name | `on_profile_insert_sync_mailerlite` |
| Table | `public.profiles` |
| Events | `INSERT` only |
| Type | Supabase Edge Functions |
| Edge Function | `sync-to-mailerlite` |
| HTTP method | POST |
| HTTP Headers | `Authorization: Bearer <value of SYNC_WEBHOOK_SECRET secret>` |
| Timeout | 5000 ms |

> **Note:** The Authorization header value must match the `SYNC_WEBHOOK_SECRET` Supabase secret exactly. Copy it from the secrets panel.

### Trigger timing
The webhook fires after the INSERT commits, which happens milliseconds after `handle_new_user` trigger creates the profile row. This is the correct point — the user's Supabase Auth record already exists, so the email lookup will succeed.

---

## 8. Step 3: revenuecat-webhook update

### Purpose
Extend the existing `revenuecat-webhook` function to sync group membership changes to MailerLite when a user's entitlement changes.

### File to modify
`supabase/functions/revenuecat-webhook/index.ts`

### What needs to change

**After a successful `profiles.entitlement` update**, add a MailerLite group sync call. The existing `profiles` update must complete first — if the DB update fails, skip the MailerLite call entirely.

**For premium events** (INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, NON_RENEWING_PURCHASE, PRODUCT_CHANGE):
1. Fetch the user's email from `auth.users` using `app_user_id` as the UUID (confirmed: the app calls `Purchases.logIn(user.id)` with the Supabase user ID, so `app_user_id` is always the `auth.users.id` UUID).
2. If email is a private relay address, skip MailerLite call.
3. Call MailerLite API to:
   - Remove subscriber from `MAILERLITE_FREE_GROUP_ID`
   - Add subscriber to `MAILERLITE_PREMIUM_GROUP_ID` — if MailerLite returns 409, treat it as success (subscriber is already a member)
   - PATCH `fields.entitlement` to `"premium"` via subscriber upsert `POST /api/subscribers` using email

> **PRODUCT_CHANGE note:** Treated as a grant event because MapVault has a single paid tier. If multi-tier pricing is introduced, revisit this mapping.

**For downgrade events** (EXPIRATION, REFUND):
1. Fetch the user's email from `auth.users`.
2. If private relay, skip.
3. Call MailerLite API to:
   - Remove subscriber from `MAILERLITE_PREMIUM_GROUP_ID`
   - Add subscriber to `MAILERLITE_FREE_GROUP_ID` — if MailerLite returns 409, treat it as success (subscriber is already a member)
   - PATCH `fields.entitlement` to `"free"` via subscriber upsert `POST /api/subscribers` using email

**For CANCELLATION** (currently not handled and should remain unhandled):
- No MailerLite change. Cancelled users retain premium access until billing period ends. Group change should happen only on EXPIRATION.

### Error handling requirements
- Wrap all MailerLite calls in a dedicated try/catch block that is **separate** from the existing profiles update logic. This MailerLite try/catch must be an inner block nested inside the existing outer try/catch — not reliant on the outer catch, which would cause a 500 if the MailerLite exception propagated.
- A MailerLite failure must **never** cause the function to return a non-200 status if the Supabase update succeeded. RevenueCat retries on non-200 responses, which would cause duplicate entitlement updates.
- Log MailerLite errors to console but return 200.
- If the user's email cannot be fetched from auth.users (user not found), skip the MailerLite call silently.
- **Group removal 404:** If `DELETE /api/subscribers/{id}/groups/{groupId}` returns 404, treat it as success — subscriber was not in that group.
- **Group swap atomicity:** The remove-from-old-group + add-to-new-group sequence is not atomic. If the remove succeeds but the add fails, the subscriber ends up in neither group. This is acceptable under the best-effort pattern; log which step failed specifically. Note: a single subscriber upsert (`POST /api/subscribers`) does not remove from existing groups, so the two-call approach is required for correct group membership.
- **UUID direct lookup:** Use `supabase.auth.admin.getUserById(app_user_id)` with the service role client to retrieve the user's email. Do **not** use `supabase.from('users').select(...)` — that queries the PostgREST admin schema and may not behave consistently. `getUserById` is the canonical service-role method for this. The `app_user_id` value is confirmed to always be the Supabase `auth.users.id` UUID (see §3.2).

### New environment variables used
- `MAILERLITE_API_KEY`
- `MAILERLITE_FREE_GROUP_ID`
- `MAILERLITE_PREMIUM_GROUP_ID`

### Deploy command
```
supabase functions deploy revenuecat-webhook --no-verify-jwt
```

---

## 9. Step 4: delete-account update

### Purpose
Extend the existing `delete-account` function to remove the user's subscriber record from MailerLite before deleting the Supabase Auth user. This prevents deleted users from remaining in MailerLite indefinitely and receiving marketing emails after account deletion.

### File to modify
`supabase/functions/delete-account/index.ts`

### What needs to change

**Before calling `supabase.auth.admin.deleteUser()`**, add a best-effort MailerLite deletion:

1. Read `user.email` from the already-authenticated user object (already available from step 1 of the existing function — no additional query needed).
2. If email is a private relay address or user not found, skip MailerLite call.
3. Call `GET https://connect.mailerlite.com/api/subscribers/{email}` to look up the subscriber ID. The email **must** be URL-encoded using `encodeURIComponent(email)` — bare interpolation silently breaks for addresses containing `+` or other special characters.
4. If the subscriber exists, call `DELETE https://connect.mailerlite.com/api/subscribers/{id}`.
5. Proceed with `supabase.auth.admin.deleteUser()` regardless of the MailerLite result.

### Error handling requirements
- Wrap the MailerLite calls in a dedicated try/catch that is **separate** from the account deletion logic.
- A MailerLite failure (including 404 — subscriber not found) must **never** block account deletion. Log the error and proceed.
- Follow the same best-effort pattern already used for the RevenueCat deletion in this function.

### New environment variable used
- `MAILERLITE_API_KEY`

### Deploy command
```
supabase functions deploy delete-account --no-verify-jwt
```

---

## 10. Step 5: Backfill script

### Purpose
One-time sync of all existing users to MailerLite with the correct group based on their current `entitlement`.

### Requirements
1. **Run environment:** Deno script or Node.js script executed locally with access to `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `MAILERLITE_API_KEY`, `MAILERLITE_FREE_GROUP_ID`, and `MAILERLITE_PREMIUM_GROUP_ID`.
2. **Data source:** Query `auth.users` joined with `public.profiles` (or query both tables separately using service role). For each user, read `email` and `profiles.entitlement`. Use `supabase.auth.admin.listUsers()` with explicit `page` and `perPage` parameters in a loop until all pages are exhausted — the default page size is 50. Example: call `listUsers({ page: 1, perPage: 50 })`, then increment `page` and repeat until `users.length < perPage`.
3. **Filtering:** Skip any email ending in `@privaterelay.appleid.com`.
4. **Upsert logic:** For each valid user, call `POST /api/subscribers` with email, fields, and the correct group ID based on entitlement (`free` → `MAILERLITE_FREE_GROUP_ID`, `premium` → `MAILERLITE_PREMIUM_GROUP_ID`).
5. **Rate limiting:** MailerLite API rate limit is 120 requests/minute on the free tier (2 req/sec). **Preferred path:** use the bulk import endpoint (`POST /api/subscribers/import`) which accepts up to 1,000 subscribers per call and is not subject to per-request rate limits — use this when processing more than 10 users. **Before implementing the bulk import path, verify that `POST /api/subscribers/import` supports per-subscriber `groups` assignment. If not, fall back to the single-subscriber loop for all users, or upsert groups in a separate pass after import.** **Fallback path (single-user loop):** insert a 500 ms delay between each call (`await new Promise(r => setTimeout(r, 500))`). At 500 ms per call, 1,000 users takes ~8 minutes.
6. **Idempotent:** The script must be safe to re-run. MailerLite subscriber upsert is naturally idempotent.
7. **Logging:** Print progress to stdout: number processed, number skipped (private relay), number of errors.
8. **File location:** `scripts/backfill-mailerlite.ts` (or `.js`)

---

## 11. Acceptance Criteria

### Step 1 & 2: Sign-up sync
- [ ] A new user signing up with a real email address appears in MailerLite within 30 seconds of sign-up. If the subscriber does not appear within 30 seconds, check Supabase Edge Function logs for `sync-to-mailerlite` before assuming data loss. Only run the backfill script if logs confirm a 500 response from the function.
- [ ] The new MailerLite subscriber is in the "Free Users" group.
- [ ] The subscriber has `fields.source = "app"` and `fields.entitlement = "free"`.
- [ ] A new user signing up via Sign in with Apple with a private relay email does NOT appear in MailerLite.
- [ ] A POST to `sync-to-mailerlite` with an invalid/missing `Authorization` header returns 401.
- [ ] Check Supabase Edge Function logs — no errors for a normal sign-up.

### Step 3: Plan change sync
- [ ] Verify MailerLite group add behaviour for an already-member: confirm whether the API returns 200 or 409 when adding a subscriber to a group they already belong to. If 409 is returned, the implementation must treat it as success (same as 404 on removal). Document the observed behaviour.
- [ ] A user completing a purchase (INITIAL_PURCHASE event) is moved from "Free Users" to "Premium Users" in MailerLite.
- [ ] A user whose subscription expires (EXPIRATION event) is moved from "Premium Users" to "Free Users" in MailerLite.
- [ ] A CANCELLATION event does NOT change the user's MailerLite group.
- [ ] If MailerLite API is unreachable, `revenuecat-webhook` still returns 200 and the `profiles.entitlement` update is not rolled back.
- [ ] If the user's email is not found in auth.users at plan change time, `revenuecat-webhook` still returns 200 and the `profiles.entitlement` update is not rolled back.
- [ ] If MailerLite returns a 401 (invalid API key) during a plan change event, `revenuecat-webhook` still returns 200 and logs the error to console.
- [ ] No duplicate webhook retries from RevenueCat caused by the MailerLite integration.

### Step 4: Account deletion
- [ ] A user who deletes their account is removed from MailerLite.
- [ ] If MailerLite is unreachable during account deletion, the account deletion still completes successfully.
- [ ] A user with a private relay email deleting their account does not cause an error.

### Step 5: Backfill
- [ ] All users with real emails appear in MailerLite after running the backfill script.
- [ ] Users with `entitlement = 'premium'` are in "Premium Users" group.
- [ ] Users with `entitlement = 'free'` are in "Free Users" group.
- [ ] Private relay email addresses are not present in MailerLite.
- [ ] Script is safe to re-run without creating duplicate subscribers.

---

## 12. Error Handling & Resilience

| Failure scenario | Expected behaviour |
|---|---|
| MailerLite API down during sign-up | Database Webhook fires → `sync-to-mailerlite` captures a Sentry exception and returns 200. User sign-up is unaffected. No automatic retry (Supabase webhooks don't retry). Sentry alert triggers developer to re-run backfill script. |
| MailerLite API down during plan change | `revenuecat-webhook` catches error, logs it, returns 200. Entitlement update is preserved. MailerLite group will be out of sync until next plan event or manual re-sync. |
| MailerLite API down during account deletion | `delete-account` catches error, logs it, proceeds with deletion. Subscriber may remain in MailerLite. |
| User not found in auth.users at webhook time | `sync-to-mailerlite` returns 200 (no-op). Logged to console. |
| Apple private relay email | All three functions skip MailerLite call entirely and proceed normally. |
| Invalid MailerLite API key | All functions log the 401 response and return 200. No function returns 500 for a MailerLite error — webhooks don't retry, and RevenueCat retry storms must be avoided. Recover via backfill script. |
| MailerLite 422 (invalid email format) | `sync-to-mailerlite` returns 200 to suppress infinite retries. Logged. |
| Duplicate webhook delivery (idempotency) | MailerLite subscriber upsert is idempotent. Group add on already-member is a no-op. Safe to receive the same event twice. |
| Subscriber not found in MailerLite during deletion | `delete-account` treats 404 as success (already removed). Proceeds with Auth deletion. |

---

## 13. Implementation Order

Ordered checklist — complete in this sequence to avoid deploying broken states:

- [ ] **1.** Set up MailerLite account: disable double opt-in, create "Free Users" and "Premium Users" groups, create `source` and `entitlement` custom fields (Step 5.1)
- [ ] **2.** Generate MailerLite API key (Step 5.1)
- [ ] **3.** Generate `SYNC_WEBHOOK_SECRET` value (`openssl rand -hex 32`)
- [ ] **4.** Add all four secrets to Supabase: `MAILERLITE_API_KEY`, `SYNC_WEBHOOK_SECRET`, `MAILERLITE_FREE_GROUP_ID`, `MAILERLITE_PREMIUM_GROUP_ID` (Step 5.2)
- [ ] **4a.** Add `SENTRY_DSN` secret to Supabase (copy from Sentry Project Settings → Client Keys → DSN)
- [ ] **5.** Create `supabase/functions/sync-to-mailerlite/index.ts` per Step 6 requirements
- [ ] **6.** Deploy `sync-to-mailerlite`: `supabase functions deploy sync-to-mailerlite --no-verify-jwt`
- [ ] **7.** Configure Database Webhook in Supabase dashboard per Step 7 (pointing to `sync-to-mailerlite`, with Authorization header). The Edge Function URL is only available after step 6 (deploy) — copy it from Supabase Dashboard → Edge Functions → sync-to-mailerlite.
- [ ] **8.** Test: create a test user in Supabase Auth → verify subscriber appears in MailerLite "Free Users"
- [ ] **9.** Test: create a test user with a `@privaterelay.appleid.com` email → verify NOT in MailerLite
- [ ] **10.** Update `supabase/functions/revenuecat-webhook/index.ts` per Step 8 requirements
- [ ] **11.** Deploy `revenuecat-webhook`: `supabase functions deploy revenuecat-webhook --no-verify-jwt`
- [ ] **12.** Test: send a test INITIAL_PURCHASE webhook → verify user moves to "Premium Users"
- [ ] **13.** Test: send a test EXPIRATION webhook → verify user moves back to "Free Users"
- [ ] **14.** Test: send a test CANCELLATION webhook → verify group does NOT change
- [ ] **15.** Update `supabase/functions/delete-account/index.ts` per Step 9 requirements
- [ ] **16.** Deploy `delete-account`: `supabase functions deploy delete-account --no-verify-jwt`
- [ ] **17.** Test: delete a test account → verify subscriber removed from MailerLite
- [ ] **18.** Write `scripts/backfill-mailerlite.ts` per Step 10 requirements
- [ ] **19.** Run backfill script against production (after verifying with a dry-run or small batch first)
- [ ] **20.** Verify backfill: spot-check 5–10 existing users in MailerLite against their `profiles.entitlement`

---

## 14. Decisions Log

All open questions resolved prior to implementation:

| # | Question | Decision |
|---|---|---|
| 1 | MailerLite custom field slugs | Use `source` (Text) and `entitlement` (Text) — create in MailerLite before deploying |
| 2 | Database Webhook retry / dead-letter | No dead-letter mechanism. Accept risk; re-run backfill script to recover any missed sign-ups |
| 3 | MailerLite free tier monitoring | Monitor subscriber count manually via MailerLite dashboard |
| 4 | REFUND group handling | REFUND → "Free Users" (same as EXPIRATION) |
| 5 | Account deletion cleanup | Scoped in — `delete-account` extended to unsubscribe from MailerLite (Step 9) |
| 6 | Double opt-in | Single opt-in — disable in MailerLite account settings |
| 7 | Backfill timing | Run after all three functions are deployed and smoke-tested (steps 18–20 in checklist) |
| 8 | `app_user_id` mapping | Confirmed — app calls `Purchases.logIn(user.id)` in `hooks/use-revenuecat.ts` with Supabase UUID |
| 9 | 404 on group removal | Treat as success (subscriber already not in group) |
| 10 | Group swap atomicity | Accept two-call risk with per-step logging; single upsert cannot remove from old group |
| 11 | delete-account email source | Use `user.email` from existing auth check — no second DB query needed |
