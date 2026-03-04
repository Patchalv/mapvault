import { useMaps } from '@/hooks/use-maps';
import type { MapRole } from '@/types';

export function useMapRole(mapId: string | null) {
  const { data: mapMembers, isLoading } = useMaps();

  const membership = mapMembers?.find((m) => m.map_id === mapId);
  const role = (membership?.role ?? null) as MapRole | null;

  return {
    role,
    isOwner: role === 'owner',
    isContributor: role === 'contributor',
    isMember: role === 'member',
    canEdit: role === 'owner' || role === 'contributor',
    isLoading,
  };
}
