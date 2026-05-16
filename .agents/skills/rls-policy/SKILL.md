---
name: rls-policy
description: Write Supabase RLS policies for MapVault tables. Use when creating or modifying database migrations that include RLS.
---

# Supabase RLS Policy Patterns

MapVault uses three RLS patterns. Every table MUST have RLS enabled.

## Pattern 1: Personal Data

Tables where each row belongs to a single user.

**Used by:** `profiles`, `place_visits`

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Read own data
CREATE POLICY "Users can view own <table>"
  ON <table> FOR SELECT
  USING (auth.uid() = <user_column>);

-- Write own data
CREATE POLICY "Users can insert own <table>"
  ON <table> FOR INSERT
  WITH CHECK (auth.uid() = <user_column>);

CREATE POLICY "Users can update own <table>"
  ON <table> FOR UPDATE
  USING (auth.uid() = <user_column>);

CREATE POLICY "Users can delete own <table>"
  ON <table> FOR DELETE
  USING (auth.uid() = <user_column>);
```

**Key:** The `<user_column>` is `id` for profiles, `user_id` for place_visits.

## Pattern 2: Map Membership

Tables where access is controlled by membership in a map.

**Used by:** `maps`, `map_members`, `tags`, `map_places`, `map_place_tags`, `map_invites`

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

-- Read: must be a member of the map
CREATE POLICY "Members can view <table>"
  ON <table> FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = <table>.map_id
      AND map_members.user_id = auth.uid()
    )
  );

-- Write: must be a member of the map
CREATE POLICY "Members can insert <table>"
  ON <table> FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = <table>.map_id
      AND map_members.user_id = auth.uid()
    )
  );

-- Update/Delete follow the same pattern
-- For owner-only operations, add: AND map_members.role = 'owner'
```

**Variations:**

- `map_place_tags` joins through `map_places` to reach `map_id`:
  ```sql
  EXISTS (
    SELECT 1 FROM map_places
    JOIN map_members ON map_members.map_id = map_places.map_id
    WHERE map_places.id = map_place_tags.map_place_id
    AND map_members.user_id = auth.uid()
  )
  ```
- Owner-only operations (update/delete maps, remove members) add `AND map_members.role = 'owner'`

## Pattern 3: Reference Data

Tables with shared, deduplicated data readable by any authenticated user.

**Used by:** `places`

```sql
ALTER TABLE <table> ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view <table>"
  ON <table> FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert <table>"
  ON <table> FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
```

**Key:** No update/delete policies. Reference data is immutable from the client.

## Checklist

When writing a migration with RLS:

- [ ] `ALTER TABLE <name> ENABLE ROW LEVEL SECURITY;` on every new table
- [ ] Policy for every operation the app performs (SELECT, INSERT, UPDATE, DELETE)
- [ ] Owner-only operations use `AND map_members.role = 'owner'`
- [ ] Junction tables join through their parent to reach `map_id`
- [ ] Indexes exist on columns used in RLS WHERE clauses (`map_id`, `user_id`)
- [ ] Foreign keys use `ON DELETE CASCADE` where appropriate
- [ ] Test: can a non-member access another user's data? (should fail)

## Common Mistakes

1. **Forgetting to enable RLS** — table is wide open without it
2. **Missing index on map_members(user_id, map_id)** — RLS queries will be slow
3. **Using `auth.uid() = created_by` instead of membership check** — breaks shared maps
4. **Forgetting CASCADE on foreign keys** — orphaned rows when parent is deleted
5. **Not testing with a second user** — RLS bugs only surface with multiple users
