-- Add indexes on unindexed foreign key columns flagged by Supabase Performance Advisor.
-- These prevent sequential scans during CASCADE deletes/updates on parent rows
-- and speed up RLS policy evaluation and app queries that filter on these columns.

CREATE INDEX idx_map_invites_map_id ON map_invites(map_id);
CREATE INDEX idx_map_invites_created_by ON map_invites(created_by);
CREATE INDEX idx_map_place_tags_tag_id ON map_place_tags(tag_id);
CREATE INDEX idx_map_places_added_by ON map_places(added_by);
CREATE INDEX idx_place_visits_map_place_id ON place_visits(map_place_id);
CREATE INDEX idx_profiles_active_map_id ON profiles(active_map_id);
