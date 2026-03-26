import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import { ALL_MAPS_ID } from '@/lib/constants';
import type { MapPlaceWithDetails } from '@/types';

export function useAllMapPlaces(enabled: boolean) {
  const { user } = useAuth();

  return useQuery<MapPlaceWithDetails[]>({
    queryKey: ['map-places', ALL_MAPS_ID],
    queryFn: async () => {
      // Step 1: Get all map IDs this user is a member of
      const { data: memberships, error: memberError } = await supabase
        .from('map_members')
        .select('map_id')
        .eq('user_id', user!.id);

      if (memberError) throw memberError;

      const mapIds = memberships.map((m) => m.map_id);
      if (mapIds.length === 0) return [];

      // Step 2: Fetch all map_places across those maps
      const { data, error } = await supabase
        .from('map_places')
        .select(
          `
          id, note, created_at, added_by, map_id, place_id,
          places (id, name, address, latitude, longitude, google_place_id, google_category),
          map_place_tags (tag_id, tags (id, name, emoji, color, position, default_key)),
          place_visits (visited)
          `
        )
        .in('map_id', mapIds)
        .eq('place_visits.user_id', user!.id);

      if (error) throw error;
      return data as unknown as MapPlaceWithDetails[];
    },
    enabled: enabled && !!user,
  });
}
