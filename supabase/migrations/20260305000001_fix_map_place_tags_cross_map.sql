-- Fix: validate that tag_id belongs to the same map as map_place_id
-- Prevents cross-map tag linking by contributors on multiple maps.

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
      AND map_members.user_id = auth.uid()
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
      AND map_members.user_id = auth.uid()
      AND map_members.role IN ('owner', 'contributor')
    )
  );
