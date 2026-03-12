# MailerLite Integration

MapVault syncs users to MailerLite for marketing email (onboarding sequences, upsell campaigns, re-engagement). The integration is **best-effort**: MailerLite failures never block sign-up, payments, or account deletion.

## Architecture

Three sync paths keep MailerLite in sync with the Supabase user base:

```
Path 1: Sign-up
───────────────
User signs up
  → auth.users row created
  → handle_new_user trigger inserts into public.profiles
  → Supabase Database Webhook fires (INSERT on public.profiles)
  → POST to sync-to-mailerlite Edge Function
      → fetch email from auth.users (service role)
      → skip private relay addresses (@privaterelay.appleid.com)
      → upsert subscriber to MailerLite (Free Users group)

Path 2: Entitlement change
──────────────────────────
User purchases or subscription expires
  → RevenueCat fires webhook to revenuecat-webhook Edge Function
      → update profiles.entitlement (primary action)
      → [best-effort, only if all 3 ML env vars are set] fetch email from auth.users
      → [best-effort] remove subscriber from old MailerLite group
      → [best-effort] add subscriber to new MailerLite group
      → update fields.entitlement on subscriber

Path 3: Account deletion
────────────────────────
User deletes account
  → delete-account Edge Function called
      → [best-effort, skipped if no API key or private relay email]
        look up subscriber in MailerLite by email
      → [best-effort] DELETE subscriber from MailerLite
      → supabase.auth.admin.deleteUser() (cascades DB cleanup)
```

## Key Files

| File | Role |
|---|---|
| `supabase/functions/sync-to-mailerlite/index.ts` | Receives Database Webhook on profile INSERT; upserts new subscriber to Free Users group |
| `supabase/functions/revenuecat-webhook/index.ts` | Updates entitlement on RevenueCat events; syncs group membership (best-effort, inner try/catch) |
| `supabase/functions/delete-account/index.ts` | Deletes MailerLite subscriber before removing the Supabase Auth user (best-effort) |
| `scripts/backfill-mailerlite.ts` | One-time Deno script to sync all existing users to MailerLite |

## MailerLite Groups

| Group | Purpose |
|---|---|
| **Free Users** | All subscribers on the free tier. New sign-ups land here. Subscribers are moved here on EXPIRATION or REFUND events. |
| **Premium Users** | Subscribers with an active paid entitlement. Subscribers are moved here on INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, NON_RENEWING_PURCHASE, or PRODUCT_CHANGE events. |

Group membership is **mutually exclusive**: a subscriber should be in exactly one group at a time. The revenuecat-webhook function removes the subscriber from the old group before adding to the new one. A 404 on group removal means the subscriber was already not in that group — treated as success.

Note on CANCELLATION: a cancelled subscription retains premium access until the billing period ends. CANCELLATION events are intentionally not handled — group membership stays unchanged until the EXPIRATION event fires.

## Subscriber Fields

| Field | Values | Set by |
|---|---|---|
| `source` | Always `"app"` | Sign-up + entitlement-change + backfill script |
| `entitlement` | `"free"` or `"premium"` | Sign-up + entitlement-change + backfill script |

Both fields are custom Text fields created in MailerLite (Subscribers → Fields). Create them before deploying the functions.

## Sync Triggers

| Event | Triggered by | Result |
|---|---|---|
| New user signs up | Database Webhook on `public.profiles` INSERT | Upsert to MailerLite, add to Free Users group |
| Purchase / renewal | RevenueCat `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE` | Move to Premium Users, set `entitlement = "premium"` |
| Subscription expires / refunded | RevenueCat `EXPIRATION`, `REFUND` | Move to Free Users, set `entitlement = "free"` |
| Account deleted | User-initiated via `delete-account` function | Delete subscriber from MailerLite entirely |
| Apple private relay email | Any path | Skipped — MailerLite cannot deliver to `@privaterelay.appleid.com` addresses |

## Environment Variables

Set all secrets in **Supabase Dashboard → Edge Functions → Secrets** (or via `supabase secrets set`).

| Variable | Purpose |
|---|---|
| `MAILERLITE_API_KEY` | MailerLite API v2 token; authenticates all calls to `connect.mailerlite.com` |
| `SYNC_WEBHOOK_SECRET` | Bearer token that Supabase Database Webhook sends to `sync-to-mailerlite`; prevents unauthorized calls to the function |
| `MAILERLITE_FREE_GROUP_ID` | Numeric ID of the "Free Users" group in MailerLite (visible in the Groups URL) |
| `MAILERLITE_PREMIUM_GROUP_ID` | Numeric ID of the "Premium Users" group in MailerLite |

These are strings — do not call `parseInt()` on them. The MailerLite API accepts string values in JSON.

`SENTRY_DSN` is also required by `sync-to-mailerlite` (shared with other functions) — see `docs/sentry.md`.

The `revenuecat-webhook` and `delete-account` functions also require RevenueCat secrets (`REVENUECAT_WEBHOOK_SECRET`, `REVENUECAT_SECRET_API_KEY`) — see `docs/payments.md`.

## Backfill Script

**File:** `scripts/backfill-mailerlite.ts`

**When to run:**
- Once after initial deployment to sync existing users.
- Any time Sentry alerts indicate missed sign-ups (e.g., `sync-to-mailerlite` returned 200 but MailerLite was unreachable).

**How to run:**
```bash
SUPABASE_URL=<url> \
SUPABASE_SERVICE_ROLE_KEY=<key> \
MAILERLITE_API_KEY=<key> \
MAILERLITE_FREE_GROUP_ID=<id> \
MAILERLITE_PREMIUM_GROUP_ID=<id> \
deno run --allow-net --allow-env scripts/backfill-mailerlite.ts
```

**What it does:**
1. Pages through all users via `supabase.auth.admin.listUsers()` (50 per page).
2. Skips `@privaterelay.appleid.com` addresses.
3. Fetches each user's current `entitlement` from `public.profiles`.
4. Splits eligible users into two sub-batches per page: free and premium. For each sub-batch with > 10 members, uses `POST /api/subscribers/import` (bulk endpoint, up to 1,000 subscribers per call). Falls back to single upserts if bulk fails. A page of 50 users with a small premium cohort (≤ 10) would bulk-import the free batch but single-upsert the premium batch.
5. For single upserts, removes the subscriber from the opposite group first (to keep groups mutually exclusive), then upserts to the correct group. A 500 ms delay between single-upsert calls respects the MailerLite free-tier rate limit (120 req/min).
6. Logs progress: subscribers processed, skipped (private relay), and errors.

**Idempotency:** Safe to re-run. `POST /api/subscribers` is an upsert by email — re-running never creates duplicate subscribers. However, `POST /api/subscribers` only *adds* group memberships and never removes existing ones, so group exclusivity is not guaranteed by the upsert alone. The single-upsert path (`upsertOne`) handles this explicitly: it removes the subscriber from the opposite group before adding the correct one. The bulk-import path (`POST /api/subscribers/import`) does not include this removal step — test with a small sample before a full run to confirm group assignments are correct in your MailerLite account.

> **Important:** Before running in production for the first time, test the bulk import path with 1–2 entries and confirm group assignment appears in the MailerLite dashboard. The `POST /api/subscribers/import` endpoint is supposed to honour per-subscriber `groups`, but verify this holds before a full run.

## Error Handling

MailerLite is treated as a **best-effort side effect**. The core user experience (sign-up, payments, account deletion) must never fail because of a MailerLite outage.

| Failure scenario | Behaviour |
|---|---|
| MailerLite down during sign-up | `sync-to-mailerlite` captures Sentry exception, returns 200. No retry (Supabase webhooks don't retry). Recover by re-running backfill. |
| MailerLite down during plan change | `revenuecat-webhook` catches error in inner try/catch, logs it, returns 200. Entitlement update is preserved in Supabase. MailerLite group stays out of sync until next event or manual backfill. |
| MailerLite down during account deletion | `delete-account` catches error, logs it, proceeds with deletion. Subscriber may remain in MailerLite. |
| Apple private relay email | All three functions skip the MailerLite call and proceed normally. |
| Subscriber not in MailerLite at deletion | 404 on subscriber lookup or delete is treated as success (subscriber already removed or never synced). |
| Invalid API key (401) | Functions log the response and return 200. No 500 — RevenueCat would retry on 5xx, causing duplicate entitlement updates. |

**Why MailerLite-specific failures never return 500:**
- Supabase Database Webhooks don't retry — a 500 is no better than a 200 and creates misleading log noise.
- RevenueCat retries on non-200 — returning 500 would cause duplicate entitlement updates.
- Recovery is always via the backfill script.

Note: `revenuecat-webhook` and `delete-account` both have an outer catch block that returns 500 for unexpected non-MailerLite errors (unhandled code paths). The best-effort guarantee applies only to the MailerLite-specific inner try/catch blocks.

## Deploying

```bash
# Deploy sync-to-mailerlite (first-time or after changes)
supabase functions deploy sync-to-mailerlite --no-verify-jwt

# Deploy revenuecat-webhook (MailerLite section is part of this function)
supabase functions deploy revenuecat-webhook --no-verify-jwt

# Deploy delete-account (MailerLite section is part of this function)
supabase functions deploy delete-account --no-verify-jwt
```

`--no-verify-jwt` is required for all MapVault Edge Functions that receive external webhook calls. See `CLAUDE.md` for why.

After deploying `sync-to-mailerlite` for the first time, configure the Database Webhook in the Supabase Dashboard:
- **Table:** `public.profiles` — **Event:** `INSERT`
- **Type:** Supabase Edge Functions → `sync-to-mailerlite`
- **HTTP Headers:** `Authorization: Bearer <SYNC_WEBHOOK_SECRET>`

The Database Webhook configuration persists across function redeployments (`supabase functions deploy` updates the function in-place). No webhook reconfiguration is needed on normal deploys.
