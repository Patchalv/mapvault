import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/hooks/use-auth';
import type { MapPlaceWithDetails } from '@/types';

export function useMapPlaces(mapId: string | null) {
  const { user } = useAuth();

  return useQuery<MapPlaceWithDetails[]>({
    queryKey: ['map-places', mapId],
    queryFn: async () => {
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
        .eq('map_id', mapId!)
        .eq('place_visits.user_id', user!.id);

      if (error) throw error;
      return data as unknown as MapPlaceWithDetails[];
    },
    enabled: !!mapId && !!user,
  });
}
