import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/use-profile';
import { useMaps } from '@/hooks/use-maps';
import { track } from '@/lib/analytics';
import { ALL_MAPS_ID } from '@/lib/constants';
import type { MapRole } from '@/types';

export function useActiveMap() {
  const { data: profile } = useProfile();
  const { data: mapMembers } = useMaps();
  const queryClient = useQueryClient();

  const maps = mapMembers?.map((m) => m.maps).filter(Boolean) ?? [];

  // null active_map_id means "All Maps" mode
  const isAllMaps = profile?.active_map_id === null && maps.length > 0;
  const activeMapId = isAllMaps
    ? ALL_MAPS_ID
    : profile?.active_map_id ?? maps[0]?.id ?? null;
  const activeMap = isAllMaps
    ? null
    : maps.find((m) => m.id === activeMapId) ?? maps[0] ?? null;

  // Role for active map (null when "All Maps")
  const activeMembership = isAllMaps
    ? null
    : mapMembers?.find((m) => m.maps?.id === (activeMap?.id ?? activeMapId)) ?? null;
  const activeMapRole = (activeMembership?.role ?? null) as MapRole | null;
  const canEditActiveMap = activeMapRole === 'owner' || activeMapRole === 'contributor';

  const { mutate: _setActiveMap, isPending: isSettingMap } = useMutation({
    mutationFn: async ({ mapId }: { mapId: string; source?: 'dropdown' | 'settings' }) => {
      if (!profile) throw new Error('No profile');
      // ALL_MAPS_ID → set active_map_id to null
      const newActiveMapId = mapId === ALL_MAPS_ID ? null : mapId;
      const { error } = await supabase
        .from('profiles')
        .update({ active_map_id: newActiveMapId })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: (_data, { mapId, source = 'dropdown' }) => {
      track('map_switched', {
        map_id: mapId === ALL_MAPS_ID ? 'all' : mapId,
        source,
      });
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  // Backwards-compatible wrapper to support optional source parameter
  const setActiveMap = (mapId: string, options?: { source?: 'dropdown' | 'settings' }) => {
    _setActiveMap({ mapId, source: options?.source });
  };

  return {
    activeMapId,
    activeMapName: isAllMaps ? null : activeMap?.name ?? null,
    activeMapRole,
    canEditActiveMap: isAllMaps ? null : canEditActiveMap,
    maps,
    mapMembers: mapMembers ?? [],
    setActiveMap,
    isSettingMap,
    isAllMaps,
  };
}
