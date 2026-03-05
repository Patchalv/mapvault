-- Fix RLS auth.uid() initplan warnings (27 policies + 1 function)
--
-- Supabase Performance Advisor flags auth_rls_initplan when auth.uid() is
-- called directly in a policy expression. Wrapping it in (select auth.uid())
-- makes Postgres evaluate it once per query (as an InitPlan) instead of
-- per-row. Zero functional change, pure performance improvement.

-- ============================================================
-- 1. Update is_map_member() helper function
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_map_member(check_map_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.map_members
    WHERE map_id = check_map_id
    AND user_id = (select auth.uid())
  );
$$;

-- ============================================================
-- 2. profiles (2 policies)
-- ============================================================
DROP POLICY "Users can view own and co-member profiles" ON profiles;
CREATE POLICY "Users can view own and co-member profiles"
  ON profiles FOR SELECT
  USING (
    (select auth.uid()) = id
    OR EXISTS (
      SELECT 1
      FROM map_members
      WHERE map_members.user_id = profiles.id
        AND public.is_map_member(map_members.map_id)
    )
  );

DROP POLICY "Users can update own profile" ON profiles;
CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  USING ((select auth.uid()) = id);

-- ============================================================
-- 3. maps (4 policies)
-- ============================================================
DROP POLICY "Members can view their maps" ON maps;
CREATE POLICY "Members can view their maps"
  ON maps FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = maps.id
      AND map_members.user_id = (select auth.uid())
    )
  );

DROP POLICY "Authenticated users can create maps" ON maps;
CREATE POLICY "Authenticated users can create maps"
  ON maps FOR INSERT
  WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY "Owners can update maps" ON maps;
CREATE POLICY "Owners can update maps"
  ON maps FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = maps.id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role = 'owner'
    )
  );

DROP POLICY "Owners can delete maps" ON maps;
CREATE POLICY "Owners can delete maps"
  ON maps FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = maps.id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role = 'owner'
    )
  );

-- ============================================================
-- 4. map_members (4 policies)
-- ============================================================
DROP POLICY "Members can view map membership" ON map_members;
CREATE POLICY "Members can view map membership"
  ON map_members FOR SELECT
  USING (public.is_map_member(map_id));

DROP POLICY "System inserts members (via Edge Functions)" ON map_members;
CREATE POLICY "System inserts members (via Edge Functions)"
  ON map_members FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Members can leave maps" ON map_members;
CREATE POLICY "Members can leave maps"
  ON map_members FOR DELETE
  USING ((select auth.uid()) = user_id);

DROP POLICY "Owners can update member roles" ON map_members;
CREATE POLICY "Owners can update member roles"
  ON map_members FOR UPDATE
  USING (
    map_members.role IN ('contributor', 'member')
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
  )
  WITH CHECK (role IN ('contributor', 'member'));

-- ============================================================
-- 5. tags (4 policies)
-- ============================================================
DROP POLICY "Members can view tags" ON tags;
CREATE POLICY "Members can view tags"
  ON tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = (select auth.uid())
    )
  );

DROP POLICY "Contributors can create tags" ON tags;
CREATE POLICY "Contributors can create tags"
  ON tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

DROP POLICY "Contributors can update tags" ON tags;
CREATE POLICY "Contributors can update tags"
  ON tags FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

DROP POLICY "Contributors can delete tags" ON tags;
CREATE POLICY "Contributors can delete tags"
  ON tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = tags.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

-- ============================================================
-- 6. places (1 policy)
-- ============================================================
DROP POLICY "Authenticated users can view places" ON places;
CREATE POLICY "Authenticated users can view places"
  ON places FOR SELECT
  USING ((select auth.uid()) IS NOT NULL);

-- ============================================================
-- 7. map_places (4 policies)
-- ============================================================
DROP POLICY "Members can view map places" ON map_places;
CREATE POLICY "Members can view map places"
  ON map_places FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = (select auth.uid())
    )
  );

DROP POLICY "Contributors can add places" ON map_places;
CREATE POLICY "Contributors can add places"
  ON map_places FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

DROP POLICY "Contributors can update places" ON map_places;
CREATE POLICY "Contributors can update places"
  ON map_places FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

DROP POLICY "Contributors can delete places" ON map_places;
CREATE POLICY "Contributors can delete places"
  ON map_places FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_places.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

-- ============================================================
-- 8. map_place_tags (3 policies)
-- ============================================================
DROP POLICY "Members can view place tags" ON map_place_tags;
CREATE POLICY "Members can view place tags"
  ON map_place_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = (select auth.uid())
    )
  );

DROP POLICY "Contributors can manage place tags" ON map_place_tags;
CREATE POLICY "Contributors can manage place tags"
  ON map_place_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      JOIN tags ON tags.id = map_place_tags.tag_id
        AND tags.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

DROP POLICY "Contributors can remove place tags" ON map_place_tags;
CREATE POLICY "Contributors can remove place tags"
  ON map_place_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM map_places
      JOIN map_members ON map_members.map_id = map_places.map_id
      JOIN tags ON tags.id = map_place_tags.tag_id
        AND tags.map_id = map_places.map_id
      WHERE map_places.id = map_place_tags.map_place_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role IN ('owner', 'contributor')
    )
  );

-- ============================================================
-- 9. place_visits (4 policies)
-- ============================================================
DROP POLICY "Users can view own visit status" ON place_visits;
CREATE POLICY "Users can view own visit status"
  ON place_visits FOR SELECT
  USING ((select auth.uid()) = user_id);

DROP POLICY "Users can set own visit status" ON place_visits;
CREATE POLICY "Users can set own visit status"
  ON place_visits FOR INSERT
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY "Users can update own visit status" ON place_visits;
CREATE POLICY "Users can update own visit status"
  ON place_visits FOR UPDATE
  USING ((select auth.uid()) = user_id);

DROP POLICY "Users can delete own visit status" ON place_visits;
CREATE POLICY "Users can delete own visit status"
  ON place_visits FOR DELETE
  USING ((select auth.uid()) = user_id);

-- ============================================================
-- 10. map_invites (2 policies)
-- ============================================================
DROP POLICY "Members can view invites for their maps" ON map_invites;
CREATE POLICY "Members can view invites for their maps"
  ON map_invites FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_invites.map_id
      AND map_members.user_id = (select auth.uid())
    )
  );

DROP POLICY "Owners can create invites" ON map_invites;
CREATE POLICY "Owners can create invites"
  ON map_invites FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM map_members
      WHERE map_members.map_id = map_invites.map_id
      AND map_members.user_id = (select auth.uid())
      AND map_members.role = 'owner'
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = (select auth.uid())
      AND profiles.entitlement = 'premium'
    )
  );
