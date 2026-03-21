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
      → upsert subscriber with entitlement field from profile row

Path 2: Entitlement change
──────────────────────────
User purchases or subscription expires
  → RevenueCat fires webhook to revenuecat-webhook Edge Function
      → update profiles.entitlement (primary action)
      → [best-effort] fetch email from auth.users
      → [best-effort] upsert subscriber with updated entitlement field

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
| `supabase/functions/sync-to-mailerlite/index.ts` | Receives Database Webhook on profile INSERT; upserts new subscriber with entitlement field |
| `supabase/functions/revenuecat-webhook/index.ts` | Updates entitlement on RevenueCat events; upserts subscriber with updated field (best-effort) |
| `supabase/functions/delete-account/index.ts` | Deletes MailerLite subscriber before removing the Supabase Auth user (best-effort) |
| `scripts/backfill-mailerlite.ts` | One-time Deno script to sync all existing users to MailerLite |

## Subscriber Fields

| Field | Values | Set by |
|---|---|---|
| `source` | Always `"app"` | All sync paths + backfill script |
| `entitlement` | `"free"` or `"premium"` | All sync paths + backfill script |

Both fields are custom Text fields created in MailerLite (Subscribers → Fields).

## Segments (replaces Groups)

Targeting is done via MailerLite **Segments** that filter on the `entitlement` field. Segments auto-update as field values change — no manual group management required.

| Segment | Filter | Use for |
|---|---|---|
| **Free Users** | `entitlement` equals `free` | Upsell sequences, re-engagement |
| **Premium Users** | `entitlement` equals `premium` | Onboarding premium features, review asks |

Create these segments in MailerLite: Subscribers → Segments → Create segment.

**Migrating from groups (existing deployments):** Before deploying code that removes group logic, audit all automations and campaigns in MailerLite for references to the old "Free Users" and "Premium Users" groups. Repoint each one to the corresponding segment above. Keep the old groups in place until you've verified the segments show expected subscriber counts and automations trigger correctly — then delete the groups. If issues arise, revert automations back to the old groups while you investigate.

## Sync Triggers

| Event | Triggered by | Result |
|---|---|---|
| New user signs up | Database Webhook on `public.profiles` INSERT | Upsert subscriber with `entitlement` from profile row (typically `"free"`) |
| Purchase / renewal | RevenueCat `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE` | Upsert subscriber with `entitlement = "premium"` |
| Subscription expires / refunded | RevenueCat `EXPIRATION`, `REFUND` | Upsert subscriber with `entitlement = "free"` |
| Account deleted | User-initiated via `delete-account` function | Delete subscriber from MailerLite entirely |
| Apple private relay email | Any path | Skipped — MailerLite cannot deliver to `@privaterelay.appleid.com` addresses |

Note on CANCELLATION: a cancelled subscription retains premium access until the billing period ends. CANCELLATION events are intentionally not handled — the entitlement field stays unchanged until the EXPIRATION event fires.

## Environment Variables

Set all secrets in **Supabase Dashboard → Edge Functions → Secrets** (or via `supabase secrets set`).

| Variable | Purpose |
|---|---|
| `MAILERLITE_API_KEY` | MailerLite API v2 token; authenticates all calls to `connect.mailerlite.com` |
| `MAILERLITE_GROUP_ID` | Optional. When set, all subscribers are added to this group on every upsert (sign-up, entitlement change, backfill). Find the ID in MailerLite Dashboard → Groups → click your group → ID is in the URL. |
| `SYNC_WEBHOOK_SECRET` | Bearer token that Supabase Database Webhook sends to `sync-to-mailerlite`; prevents unauthorized calls to the function |

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
MAILERLITE_GROUP_ID=<group_id> \
deno run --allow-net --allow-env scripts/backfill-mailerlite.ts
```

`MAILERLITE_GROUP_ID` is optional — omit it to skip group assignment during backfill.

**What it does:**
1. Pages through all users via `supabase.auth.admin.listUsers()` (50 per page).
2. Skips `@privaterelay.appleid.com` addresses.
3. Fetches each user's current `entitlement` from `public.profiles`.
4. Upserts each subscriber individually via `POST /api/subscribers` with a 500 ms delay between calls to respect the MailerLite free-tier rate limit (120 req/min).
5. Logs progress: subscribers processed, skipped (private relay), and errors.

**Idempotency:** Safe to re-run. `POST /api/subscribers` is an upsert by email — re-running never creates duplicate subscribers. Fields are overwritten with the current value from Supabase.

## Error Handling

MailerLite is treated as a **best-effort side effect**. The core user experience (sign-up, payments, account deletion) must never fail because of a MailerLite outage.

| Failure scenario | Behaviour |
|---|---|
| MailerLite down during sign-up | `sync-to-mailerlite` captures Sentry exception, returns 200. Recover by re-running backfill. |
| MailerLite down during plan change | `revenuecat-webhook` catches error in inner try/catch, logs it, returns 200. Entitlement update is preserved in Supabase. MailerLite field stays out of sync until next event or manual backfill. |
| MailerLite down during account deletion | `delete-account` catches error, logs it, proceeds with deletion. Subscriber may remain in MailerLite. |
| Apple private relay email | All three functions skip the MailerLite call and proceed normally. |
| Subscriber not in MailerLite at deletion | 404 on subscriber lookup or delete is treated as success. |
| Invalid API key (401) | Functions log the response and return 200. |

**Why MailerLite-specific failures never return 500:**
- Supabase Database Webhooks don't retry — a 500 is no better than a 200.
- RevenueCat retries on non-200 — returning 500 would cause duplicate entitlement updates.
- Recovery is always via the backfill script.

Note: `revenuecat-webhook` and `delete-account` both have an outer `catch` block that returns 500 for unexpected non-MailerLite errors (unhandled code paths). The best-effort guarantee applies only to the MailerLite-specific inner `try/catch` blocks — those always return 200.

## Deploying

```bash
supabase functions deploy sync-to-mailerlite --no-verify-jwt
supabase functions deploy revenuecat-webhook --no-verify-jwt
supabase functions deploy delete-account --no-verify-jwt
```

`--no-verify-jwt` is required for all MapVault Edge Functions. See `CLAUDE.md` for why.

After deploying `sync-to-mailerlite` for the first time, configure the Database Webhook in the Supabase Dashboard:
- **Table:** `public.profiles` — **Event:** `INSERT`
- **Type:** Supabase Edge Functions → `sync-to-mailerlite`
- **HTTP Headers:** `Authorization: Bearer <SYNC_WEBHOOK_SECRET>`

The Database Webhook configuration persists across function redeployments.
