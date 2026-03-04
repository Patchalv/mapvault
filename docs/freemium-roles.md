# Freemium & Roles System

MapVault uses a freemium model with a three-role permission system. This document is the single reference for how subscriptions and roles interact.

## Subscription Tiers

### Free

- **1 owned map**
- **20 saved places** (global across all maps, counted by `added_by = user_id`)
- **Cannot create invites** (sharing is premium-only)
- **Cannot manage roles** (changing contributor <-> member is premium-only)
- Can join unlimited shared maps as contributor or member
- Can toggle visited status on any map

### Premium (9.99/year)

- **Unlimited owned maps**
- **Unlimited saved places**
- **Can create invite links** on maps they own
- **Can manage roles** (change contributor <-> member) on maps they own
- All free tier capabilities

### Feature Comparison

| Feature | Free | Premium |
|---|---|---|
| Maps created | 1 | Unlimited |
| Places saved | 20 | Unlimited |
| Share & invite | -- | Yes |
| Manage roles | -- | Yes |
| Contribute to shared maps | Up to 20 places | Unlimited |
| View shared maps | Yes | Yes |
| Mark visited | Yes | Yes |

## Role Definitions

Every map membership has one of three roles: **owner**, **contributor**, or **member**.

### Owner

The user who created the map. Every map has exactly one owner. Owners have full control over the map including renaming, deleting, and (if premium) inviting and managing roles. Owners can also do everything a contributor can.

### Contributor

Invited with write access. Can add, edit, and delete places and tags. Can add notes. Cannot rename/delete the map or manage other members.

### Member

Invited with read-only access. Can view all places, toggle visited status, and get directions. Cannot modify places, tags, or notes.

### Permission Matrix

| Action | Owner | Contributor | Member |
|---|---|---|---|
| View places | Yes | Yes | Yes |
| Add/edit/delete places | Yes | Yes | -- |
| Add/edit/delete tags | Yes | Yes | -- |
| Add/edit notes | Yes | Yes | -- |
| Toggle visited | Yes | Yes | Yes |
| Get directions | Yes | Yes | Yes |
| Rename map | Yes | -- | -- |
| Delete map | Yes | -- | -- |
| Create invite links | Premium only | -- | -- |
| Change member roles | Premium only | -- | -- |
| Remove members | Premium only | -- | -- |

## How Roles Interact with Subscriptions

- **Owner's subscription** controls invite creation and role management (premium-gated)
- **Any user's subscription** controls the 20-place limit for adding places (applied to the `added_by` user, not the map owner)
- **Member role is unaffected by subscription** -- a premium user who is a `member` on someone else's map is still read-only on that map
- **Role is social, subscription is personal** -- upgrading to premium doesn't change your role on other people's maps

### Downgrade Handling (Premium -> Free)

When a premium user's subscription expires:
- All data remains intact -- no deletions
- All maps and memberships stay
- Existing shared members keep their access and roles
- **Restricted:** Cannot create new maps (if already at 1+), add places (if at 20+), create invites, or change roles
- **Allowed:** View, edit/delete existing places, filter, toggle visited, get directions

## Enforcement Layers

Each restriction is enforced at one or more layers:

| Action | RLS (Database) | Edge Function | UI |
|---|---|---|---|
| Member cannot add places | `map_places` INSERT policy requires owner/contributor | `add-place` checks role | Add button hidden for members |
| Member cannot edit tags | `tags` INSERT/UPDATE/DELETE policies require owner/contributor | -- | Tag editing hidden for members |
| Member cannot edit notes | `map_places` UPDATE policy requires owner/contributor | -- | Note editing hidden for members |
| Free user place limit (20) | -- | `add-place` checks entitlement + count | Freemium gate alert on 403 |
| Free user map limit (1) | -- | `create-map` checks entitlement + count | Freemium gate alert on 403 |
| Free user cannot invite | `map_invites` INSERT restricted to owners | `create-invite` checks entitlement | Upgrade alert shown |
| Free user cannot change roles | `map_members` UPDATE restricted to owners | -- | Role change UI hidden |
| Only owners can invite | `map_invites` INSERT restricted to owners | `create-invite` checks ownership | Invite UI only shown to owners |

## Key Files

### Hooks

| File | Purpose |
|---|---|
| `hooks/use-map-role.ts` | Returns current user's role on a map (`role`, `isOwner`, `isContributor`, `isMember`, `canEdit`) |
| `hooks/use-create-invite.ts` | Mutation: creates invite via `create-invite` Edge Function |
| `hooks/use-update-member-role.ts` | Mutation: changes contributor <-> member via direct Supabase update |
| `hooks/use-freemium-gate.ts` | Catches `FREEMIUM_LIMIT_EXCEEDED` errors, shows upgrade alert |

### Edge Functions

| File | Purpose |
|---|---|
| `supabase/functions/add-place/index.ts` | Enforces 20-place limit and owner/contributor role check |
| `supabase/functions/create-invite/index.ts` | Enforces premium + owner requirement for invite creation |
| `supabase/functions/create-map/index.ts` | Enforces 1-map limit for free users |
| `supabase/functions/accept-invite/index.ts` | Assigns role from invite token on join |

### Constants & Types

| File | Purpose |
|---|---|
| `lib/constants.ts` | `FREE_TIER` (maxMaps: 1, maxPlaces: 20), `ROLES`, `ENTITLEMENTS`, error codes |
| `types/index.ts` | `MapRole` type: `'owner' \| 'contributor' \| 'member'` |

### Database

| File | Purpose |
|---|---|
| `supabase/migrations/20260304000001_freemium_roles_redesign.sql` | Migration: rename editor -> contributor, add member role, restrict RLS, add CHECK constraints |

## Invite Flow

```text
Premium Owner taps "Invite"
  -> Selects role (contributor / member)
  -> Client calls create-invite Edge Function
  -> Edge Function checks: is owner? is premium?
  -> Creates map_invites row with token, role, expiry, max_uses
  -> Returns invite link: https://www.mapvault.app/invite/{token}
  -> Owner shares link via iOS/Android share sheet

Recipient taps invite link
  -> Universal Link opens app (or fallback web page)
  -> Client calls accept-invite Edge Function
  -> Edge Function validates: token exists, not expired, not at max uses, not already member
  -> Creates map_members row with role from invite
  -> Increments use_count on invite
  -> Returns map name and role to client
```

## Role Management Flow

```text
Premium Owner opens map settings
  -> Sees member list with current roles
  -> Taps on a contributor or member
  -> Selects new role (contributor <-> member)
  -> Client calls Supabase directly: UPDATE map_members SET role = 'new_role'
  -> RLS policy allows: user is owner of the map, target is not owner
  -> Invalidates map-members query cache
  -> Tracks member_role_changed analytics event
```

Free owners see the member list but cannot change roles (UI is gated).
