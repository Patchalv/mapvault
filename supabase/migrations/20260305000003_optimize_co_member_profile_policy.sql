-- Optimize co-member profile policy to use is_map_member() helper
-- Skips map_members RLS evaluation by using the SECURITY DEFINER function

DROP POLICY "Users can view own and co-member profiles" ON profiles;

CREATE POLICY "Users can view own and co-member profiles"
  ON profiles FOR SELECT
  USING (
    auth.uid() = id
    OR EXISTS (
      SELECT 1
      FROM map_members
      WHERE map_members.user_id = profiles.id
        AND public.is_map_member(map_members.map_id)
    )
  );
