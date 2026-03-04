-- Allow users to view profiles of people they share a map with
-- Replaces the original "Users can view own profile" policy which only
-- allowed auth.uid() = id, causing co-members to show as "Unknown"

-- Drop the old restrictive policy
DROP POLICY "Users can view own profile" ON profiles;

-- New policy: own profile OR shares a map with the viewer
-- Uses is_map_member() (SECURITY DEFINER) to skip map_members RLS evaluation
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
