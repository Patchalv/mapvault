-- Beta: grant premium entitlement to all new sign-ups.
--
-- Updates handle_new_user() to insert profiles with entitlement = 'premium'
-- instead of the default 'free'. All existing logic is preserved unchanged.
--
-- End-of-beta: run a follow-up migration that reverts to the default:
--   CREATE OR REPLACE FUNCTION handle_new_user() ... (omit entitlement column)
-- Existing beta users keep their entitlement until the RC promotional grant
-- expires, at which point the revenuecat-webhook sets them back to 'free'.
--
-- REQUIRED: A Supabase Database Webhook must be configured manually in the
-- Supabase Dashboard (Database > Webhooks) to fire this Edge Function on
-- new profile inserts:
--   Name:      on_profile_insert_grant_beta
--   Table:     public.profiles
--   Event:     INSERT
--   Method:    POST
--   URL:       https://<ref>.supabase.co/functions/v1/grant-beta-premium
--   Headers:   Authorization: Bearer <SYNC_WEBHOOK_SECRET>
-- Verify it fires by checking Edge Function logs after a fresh sign-up.

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_map_id uuid;
BEGIN
  -- 1. Create profile (beta: entitlement = 'premium' for all new users)
  INSERT INTO profiles (id, display_name, avatar_url, entitlement)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.raw_user_meta_data->>'avatar_url',
    'premium'
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
