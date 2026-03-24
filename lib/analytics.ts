import type { PostHog } from 'posthog-react-native';

type JsonType = string | number | boolean | null | { [key: string]: JsonType } | JsonType[];

type AnalyticsEvents = {
  signup_completed: { method: 'apple' | 'google' };
  place_search_started: Record<string, never>;
  place_search_query: { query_length: number };
  place_search_result_selected: { google_category: string | null };
  place_saved: {
    map_id: string;
    tag_count: number;
    tags: string[];
    has_note: boolean;
    visited: boolean;
    google_category: string | null;
  };
  place_save_abandoned: Record<string, never>;
  explore_viewed: { view_mode: 'map' | 'list'; active_map: 'single' | 'all' };
  filter_applied: {
    filter_type: 'tag' | 'visited' | 'search';
    active_tags: string[];
    visited_filter: 'all' | 'visited' | 'not_visited';
    has_search_query: boolean;
    results_count: number;
  };
  filter_cleared: Record<string, never>;
  place_detail_viewed: {
    map_place_id: string;
    has_note: boolean;
    is_visited: boolean;
  };
  directions_opened: { map_place_id: string };
  visited_toggled: { map_place_id: string; new_status: boolean };
  view_mode_switched: { new_mode: 'map' | 'list' };
  map_created: { map_id: string };
  map_switched: { map_id: string | 'all'; source: 'dropdown' };
  map_deleted: { map_id: string };
  tag_created: { map_id: string; tag_name: string };
  invite_link_created: { map_id: string };
  invite_link_shared: { map_id: string };
  invite_accepted: { map_id: string };
  invites_screen_viewed: { map_id: string };
  members_page_viewed: { map_id: string };
  invite_revoked: { map_id: string; invite_id: string };
  member_role_changed: { map_id: string; new_role: string };
  paywall_viewed: {
    trigger: 'map_limit' | 'place_limit' | 'invite_limit' | 'profile_tap' | 'profile_cta';
  };
  purchase_started: Record<string, never>;
  purchase_completed: Record<string, never>;
  purchase_failed: { reason: 'cancelled' | 'error' };
  review_prompted: { trigger: 'place_visited' | 'places_saved_milestone' | 'directions_after_filter' };
};

let posthogInstance: PostHog | null = null;

export function setPostHogInstance(instance: PostHog) {
  posthogInstance = instance;
}

export function track<T extends keyof AnalyticsEvents>(
  event: T,
  properties: AnalyticsEvents[T]
) {
  if (!posthogInstance) {
    if (__DEV__) {
      console.warn(`[Analytics] PostHog not initialized, dropping event: ${event}`);
    }
    return;
  }
  posthogInstance.capture(event, properties as { [key: string]: JsonType });
}

export function identifyUser(userId: string, properties?: { [key: string]: JsonType }) {
  posthogInstance?.identify(userId, properties);
}

export function resetUser() {
  posthogInstance?.reset();
}

export function updateUserProperties(properties: { [key: string]: JsonType }) {
  posthogInstance?.capture('$set', { $set: properties });
}
