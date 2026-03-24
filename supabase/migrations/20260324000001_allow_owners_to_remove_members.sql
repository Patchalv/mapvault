-- Allow premium map owners to remove non-owner members from their maps.
-- The existing "Members can leave maps" policy (user deletes their own row) remains untouched.
-- Uses (select auth.uid()) to avoid per-row evaluation (init plan optimisation).

CREATE POLICY "Owners can remove non-owner members"
  ON map_members FOR DELETE
  USING (
    map_members.role != 'owner'
    AND map_members.user_id != (select auth.uid())
    AND EXISTS (
      SELECT 1 FROM map_members AS mm
      WHERE mm.map_id = map_members.map_id
        AND mm.user_id = (select auth.uid())
        AND mm.role = 'owner'
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
        AND profiles.entitlement = 'premium'
    )
  );
