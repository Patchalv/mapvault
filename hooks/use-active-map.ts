import { useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import { useProfile } from '@/hooks/use-profile';
import { useMaps } from '@/hooks/use-maps';
import { track } from '@/lib/analytics';
import type { MapRole } from '@/types';

export function useActiveMap() {
  const { data: profile } = useProfile();
  const { data: mapMembers } = useMaps();
  const queryClient = useQueryClient();

  const maps = mapMembers?.map((m) => m.maps).filter(Boolean) ?? [];

  const activeMapId = profile?.active_map_id ?? maps[0]?.id ?? null;
  const activeMap = maps.find((m) => m.id === activeMapId) ?? maps[0] ?? null;

  // Role for active map
  const activeMembership = mapMembers?.find((m) => m.maps?.id === (activeMap?.id ?? activeMapId)) ?? null;
  const activeMapRole = (activeMembership?.role ?? null) as MapRole | null;
  const canEditActiveMap = activeMapRole === 'owner' || activeMapRole === 'contributor';

  const { mutate: _setActiveMap, isPending: isSettingMap } = useMutation({
    mutationFn: async ({ mapId }: { mapId: string; source?: 'dropdown' | 'settings' | 'auto' }) => {
      if (!profile) throw new Error('No profile');
      const { error } = await supabase
        .from('profiles')
        .update({ active_map_id: mapId })
        .eq('id', profile.id);
      if (error) throw error;
    },
    onSuccess: (_data, { mapId, source = 'dropdown' }) => {
      if (source !== 'auto') {
        track('map_switched', {
          map_id: mapId,
          source,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['profile'] });
    },
  });

  // Backwards-compatible wrapper to support optional source parameter and callbacks
  const setActiveMap = (
    mapId: string,
    options?: {
      source?: 'dropdown' | 'settings' | 'auto';
      onSuccess?: () => void;
      onError?: (err: Error) => void;
    }
  ) => {
    _setActiveMap(
      { mapId, source: options?.source },
      {
        onSuccess: options?.onSuccess ? () => options.onSuccess!() : undefined,
        onError: options?.onError ? (err) => options.onError!(err as Error) : undefined,
      }
    );
  };

  // Silent safety net: recover if active_map_id is null but maps exist.
  // Normal path is handled proactively in the delete map flow (Task 7).
  // This catches any edge case (e.g. direct DB changes, unexpected FK cascade).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (profile && profile.active_map_id === null && maps.length > 0) {
      _setActiveMap({ mapId: maps[0].id, source: 'auto' });
    }
  }, [profile?.active_map_id, maps.length]);

  return {
    activeMapId,
    activeMapName: activeMap?.name ?? null,
    activeMapRole,
    canEditActiveMap,
    maps,
    mapMembers: mapMembers ?? [],
    setActiveMap,
    isSettingMap,
  };
}
