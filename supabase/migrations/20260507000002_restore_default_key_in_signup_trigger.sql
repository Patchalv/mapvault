-- Hotfix: 20260507000001 was applied to production with an outdated
-- handle_new_user() body that omitted the default_key column on tag insert,
-- silently regressing the i18n behavior added in
-- 20260326000001_add_default_key_to_tags.sql.
--
-- This migration redefines handle_new_user() with the correct body that
-- preserves default_key. Identical to the (now-corrected) function body in
-- 20260507000001 — included here so production gets the fix without needing
-- a migration repair.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_map_id uuid;
BEGIN
  -- 1. Create profile
  INSERT INTO profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url'
  );

  -- 2. Create default map
  INSERT INTO maps (name, created_by)
  VALUES ('My Map', NEW.id)
  RETURNING id INTO new_map_id;

  -- 3. Add user as owner of the default map
  INSERT INTO map_members (map_id, user_id, role)
  VALUES (new_map_id, NEW.id, 'owner');

  -- 4. Create default tags with semantic keys for i18n
  INSERT INTO tags (map_id, name, emoji, color, position, default_key) VALUES
    (new_map_id, 'Restaurant', '🍽️', '#EF4444', 0, 'restaurant'),
    (new_map_id, 'Bar',        '🍸', '#8B5CF6', 1, 'bar'),
    (new_map_id, 'Cafe',       '☕', '#F59E0B', 2, 'cafe'),
    (new_map_id, 'Friend',     '👥', '#3B82F6', 3, 'friend');

  -- 5. Set active map
  UPDATE profiles SET active_map_id = new_map_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$;

-- Defensive backfill: any users whose signup ran while the buggy trigger was
-- live will have default tags with NULL default_key. Match on name + position
-- AND emoji + color so a user-created tag that happens to share the name and
-- position cannot be silently relabeled as a default. The trigger always
-- inserts these exact values together, so the conjunction is safe.
UPDATE tags SET default_key = 'restaurant'
  WHERE default_key IS NULL AND name = 'Restaurant' AND position = 0
    AND emoji = '🍽️' AND color = '#EF4444';
UPDATE tags SET default_key = 'bar'
  WHERE default_key IS NULL AND name = 'Bar' AND position = 1
    AND emoji = '🍸' AND color = '#8B5CF6';
UPDATE tags SET default_key = 'cafe'
  WHERE default_key IS NULL AND name = 'Cafe' AND position = 2
    AND emoji = '☕' AND color = '#F59E0B';
UPDATE tags SET default_key = 'friend'
  WHERE default_key IS NULL AND name = 'Friend' AND position = 3
    AND emoji = '👥' AND color = '#3B82F6';
