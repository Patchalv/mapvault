# Database Schema

9 tables in the `public` schema, all with RLS enabled. Supabase Auth manages `auth.users`; everything else lives here.

## Entity Relationships

```
auth.users
  │ CASCADE
  ▼
profiles ──────────────────┐
  │ active_map_id (SET NULL)│
  ▼                         │
maps ◄─────────────────────┘
  │ CASCADE
  ├──► map_members ◄── profiles
  ├──► tags
  ├──► map_places ──► places (shared, deduplicated)
  │      │ CASCADE
  │      ├──► map_place_tags ◄── tags
  │      └──► place_visits ◄── profiles
  └──► map_invites ◄── profiles
```

Core pattern: `maps` is the central entity. Access is controlled through `map_members`. Deleting a map cascades to all child data.

## Tables

### profiles

Extends `auth.users`. Created automatically by the signup trigger.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, FK → auth.users (CASCADE) | Same as auth user ID |
| display_name | text | nullable | From OAuth provider metadata |
| avatar_url | text | nullable | From OAuth provider metadata |
| entitlement | text | NOT NULL, default `'free'` | `'free'` or `'premium'` |
| active_map_id | uuid | FK → maps (SET NULL), nullable | Last-viewed map |
| created_at | timestamptz | NOT NULL, default `now()` | |

**RLS:** Users can SELECT and UPDATE their own row only.

### maps

User-created place collections.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| name | text | NOT NULL | |
| created_by | uuid | FK → profiles, nullable | Nullified on user deletion |
| created_at | timestamptz | NOT NULL, default `now()` | |

**Indexes:** `idx_maps_created_by`

**RLS:** Members can SELECT. Only the creator can INSERT. Owners can UPDATE and DELETE.

### map_members

Junction table controlling map access. Membership = access.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| map_id | uuid | NOT NULL, FK → maps (CASCADE) | |
| user_id | uuid | NOT NULL, FK → profiles | |
| role | text | NOT NULL, default `'contributor'`, CHECK | `'owner'`, `'contributor'`, or `'member'` |
| joined_at | timestamptz | NOT NULL, default `now()` | |

**Unique:** `(map_id, user_id)`

**Indexes:** `idx_map_members_user_id`, `idx_map_members_map_id`

**RLS:** Members can SELECT membership for maps they belong to (via `is_map_member()` helper to avoid recursion). Users can INSERT their own row. Users can DELETE their own row (leave a map). Owners can UPDATE non-owner member roles (contributor ↔ member).

### tags

Per-map tag definitions with emoji and color.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| map_id | uuid | NOT NULL, FK → maps (CASCADE) | |
| name | text | NOT NULL | |
| color | text | nullable | Hex color, e.g. `#EF4444` |
| emoji | text | nullable | Single emoji character |
| position | integer | NOT NULL, default `0` | Display order |
| created_at | timestamptz | NOT NULL, default `now()` | |

**Unique:** `(map_id, name)`

**Indexes:** `idx_tags_map_id`

**RLS:** All map members can SELECT. Owners and contributors can INSERT, UPDATE, and DELETE.

### places

Shared Google Places reference data, deduplicated by `google_place_id`. Not user-owned — any authenticated user can read/insert. Multiple `map_places` rows can reference the same `places` row.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| google_place_id | text | NOT NULL, UNIQUE | Google Places API ID |
| name | text | NOT NULL | Place name from Google |
| address | text | nullable | Formatted address |
| latitude | float8 | NOT NULL | |
| longitude | float8 | NOT NULL | |
| google_category | text | nullable | Primary type from Google |
| created_at | timestamptz | NOT NULL, default `now()` | |

**RLS:** Any authenticated user can SELECT and INSERT. No UPDATE or DELETE policies (reference data is immutable from the client).

### map_places

A place saved to a specific map. This is the core user-facing entity — it connects a `places` reference to a `maps` collection, with user context (note, who added it).

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| map_id | uuid | NOT NULL, FK → maps (CASCADE) | |
| place_id | uuid | NOT NULL, FK → places | |
| note | text | nullable | User's note about the place |
| added_by | uuid | FK → profiles, nullable | Nullified on user deletion |
| created_at | timestamptz | NOT NULL, default `now()` | |

**Unique:** `(map_id, place_id)` — a place can only be saved once per map.

**Indexes:** `idx_map_places_map_id`, `idx_map_places_place_id`

**RLS:** All map members can SELECT. Owners and contributors can INSERT, UPDATE, and DELETE.

### map_place_tags

Junction table associating tags with saved places.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| map_place_id | uuid | PK, FK → map_places (CASCADE) | |
| tag_id | uuid | PK, FK → tags (CASCADE) | |

**RLS:** All map members can SELECT. Owners and contributors can INSERT and DELETE (checked via `map_places` → `map_members` join).

### place_visits

Per-user visited status. Personal data — not shared with other map members.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| user_id | uuid | PK, FK → profiles | |
| map_place_id | uuid | PK, FK → map_places (CASCADE) | |
| visited | boolean | NOT NULL, default `false` | |

**RLS:** Users can only SELECT, INSERT, UPDATE, and DELETE their own rows.

### map_invites

Invite tokens for sharing maps with other users.

| Column | Type | Constraints | Notes |
|--------|------|-------------|-------|
| id | uuid | PK, default `gen_random_uuid()` | |
| map_id | uuid | NOT NULL, FK → maps (CASCADE) | |
| token | text | NOT NULL, UNIQUE | Random invite token |
| created_by | uuid | NOT NULL, FK → profiles | |
| role | text | NOT NULL, default `'contributor'`, CHECK | `'contributor'` or `'member'` — role granted to accepter |
| expires_at | timestamptz | nullable | Null = never expires |
| max_uses | integer | nullable | Null = unlimited |
| use_count | integer | NOT NULL, default `0` | Incremented on accept |
| created_at | timestamptz | NOT NULL, default `now()` | |

**RLS:** Map members can SELECT invites for their maps. Owners can INSERT (enforced via `create-invite` Edge Function which checks premium entitlement).

## Triggers

### on_auth_user_created → `handle_new_user()`

Fires AFTER INSERT on `auth.users`. Creates the full initial state for a new user:

1. Insert `profiles` row (display name and avatar from OAuth metadata)
2. Create default "My Map" in `maps`
3. Add `map_members` row (role = owner)
4. Create 4 default tags: Restaurant, Bar, Cafe, Friend
5. Set `profiles.active_map_id` to the new map

### on_auth_user_deleted → `handle_user_deleted()`

Fires BEFORE DELETE on `auth.users`. Cleans up all user data to prevent FK violations:

1. Clear `active_map_id` on profile
2. Delete `place_visits`
3. Delete `map_invites` created by user
4. Delete sole-member maps (CASCADE handles children)
5. Transfer ownership on shared maps (to longest-tenured member)
6. Nullify `added_by` on remaining `map_places`
7. Remove all `map_members` rows
8. Delete orphaned `places` from deleted sole-member maps

See `docs/account-deletion.md` for the full deletion pipeline.

## Helper Functions

### `is_map_member(check_map_id uuid) → boolean`

SECURITY DEFINER function that checks if the current user is a member of a map. Used in the `map_members` SELECT policy to avoid infinite recursion (a policy on `map_members` that queries `map_members` would recurse without this).

## Migrations

| File | Purpose |
|------|---------|
| `20260221000001_create_tables.sql` | Create all 9 tables with constraints and indexes |
| `20260221000002_create_rls_policies.sql` | RLS policies for all tables |
| `20260221000003_create_signup_trigger.sql` | `handle_new_user()` trigger |
| `20260222000001_fix_map_members_rls_recursion.sql` | Add `is_map_member()` helper |
| `20260222000002_allow_members_to_leave_maps.sql` | Members can delete own membership |
| `20260222000003_add_user_cleanup_trigger.sql` | `handle_user_deleted()` trigger |
| `20260223000001_cleanup_orphaned_places_on_delete.sql` | Add orphaned places cleanup to deletion trigger |
| `20260304000001_freemium_roles_redesign.sql` | Rename `editor` → `contributor`, add `member` role, restrict RLS to owner/contributor writes, add CHECK constraints |
