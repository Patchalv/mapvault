-- Freemium & Roles Redesign Migration
-- - Renames 'editor' role to 'contributor', adds 'member' (read-only) role
-- - Restricts write operations to owner/contributor via RLS
-- - Restricts invite creation to owners
-- - Adds map_members UPDATE policy for owners to change roles

-- ============================================================
-- 1. Rename editor → contributor in map_invites
-- ============================================================
UPDATE map_invites SET role = 'contributor' WHERE role = 'editor';

-- ============================================================
-- 2. Rename editor → contributor in map_members
-- ============================================================
UPDATE map_members SET role = 'contributor' WHERE role = 'editor';

-- ============================================================
-- 3. Change defaults
-- ============================================================
ALTER TABLE map_members ALTER COLUMN role SET DEFAULT 'contributor';
ALTER TABLE map_invites ALTER COLUMN role SET DEFAULT 'contributor';

-- ============================================================
-- 4. Add CHECK constraints
-- ============================================================
ALTER TABLE map_members
  ADD CONSTRAINT map_members_role_check
  CHECK (role IN ('owner', 'contributor', 'member'));

ALTER TABLE map_invites
  ADD CONSTRAINT map_invites_role_check
  CHECK (role IN ('contributor', 'member'));

-- ============================================================
-- 5. Drop old RLS policies (membership-only, no role check)
-- ============================================================

-- map_places: INSERT/UPDATE/DELETE
DROP POLICY "Members can add places" ON map_places;
DROP POLICY "Members can update places" ON map_places;
DROP POLICY "Members can delete places" ON map_places;

-- map_place_tags: INSERT/DELETE
DROP POLICY "Members can manage place tags" ON map_place_tags;
DROP POLICY "Members can remove place tags" ON map_place_tags;

-- tags: INSERT/UPDATE/DELETE
DROP POLICY "Members can create tags" ON tags;
DROP POLICY "Members can update tags" ON tags;
DROP POLICY "Members can delete tags" ON tags;

-- map_invites: INSERT
DROP POLICY "Members can create invites" ON map_invites;

-- ============================================================
-- 6. Recreate RLS policies with role checks
-- ============================================================

-- map_places: only owner/contributor can write
CREATE POLICY "Contributors can add places"
  ON map_places FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

CREATE POLICY "Contributors can update places"
  ON map_places FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

CREATE POLICY "Contributors can delete places"
  ON map_places FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

-- map_place_tags: only owner/contributor can write (via join through map_places)
CREATE POLICY "Contributors can manage place tags"
  ON map_place_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

CREATE POLICY "Contributors can remove place tags"
  ON map_place_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

-- tags: only owner/contributor can write
CREATE POLICY "Contributors can create tags"
  ON tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

CREATE POLICY "Contributors can update tags"
  ON tags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

CREATE POLICY "Contributors can delete tags"
  ON tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );

-- map_invites: only premium owners can create invites
CREATE POLICY "Owners can create invites"
  ON map_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_invites.map_id
      AND map_members.user_id = auth.uid()
      AND map_members.role = 'owner'
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.entitlement = 'premium'
    )
  );

-- ============================================================
-- 7. New map_members UPDATE policy (owners can change roles)
-- ============================================================
CREATE POLICY "Owners can update member roles"
  ON map_members FOR UPDATE
  USING (
    map_members.role IN ('contributor', 'member')
    AND map_members.user_id != auth.uid()
    AND EXISTS (
      SELECT 1 FROM map_members AS mm
      WHERE mm.map_id = map_members.map_id
      AND mm.user_id = auth.uid()
      AND mm.role = 'owner'
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.entitlement = 'premium'
    )
  )
  WITH CHECK (role IN ('contributor', 'member'));

-- ============================================================
-- 8. Restrict map_members UPDATE to role column only
-- ============================================================
REVOKE UPDATE ON map_members FROM authenticated;
GRANT UPDATE (role) ON map_members TO authenticated;
