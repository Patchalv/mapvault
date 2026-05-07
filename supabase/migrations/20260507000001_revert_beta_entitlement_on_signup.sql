-- End of beta: revert handle_new_user() so new sign-ups default to 'free'.
--
-- This reverses 20260318000001_beta_entitlement_on_signup.sql by omitting the
-- entitlement column on profile insert, letting the column default ('free')
-- apply.
--
-- Existing beta users keep their 'premium' entitlement until their RevenueCat
-- promotional grant expires, at which point the revenuecat-webhook function
-- flips them back to 'free'.
--
-- After applying this migration:
--   1. Disable / delete the 'on_profile_insert_grant_beta' Database Webhook
--      in the Supabase Dashboard (Database > Webhooks).
--   2. The grant-beta-premium Edge Function can be removed.

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

  -- 4. Create default tags
  INSERT INTO tags (map_id, name, emoji, color, position) VALUES
    (new_map_id, 'Restaurant', '🍽️', '#EF4444', 0),
    (new_map_id, 'Bar',        '🍸', '#8B5CF6', 1),
    (new_map_id, 'Cafe',       '☕', '#F59E0B', 2),
    (new_map_id, 'Friend',     '👥', '#3B82F6', 3);

  -- 5. Set active map
  UPDATE profiles SET active_map_id = new_map_id WHERE id = NEW.id;

  RETURN NEW;
END;
$$;
