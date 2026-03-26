-- Add default_key column to tags to support render-time i18n translation.
-- Default tags created on signup and map creation store a semantic key
-- (e.g. 'restaurant') so the UI can render the correct locale string
-- without storing locale-specific names in the database.

ALTER TABLE tags ADD COLUMN default_key text;

-- Backfill existing default tags.
-- Match on both name AND position to avoid touching user-renamed tags.
UPDATE tags SET default_key = 'restaurant' WHERE name = 'Restaurant' AND position = 0;
UPDATE tags SET default_key = 'bar'        WHERE name = 'Bar'        AND position = 1;
UPDATE tags SET default_key = 'cafe'       WHERE name = 'Cafe'       AND position = 2;
UPDATE tags SET default_key = 'friend'     WHERE name = 'Friend'     AND position = 3;

-- Update handle_new_user trigger to set default_key on new signups.
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
