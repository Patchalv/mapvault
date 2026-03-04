# Edge Functions Reference

6 Supabase Edge Functions that enforce business rules that can't be trusted to the client. All deployed with `--no-verify-jwt` and validate auth internally — most use `auth.getUser()` with a user Bearer token, except `revenuecat-webhook` which validates a shared webhook secret.

## Overview

| Function | Purpose | Key Rule |
|----------|---------|----------|
| `create-map` | Create a new map with default tags | Freemium: 1 map for free users |
| `add-place` | Save a place to a map | Freemium: 20 places for free users; owner/contributor only |
| `accept-invite` | Accept an invite token and join a map | Validates expiry, max uses, duplicates |
| `create-invite` | Create an invite link for a map | Premium owners only |
| `revenuecat-webhook` | Sync purchase events to entitlement | Maps RC events → `profiles.entitlement` |
| `delete-account` | Delete user and all associated data | RC cleanup (best-effort) + auth deletion |

---

## create-map

Creates a new map with 4 default tags, adds the user as owner, and sets it as their active map.

**Auth:** User Bearer token

### Request

```
POST /functions/v1/create-map
Authorization: Bearer <user-jwt>
```

```json
{
  "name": "Weekend Spots"
}
```

### Responses

| Status | Body | When |
|--------|------|------|
| 201 | `{ "mapId": "uuid", "mapName": "Weekend Spots" }` | Success |
| 400 | `{ "error": "Map name is required" }` | Empty or missing name |
| 401 | `{ "error": "Missing authorization header" }` | No auth header |
| 401 | `{ "error": "Invalid or expired token" }` | Bad token |
| 403 | `{ "error": "Free accounts are limited to 1 map...", "code": "FREEMIUM_LIMIT_EXCEEDED" }` | Free user at map limit |
| 500 | `{ "error": "..." }` | Database failure |

### Business Rules

- Free users can own max 1 map (counts `map_members` rows where role = `owner`)
- Premium users have no limit
- Default tags created: Restaurant, Bar, Cafe, Friend (with emoji and color)
- New map is automatically set as `profiles.active_map_id`

### Tables Written

`maps`, `map_members`, `tags`, `profiles`

---

## add-place

Saves a place to a map. Deduplicates the underlying `places` reference data by `google_place_id`. Optionally attaches tags and sets visited status.

**Auth:** User Bearer token

### Request

```
POST /functions/v1/add-place
Authorization: Bearer <user-jwt>
```

```json
{
  "googlePlaceId": "ChIJ...",
  "name": "Café Mame",
  "address": "123 Main St, Amsterdam",
  "latitude": 52.3676,
  "longitude": 4.9041,
  "googleCategory": "cafe",
  "mapId": "uuid",
  "note": "Great flat white",
  "tagIds": ["uuid", "uuid"],
  "visited": false
}
```

Required fields: `googlePlaceId`, `name`, `latitude`, `longitude`, `mapId`. All others are optional.

### Responses

| Status | Body | When |
|--------|------|------|
| 201 | `{ "mapPlaceId": "uuid" }` | Success |
| 400 | `{ "error": "Missing required fields: ..." }` | Missing required fields |
| 401 | `{ "error": "Missing authorization header" }` | No auth header |
| 401 | `{ "error": "Invalid or expired token" }` | Bad token |
| 403 | `{ "error": "You are not a member of this map" }` | Not a map member |
| 403 | `{ "error": "You do not have permission to add places to this map" }` | User is a `member` (not owner/contributor) |
| 403 | `{ "error": "Free accounts are limited to 20 places...", "code": "FREEMIUM_LIMIT_EXCEEDED" }` | Free user at place limit |
| 409 | `{ "error": "This place is already saved to this map" }` | Duplicate map_place |
| 500 | `{ "error": "..." }` | Database failure |

### Business Rules

- User must be an owner or contributor on the target map (members cannot add places)
- Free users can add max 20 places total (counted by `added_by` across all maps)
- `places` row is deduplicated: if `google_place_id` already exists, reuses it (Postgres error code `23505` on conflict)
- Same place can't be saved to the same map twice (`UNIQUE(map_id, place_id)`)
- Tags and visited status are optional — if `tagIds` provided, inserts into `map_place_tags`; if `visited` is true, inserts into `place_visits`

### Tables Written

`places`, `map_places`, `map_place_tags`, `place_visits`

---

## accept-invite

Validates an invite token and adds the user to the map.

**Auth:** User Bearer token

### Request

```
POST /functions/v1/accept-invite
Authorization: Bearer <user-jwt>
```

```json
{
  "token": "abc123xyz"
}
```

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "mapId": "uuid", "mapName": "Trip to Paris", "role": "contributor" }` | Success (role reflects invite configuration) |
| 400 | `{ "error": "Invite token is required" }` | Empty or missing token |
| 401 | `{ "error": "Missing authorization header" }` | No auth header |
| 401 | `{ "error": "Invalid or expired token" }` | Bad token |
| 404 | `{ "error": "This invite link is invalid", "code": "INVITE_NOT_FOUND" }` | Token not in DB |
| 409 | `{ "error": "You are already a member of this map", "code": "ALREADY_MEMBER" }` | Already a member |
| 410 | `{ "error": "This invite has expired", "code": "INVITE_EXPIRED" }` | Past `expires_at` |
| 410 | `{ "error": "This invite has reached its maximum uses", "code": "INVITE_MAX_USES" }` | `use_count >= max_uses` |
| 500 | `{ "error": "..." }` | Database failure |

### Business Rules

- Validates token exists, hasn't expired, and hasn't exceeded max uses
- Prevents duplicate membership (checks `map_members` first)
- Assigns the role specified in the invite (default: `contributor`)
- Increments `use_count` on the invite (non-fatal — if it fails, membership was already created)
- Returns map name for the client confirmation UI

### Tables Written

`map_members`, `map_invites` (use_count increment)

---

## create-invite

Creates an invite link for a map. Only premium map owners can create invites.

**Auth:** User Bearer token

### Request

```http
POST /functions/v1/create-invite
Authorization: Bearer <user-jwt>
```

```json
{
  "mapId": "uuid",
  "role": "contributor",
  "expiresInDays": 7,
  "maxUses": 10
}
```

Required fields: `mapId`. Optional: `role` (default: `'contributor'`), `expiresInDays`, `maxUses`.

### Responses

| Status | Body | When |
|--------|------|------|
| 201 | `{ "invite": { ... }, "link": "https://www.mapvault.app/invite/{token}" }` | Success |
| 400 | `{ "error": "Invalid or missing JSON in request body" }` | Unparseable body |
| 400 | `{ "error": "mapId must be a valid UUID" }` | Missing or invalid mapId |
| 400 | `{ "error": "Role must be 'contributor' or 'member'" }` | Invalid role |
| 400 | `{ "error": "expiresInDays must be a positive integer" }` | Invalid expiry |
| 400 | `{ "error": "maxUses must be a positive integer" }` | Invalid max uses |
| 401 | `{ "error": "Missing authorization header" }` | No auth header |
| 401 | `{ "error": "Invalid or expired token" }` | Bad token |
| 403 | `{ "error": "Only map owners can create invites" }` | User is not the map owner |
| 403 | `{ "error": "Invite links are a Premium feature. Upgrade to share your maps.", "code": "FREEMIUM_LIMIT_EXCEEDED" }` | Free user |
| 500 | `{ "error": "..." }` | Database failure |

### Business Rules

- User must be the **owner** of the target map
- User must have **premium** entitlement (free users cannot create invites)
- Role must be `'contributor'` or `'member'` (cannot invite as owner)
- `expiresInDays` sets `expires_at` to now + N days (null = never expires)
- `maxUses` limits how many times the invite can be accepted (null = unlimited)
- Returns the full invite object and the Universal Link URL

### Tables Written

`map_invites`

---

## revenuecat-webhook

Receives purchase lifecycle events from RevenueCat and updates `profiles.entitlement`.

**Auth:** Webhook secret (NOT a user token)

### Request

```
POST /functions/v1/revenuecat-webhook
Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>
```

```json
{
  "event": {
    "type": "INITIAL_PURCHASE",
    "app_user_id": "user-uuid"
  }
}
```

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "message": "Updated user {id} to premium" }` | Grant or revoke action taken |
| 200 | `{ "message": "Skipped anonymous user" }` | `app_user_id` starts with `$RCAnonymousID:` |
| 200 | `{ "message": "No action for event type: CANCELLATION" }` | Event type not mapped |
| 400 | `{ "error": "Invalid event payload" }` | Missing `event.type` or `event.app_user_id` |
| 401 | `{ "error": "Unauthorized" }` | Wrong or missing webhook secret |
| 500 | `{ "error": "Failed to update profile entitlement" }` | Database failure |

### Event Mapping

| Events | Action |
|--------|--------|
| `INITIAL_PURCHASE`, `RENEWAL`, `UNCANCELLATION`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE` | Set entitlement → `premium` |
| `EXPIRATION`, `REFUND` | Set entitlement → `free` |
| `CANCELLATION`, `BILLING_ISSUE`, all others | No action (subscription still active) |

### Secrets Required

- `REVENUECAT_WEBHOOK_SECRET` — must match the Bearer token configured in RevenueCat webhook settings

### Tables Written

`profiles` (entitlement column only)

---

## delete-account

Deletes the authenticated user's account and all associated data. Two-step process: RevenueCat cleanup (best-effort), then Supabase Auth deletion which triggers cascading database cleanup.

**Auth:** User Bearer token

### Request

```
POST /functions/v1/delete-account
Authorization: Bearer <user-jwt>
```

No request body required.

### Responses

| Status | Body | When |
|--------|------|------|
| 200 | `{ "message": "Account deleted successfully" }` | Success |
| 401 | `{ "error": "Missing authorization header" }` | No auth header |
| 401 | `{ "error": "Invalid or expired token" }` | Bad token |
| 500 | `{ "error": "Failed to delete account. Please try again." }` | Auth deletion failed |
| 500 | `{ "error": "Internal server error" }` | Uncaught exception |

### Deletion Pipeline

1. **RevenueCat** — Calls RC API to delete subscriber record. Best-effort: errors are logged but don't block deletion. Skipped entirely if `REVENUECAT_SECRET_API_KEY` is not set.
2. **Supabase Auth** — Calls `auth.admin.deleteUser()`, which triggers the `handle_user_deleted()` BEFORE DELETE trigger. The trigger cleans up all public schema data (see `docs/database.md` → Triggers).

### Secrets Required

- `REVENUECAT_SECRET_API_KEY` — RevenueCat admin API key (optional in dev, required in production)

### Tables Written

`auth.users` (delete) → cascading cleanup via trigger handles all public schema tables

See `docs/account-deletion.md` for the full deletion pipeline and what gets preserved vs deleted.
